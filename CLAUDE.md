# CLAUDE.md — AgroTwin

> **Fuente de verdad del proyecto.** Léelo completo al inicio de cada sesión.
> Si una instrucción del chat contradice este documento, señala la contradicción
> y pregunta antes de actuar. Tú mantienes este archivo: al cerrar cada fase
> actualizas la sección 20 (Bitácora) y, si cambió algo, las secciones afectadas.

---

## 1. Rol

Actúas como arquitecto de software senior y desarrollador full-stack líder.
Construyes conmigo un sistema real y funcional, no un prototipo desechable.

- Priorizas decisiones justificadas, código limpio y testeable.
- Eres técnicamente honesto: si algo que pido es inviable, rompe la arquitectura,
  viola un RNF o es mala idea, lo dices **antes** de implementarlo.
- Nunca declaras algo terminado sin haberlo verificado ejecutando comandos.
- Nunca inventas datos: ni coeficientes agronómicos, ni mediciones, ni resultados.

---

## 2. El proyecto

**Nombre:** AgroTwin
**Repositorio:** `AgroTwin-GemeloDigital`
**Contexto:** proyecto del curso Ingeniería de Software II, Universidad Nacional
de Trujillo (UNT), Perú.

**Título académico:** *Lightweight Smartphone-Based Digital Twin for Smallholder
Farmers: Edge-Enabled Crop Health Monitoring with Federated Learning and Zero
Cloud Dependency.*

Un **gemelo digital de parcela agrícola que se ejecuta íntegramente en el navegador
de un smartphone Android de gama baja**, como PWA instalable, para pequeños
agricultores de la sierra de La Libertad.

### Definición operativa del gemelo digital (vinculante)

El sistema **NO** es un clasificador de fotos de hojas. Es una réplica virtual de
la parcela que:

1. **se sincroniza** con el estado real del campo (fotos, observaciones, clima);
2. **simula** su comportamiento futuro mediante modelos agronómicos explícitos;
3. **devuelve** recomendaciones accionables al agricultor, que actúa como
   actuador físico del lazo de control.

El clasificador es la pieza reemplazable. **El motor agronómico es la tesis.**

### Dominio agrícola

- **Cultivo:** papa (*Solanum tuberosum*). Uno solo.
- **Zona:** sierra de La Libertad, Perú.
- **Clases de diagnóstico:** `healthy`, `early_blight` (*Alternaria solani*),
  `late_blight` (*Phytophthora infestans*), y `rejected` (baja confianza).

---

## 3. Restricciones no negociables

1. **Cero dependencia de la nube.** Sin backend en internet, sin API remota, sin
   Firebase, sin cuentas en servidor. La lógica del gemelo, el estado y la
   inferencia viven en el navegador. La restricción es *cero nube*, no *cero
   infraestructura*: un hub físico en LAN sin salida a internet está permitido.
2. **Offline-first absoluto.** Tras la instalación, la PWA es 100% funcional sin
   conexión, de forma indefinida. La red es una optimización, nunca un requisito.
3. **Gama baja.** 2 GB de RAM, sin GPU, CPU modesta.
4. **Plataforma.** Android 10+ con Chrome actual es el objetivo soportado.
   Android 8–9 queda **funcional con Chrome 138 congelado** (última versión que
   Google publicó para esas versiones), documentado como limitación. Ninguna API
   posterior a Chrome 138 se usa sin detección de característica y fallback.
   iOS está fuera de alcance.
5. **Los datos crudos nunca salen del dispositivo.** Fotos, GPS y observaciones
   son privados por diseño. Solo pueden salir deltas de pesos del modelo, con
   consentimiento explícito y revocable.
6. **Usuario con baja alfabetización digital.** UI en español, jerarquía visual
   sobre texto, íconos, targets táctiles grandes (mínimo 48×48 dp), uso con una
   mano, alto contraste, legible bajo sol directo.

---

## 4. Alcance

| Categoría | Contenido |
|---|---|
| **Se construye completo** | Parcelas y campañas, captura de foto, inferencia local, StateStore, BehaviorEngine, Simulator, Advisor, TwinBoard, offline total, instalación PWA. |
| **Funcional con demo acotada** | Aprendizaje federado: protocolo completo implementado, demostrado con 3 contextos de navegador contra el hub en una laptop. Se demuestra el protocolo y sus defensas, **no** una mejora estadística de accuracy. |
| **Interfaz definida, sin implementar** | Sensores BLE de suelo. El dominio define `SoilSensorPort`; el único adaptador es `ManualSoilSensorAdapter`. Web Bluetooth queda como trabajo futuro. |
| **Fuera de alcance** | Multicultivo, quechua, síntesis de voz, iOS, cualquier servicio en la nube, TensorFlow.js, Flower. No los propongas. |

---

## 5. Stack fijado

No reabras estas decisiones. Si detectas un motivo técnico serio para cambiar
alguna, detente y plantéalo como propuesta de ADR.

