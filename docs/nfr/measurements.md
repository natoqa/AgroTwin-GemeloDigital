# Mediciones de RNF

> Cada fila registra una medición **ejecutada**. CLAUDE.md §12 prohíbe anotar
> aquí un número que no se obtuvo corriendo algo. Si una celda dice `TODO`, es
> que la medición no se ha hecho, no que salió bien.

## Dispositivos

| Rol | Equipo | Uso válido |
|---|---|---|
| Desarrollo | Máquina Windows 11 Pro 10.0.26200, Chrome 153.0.0.0 | Verificar que algo funciona. Ninguna meta de §12 se valida aquí. |
| Desarrollo (teléfono) | Xiaomi Redmi Note 14, gama media | Instalación, flujo, accesibilidad. **No** mediciones de RNF. |
| **Referencia** | `TODO` — Android 10+, ~2 GB RAM | El único que valida RNF-01, 02, 03, 04 y 05. |

Ver [`reference-device.md`](./reference-device.md).

---

## Fase 1 — 2026-09-21

### App shell (RNF-02: < 8 MB, excluyendo runtime de inferencia y modelo)

- **Procedimiento:** `pnpm build`, y lectura del manifiesto de precache que
  emite `vite-plugin-pwa`, más el tamaño en disco de `packages/app/dist`.
- **Ejecutado en:** máquina de desarrollo.

| Métrica | Valor |
|---|---|
| Precache del service worker | **331.56 KiB** en 11 entradas |
| `dist/` completo | 348.31 KiB |
| `assets/index-*.js` | 318.4 KiB (103.65 KiB con gzip) |
| `assets/index-*.css` | 5.8 KiB |
| `workbox-*.js` | 14.8 KiB |

**Resultado: RNF-02 se cumple con enorme margen — 331.56 KiB frente a 8 MB.**

Advertencia honesta: este número es el de la Fase 1. Todavía no entran ONNX
Runtime Web ni el modelo (que RNF-02 excluye, y RNF-03 acota por separado), ni
el design system de la Fase 4. El margen de hoy no garantiza el de la Fase 5.

### Lighthouse

- **Procedimiento:** `pnpm --filter @agrotwin/app build`, servir `dist` con
  `vite preview --port 4173`, y
  `lighthouse http://localhost:4173/ --only-categories=performance,accessibility,best-practices --form-factor=mobile --throttling-method=simulate --chrome-flags="--headless=new"`.
- **Ejecutado en:** máquina de desarrollo, Lighthouse 13.5.0, Chrome 153.0.0.0,
  emulación móvil.

| Categoría | Puntuación |
|---|---|
| Rendimiento | 99 |
| Accesibilidad | **100** |
| Buenas prácticas | 100 |

| Métrica | Valor |
|---|---|
| First Contentful Paint | 1.5 s |
| Largest Contentful Paint | 1.7 s |
| Total Blocking Time | 0 ms |
| Cumulative Layout Shift | 0 |

Estas cifras son de **escritorio con emulación móvil**. No sustituyen a RNF-01
ni a RNF-05, que se miden en el dispositivo de referencia y siguen pendientes.

La accesibilidad llegó a 100 tras añadir un landmark `<main>`, que la primera
pasada marcó como ausente (96). El único hallazgo restante fue
`seo/robots-txt`, que no se corrige: una PWA sin nube ni rastreadores no tiene
nada que decirle a un robots.txt.

### Instalabilidad de la PWA

**Desviación del DoD, documentada.** La Fase 1 pide «Lighthouse: PWA
instalable». **Lighthouse 12 retiró la categoría PWA**, y la 13.5.0 ya no
ofrece ni la categoría ni la auditoría `installable-manifest`:

```
Available categories: accessibility, best-practices, performance, seo, agentic-browsing
```

Sustituto implementado: `packages/app/e2e/installable.spec.ts`, que comprueba
mecánicamente los criterios que Chrome aplica, en cada ejecución de CI.

