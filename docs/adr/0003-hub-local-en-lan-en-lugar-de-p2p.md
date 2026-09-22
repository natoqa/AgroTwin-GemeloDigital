# ADR-0003 — Hub local en LAN en lugar de P2P entre navegadores

- **Estado:** Aceptada, condicionada al spike R-02
- **Fecha:** 2026-09-21
- **Fase:** 0
- **Riesgos relacionados:** R-02, R-04

## Contexto

El aprendizaje federado necesita un punto de agregación, pero la restricción de
cero nube (CLAUDE.md §3.1) prohíbe cualquier servidor en internet. La
restricción es *cero nube*, no *cero infraestructura*: un hub físico en LAN sin
salida a internet está explícitamente permitido.

El obstáculo es de plataforma, no de diseño. Un service worker exige un contexto
seguro, y una PWA servida por HTTPS no puede llamar a una API por HTTP sin
incurrir en contenido mixto. De ahí el riesgo R-02, calificado como crítico.

## Alternativas consideradas

| Alternativa | A favor | En contra |
|---|---|---|
| P2P entre navegadores (WebRTC) | Sin infraestructura física | La señalización necesita un servidor, lo que reintroduce la nube; la agregación entre pares es frágil y no deja un punto claro de verificación de firmas |
| Hub local en LAN (FastAPI) | Punto de agregación claro; verifica firmas; permite FedAvg ponderado; apagarlo no degrada la PWA | Requiere hardware (una laptop) y certificados TLS válidos en la LAN (R-02) |
| Solo intercambio por archivo | Cero infraestructura; funciona siempre | Flujo manual; no demuestra el protocolo federado completo |

## Decisión

Un **hub local en LAN** en `services/edge-hub` (FastAPI) como transporte
principal, con `FileTransport` como respaldo obligatorio y no como extra. El hub
sirve **la propia PWA** por HTTPS con certificado mkcert, de modo que PWA y API
comparten origen: sin contenido mixto y sin CORS. El certificado incluye en su
SAN tanto el nombre `.local` como la IP LAN del hub.

El hub es **un adversario posible, no una autoridad**: el cliente verifica
firmas y valida contra su holdout local antes de aceptar un modelo agregado.

## Consecuencias

**Positivas.** Un punto único donde verificar firmas y aplicar FedAvg ponderado
por número de muestras. El mismo origen habilita además las cabeceras COOP/COEP
que el multihilo WASM necesita (R-04). Apagar el hub no degrada la PWA.

**Negativas.** Exige instalar la CA de mkcert en cada teléfono de prueba, que es
una acción humana (§19) y una fricción real de despliegue.

**Qué invalidaría esta decisión.** Que el spike R-02 demuestre que un Chrome de
la matriz soportada rechaza el certificado mkcert o se niega a registrar el
service worker sobre él. En ese caso `FileTransport` pasaría de respaldo a
transporte único y este ADR sería reemplazado.

## Estado del condicionamiento

Ver `docs/spikes/r02-https-lan.md`. Mientras la prueba en un teléfono real no se
ejecute, esta decisión permanece condicionada.
