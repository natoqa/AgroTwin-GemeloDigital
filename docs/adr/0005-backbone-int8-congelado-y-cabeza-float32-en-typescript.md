# ADR-0005 — Backbone INT8 congelado y cabeza float32 entrenada en TypeScript

- **Estado:** Aceptada
- **Fecha:** 2026-09-21
- **Fase:** 0
- **Riesgos relacionados:** R-03, R-06

## Contexto

El aprendizaje federado exige entrenar **en el dispositivo**. El riesgo R-03 es
que ONNX Runtime Web **no entrena**: solo ejecuta inferencia. Y el ADR-0004 ya
descarta Python en el cliente, mientras que el alcance (§4) descarta
TensorFlow.js. Hace falta una forma de entrenar algo en el navegador sin ningún
framework de entrenamiento.

## Alternativas consideradas

| Alternativa | A favor | En contra |
|---|---|---|
| TensorFlow.js | Entrena en el navegador de forma nativa | Explícitamente fuera de alcance (§4); añade megabytes contra RNF-02 |
| Federar el modelo completo | Conceptualmente uniforme | Imposible: ORT Web no entrena; los deltas serían de megabytes por ronda |
| Dividir el modelo: backbone congelado + cabeza entrenable | ORT Web solo hace lo que sabe hacer; la cabeza es una capa lineal entrenable en TypeScript puro y determinista; los deltas son pequeños | Obliga a un test de paridad contra PyTorch; el backbone no se adapta al dominio local |

## Decisión

El modelo se divide en dos artefactos:

- **Backbone:** MobileNetV3-Small cuantizado INT8, **congelado**, exportado a
  ONNX, cuya salida es el **embedding**, no los logits. Lo ejecuta ORT Web en un
  Web Worker.
- **Cabeza clasificadora:** una capa lineal float32 (pesos y sesgos) almacenada
  como artefacto separado, ejecutada **y entrenada** en TypeScript dentro de
  `domain/learning`, con regresión softmax, SGD por mini-lotes, regularización
  L2 y aleatoriedad inyectada por `RandomPort` con semilla.

## Consecuencias

**Positivas.** Resuelve R-03 sin añadir dependencias. El entrenamiento local
queda en el dominio, por tanto determinista y testeable en Node. Solo se federan
los pesos de la cabeza, lo que hace los deltas pequeños y el recorte de norma
tratable.

**Negativas.** El backbone no se adapta al dominio local: la capacidad de
aprendizaje federado queda acotada a la capa final. Obliga al test de paridad de
la Fase 5 (mismos logits que PyTorch con tolerancia 1e-4) y a que
`model-contract.json` fije la dimensión del embedding y el orden de clases.

**Qué invalidaría esta decisión.** Que el test de paridad no se pueda satisfacer
dentro de la tolerancia, o que la cuantización INT8 degrade la separabilidad de
los embeddings por debajo de lo utilizable, medido en la Fase 5.