| Criterio | Resultado |
|---|---|
| Manifiesto enlazado y servido | ✅ |
| `display: standalone`, `start_url: /`, `lang: es` | ✅ |
| `name` y `short_name` presentes | ✅ |
| Iconos 192×192 y 512×512 declarados | ✅ |
| Icono `maskable` declarado | ✅ |
| Cada icono se sirve de verdad, con `image/png` | ✅ |
| Service worker en estado `activated` | ✅ |
| `beforeinstallprompt` disparado | ❌ **no concluyente** |

El último no es un fallo del sitio: el Chromium de Playwright no ofrece el
prompt de instalación ni en modo headless ni con `--headed`. **El veredicto de
Chrome solo puede darlo un teléfono real**, y esa comprobación está abajo.

### Funcionamiento sin red (RNF-07)

- **Procedimiento:** `pnpm test:e2e`. La prueba carga la app, espera a que el
  service worker se active y termine de precachear el shell, **apaga el
  servidor HTTP**, recarga, y ejecuta el ciclo completo con el contexto del
  navegador además en modo offline.
- **Resultado:** 3/3 en verde.

Nota de método: `context.setOffline()` de Playwright **no sirve** para esto. En
Chromium corta la petición por debajo del service worker, de modo que el worker
nunca llega a responder y la prueba fallaría aunque la PWA fuese perfecta. Por
eso el servidor se apaga de verdad, que además es una simulación más fiel.

---

## Fase 2 — 2026-09-22

### App shell (RNF-02: < 8 MB, excluyendo runtime de inferencia y modelo)

- **Procedimiento:** `pnpm build`, y lectura del manifiesto de precache que
  emite `vite-plugin-pwa`.
- **Ejecutado en:** máquina de desarrollo.

| Métrica | Fase 1 | Fase 2 |
|---|---|---|
| Precache del service worker | 331.56 KiB | **363.33 KiB** en 11 entradas |
| `assets/index-*.js` | 318.4 KiB | 358.49 KiB (111.98 KiB con gzip) |
| `assets/index-*.css` | 5.8 KiB | 5.95 KiB |

**Resultado: RNF-02 se sigue cumpliendo — 363.33 KiB frente a 8 MB.** El
crecimiento de 31.77 KiB es el de las pantallas de campañas, parcela y
respaldo. Sigue sin entrar ONNX Runtime Web ni el modelo.

### Funcionamiento sin red (RNF-07)

- **Procedimiento:** `pnpm test:e2e`, igual que en la Fase 1: la prueba apaga
  el servidor HTTP y recarga.
- **Resultado:** **10/10 en verde**, de 4 que había en la Fase 1. Las nuevas
  cubren el ciclo de respaldo, el rechazo de un archivo que no es un respaldo,
  el borrado total y OPFS real.

### OPFS y miniaturas en un navegador de verdad

- **Procedimiento:** `packages/app/e2e/opfs.spec.ts` fotografía una parcela y
  después lee el sistema de archivos privado del origen desde la página.
- **Ejecutado en:** Chromium de Playwright 1.63.0, perfil `Pixel 7`.

| Comprobación | Resultado |
|---|---|
| Tras una foto, `images/` contiene 2 archivos (original + miniatura) | ✅ |
| Tras «Borrar todo», `images/` queda vacío | ✅ |

Esto es lo que los tests unitarios **no** pueden decir: corren contra un doble
en memoria del handle de directorio, porque Node no tiene OPFS (ADR-0007).

### Lo que esta fase **no** midió

- RNF-01, RNF-03, RNF-04 y RNF-05: siguen dependiendo del dispositivo de
  referencia y de la inferencia real (Fases 5 y 7).
- Accesibilidad (RNF-09): la Fase 1 dejó Lighthouse en 100, y las pantallas
  nuevas llevan `label` en cada campo, pero **no se volvió a medir**. La
  auditoría con `@axe-core/playwright` es entregable de la Fase 4.

---

## Fase 3 — 2026-09-22

### Cobertura del dominio (RNF-06: > 85%, activo desde esta fase)

- **Procedimiento:** `pnpm test`, que desde esta fase corre con `--coverage`.
  El umbral está en `vitest.config.ts` y el job `verify` del CI lo ejecuta.
