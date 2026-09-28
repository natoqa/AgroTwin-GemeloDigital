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

| Fase | Contenido | Estado |
|---|---|---|
| 0–2 | Andamiaje, rebanada vertical, dominio y persistencia | ✅ |
| 3 | Motor agronómico: grados-día, FAO-56 con Hargreaves, tizón de Wallin | ✅ |
| 4 | Simulador *what-if*, Advisor priorizado, panel del gemelo, accesibilidad | ✅ |
| 5 | Inferencia real: MobileNetV3-Small en el teléfono, pipeline de entrenamiento | ✅ |
| 6 | Aprendizaje federado por archivo con hub FedAvg | ✅ recortada (ADR-0011) |
| 7 | Cifrado en reposo, modelo de amenazas | ❌ no hecha |
| 8 | Evidencia y cierre | en curso |

**Lo que no funciona todavía, y por qué:** [`docs/limitaciones.md`](./docs/limitaciones.md).
**Cómo mostrarlo:** [`docs/demo/guion.md`](./docs/demo/guion.md).

## Requisitos

| Herramienta | Versión | Nota |
|---|---|---|
| Node | 24 (ver `.nvmrc`) | |
| pnpm | fijado en `packageManager` | se activa con `corepack enable`; no lo instales global |
| Python | 3.11 | solo para `services/edge-hub`; lo resuelve `uv` |
| uv | 0.12+ | para `services/edge-hub` y `ml/pipeline`; instala Python 3.11 solo |
| mkcert | 1.4+ | solo para servir la PWA por HTTPS en la LAN (spike R-02) |

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
pnpm build        # tsc --build y después el build de la PWA
pnpm test:e2e     # Playwright contra el build de producción
```

## Reproducir desde cero

Pasos exactos en una máquina limpia (Windows, Linux o macOS), probados en el
CI de GitHub en cada push a `main`:

```bash
git clone https://github.com/natoqa/AgroTwin-GemeloDigital.git
cd AgroTwin-GemeloDigital
corepack enable                   # activa el pnpm fijado en package.json
pnpm install --frozen-lockfile

pnpm lint && pnpm typecheck && pnpm test && pnpm test:arch && pnpm build

# El E2E del aprendizaje federado ejecuta el hub real:
(cd services/edge-hub && uv sync --frozen)
pnpm test:e2e                     # 19 pruebas, incluida la del ciclo sin red

# Opcional: los tests de Python
(cd services/edge-hub && uv run pytest -q)
(cd ml/pipeline && uv sync --frozen && uv run pytest -q)
```

Para **usar** la app en el navegador del computador:

```bash
pnpm --filter @agrotwin/app build
pnpm --filter @agrotwin/app preview        # http://localhost:4173
```

El modelo entrenado ya viene en el repositorio (`packages/app/public/model/`):
no hace falta reentrenar. Para reentrenarlo, ver
[`ml/pipeline/README.md`](./ml/pipeline/README.md).

Para levantar la PWA en desarrollo:

```bash
pnpm --filter @agrotwin/app dev
```

**Sobre el orden de los comandos.** `app` consume `domain` e `infrastructure`
por el campo `exports` de cada paquete, que apunta a su `dist/`. Por eso los
scripts `build`, `dev` y `test:e2e` de `app` ejecutan `tsc --build` antes que
Vite: en un clon recién hecho no hay `dist/` que resolver. Si cambias algo en
`domain` o en `infrastructure` mientras el servidor de desarrollo está
corriendo, vuelve a lanzar `dev` para que Vite vea el código nuevo.

## Estructura

```
packages/domain/           TypeScript PURO — el gemelo. Sin DOM, sin Node.
packages/infrastructure/   Adaptadores. Es donde el mundo exterior toca el dominio.
packages/app/              React + Vite = la PWA. Único sitio que conoce a ambos.
services/edge-hub/         Hub en LAN: spike R-02 y FedAvg por archivo.
ml/pipeline/               Entrenamiento fuera del dispositivo (PyTorch → ONNX).
docs/adr/                  Decisiones de arquitectura (0001–0011).
docs/agronomy/             Fuente de cada coeficiente agronómico.
docs/demo/                 Guion de la demostración.
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

## Hub de borde

Ronda de aprendizaje federado por archivo y spike R-02:
[`services/edge-hub/README.md`](./services/edge-hub/README.md). Informe del
spike en [`docs/spikes/r02-https-lan.md`](./docs/spikes/r02-https-lan.md).

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
