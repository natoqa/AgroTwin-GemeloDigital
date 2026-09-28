"""FedAvg over signed head deltas (CLAUDE.md §11, ADR-0006).

The hub is a possible adversary, not an authority: the phones re-check
whatever it sends against their own holdout. What the hub *does* enforce is
that nothing unsigned, oversized or built for another model gets averaged in.

File layout (mirrors `packages/domain/src/learning/FederationPackage.ts`):

    magic(4) | u32 header_len | header JSON | u32 sig_len | signature b64 | float32 body

Signatures are ECDSA P-256 over SHA-256 in IEEE P1363 form (r‖s, 64 bytes), as
Web Crypto produces them; `cryptography` wants DER, so they are converted.
"""

from __future__ import annotations

import base64
import hashlib
import json
import math
import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import (
    decode_dss_signature,
    encode_dss_signature,
)

DELTA_MAGIC = b"AGTD"
MODEL_MAGIC = b"AGTM"
FORMAT_VERSION = 1

# Hub policy. A phone may clip tighter, never looser.
MAX_CLIP_NORM = 1.0


class PackageError(ValueError):
    """A file the hub refuses, with the reason in words."""


@dataclass(frozen=True)
class Package:
    header: dict
    body: np.ndarray
    signed_bytes: bytes
    signature: str


def parse(data: bytes, magic: bytes) -> Package:
    if len(data) < 12 or data[:4] != magic:
        raise PackageError(f"it does not start with {magic.decode()}")
    (header_len,) = struct.unpack_from("<I", data, 4)
    header_end = 8 + header_len
    if header_end + 4 > len(data):
        raise PackageError("the header is truncated")
    (sig_len,) = struct.unpack_from("<I", data, header_end)
    sig_end = header_end + 4 + sig_len
    if sig_end > len(data):
        raise PackageError("the signature is truncated")
    header_bytes = data[8:header_end]
    try:
        header = json.loads(header_bytes.decode("ascii"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PackageError("the header is not ASCII JSON") from error
    if not isinstance(header, dict):
        raise PackageError("the header is not an object")
    body_bytes = data[sig_end:]
    count = header.get("parameterCount")
    if not isinstance(count, int) or count <= 0 or len(body_bytes) != count * 4:
        raise PackageError("the body does not hold parameterCount float32 values")
    body = np.frombuffer(body_bytes, dtype="<f4").astype(np.float32)
    if not np.all(np.isfinite(body)):
        raise PackageError("the body holds a value that is not finite")
    return Package(
        header=header,
        body=body,
        signed_bytes=data[:4] + header_bytes + body_bytes,
        signature=data[header_end + 4 : sig_end].decode("ascii"),
    )


def encode(magic: bytes, header: dict, body: np.ndarray, signature: str) -> bytes:
    header_bytes = json.dumps(header, separators=(",", ":")).encode("ascii")
    sig = signature.encode("ascii")
    return (
        magic
        + struct.pack("<I", len(header_bytes))
        + header_bytes
        + struct.pack("<I", len(sig))
        + sig
        + body.astype("<f4").tobytes()
    )


def signed_bytes_for(magic: bytes, header: dict, body: np.ndarray) -> bytes:
    return (
        magic
        + json.dumps(header, separators=(",", ":")).encode("ascii")
        + body.astype("<f4").tobytes()
    )


# --- Signatures ----------------------------------------------------------------


def public_key_b64(key: ec.EllipticCurvePrivateKey) -> str:
    raw = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return base64.b64encode(raw).decode("ascii")


def sign(key: ec.EllipticCurvePrivateKey, data: bytes) -> str:
    """ECDSA P-256 / SHA-256, returned as base64 of r‖s (Web Crypto's format)."""
    r, s = decode_dss_signature(key.sign(data, ec.ECDSA(hashes.SHA256())))
    return base64.b64encode(r.to_bytes(32, "big") + s.to_bytes(32, "big")).decode("ascii")


def verify(data: bytes, signature_b64: str, public_key: str) -> bool:
    try:
        raw_key = base64.b64decode(public_key, validate=True)
        raw_sig = base64.b64decode(signature_b64, validate=True)
        if len(raw_sig) != 64:
            return False
        key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), raw_key)
        der = encode_dss_signature(
            int.from_bytes(raw_sig[:32], "big"), int.from_bytes(raw_sig[32:], "big")
        )
        key.verify(der, data, ec.ECDSA(hashes.SHA256()))
        return True
    except (InvalidSignature, ValueError):
        return False


def load_or_create_key(path: Path) -> ec.EllipticCurvePrivateKey:
    """The hub's signing key, kept next to its TLS material and never versioned."""
    if path.exists():
        key = serialization.load_pem_private_key(path.read_bytes(), password=None)
        assert isinstance(key, ec.EllipticCurvePrivateKey)
        return key
    key = ec.generate_private_key(ec.SECP256R1())
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    return key


# --- Validation and FedAvg -----------------------------------------------------


