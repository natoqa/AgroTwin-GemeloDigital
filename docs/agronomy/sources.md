# Fuentes de los coeficientes agronómicos

> Este documento acompaña a `packages/domain/src/agronomy/coefficients/potato.v1.json`.
> CLAUDE.md §8.2 exige que **cada** coeficiente tenga fuente, y §18 prohíbe
> inventar valores. Aquí se registra qué se verificó, contra qué, y qué sigue
> sin verificar.
>
> **Regla de lectura:** si una fila dice `TODO`, es que el valor **no** está
> verificado, no que esté pendiente de escribir. El motor reduce la confianza
> de todo snapshot que lo use.

---

## 1. Estado general

| Estado | Qué significa | Efecto en la confianza |
|---|---|---|
| **Verificado** | Cita concreta, comprobada contra el documento original | Confianza completa |
| **Provisional** | Valor con base defendible, pero de otra región, otro cultivar o sin revisión por pares | Multiplica la confianza por 0.6 |
| **Ausente** (`null`) | No se conoce. El modelo que lo necesita **se niega a calcular** | Confianza 0 |

El factor 0.6 es una decisión de ingeniería, no agronómica: existe para que una
recomendación construida sobre números sin verificar quede visiblemente por
debajo de una construida sobre mediciones (§8.4). Está en
`PROVISIONAL_CONFIDENCE_FACTOR`.

---

## 2. Verificado

### 2.1 Referencia principal

**Allen, R.G., Pereira, L.S., Raes, D. & Smith, M. (1998).** *Crop
evapotranspiration — Guidelines for computing crop water requirements.* FAO
Irrigation and Drainage Paper No. 56. FAO, Roma.
Consultado en <https://www.fao.org/4/x0490e/x0490e00.htm> (2026-09-22).

| Coeficiente | Valor | Dónde | Comprobación |
|---|---|---|---|
| `kcInitial` | 0.50 | Tabla 12, *Roots and Tubers → Potato* | La celda aparece vacía en la edición HTML: hereda el 0.50 que encabeza el bloque. Confirmado contra las filas vecinas (Parsnip 0.5, Sugar Beet 0.35, Cassava 0.3) |
| `kcMid` | 1.15 | Tabla 12 | Leído directamente |
| `kcEnd` | 0.75 | Tabla 12 | Leído directamente. **Nota de FAO-56:** ≈ 0.40 para papa de ciclo largo con *vine kill*. No se modela la matada de follaje, así que se conserva el valor de tabla |
| `maxCropHeight` | 0.6 m | Tabla 12 | Leído directamente |
| `rootingDepthMin` / `Max` | 0.4 – 0.6 m | Tabla 22 | Rango Zr publicado para papa |
| `depletionFraction` | 0.35 | Tabla 22 | Fracción *p* de agua disponible agotable sin estrés |

**Ecuaciones implementadas, verbatim del capítulo 3:**

| Ecuación | Forma | Dónde |
|---|---|---|
| ET0 sin datos completos | `ETo = 0.0023 (Tmean + 17.8) (Tmax − Tmin)^0.5 · Ra` | Ec. 52 |
| Radiación extraterrestre diaria | `Ra = 24(60)/π · Gsc · dr · [ωs sin φ sin δ + cos φ cos δ sin ωs]` | Ec. 21 |
| Constante solar | `Gsc = 0.0820 MJ m⁻² min⁻¹` | Ec. 21 |
| Latitud a radianes | `φ = π/180 × grados` | Ec. 22 |
| Distancia Tierra-Sol | `dr = 1 + 0.033 cos(2π J / 365)` | Ec. 23 |
| Declinación solar | `δ = 0.409 sin(2π J / 365 − 1.39)` | Ec. 24 |
| Ángulo horario de la puesta | `ωs = arccos(−tan φ · tan δ)` | Ec. 25 |
| MJ a mm de evaporación equivalente | `× 0.408` | Ec. 20 |
| Evapotranspiración del cultivo | `ETc = ETo × Kc` | Ec. 58 |
| Agua disponible total | `TAW = 1000 (θFC − θWP) Zr` | Ec. 82 |
| Agua fácilmente disponible | `RAW = p · TAW` | Ec. 83 |
| Coeficiente de estrés hídrico | `Ks = (TAW − Dr) / (TAW − p·TAW)` | Ec. 84 |
| Balance diario del agua del suelo | `Dr = Dr(ayer) − (P − RO) − I + ETc + DP` | Ec. 85 |

