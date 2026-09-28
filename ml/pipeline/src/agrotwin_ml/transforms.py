"""Preprocessing and augmentation.

`preprocess` is the one the phone reproduces: shorter side to 256, centre crop
224, ImageNet normalisation. It is written out in `model-contract.json`, and the
browser worker follows the contract, not this file.

`augment` is training-only and deliberately aggressive (risk R-11). PlantVillage
photographs every leaf on the same plain background, and a network trained on
them can learn the background instead of the disease. Two defences:

1. **Background swap.** PlantVillage ships each leaf segmented on black. With
   probability `background_swap`, the leaf is pasted onto a random crop of a
   field photograph from the training split, so "plain background" stops
   predicting anything.
2. **Photometric and geometric noise** of the kind a phone in a field adds:
   framing, rotation, light, blur, occlusion.
"""

from __future__ import annotations

import random

import numpy as np
import torch
from PIL import Image, ImageFilter
from torchvision.transforms import v2

from .config import CROP, MEAN, RESIZE, STD

# Pixels darker than this in every channel count as the black background of a
# segmented PlantVillage image.
_BACKGROUND_LEVEL = 18

_normalize = v2.Compose(
    [v2.ToImage(), v2.ToDtype(torch.float32, scale=True), v2.Normalize(MEAN, STD)]
)


def load_rgb(path) -> Image.Image:
    with Image.open(path) as image:
        return image.convert("RGB")


def resize_and_crop(image: Image.Image) -> Image.Image:
    """Shorter side to RESIZE (bilinear), then a centred CROP×CROP square."""
    width, height = image.size
    scale = RESIZE / min(width, height)
    resized = image.resize(
        (max(RESIZE, round(width * scale)), max(RESIZE, round(height * scale))),
        Image.Resampling.BILINEAR,
    )
    left = (resized.width - CROP) // 2
    top = (resized.height - CROP) // 2
    return resized.crop((left, top, left + CROP, top + CROP))


def preprocess(image: Image.Image) -> torch.Tensor:
    """The deployed preprocessing, as a 3×224×224 normalised tensor."""
    return _normalize(resize_and_crop(image))


def swap_background(
    segmented: Image.Image, background: Image.Image, rng: random.Random
) -> Image.Image:
    """Pastes the leaf of a segmented image onto a random crop of `background`."""
    leaf = np.asarray(segmented, dtype=np.uint8)
    mask = (leaf.max(axis=2) > _BACKGROUND_LEVEL).astype(np.uint8) * 255
    mask_image = Image.fromarray(mask, mode="L").filter(ImageFilter.GaussianBlur(1.5))

    width, height = segmented.size
    scale = max(width / background.width, height / background.height) * rng.uniform(1.0, 1.6)
    scaled = background.resize(
        (
            max(width, round(background.width * scale)),
            max(height, round(background.height * scale)),
        ),
        Image.Resampling.BILINEAR,
    )
    left = rng.randint(0, scaled.width - width)
    top = rng.randint(0, scaled.height - height)
    canvas = scaled.crop((left, top, left + width, top + height))
    canvas.paste(segmented, (0, 0), mask_image)
    return canvas


_augment = v2.Compose(
    [
        v2.RandomResizedCrop(CROP, scale=(0.35, 1.0), antialias=True),
        v2.RandomHorizontalFlip(),
        v2.RandomVerticalFlip(),
        v2.RandomRotation(25),
        v2.ColorJitter(brightness=0.4, contrast=0.4, saturation=0.4, hue=0.04),
        v2.RandomGrayscale(p=0.05),
        v2.RandomApply([v2.GaussianBlur(kernel_size=5, sigma=(0.1, 2.0))], p=0.3),
        v2.ToImage(),
        v2.ToDtype(torch.float32, scale=True),
        v2.Normalize(MEAN, STD),
        v2.RandomErasing(p=0.25, scale=(0.02, 0.12)),
    ]
)


def augment(image: Image.Image) -> torch.Tensor:
    return _augment(image)
