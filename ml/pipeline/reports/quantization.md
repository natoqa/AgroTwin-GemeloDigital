# Cuantización del backbone — qué se probó y qué se midió

> Fase 5, 2026-09-28. Mediciones hechas sobre el modelo de la corrida de humo
> (1 época, misma arquitectura, mismos datos y misma semilla). La exportación y
> la cuantización no dependen de cuántas épocas se entrenó, así que la
> comparación entre métodos es válida. Las cifras finales del modelo
> entregado están en `evaluation.md`.

## Punto de partida: la exportación es exacta

Embeddings de 16 imágenes de la prueba de laboratorio, PyTorch frente al ONNX
FP32 exportado:

| Medida | Valor |
|---|---|
| Diferencia absoluta máxima | 2.8 × 10⁻⁵ |
| Coseno mínimo | 0.9999999 |

Cualquier pérdida posterior viene de la cuantización, no de la exportación.

## INT8 estático (decisión D4 original): destruye el modelo

Coseno medio entre el embedding FP32 y el cuantizado, sobre 32 imágenes de la
prueba de laboratorio. 1.0 = idéntico; 0 = sin relación.

| Variante de `quantize_static` (QDQ, pesos por canal) | Coseno | Tamaño |
|---|---|---|
| MinMax, la configuración de D4 | 0.189 | 1.86 MB |
| Entropía | 0.189 | 1.86 MB |
| Rango reducido | 0.336 | 1.86 MB |
| Percentil 99.999 | 0.502 | 1.86 MB |
| Percentil, sin cuantizar HardSigmoid ni Mul | 0.498 | 1.84 MB |
| Percentil, sin cuantizar los bloques SE | 0.510 | 3.15 MB |
| Sin la primera convolución | 0.223 | 1.87 MB |
| Sin las convoluciones depthwise | 0.102 | 2.00 MB |
| Sin los bloques SE | 0.194 | 3.17 MB |
| Solo convoluciones | 0.100 | 3.60 MB |

Clasificación con MinMax (la de D4), prueba de laboratorio: F1 macro de los
tizones **0.044** frente a 0.889 del FP32. El modelo cuantizado predice
«sana» para casi todo.

**Por qué.** El análisis capa por capa (`onnxruntime.quantization.qdq_loss_debug`)
muestra que cada operador cuantizado por separado tiene un error aceptable
(30–50 dB de SQNR), pero el error **se acumula**: la SQNR del modelo completo
cae por debajo de 3 dB ya en el segundo bloque, tras el primer bloque
*squeeze-excitation*, y se queda cerca de 0 dB. Es la debilidad conocida de
MobileNetV3 ante la cuantización posterior al entrenamiento: activaciones
HardSwish y bloques SE con rangos muy distintos entre canales.

## INT8 solo en los pesos (decisión adoptada)

Cada peso de `Conv` y `Gemm` se guarda como INT8 simétrico por canal de
salida, con su escala en float32 y un nodo `DequantizeLinear` estándar. Las
activaciones y la aritmética siguen en float32.

| Backbone | Coseno con FP32 | F1 macro laboratorio | F1 macro campo | Tamaño |
|---|---|---|---|---|
| FP32 | 1.000 | 0.892 | 0.682 | 6.08 MB |
| **INT8 solo pesos** | **0.987** | **0.873** | **0.681** | **1.65 MB** |
| INT8 estático (D4) | 0.189 | 0.04 (tizones) | — | 1.86 MB |

## Lo que cuesta la decisión

- **No hay aritmética entera.** El ahorro es de almacenamiento y descarga,
  no de cómputo. Si la latencia en el dispositivo de referencia no cumple
  RNF-01, la salida es entrenamiento consciente de la cuantización (QAT), que
  aquí no se hizo.
- **Corrección.** En la conversación previa a esta decisión se citó el
  backbone FP32 como de 3.6 MB; el archivo medido pesa **6.08 MB**. La
  conclusión no cambia: los tres caben en RNF-03.
