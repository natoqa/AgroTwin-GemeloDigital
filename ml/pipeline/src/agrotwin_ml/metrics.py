"""Per-class metrics, calibration and the rejection threshold.

Written with numpy rather than pulled from a library: they are short, and the
report has to explain exactly what each number is (CLAUDE.md §15, Phase 5: per
class, never only overall accuracy).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .config import CLASSES


def softmax(logits: np.ndarray, temperature: float = 1.0) -> np.ndarray:
    scaled = logits / temperature
    scaled = scaled - scaled.max(axis=1, keepdims=True)
    exp = np.exp(scaled)
    return exp / exp.sum(axis=1, keepdims=True)


def confusion(labels: np.ndarray, predictions: np.ndarray) -> np.ndarray:
    """Rows are the true class, columns the predicted one."""
    matrix = np.zeros((len(CLASSES), len(CLASSES)), dtype=np.int64)
    for truth, guess in zip(labels, predictions, strict=True):
        matrix[truth, guess] += 1
    return matrix


@dataclass(frozen=True)
class ClassMetrics:
    label: str
    support: int
    precision: float | None
    recall: float | None
    f1: float | None


def per_class(labels: np.ndarray, predictions: np.ndarray) -> list[ClassMetrics]:
    """Precision, recall and F1 per class. `None` where a ratio has no denominator."""
    matrix = confusion(labels, predictions)
    result: list[ClassMetrics] = []
    for index, label in enumerate(CLASSES):
        true_positive = matrix[index, index]
        predicted = matrix[:, index].sum()
        actual = matrix[index, :].sum()
        precision = float(true_positive / predicted) if predicted else None
        recall = float(true_positive / actual) if actual else None
        f1 = (
            2 * precision * recall / (precision + recall)
            if precision is not None and recall is not None and precision + recall > 0
            else (0.0 if precision is not None and recall is not None else None)
        )
        result.append(ClassMetrics(label, int(actual), precision, recall, f1))
    return result


def macro_f1(labels: np.ndarray, predictions: np.ndarray) -> float:
    """Mean F1 over the classes present in `labels`."""
    scores = [m.f1 for m in per_class(labels, predictions) if m.support > 0 and m.f1 is not None]
    return float(np.mean(scores)) if scores else 0.0


def negative_log_likelihood(logits: np.ndarray, labels: np.ndarray, temperature: float) -> float:
    probabilities = softmax(logits, temperature)
    return float(-np.mean(np.log(probabilities[np.arange(len(labels)), labels] + 1e-12)))


def fit_temperature(logits: np.ndarray, labels: np.ndarray) -> float:
    """Temperature scaling (Guo et al., 2017), by a bounded golden-section search.

    One scalar, so a line search is enough and needs no autograd. The bounds
    are generous; hitting one means the logits are badly calibrated and the
    report will show it.
    """
    low, high = 0.05, 20.0
    ratio = (np.sqrt(5) - 1) / 2
    left = high - ratio * (high - low)
    right = low + ratio * (high - low)
    for _ in range(80):
        if negative_log_likelihood(logits, labels, left) < negative_log_likelihood(
            logits, labels, right
        ):
            high = right
        else:
            low = left
        left = high - ratio * (high - low)
        right = low + ratio * (high - low)
    return float((low + high) / 2)


@dataclass(frozen=True)
class Threshold:
    value: float
    precision: float
    coverage: float
    reached_target: bool


def choose_threshold(
    probabilities: np.ndarray, labels: np.ndarray, target_precision: float
) -> Threshold:
    """The lowest confidence threshold whose accepted predictions reach the target.

    Lowest, because every step up rejects more of the farmer's photographs.
    When no threshold reaches the target, the one with the best precision is
    returned and flagged, rather than pretending.
    """
    confidence = probabilities.max(axis=1)
    correct = probabilities.argmax(axis=1) == labels
    candidates = np.unique(confidence)

    best: Threshold | None = None
    for value in candidates:
        accepted = confidence >= value
        if not accepted.any():
            continue
        precision = float(correct[accepted].mean())
        coverage = float(accepted.mean())
        if precision >= target_precision:
            return Threshold(float(value), precision, coverage, True)
        if best is None or precision > best.precision:
            best = Threshold(float(value), precision, coverage, False)

    assert best is not None, "no predictions to choose a threshold from"
    return best


@dataclass(frozen=True)
class SelectiveResult:
    coverage: float
    accepted_precision: float | None
    rejected: int


def selective(probabilities: np.ndarray, labels: np.ndarray, threshold: float) -> SelectiveResult:
    confidence = probabilities.max(axis=1)
    accepted = confidence >= threshold
    correct = probabilities.argmax(axis=1) == labels
    return SelectiveResult(
        coverage=float(accepted.mean()) if len(labels) else 0.0,
        accepted_precision=float(correct[accepted].mean()) if accepted.any() else None,
        rejected=int((~accepted).sum()),
    )
