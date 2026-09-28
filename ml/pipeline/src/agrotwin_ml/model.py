"""The split model of ADR-0005.

- **Backbone**: MobileNetV3-Small's convolutional features, global average
  pooling, and the first layer of its classifier (576 → 1024, Hardswish). Its
  output is the 1024-d **embedding**. Exported to ONNX, quantised to INT8,
  frozen on the phone.
- **Head**: one linear layer, 1024 → 3, float32. Exported as plain numbers,
  run and later trained in TypeScript (`packages/domain/src/learning`).

Everything downstream of the embedding is the head. Keeping the split exactly
here is what makes the parity test meaningful: the phone's head and this head
see the same embedding and must produce the same logits.
"""

from __future__ import annotations

import torch
from torch import nn
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small

from .config import CLASSES, EMBEDDING_DIM


class Backbone(nn.Module):
    def __init__(self, features: nn.Module, projection: nn.Linear, activation: nn.Module):
        super().__init__()
        self.features = features
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.projection = projection
        self.activation = activation

    def forward(self, images: torch.Tensor) -> torch.Tensor:
        pooled = torch.flatten(self.pool(self.features(images)), 1)
        return self.activation(self.projection(pooled))


class SplitModel(nn.Module):
    def __init__(self, backbone: Backbone, dropout: float = 0.2):
        super().__init__()
        self.backbone = backbone
        self.dropout = nn.Dropout(dropout)
        self.head = nn.Linear(EMBEDDING_DIM, len(CLASSES))

    def forward(self, images: torch.Tensor) -> torch.Tensor:
        return self.head(self.dropout(self.backbone(images)))


def build(pretrained: bool = True) -> SplitModel:
    weights = MobileNet_V3_Small_Weights.IMAGENET1K_V1 if pretrained else None
    base = mobilenet_v3_small(weights=weights)
    projection = base.classifier[0]
    activation = base.classifier[1]
    assert isinstance(projection, nn.Linear) and projection.out_features == EMBEDDING_DIM
    return SplitModel(Backbone(base.features, projection, activation))
