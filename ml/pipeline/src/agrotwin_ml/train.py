"""Fine-tuning the split model on CPU (Phase 5, D3).

The whole network is fine-tuned here, offline, once. On the phone the backbone
never changes again (ADR-0005); only the head is retrained, by federated
learning in Phase 6.
"""

from __future__ import annotations

import random
import time
from collections.abc import Callable
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset

from .config import CLASSES, TrainingConfig
from .dataset import Sample, label_index
from .metrics import macro_f1
from .model import SplitModel
from .transforms import augment, load_rgb, preprocess, swap_background


class TrainingImages(Dataset):
    def __init__(
        self, samples: list[Sample], backgrounds: list[Path], config: TrainingConfig, seed: int
    ):
        self.samples = samples
        self.backgrounds = backgrounds
        self.config = config
        self.seed = seed
        self.epoch = 0

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int):
        sample = self.samples[index]
        # Per-item, per-epoch randomness that does not depend on worker order.
        rng = random.Random(f"{self.seed}:{self.epoch}:{index}")
        if (
            sample.source == "lab"
            and sample.segmented is not None
            and self.backgrounds
            and rng.random() < self.config.background_swap
        ):
            image = swap_background(
                load_rgb(sample.segmented), load_rgb(rng.choice(self.backgrounds)), rng
            )
        else:
            image = load_rgb(sample.path)
        torch.manual_seed(rng.randrange(2**31))
        return augment(image), label_index(sample.label)


class EvaluationImages(Dataset):
    def __init__(self, samples: list[Sample]):
        self.samples = samples

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int):
        sample = self.samples[index]
        return preprocess(load_rgb(sample.path)), label_index(sample.label)


def class_weights(samples: list[Sample]) -> torch.Tensor:
    """Inverse frequency: 152 healthy leaves against 1000 of each blight."""
    counts = np.array([sum(1 for s in samples if s.label == label) for label in CLASSES], float)
    weights = counts.sum() / (len(CLASSES) * np.maximum(counts, 1))
    return torch.tensor(weights, dtype=torch.float32)


@torch.no_grad()
def predict(model: nn.Module, loader: DataLoader) -> tuple[np.ndarray, np.ndarray]:
    model.eval()
    logits, labels = [], []
    for images, targets in loader:
        logits.append(model(images).numpy())
        labels.append(targets.numpy())
    return np.concatenate(logits), np.concatenate(labels)


def train(
    model: SplitModel,
    train_samples: list[Sample],
    val_samples: list[Sample],
    config: TrainingConfig,
    seed: int,
    log: Callable[[str], None] = print,
    workers: int = 4,
) -> tuple[SplitModel, list[dict]]:
    torch.manual_seed(seed)
    backgrounds = [s.path for s in train_samples if s.source == "field"]
    dataset = TrainingImages(train_samples, backgrounds, config, seed)
    generator = torch.Generator().manual_seed(seed)
    train_loader = DataLoader(
        dataset,
        batch_size=config.batch_size,
        shuffle=True,
        num_workers=workers,
        generator=generator,
        persistent_workers=False,
    )
    val_loader = DataLoader(EvaluationImages(val_samples), batch_size=64, num_workers=workers)

    criterion = nn.CrossEntropyLoss(weight=class_weights(train_samples))
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=config.learning_rate, weight_decay=config.weight_decay
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=config.epochs)

    best_state, best_f1, history = None, -1.0, []
    for epoch in range(config.epochs):
        dataset.epoch = epoch
        model.train()
        started, total, seen = time.perf_counter(), 0.0, 0
        for images, targets in train_loader:
            optimizer.zero_grad()
            loss = criterion(model(images), targets)
            loss.backward()
            optimizer.step()
            total += float(loss.detach()) * len(targets)
            seen += len(targets)
        scheduler.step()

        logits, labels = predict(model, val_loader)
        f1 = macro_f1(labels, logits.argmax(axis=1))
        entry = {
            "epoch": epoch + 1,
            "train_loss": total / seen,
            "val_macro_f1": f1,
            "seconds": time.perf_counter() - started,
        }
        history.append(entry)
        log(
            f"epoch {epoch + 1}/{config.epochs} loss {entry['train_loss']:.4f} "
            f"val macro-F1 {f1:.4f} ({entry['seconds']:.0f}s)"
        )
        if f1 > best_f1:
            best_f1 = f1
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}

    assert best_state is not None
    model.load_state_dict(best_state)
    return model, history