| Artefacto | Tecnología |
|---|---|
| **Cliente (PWA)** | TypeScript estricto, React, Vite, `vite-plugin-pwa` + Workbox, Dexie (IndexedDB), OPFS, Web Crypto, ONNX Runtime Web (WASM + SIMD; multihilo solo como mejora detectada en runtime), Tailwind CSS, Zustand (solo estado de UI) |
| **Tests cliente** | Vitest, Testing Library, `fake-indexeddb`, Playwright, `@axe-core/playwright` |
| **Hub de borde** | Python 3.11+, FastAPI, FedAvg implementado directamente (sin Flower), Docker Compose, certificados mkcert |
| **Pipeline ML** | Python 3.11 en entorno aislado (uv o venv), PyTorch, MobileNetV3-Small, exportación ONNX, cuantización INT8 |
| **Gestor de paquetes** | pnpm vía Corepack, campo `packageManager` fijado en `package.json` raíz |
| **Runtime** | Node 24 LTS (`.nvmrc`) |

**Política de versiones:** usa la versión estable vigente de cada dependencia,
verifícala antes de fijarla, y deja que el lockfile la congele. No escribas
versiones de memoria. Cuando un peer dependency impida la última estable, fija
la más alta que todo el toolchain admita y registra la razón en la Bitácora: hoy
`typescript-eslint` declara `typescript >=4.8.4 <6.1.0`, y ese peer —no una
preferencia— es lo que mantiene a TypeScript en la línea 6.x.

**Convención de idioma:** código, identificadores, commits y comentarios en
inglés. UI y documentación de usuario en español. Documentos del curso
(`/docs`) en español.

---

## 6. Estructura del monorepo

```
AgroTwin-GemeloDigital/
├── .github/workflows/ci.yml
├── docs/
│   ├── adr/                    # 0000-template.md, 0001…
│   ├── agronomy/sources.md     # bibliografía de cada coeficiente
│   ├── nfr/
│   │   ├── reference-device.md
│   │   └── measurements.md     # mediciones reales vs. metas
│   ├── spikes/                 # resultados de pruebas de viabilidad
│   └── threat-model.md
├── packages/
│   ├── domain/                 # TypeScript PURO — el gemelo
│   │   ├── src/{model,ports,agronomy,twin,learning,usecases,errors}
│   │   └── arch-fixtures/      # código que DEBE ser rechazado (ver §7)
│   ├── infrastructure/         # adaptadores
│   │   └── src/{persistence,inference,capture,crypto,weather,sensors,federation,system}
│   └── app/                    # React + Vite = la PWA
│       └── src/{composition,routes,features,ui,stores,i18n}
├── scripts/arch-guards.mjs     # ejecuta los fixtures y falla si alguno se acepta
├── services/edge-hub/          # Python, FastAPI
├── ml/pipeline/                # Python, entrenamiento offline
├── data/climate/               # normales climatológicas (provistas por el equipo)
└── CLAUDE.md
```

**Regla de creación de archivos:** un archivo nace cuando una fase lo necesita.
No crees archivos vacíos ni carpetas "para completar el árbol".

**Dirección de dependencias:** `app → infrastructure → domain`.
`edge-hub` y `ml/pipeline` no son dependencia de nadie: se despliegan o producen
artefactos, no se importan.

---

## 7. Reglas arquitectónicas y cómo se hacen cumplir

Las reglas se hacen cumplir con herramientas, no con disciplina.

| Regla | Mecanismo |
|---|---|
| `domain` no usa APIs de navegador ni de Node | `packages/domain/tsconfig.json` con `"lib": ["ES2022"]`, sin `"DOM"`, sin `@types/node`. Un `window` en el dominio **no compila**. |
| `domain` no importa de `infrastructure` ni de `app` | ESLint con `eslint-plugin-boundaries` (o `import/no-restricted-paths`). |
| El tiempo solo entra por `ClockPort` | ESLint `no-restricted-syntax` prohíbe `Date.now()` y `new Date()` **sin argumentos** en `domain`. El tipo `Date` no se prohíbe, pero el dominio representa instantes como epoch millis (`number` con branded type) y fechas de calendario con un value object `LocalDate` propio. |
| La aleatoriedad solo entra por `RandomPort` (con semilla) | ESLint prohíbe `Math.random` y `crypto` en `domain`. |
| Sin efectos secundarios de consola en el dominio | ESLint prohíbe `console` en `domain`. |
| El estado del gemelo no vive en React | Zustand guarda solo estado de pantalla. Revisión explícita en cada cierre de fase. |
| Los puertos se definen en el dominio | Cada interfaz de `ports/` vive en `domain`; su implementación, en `infrastructure`. |
| Composition root único | `packages/app/src/composition/` es el único lugar donde `domain` e `infrastructure` se conocen. |
| Cobertura del dominio | Umbral del 85% sobre `packages/domain`, **activo desde la Fase 3**. Antes de la Fase 3 el CI no lo exige. |
| Las reglas de arriba siguen vigentes | `pnpm test:arch` (`scripts/arch-guards.mjs`) compila y lintea los fixtures de `packages/domain/arch-fixtures/`, que **deben** ser rechazados, y falla si alguno se acepta. Corre en CI: una regla que se debilite pone el CI en rojo. |

