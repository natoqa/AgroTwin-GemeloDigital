# ADR-0002 — Arquitectura hexagonal con dominio TypeScript puro

- **Estado:** Aceptada
- **Fecha:** 2026-09-21
- **Fase:** 0
- **Riesgos relacionados:** R-13

## Contexto

La tesis es el motor agronómico, no el clasificador (CLAUDE.md §2). Si la lógica
de fenología, balance hídrico y riesgo de tizón se mezcla con componentes React,
deja de ser testeable de forma determinista y deja de ser defendible como
contribución. El riesgo R-13 describe exactamente esa filtración.

Además, el dominio debe poder simular una campaña de 120 días en Node en
milisegundos (§8.3), lo que exige que no dependa de ninguna API de navegador.

## Alternativas consideradas

| Alternativa | A favor | En contra |
|---|---|---|
| Capas por convención, revisadas en code review | Cero configuración | La disciplina se erosiona; R-13 se materializa sin que nadie lo note |
| Hexagonal con puertos y adaptadores, verificada por herramientas | La violación no compila ni pasa el lint; el dominio se prueba en Node sin navegador | Más configuración inicial; obliga a definir puertos antes de tener adaptadores |

## Decisión

Tres paquetes con dirección de dependencia estricta `app → infrastructure →
domain`. El paquete `domain` es TypeScript puro: su tsconfig declara
`"lib": ["ES2022"]` y `"types": []`, sin DOM y sin tipos de Node. Los puertos se
definen en el dominio; sus implementaciones, en infraestructura. El único lugar
donde ambos se conocen es el composition root de la aplicación.

## Consecuencias

**Positivas.** Un `window` dentro del dominio no compila. `Date.now()`,
`new Date()` sin argumentos, `Math.random`, el global `crypto` y `console`
dentro del dominio no pasan el lint. Un import de infraestructura desde el
dominio no pasa el lint. Las cuatro cosas se verifican en CI con
`pnpm test:arch`, no en revisión humana.

**Negativas.** Cada capacidad externa exige definir un puerto antes de usarla,
lo que añade ceremonia incluso para algo tan pequeño como leer el reloj.

**Qué invalidaría esta decisión.** Nada previsto. Cambiarla implicaría rehacer
el argumento central del trabajo.
