# ADR-0001 — PWA instalable en lugar de app Android nativa

- **Estado:** Aceptada
- **Fecha:** 2026-09-21
- **Fase:** 0
- **Riesgos relacionados:** R-05, R-06

## Contexto

El sistema debe llegar a pequeños agricultores de la sierra de La Libertad con
teléfonos Android de gama baja (2 GB de RAM, sin GPU) y funcionar sin conexión
de forma indefinida (CLAUDE.md §3, restricciones 2–4). La restricción de cero
nube (§3.1) descarta cualquier backend en internet, y con él cualquier
arquitectura que dependa de una tienda de aplicaciones para actualizarse.

## Alternativas consideradas

| Alternativa | A favor | En contra |
|---|---|---|
| App Android nativa (Kotlin) | Mejor acceso a hardware; NNAPI para inferencia; sin límites de almacenamiento del navegador | Requiere distribución por tienda o APK lateral; actualizar exige reinstalar; no reutiliza el dominio TypeScript |
| PWA instalable | Se instala desde un enlace; se actualiza sola; un solo lenguaje en cliente y dominio; corre en cualquier Android con Chrome | Sujeta al desalojo de almacenamiento (R-07); sin NNAPI; el runtime de inferencia pesa (R-06); iOS queda fuera |
| Web app sin instalar | Cero fricción de entrada | No cumple el offline absoluto ni el arranque en frío de RNF-05 |

## Decisión

Se construye una **PWA instalable** con vite-plugin-pwa y Workbox.

## Consecuencias

**Positivas.** Distribución por enlace o código QR, sin tienda. El dominio
TypeScript se comparte entre inferencia, simulación e interfaz. Las
actualizaciones llegan por service worker sin intervención del agricultor.

**Negativas.** El almacenamiento puede ser desalojado por el sistema (R-07), lo
que obliga a navigator.storage.persist(), política de retención y respaldo a
archivo. La inferencia va por WASM y no por NNAPI, lo que presiona RNF-01.

**Qué invalidaría esta decisión.** Que RNF-01 (menos de 3 s de captura a
resultado) o RNF-04 (pico de memoria bajo 350 MB) resulten inalcanzables con
WASM en el dispositivo de referencia, medido en la Fase 5.
