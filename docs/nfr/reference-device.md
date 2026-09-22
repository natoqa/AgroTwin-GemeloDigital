# Dispositivo de referencia

> **Estado: BLOQUEANTE — `TODO`.**
> El equipo humano aún no ha entregado estos datos (CLAUDE.md §19).
> Sin ellos no se puede cerrar el DoD de las fases 1, 4, 5 y 7.

Todas las metas de la sección 12 de CLAUDE.md se miden **en este dispositivo y
en ningún otro**. Un número obtenido en una laptop no sustituye a uno obtenido
aquí y no debe registrarse como si lo fuera.

## Datos pendientes

| Campo | Valor | Cómo obtenerlo |
|---|---|---|
| Marca y modelo | `TODO` | Ajustes → Acerca del teléfono |
| RAM física | `TODO` | Ajustes → Acerca del teléfono, o `chrome://system` |
| Almacenamiento libre | `TODO` | Ajustes → Almacenamiento |
| Versión de Android | `TODO` | Ajustes → Acerca del teléfono → Versión de Android |
| Versión de Chrome | `TODO` | `chrome://version`, primera línea |
| User agent completo | `TODO` | `chrome://version`, campo *User Agent* |
| SoC / CPU | `TODO` | `chrome://system`, o ficha técnica del modelo |

## Criterios de elección

El dispositivo debe representar al usuario real, no al equipo de desarrollo:

- **Gama baja de verdad:** en torno a 2 GB de RAM, sin GPU dedicada, CPU modesta
  (CLAUDE.md §3, restricción 3). Un teléfono de gama alta produce mediciones que
  no significan nada para este trabajo.
- **Android 10 o superior** con el Chrome actual es el objetivo soportado.
- Si además se dispone de un **Android 8 o 9 con Chrome 138 congelado**,
  regístrese como *dispositivo secundario*: la restricción 4 lo declara
  funcional pero limitado, y conviene poder demostrarlo.

## Dispositivo de desarrollo (NO es el de referencia)

> **Xiaomi Redmi Note 14.** Disponible desde el 2026-09-21.

Gama media: del orden de 6–8 GB de RAM frente a los ~2 GB del objetivo. Sirve
para **verificar que algo funciona**, no para medir cuánto tarda.

| Uso | ¿Vale este teléfono? |
|---|---|
| Spike R-02 (confianza en mkcert, service worker) | **Sí.** La pregunta es binaria y no depende de la gama. |
| Instalación de la PWA, Lighthouse (Fase 1) | Sí |
| Revisión de accesibilidad y de interfaz (Fase 4) | Sí |
| RNF-01, RNF-02, RNF-03, RNF-04 (Fase 5 y 7) | **No.** Daría números cómodos y engañosos. |

Los campos concretos se rellenan tras la primera visita a la página del spike,
que ya reporta RAM aproximada, núcleos, pantalla, cuota de almacenamiento y user
agent, y ofrece un botón para copiarlo todo.

| Campo | Valor |
|---|---|
| Marca y modelo | Xiaomi Redmi Note 14 (falta confirmar variante) |
| RAM física | `TODO` — confirmar en `chrome://system` |
| Versión de Android | `TODO` |
| Versión de Chrome | `TODO` |
| User agent completo | `TODO` |
| SoC / CPU | `TODO` |

## Dispositivo secundario (Android 8–9, opcional)

| Campo | Valor |
|---|---|
| Marca y modelo | `TODO` |
| Versión de Android | `TODO` |
| Versión de Chrome | `TODO` (se espera 138, última publicada por Google para esas versiones) |

## Consecuencias de que siga pendiente

Menos de las que parecía. El dispositivo de desarrollo cubre todo lo que es
*funcional*; lo que bloquea es exclusivamente lo *cuantitativo*:

- **Fase 1:** no se puede registrar la prueba en dispositivo real del DoD.
- **Fase 4:** no se puede registrar la revisión de interfaz en dispositivo real.
- **Fase 5:** RNF-01, RNF-02, RNF-03 y RNF-04 no se pueden medir.
- **Fase 7:** el perfilado de rendimiento y memoria no se puede hacer.

La Fase 0 **sí** puede cerrarse con esta entrada en `TODO`, tal como su DoD
contempla.
