import type { DiagnosisClass } from '@agrotwin/domain';

/**
 * Plain Spanish for each outcome. The wording aims at a farmer with low
 * digital literacy, not at an agronomist: short sentences, no jargon, and a
 * rejection that says what to do next instead of apologising.
 */
export const DIAGNOSIS_LABEL: Record<DiagnosisClass, string> = {
  healthy: 'Planta sana',
  early_blight: 'Posible tizón temprano',
  late_blight: 'Posible tizón tardío',
  rejected: 'No pude identificarlo',
};

export const DIAGNOSIS_HELP: Record<DiagnosisClass, string> = {
  healthy: 'No se ven señales de enfermedad en esta hoja.',
  early_blight: 'La hoja muestra manchas parecidas a las del tizón temprano.',
  late_blight: 'La hoja muestra manchas parecidas a las del tizón tardío.',
  rejected: 'Intenta otra foto, más cerca de la hoja y con buena luz.',
};

/** Confidence as words, because a farmer reads "poca certeza" faster than "0.42". */
export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return 'alta certeza';
  if (confidence >= 0.6) return 'certeza media';
  return 'poca certeza';
}
