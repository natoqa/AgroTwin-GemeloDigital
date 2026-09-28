"""`uv run python -m agrotwin_ml --data-root <dir>`: the whole pipeline.

Discover → deduplicate → split → fine-tune → export → quantise → calibrate →
evaluate → write artifacts, contract, report and the parity fixture.
Deterministic up to CPU floating-point ordering: same data, same seed.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from datetime import date
from pathlib import Path

import numpy as np
import torch

from .config import CLASSES, SEED, TARGET_PRECISION, TrainingConfig
from .dataset import counts, deduplicate, discover, label_index, split
from .export import (
    embed,
    export_backbone,
    head_arrays,
    head_logits,
    quantize_weights,
    write_contract,
    write_head,
)
from .metrics import choose_threshold, fit_temperature, selective, softmax
from .model import build
from .report import (
    LABEL_ES,
    blight_macro_f1,
    confusion_table,
    per_class_table,
    selective_line,
)
from .train import EvaluationImages, predict, train

REPO = Path(__file__).resolve().parents[4]
APP_MODEL_DIR = REPO / "packages" / "app" / "public" / "model"
PARITY_FIXTURE = REPO / "packages" / "domain" / "src" / "learning" / "fixtures" / "head-parity.json"
REPORT_DIR = REPO / "ml" / "pipeline" / "reports"
WORK_DIR = REPO / "ml" / "pipeline" / "work"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=TrainingConfig.epochs)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument(
        "--reuse-training",
        action="store_true",
        help="Skip fine-tuning and reuse work/model.pt; re-export, recalibrate, re-report.",
    )
    args = parser.parse_args()

    torch.set_num_threads(max(1, torch.get_num_threads()))
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    APP_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    PARITY_FIXTURE.parent.mkdir(parents=True, exist_ok=True)

    # --- Data ---------------------------------------------------------------
    found = discover(args.data_root)
    samples, dedup = deduplicate(found)
    splits = split(samples, SEED)
    print(f"{len(found)} images, {len(samples)} after dedup ({asdict(dedup)})")
    manifest = {
        "found": len(found),
        "kept": len(samples),
        "dedup": asdict(dedup),
        "splits": {
            name: {
                "counts": counts(part),
                "files": [
                    {"source": s.source, "label": s.label, "file": s.path.name, "sha256": s.sha256}
                    for s in part
                ],
            }
            for name, part in (
                ("train", splits.train),
                ("val", splits.val),
                ("lab_test", splits.lab_test),
                ("field_test", splits.field_test),
            )
        },
    }
    (REPORT_DIR / "dataset-manifest.json").write_text(json.dumps(manifest, indent=1), "utf-8")

    # --- Training -----------------------------------------------------------
    config = TrainingConfig(epochs=args.epochs)
    history_path = REPORT_DIR / "history.json"
    if args.reuse_training:
        model = build(pretrained=False)
        model.load_state_dict(torch.load(WORK_DIR / "model.pt"))
        model.eval()
        history = json.loads(history_path.read_text("utf-8"))
        config = TrainingConfig(epochs=len(history))
    else:
        model, history = train(
            build(), splits.train, splits.val, config, SEED, workers=args.workers
        )
        torch.save(model.state_dict(), WORK_DIR / "model.pt")

    # --- Export and quantisation -------------------------------------------
    fp32 = WORK_DIR / "backbone.fp32.onnx"
    int8 = APP_MODEL_DIR / "backbone.int8.onnx"
    head_path = APP_MODEL_DIR / "head.json"
    export_backbone(model, fp32)
    quantize_weights(fp32, int8)
    write_head(model, head_path)
    weights, bias = head_arrays(model)

    # --- What the phone will compute: INT8 embeddings, float32 head ---------
    def labels_of(part):
        return np.array([label_index(s.label) for s in part])

    # Calibration uses the *field* part of validation: the phone lives in the
    # field, and on lab photos the model is almost never unsure, so a
    # threshold chosen there would accept every field photo (measured: it did,
    # at 64% accuracy). Where no field validation exists, all of it is used.
    field_val = [s for s in splits.val if s.source == "field"]
    calibration_split = field_val or splits.val
    int8_logits = {
        name: head_logits(weights, bias, embed(int8, part))
        for name, part in (
            ("val", calibration_split),
            ("lab_test", splits.lab_test),
            ("field_test", splits.field_test),
        )
    }
    fp32_logits = {
        name: predict(model, torch.utils.data.DataLoader(EvaluationImages(part), batch_size=64))[0]
        for name, part in (("lab_test", splits.lab_test), ("field_test", splits.field_test))
    }

    val_labels = labels_of(calibration_split)
    temperature = fit_temperature(int8_logits["val"], val_labels)
    threshold = choose_threshold(
        softmax(int8_logits["val"], temperature), val_labels, TARGET_PRECISION
    )

    # --- Contract -----------------------------------------------------------
    version = f"potato-mnv3s-{date.today().isoformat()}"
    contract = write_contract(
        APP_MODEL_DIR / "model-contract.json",
        version=version,
        backbone=int8,
        head=head_path,
        temperature=temperature,
        threshold=threshold.value,
        target_precision=TARGET_PRECISION,
        threshold_met_target=threshold.reached_target,
        trained_on={
            "lab": "PlantVillage (spMohanty/PlantVillage-Dataset), potato folders",
            "field": "PlantDoc (pratikkayal/PlantDoc-Dataset), potato folders",
            "seed": SEED,
            "epochs": config.epochs,
        },
    )

    # --- Parity fixture for the TypeScript head -----------------------------
    field_embeddings = embed(int8, splits.field_test[:4])
    lab_embeddings = embed(int8, splits.lab_test[:: max(1, len(splits.lab_test) // 4)][:4])
    cases = np.concatenate([lab_embeddings, field_embeddings])
    with torch.no_grad():
        torch_logits = model.head(torch.from_numpy(cases)).numpy()
    PARITY_FIXTURE.write_text(
        json.dumps(
            {
                "description": "Embeddings from the INT8 backbone and the logits PyTorch's "
                "head gives for them. The TypeScript head must match within 1e-4.",
                "modelVersion": version,
                "tolerance": 1e-4,
                "head": {
                    "weights": [[float(v) for v in row] for row in weights],
                    "bias": [float(v) for v in bias],
                },
                "cases": [
                    {"embedding": [float(v) for v in e], "logits": [float(v) for v in lg]}
                    for e, lg in zip(cases, torch_logits, strict=True)
                ],
            }
        ),
        "utf-8",
    )

    # --- Report -------------------------------------------------------------
    lab_labels = labels_of(splits.lab_test)
    field_labels = labels_of(splits.field_test)

    def section(title: str, logits: np.ndarray, labels: np.ndarray) -> str:
        predictions = logits.argmax(axis=1)
        probabilities = softmax(logits, temperature)
        return "\n\n".join(
            [
                f"### {title}",
                per_class_table(labels, predictions),
                confusion_table(labels, predictions),
                selective_line(selective(probabilities, labels, threshold.value), len(labels)),
            ]
        )

    lab_gap = blight_macro_f1(lab_labels, int8_logits["lab_test"].argmax(1))
    field_gap = blight_macro_f1(field_labels, int8_logits["field_test"].argmax(1))
    lab_fp32 = blight_macro_f1(lab_labels, fp32_logits["lab_test"].argmax(1))
    field_fp32 = blight_macro_f1(field_labels, fp32_logits["field_test"].argmax(1))

    split_rows = "\n".join(
        f"| {name} | " + " | ".join(str(counts(part)[c]) for c in CLASSES) + " |"
        for name, part in (
            ("entrenamiento", splits.train),
            ("validación", splits.val),
            ("prueba laboratorio", splits.lab_test),
            ("prueba campo (PlantDoc)", splits.field_test),
        )
    )
    history_rows = "\n".join(
        f"| {h['epoch']} | {h['train_loss']:.4f} | {h['val_macro_f1']:.4f} | {h['seconds']:.0f} |"
        for h in history
    )
    report = f"""# Reporte de evaluación — `{version}`

