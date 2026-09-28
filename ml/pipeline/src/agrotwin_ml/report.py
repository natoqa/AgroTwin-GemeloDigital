"""The evaluation report, in Spanish (CLAUDE.md §5: course documents in Spanish).

Every table is per class. Overall accuracy is not reported on its own
anywhere: on 152 healthy leaves against 2000 blighted ones it would hide
exactly the class that matters for "do I need to spray?".
"""

from __future__ import annotations

import numpy as np

from .config import CLASSES
from .metrics import SelectiveResult, confusion, per_class

LABEL_ES = {"healthy": "sana", "early_blight": "tizón temprano", "late_blight": "tizón tardío"}


def _fmt(value: float | None) -> str:
    return "—" if value is None else f"{value:.3f}"


def per_class_table(labels: np.ndarray, predictions: np.ndarray) -> str:
    rows = ["| Clase | Soporte | Precisión | Sensibilidad | F1 |", "|---|---|---|---|---|"]
    for m in per_class(labels, predictions):
        rows.append(
            f"| {LABEL_ES[m.label]} | {m.support} | {_fmt(m.precision)} | "
            f"{_fmt(m.recall)} | {_fmt(m.f1)} |"
        )
    return "\n".join(rows)


def confusion_table(labels: np.ndarray, predictions: np.ndarray) -> str:
    matrix = confusion(labels, predictions)
    header = "| Real \\ Predicha | " + " | ".join(LABEL_ES[c] for c in CLASSES) + " |"
    rows = [header, "|---|" + "---|" * len(CLASSES)]
    for index, label in enumerate(CLASSES):
        rows.append(f"| {LABEL_ES[label]} | " + " | ".join(str(v) for v in matrix[index]) + " |")
    return "\n".join(rows)


def selective_line(result: SelectiveResult, total: int) -> str:
    return (
        f"Con el umbral de rechazo: se aceptan **{result.coverage:.1%}** de las fotos "
        f"({total - result.rejected} de {total}); de las aceptadas acierta "
        f"**{_fmt(result.accepted_precision)}**; se rechazan {result.rejected}."
    )


def blight_macro_f1(labels: np.ndarray, predictions: np.ndarray) -> float:
    """Macro F1 over the two blights only: the classes both test sets share."""
    scores = [
        m.f1 or 0.0
        for m in per_class(labels, predictions)
        if m.label != "healthy" and m.support > 0
    ]
    return float(np.mean(scores)) if scores else 0.0
