# AgroTwin

Gemelo digital de parcela agrícola que se ejecuta **íntegramente en el navegador
de un smartphone Android de gama baja**, como PWA instalable, para pequeños
agricultores de la sierra de La Libertad (Perú).

No es un clasificador de fotos de hojas. Es una réplica virtual de la parcela
que se sincroniza con el estado real del campo, simula su comportamiento futuro
con modelos agronómicos explícitos y devuelve recomendaciones accionables. El
clasificador es la pieza reemplazable; **el motor agronómico es la tesis**.

- **Cultivo:** papa (*Solanum tuberosum*)
- **Cero nube:** sin backend en internet, sin API remota, sin cuentas en servidor
- **Offline-first absoluto:** tras instalarse, la PWA funciona sin conexión de forma indefinida
- **Los datos crudos nunca salen del dispositivo**

Proyecto del curso Ingeniería de Software II, Universidad Nacional de Trujillo.

> **[`CLAUDE.md`](./CLAUDE.md) es la fuente de verdad del proyecto.** Alcance,
> restricciones, stack, reglas arquitectónicas, requisitos no funcionales, plan
> de fases y protocolo de trabajo viven ahí. Este README solo explica cómo
> levantar el repositorio.

## Estado

**Fase 0 — Andamiaje.** El repositorio hace cumplir sus reglas arquitectónicas
por herramienta. Todavía no hay interfaz, ni agronomía, ni inferencia: eso
empieza en la Fase 1.

## Requisitos

| Herramienta | Versión | Nota |
|---|---|---|
| Node | 24 (ver `.nvmrc`) | |
| pnpm | fijado en `packageManager` | se activa con `corepack enable`; no lo instales global |
| Python | 3.11 | solo para `services/edge-hub`; lo resuelve `uv` |
| uv | reciente | solo para `services/edge-hub` |
| mkcert | 1.4+ | solo para el spike R-02 |

Si `corepack enable` falla por permisos en Windows, instala los shims en un
directorio de usuario que ya esté en el PATH:

```bash
corepack enable --install-directory "$APPDATA/npm"
```

## Puesta en marcha

```bash
pnpm install
pnpm lint         # ESLint: fronteras entre capas y prohibiciones del dominio
pnpm typecheck    # tsc --build --force
pnpm test         # Vitest
pnpm test:arch    # los guardianes arquitectónicos (ver abajo)
pnpm build        # tsc --build
```

## Estructura

```
packages/domain/           TypeScript PURO — el gemelo. Sin DOM, sin Node.
packages/infrastructure/   Adaptadores. Es donde el mundo exterior toca el dominio.
services/edge-hub/         Hub FastAPI en LAN. Hoy: solo el spike R-02.
docs/adr/                  Decisiones de arquitectura (0001–0006).
docs/nfr/                  Dispositivo de referencia y mediciones.
docs/spikes/               Resultados de pruebas de viabilidad.
```

Dirección de dependencias: `app → infrastructure → domain`. El dominio no
depende de nadie.

## Los guardianes arquitectónicos

Las reglas de la sección 7 de `CLAUDE.md` se hacen cumplir con herramientas, no
con disciplina. `pnpm test:arch` apunta a fixtures que **deben ser rechazadas** y
falla si alguna es aceptada:

| Regla | Mecanismo | Fixture |
|---|---|---|
| Un `window` en el dominio no compila | `"lib": ["ES2022"]`, `"types": []` | `uses-browser-api.ts` |
| `Date.now()` / `new Date()` sin argumentos no pasan el lint | `no-restricted-syntax` | `uses-wall-clock.ts` |
| `Math.random` no pasa el lint | `no-restricted-syntax` | `uses-randomness.ts` |
| Importar `infrastructure` desde el dominio no pasa el lint | `no-restricted-imports` + `boundaries/dependencies` | `imports-infrastructure.ts` |

El tiempo entra solo por `ClockPort`; la aleatoriedad, solo por `RandomPort`.
Esto no es una convención: es lo que impide que la lógica agronómica se vuelva
imposible de probar de forma determinista (riesgo R-13).

## Hub de borde (spike R-02)

Ver [`services/edge-hub/README.md`](./services/edge-hub/README.md) y el informe
en [`docs/spikes/r02-https-lan.md`](./docs/spikes/r02-https-lan.md).

## Notas sobre versiones

La política del proyecto es usar la versión estable vigente de cada dependencia
y dejar que el lockfile la congele. Una excepción, deliberada y verificada:

- **TypeScript 6.0.3**, no 7.0.2. La 7 es la etiqueta `latest`, pero
  `typescript-eslint@8.70.1` declara el peer `typescript >=4.8.4 <6.1.0`. Se fija
  la versión estable más alta que todo el toolchain admite. Revisar cuando
  `typescript-eslint` publique soporte para TypeScript 7.
- **Vitest 5** sustituyó `vitest.workspace.ts` por `test.projects`. `CLAUDE.md`
  §15 ya pide `vitest.config.ts`, que es su equivalente soportado.

## Licencia

[MIT](./LICENSE).

La licencia cubre el código de este repositorio. **No cubre los datasets**
(PlantVillage, PlantDoc) ni las normales climatológicas de SENAMHI: cada uno
conserva la suya y verificarlas es una tarea del equipo humano (`CLAUDE.md` §19).
