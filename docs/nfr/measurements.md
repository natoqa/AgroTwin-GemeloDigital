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
| RNF-05: arranque en frío < 3 s | no aplica (gama media) | `TODO` |

- **Fecha:** `TODO`
- **Android / Chrome:** `TODO`
