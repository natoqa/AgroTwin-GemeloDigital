# ADR-0008 — Formato de respaldo: un JSON versionado con miniaturas, sin originales

- **Estado:** Aceptada
- **Fecha:** 2026-09-22
- **Fase:** 2
- **Riesgos relacionados:** R-07

## Contexto

El sistema no tiene nube (§3). Eso significa que **no hay ninguna otra copia**
de lo que el gemelo sabe: si el teléfono se pierde, se rompe o el navegador
desaloja el almacenamiento, la campaña desaparece. El respaldo exportable a
archivo no es una función extra; es la única mitigación real de R-07 que
sobrevive al dispositivo.

El archivo tiene que poder salir del teléfono por los medios que un agricultor
tiene a mano: un cable, una memoria, el gestor de archivos de Android. Y tiene
que poder restaurarse en una versión futura de la aplicación, cuando el esquema
de la base de datos ya haya cambiado.

## Alternativas consideradas

| Alternativa | A favor | En contra |
|---|---|---|
| **JSON versionado con miniaturas en base64** | Inspeccionable por un humano; probable en Node sin navegador; sin dependencias nuevas | base64 añade ~33% sobre las miniaturas |
| Contenedor binario (cabecera JSON + cuerpo de bytes), como `.agrotwin-delta` de §11 | Más compacto; coherente con la Fase 6 | Más código y más superficie de error para un entregable que todavía no lo necesita |
| ZIP | Compacto y estándar | Obliga a una dependencia nueva en el cliente, contra RNF-02 |
| Incluir también las fotos originales | Respaldo completo | Cientos de MB: un archivo que nadie puede copiar no es un respaldo |
| Reutilizar los mappers de persistencia | Menos duplicación | Ataría el formato del archivo al esquema de la base; un cambio de índice rompería respaldos viejos |

## Decisión

El respaldo es **un archivo JSON** con un campo `format` (`agrotwin-backup`) y un
`formatVersion` entero. Contiene parcelas, campañas, observaciones, snapshots y
las **miniaturas en base64**. Los originales quedan fuera.

El mapeo a y desde el archivo es **independiente del mapeo de persistencia**, y
esa duplicación es el precio de que un archivo escrito la campaña pasada siga
restaurándose después de una migración de esquema.

La importación es **todo o nada**: se valida el archivo completo —formato,
versión, tipos y que todas las referencias resuelvan— antes de escribir la
primera fila. Un respaldo a medias sería peor que uno rechazado, porque
parecería correcto.

La importación es **idempotente**: se escribe por identificador, así que
restaurar dos veces deja el mismo estado.

El **nombre del archivo lo decide la capa de aplicación**, no el dominio: es
texto que ve el usuario y por §5 va en español.

## Consecuencias

**Positivas.**

- Un archivo que se puede abrir, mirar y diferenciar con herramientas comunes,
  lo que importa en un proyecto de curso que hay que sustentar.
- El ciclo exportar → borrar → importar está probado en el dominio con dobles y
  en Playwright con una descarga y un selector de archivos reales.
- El versionado deja la puerta abierta al contenedor binario en la Fase 6 sin
  romper los archivos ya escritos.

**Negativas.**

- Las miniaturas ocupan ~33% más de lo necesario. Con ~8 KB por miniatura, mil
  observaciones dan del orden de 10 MB: aceptable hoy, y la razón por la que el
  formato está versionado.
- Restaurar en un teléfono nuevo no devuelve las fotos originales, solo las
  miniaturas. Es una pérdida declarada, no un descubrimiento.
- El validador está escrito a mano porque el dominio no lleva librería de
  validación; cada campo nuevo del formato hay que añadirlo también ahí.

**Qué invalidaría esta decisión.** Que el tamaño del archivo impida la copia en
el dispositivo de referencia, o que la Fase 6 necesite compartir el contenedor
binario de los deltas también para los respaldos.
