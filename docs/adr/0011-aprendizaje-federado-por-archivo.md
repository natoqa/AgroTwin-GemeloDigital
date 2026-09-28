# ADR-0011 — Aprendizaje federado: por archivo primero, clave del hub por primer uso, ruido de demostración

- **Estado:** Aceptada
- **Fecha:** 2026-09-28
- **Fase:** 6 (recortada, aprobada por el equipo el 2026-09-28)
- **Riesgos relacionados:** R-02, R-09

## Contexto

CLAUDE.md §11 pide dos transportes (`LanHubTransport` y `FileTransport`),
privacidad diferencial con σ y ε reportados, y que el hub sea tratado como un
adversario posible. La fase se abrió con un día de plazo y el spike R-02
(HTTPS en la LAN desde un teléfono) sigue sin probarse en un teléfono real.

## Decisión

1. **Solo `FileTransport`.** Es el transporte obligatorio (§11: «el único
   camino cuando no hay hub») y no depende de R-02. El hub agrega por línea de
   comandos. `LanHubTransport` queda como trabajo futuro.
2. **La clave del hub se fija en el primer uso (TOFU).** La firma de un
   agregado prueba que no se alteró; que venga *del mismo hub* lo prueba fijar
   la primera clave aceptada. La defensa decisiva sigue siendo el holdout
   local: un agregado que empeora más de 5 puntos se rechaza, venga de donde
   venga.
3. **Una clave ECDSA P-256 efímera por delta.** La firma no identifica al
   teléfono: dos aportes del mismo teléfono no se pueden vincular por su clave.
4. **Recorte C = 1.0 y ruido σ = 0.01 por parámetro.** El mecanismo está
   completo, pero **σ = 0.01 no da una garantía de privacidad diferencial
   significativa**: se eligió para que la demostración de tres navegadores
   termine con un modelo *aceptado*. **No se calculó ε.** El reporte de utilidad
   con y sin privacidad diferencial que pide el DoD tampoco se hizo.
5. **El holdout se elige por hash del id de la observación**, no por sorteo,
   para que un ejemplo reservado nunca se entrene en una sesión posterior.
   Sin holdout no se acepta ningún agregado.

## Consecuencias

**Positivas.** Protocolo completo y probado de punta a punta con el hub real;
interoperabilidad de firmas Web Crypto ↔ Python verificada en los dos
sentidos; ningún dato crudo sale del teléfono.

**Negativas.** Sin transporte por red; la privacidad diferencial es de
demostración; un teléfono en «solo recibir» sin fotos confirmadas no puede
aceptar ninguna mejora (no tiene con qué comprobarla).

**Qué invalidaría esta decisión.** Un uso real con agricultores: exigiría
calibrar σ contra un presupuesto de ε con un contador (p. ej. RDP) e
implementar `LanHubTransport` tras cerrar R-02.
