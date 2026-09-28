"""One FedAvg round from the command line: the sneakernet path (CLAUDE.md §11).

    uv run python -m edge_hub.aggregate \\
        --contract ../../packages/app/public/model/model-contract.json \\
        --head ../../packages/app/public/model/head.json \\
        --out ronda-1.agrotwin-model  deltas/*.agrotwin-delta

`--base-model` replaces `--head` for later rounds. Every rejected delta is
printed with its reason; nothing is averaged silently.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from .federation import (
    aggregate,
    base_from_model,
    base_from_shipped_head,
    load_or_create_key,
    public_key_b64,
)

DEFAULT_KEY = Path(__file__).resolve().parent.parent / "certs" / "federation-key.pem"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("deltas", nargs="+", type=Path)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--head", type=Path)
    parser.add_argument("--base-model", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--key", type=Path, default=DEFAULT_KEY)
    parser.add_argument("--min-contributors", type=int, default=1)
    args = parser.parse_args(argv)

    key = load_or_create_key(args.key)
    if args.base_model:
        base = base_from_model(args.base_model.read_bytes(), public_key_b64(key))
    elif args.head:
        base = base_from_shipped_head(args.contract, args.head)
    else:
        parser.error("either --head or --base-model is required")

    result = aggregate(
        {path.name: path.read_bytes() for path in args.deltas},
        base,
        key,
        created_at=int(time.time() * 1000),
        min_contributors=args.min_contributors,
    )
    for name in result.accepted:
        print(f"ACEPTADO  {name}")
    for name, reason in result.rejected:
        print(f"RECHAZADO {name}: {reason}")
    if result.model is None:
        print("Sin modelo: no hubo suficientes aportes válidos.", file=sys.stderr)
        return 1
    args.out.write_bytes(result.model)
    print(f"Modelo agregado {result.head_version} → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
