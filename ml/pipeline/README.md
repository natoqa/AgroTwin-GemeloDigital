# ml/pipeline — entrenamiento fuera del dispositivo

Produce los tres artefactos que la PWA carga (`packages/app/public/model/`):

| Archivo | Qué es |
|---|---|
| `backbone.int8.onnx` | MobileNetV3-Small, pesos INT8, activaciones float32. Devuelve un embedding de 1024 valores |
| `head.json` | La cabeza lineal float32 (1024 → 3), que corre y se entrenará en TypeScript |
| `model-contract.json` | Versión, hashes SHA-256, preprocesamiento, orden de clases, temperatura y umbral de rechazo |

Además escribe `reports/` (evaluación por clase, cuantización, manifiesto de
datos) y el fixture de paridad de `packages/domain/src/learning/fixtures/`.

Los artefactos **se versionan** (Fase 5, D3): la app se construye sin
reentrenar. Python no corre nunca en el cliente (ADR-0004).

## Reproducir

Requisitos: [uv](https://docs.astral.sh/uv/). Instala Python 3.11 y PyTorch
para CPU solo; no hace falta GPU.

```bash
cd ml/pipeline
uv sync

# Datos (una vez, fuera del repositorio): solo las carpetas de papa.
#   <DATA>/plantvillage/raw/color/Potato___{healthy,Early_blight,Late_blight}
#   <DATA>/plantvillage/raw/segmented/Potato___{...}
#   <DATA>/plantdoc/{train,test}/Potato leaf {early,late} blight
# Fuentes: github.com/spMohanty/PlantVillage-Dataset (commit 7f7ecc7)
#          github.com/pratikkayal/PlantDoc-Dataset (commit 5467f60)

uv run python -m agrotwin_ml --data-root <DATA>          # ~15 min en CPU de 6 hilos
uv run python -m agrotwin_ml --data-root <DATA> --reuse-training   # solo exportar y calibrar
uv run pytest -q && uv run ruff check src tests
```

## Licencias de los datos — **pendiente de verificación humana (CLAUDE.md §19)**

| Dataset | Lo que declara su repositorio | Estado |
|---|---|---|
| PlantDoc | CC-BY-4.0 (metadatos de GitHub) | Pendiente de confirmar |
| PlantVillage | **No declara licencia** en el repositorio | Pendiente: no publicar el modelo fuera del curso hasta aclararlo |

Las imágenes **no** están en este repositorio. `reports/dataset-manifest.json`
lista nombre de archivo y SHA-256 de cada una para reproducir las particiones.

## Limitaciones que el reporte declara

- **No hay hojas sanas «de campo»**: PlantDoc no tiene la clase.
- «Campo» es PlantDoc (fotos de la web), no la sierra de La Libertad.
- En fotos de campo ningún umbral alcanza el 90 % de aciertos que pide D2.
  Ver `reports/evaluation.md`.