> Generado por `uv run python -m agrotwin_ml`. No editar a mano: se reescribe en
> cada corrida. Semilla {SEED}. Las cifras son del modelo **tal como corre en el
> teléfono**: backbone INT8 + cabeza float32, salvo donde se indica FP32.

## Datos

| Conjunto | {" | ".join(LABEL_ES[c] for c in CLASSES)} |
|---|---|---|---|
{split_rows}

- Imágenes encontradas: {len(found)}; tras deduplicar por hash: {len(samples)}.
- Duplicados eliminados: {dedup.duplicates_removed}. Imágenes con **dos
  etiquetas distintas** para el mismo contenido, descartadas: {dedup.conflicting_labels_dropped}.
- **No hay hojas sanas de campo**: PlantDoc no tiene clase «papa sana». La
  prueba de campo mide solo los dos tizones.
- «Campo» es PlantDoc: fotos de la web, no fotos de la sierra de La Libertad.
  La evaluación con fotos reales de campo sigue **pendiente** (CLAUDE.md §19).

## Entrenamiento

| Época | Pérdida | F1 macro validación | Segundos |
|---|---|---|---|
{history_rows}

## Calibración y rechazo

- Calibrado sobre la **validación de campo** ({len(calibration_split)} fotos de
  PlantDoc): el teléfono trabaja en el campo, y sobre fotos de laboratorio el
  modelo casi nunca duda, así que un umbral elegido ahí acepta todo en campo.