Los fixtures de `arch-fixtures/` son la única excepción a la prohibición de
archivos que no compilan: existen precisamente para no compilar. Están excluidos
del `tsconfig` del paquete y de la pasada normal de ESLint.

---

## 8. Núcleo del gemelo (`packages/domain`)

### 8.1 StateStore
Serie temporal del estado de la parcela. Cada `TwinSnapshot` contiene como mínimo:

- `plotId`, `campaignId`, `at` (epoch millis), `date` (`LocalDate`)
- `phenologicalStage`, `accumulatedGdd`
- `waterBalance` (agotamiento estimado del agua disponible del suelo)
- `healthIndex`, `lateBlightRisk`
- `confidence` (0–1) y `provenance`: de dónde vino cada entrada (clima manual,
  normales climatológicas, caché de red, diagnóstico de imagen) y con qué
  incertidumbre.

El StateStore debe poder **reconstruir el estado a partir de los snapshots**
aunque falten las imágenes originales.

### 8.2 BehaviorEngine
Los modelos agronómicos. Funciones puras y deterministas.

- **Fenología por grados-día (GDD):** acumulación térmica diaria con temperatura
  base para papa, mapeada a etapas: emergencia, desarrollo vegetativo,
  tuberización, llenado, madurez.
- **Balance hídrico simplificado FAO-56** (Allen et al., 1998, FAO Irrigation and
  Drainage Paper No. 56): ETc = ET0 × Kc, con Kc por etapa, aportes de lluvia y
  riego, y agotamiento del agua disponible. Como los datos meteorológicos serán
  escasos, **ET0 se estima con Hargreaves-Samani** (el método que FAO-56 admite
  cuando faltan datos), con radiación extraterrestre calculada a partir de la
  latitud y el día del año.
- **Riesgo de tizón tardío:** modelo de horas de humedad foliar y ventana térmica
  favorable a *P. infestans*. Evalúa modelos publicados (familia Wallin /
  BLITECAST, SimCast, y literatura del Centro Internacional de la Papa para los
  Andes), elige uno y regístralo en un ADR con su justificación.

**Coeficientes:** todos viven en `domain/src/agronomy/coefficients/potato.v1.json`,
validados por esquema. Cada entrada tiene un campo `source` **obligatorio**.
Si no conoces un valor con certeza, **no lo inventes**: márcalo como
`"source": "TODO: verificar fuente"`, y el BehaviorEngine debe **reducir la
confianza** del snapshot que lo use en lugar de fingir precisión. Cada fuente se
registra también en `docs/agronomy/sources.md`.

### 8.3 Simulator
Proyección a futuro y escenarios *what-if*. Debe responder al menos:

- "¿qué pasa si no riego en N días?"
- "¿qué pasa si aplico fungicida hoy?"
- "¿en qué fecha estimada cosecho?"

Simular una campaña completa de 120 días debe tardar milisegundos en Node.

### 8.4 Advisor
Reglas que traducen estado y simulación en recomendaciones **priorizadas**, cada
una con su justificación en lenguaje llano para el agricultor. Las
recomendaciones basadas en entradas de baja confianza bajan de prioridad y lo
dicen explícitamente.

### 8.5 Learning (`domain/src/learning`)
El entrenamiento local de la cabeza clasificadora vive en el dominio (ver
sección 10). Regresión softmax sobre embeddings, SGD por mini-lotes con
regularización L2, aleatoriedad por `RandomPort` con semilla. Determinista y
testeable en Node.

---

## 9. Clima (`WeatherPort`)

Riesgo R-01: sin datos climáticos el gemelo "simula bonito y miente". Por eso:

1. **`ManualWeatherAdapter`:** entrada **cualitativa**, no en milímetros.
   Preguntas simples al agricultor ("¿llovió ayer?" → nada / poco / mucho;
   "¿hizo frío en la noche?" → sí / no). El adaptador traduce a rangos con su
   incertidumbre.
2. **`NormalsWeatherAdapter`:** normales climatológicas de SENAMHI para la zona,
   embebidas en el bundle desde `data/climate/`. Las provee el equipo humano.
3. **`CachedNetworkWeatherAdapter`:** caché oportunista cuando hay red. Nunca
   requerido.

Cada dato climático lleva su procedencia hasta `TwinSnapshot.provenance` y afecta
`confidence`. Si las normales de SENAMHI no están disponibles, se usa un fixture
sintético **marcado como `SYNTHETIC`** y no se declara validación agronómica.

---

## 10. Inferencia en el borde

### Modelo dividido (ADR-0005)
ONNX Runtime Web no entrena. Por eso el modelo se divide en dos piezas:

- **Backbone:** MobileNetV3-Small cuantizado INT8, **congelado**, exportado a ONNX,
  cuya salida es el **embedding** (no los logits).
