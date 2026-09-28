"""Turning the trained model into the artifacts the phone loads.

- `backbone.fp32.onnx`: intermediate, never shipped.
- `backbone.int8.onnx`: INT8 **weights**, float32 activations (ADR-0005 as
  amended in Phase 5). What the phone runs.

Why not full static INT8 (the original D4): it was built and measured, and it
destroys MobileNetV3-Small. Each quantised operator is fine on its own, but
the error compounds through the squeeze-excitation blocks and HardSwish
activations until the embedding keeps a cosine of 0.19 with the float one
(0.50 at best, across percentile, entropy, reduced range and excluding the
first, depthwise, SE or HardSwish layers). Weight-only INT8 keeps 0.99 and is
smaller. Measurements in `reports/quantization.md`.
- `head.json`: the float32 linear head as plain numbers.
- `model-contract.json`: what the client checks before trusting any of it.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
from onnx import helper, numpy_helper

from .config import CLASSES, CROP, EMBEDDING_DIM, MEAN, RESIZE, STD
from .dataset import Sample
from .model import SplitModel
from .transforms import load_rgb, preprocess

INPUT_NAME = "image"
OUTPUT_NAME = "embedding"
OPSET = 17


def export_backbone(model: SplitModel, path: Path) -> None:
    backbone = model.backbone.eval()
    dummy = torch.zeros(1, 3, CROP, CROP)
    torch.onnx.export(
        backbone,
        (dummy,),
        str(path),
        input_names=[INPUT_NAME],
        output_names=[OUTPUT_NAME],
        dynamic_axes={INPUT_NAME: {0: "batch"}, OUTPUT_NAME: {0: "batch"}},
        opset_version=OPSET,
        dynamo=False,
    )


def quantize_weights(fp32: Path, int8: Path) -> None:
    """Stores every Conv and Gemm weight as symmetric per-output-channel INT8.

    Each weight becomes an INT8 initializer, a float32 scale per output channel
    and a `DequantizeLinear` node, a standard ONNX operator ORT Web runs. The
    arithmetic stays in float32, so there is no activation range to get wrong.
    """
    model = onnx.load(str(fp32))
    initializers = {init.name: init for init in model.graph.initializer}
    dequantize = []
    for node in model.graph.node:
        if node.op_type not in ("Conv", "Gemm") or node.input[1] not in initializers:
            continue
        name = node.input[1]
        weight = numpy_helper.to_array(initializers[name])
        flat = weight.reshape(weight.shape[0], -1)
        scale = (np.maximum(np.abs(flat).max(axis=1), 1e-12) / 127.0).astype(np.float32)
        quantised = np.clip(np.round(flat / scale[:, None]), -127, 127).astype(np.int8)
        model.graph.initializer.remove(initializers[name])
        model.graph.initializer.extend(
            [
                numpy_helper.from_array(quantised.reshape(weight.shape), f"{name}_int8"),
                numpy_helper.from_array(scale, f"{name}_scale"),
                numpy_helper.from_array(np.zeros(weight.shape[0], np.int8), f"{name}_zero"),
            ]
        )
        dequantize.append(
            helper.make_node(
                "DequantizeLinear",
                [f"{name}_int8", f"{name}_scale", f"{name}_zero"],
                [name],
                name=f"{name}_dequantize",
                axis=0,
            )
        )
    nodes = list(model.graph.node)
    del model.graph.node[:]
    model.graph.node.extend(dequantize + nodes)
    onnx.checker.check_model(model)
    onnx.save(model, str(int8))


def embed(onnx_path: Path, samples: list[Sample], batch: int = 32) -> np.ndarray:
    options = ort.SessionOptions()
    options.log_severity_level = 3
    session = ort.InferenceSession(str(onnx_path), options, providers=["CPUExecutionProvider"])
    out = []
    for start in range(0, len(samples), batch):
        images = np.stack(
            [preprocess(load_rgb(s.path)).numpy() for s in samples[start : start + batch]]
        )
        out.append(session.run([OUTPUT_NAME], {INPUT_NAME: images})[0])
    return np.concatenate(out) if out else np.zeros((0, EMBEDDING_DIM), np.float32)


def head_arrays(model: SplitModel) -> tuple[np.ndarray, np.ndarray]:
    weights = model.head.weight.detach().numpy().astype(np.float32)
    bias = model.head.bias.detach().numpy().astype(np.float32)
    return weights, bias


def head_logits(weights: np.ndarray, bias: np.ndarray, embeddings: np.ndarray) -> np.ndarray:
    """What the phone's head computes, in float32."""
    return (embeddings.astype(np.float32) @ weights.T + bias).astype(np.float32)


def write_head(model: SplitModel, path: Path) -> None:
    weights, bias = head_arrays(model)
    document = {
        "format": "agrotwin-head",
        "formatVersion": 1,
        "classes": list(CLASSES),
        "embeddingDimension": EMBEDDING_DIM,
        # Row-major, one row per class. float32 values written as the exact
        # decimal of the float32, so the client reads back the same bits.
        "weights": [[float(v) for v in row] for row in weights],
        "bias": [float(v) for v in bias],
    }
    path.write_text(json.dumps(document), encoding="utf-8")


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_contract(
    path: Path,
    *,
    version: str,
    backbone: Path,
    head: Path,
    temperature: float,
    threshold: float,
    target_precision: float,
    threshold_met_target: bool,
    trained_on: dict,
) -> dict:
    contract = {
        "format": "agrotwin-model-contract",
        "formatVersion": 1,
        "version": version,
        "artifacts": {
            "backbone": {
                "file": backbone.name,
                "sha256": sha256_file(backbone),
                "bytes": backbone.stat().st_size,
                "quantization": "int8-weights-per-channel-float32-activations",
            },
            "head": {"file": head.name, "sha256": sha256_file(head), "bytes": head.stat().st_size},
        },
        "input": {
            "name": INPUT_NAME,
            "layout": "NCHW",
            "channels": 3,
            "height": CROP,
            "width": CROP,
            "resizeShorterSide": RESIZE,
            "crop": "center",
            "colorSpace": "RGB",
            "scale": "0-1",
            "mean": list(MEAN),
            "std": list(STD),
        },
        "output": {"name": OUTPUT_NAME, "embeddingDimension": EMBEDDING_DIM},
        "classes": list(CLASSES),
        "temperature": temperature,
        "rejectionThreshold": threshold,
        "targetPrecision": target_precision,
        "thresholdMetTarget": threshold_met_target,
        "trainedOn": trained_on,
    }
    path.write_text(json.dumps(contract, indent=2), encoding="utf-8")
    return contract
