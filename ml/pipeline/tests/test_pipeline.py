"""Fast tests of the pipeline's logic: no downloads, no training, no GPU.

The expensive run (`python -m agrotwin_ml`) is not part of CI; what CI checks
is that the pieces it is built from do what the report says they do.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
import pytest
import torch
from PIL import Image
from torch import nn

from agrotwin_ml.config import CLASSES, CROP
from agrotwin_ml.dataset import deduplicate, discover, split
from agrotwin_ml.export import quantize_weights, sha256_file
from agrotwin_ml.metrics import (
    choose_threshold,
    fit_temperature,
    macro_f1,
    per_class,
    selective,
    softmax,
)
from agrotwin_ml.transforms import resize_and_crop, swap_background


def _image(path: Path, colour: tuple[int, int, int], size=(64, 48)) -> None:
    """A distinct image per colour: noise seeded by the colour survives JPEG."""
    path.parent.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(colour[0] * 65536 + colour[1] * 256 + colour[2])
    pixels = rng.integers(0, 256, size=(size[1], size[0], 3), dtype=np.uint8)
    Image.fromarray(pixels).save(path)


@pytest.fixture()
def data_root(tmp_path: Path) -> Path:
    colour = tmp_path / "plantvillage" / "raw" / "color"
    segmented = tmp_path / "plantvillage" / "raw" / "segmented"
    for index in range(20):
        for folder, base in (
            ("Potato___healthy", 10),
            ("Potato___Early_blight", 90),
            ("Potato___Late_blight", 170),
        ):
            _image(colour / folder / f"img{index}.JPG", (base, index, 7))
            _image(segmented / folder / f"img{index}_final_masked.jpg", (base, index, 7))
    field = tmp_path / "plantdoc" / "train"
    for index in range(10):
        _image(field / "Potato leaf early blight" / f"e{index}.jpg", (200, index, 50))
        _image(field / "Potato leaf late blight" / f"l{index}.jpg", (220, index, 90))
    # The same bytes filed under two labels, and an exact duplicate.
    _image(field / "Potato leaf early blight" / "both.jpg", (1, 2, 3))
    _image(field / "Potato leaf late blight" / "both.jpg", (1, 2, 3))
    _image(field / "Potato leaf late blight" / "copy.jpg", (220, 0, 90))
    return tmp_path


def test_discovers_both_sources_and_pairs_segmented_images(data_root: Path) -> None:
    samples = discover(data_root)

    lab = [s for s in samples if s.source == "lab"]
    assert len(lab) == 60
    assert all(s.segmented is not None for s in lab)
    assert {s.label for s in samples if s.source == "field"} == {"early_blight", "late_blight"}


def test_deduplication_drops_conflicts_and_copies(data_root: Path) -> None:
    kept, report = deduplicate(discover(data_root))

    assert report.conflicting_labels_dropped == 2
    assert report.duplicates_removed == 1
    assert not any(s.path.name == "both.jpg" for s in kept)
    assert len({s.sha256 for s in kept}) == len(kept)


def test_splits_are_disjoint_stratified_and_seeded(data_root: Path) -> None:
    kept, _ = deduplicate(discover(data_root))

    first = split(kept, 7)
    again = split(kept, 7)
    other = split(kept, 8)

    parts = [first.train, first.val, first.lab_test, first.field_test]
    hashes = [s.sha256 for part in parts for s in part]
    assert len(hashes) == len(set(hashes)) == len(kept)
    assert [s.path for s in first.train] == [s.path for s in again.train]
    assert [s.path for s in first.train] != [s.path for s in other.train]
    assert all(s.source == "lab" for s in first.lab_test)
    assert all(s.source == "field" for s in first.field_test)
    # 20 per lab class at 70/15/15.
    assert sum(1 for s in first.lab_test if s.label == "healthy") == 3


def test_resize_and_crop_matches_the_contract() -> None:
    image = Image.new("RGB", (400, 300))

    assert resize_and_crop(image).size == (CROP, CROP)


def test_background_swap_keeps_the_leaf_and_replaces_the_black() -> None:
    import random

    leaf = Image.new("RGB", (40, 40), (0, 0, 0))
    leaf.paste((0, 200, 0), (10, 10, 30, 30))
    background = Image.new("RGB", (100, 100), (200, 50, 50))

    result = np.asarray(swap_background(leaf, background, random.Random(1)))

    assert tuple(result[20, 20]) == (0, 200, 0)
    assert tuple(result[1, 1]) == (200, 50, 50)


def test_per_class_metrics_and_confusion() -> None:
    labels = np.array([0, 0, 1, 1, 2, 2])
    predictions = np.array([0, 1, 1, 1, 2, 0])

    metrics = {m.label: m for m in per_class(labels, predictions)}

    assert metrics["healthy"].precision == pytest.approx(0.5)
    assert metrics["early_blight"].recall == pytest.approx(1.0)
    assert metrics["late_blight"].f1 == pytest.approx(2 / 3)
    assert macro_f1(labels, predictions) == pytest.approx(np.mean([m.f1 for m in metrics.values()]))


def test_per_class_reports_missing_classes_as_unknown() -> None:
    metrics = per_class(np.array([1, 2]), np.array([1, 2]))

    assert metrics[0].support == 0
    assert metrics[0].recall is None


def test_temperature_scaling_softens_overconfident_logits() -> None:
    rng = np.random.default_rng(0)
    labels = rng.integers(0, 3, 400)
    logits = rng.normal(size=(400, 3))
    # Right 70% of the time, but claiming near certainty.
    correct = rng.random(400) < 0.7
    for index, label in enumerate(labels):
        target = label if correct[index] else (label + 1) % 3
        logits[index, target] += 12

    temperature = fit_temperature(logits, labels)

    assert temperature > 2
    calibrated = softmax(logits, temperature).max(axis=1).mean()
    assert calibrated == pytest.approx(0.7, abs=0.1)


def test_threshold_is_the_lowest_that_reaches_the_target() -> None:
    probabilities = np.array(
        [[0.9, 0.05, 0.05], [0.8, 0.1, 0.1], [0.6, 0.2, 0.2], [0.5, 0.3, 0.2], [0.4, 0.3, 0.3]]
    )
    labels = np.array([0, 0, 0, 1, 1])

    chosen = choose_threshold(probabilities, labels, 0.9)

    assert chosen.reached_target
    assert chosen.value == pytest.approx(0.6)
    assert chosen.coverage == pytest.approx(0.6)
    result = selective(probabilities, labels, chosen.value)
    assert result.rejected == 2
    assert result.accepted_precision == pytest.approx(1.0)


def test_threshold_says_when_the_target_is_out_of_reach() -> None:
    probabilities = np.array([[0.9, 0.1, 0.0], [0.8, 0.2, 0.0]])
    labels = np.array([1, 1])

    chosen = choose_threshold(probabilities, labels, 0.9)

    assert not chosen.reached_target
    assert chosen.precision == 0.0


def test_weight_only_quantisation_keeps_the_function(tmp_path: Path) -> None:
    torch.manual_seed(0)
    model = nn.Sequential(
        nn.Conv2d(3, 8, 3), nn.Hardswish(), nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Linear(8, 4)
    ).eval()
    fp32 = tmp_path / "tiny.onnx"
    int8 = tmp_path / "tiny.int8.onnx"
    torch.onnx.export(
        model,
        (torch.randn(1, 3, 16, 16),),
        str(fp32),
        input_names=["x"],
        output_names=["y"],
        opset_version=17,
        dynamo=False,
    )

    quantize_weights(fp32, int8)

    x = np.random.default_rng(1).normal(size=(1, 3, 16, 16)).astype(np.float32)
    run = lambda path: ort.InferenceSession(str(path)).run(["y"], {"x": x})[0]  # noqa: E731
    reference, quantised = run(fp32), run(int8)
    assert np.abs(reference - quantised).max() < 0.05
    assert int8.stat().st_size < fp32.stat().st_size


def test_sha256_of_a_file(tmp_path: Path) -> None:
    path = tmp_path / "a.bin"
    path.write_bytes(b"abc")

    assert sha256_file(path) == ("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")


def test_the_shipped_contract_matches_its_artifacts() -> None:
    """The artifacts in the app are the ones the contract describes."""
    model_dir = Path(__file__).resolve().parents[3] / "packages" / "app" / "public" / "model"
    contract = json.loads((model_dir / "model-contract.json").read_text("utf-8"))

    assert contract["classes"] == list(CLASSES)
    for artifact in contract["artifacts"].values():
        path = model_dir / artifact["file"]
        assert sha256_file(path) == artifact["sha256"]
        assert path.stat().st_size == artifact["bytes"]