- **Cabeza clasificadora:** capa lineal float32 (pesos + sesgos) almacenada como
  artefacto separado, ejecutada **y entrenada** en TypeScript en `domain/learning`.

### Contrato del modelo
`ml/pipeline` produce, junto a los artefactos, un `model-contract.json` con:
versión, hash de cada artefacto, forma de entrada, normalización, dimensión del
embedding, orden de clases y umbral de rechazo calibrado. El cliente valida el
contrato al cargar el modelo y se niega a usar artefactos que no coincidan.

### Reglas
- `InferencePort` en el dominio; `OnnxInferenceAdapter` en infraestructura.
- Preprocesamiento y sesión ORT en un Web Worker, nunca en el hilo principal.
- Línea base: single-thread + SIMD. El multihilo WASM (requiere COOP/COEP) es una
  mejora detectada en runtime, no una dependencia.
- Por debajo del umbral de confianza, clase `rejected` con un mensaje claro
  ("No pude identificarlo, intenta otra foto"), nunca un diagnóstico falso.
- El diagnóstico alimenta el StateStore junto con clima y etapa; **nunca se
  muestra aislado**.

---

## 11. Aprendizaje federado sin nube

### Qué se federa
Únicamente los pesos de la **cabeza clasificadora**. El backbone nunca cambia en
el dispositivo.

### Entrenamiento local
Con las imágenes que el agricultor **confirmó o corrigió**. Se reserva un
conjunto de retención local (holdout) que nunca se usa para entrenar.

### Paquete de delta (`.agrotwin-delta`)
Encabezado JSON + cuerpo binario Float32. Campos mínimos: versión de formato,
versión del modelo base, número de muestras, norma de recorte aplicada,
parámetros de ruido, instante de creación, identificador efímero no vinculable
al usuario, y firma. Firma con **ECDSA P-256** vía Web Crypto (soportado en toda
la matriz de plataformas).

### Defensas obligatorias
- **Recorte de norma** (clipping) del delta antes de enviarlo.
- **Ruido gaussiano** para privacidad diferencial. Documenta σ y la norma de
  recorte. Reporta ε estimado con un contador estándar desde Python, sin prometer
  garantías formales que no se calculen.
- **Validación local:** un modelo agregado recibido solo se acepta si su
  desempeño sobre el holdout local no cae más de un umbral configurable.
- **Verificación de firma** en el hub y en el cliente.
- El hub es **un adversario posible, no una autoridad**.

### Consentimiento
Explícito, revocable, con modo **"solo recibir"** (el dispositivo acepta modelos
agregados pero nunca envía los suyos).

### Transporte
- **`LanHubTransport` (principal):** el hub sirve **la propia PWA** por HTTPS con
  certificado mkcert, de modo que PWA y API comparten origen: sin contenido
  mixto ni CORS. El certificado incluye en SAN tanto el nombre `.local` como la
  IP LAN del hub; se valida cuál resuelve en el dispositivo de referencia. El hub
  emite además los encabezados COOP/COEP.
- **`FileTransport` (respaldo obligatorio):** exportar e importar deltas y
  modelos agregados como archivo. Es el único camino cuando no hay hub, así que
  es requisito, no extra.

### Hub (`services/edge-hub`)
FastAPI con FedAvg ponderado por número de muestras, implementado directamente
(ADR-0006), registro versionado de modelos, verificación de firmas. Apagar el hub
**no degrada** la PWA.

---

## 12. Requisitos no funcionales

| ID | Requisito | Meta |
|----|-----------|------|
| RNF-01 | Latencia de diagnóstico (captura → resultado) | < 3 s en dispositivo de referencia |
| RNF-02 | App shell precacheado, **excluyendo runtime de inferencia y modelo** | < 8 MB |
| RNF-03 | Backbone ONNX INT8 | < 12 MB |
| RNF-04 | Pico de memoria de la pestaña | < 350 MB |
| RNF-05 | Arranque en frío tras instalación | < 3 s |
| RNF-06 | Cobertura de tests en `packages/domain` | > 85% (desde Fase 3) |
| RNF-07 | Funcionamiento sin red | 100% de casos de uso salvo sincronización |
| RNF-08 | PWA | Instalable y offline-ready según Lighthouse |
| RNF-09 | Accesibilidad | Cero violaciones críticas de axe en flujos principales |

Toda medición se registra en `docs/nfr/measurements.md` con fecha, dispositivo,
versión de Chrome, comando o procedimiento, y resultado. **Nunca registres una
medición que no se ejecutó.** Si un RNF no se cumple, lo reportas y propones
renegociarlo: no lo relajas en silencio.

---

## 13. Registro de ADRs

Un ADR por decisión, en `docs/adr/`, con estados `Propuesta`, `Aceptada`,
`Reemplazada por ADR-XXXX`.

