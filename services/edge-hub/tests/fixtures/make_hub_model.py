"""Regenerates the hub-signed model the client's tests verify.

    cd services/edge-hub && uv run python tests/fixtures/make_hub_model.py

A throwaway key, a 12-parameter head: enough for the TypeScript side to check
it can read and verify what `cryptography` signs.
"""

from pathlib import Path

import numpy as np
from cryptography.hazmat.primitives.asymmetric import ec

from edge_hub.federation import Base, aggregate, encode, public_key_b64, sign, signed_bytes_for

DELTA = b"AGTD"
OUT = (
    Path(__file__).resolve().parents[4]
    / "packages/infrastructure/src/federation/fixtures/hub.agrotwin-model"
)

client = ec.generate_private_key(ec.SECP256R1())
hub = ec.generate_private_key(ec.SECP256R1())
body = np.zeros(12, np.float32)
body[0] = 0.5
header = {
    "format": "agrotwin-delta",
    "formatVersion": 1,
    "backboneVersion": "bb-1",
    "baseHeadVersion": "bb-1",
    "parameterCount": 12,
    "sampleCount": 4,
    "clipNorm": 1.0,
    "noiseSigma": 0.0,
    "createdAt": 1,
    "ephemeralId": "ab",
    "publicKey": public_key_b64(client),
}
delta = encode(DELTA, header, body, sign(client, signed_bytes_for(DELTA, header, body)))
result = aggregate({"d": delta}, Base("bb-1", "bb-1", np.zeros(12, np.float32)), hub, 7)
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_bytes(result.model or b"")
print(f"wrote {OUT} ({result.head_version})")