- **Métrica gateada:** las **cuatro**. RNF-06 no dice sobre cuál se mide, y
  gatear solo las tres fáciles habría dejado el umbral como decoración.

| Métrica | Fase 2 | Fase 3 | Umbral |
|---|---|---|---|
| Sentencias | 96.14% | **97.30%** | 85% |
| Ramas | 79.06% | **86.73%** | 85% |
| Funciones | 99.07% | **98.80%** | 85% |
| Líneas | 96.41% | **97.71%** | 85% |

**Comprobado que el umbral muerde:** subiéndolo temporalmente a 99% en ramas,
la suite falla con `ERROR: Coverage for branches (86.73%) does not meet global
threshold (99%)`. No es un umbral decorativo.

### Simulación de campaña (CLAUDE.md §8.3)

- **Procedimiento:** test en `packages/domain/src/twin/BehaviorEngine.test.ts`,
  que mide una campaña de 120 días y falla si se pasa del presupuesto.
- **Presupuesto:** 50 ms. Es deliberadamente generoso: protege contra un O(n²)
  accidental, no contra una laptop lenta.
- **Resultado:** en verde. Medido en la máquina de desarrollo, no en el
  dispositivo de referencia.

### Suite

| Métrica | Fase 2 | Fase 3 |
|---|---|---|
| Tests unitarios | 126 en 21 archivos | **295 en 36 archivos** |
| E2E de Playwright | 10 | **13** |
| Guardianes arquitectónicos | 4/4 | 4/4 |

### App shell (RNF-02: < 8 MB)

| Métrica | Fase 2 | Fase 3 |
|---|---|---|
| Precache del service worker | 363.37 KiB | **387.89 KiB** |

**RNF-02 se sigue cumpliendo.** El crecimiento son las pantallas de clima y
estado agronómico, más el fixture climático embebido.

### Lo que esta fase **no** midió

- RNF-01, RNF-03, RNF-04 y RNF-05: siguen dependiendo del dispositivo de
  referencia y de la inferencia real.
- Accesibilidad (RNF-09): sin volver a medir; es entregable de la Fase 4.
- **Nada agronómico está validado en campo.** Lo verificado es que el código
  reproduce ecuaciones y tablas publicadas. Con normales sintéticas, ningún
  número que salga del motor describe una parcela real.

---

## Fase 4 — 2026-09-28

### Accesibilidad (RNF-09: cero violaciones críticas de axe en flujos principales)

- **Procedimiento:** `pnpm --filter @agrotwin/app test:e2e`, spec
  `e2e/accessibility.spec.ts`, con `@axe-core/playwright` 4.13.0 (axe-core
  4.13.0), perfil Pixel 7 de Playwright, contra el build de producción.
- **Criterio:** la prueba falla con violaciones **críticas o serias**; más
  estricto que RNF-09 (decisión D4 de la Fase 4).
- **Pantallas analizadas, cada una con datos:** lista de parcelas vacía y con
  parcela; TwinBoard con recomendaciones; TwinBoard con un escenario resuelto y
  un riego anotado; captura; TwinBoard con foto; preguntas de clima
  respondidas; lista de campañas; datos de la parcela; respaldo.
- **Ejecutado en:** máquina de desarrollo (Chromium de Playwright).

**Resultado: 0 violaciones críticas y 0 serias en las 10 pantallas analizadas.**
Queda la revisión humana en el teléfono (DoD de la Fase 4): axe no juzga si un
texto se lee bajo el sol ni si el agricultor entiende una frase.

### Contraste de los tokens de diseño

- **Procedimiento:** razón de contraste WCAG 2.x calculada con un script
  (luminancia relativa) sobre cada par texto/fondo de `src/index.css`.

| Par | Razón |
|---|---|
| Texto sobre fondo de página | 16.20 |
| Texto secundario sobre fondo de página | 9.46 |
| «Ahora» sobre su fondo | 7.80 |
| «Pronto» sobre su fondo | 7.10 |
| «Para saber» sobre su fondo | 7.51 |
| Blanco sobre botón principal | 8.09 |
| Borde de control sobre fondo de página | 4.65 |