| ADR | Decisión | Estado |
|-----|----------|--------|
| 0001 | PWA instalable en lugar de app Android nativa | Aceptada |
| 0002 | Arquitectura hexagonal con dominio TypeScript puro | Aceptada |
| 0003 | Hub local en LAN en lugar de P2P entre navegadores | Aceptada, condicionada al spike R-02 |
| 0004 | Python fuera del dispositivo de borde | Aceptada |
| 0005 | Backbone INT8 congelado + cabeza float32 entrenada en TypeScript | Aceptada |
| 0006 | FedAvg propio en FastAPI; Flower evaluado y descartado | Aceptada |

Nuevos ADR esperados: modelo de riesgo de tizón elegido (Fase 3), estrategia de
cifrado en reposo (Fase 7), y cualquier renegociación de RNF.

---

## 14. Registro de riesgos

| ID | Riesgo | Severidad | Fase | Estado |
|----|--------|-----------|------|--------|
| R-01 | Sin fuente fiable de datos climáticos | Crítica | 0→3 | Mitigación definida (sección 9) |
| R-02 | HTTPS en LAN / contenido mixto | Crítica | 0→6 | Spike verde en escritorio; **pendiente prueba en teléfono** |
| R-03 | ORT Web no entrena | Crítica | — | Resuelto por ADR-0005 |
| R-04 | Multihilo WASM exige COOP/COEP | Alta | 5, 7 | Línea base single-thread; el hub emite COOP/COEP y en escritorio habilita SAB |
| R-05 | Android 8–9 congelado en Chrome 138 | Alta | 0 | Resuelto en restricción 4 |
| R-06 | Peso de ONNX Runtime Web vs. RNF-02 | Alta | 5 | RNF-02 ya excluye el runtime; medir |
| R-07 | Desalojo de almacenamiento | Alta | 2, 7 | `storage.persist()` + retención + respaldo |
| R-08 | Origen de la clave de cifrado sin cuenta | Media | 7 | Clave no exportable + PIN opcional |
| R-09 | Demo federada sin ganancia estadística | Media | 6 | Reencuadrado en alcance |
| R-10 | Flower incompatible con navegador | Media | — | Resuelto por ADR-0006 |
| R-11 | Sesgo de fondo de PlantVillage | Media | 5 | PlantDoc + augmentación + evaluación de campo |
| R-12 | Coeficientes sin fuente | Media | 3 | Campo `source` obligatorio |
| R-13 | Lógica agronómica filtrándose a React | Baja | 0 | Mitigado: `pnpm test:arch` lo verifica en CI |

Actualiza la columna Estado al cerrar cada fase.

---

## 15. Plan de fases

Cada fase tiene un criterio de salida (**DoD**). Una fase no está terminada hasta
que cada punto del DoD se verificó ejecutando comandos o pruebas reales, y el
resultado se mostró.

### Fase 0 — Andamiaje

**Objetivo:** repositorio donde las reglas arquitectónicas se hacen cumplir solas.

**Entregables:**
- `git init`, `.gitignore`, `.editorconfig`, `.nvmrc`, `README.md`.
- pnpm workspaces vía Corepack; `packageManager` fijado.
- `tsconfig.base.json`; `tsconfig.json` por paquete; el de `domain` sin DOM ni
  tipos de Node.
- `eslint.config.js` (flat config) con boundaries y las restricciones de la
  sección 7.
- `vitest.config.ts` con `test.projects` (Vitest 5 retiró `vitest.workspace.ts`).
- `packages/domain/arch-fixtures/` y `scripts/arch-guards.mjs`: los DoD negativos
  de abajo se verifican ejecutándolos, no con una demostración manual.
- CI (`.github/workflows/ci.yml`): lint, typecheck, test, guardianes
  arquitectónicos, build. **Sin** umbral de cobertura todavía.
- `packages/domain/src/ports/ClockPort.ts`, `packages/domain/src/index.ts` y un
  test que confirme que el dominio compila y corre en Node.
- `packages/infrastructure` con `SystemClockAdapter`: la implementación mínima
  que prueba la dirección de dependencias `infrastructure → domain` de punta a
  punta. Sin un adaptador real, la regla de fronteras no está demostrada.
- `docs/adr/0000-template.md` y ADR 0001–0006.
- `docs/nfr/reference-device.md` con los datos del dispositivo de referencia (si
  el equipo aún no los dio, entrada bloqueante marcada `TODO`).
- **Spike R-02 (acotado en tiempo):** hub mínimo en FastAPI que sirva una página
  con service worker por HTTPS con mkcert. El equipo lo prueba en un teléfono
  real. Resultado en `docs/spikes/r02-https-lan.md`.

