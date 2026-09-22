/**
 * What the classifier can say about a leaf photograph.
 *
 * `rejected` is not a failure mode bolted on: it is a first-class outcome for
 * anything below the calibrated confidence threshold. A wrong diagnosis costs
 * a smallholder a harvest; "I could not tell" costs them a second photo.
 */
export const DIAGNOSIS_CLASSES = ['healthy', 'early_blight', 'late_blight', 'rejected'] as const;

export type DiagnosisClass = (typeof DIAGNOSIS_CLASSES)[number];

export interface Diagnosis {
  readonly class: DiagnosisClass;
  /** 0–1. For `rejected`, the confidence of the class that was refused. */
  readonly confidence: number;
  /** Which model produced it, so a snapshot stays readable after a model change. */
  readonly modelVersion: string;
}

export function isDiagnosisClass(value: string): value is DiagnosisClass {
  return (DIAGNOSIS_CLASSES as readonly string[]).includes(value);
}