Todo el texto supera 7:1 (AAA); los bordes de control superan 3:1.

### App shell (RNF-02: < 8 MB)

| Métrica | Valor |
|---|---|
| Precache del service worker | **433.02 KiB** en 11 entradas |
| `dist/` completo | 474 KiB (en disco) |
| `assets/index-*.js` | 423.43 kB (131.14 kB con gzip) |
| `assets/index-*.css` | 12.36 kB |

**Resultado: RNF-02 se cumple — 433.02 KiB frente a 8 MB.** Crece 45 KiB
respecto a la Fase 3 (design system, íconos, textos y los tres módulos nuevos
del dominio).

### Suite

- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:arch && pnpm build`
  en verde, **tras borrar todos los `dist/` y `*.tsbuildinfo`**.
- **371 tests unitarios en 41 archivos** y **18 E2E**.
- Cobertura del dominio: sentencias 98.13%, ramas 90.21%, funciones 99.56%,
  líneas 98.51%.
- Simulación de 120 días con un escenario *what-if*: dentro del presupuesto de
  50 ms del test (`Simulator.test.ts`).

### Lo que esta fase **no** midió

- La revisión en el dispositivo de referencia, que no existe todavía, ni en el
  Redmi Note 14: es acción humana y está pendiente.
- Legibilidad real bajo el sol. El contraste calculado es una condición
  necesaria, no una prueba.

---

## Fase 5 — 2026-09-28

### RNF-03: backbone ONNX < 12 MB

- **Procedimiento:** tamaño en disco del artefacto entregado; el mismo número
  está en `model-contract.json`. Un tamaño de archivo no depende del
  dispositivo, así que esta medición **sí** valida el RNF.

| Artefacto | Bytes |
|---|---|
| `backbone.int8.onnx` (pesos INT8, activaciones float32) | **1 637 991** (1.56 MiB) |
| `head.json` | 68 840 |

**Resultado: RNF-03 se cumple — 1.56 MiB frente a 12 MB.**

### RNF-02: app shell < 8 MB, excluyendo runtime de inferencia y modelo

| Métrica | Valor |
|---|---|
| Precache del service worker | **515.51 KiB** en 12 entradas |
| `assets/index-*.js` (hilo principal) | 435.03 kB (134.73 kB con gzip) |
| `assets/embedding.worker-*.js` (worker, precacheado) | 72.82 kB |
| WASM de ONNX Runtime, **fuera** del precache (D1) | 14 239.89 kB (3 736.91 kB con gzip) |

**Resultado: RNF-02 se cumple — 515.51 KiB.** El WASM y el modelo se descargan
en el paso explícito de D1 y viven en su propia caché (`agrotwin-model-v1`).

### RNF-01: latencia captura → resultado — **indicativa, no valida el RNF**

- **Procedimiento:** `node packages/app/scripts/measure-latency.mts <factor>`
  contra el build de producción, Chromium de Playwright con perfil Pixel 7 y
  CPU limitada por el protocolo de DevTools. Cinco fotos seguidas; el modelo
  ya descargado y arrancado.
- **Ejecutado en:** máquina de desarrollo. **No** es el dispositivo de
  referencia: la limitación de CPU por software no reproduce la memoria, la
  caché ni el WASM de un teléfono de 2 GB.

| Limitación de CPU | Primera foto | Mediana de las siguientes |
|---|---|---|
| ×1 | 108 ms | 97 ms |
| ×4 | 185 ms | 126 ms |
| ×6 | 297 ms | 256 ms |

Holgura de un orden de magnitud frente a los 3 s, **en escritorio**. Queda
pendiente la medición en el dispositivo de referencia.

### RNF-04: memoria — **no medida**

No hay una forma honesta de medir la memoria de una pestaña de Android desde
Playwright en escritorio. Pendiente del dispositivo de referencia
(`chrome://inspect` o `dumpsys meminfo`).

### Paridad de la cabeza (DoD de la Fase 5)

- **Procedimiento:** `packages/domain/src/learning/learning.test.ts` contra el
  fixture que escribe el pipeline: 8 embeddings del backbone INT8 entregado
  (4 de laboratorio, 4 de campo) y los logits de la cabeza de PyTorch.
