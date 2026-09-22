# ADR-0006 — FedAvg propio en FastAPI; Flower evaluado y descartado

- **Estado:** Aceptada
- **Fecha:** 2026-09-21
- **Fase:** 0
- **Riesgos relacionados:** R-10

## Contexto

Hacía falta decidir si usar un framework de aprendizaje federado ya hecho o
implementar la agregación directamente. El cliente es un navegador, no un
proceso Python, y lo que se federa es una sola capa lineal (ADR-0005): un vector
de pesos y sesgos, no un grafo de modelo completo.

El riesgo R-10 registra el hallazgo: Flower asume clientes Python y su protocolo
de transporte no es consumible desde un navegador sin un puente que
reintroduciría complejidad y superficie de ataque.

## Alternativas consideradas

| Alternativa | A favor | En contra |
|---|---|---|
| Flower | Estrategias de agregación ya implementadas; reconocido en la literatura | Cliente Python: incompatible con el navegador (R-10); exigiría un puente; fuera de alcance según §4 |
| FedAvg propio sobre FastAPI | El transporte es HTTPS plano sobre el mismo origen que la PWA; el formato del delta es nuestro y auditable; las defensas quedan explícitas y verificables | Hay que implementar y probar la agregación, el registro de modelos y la verificación de firmas |

## Decisión

Se implementa **FedAvg ponderado por número de muestras directamente en
FastAPI**, sin Flower. El hub mantiene un registro versionado de modelos y
verifica la firma ECDSA P-256 de cada delta recibido.

## Consecuencias

**Positivas.** El transporte es HTTPS del mismo origen que la PWA, sin puentes.
El formato `.agrotwin-delta` es propio y documentado, lo que permite exponer
explícitamente la norma de recorte, los parámetros de ruido y la firma. Las
defensas del §11 son verificables una por una en tests.

**Negativas.** La agregación, el registro de modelos y la verificación de firmas
se escriben y se prueban aquí. No se hereda el aval de un framework conocido, lo
que obliga a describir el algoritmo con precisión en la memoria del trabajo.

**Qué invalidaría esta decisión.** Que el alcance creciera a estrategias de
agregación robustas complejas (por ejemplo, agregación segura multiparte), donde
reimplementar dejaría de ser razonable.
