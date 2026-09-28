import type { DiagnosisClass } from '../model/Diagnosis.js';
import type { LocalDate } from '../model/LocalDate.js';
import type { ProvenanceEntry, ProvenanceSource } from '../model/Provenance.js';
import type { TwinSnapshot } from '../model/TwinSnapshot.js';
import type { Millimeters } from '../model/Units.js';
import { SOURCE_BASE_CONFIDENCE } from '../model/Weather.js';
import type { TwinDayState } from './BehaviorEngine.js';
import type { HarvestEstimate, WaterProjection } from './Simulator.js';

/**
 * The Advisor: what the twin tells the farmer to do, and why (CLAUDE.md §8.4).
 *
 * It reads what the BehaviorEngine and the Simulator computed and turns it
 * into a short, ordered list. It adds **no agronomy of its own**: "the crop is
 * thirsty" is FAO-56's readily available water, "spray" is BLITECAST's
 * threshold, "harvest is near" is the Simulator's date. What the Advisor adds
 * is priority, and honesty about how much each piece of advice is worth.
 *
 * **Priority** is urgency first — act now, act soon, good to know — and then
 * confidence. A recommendation whose confidence falls below
 * `LOW_CONFIDENCE_THRESHOLD` is moved down one level of urgency and marked as
 * such, with the inputs that made it weak named, so the screen can say "I put
 * this lower because I am not sure: the weather is an example". It is never
 * dropped: a weak warning about a thirsty crop is still worth reading.
 *
 * The wording is not here. Recommendations carry codes and facts; the app
 * turns them into plain Spanish (CLAUDE.md §5), so the rules can be tested
 * without testing sentences.
 */

/**
 * Below this, advice is demoted and says why.
 *
 * The same boundary at which the screen stops saying "certeza media" and
 * starts saying "poca certeza". An engineering choice, stated to be argued
 * with; it is not agronomy.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/** How many days ahead a coming water stress is worth warning about. */
export const WATER_LOOKAHEAD_DAYS = 3;

/**
 * How long a photograph keeps describing the plot.
 *
 * A diagnosis older than this is history, not the current state, and the
 * twin asks for a new photograph instead of acting on it.
 */
export const RECENT_PHOTO_DAYS = 7;

/** How close the estimated harvest has to be before it becomes advice. */
export const HARVEST_NOTICE_DAYS = 14;

export const URGENCIES = ['now', 'soon', 'info'] as const;
export type Urgency = (typeof URGENCIES)[number];

/** What made a recommendation weaker than it looks. */
export type WeakInput =
  /** Weather from the SYNTHETIC fixture: invented numbers. */
  | 'synthetic_weather'
  /** Climatological normals: a typical year, not this one. */
  | 'typical_year_weather'
  /** The farmer's qualitative answers, translated into ranges. */
  | 'farmer_weather_answers'
  /** Coefficients still awaiting agronomic review. */
  | 'unreviewed_crop_data'
  /** Days that have not happened yet. */
  | 'projection'
  /** A harvest date from the season length, not from this year's heat. */
  | 'season_length_only'
  /** The photograph classifier was not sure. */
  | 'uncertain_photo';

/** Why the twin could not compute the crop's state today. */
export type AdvisorBlocker = 'no_location' | 'no_weather' | 'missing_coefficients';

export interface AdvisorInput {
  /** Harvested campaigns get no advice: there is nothing left to act on. */
  readonly active: boolean;
  readonly today: LocalDate;
  /** Today's state, when the engine could compute one. */
  readonly state?: TwinDayState;
  readonly blocker?: AdvisorBlocker;
  /** No irrigation over the next `WATER_LOOKAHEAD_DAYS`. */
  readonly water?: WaterProjection;
  readonly harvest?: HarvestEstimate;
  /** The campaign's most recent snapshot, if a photograph was ever taken. */
  readonly latestSnapshot?: TwinSnapshot;
  /** The latest day the farmer answered the weather questions about. */
  readonly lastWeatherAnswer?: LocalDate;
}

interface RecommendationBase {
  /** After any demotion for low confidence. */
  readonly urgency: Urgency;
  /** What the facts alone would have warranted. */
  readonly intrinsicUrgency: Urgency;
  /** 0–1. */
  readonly confidence: number;
  /** True when it was moved down because its confidence is low. */
  readonly demoted: boolean;
  readonly weakInputs: readonly WeakInput[];
}

