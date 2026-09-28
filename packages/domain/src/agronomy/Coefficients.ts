import { MissingCoefficientError } from '../errors/MissingCoefficientError.js';
import { InvalidCoefficientsError } from '../errors/InvalidCoefficientsError.js';

/**
 * The agronomic coefficients, and how much they can be trusted.
 *
 * CLAUDE.md §8.2 is unambiguous: every coefficient carries a `source`, and an
 * unverified one must *reduce the confidence* of the snapshot that uses it
 * rather than pretend to a precision it does not have. So a coefficient here
 * is never a bare number — it is a number plus its provenance, and reading one
 * is how a model earns or loses confidence.
 *
 * There are three states, and the difference matters:
 *
 * - **verified** — a real citation. Used at full confidence.
 * - **provisional** — a number with a defensible basis but the wrong region,
 *   the wrong cultivar or no peer-reviewed backing. Used, and it drags the
 *   snapshot's confidence down.
 * - **missing** — `null`. Not known at all. A model that needs it *refuses to
 *   run*. This is the case CLAUDE.md §18 protects: the alternative is to
 *   invent a plausible number, and a plausible number is indistinguishable
 *   from a measured one once it is three layers deep in a water balance.
 */
export const TODO_SOURCE_PREFIX = 'TODO';

export type CoefficientStatus = 'verified' | 'provisional' | 'missing';

export interface Coefficient {
  readonly key: string;
  readonly value: number | null;
  readonly unit: string;
  readonly source: string;
  readonly note?: string;
  readonly status: CoefficientStatus;
}

export interface CoefficientDocument {
  readonly crop: string;
  readonly version: string;
  readonly region: string;
  readonly entries: Readonly<Record<string, RawCoefficient>>;
}

export interface RawCoefficient {
  readonly value: number | null;
  readonly unit: string;
  readonly source: string;
  readonly note?: string;
}

/**
 * How much confidence one provisional coefficient costs.
 *
 * This is an engineering choice, not agronomy, and it is deliberately harsh:
 * the point is that a recommendation built on unverified numbers must visibly
 * rank below one built on measurements (CLAUDE.md §8.4). It is a multiplier,
 * so two provisional inputs cost more than one, and it never reaches zero —
 * a provisional answer is worth more than no answer, just not much more.
 */
export const PROVISIONAL_CONFIDENCE_FACTOR = 0.6;

export class Coefficients {
  private constructor(
    readonly crop: string,
    readonly version: string,
    readonly region: string,
    private readonly entries: ReadonlyMap<string, Coefficient>,
  ) {}

  /** Validates a coefficient document and refuses one that is not usable. */
  static fromDocument(document: CoefficientDocument): Coefficients {
    if (typeof document.crop !== 'string' || document.crop.length === 0) {
      throw new InvalidCoefficientsError('the document has no crop');
    }
    if (typeof document.version !== 'string' || document.version.length === 0) {
      throw new InvalidCoefficientsError('the document has no version');
    }

    const entries = new Map<string, Coefficient>();
    for (const [key, raw] of Object.entries(document.entries)) {
      entries.set(key, toCoefficient(key, raw));
    }
    if (entries.size === 0) {
      throw new InvalidCoefficientsError('the document has no entries');
    }

    return new Coefficients(document.crop, document.version, document.region, entries);
  }

  /** The coefficient, whatever its state. Throws if the key is not declared. */
  get(key: string): Coefficient {
    const coefficient = this.entries.get(key);
    if (!coefficient) {
      throw new InvalidCoefficientsError(`no coefficient is declared for "${key}"`);
    }
    return coefficient;
  }

  /**
   * The numeric value, for a model that cannot proceed without it.
   *
   * Throws `MissingCoefficientError` when the value is null. Callers catch it
   * and report "I cannot compute this", which is the honest outcome.
   */
  require(key: string): number {
    const coefficient = this.get(key);
    if (coefficient.value === null) {
      throw new MissingCoefficientError(key, coefficient.source);
    }
    return coefficient.value;
  }

  has(key: string): boolean {
    const coefficient = this.entries.get(key);
    return coefficient !== undefined && coefficient.value !== null;
  }

  /**
   * The confidence multiplier owed to a set of coefficients.
   *
   * A missing one yields 0: nothing was computed, so nothing is trusted.
   */
  confidenceFor(keys: readonly string[]): number {
    let confidence = 1;
    for (const key of keys) {
      const coefficient = this.get(key);
      if (coefficient.status === 'missing') return 0;
      if (coefficient.status === 'provisional') confidence *= PROVISIONAL_CONFIDENCE_FACTOR;
    }
    return confidence;
  }

  /** Everything still awaiting agronomic review (CLAUDE.md §19). */
  needingReview(): readonly Coefficient[] {
    return [...this.entries.values()].filter((entry) => entry.status !== 'verified');
  }

  all(): readonly Coefficient[] {
    return [...this.entries.values()];
  }
}

function toCoefficient(key: string, raw: RawCoefficient): Coefficient {
  if (typeof raw !== 'object' || raw === null) {
    throw new InvalidCoefficientsError(`entry "${key}" is not an object`);
  }
  if (typeof raw.source !== 'string' || raw.source.trim().length === 0) {
    // The whole point of the file. An entry without a source is a number
    // somebody remembered, and CLAUDE.md §18 forbids exactly that.
    throw new InvalidCoefficientsError(`entry "${key}" has no source`);
  }
  if (typeof raw.unit !== 'string' || raw.unit.length === 0) {
    throw new InvalidCoefficientsError(`entry "${key}" has no unit`);
  }
  if (raw.value !== null && (typeof raw.value !== 'number' || !Number.isFinite(raw.value))) {
    throw new InvalidCoefficientsError(`entry "${key}" has a value that is neither a number nor null`);
  }

  const provisional = raw.source.trimStart().startsWith(TODO_SOURCE_PREFIX);
  const status: CoefficientStatus =
    raw.value === null ? 'missing' : provisional ? 'provisional' : 'verified';

  return {
    key,
    value: raw.value,
    unit: raw.unit,
    source: raw.source,
    ...(raw.note === undefined ? {} : { note: raw.note }),
    status,
  };
}
