# ADR-0010 — Simulator y Advisor sobre el mismo motor, sin agronomía propia

- **Estado:** Aceptada
- **Fecha:** 2026-09-28
- **Fase:** 4
- **Riesgos relacionados:** R-01, R-12, R-13

## Contexto

CLAUDE.md §8.3 pide un Simulator que responda tres preguntas («¿y si no riego
en N días?», «¿y si aplico fungicida hoy?», «¿cuándo cosecho?») y §8.4 un
Advisor que traduzca estado y simulación en recomendaciones priorizadas, que
bajen de prioridad y lo digan cuando sus entradas son débiles.

Tres hechos condicionan el diseño:

1. El futuro no se mide. Lo único que este dispositivo sabe de los días que
   vienen son las normales climatológicas, y hoy esas normales son un fixture
   `SYNTHETIC` (R-01).
2. Dos de las tres preguntas dependen de datos que nadie ha dado: los umbrales
   de tiempo térmico (fenología, R-12) y cuántos días protege un fungicida.
3. El riesgo de tizón está apagado desde la Fase 3 (ADR-0009): ninguna fuente
   mide horas de hoja mojada.

## Alternativas consideradas

| Alternativa | A favor | En contra |
|---|---|---|
| **Cada escenario vuelve a correr el BehaviorEngine** sobre pasado + futuro proyectado, con una decisión cambiada | Un escenario no puede contradecir al panel sobre el presente; no hay segundo modelo que mantener; determinista | Recalcula la campaña entera por pregunta (medido: milisegundos) |
| Modelos de escenario propios (p. ej. una curva de secado simplificada) | Más rápidos, más «explicables» | Dos modelos del mismo suelo que pueden divergir; agronomía nueva sin fuente |
| Decaimiento de confianza por horizonte (p. ej. −5 %/día) | Refleja que el futuro es incierto | Es un número inventado; la confianza de las normales ya dice cuánto valen esos días |
| Advisor con umbrales agronómicos propios | Recomendaciones más finas | Duplica lo que ya dicen FAO-56 y BLITECAST, sin fuente |

## Decisión

**El Simulator no tiene modelo propio: es el BehaviorEngine corrido otra vez**
sobre la historia de la campaña más los días proyectados, con un riego o una
aplicación de fungicida añadidos. Los días proyectados salen del `WeatherPort`
(normales) y llevan su procedencia y su confianza; no se inventa un
decaimiento adicional por horizonte.

**El Advisor no añade agronomía:** «sed» es el agua fácilmente disponible de
FAO-56, «aplicar» es el umbral de BLITECAST, «cosecha cerca» es la fecha del
Simulator. Lo que añade es **prioridad y honestidad**: urgencia (ahora, pronto,
para saber), luego confianza; por debajo de 0.6 una recomendación **baja un
nivel, lo dice y nombra por qué** (clima sintético o de año típico, respuestas
cualitativas, coeficientes sin revisar, proyección, foto dudosa). Nunca se
descarta.

Decisiones de modelado declaradas, cada una con su coeficiente:

- **Riego** (D3): el agricultor dice *que* regó, no cuánto. Cada riego repone
  `irrigationRefillFraction` (1.0, provisional) del agotamiento; cuesta
  confianza desde el primer riego y solo se exige si hubo riegos.
- **Fungicida:** el día de la aplicación la severidad de Wallin acumulada
  vuelve a cero y no suma durante `fungicideProtectionDays` días. Es una
  simplificación, no BLITECAST; el coeficiente es `null`, así que **el
  escenario se niega a responder** (y además falta la humedad foliar).
- **Cosecha** (D1): por tiempo térmico cuando exista `gddToMaturity`; mientras
  tanto, siembra + las cuatro etapas de FAO-56 (130 días, provisionales,
  confianza 0.6⁴), presentada como «fecha aproximada».

El texto para el agricultor no vive en el dominio: el Advisor y el Simulator
devuelven códigos y hechos; `packages/app/src/i18n/es.ts` los convierte en
frases.

## Consecuencias

**Positivas.** Una sola fuente de verdad agronómica. Cuando lleguen las
normales de SENAMHI, los umbrales térmicos o la duración del fungicida, los
escenarios y las recomendaciones mejoran sin tocar código. Todo es probable en
Node y determinista.

**Negativas.** Hoy casi todo lo que el Advisor dice sobre agua sale con «poca
certeza» y degradado de nivel: es verdad, pero hace el panel menos contundente.
El escenario de fungicida está apagado por partida doble. La fecha de cosecha
ignora el clima del año.

**Qué invalidaría esta decisión.** Que recalcular la campaña por escenario deje
de caber en milisegundos en el dispositivo de referencia, o que la revisión
agronómica aporte un modelo de escenario con fuente que el BehaviorEngine no
pueda expresar.
