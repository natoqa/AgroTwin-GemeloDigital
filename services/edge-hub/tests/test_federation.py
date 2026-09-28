"""The hub's side of the protocol: what it averages, and what it refuses."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from edge_hub.aggregate import main
from edge_hub.federation import (
    DELTA_MAGIC,
    MODEL_MAGIC,
    Base,
    PackageError,
    aggregate,
    base_from_model,
    encode,
    load_or_create_key,
    norm_bound,
    parse,
    public_key_b64,
    sign,
    signed_bytes_for,
    verify,
)

PARAMS = 12
BASE = Base("bb-1", "bb-1", np.zeros(PARAMS, np.float32))


def delta(values, samples=4, clip=1.0, sigma=0.0, base="bb-1", key=None, tamper=False) -> bytes:
    key = key or ec.generate_private_key(ec.SECP256R1())
    body = np.asarray(values, dtype=np.float32)
    header = {
        "format": "agrotwin-delta",
        "formatVersion": 1,
        "backboneVersion": "bb-1",
        "baseHeadVersion": base,
        "parameterCount": int(body.size),
        "sampleCount": samples,
        "clipNorm": clip,
        "noiseSigma": sigma,
        "createdAt": 1,
        "ephemeralId": "00ff",
        "publicKey": public_key_b64(key),
    }
    signature = sign(key, signed_bytes_for(DELTA_MAGIC, header, body))
    data = bytearray(encode(DELTA_MAGIC, header, body, signature))
    if tamper:
        data[-1] ^= 0x01
    return bytes(data)


def unit(index: int, length=0.5) -> np.ndarray:
    values = np.zeros(PARAMS, np.float32)
    values[index] = length
    return values


def test_fedavg_weights_each_phone_by_its_samples() -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    files = {"a": delta(unit(0), samples=1), "b": delta(unit(1), samples=3)}

    result = aggregate(files, BASE, key, created_at=5)

    assert result.accepted == ["a", "b"]
    model = parse(result.model or b"", MODEL_MAGIC)
    assert model.body[0] == pytest.approx(0.5 * 1 / 4)
    assert model.body[1] == pytest.approx(0.5 * 3 / 4)
    assert model.header["contributors"] == 2
    assert model.header["totalSamples"] == 4
    assert model.header["baseHeadVersion"] == "bb-1"
    assert verify(model.signed_bytes, model.signature, public_key_b64(key))


def test_refuses_an_invalid_signature() -> None:
    key = ec.generate_private_key(ec.SECP256R1())

    result = aggregate({"forged": delta(unit(0), tamper=True)}, BASE, key, created_at=1)

    assert result.model is None
    assert result.rejected == [("forged", "invalid signature")]


def test_refuses_a_norm_that_clipping_could_not_produce() -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    poisoned = np.full(PARAMS, 5.0, np.float32)

    result = aggregate(
        {"honest": delta(unit(0)), "poisoned": delta(poisoned)}, BASE, key, created_at=1
    )

    assert result.accepted == ["honest"]
    assert result.rejected[0][0] == "poisoned"
    assert "exceeds" in result.rejected[0][1]


def test_refuses_a_looser_clip_than_the_hub_allows_and_a_foreign_base() -> None:
    key = ec.generate_private_key(ec.SECP256R1())

    result = aggregate(
        {"loose": delta(unit(0), clip=10.0), "stale": delta(unit(0), base="old")},
        BASE,
        key,
        created_at=1,
    )

    reasons = dict(result.rejected)
    assert "policy" in reasons["loose"]
    assert "another head" in reasons["stale"]


def test_the_norm_bound_admits_honest_noise() -> None:
    rng = np.random.default_rng(0)
    count, sigma = 3075, 0.01
    clipped = np.zeros(count)
    clipped[0] = 1.0
    noisy = clipped + rng.normal(0, sigma, count)

    assert np.linalg.norm(noisy) < norm_bound(1.0, sigma, count)


def test_a_later_round_builds_only_on_this_hubs_own_model(tmp_path: Path) -> None:
    key = load_or_create_key(tmp_path / "hub.pem")
    same = load_or_create_key(tmp_path / "hub.pem")
    assert public_key_b64(key) == public_key_b64(same)

    first = aggregate({"a": delta(unit(0))}, BASE, key, created_at=1)
    base = base_from_model(first.model or b"", public_key_b64(key))
    assert base.head_version == first.head_version

    other = ec.generate_private_key(ec.SECP256R1())
    with pytest.raises(PackageError):
        base_from_model(first.model or b"", public_key_b64(other))


@pytest.mark.parametrize(
    "data",
    [b"", b"XXXX" + b"\0" * 20, DELTA_MAGIC + b"\xff\xff\x00\x00" + b"\0" * 8],
)
def test_parse_refuses_malformed_files(data: bytes) -> None:
    with pytest.raises(PackageError):
        parse(data, DELTA_MAGIC)


def test_the_command_line_round(tmp_path: Path, capsys) -> None:
    contract = tmp_path / "model-contract.json"
    head = tmp_path / "head.json"
    contract.write_text(json.dumps({"version": "bb-1"}), "utf-8")
    head.write_text(json.dumps({"weights": [[0.0] * 3] * 3, "bias": [0.0] * 3}), "utf-8")
    good = tmp_path / "good.agrotwin-delta"
    bad = tmp_path / "bad.agrotwin-delta"
    good.write_bytes(delta(unit(0)))
    bad.write_bytes(delta(unit(0), tamper=True))
    out = tmp_path / "round.agrotwin-model"

    code = main(
        [
            str(good),
            str(bad),
            "--contract",
            str(contract),
            "--head",
            str(head),
            "--out",
            str(out),
            "--key",
            str(tmp_path / "k.pem"),
        ]
    )

    printed = capsys.readouterr().out
    assert code == 0
    assert "ACEPTADO  good.agrotwin-delta" in printed
    assert "RECHAZADO bad.agrotwin-delta: invalid signature" in printed
    assert parse(out.read_bytes(), MODEL_MAGIC).header["contributors"] == 1


def test_accepts_a_delta_signed_by_web_crypto() -> None:
    """Written by the client real WebCryptoSigner (tests/fixtures/make_fixtures.mjs)."""
    data = (Path(__file__).parent / "fixtures" / "webcrypto.agrotwin-delta").read_bytes()
    key = ec.generate_private_key(ec.SECP256R1())

    result = aggregate({"phone": data}, BASE, key, created_at=1)

    assert result.accepted == ["phone"], result.rejected