- Temperatura ajustada: **{temperature:.4f}**.
- Umbral de rechazo: **{threshold.value:.4f}** sobre la probabilidad máxima.
- Objetivo (D2): {TARGET_PRECISION:.0%} de aciertos entre las fotos aceptadas.
  En la validación de campo: precisión aceptada **{threshold.precision:.3f}**,
  cobertura **{threshold.coverage:.1%}**. Objetivo {"**alcanzado**" if threshold.reached_target else "**NO alcanzado**: ningún umbral llega al 90 % con fotos de campo; se usa el de mayor precisión, y el contrato lo declara (`thresholdMetTarget: false`)"}.

## Diferencia laboratorio → campo

F1 macro sobre los dos tizones, las clases que comparten ambas pruebas:

| Prueba | INT8 (teléfono) | FP32 (referencia) |
|---|---|---|
| Laboratorio (PlantVillage) | {lab_gap:.3f} | {lab_fp32:.3f} |
| Campo (PlantDoc) | {field_gap:.3f} | {field_fp32:.3f} |
| **Diferencia** | **{lab_gap - field_gap:+.3f}** | {lab_fp32 - field_fp32:+.3f} |

{section("Prueba de laboratorio — INT8", int8_logits["lab_test"], lab_labels)}

{section("Prueba de campo (PlantDoc) — INT8", int8_logits["field_test"], field_labels)}

## Artefactos

| Archivo | Bytes | SHA-256 |
|---|---|---|
| `{contract["artifacts"]["backbone"]["file"]}` | {contract["artifacts"]["backbone"]["bytes"]} | `{contract["artifacts"]["backbone"]["sha256"]}` |
| `{contract["artifacts"]["head"]["file"]}` | {contract["artifacts"]["head"]["bytes"]} | `{contract["artifacts"]["head"]["sha256"]}` |
"""
    (REPORT_DIR / "evaluation.md").write_text(report, "utf-8")
    (REPORT_DIR / "history.json").write_text(json.dumps(history, indent=1), "utf-8")
    print(f"done: {version}; threshold {threshold}; temperature {temperature:.4f}")


if __name__ == "__main__":
    main()