@dataclass(frozen=True)
class Base:
    """The head every delta of this round must have been computed from."""

    backbone_version: str
    head_version: str
    params: np.ndarray


def norm_bound(clip_norm: float, sigma: float, count: int) -> float:
    """The largest norm a clipped, noised delta can plausibly have.

    ‖clip + noise‖ ≤ C + ‖noise‖, and ‖noise‖ concentrates around σ√n with a
    spread of about σ/√2; eight of those is far beyond chance.
    """
    return clip_norm + sigma * math.sqrt(count) + 8 * sigma


def check_delta(package: Package, base: Base) -> None:
    """Raises `PackageError` naming the first reason the delta is refused."""
    h = package.header
    if h.get("format") != "agrotwin-delta" or h.get("formatVersion") != FORMAT_VERSION:
        raise PackageError("not an agrotwin-delta version 1 file")
    if not verify(package.signed_bytes, package.signature, str(h.get("publicKey", ""))):
        raise PackageError("invalid signature")
    if h.get("backboneVersion") != base.backbone_version:
        raise PackageError("computed for another backbone")
    if h.get("baseHeadVersion") != base.head_version:
        raise PackageError("computed from another head")
    if package.body.size != base.params.size:
        raise PackageError("wrong number of parameters")
    samples = h.get("sampleCount")
    if not isinstance(samples, int) or samples <= 0:
        raise PackageError("no sample count")
    clip_norm, sigma = float(h.get("clipNorm", -1)), float(h.get("noiseSigma", -1))
    if not 0 < clip_norm <= MAX_CLIP_NORM or sigma < 0:
        raise PackageError(
            f"clip norm {clip_norm} is outside the hub's policy (<= {MAX_CLIP_NORM})"
        )
    norm = float(np.linalg.norm(package.body.astype(np.float64)))
    if norm > norm_bound(clip_norm, sigma, package.body.size):
        raise PackageError(f"norm {norm:.3f} exceeds what clipping to {clip_norm} allows")


def fedavg(deltas: list[Package]) -> np.ndarray:
    """Average of the deltas weighted by their sample counts (McMahan et al., 2017)."""
    weights = np.array([d.header["sampleCount"] for d in deltas], dtype=np.float64)
    stacked = np.stack([d.body.astype(np.float64) for d in deltas])
    return (weights[:, None] * stacked).sum(axis=0) / weights.sum()


@dataclass(frozen=True)
class RoundResult:
    accepted: list[str]
    rejected: list[tuple[str, str]]
    model: bytes | None
    head_version: str | None


def aggregate(
    files: dict[str, bytes],
    base: Base,
    key: ec.EllipticCurvePrivateKey,
    created_at: int,
    min_contributors: int = 1,
) -> RoundResult:
    accepted: list[Package] = []
    accepted_names: list[str] = []
    rejected: list[tuple[str, str]] = []
    for name, data in sorted(files.items()):
        try:
            package = parse(data, DELTA_MAGIC)
            check_delta(package, base)
        except PackageError as error:
            rejected.append((name, str(error)))
            continue
        accepted.append(package)
        accepted_names.append(name)

    if len(accepted) < min_contributors:
        return RoundResult(accepted_names, rejected, None, None)

    params = (base.params.astype(np.float64) + fedavg(accepted)).astype(np.float32)
    digest = hashlib.sha256(params.astype("<f4").tobytes()).hexdigest()[:12]
    head_version = f"{base.backbone_version}+fed-{digest}"
    header = {
        "format": "agrotwin-model",
        "formatVersion": FORMAT_VERSION,
        "backboneVersion": base.backbone_version,
        "baseHeadVersion": base.head_version,
        "headVersion": head_version,
        "parameterCount": int(params.size),
        "contributors": len(accepted),
        "totalSamples": int(sum(p.header["sampleCount"] for p in accepted)),
        "createdAt": created_at,
        "publicKey": public_key_b64(key),
    }
    signature = sign(key, signed_bytes_for(MODEL_MAGIC, header, params))
    return RoundResult(
        accepted_names, rejected, encode(MODEL_MAGIC, header, params, signature), head_version
    )


def base_from_shipped_head(contract_path: Path, head_path: Path) -> Base:
    """The round-zero base: the head that ships with the app."""
    contract = json.loads(contract_path.read_text("utf-8"))
    head = json.loads(head_path.read_text("utf-8"))
    params = np.concatenate(
        [np.array(head["weights"], dtype=np.float32).ravel(), np.array(head["bias"], np.float32)]
    )
    return Base(contract["version"], contract["version"], params)


def base_from_model(data: bytes, hub_public_key: str) -> Base:
    """A later round's base: an aggregate this hub produced and signed."""
    package = parse(data, MODEL_MAGIC)
    if package.header.get("publicKey") != hub_public_key or not verify(
        package.signed_bytes, package.signature, hub_public_key
    ):
        raise PackageError("the base model was not signed by this hub")
    return Base(package.header["backboneVersion"], package.header["headVersion"], package.body)