**En la ecuación 52, ET0 y Ra van los dos en mm día⁻¹.** Olvidar la conversión
de la ecuación 20 infla el resultado por 1/0.408 ≈ 2.45. Hay un test dedicado
a eso.

### 2.2 Riesgo de tizón tardío

**Wallin, J.R. (1962).** *Summary of recent progress in predicting late blight
epidemics in United States and Canada.* American Potato Journal 39:306–312.

Tabla de valores de severidad diaria (DSV), transcrita tal como se publica:

| DSV | 7.2–11.6 °C | 11.7–15.0 °C | 15.1–26.6 °C |
|---|---|---|---|
| 0 | ≤ 15 h | ≤ 12 h | ≤ 9 h |
| 1 | 16–18 h | 13–15 h | 10–12 h |
| 2 | 19–21 h | 16–18 h | 13–15 h |
| 3 | 22–24 h | 19–21 h | 16–18 h |
| 4 | > 25 h | > 22 h | > 19 h |

Horas = duración del periodo con humedad relativa ≥ 90%; la temperatura es la
media **durante ese periodo**. Fuera de 7.2–26.6 °C el DSV es 0.

Dos decisiones de implementación, en ADR-0009: el hueco de una hora entre
«22–24» y «> 25» se cierra leyendo los umbrales como «al menos N horas», y
**el riesgo no se calcula** cuando nadie midió la humedad foliar.

### 2.3 Temperatura base para grados-día

**Sands, P.J., Hackett, C. & Nix, H.A. (1979).** *A model of the development
and bulking of potatoes.* Field Crops Research 2:309–331.

| Coeficiente | Valor | Nota |
|---|---|---|
| `gddBaseTemperature` | 7 °C | Es la base del formalismo de *P-days* para papa, ampliamente reproducida en la literatura de fenología del cultivo |

**Límite honesto de esta verificación:** se verificó que 7 °C es la temperatura
base convencional para *Solanum tuberosum*. **No** se verificó para los
cultivares andinos de la sierra de La Libertad. Si la revisión agronómica
(§19) encuentra un valor propio de la zona, sustituirlo es cambiar una línea
del JSON.

---

## 3. Validación numérica

El DoD de la Fase 3 pide tests contra ejemplos resueltos publicados.

### 3.1 Lo que sí se pudo validar

**FAO-56, capítulo 3, Ejemplo 8** — *Determination of extraterrestrial
radiation*, 3 de septiembre a 20° S. El documento imprime todos los pasos
intermedios, así que el test comprueba la cadena entera y no solo el resultado,
que podría salir bien por cancelación de errores.

| Magnitud | Publicado | Tolerancia del test |
|---|---|---|
| Día del año *J* | 246 | exacto |
| φ | −0.35 rad | 2 decimales |
| dr | 0.985 | 3 decimales |
| δ | 0.120 rad | 3 decimales |
| ωs | 1.527 rad | 3 decimales |
| **Ra** | **32.2 MJ m⁻² día⁻¹** | 1 decimal |
| Ra como evaporación equivalente | 13.1 mm/día | 1 decimal |

Las tolerancias son el redondeo del propio documento.
Test: `packages/domain/src/agronomy/SolarRadiation.test.ts`.

### 3.2 Balance hídrico

**FAO-56, capítulo 8, Ejemplo 36** — *Determination of readily available soil
water for various crops and soil types*. Tomate con Zr = 0.8 m y p = 0.40,
sobre tres suelos. Se comprueban **los tres**, porque una sola fila no
detectaría una capacidad de campo transpuesta ni un factor 1000 perdido.

| Suelo | θFC | θWP | TAW publicado | RAW publicado |
|---|---|---|---|---|
| Arenoso franco | 0.15 | 0.06 | 72 mm | 29 mm |
| Limoso | 0.32 | 0.15 | 136 mm | 54 mm |
| Franco arcillo-limoso | 0.35 | 0.23 | 96 mm | 38 mm |

