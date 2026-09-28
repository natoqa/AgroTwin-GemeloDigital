import { describe, expect, it } from 'vitest';
import type { BlightRisk } from '../agronomy/LateBlightRisk.js';
import type { DiagnosisClass } from '../model/Diagnosis.js';
import { epochMillis } from '../model/EpochMillis.js';
import { campaignId, plotId, snapshotId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import type { ProvenanceSource } from '../model/Provenance.js';
import type { TwinSnapshot } from '../model/TwinSnapshot.js';
import { degreeDays, millimeters } from '../model/Units.js';
import { SOURCE_BASE_CONFIDENCE } from '../model/Weather.js';
import {
  HARVEST_NOTICE_DAYS,
  LOW_CONFIDENCE_THRESHOLD,
  RECENT_PHOTO_DAYS,
  WATER_LOOKAHEAD_DAYS,
  advise,
} from './Advisor.js';
import type { AdvisorInput, Recommendation } from './Advisor.js';
import type { TwinDayState } from './BehaviorEngine.js';
import type { HarvestEstimate, WaterProjection } from './Simulator.js';

const TODAY = LocalDate.of(2026, 9, 20);

/**
 * A day's state with only what the Advisor reads made explicit.
 *
 * `confidence` is the water balance's, and by default it equals the source's
 * own base confidence: the day rests on reviewed coefficients unless a test
 * says otherwise.
 */
function state(options: {
  underStress?: boolean;
  depletion?: number;
  source?: ProvenanceSource;
  confidence?: number;
  blight?: BlightRisk;
  date?: LocalDate;
} = {}): TwinDayState {
  const source = options.source ?? 'network_weather_cache';
  const confidence = options.confidence ?? SOURCE_BASE_CONFIDENCE[source];
  return {
    date: options.date ?? TODAY,
    dayOfCampaign: 19,
    accumulatedGdd: degreeDays(150),
    cropStage: 'initial',
    cropCoefficient: 0.5,
    referenceEt: millimeters(4),
    cropEt: millimeters(2),
    waterBalance: {
      depletion: millimeters(options.depletion ?? 10),
      actualEt: millimeters(2),
      deepPercolation: millimeters(0),
      stressCoefficient: options.underStress ? 0.8 : 1,
      underStress: options.underStress ?? false,
    },
    ...(options.blight === undefined ? {} : { lateBlightRisk: options.blight }),
    confidence,
    provenance: [
      { field: 'accumulatedGdd', source, confidence },
      { field: 'waterBalance', source, confidence },
      ...(options.blight === undefined ? [] : [{ field: 'lateBlightRisk', source, confidence }]),
    ],
  };
}

function water(options: { daysUntilStress?: number; confidence?: number; source?: ProvenanceSource } = {}): WaterProjection {
  const today = state();
  const projected = [1, 2, 3].map((offset) =>
    state({
      date: TODAY.plusDays(offset),
      ...(options.source === undefined ? {} : { source: options.source }),
      underStress: options.daysUntilStress !== undefined && offset >= options.daysUntilStress,
    }),
  );
  return {
    available: true,
    today,
    projected,
    end: projected[2] ?? today,
    stressedToday: false,
    ...(options.daysUntilStress === undefined
      ? {}
      : {
          daysUntilStress: options.daysUntilStress,
          stressStartsOn: TODAY.plusDays(options.daysUntilStress),
        }),
    ifWateredToday: {},
    confidence: options.confidence ?? 0.7,
  };
}

function snapshot(diagnosis: DiagnosisClass, daysAgo: number, confidence = 0.9): TwinSnapshot {
  const date = TODAY.plusDays(-daysAgo);
  return {
    id: snapshotId('s1'),
    plotId: plotId('p1'),
    campaignId: campaignId('c1'),
    at: epochMillis(date.toEpochDay() * 86_400_000),
    date,
    diagnosis: { class: diagnosis, confidence, modelVersion: 'mock-1' },
    confidence,
    provenance: [{ field: 'diagnosis', source: 'image_diagnosis', confidence }],
  };
}

/**
 * A campaign that is otherwise in order: photographed, answered, located.
 * An override set to `undefined` removes that input altogether.
 */
const input = (
  overrides: { [K in keyof AdvisorInput]?: AdvisorInput[K] | undefined } = {},
): AdvisorInput => {
  const merged: Record<string, unknown> = {
    active: true,
    today: TODAY,
    state: state(),
    water: water(),
    latestSnapshot: snapshot('healthy', 1),
    lastWeatherAnswer: TODAY.plusDays(-1),
    ...overrides,
  };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  return merged as unknown as AdvisorInput;
};

const kinds = (list: readonly Recommendation[]) => list.map((entry) => entry.kind);
const find = <K extends Recommendation['kind']>(list: readonly Recommendation[], kind: K) =>
  list.find((entry): entry is Extract<Recommendation, { kind: K }> => entry.kind === kind);

describe('advise', () => {
  it('has nothing to say about a harvested campaign', () => {
    expect(advise(input({ active: false, state: state({ underStress: true }) }))).toEqual([]);
  });

  it('only says the soil is fine when everything else is in order', () => {
    const advice = advise(input());

    expect(kinds(advice)).toEqual(['water_ok']);
    expect(advice[0]?.urgency).toBe('info');
  });

  describe('water', () => {
    it('says to water now when the crop is past readily available water', () => {
      const advice = advise(input({ state: state({ underStress: true, depletion: 48 }) }));

      const now = find(advice, 'irrigate_now');
      expect(now).toMatchObject({ urgency: 'now', demoted: false, weakInputs: [] });
      expect(now?.depletion).toBe(48);
      expect(advice[0]?.kind).toBe('irrigate_now');
    });

    it('warns ahead of a stress coming within the lookahead', () => {
      const advice = advise(input({ water: water({ daysUntilStress: WATER_LOOKAHEAD_DAYS }) }));

      const soon = find(advice, 'irrigate_soon');
      expect(soon).toMatchObject({ urgency: 'soon', daysUntilStress: WATER_LOOKAHEAD_DAYS });
      expect(soon?.stressStartsOn.equals(TODAY.plusDays(WATER_LOOKAHEAD_DAYS))).toBe(true);
      expect(soon?.weakInputs).toContain('projection');
    });

    it('does not cry wolf about a stress beyond the lookahead', () => {
      const advice = advise(input({ water: water({ daysUntilStress: WATER_LOOKAHEAD_DAYS + 1 }) }));

      expect(kinds(advice)).toEqual(['water_ok']);
    });

    it('says nothing about water when there is no state to judge', () => {
      expect(kinds(advise(input({ state: undefined, water: undefined })))).toEqual([]);
      expect(kinds(advise(input({ water: undefined })))).toEqual([]);
    });
  });

  describe('low confidence (CLAUDE.md §8.4)', () => {
    it('moves weak advice down one level and says what made it weak', () => {
      // A thirsty crop, on invented weather and unreviewed coefficients: the
      // situation of every plot until SENAMHI data arrives.
      const weak = state({ underStress: true, source: 'synthetic_normals', confidence: 0.004 });
      const advice = advise(input({ state: weak }));

      const now = find(advice, 'irrigate_now');
      expect(now).toMatchObject({ intrinsicUrgency: 'now', urgency: 'soon', demoted: true });
      expect(now?.weakInputs).toEqual(['synthetic_weather', 'unreviewed_crop_data']);
    });

    it('never drops it: weak advice about a thirsty crop is still worth reading', () => {
      const weak = state({ underStress: true, source: 'climate_normals', confidence: 0.05 });

      expect(kinds(advise(input({ state: weak })))).toContain('irrigate_now');
    });

    it('keeps advice at the threshold where it is', () => {
      const edge = state({ underStress: true, source: 'network_weather_cache', confidence: LOW_CONFIDENCE_THRESHOLD });

      expect(find(advise(input({ state: edge })), 'irrigate_now')?.demoted).toBe(false);
    });

    it('names the farmer answers and the typical year as what they are', () => {
      const manual = advise(input({ state: state({ underStress: true, source: 'manual_weather' }) }));
      const normals = advise(input({ water: water({ source: 'climate_normals', confidence: 0.1 }) }));

      expect(find(manual, 'irrigate_now')?.weakInputs).toEqual(['farmer_weather_answers']);
      expect(find(normals, 'water_ok')?.weakInputs).toEqual(['typical_year_weather', 'projection']);
    });

    it('ranks the stronger of two equally urgent pieces of advice first', () => {
      const advice = advise(
        input({
          state: state({ underStress: true, confidence: 0.7 }),
          latestSnapshot: snapshot('late_blight', 0, 0.95),
        }),
      );

      expect(kinds(advice).slice(0, 2)).toEqual(['check_leaves', 'irrigate_now']);
    });
  });

  describe('late blight', () => {
    const favourable: BlightRisk = { dailySeverity: 3, accumulatedSeverity: 21, sprayAdvised: true };

    it('says to consider fungicide once the weather model advises it', () => {
      const advice = advise(input({ state: state({ blight: favourable }) }));

      expect(find(advice, 'consider_fungicide')).toMatchObject({
        urgency: 'now',
        accumulatedSeverity: 21,
      });
    });

    it('says nothing when the model has not reached its threshold or cannot judge', () => {
      const calm: BlightRisk = { dailySeverity: 0, accumulatedSeverity: 4, sprayAdvised: false };

      expect(kinds(advise(input({ state: state({ blight: calm }) })))).not.toContain(
        'consider_fungicide',
      );
      expect(kinds(advise(input()))).not.toContain('consider_fungicide');
    });
  });

  describe('photographs, never on their own', () => {
    it('asks to check the leaves after a recent blight diagnosis, with the weather beside it', () => {
      const unknown = find(advise(input({ latestSnapshot: snapshot('late_blight', 2) })), 'check_leaves');
      expect(unknown).toMatchObject({
        urgency: 'now',
        diagnosis: 'late_blight',
        daysAgo: 2,
        blightWeather: 'unknown',
      });

      const agreed = find(
        advise(
          input({
            latestSnapshot: snapshot('early_blight', 0),
            state: state({ blight: { dailySeverity: 3, accumulatedSeverity: 20, sprayAdvised: true } }),
          }),
        ),
        'check_leaves',
      );
      expect(agreed).toMatchObject({ urgency: 'soon', blightWeather: 'favourable' });

      const disagreed = find(
        advise(
          input({
            latestSnapshot: snapshot('late_blight', 0),
            state: state({ blight: { dailySeverity: 0, accumulatedSeverity: 2, sprayAdvised: false } }),
          }),
        ),
        'check_leaves',
      );
      expect(disagreed?.blightWeather).toBe('not_favourable');
    });

    it('demotes a diagnosis the classifier was not sure of', () => {
      const advice = advise(input({ latestSnapshot: snapshot('late_blight', 0, 0.4) }));

      expect(find(advice, 'check_leaves')).toMatchObject({
        urgency: 'soon',
        demoted: true,
        weakInputs: ['uncertain_photo'],
      });
    });

    it('asks for another photograph after a rejected one', () => {
      expect(kinds(advise(input({ latestSnapshot: snapshot('rejected', 0) })))).toContain(
        'retake_photo',
      );
    });

    it('asks for a photograph when there is none, or the last one is old', () => {
      expect(find(advise(input({ latestSnapshot: undefined })), 'take_photo')).toBeDefined();

      const stale = find(
        advise(input({ latestSnapshot: snapshot('late_blight', RECENT_PHOTO_DAYS + 1) })),
        'take_photo',
      );
      expect(stale?.daysSinceLastPhoto).toBe(RECENT_PHOTO_DAYS + 1);
      // An old diagnosis is history: it does not send the farmer to the field.
      expect(
        kinds(advise(input({ latestSnapshot: snapshot('late_blight', RECENT_PHOTO_DAYS + 1) }))),
      ).not.toContain('check_leaves');
    });
  });

  describe('harvest', () => {
    const estimate = (daysFromToday: number, method: 'thermal_time' | 'stage_lengths', confidence: number): HarvestEstimate => ({
      available: true,
      method,
      date: TODAY.plusDays(daysFromToday),
      daysFromToday,
      confidence,
    });

    it('mentions a harvest within the notice period', () => {
      const advice = advise(input({ harvest: estimate(HARVEST_NOTICE_DAYS, 'thermal_time', 0.9) }));

      expect(find(advice, 'harvest_near')).toMatchObject({
        urgency: 'soon',
        daysFromToday: HARVEST_NOTICE_DAYS,
        weakInputs: ['projection'],
      });
    });

    it('marks a date from the season length alone as weak', () => {
      const advice = advise(input({ harvest: estimate(5, 'stage_lengths', 0.13) }));

      expect(find(advice, 'harvest_near')).toMatchObject({
        urgency: 'info',
        demoted: true,
        weakInputs: ['projection', 'season_length_only', 'unreviewed_crop_data'],
      });
    });

    it('stays quiet about a distant or unknown harvest', () => {
      expect(kinds(advise(input({ harvest: estimate(HARVEST_NOTICE_DAYS + 1, 'thermal_time', 0.9) })))).not.toContain('harvest_near');
      expect(
        kinds(advise(input({ harvest: { available: true, method: 'thermal_time', reached: false, confidence: 0.3 } }))),
      ).not.toContain('harvest_near');
      expect(
        kinds(advise(input({ harvest: { available: false, reason: 'no_weather' } }))),
      ).not.toContain('harvest_near');
    });
  });

  describe('what the twin needs from the farmer', () => {
    it('asks for the location first when there is none', () => {
      const advice = advise(input({ state: undefined, water: undefined, blocker: 'no_location' }));

      expect(find(advice, 'add_location')).toMatchObject({ urgency: 'soon', confidence: 1 });
    });

    it('says when the crop data is what is missing, which is not the farmer’s to fix', () => {
      const advice = advise(input({ state: undefined, water: undefined, blocker: 'missing_coefficients' }));

      expect(find(advice, 'crop_data_missing')?.urgency).toBe('info');
      expect(kinds(advise(input({ blocker: 'no_weather' })))).toEqual(['water_ok']);
    });

    it('asks about yesterday’s weather until it is answered', () => {
      expect(kinds(advise(input({ lastWeatherAnswer: undefined })))).toContain('report_weather');
      expect(kinds(advise(input({ lastWeatherAnswer: TODAY.plusDays(-2) })))).toContain('report_weather');
      expect(kinds(advise(input({ lastWeatherAnswer: TODAY })))).not.toContain('report_weather');
    });
  });

  it('orders by urgency, then confidence, then a fixed order, the same every time', () => {
    const busy = input({
      state: state({ underStress: true, blight: { dailySeverity: 4, accumulatedSeverity: 30, sprayAdvised: true } }),
      latestSnapshot: undefined,
      lastWeatherAnswer: undefined,
    });

    const advice = advise(busy);

    expect(kinds(advice)).toEqual([
      'irrigate_now',
      'consider_fungicide',
      'take_photo',
      'report_weather',
    ]);
    expect(advise(busy)).toEqual(advice);
  });
});
