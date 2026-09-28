# Guion de la demostración (≈ 12 minutos)

> Para la sustentación. Cada paso dice qué hacer, qué debe verse y **qué decir
> si algo no sale**. Ensayarlo completo al menos una vez, con red y sin red.

## Antes de entrar (la noche anterior)

1. `pnpm install && pnpm build` en la laptop de la demo.
2. `pnpm --filter @agrotwin/app preview` y abrir `http://localhost:4173` en
   Chrome. **Descargar el reconocimiento de hojas con wifi** (pantalla inicial).
3. Crear la parcela «Chacra de demostración» con latitud `-8.11`, longitud
   `-78.01`, altura `3100`, y una campaña sembrada **hace ~40 días** (así el
   panel ya muestra sed y recomendaciones).
4. Tener a mano: una foto de hoja de PlantVillage (tizón tardío) y una foto
   «difícil» de internet. Tres archivos `.agrotwin-delta` ya preparados y el
   `.agrotwin-model` resultante, por si la parte en vivo falla.
5. `cd services/edge-hub && uv sync` (el hub no necesita internet después).

## 1. Qué es (1 min)

«No es una app que clasifica fotos. Es un **gemelo digital de la parcela**:
copia el estado del campo, lo simula hacia adelante y devuelve
recomendaciones. Todo corre **en el teléfono, sin nube**.»

## 2. El panel del gemelo (3 min)

- Abrir la campaña. Señalar el **aviso de clima de ejemplo** arriba: «somos
  honestos, sin datos de SENAMHI esto es de prueba».
- «Qué hacer»: leer «Riega tu parcela» y el motivo. Señalar **«La puse más
  abajo porque no estoy seguro»**: el Advisor baja la prioridad cuando los
  datos son débiles, y dice por qué.
- «Cómo va el cultivo»: agua, calor acumulado; «etapa: todavía no puedo
  decirlo» → «preferimos decir que no sabemos a inventar un coeficiente».

## 3. ¿Y si…? (2 min)

- «¿Y si no riego?» con 7 y con 14 días: el día en que empezaría la sed.
- «¿Cuándo cosecho?»: fecha aproximada y de dónde sale.
- «¿Y si aplico fungicida hoy?»: **se niega a responder** y explica por qué
  (falta la humedad foliar y la duración del fungicida). Es a propósito.

## 4. Diagnóstico real, sin internet (2 min)

- **Activar el modo avión** (o apagar el wifi).
- Tomar foto → subir la de PlantVillage → diagnóstico en menos de un segundo,
  dentro del estado del gemelo, con su certeza.
- Subir la foto difícil → probablemente «No pude identificarlo, intenta otra
  foto». Decir: «en fotos de campo el modelo aún no es fiable; prefiere
  rechazar antes que equivocarse» y mostrar la tabla de
  [`limitaciones.md`](../limitaciones.md) §3.

## 5. Aprendizaje federado (3 min)

- En la foto: «¿Acerté?» → confirmar. Explicar que solo aprende de lo que el
  agricultor confirma.
- *Aprendizaje compartido* → «Compartir y recibir» → **Preparar mi aporte** →
  se descarga un `.agrotwin-delta` firmado. «No lleva fotos, ni ubicación, ni
  nombre: solo números del modelo.»
- En la terminal (hub):

  ```bash
  cd services/edge-hub
  uv run python -m edge_hub.aggregate <carpeta-de-aportes>/*.agrotwin-delta \
      --contract ../../packages/app/public/model/model-contract.json \
      --head ../../packages/app/public/model/head.json --out ronda-1.agrotwin-model
  ```

  Mostrar las líneas `ACEPTADO` / `RECHAZADO` y su motivo.
- En la app: **Cargar una mejora** con `ronda-1.agrotwin-model` → «Mejora
  aceptada» con el antes y después en las fotos de comprobación. «El hub no es
  una autoridad: el teléfono decide.»
- **Si no da tiempo o falla:** mostrar que el E2E `federation.spec.ts` hace
  exactamente esto con tres navegadores, y ejecutarlo si hay minutos.

## 6. Ingeniería (1 min)

- `pnpm test:arch`: las reglas de arquitectura se hacen cumplir con
  herramientas (un `window` en el dominio no compila).
- CI en verde: 450 tests unitarios, 19 E2E, tests de Python.
- ADRs en `docs/adr/`, mediciones en `docs/nfr/measurements.md`.

## Preguntas probables y respuesta corta

| Pregunta | Respuesta |
|---|---|
| ¿Por qué no funciona bien en campo? | No hay fotos reales de la zona; PlantVillage es de laboratorio. Medido y documentado. |
| ¿Es privacidad diferencial real? | El mecanismo sí; el nivel de ruido de la demo no da garantía formal y no calculamos ε (ADR-0011). |
| ¿Por qué no cuantizaron todo a INT8? | Lo hicimos y destruía el modelo (F1 0.04); medido en `quantization.md`. INT8 solo en los pesos. |
| ¿Y el cifrado? | Fase 7, no hecha. Datos protegidos solo por el aislamiento del navegador. |
