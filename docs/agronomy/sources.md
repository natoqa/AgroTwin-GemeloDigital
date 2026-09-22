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

**En la ecuación 52, ET0 y Ra van los dos en mm día⁻¹.** Olvidar la conversión
de la ecuación 20 infla el resultado por 1/0.408 ≈ 2.45. Hay un test dedicado
a eso.

### 2.2 Temperatura base para grados-día

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

### 3.2 Lo que **no** se pudo validar, y por qué

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

### 4.1 Provisionales (tienen valor, pero de la región equivocada)

| Coeficiente | Valor | Base provisional | Qué hace falta |
|---|---|---|---|
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
(riesgo R-01). Mientras no lleguen, se trabaja con un fixture marcado
`SYNTHETIC` y **no se declara validación agronómica de ningún resultado**, tal
como manda §9.