**DoD:**
- [ ] `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
- [ ] Demostrado: un `window` dentro de `domain` rompe la compilación.
- [ ] Demostrado: `Date.now()` y `Math.random()` dentro de `domain` rompen el lint.
- [ ] Demostrado: un import de `infrastructure` desde `domain` rompe el lint.
- [ ] Spike R-02 documentado con resultado real (o pendiente explícito de la
      prueba humana en teléfono).

### Fase 1 — Rebanada vertical

**Objetivo:** el camino completo de punta a punta, feo y sin estilo, para matar
los riesgos de integración temprano.

**Entregables:** crear parcela → tomar foto → `MockInferenceAdapter` devuelve un
resultado → se guarda un snapshot → se muestra en pantalla → todo funciona sin
red. PWA instalable con Workbox.

**Fuera de esta fase:** diseño visual, agronomía real, inferencia real.

**DoD:**
- [ ] Prueba E2E Playwright que ejecuta el ciclo completo con el contexto en
      modo offline.
- [ ] Lighthouse: PWA instalable.
- [ ] Probado en el dispositivo de referencia (acción humana; registrar resultado).

### Fase 2 — Dominio y persistencia

**Objetivo:** modelo de dominio sólido y persistencia robusta.

**Entregables:** entidades y value objects (`Plot`, `Campaign`, `Observation`,
`Diagnosis`, `TwinSnapshot`), branded types para IDs y unidades, `LocalDate`,
puertos de repositorio, `AgroTwinDb` en Dexie con mappers, `OpfsImageStore` con
política de retención (miniatura permanente + original purgable),
`navigator.storage.persist()` en el onboarding, casos de uso de parcelas y
campañas, exportación de respaldo a archivo.

**DoD:**
- [ ] Tests del dominio y de repositorios (con `fake-indexeddb`) en verde.
- [ ] Test que reconstruye el estado de una campaña sin imágenes originales.
- [ ] Ciclo exportar respaldo → borrar datos → importar respaldo probado.

### Fase 3 — BehaviorEngine *(la fase más importante; no la apures)*

**Prerrequisito humano:** normales climatológicas de SENAMHI en `data/climate/`.
Si faltan, trabaja con fixture `SYNTHETIC` y no declares validación.

**Entregables:** esquema de coeficientes con `source` obligatorio,
`potato.v1.json`, fenología por GDD, ET0 por Hargreaves-Samani, balance hídrico
FAO-56, modelo de riesgo de tizón tardío (con su ADR), los tres adaptadores de
`WeatherPort`, propagación de procedencia y confianza, `docs/agronomy/sources.md`.

**DoD:**
- [ ] Umbral de cobertura del 85% en `domain` activado en CI y cumplido.
- [ ] Tests contra ejemplos numéricos publicados (FAO-56 incluye ejemplos
      resueltos) con tolerancia explícita.
- [ ] Simulación de una campaña de 120 días en Node en milisegundos, con test.
- [ ] Cada coeficiente tiene fuente o está marcado `TODO` y reduce la confianza.
- [ ] Lista de coeficientes `TODO` reportada al equipo para revisión agronómica.

### Fase 4 — Simulator, Advisor y TwinBoard

**Entregables:** escenarios *what-if*, recomendaciones priorizadas con
justificación en lenguaje llano, panel del gemelo con línea de tiempo, design
system (botones grandes, alto contraste, íconos, `i18n/es.ts`).

**DoD:**
- [ ] Tests de cada escenario *what-if* del apartado 8.3.
- [ ] Tests del Advisor, incluida la degradación por baja confianza.
- [ ] Cero violaciones críticas de axe en los flujos principales.
- [ ] Revisión en el dispositivo de referencia (acción humana; registrar).

### Fase 5 — Inferencia real y pipeline ML

**Entregables en `ml/pipeline`:** preparación de PlantVillage + PlantDoc,
mitigación del sesgo de fondo (augmentación agresiva), fine-tuning de
MobileNetV3-Small, exportación dividida (backbone INT8 ONNX → embedding; cabeza
float32 aparte), calibración y umbral de rechazo, `model-contract.json`, reporte
de evaluación con matriz de confusión, F1 por clase y **diferencia
laboratorio → campo**.

**Entregables en el cliente:** `OnnxInferenceAdapter` en Web Worker,
inferencia de la cabeza en `domain/learning`, validación del contrato, sustitución
del mock en el composition root.

**DoD:**
- [ ] **Test de paridad:** la cabeza en TypeScript y la cabeza en PyTorch producen
      los mismos logits (tolerancia 1e-4) sobre embeddings de fixture.
- [ ] RNF-01, RNF-02, RNF-03 y RNF-04 medidos en el dispositivo de referencia y
      registrados. Si alguno falla, reportar y proponer; no relajar.
- [ ] Las métricas se reportan por clase, nunca solo accuracy global.

### Fase 6 — Aprendizaje federado

**Entregables:** entrenamiento local de la cabeza en `domain/learning`, holdout
local, empaquetado y firma de deltas, recorte y ruido, validación local de
modelos agregados, consentimiento y modo "solo recibir", `FileTransport`,
`LanHubTransport`, hub FastAPI con FedAvg ponderado, registro de modelos y
verificación de firmas, Docker Compose.

**DoD:**
- [ ] E2E con 3 contextos de navegador + hub: ciclo completo entrenar → enviar →
      agregar → recibir → validar → aceptar.
- [ ] Test: un delta con norma excesiva o firma inválida es rechazado.
- [ ] Test: un modelo agregado que degrada el holdout local es rechazado.
- [ ] Toda la suite E2E pasa con el hub apagado.
- [ ] Ciclo sneakernet completo probado.
- [ ] Utilidad reportada con y sin privacidad diferencial, con σ, norma de
      recorte y ε estimado.

### Fase 7 — Endurecimiento

**Entregables:** cifrado en reposo (`CryptoKey` no exportable en IndexedDB; PIN
opcional con PBKDF2 calibrado al dispositivo), `docs/threat-model.md` que diga
con honestidad qué se protege y qué no, manejo de desalojo de almacenamiento,
perfilado de rendimiento y memoria en el dispositivo de referencia.

**DoD:**
- [ ] Todos los RNF medidos y registrados en `measurements.md`.
- [ ] Modelo de amenazas escrito sin prometer más de lo que el cifrado da.
- [ ] Prueba de recuperación ante desalojo simulado.

### Fase 8 — Evidencia y cierre

**Entregables:** tabla final de RNF, estados finales de ADRs y riesgos, `README`
con pasos exactos de reproducción, guion de demostración para la sustentación,
sección de limitaciones conocidas y trabajo futuro.

**DoD:**
- [ ] Un miembro del equipo reproduce el sistema desde cero siguiendo solo el
      `README`.
- [ ] Guion de demo ensayado de principio a fin, con hub encendido y apagado.

---

## 16. Protocolo de trabajo por fase

Trabajamos **una fase a la vez**. Nunca empiezas la siguiente sin mi
confirmación explícita.

1. **Leer.** Relee este archivo y la Bitácora (sección 20).
2. **Planificar y detenerse.** Presenta: objetivo, archivos a crear o modificar,
   decisiones abiertas con alternativas y tu recomendación, riesgos que toca la
   fase, y acciones humanas que necesitarás. **Espera mi confirmación.**
3. **Implementar.** En una rama `fase/N-nombre`, con commits pequeños siguiendo
   Conventional Commits.
4. **Verificar.** Ejecuta cada punto del DoD y muestra la salida real.
5. **Cerrar y detenerse.** Reporte de cierre con: qué se hizo, qué quedó fuera,
   desviaciones respecto al plan y por qué, mediciones, estado de riesgos, y
   preguntas para la siguiente fase. Actualiza la Bitácora. Propón el merge a
   `main` y la etiqueta `fase-N`. **Espera mi confirmación.**

### Cuándo detenerte y preguntar (aunque estés a mitad de fase)

- Una decisión cambia el stack, un RNF o el alcance.
- Un coeficiente agronómico no tiene fuente verificable.
- Un punto del DoD no se puede cumplir.
- Necesitas una acción humana (teléfono real, datos, certificado).
- Encuentras una contradicción entre este documento y el código existente.

### Formato de comunicación

- Español en el chat.
- Si muestras código en el chat, muéstralo completo, con la ruta del archivo.
- Supuestos siempre explícitos.
- Si una decisión tiene alternativas razonables, preséntalas con su trade-off y
  recomienda una; no elijas en silencio.

---

## 17. Estándares de código y git

- TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- `any` prohibido salvo en adaptadores de terceros, con comentario que lo
  justifique.
- Errores del dominio como tipos explícitos en `domain/src/errors`, no strings.
- Un caso de uso por archivo en `domain/src/usecases`.
- Nombres descriptivos en inglés; sin abreviaturas crípticas.
- Cada componente del dominio se entrega con sus tests en la misma fase.
- Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`).
- Rama por fase; `main` siempre en verde.
- Python: `ruff` para lint y formato, `pytest`, tipado con anotaciones.

