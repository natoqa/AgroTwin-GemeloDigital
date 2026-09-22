# AgroTwin — Edge hub

Hub local en LAN. **Sin salida a internet.** Agrega deltas de la cabeza
clasificadora con FedAvg ponderado y sirve la propia PWA por HTTPS, de modo que
página y API comparten origen (ADR-0003).

> **Alcance actual: Fase 0.** Aquí solo vive el spike del riesgo R-02. FedAvg,
> el registro de modelos y la verificación de firmas llegan en la Fase 6.

## Requisitos

- Python 3.11 (fijado en `.python-version`, lo resuelve `uv` solo)
- [uv](https://docs.astral.sh/uv/)
- [mkcert](https://github.com/FiloSottile/mkcert) con `mkcert -install` ya ejecutado

## Puesta en marcha

```bash
uv sync
uv run python make_cert.py          # o: uv run python make_cert.py 192.168.1.42
uv run uvicorn edge_hub.main:app --host 0.0.0.0 --port 8443 \
    --ssl-certfile certs/hub.pem --ssl-keyfile certs/hub-key.pem
```

`make_cert.py` detecta la IP LAN y firma un certificado cuyo SAN cubre el nombre
`.local`, esa IP, `localhost` y `127.0.0.1`.

## Para probar desde un teléfono

El teléfono necesita la CA de mkcert instalada. El procedimiento completo, con
la tabla de resultados a rellenar, está en
[`docs/spikes/r02-https-lan.md`](../../docs/spikes/r02-https-lan.md).

## Comprobaciones

```bash
uv run ruff check .
uv run ruff format --check .
```

## Nota de seguridad

`certs/` está en `.gitignore`. La clave privada del hub **no se versiona**: cada
máquina genera la suya. El hub es **un adversario posible, no una autoridad**
(CLAUDE.md §11): el cliente verifica firmas y valida contra su holdout local
antes de aceptar cualquier modelo agregado.