- **Resultado:** diferencia máxima **2.9 × 10⁻⁶** en los 8 casos, frente a la
  tolerancia de 1 × 10⁻⁴ (el test falla si se supera).

### Calidad del modelo (detalle en `ml/pipeline/reports/evaluation.md`)

| Prueba | F1 de los tizones | Fotos aceptadas | Aciertos entre las aceptadas |
|---|---|---|---|
| Laboratorio (PlantVillage, 323) | 0.993 | 92.9 % | 99.7 % |
| Campo (PlantDoc, 63) | 0.629 | **28.6 %** | **77.8 %** |

**El objetivo de D2 (90 % de aciertos entre las aceptadas) no se alcanza con
fotos de campo.** Ver el cierre de la Fase 5 en CLAUDE.md.

### Suite

- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:arch && pnpm build`
  en verde tras borrar `dist/` y `*.tsbuildinfo`.
- **412 tests unitarios en 43 archivos**, **18 E2E** (todos con inferencia
  real; el ciclo sin red incluido), **13 tests de pytest**.
- Cobertura del dominio: sentencias 98.08%, ramas 90.59%, funciones 99.23%,
  líneas 98.38%.

---

## Pendiente: prueba en teléfono (acción humana)

CLAUDE.md §19 la asigna al equipo y §16 prohíbe simularla.

### Procedimiento

1. En la máquina de desarrollo, con el teléfono en la misma red Wi-Fi:
   `pnpm --filter @agrotwin/app build`
   `pnpm --filter @agrotwin/app exec vite preview --host --port 4173`
2. Abrir en Chrome del teléfono la URL que imprime (IP LAN, puerto 4173).
   *Ojo:* sin HTTPS no habrá service worker sobre IP LAN. Para la prueba
   completa, servir el `dist` desde el hub del spike R-02, que ya tiene
   certificado mkcert.
3. Instalar la app: menú de Chrome → *Instalar aplicación* / *Añadir a pantalla
   de inicio*.
4. Abrirla desde el icono, con el **modo avión activado**.
5. Completar el ciclo: crear parcela → empezar campaña → tomar foto → ver el
   estado del gemelo.
6. Fase 2: guardar una copia, borrar todo, y restaurarla desde el archivo.
7. Fase 4: al aire libre, leer el TwinBoard; tocar «Regué hoy»; hacer las tres
   preguntas «¿Y si…?»; pedir a alguien que no conoce la app que lea una
   recomendación y diga qué haría.

### Tabla a rellenar

| Comprobación | Redmi Note 14 | Dispositivo de referencia |
|---|---|---|
| Chrome ofrece instalar | `TODO` | `TODO` |
| Arranca desde el icono, sin barra de navegador | `TODO` | `TODO` |
| Funciona con modo avión | `TODO` | `TODO` |
| Crear parcela | `TODO` | `TODO` |
| Empezar una campaña con la fecha de siembra | `TODO` | `TODO` |
| Tomar foto (cámara del sistema) | `TODO` | `TODO` |
| Aparece el estado del gemelo | `TODO` | `TODO` |
| Sobrevive a cerrar y reabrir | `TODO` | `TODO` |
| Chrome concede almacenamiento persistente | `TODO` | `TODO` |
| Guardar copia: el archivo llega a Descargas | `TODO` | `TODO` |
| Restaurar copia desde el archivo | `TODO` | `TODO` |
| Fase 4: el TwinBoard se lee al sol, sin sombra | `TODO` | `TODO` |
| Fase 4: los botones se aciertan con el pulgar, con una mano | `TODO` | `TODO` |
| Fase 4: «Regué hoy» aparece en el historial | `TODO` | `TODO` |
| Fase 4: las tres preguntas «¿Y si…?» responden | `TODO` | `TODO` |
| Fase 4: un agricultor entiende una recomendación sin ayuda | `TODO` | `TODO` |
| RNF-05: arranque en frío < 3 s | no aplica (gama media) | `TODO` |

- **Fecha:** `TODO`
- **Android / Chrome:** `TODO`
