# ADR-0007 — Imágenes en OPFS, con índice en IndexedDB y retención decidida por el dominio

- **Estado:** Aceptada
- **Fecha:** 2026-09-22
- **Fase:** 2
- **Riesgos relacionados:** R-07

## Contexto

La Fase 1 guardó las fotos como blobs dentro de IndexedDB. Fue la decisión
correcta para una rebanada vertical y es la incorrecta para un teléfono que
acumulará una campaña entera de fotos:

1. Cada escritura de un blob grande paga el coste de *structured clone*, que en
   un dispositivo de 2 GB sin GPU (§3) se nota.
2. El riesgo R-07 —el navegador desaloja el almacenamiento— no se mitiga solo
   con `storage.persist()`: hace falta que los originales **no crezcan sin
   límite**. Y para decidir qué se borra hay que conocer el tamaño, la edad y la
   clase de cada imagen.
3. IndexedDB no puede responder esas preguntas sobre blobs sin leerlos.

Además, §7 exige que el dominio no toque APIs del navegador, y §8.1 exige que el
StateStore reconstruya el estado **aunque falten las imágenes originales**. Es
decir: borrar una foto tiene que ser una operación de dominio con consecuencias
de dominio, no un `delete` escondido en un adaptador.

## Alternativas consideradas

| Alternativa | A favor | En contra |
|---|---|---|
| Seguir con blobs en IndexedDB | Cero trabajo; ya funciona | Coste de clonado en cada escritura; consultar edad o tamaño obliga a leer bytes; §12 (RNF-04) se resiente |
| Todo en OPFS, sin índice | Un solo lugar para todo | Enumerar y medir exige abrir cada archivo; la retención pasaría a ser O(n) lecturas en el arranque |
| **OPFS para los bytes + IndexedDB como índice** | Las consultas (clase, tamaño, fecha) las responde un índice; los megabytes viven donde no cuestan clonado; un solo puerto para el dominio | Dos almacenes que pueden desincronizarse; hay que decidir el orden de escritura y de borrado |
| Política de retención dentro del adaptador | Menos piezas | La regla quedaría fuera del alcance de los tests de dominio y del umbral de cobertura (§7); sería disciplina, no herramienta |

## Decisión

Los bytes viven en **OPFS**, bajo la carpeta `images` de la raíz privada del
origen. IndexedDB guarda **solo el índice**: identificador, clase (`original` o
`thumbnail`), tipo de contenido, tamaño en bytes e instante de guardado.

La **política de retención vive en el dominio** (`RetentionPolicy` y el caso de
uso `ApplyImageRetention`). El adaptador obedece: lista originales, borra el que
se le indique. Valores por defecto: 30 días y 150 MB de originales.

El **orden de las dos escrituras es deliberado**:

- Al guardar: primero el archivo, después el índice. Un fallo intermedio deja
  bytes huérfanos, que es basura recuperable.
- Al purgar: primero la observación olvida la referencia, después se borran los
  bytes. Un fallo intermedio deja bytes huérfanos, nunca una observación
  apuntando a una foto que ya no existe.
- `deleteAll()` recorre **el directorio**, no el índice, para que un huérfano de
  un fallo anterior no sobreviva a un "borrar todo".

La **miniatura nunca se purga**. Es lo que mantiene reconocible una observación
cuya foto ya se fue, y pesa lo que el dispositivo puede permitirse siempre.

El `FileSystemDirectoryHandle` se **inyecta por constructor** en lugar de
obtenerse de `navigator.storage` dentro del adaptador, para que el
almacenamiento sea testeable fuera de un navegador. `OpfsImageStore.open()` es
el atajo que usa el composition root.

## Consecuencias

**Positivas.**

- La retención es una función pura y determinista, cubierta por tests de dominio
  y por el umbral de cobertura que entra en vigor en la Fase 3.
- El gemelo sigue reconstruyéndose sin originales: hay un test que borra las
  fotos de una campaña entera y comprueba que la línea de tiempo no cambia.
- Las consultas de retención y de respaldo son consultas indexadas, no lecturas
  de archivos.

**Negativas.**

- Dos almacenes que mantener consistentes, con el orden de operaciones anterior
  como única garantía.
- OPFS no existe en Node, así que los tests unitarios corren contra un doble en
  memoria del handle de directorio. La prueba de que OPFS real funciona es
  `packages/app/e2e/opfs.spec.ts`, que fotografía una parcela y mira dentro del
  sistema de archivos desde la página.
- Las miniaturas dependen de `createImageBitmap` y `OffscreenCanvas`. Donde no
  estén, la observación se guarda igual y se queda sin miniatura.

**Qué invalidaría esta decisión.** Que la medición en el dispositivo de
referencia (Fases 5 y 7) muestre que OPFS es más lento que IndexedDB para el
tamaño de foto real, o que el desalojo afecte a OPFS y a IndexedDB de forma
distinta, lo que obligaría a repensar dónde vive cada cosa.
