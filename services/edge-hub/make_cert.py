"""Generate the hub's LAN certificate with mkcert.

The certificate must cover every name the phone might actually resolve, so its
SAN carries the .local hostname, the LAN IP and localhost. Which of those the
reference device resolves is exactly what the R-02 spike has to find out
(CLAUDE.md §11), so we sign for all of them and let the phone decide.

Usage:
    uv run python make_cert.py            # auto-detect the LAN IP
    uv run python make_cert.py 192.168.1.42
"""

from __future__ import annotations

import socket
import subprocess
import sys
from pathlib import Path

CERT_DIR = Path(__file__).parent / "certs"
CERT_FILE = CERT_DIR / "hub.pem"
KEY_FILE = CERT_DIR / "hub-key.pem"


def detect_lan_ip() -> str:
    """Return the address this machine uses to reach the LAN.

    Opening a UDP socket does not send a packet; it just makes the OS pick the
    outbound interface, which is the one the phone will talk to.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        probe.connect(("192.168.1.1", 1))
        return probe.getsockname()[0]


def main() -> int:
    lan_ip = sys.argv[1] if len(sys.argv) > 1 else detect_lan_ip()
    hostname = socket.gethostname().split(".")[0].lower()
    local_name = f"{hostname}.local"

    CERT_DIR.mkdir(exist_ok=True)

    names = [local_name, lan_ip, "localhost", "127.0.0.1"]
    print(f"Signing for: {', '.join(names)}")

    try:
        subprocess.run(
            ["mkcert", "-cert-file", str(CERT_FILE), "-key-file", str(KEY_FILE), *names],
            check=True,
        )
    except FileNotFoundError:
        print("mkcert is not on PATH. Install it and run `mkcert -install` first.", file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as error:
        print(f"mkcert failed with exit code {error.returncode}", file=sys.stderr)
        return error.returncode

    print(f"\nCertificate: {CERT_FILE}")
    print(f"Key:         {KEY_FILE}")
    print("\nStart the hub with:")
    print(
        "  uv run uvicorn edge_hub.main:app --host 0.0.0.0 --port 8443 "
        "--ssl-certfile certs/hub.pem --ssl-keyfile certs/hub-key.pem"
    )
    print(f"\nOn the phone, open:  https://{local_name}:8443/  or  https://{lan_ip}:8443/")
    print("The phone must have the mkcert CA installed first: run `mkcert -CAROOT`,")
    print("copy rootCA.pem to the device and install it as a CA certificate.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