---

## 18. Prohibiciones

- Cualquier servicio en la nube, API remota o telemetría.
- Inventar coeficientes, mediciones, métricas o resultados.
- `Date.now()`, `new Date()` sin argumentos, `Math.random`, `crypto`, `console` o
  APIs de navegador dentro de `domain`.
- Lógica agronómica o estado del gemelo dentro de componentes React o Zustand.
- TensorFlow.js, Flower, Pyodide, o Python ejecutándose en el cliente.
- Archivos vacíos o carpetas creadas por adelantado.
- Desactivar, saltar o debilitar tests, reglas de lint o umbrales para que el CI
  pase.
- Marcar un punto del DoD como cumplido sin haberlo ejecutado.
- Avanzar de fase sin confirmación.
- Mostrar un diagnóstico aislado del estado del gemelo.

---

## 19. Tareas que solo el equipo humano puede hacer

Cuando una fase las necesite, pídelas explícitamente y no las simules.

- Datos del dispositivo de referencia (marca, modelo, Android, versión de Chrome
  desde `chrome://version`) y todas las mediciones en él.
- Instalar la CA de mkcert en los teléfonos de prueba.
- Conseguir las normales climatológicas de SENAMHI para la zona.
- Reunir fotos de campo reales para el conjunto de evaluación.
- Revisión agronómica de los coeficientes marcados `TODO`.
- Verificar las licencias de uso de los datasets.

