import { InvalidPlotNameError } from '../errors/InvalidPlotNameError.js';
import type { EpochMillis } from './EpochMillis.js';
import type { PlotId } from './Ids.js';

const MAX_NAME_LENGTH = 60;

/**
 * A parcel of land the farmer works.
 *
 * Phase 1 keeps this deliberately thin: a name and when it was created. Area,
 * geometry, soil and campaigns arrive in Phase 2, which owns the full model.
 */
export interface Plot {
  readonly id: PlotId;
  readonly name: string;
  readonly createdAt: EpochMillis;
}

/**
 * Builds a plot, rejecting names the farmer could not tell apart.
 *
 * The name is trimmed rather than refused for surrounding spaces: a keyboard
 * on a phone adds them constantly and that is not the farmer's mistake.
 */
export function createPlot(input: { id: PlotId; name: string; createdAt: EpochMillis }): Plot {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new InvalidPlotNameError(input.name, 'it is empty');
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new InvalidPlotNameError(input.name, `it is longer than ${MAX_NAME_LENGTH} characters`);
  }
  return { id: input.id, name, createdAt: input.createdAt };
}
