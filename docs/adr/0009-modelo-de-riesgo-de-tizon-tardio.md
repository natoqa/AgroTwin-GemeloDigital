# ADR-0009 — Modelo de riesgo de tizón tardío: Wallin (1962), con los datos declarados como el eslabón débil

- **Estado:** Aceptada
- **Fecha:** 2026-09-22
- **Fase:** 3
- **Riesgos relacionados:** R-01, R-12

## Contexto

CLAUDE.md §8.2 pide un modelo de riesgo de tizón tardío basado en horas de
humedad foliar y ventana térmica favorable a *Phytophthora infestans*, y exige
elegirlo con justificación en un ADR.

El problema no es elegir modelo. Es que **ninguno de los modelos publicados se
alimenta con los datos que este sistema puede conseguir.** Todos asumen
humedad relativa horaria de un instrumento; §9 define la entrada como preguntas
cualitativas a un agricultor.

Esa brecha es el hecho central de esta decisión, y la decisión consiste
sobre todo en qué hacer con ella.

## Alternativas consideradas

| Alternativa | A favor | En contra |
|---|---|---|
| **Wallin / BLITECAST (elegida)** | Publicado en 1962 y citable; es el modelo contra el que se miden casi todos los posteriores; la tabla de severidad es verificable celda por celda; implementación trivial y determinista | Necesita horas de humedad relativa ≥ 90% y la temperatura media en ese periodo. No tenemos ninguna de las dos |
| SimCast | Más moderno; modela además la protección por fungicida y la resistencia del cultivar | Necesita **más** datos horarios, no menos. Inviable con esta entrada |
| Índice diario de favorabilidad propio, a partir de las ventanas térmicas publicadas de *P. infestans* | Encajaría con los datos que sí hay | Un índice propio sin validación es exactamente lo que §18 llama inventar. Y sobre una salida que el agricultor traduce en comprar fungicida |
| No implementar nada hasta tener sensores | Honesto | Deja un entregable de §8.2 vacío y no aprende nada sobre la arquitectura |

## Decisión

**Se implementa Wallin (1962) con fidelidad, y no se le inventan las entradas.**

Cita: Wallin, J.R. (1962). *Summary of recent progress in predicting late
blight epidemics in United States and Canada.* American Potato Journal
39:306–312.

La tabla de valores de severidad diaria (DSV, 0–4) está transcrita tal como se
publica, con tres bandas de temperatura y sus umbrales de horas de humedad.
Se acumulan los DSV a lo largo de la campaña y se usa el umbral de 18 de
BLITECAST como aviso de primera aplicación.

**Dos decisiones menores, registradas para que no parezcan descuidos:**

1. La tabla impresa deja un hueco de una hora entre «22–24 → 3» y «> 25 → 4».
   La implementación lee los umbrales como «al menos N horas», de modo que 25
   horas puntúa 4. Es una decisión sobre una ambigüedad del original, no una
   invención.
2. Fuera de la ventana 7.2 °C – 26.6 °C el DSV es 0, como en el original.

**Y la decisión que de verdad importa:** cuando la fuente de clima del día no
trae horas de humedad foliar, **no se calcula riesgo**. `lateBlightRiskFor`
devuelve `undefined` y la pantalla dice que no puede juzgarlo.

No se deriva la humedad foliar de «¿llovió ayer?». Esa derivación sería un
supuesto de modelado sin fuente, sobre una salida que el agricultor convierte
en dinero gastado en fungicida y en producto aplicado al campo. Es precisamente
el caso que §18 prohíbe.

## Consecuencias

**Positivas.**

- El modelo está implementado y verificado contra su tabla publicada, banda por
  banda y en cada frontera. Si mañana llega una fuente de humedad foliar, el
  riesgo se enciende sin tocar el modelo.
- La honestidad es visible en la interfaz, no solo en el código: la pantalla
  dice «no puedo calcular el riesgo de tizón porque nadie mide cuántas horas se
  moja la hoja aquí».
- La tesis puede afirmar algo cierto y defendible: *el modelo es fiel; lo débil
  son los datos, y el sistema lo hace visible en lugar de taparlo.* Esa es
  justamente la contribución del aparato de procedencia y confianza.

**Negativas.**

- **Hoy el riesgo de tizón no se calcula nunca.** Es un entregable implementado
  y apagado, igual que la fenología.
- La demostración de la sustentación no podrá mostrar un aviso de tizón real
  salvo que se consiga una fuente de humedad foliar.

**Qué desbloquearía esto.** Cualquiera de estas tres, por orden de preferencia:

1. Un sensor de humedad foliar en la parcela (hoy fuera de alcance: §4 deja los
   sensores BLE como interfaz sin implementar).
2. Una fuente de datos horarios servida por el hub en LAN.
3. Una pregunta cualitativa al agricultor —«¿amaneció la hoja mojada? ¿hasta
   qué hora?»— **con una fuente publicada** que traduzca esa respuesta a horas
   de humedad. El coeficiente `leafWetnessHoursWhenDewObserved` existe ya en el
   archivo, con valor `null`, esperando esa fuente. Buscarla es tarea de la
   revisión agronómica (§19).

**Qué invalidaría esta decisión.** Que la revisión agronómica recomiende un
modelo calibrado para los Andes —por ejemplo alguno de la literatura del Centro
Internacional de la Papa— con datos de entrada alcanzables. En ese caso este
ADR se reemplaza y la implementación de Wallin se retira o se conserva como
comparación.
