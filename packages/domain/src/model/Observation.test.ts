import { describe, expect, it } from 'vitest';
import { createObservation, hasOriginalImage, withOriginalPurged } from './Observation.js';
import { epochMillis } from './EpochMillis.js';
import { campaignId, imageRef, observationId, plotId } from './Ids.js';
import { LocalDate } from './LocalDate.js';
import type { Diagnosis } from './Diagnosis.js';
import { InvalidObservationNoteError } from '../errors/InvalidObservationNoteError.js';

const DIAGNOSIS: Diagnosis = { class: 'late_blight', confidence: 0.78, modelVersion: 'mock-1' };

const props = {
  id: observationId('o1'),
  plotId: plotId('p1'),
  campaignId: campaignId('c1'),
  at: epochMillis(1_790_114_400_000),
  date: LocalDate.of(2026, 9, 22),
  diagnosis: DIAGNOSIS,
  imageRef: imageRef('original-1'),
  thumbnailRef: imageRef('thumbnail-1'),
};

describe('createObservation', () => {
  it('keeps the evidence together with what was made of it', () => {
    const observation = createObservation(props);

    expect(observation.diagnosis).toEqual(DIAGNOSIS);
    expect(observation.imageRef).toBe('original-1');
    expect(observation.thumbnailRef).toBe('thumbnail-1');
    expect(hasOriginalImage(observation)).toBe(true);
  });

  it('trims a note and drops it when nothing is left', () => {
    expect(createObservation({ ...props, note: '  hojas con manchas  ' }).note).toBe(
      'hojas con manchas',
    );
    expect(createObservation({ ...props, note: '   ' }).note).toBeUndefined();
  });

  it('refuses a note longer than the limit', () => {
    expect(() => createObservation({ ...props, note: 'a'.repeat(281) })).toThrow(
      InvalidObservationNoteError,
    );
  });
});

describe('withOriginalPurged', () => {
  it('forgets the photograph and keeps everything the twin reasons with', () => {
    const purged = withOriginalPurged(createObservation({ ...props, note: 'manchas' }));

    expect(hasOriginalImage(purged)).toBe(false);
    expect('imageRef' in purged).toBe(false);
    expect(purged.thumbnailRef).toBe('thumbnail-1');
    expect(purged.diagnosis).toEqual(DIAGNOSIS);
    expect(purged.date.toString()).toBe('2026-09-22');
    expect(purged.note).toBe('manchas');
  });
});