Test: `packages/domain/src/agronomy/WaterBalance.test.ts`. Incluye además una
prueba de conservación a lo largo de 120 días: lo que entró debe estar
transpirado, percolado o pendiente en el agotamiento. Un balance que gotee un
milímetro al día son 120 mm por campaña, la diferencia entre regar y no regar.

**Escorrentía no modelada, y en qué dirección falla.** Sin pendiente, textura
ni intensidad de lluvia en el dispositivo, cualquier cifra de escorrentía sería
inventada. Se trata toda la lluvia como infiltrada, lo que **sobreestima** el
agua que llega al suelo y hace que el gemelo aconseje regar **de menos** antes
que de más. Para un agricultor que paga el agua, esa es la dirección segura, y
queda dicha aquí y en el código.

### 3.3 Lo que **no** se pudo validar, y por qué

**FAO-56 no publica ningún ejemplo resuelto de la ecuación 52.** El capítulo
introduce Hargreaves-Samani para datos faltantes y sigue adelante sin
desarrollar un caso numérico.

En consecuencia, `Et0Hargreaves.test.ts` hace dos cosas más débiles pero
honestas, y lo dice en el propio archivo:

1. Comprueba la implementación contra la **fórmula publicada**, con la
   aritmética hecha a mano en un comentario del test.
2. Comprueba las **propiedades** que la ecuación debe cumplir: crece con la
   temperatura media y con la amplitud térmica, escala linealmente con Ra, se
   anula sin amplitud térmica, nunca es negativa, y rechaza un día con máxima
   por debajo de la mínima.

**Esto no es una validación agronómica de ET0.** Es una verificación de que el
código implementa la ecuación que dice implementar.

---

## 4. Pendiente de revisión agronómica (CLAUDE.md §19)

Nueve entradas. Ninguna tiene fuente verificada y todas reducen la confianza.

### 4.1 Provisionales (tienen valor, pero no verificado para aquí)

| Coeficiente | Valor | Base provisional | Qué hace falta |
|---|---|---|---|
| `soilFieldCapacity` | 0.32 m³/m³ | FAO-56 Ejemplo 36, suelo limoso | La textura real del suelo de la parcela. A futuro debería ser una propiedad **por parcela**, no un coeficiente del cultivo |
| `soilWiltingPoint` | 0.15 m³/m³ | FAO-56 Ejemplo 36, suelo limoso | ídem |
| `rainfallFactorLittle` | 0.5 | Decisión de modelado | Multiplica la lluvia de las normales cuando el agricultor dice «llovió poco». Sin respaldo publicado |
| `rainfallFactorHeavy` | 2.0 | Decisión de modelado | Ídem para «llovió mucho» |
| `coldNightTemperatureDrop` | 3 °C | Decisión de modelado | Cuánto baja la mínima cuando el agricultor reporta noche fría. Sin respaldo publicado |
| `irrigationRefillFraction` | 1.0 | Decisión de modelado (Fase 4) | El agricultor dice **que** regó, no cuánto. Cada riego repone esta fracción del agotamiento del día anterior; 1 = el suelo vuelve a capacidad de campo. Hace falta saber si el riego por surco en la sierra realmente llena la zona radicular. Solo cuesta confianza en campañas donde se registró algún riego |
| `stageLengthInitial` | 25 d | FAO-56 Tabla 11, papa, clima continental, siembra de mayo (25/30/45/30, total 130 d) | FAO-56 **no publica** una fila para los Andes peruanos. Hace falta la duración de etapas para la sierra de La Libertad |
| `stageLengthDevelopment` | 30 d | ídem | ídem |
| `stageLengthMid` | 45 d | ídem | ídem |
| `stageLengthLate` | 30 d | ídem | ídem |

### 4.2 Ausentes (no se conocen, y el modelo se niega a calcular)

