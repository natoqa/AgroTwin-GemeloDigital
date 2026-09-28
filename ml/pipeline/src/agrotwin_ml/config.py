"""Every constant the pipeline depends on, in one place.

Anything here that ends up in the client travels through `model-contract.json`,
never through a number copied by hand into TypeScript (CLAUDE.md §10).
"""

from __future__ import annotations

from dataclasses import dataclass

# The order of the classifier's outputs. The client refuses a contract whose
# order it does not recognise, so changing this is a breaking change.
CLASSES: tuple[str, ...] = ("healthy", "early_blight", "late_blight")

SEED = 20260928

# Preprocessing: shorter side to RESIZE, centre crop to CROP, ImageNet
# normalisation (the backbone was pretrained on ImageNet).
RESIZE = 256
CROP = 224
MEAN: tuple[float, float, float] = (0.485, 0.456, 0.406)
STD: tuple[float, float, float] = (0.229, 0.224, 0.225)

# MobileNetV3-Small: 576 pooled channels, projected to 1024 by the first layer
# of its classifier. The embedding is the 1024-d activation after that layer.
POOLED_DIM = 576
EMBEDDING_DIM = 1024

# Product decision D2 (Phase 4 plan, accepted 2026-09-28): the rejection
# threshold is the lowest one at which 90% of *accepted* validation
# predictions are correct.
TARGET_PRECISION = 0.90

# Splits. PlantVillage is lab imagery; PlantDoc is imagery from the web, the
# closest thing to field photos available until the team supplies real ones.
LAB_SPLIT = (0.70, 0.15, 0.15)
FIELD_SPLIT = (0.50, 0.20, 0.30)


@dataclass(frozen=True)
class TrainingConfig:
    epochs: int = 12
    batch_size: int = 32
    learning_rate: float = 1e-3
    weight_decay: float = 1e-4
    # Probability of replacing a lab leaf's background with a field photo.
    background_swap: float = 0.7
