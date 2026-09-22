"""AgroTwin edge hub.

Phase 0 scope is deliberately narrow: this exists to settle risk R-02, namely
whether an Android Chrome from the supported matrix will (a) trust an mkcert
certificate presented over the LAN and (b) register a service worker on it.

The hub serves the PWA itself, so the page and the API share an origin: no
mixed content and no CORS. It also emits COOP/COEP, which is what the WASM
multi-threading improvement needs later (R-04).

FedAvg, the model registry and signature verification belong to Phase 6 and are
deliberately absent here.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(title="AgroTwin edge hub", version="0.0.0")


class EdgeHeadersMiddleware(BaseHTTPMiddleware):
    """Cross-origin isolation plus a root-scoped service worker.

    COOP/COEP are what make `crossOriginIsolated` true, which in turn is what
    unlocks SharedArrayBuffer and therefore multi-threaded WASM. The baseline
    stays single-thread + SIMD either way (CLAUDE.md §10); this only lets the
    spike report whether the improvement is reachable at all.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Embedder-Policy"] = "require-corp"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        # Lets /sw.js claim the whole origin as its scope.
        response.headers["Service-Worker-Allowed"] = "/"
        return response


app.add_middleware(EdgeHeadersMiddleware)


@app.get("/api/health")
async def health() -> JSONResponse:
    """Same-origin API call the page makes to prove there is no mixed content."""
    return JSONResponse({"status": "ok", "service": "agrotwin-edge-hub", "phase": 0})


@app.get("/sw.js")
async def service_worker() -> FileResponse:
    """Served from the root so its default scope covers the whole origin."""
    return FileResponse(
        STATIC_DIR / "sw.js",
        media_type="application/javascript",
        headers={"Cache-Control": "no-cache"},
    )


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