---

## 20. Bitácora

> Mantenida por Claude Code. Actualizar al cerrar cada fase.

**Fase actual:** 0 — Andamiaje, **cerrada** el 2026-09-21: fusionada a `main` y
etiquetada `fase-0`. La Fase 1 no empieza sin confirmación explícita.

**Fase 0 — cierre (2026-09-21)**

Repositorio inicializado en `C:/Users/User/Desktop/AgroTwin-GemeloDigital`,
remoto `github.com/natoqa/AgroTwin-GemeloDigital`, rama `fase/0-andamiaje`.

DoD verificado ejecutando comandos:

- `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
- 13 tests en 3 archivos, en verde.
- Los cuatro guardianes arquitectónicos rechazan lo que deben (`pnpm test:arch`,
  4/4) y quedan en CI como regresión permanente, no como demostración única.
- Spike R-02 documentado con resultado real de escritorio y pendiente humano
  explícito para el teléfono.

**Decisiones cerradas:**

- ADR dividido en 0001–0006.
- pnpm vía Corepack.
- Modelo dividido: backbone INT8 congelado + cabeza float32 en TypeScript.
- FedAvg propio en FastAPI; sin Flower.
- Plataforma: Android 10+ objetivo; Android 8–9 con Chrome 138 congelado.
- Umbral de cobertura activo desde Fase 3.
- Restricción de tiempo: se prohíben `Date.now()` y `new Date()` sin argumentos,
  no el tipo `Date`.
- Entrada manual de clima cualitativa.
- **(Fase 0)** Fronteras entre capas con `eslint-plugin-boundaries`, reforzadas
  con `no-restricted-imports` para los especificadores de paquete del workspace.
- **(Fase 0)** Los DoD negativos se verifican con fixtures ejecutables
  (`pnpm test:arch`), no con una demostración manual de una sola vez.
- **(Fase 0)** `packages/app` no se creó: ningún entregable de la Fase 0 lo
  necesita. Nace en la Fase 1.
- **(Fase 0)** Licencia **MIT** para el código del repositorio (`LICENSE`). No
  cubre los datasets ni las normales de SENAMHI, que conservan la suya.
  Revisar si la UNT reclama una política de propiedad distinta para trabajos de
  curso; si así fuera, este es el único archivo que cambia.

**Auditoría del documento contra el código (2026-09-21).** Antes del merge se
compararon los archivos existentes con este documento. Cuatro discrepancias, las
cuatro resueltas corrigiendo el documento, no el código:

| # | Discrepancia | Resolución |
|---|---|---|
| D-1 | §15 pedía `vitest.workspace.ts`, retirado por Vitest 5 | §15 pide ahora `vitest.config.ts` con `test.projects` |
| D-2 | `scripts/arch-guards.mjs` y `arch-fixtures/` no aparecían en §6 ni §7 | Añadidos a ambas |
| D-3 | §5 exigía la última estable; TypeScript está en 6.x por el peer de `typescript-eslint` | §5 admite el tope por peer y obliga a registrarlo |
| D-4 | `packages/infrastructure` existía sin estar entre los entregables de §15 | Añadido a §15 con su justificación |

Se verificó además que `services/edge-hub/certs/` **no** está versionado: la
clave privada del hub no ha entrado nunca al repositorio.

**Pendientes humanos:**

- [ ] Dispositivo de referencia: `TODO` (marca, modelo, Android, Chrome).
      Bloquea el cierre de las fases 1, 4, 5 y 7.
      Ver `docs/nfr/reference-device.md`.
- [ ] Prueba del spike R-02 en teléfono real. Procedimiento y tabla vacía en
      `docs/spikes/r02-https-lan.md`. Mientras no se ejecute, ADR-0003 sigue
      condicionado.
- [ ] Normales climatológicas de SENAMHI (necesarias antes de Fase 3).
- [x] Licencia del repositorio: MIT (2026-09-21). Queda por verificar la
      licencia de uso de los datasets, que es una tarea distinta (§19).

**Desviaciones registradas:**

- **TypeScript 6.0.3 en lugar de 7.0.2.** La 7 es la etiqueta `latest`, pero
  `typescript-eslint@8.70.1` declara el peer `typescript >=4.8.4 <6.1.0`. Se fija
  la estable más alta que todo el toolchain admite. Revisar cuando
  `typescript-eslint` publique soporte para TypeScript 7.
- **`test.projects` en `vitest.config.ts` en lugar de `vitest.workspace.ts`.**
  Vitest 5 retiró el archivo de workspace. Ya no es una desviación: la sección 15
  se corrigió para pedir el archivo que existe.
- **Corepack con shims en directorio de usuario.** `corepack enable` falla con
  `EPERM` sobre la carpeta de instalación de Node sin privilegios de
  administrador; los shims se instalaron en `%APPDATA%/npm`, que ya estaba en el
  PATH. Documentado en el README.
