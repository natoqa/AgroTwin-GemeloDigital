import { InvalidObservationNoteError } from '../errors/InvalidObservationNoteError.js';
import type { Diagnosis } from './Diagnosis.js';
import type { EpochMillis } from './EpochMillis.js';
import type { CampaignId, ImageRef, ObservationId, PlotId } from './Ids.js';
import type { LocalDate } from './LocalDate.js';

const MAX_NOTE_LENGTH = 280;

/**
 * Something the farmer recorded in the field, and what the classifier made of
 * it.
 *
 * An observation is the *evidence*; a `TwinSnapshot` is the *state* the twin
 * derived from it. Keeping them apart is what lets the original photographs be
 * deleted without the twin losing its memory: the retention policy clears
 * `imageRef`, and the diagnosis, the date and the thumbnail stay.
 */
export interface Observation {
  readonly id: ObservationId;
  readonly plotId: PlotId;
  readonly campaignId: CampaignId;
  readonly at: EpochMillis;
  readonly date: LocalDate;
  readonly diagnosis: Diagnosis;
  /** The full photograph. Absent once retention has purged it. */
  readonly imageRef?: ImageRef;
  /** The small copy, kept for good. */
  readonly thumbnailRef?: ImageRef;
  /** The farmer's own words, if they wrote any. */
  readonly note?: string;
}

export interface CreateObservationProps {
  readonly id: ObservationId;
  readonly plotId: PlotId;
  readonly campaignId: CampaignId;
  readonly at: EpochMillis;
  readonly date: LocalDate;
  readonly diagnosis: Diagnosis;
  readonly imageRef?: ImageRef;
  readonly thumbnailRef?: ImageRef;
  readonly note?: string;
}

export function createObservation(input: CreateObservationProps): Observation {
  const note = input.note?.trim();
  if (note !== undefined && note.length > MAX_NOTE_LENGTH) {
    throw new InvalidObservationNoteError(note.length, MAX_NOTE_LENGTH);
  }

  return {
    id: input.id,
    plotId: input.plotId,
    campaignId: input.campaignId,
    at: input.at,
    date: input.date,
    diagnosis: input.diagnosis,
    ...(input.imageRef === undefined ? {} : { imageRef: input.imageRef }),
    ...(input.thumbnailRef === undefined ? {} : { thumbnailRef: input.thumbnailRef }),
    ...(note === undefined || note.length === 0 ? {} : { note }),
  };
}

/**
 * Returns the observation with its original photograph forgotten.
 *
 * Only `imageRef` goes. Everything the twin reasons with survives, which is
 * precisely the property the retention policy trades storage for.
 */
export function withOriginalPurged(observation: Observation): Observation {
  return {
    id: observation.id,
    plotId: observation.plotId,
    campaignId: observation.campaignId,
    at: observation.at,
    date: observation.date,
    diagnosis: observation.diagnosis,
    ...(observation.thumbnailRef === undefined ? {} : { thumbnailRef: observation.thumbnailRef }),
    ...(observation.note === undefined ? {} : { note: observation.note }),
  };
}

/** Whether the full photograph is still on the device. */
export const hasOriginalImage = (observation: Observation): boolean =>
  observation.imageRef !== undefined;
