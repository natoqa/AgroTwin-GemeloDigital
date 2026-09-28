# Limitaciones conocidas y trabajo futuro

> Documento honesto por diseño (CLAUDE.md §1, §12). Cada limitación dice qué
> falta, qué efecto tiene hoy y qué la resolvería. Las cifras vienen de
> [`nfr/measurements.md`](./nfr/measurements.md) y de
> [`ml/pipeline/reports/evaluation.md`](../ml/pipeline/reports/evaluation.md).

## 1. El clima es de ejemplo (riesgo R-01, crítico)

- **Qué falta:** las normales climatológicas de SENAMHI para la zona.
- **Efecto hoy:** todo el balance hídrico y las recomendaciones de riego se
  calculan con `data/climate/la-libertad.SYNTHETIC.json`, cuyos números están
  inventados. La app lo avisa arriba de cada panel y baja la prioridad de toda
  recomendación de agua. **Ningún resultado agronómico es presentable.**
- **Qué lo resuelve:** sustituir ese archivo. Ningún código cambia.

## 2. Diecisiete coeficientes sin revisión agronómica (R-12)

- **Efecto hoy:** la etapa fenológica no se calcula (faltan los umbrales de
  grados-día), la fecha de cosecha sale de la duración típica del cultivo, y el
  riesgo de tizón no se calcula (nadie mide la humedad foliar).
- **Qué lo resuelve:** los valores y su fuente en
  [`agronomy/sources.md`](./agronomy/sources.md) §4. El código ya los usa en
  cuanto existen.

## 3. El modelo de hojas no está listo para el campo (R-11)

| Prueba | Fotos aceptadas | Aciertos entre las aceptadas |
|---|---|---|
| Laboratorio (PlantVillage) | 92.9 % | 99.7 % |
| Campo (PlantDoc, fotos de internet) | 28.6 % | 77.8 % |

- En campo, ningún umbral alcanza el 90 % de aciertos acordado; el modelo
  confunde sobre todo tizón temprano con tardío. Por eso rechaza mucho
  («intenta otra foto») en lugar de equivocarse con seguridad.
- No hay **ninguna foto de hoja sana tomada en campo** en los datos.
- **Qué lo resuelve:** fotos reales de la sierra de La Libertad, etiquetadas.

## 4. Nada de rendimiento se validó en un teléfono de gama baja

- RNF-02 (515 KiB de app) y RNF-03 (1.56 MiB de modelo) están cumplidos: son
  tamaños.
- RNF-01 (latencia) solo se midió en escritorio con CPU limitada: 0.1–0.3 s.
  RNF-04 (memoria) y RNF-05 (arranque) **no se midieron**.
- **Qué lo resuelve:** el dispositivo de referencia de ~2 GB de RAM.

## 5. Aprendizaje federado recortado (ADR-0011)

- Solo por archivo; no hay transporte por la red local (`LanHubTransport`).
- El ruido de privacidad diferencial (σ = 0.01) **no da una garantía formal**;
  ε no se calculó; no se midió la utilidad con y sin privacidad diferencial.
- Un teléfono sin fotos confirmadas no puede aceptar mejoras: no tiene con qué
  comprobar que no empeoran.

## 6. Cifrado en reposo y modelo de amenazas (Fase 7): no hechos

- Los datos del agricultor están en IndexedDB y OPFS **sin cifrar**, protegidos
  solo por el aislamiento del navegador y el bloqueo del teléfono.
- No hay modelo de amenazas escrito ni prueba de recuperación ante desalojo del
  almacenamiento (la copia de seguridad a archivo existe y está probada).

## 7. Validación humana pendiente

- Spike R-02 (HTTPS en la LAN) en un teléfono real.
- Licencias: **PlantVillage no declara licencia** en su repositorio; PlantDoc
  declara CC-BY-4.0. No publicar el modelo fuera del curso hasta aclararlo.
- Revisión de la interfaz al aire libre con agricultores.

## Trabajo futuro, en orden de impacto

1. Normales de SENAMHI y revisión de coeficientes (enciende la agronomía real).
2. Fotos de campo y reentrenamiento (hace útil el diagnóstico).
3. Mediciones en el dispositivo de referencia.
4. Cifrado en reposo con clave no exportable y modelo de amenazas (Fase 7).
5. `LanHubTransport` tras cerrar R-02; ε con un contador RDP.
