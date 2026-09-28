"""Finding the images, removing duplicates, and splitting them.

Two sources, kept apart all the way to the report:

- **lab**: PlantVillage, potato folders. Uniform background, one leaf.
- **field**: PlantDoc, potato folders. Photos from the web, cluttered. There
  is no healthy potato class in PlantDoc, so the field set has no healthy
  leaves: the lab-to-field gap can only be measured for the two blights.

Duplicates are removed by content hash before splitting, so an image can
never sit in both the training and the test set. An image that appears under
two different labels is dropped entirely: there is no honest way to pick one.
"""

from __future__ import annotations

import hashlib
import random
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from .config import CLASSES, FIELD_SPLIT, LAB_SPLIT

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}

PLANTVILLAGE_FOLDERS = {
    "Potato___healthy": "healthy",
    "Potato___Early_blight": "early_blight",
    "Potato___Late_blight": "late_blight",
}
PLANTDOC_FOLDERS = {
    "Potato leaf early blight": "early_blight",
    "Potato leaf late blight": "late_blight",
}


@dataclass(frozen=True)
class Sample:
    path: Path
    label: str
    source: str  # "lab" | "field"
    sha256: str
    # For lab images: the background-free version, when it exists.
    segmented: Path | None = None


@dataclass(frozen=True)
class Splits:
    train: list[Sample]
    val: list[Sample]
    lab_test: list[Sample]
    field_test: list[Sample]


@dataclass(frozen=True)
class DedupReport:
    duplicates_removed: int
    conflicting_labels_dropped: int


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _images(folder: Path) -> list[Path]:
    if not folder.is_dir():
        return []
    return sorted(p for p in folder.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)


def discover(data_root: Path) -> list[Sample]:
    """Every image of both sources, labelled, in a stable order."""
    samples: list[Sample] = []

    color = data_root / "plantvillage" / "raw" / "color"
    segmented = data_root / "plantvillage" / "raw" / "segmented"
    for folder, label in PLANTVILLAGE_FOLDERS.items():
        for path in _images(color / folder):
            masked = segmented / folder / f"{path.stem}_final_masked.jpg"
            samples.append(
                Sample(
                    path=path,
                    label=label,
                    source="lab",
                    sha256=sha256_of(path),
                    segmented=masked if masked.exists() else None,
                )
            )

    for split in ("train", "test"):
        for folder, label in PLANTDOC_FOLDERS.items():
            for path in _images(data_root / "plantdoc" / split / folder):
                samples.append(
                    Sample(path=path, label=label, source="field", sha256=sha256_of(path))
                )

    return samples


def deduplicate(samples: list[Sample]) -> tuple[list[Sample], DedupReport]:
    """One sample per content hash; hashes seen under two labels are dropped."""
    by_hash: dict[str, list[Sample]] = defaultdict(list)
    for sample in samples:
        by_hash[sample.sha256].append(sample)

    kept: list[Sample] = []
    duplicates = 0
    conflicts = 0
    for group in by_hash.values():
        labels = {sample.label for sample in group}
        if len(labels) > 1:
            conflicts += len(group)
            continue
        kept.append(group[0])
        duplicates += len(group) - 1

    kept.sort(key=lambda sample: (sample.source, sample.label, sample.path.name))
    return kept, DedupReport(duplicates_removed=duplicates, conflicting_labels_dropped=conflicts)


def _stratified(
    samples: list[Sample], ratios: tuple[float, float, float], rng: random.Random
) -> tuple[list[Sample], list[Sample], list[Sample]]:
    by_label: dict[str, list[Sample]] = defaultdict(list)
    for sample in samples:
        by_label[sample.label].append(sample)

    parts: tuple[list[Sample], list[Sample], list[Sample]] = ([], [], [])
    for label in sorted(by_label):
        group = by_label[label][:]
        rng.shuffle(group)
        first = round(len(group) * ratios[0])
        second = first + round(len(group) * ratios[1])
        parts[0].extend(group[:first])
        parts[1].extend(group[first:second])
        parts[2].extend(group[second:])
    return parts


def split(samples: list[Sample], seed: int) -> Splits:
    """Seeded, stratified by label, and separately for each source."""
    rng = random.Random(seed)
    lab = [sample for sample in samples if sample.source == "lab"]
    field = [sample for sample in samples if sample.source == "field"]

    lab_train, lab_val, lab_test = _stratified(lab, LAB_SPLIT, rng)
    field_train, field_val, field_test = _stratified(field, FIELD_SPLIT, rng)

    return Splits(
        train=lab_train + field_train,
        val=lab_val + field_val,
        lab_test=lab_test,
        field_test=field_test,
    )


def label_index(label: str) -> int:
    return CLASSES.index(label)


def counts(samples: list[Sample]) -> dict[str, int]:
    return {label: sum(1 for sample in samples if sample.label == label) for label in CLASSES}