export type RecommendationDetails =
  | { readonly kind: 'add_location' }
  | { readonly kind: 'crop_data_missing' }
  | { readonly kind: 'irrigate_now'; readonly depletion: Millimeters }
  | {
      readonly kind: 'irrigate_soon';
      readonly stressStartsOn: LocalDate;
      readonly daysUntilStress: number;
    }
  | { readonly kind: 'water_ok'; readonly depletion: Millimeters }
  | { readonly kind: 'consider_fungicide'; readonly accumulatedSeverity: number }
  | {
      readonly kind: 'check_leaves';
      readonly diagnosis: Extract<DiagnosisClass, 'early_blight' | 'late_blight'>;
      readonly photographedOn: LocalDate;
      readonly daysAgo: number;
      /** Whether the blight weather model agreed, disagreed or could not say. */
      readonly blightWeather: 'favourable' | 'not_favourable' | 'unknown';
    }
  | { readonly kind: 'retake_photo'; readonly photographedOn: LocalDate }
  | { readonly kind: 'take_photo'; readonly daysSinceLastPhoto?: number }
  | { readonly kind: 'report_weather' }
  | {
      readonly kind: 'harvest_near';
      readonly date: LocalDate;
      readonly daysFromToday: number;
      readonly method: 'thermal_time' | 'stage_lengths';
    };

export type RecommendationKind = RecommendationDetails['kind'];

export type Recommendation = RecommendationBase & RecommendationDetails;

/** Ties are broken in this order, so the list never reshuffles between runs. */
const KIND_ORDER: readonly RecommendationKind[] = [
  'irrigate_now',
  'consider_fungicide',
  'check_leaves',
  'add_location',
  'irrigate_soon',
  'harvest_near',
  'water_ok',
  'retake_photo',
  'take_photo',
  'report_weather',
  'crop_data_missing',
];

/** The advice for a campaign, most important first. */
export function advise(input: AdvisorInput): readonly Recommendation[] {
  if (!input.active) return [];

  const drafts: Draft[] = [
    ...blockerAdvice(input),
    ...waterAdvice(input),
    ...blightAdvice(input),
    ...photoAdvice(input),
    ...harvestAdvice(input),
    ...weatherAnswerAdvice(input),
  ];

  return drafts.map(finish).sort(byPriority);
}

// --- Rules ----------------------------------------------------------------

interface Draft {
  readonly details: RecommendationDetails;
  readonly intrinsicUrgency: Urgency;
  readonly confidence: number;
  readonly weakInputs: readonly WeakInput[];
}

/** Advice that rests on a fact rather than on a model. */
const certain = (details: RecommendationDetails, urgency: Urgency): Draft => ({
  details,
  intrinsicUrgency: urgency,
  confidence: 1,
  weakInputs: [],
});

function blockerAdvice(input: AdvisorInput): Draft[] {
  switch (input.blocker) {
    case 'no_location':
      return [certain({ kind: 'add_location' }, 'soon')];
    case 'missing_coefficients':
      return [certain({ kind: 'crop_data_missing' }, 'info')];
    default:
      return [];
  }
}

function waterAdvice(input: AdvisorInput): Draft[] {
  const { state, water } = input;
  if (!state) return [];

  const today = fieldEntry(state.provenance, 'waterBalance');
  const todayWeak = weaknessOf(state.provenance, 'waterBalance');

  if (state.waterBalance.underStress) {
    return [
      {
        details: { kind: 'irrigate_now', depletion: state.waterBalance.depletion },
        intrinsicUrgency: 'now',
        confidence: today?.confidence ?? state.confidence,
        weakInputs: todayWeak,
      },
    ];
  }

  if (!water) return [];
  const projectedWeak = union(
    todayWeak,
    ...water.projected.map((day) => weaknessOf(day.provenance, 'waterBalance')),
    ['projection'],
  );

  if (
    water.stressStartsOn !== undefined &&
    water.daysUntilStress !== undefined &&
    water.daysUntilStress <= WATER_LOOKAHEAD_DAYS
  ) {
    return [
      {
        details: {
          kind: 'irrigate_soon',
          stressStartsOn: water.stressStartsOn,
          daysUntilStress: water.daysUntilStress,
        },
        intrinsicUrgency: 'soon',
        confidence: water.confidence,
        weakInputs: projectedWeak,
      },
    ];
  }

  return [
    {
      details: { kind: 'water_ok', depletion: state.waterBalance.depletion },
      intrinsicUrgency: 'info',
      confidence: water.confidence,
      weakInputs: projectedWeak,
    },
  ];
}

function blightAdvice(input: AdvisorInput): Draft[] {
  const risk = input.state?.lateBlightRisk;
  if (!input.state || !risk?.sprayAdvised) return [];

  return [
    {
      details: { kind: 'consider_fungicide', accumulatedSeverity: risk.accumulatedSeverity },
      intrinsicUrgency: 'now',
      confidence:
        fieldEntry(input.state.provenance, 'lateBlightRisk')?.confidence ??
        input.state.confidence,
      weakInputs: weaknessOf(input.state.provenance, 'lateBlightRisk'),
    },
  ];
}

