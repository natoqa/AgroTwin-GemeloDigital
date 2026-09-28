# Reporte de evaluación — `potato-mnv3s-2026-09-28`

> Generado por `uv run python -m agrotwin_ml`. No editar a mano: se reescribe en
> cada corrida. Semilla 20260928. Las cifras son del modelo **tal como corre en el
> teléfono**: backbone INT8 + cabeza float32, salvo donde se indica FP32.

## Datos

| Conjunto | sana | tizón temprano | tizón tardío |
|---|---|---|---|
| entrenamiento | 106 | 756 | 750 |
| validación | 23 | 172 | 170 |
| prueba laboratorio | 23 | 150 | 150 |
| prueba campo (PlantDoc) | 0 | 33 | 30 |

- Imágenes encontradas: 2373; tras deduplicar por hash: 2363.
- Duplicados eliminados: 0. Imágenes con **dos
  etiquetas distintas** para el mismo contenido, descartadas: 10.
- **No hay hojas sanas de campo**: PlantDoc no tiene clase «papa sana». La
  prueba de campo mide solo los dos tizones.
- «Campo» es PlantDoc: fotos de la web, no fotos de la sierra de La Libertad.
  La evaluación con fotos reales de campo sigue **pendiente** (CLAUDE.md §19).

## Entrenamiento

| Época | Pérdida | F1 macro validación | Segundos |
|---|---|---|---|
| 1 | 0.4233 | 0.9156 | 81 |
| 2 | 0.2246 | 0.8347 | 69 |
| 3 | 0.2549 | 0.8618 | 67 |
| 4 | 0.1635 | 0.9727 | 68 |
| 5 | 0.1572 | 0.9242 | 68 |
| 6 | 0.1426 | 0.9433 | 67 |
| 7 | 0.0996 | 0.9587 | 74 |
| 8 | 0.1079 | 0.9329 | 71 |
| 9 | 0.0867 | 0.9419 | 65 |
| 10 | 0.0954 | 0.9512 | 66 |
| 11 | 0.0940 | 0.9512 | 64 |
| 12 | 0.0737 | 0.9512 | 63 |

## Calibración y rechazo

- Calibrado sobre la **validación de campo** (42 fotos de
  PlantDoc): el teléfono trabaja en el campo, y sobre fotos de laboratorio el
  modelo casi nunca duda, así que un umbral elegido ahí acepta todo en campo.
- Temperatura ajustada: **4.5548**.
- Umbral de rechazo: **0.7006** sobre la probabilidad máxima.
- Objetivo (D2): 90% de aciertos entre las fotos aceptadas.
  En la validación de campo: precisión aceptada **0.769**,
  cobertura **31.0%**. Objetivo **NO alcanzado**: ningún umbral llega al 90 % con fotos de campo; se usa el de mayor precisión, y el contrato lo declara (`thresholdMetTarget: false`).

## Diferencia laboratorio → campo

F1 macro sobre los dos tizones, las clases que comparten ambas pruebas:

| Prueba | INT8 (teléfono) | FP32 (referencia) |
|---|---|---|
| Laboratorio (PlantVillage) | 0.993 | 0.993 |
| Campo (PlantDoc) | 0.629 | 0.644 |
| **Diferencia** | **+0.364** | +0.350 |

### Prueba de laboratorio — INT8

| Clase | Soporte | Precisión | Sensibilidad | F1 |
|---|---|---|---|---|
| sana | 23 | 0.957 | 0.957 | 0.957 |
| tizón temprano | 150 | 1.000 | 0.993 | 0.997 |
| tizón tardío | 150 | 0.987 | 0.993 | 0.990 |

| Real \ Predicha | sana | tizón temprano | tizón tardío |
|---|---|---|---|
| sana | 22 | 0 | 1 |
| tizón temprano | 0 | 149 | 1 |
| tizón tardío | 1 | 0 | 149 |

Con el umbral de rechazo: se aceptan **92.9%** de las fotos (300 de 323); de las aceptadas acierta **0.997**; se rechazan 23.

### Prueba de campo (PlantDoc) — INT8

| Clase | Soporte | Precisión | Sensibilidad | F1 |
|---|---|---|---|---|
| sana | 0 | — | — | — |
| tizón temprano | 33 | 0.727 | 0.485 | 0.582 |
| tizón tardío | 30 | 0.585 | 0.800 | 0.676 |

| Real \ Predicha | sana | tizón temprano | tizón tardío |
|---|---|---|---|
| sana | 0 | 0 | 0 |
| tizón temprano | 0 | 16 | 17 |
| tizón tardío | 0 | 6 | 24 |

Con el umbral de rechazo: se aceptan **28.6%** de las fotos (18 de 63); de las aceptadas acierta **0.778**; se rechazan 45.

## Artefactos

| Archivo | Bytes | SHA-256 |
|---|---|---|
| `backbone.int8.onnx` | 1637991 | `c3b5698cbc847c7ff2691ba700d1664989fc0acca6bba832aa57e4caf83c460d` |
| `head.json` | 68840 | `4820b41c16da2b18302e832d91a7f160f6e672428d8f94e2fa0dcdf127d88659` |
