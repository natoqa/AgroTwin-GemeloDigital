# ADR-0004 — Python fuera del dispositivo de borde

- **Estado:** Aceptada
- **Fecha:** 2026-09-21
- **Fase:** 0
- **Riesgos relacionados:** R-06

## Contexto

El entrenamiento del backbone y la preparación de datos se hacen naturalmente en
Python con PyTorch. Existe la tentación de llevar ese mismo código al teléfono,
por ejemplo con Pyodide, para reutilizarlo. El dispositivo objetivo tiene 2 GB
de RAM y RNF-02 limita el app shell precacheado a 8 MB.

## Alternativas consideradas

| Alternativa | A favor | En contra |
|---|---|---|
| Pyodide en el navegador | Un solo lenguaje de ML; reutiliza el código de entrenamiento | Decenas de MB solo de runtime, contra RNF-02 y RNF-04; arranque lento contra RNF-05; sin justificación funcional |
| Python solo fuera del dispositivo | El cliente carga únicamente artefactos; el pipeline usa las herramientas adecuadas sin restricción de peso | Obliga a un contrato explícito entre pipeline y cliente, y a reimplementar el entrenamiento de la cabeza en TypeScript |

## Decisión

Python vive **solo** en `ml/pipeline` (entrenamiento offline) y en
`services/edge-hub` (agregación en LAN). **Nunca** se ejecuta en el dispositivo
de borde. El cliente consume artefactos, no código Python.

## Consecuencias

**Positivas.** El presupuesto de RNF-02, RNF-04 y RNF-05 no carga con un runtime
de Python. El pipeline puede usar las herramientas que quiera sin afectar al
cliente.

**Negativas.** Exige un contrato explícito entre pipeline y cliente
(`model-contract.json`, §10) y obliga a que el entrenamiento de la cabeza
clasificadora se reimplemente en TypeScript, lo que a su vez obliga al test de
paridad de la Fase 5.

**Qué invalidaría esta decisión.** Nada previsto: es consecuencia directa de los
requisitos no funcionales.