function photoAdvice(input: AdvisorInput): Draft[] {
  const snapshot = input.latestSnapshot;
  if (!snapshot) return [certain({ kind: 'take_photo' }, 'info')];

  const daysAgo = snapshot.date.daysUntil(input.today);
  if (daysAgo > RECENT_PHOTO_DAYS) {
    return [certain({ kind: 'take_photo', daysSinceLastPhoto: daysAgo }, 'info')];
  }

  const diagnosis = snapshot.diagnosis;
  if (diagnosis.class === 'rejected') {
    return [certain({ kind: 'retake_photo', photographedOn: snapshot.date }, 'info')];
  }
  if (diagnosis.class === 'healthy') return [];

  // The diagnosis is never advice on its own (CLAUDE.md §18): it is put next
  // to what the weather model says about blight, including when that model
  // could not say anything at all.
  const risk = input.state?.lateBlightRisk;
  const blightWeather = risk === undefined ? 'unknown' : risk.sprayAdvised ? 'favourable' : 'not_favourable';

  return [
    {
      details: {
        kind: 'check_leaves',
        diagnosis: diagnosis.class,
        photographedOn: snapshot.date,
        daysAgo,
        blightWeather,
      },
      // Late blight can take a field in days; early blight is slower.
      intrinsicUrgency: diagnosis.class === 'late_blight' ? 'now' : 'soon',
      confidence: diagnosis.confidence,
      weakInputs: diagnosis.confidence < LOW_CONFIDENCE_THRESHOLD ? ['uncertain_photo'] : [],
    },
  ];
}

function harvestAdvice(input: AdvisorInput): Draft[] {
  const harvest = input.harvest;
  if (!harvest?.available || !('date' in harvest)) return [];
  if (harvest.daysFromToday > HARVEST_NOTICE_DAYS) return [];

  const weakInputs: WeakInput[] = ['projection'];
  if (harvest.method === 'stage_lengths') weakInputs.push('season_length_only', 'unreviewed_crop_data');

  return [
    {
      details: {
        kind: 'harvest_near',
        date: harvest.date,
        daysFromToday: harvest.daysFromToday,
        method: harvest.method,
      },
      intrinsicUrgency: 'soon',
      confidence: harvest.confidence,
      weakInputs,
    },
  ];
}

function weatherAnswerAdvice(input: AdvisorInput): Draft[] {
  // The question is always about yesterday, so an answer for yesterday or
  // today means there is nothing to ask.
  const yesterday = input.today.plusDays(-1);
  const answered =
    input.lastWeatherAnswer !== undefined && input.lastWeatherAnswer.daysUntil(yesterday) <= 0;
  return answered ? [] : [certain({ kind: 'report_weather' }, 'info')];
}

// --- Priority and honesty -------------------------------------------------

function finish(draft: Draft): Recommendation {
  const demoted =
    draft.confidence < LOW_CONFIDENCE_THRESHOLD && draft.intrinsicUrgency !== 'info';
  return {
    ...draft.details,
    intrinsicUrgency: draft.intrinsicUrgency,
    urgency: demoted ? lower(draft.intrinsicUrgency) : draft.intrinsicUrgency,
    confidence: draft.confidence,
    demoted,
    weakInputs: draft.weakInputs,
  };
}

const lower = (urgency: Urgency): Urgency => (urgency === 'now' ? 'soon' : 'info');

function byPriority(left: Recommendation, right: Recommendation): number {
  return (
    URGENCIES.indexOf(left.urgency) - URGENCIES.indexOf(right.urgency) ||
    right.confidence - left.confidence ||
    KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind)
  );
}

const fieldEntry = (
  provenance: readonly ProvenanceEntry[],
  field: string,
): ProvenanceEntry | undefined => provenance.find((entry) => entry.field === field);

/**
 * Names what weakened one field of a day's state.
 *
 * The source says what kind of weather it stood on. Anything below what that
 * source is worth on its own was taken off by provisional coefficients, which
 * is how unreviewed crop data shows up without the Advisor having to know
 * which coefficients each model used.
 */
function weaknessOf(provenance: readonly ProvenanceEntry[], field: string): WeakInput[] {
  const entry = fieldEntry(provenance, field);
  if (!entry) return [];

  const weak: WeakInput[] = [];
  const bySource = SOURCE_WEAKNESS[entry.source];
  if (bySource) weak.push(bySource);
  if (entry.confidence < SOURCE_BASE_CONFIDENCE[entry.source] - 1e-9) {
    weak.push('unreviewed_crop_data');
  }
  return weak;
}

const SOURCE_WEAKNESS: Readonly<Partial<Record<ProvenanceSource, WeakInput>>> = {
  synthetic_normals: 'synthetic_weather',
  climate_normals: 'typical_year_weather',
  manual_weather: 'farmer_weather_answers',
};

/** Distinct, in first-seen order, so the screen lists each reason once. */
function union(...lists: readonly (readonly WeakInput[])[]): WeakInput[] {
  return [...new Set(lists.flat())];
}