| Coeficiente | Qué es | Consecuencia hoy |
|---|---|---|
| `gddUpperTemperature` | Techo por encima del cual el desarrollo deja de ganar | Los grados-día se acumulan **sin tope**. Poner un tope inventado cambiaría en silencio todos los acumulados |
| `gddToEmergence` | Tiempo térmico de siembra a emergencia | **No se puede nombrar la etapa fenológica.** `estimatePhenologicalStage` devuelve «sin etapa» y confianza 0 |
| `gddToTuberInitiation` | Tiempo térmico a tuberización | ídem |
| `gddToBulking` | Tiempo térmico al inicio del llenado | ídem |
| `gddToMaturity` | Tiempo térmico a madurez | ídem |
| `leafWetnessHoursWhenDewObserved` | Horas de humedad foliar a suponer cuando el agricultor reporta hoja mojada al amanecer | **El riesgo de tizón no se calcula nunca.** Ver ADR-0009 |
| `fungicideProtectionDays` | Cuántos días protege una aplicación de fungicida (Fase 4) | **El escenario «¿y si aplico fungicida hoy?» se niega a responder.** Depende del producto (de contacto o sistémico), la dosis y la lluvia que lo lava. Ver ADR-0010 |

**De `gddToMaturity` a fecha de cosecha (Fase 4).** Mientras no haya
umbral de madurez, el Simulador estima la cosecha como siembra + la suma de las
cuatro duraciones de etapa de FAO-56 (130 días, provisionales). Esa estimación
ignora el clima del año y lleva la confianza de cuatro coeficientes
provisionales (0.6⁴ ≈ 0.13). La pantalla la presenta como «fecha aproximada».
Con `gddToMaturity` y su fuente, pasa sola al reloj térmico.

**Simplificación del escenario de fungicida (Fase 4).** Wallin (1962) no modela
aplicaciones. Para responder la pregunta de §8.3 se adopta una regla declarada:
el día de la aplicación la severidad acumulada vuelve a cero y, durante
`fungicideProtectionDays` días, no se suma nada; después, la cuenta sigue desde
cero. BLITECAST decide las aplicaciones siguientes con otra regla (Krause,
Massie y Hyre, 1975) que aquí **no** se implementa. Hoy el escenario está doblemente
apagado: falta la humedad foliar y falta la duración de la protección.

**Qué significa esto en la práctica.** Hoy el gemelo acumula grados-día
correctamente y **dice que no sabe en qué etapa está el cultivo**. Es el
comportamiento buscado: una etapa inventada a partir de umbrales plausibles
gobernaría el Kc, el riego y el aviso de fungicida, y el agricultor no tendría
forma de cuestionarla.

**Lo que se necesita del equipo humano:** los cuatro umbrales de grados-día
para los cultivares de papa que realmente se siembran en la zona, con su fuente
—literatura del Centro Internacional de la Papa, tesis locales, o ensayos de la
UNT—. Con eso, la fenología se enciende sin tocar una línea de código.

---

## 5. Datos climáticos

Las normales climatológicas de SENAMHI todavía **no** están disponibles
(riesgo R-01). Mientras no lleguen se usa
`data/climate/la-libertad.SYNTHETIC.json`, y hay que ser explícito sobre lo que
eso significa:

- **Los números de ese archivo están inventados.** §9 autoriza el fixture
  sintético; el archivo lo dice en mayúsculas en su primer campo.
- Todo lo que sale de él lleva la procedencia **`synthetic_normals`**, que es
  una fuente distinta de `climate_normals` precisamente para que nada derivado
  pueda confundirse con un dato. Su confianza base es 0.1, la más baja del
  sistema.
- La pantalla del gemelo muestra un aviso permanente mientras esa fuente esté
  activa.
- **No se declara validación agronómica de ningún resultado.**

Sustituir el archivo por las normales reales de SENAMHI es el único cambio
necesario: nada de código depende de que sea sintético salvo la etiqueta.

### La calidad de una fuente, en un número

`SOURCE_BASE_CONFIDENCE` en `packages/domain/src/model/Weather.ts`. Son juicios
de ingeniería, puestos por escrito para poder discutirlos:

| Fuente | Confianza base | Por qué |
|---|---|---|
| `synthetic_normals` | 0.10 | Inventada |
| `climate_normals` | 0.35 | Un año típico, no este |
| `manual_weather` | 0.55 | Esta parcela, este día — pero cualitativo |
| `network_weather_cache` | 0.70 | Medición real de la región, quizá vieja |
| `image_diagnosis` | 1.00 | La confianza la pone el propio clasificador |

Esa base se multiplica después por la calidad de los coeficientes que cada
modelo usó, de modo que un día construido sobre normales sintéticas y
duraciones de etapa provisionales llega a la pantalla visiblemente débil.
