# AgroTwin — Edge hub

Hub local en LAN. **Sin salida a internet.** Agrega deltas de la cabeza
clasificadora con FedAvg ponderado y sirve la propia PWA por HTTPS, de modo que
página y API comparten origen (ADR-0003).

> **Alcance actual: Fase 6 recortada.** El spike R-02 (servir la PWA por HTTPS
> en la LAN) y una **ronda de FedAvg por archivo**, con verificación de firmas.
> La ruta por HTTP (`LanHubTransport`) y el registro de modelos no están hechos.

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

## Una ronda de aprendizaje federado (por archivo)

Cada teléfono, en *Aprendizaje compartido*, elige «Compartir y recibir
mejoras», confirma algunas fotos y pulsa **Preparar mi aporte**: descarga un
`.agrotwin-delta` firmado. Esos archivos llegan al hub por cable o memoria:

```bash
uv run python -m edge_hub.aggregate aportes/*.agrotwin-delta \
    --contract ../../packages/app/public/model/model-contract.json \
    --head ../../packages/app/public/model/head.json \
    --out ronda-1.agrotwin-model --min-contributors 3
```

Cada aporte sale como `ACEPTADO` o `RECHAZADO` con su motivo: firma inválida,
norma mayor de la que el recorte permite, recorte más laxo que la política del
hub (≤ 1.0) o calculado sobre otra cabeza. Para la ronda siguiente,
`--base-model ronda-1.agrotwin-model` en lugar de `--head`.

El `.agrotwin-model` vuelve a los teléfonos, que lo cargan en la misma
pantalla. **El teléfono decide**, no el hub: verifica la firma, exige la misma
clave de hub que la primera vez, y lo rechaza si acierta menos de lo que
acertaba en sus propias fotos de comprobación (más de 5 puntos).

La clave del hub se genera en `certs/federation-key.pem` la primera vez.

## Comprobaciones

```bash
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
```

## Nota de seguridad

`certs/` está en `.gitignore`. La clave privada del hub **no se versiona**: cada
máquina genera la suya. El hub es **un adversario posible, no una autoridad**
(CLAUDE.md §11): el cliente verifica firmas y valida contra su holdout local
antes de aceptar cualquier modelo agregado.
