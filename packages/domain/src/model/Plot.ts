import { InvalidAreaError } from '../errors/InvalidAreaError.js';
import { InvalidPlotNameError } from '../errors/InvalidPlotNameError.js';
import type { EpochMillis } from './EpochMillis.js';
import type { PlotId } from './Ids.js';
import { createPlotLocation } from './PlotLocation.js';
import type { PlotLocation, PlotLocationInput } from './PlotLocation.js';
import { hectares } from './Units.js';
import type { Hectares } from './Units.js';

const MAX_NAME_LENGTH = 60;

/**
 * A typo guard, not agronomy. Smallholder plots in the sierra are fractions of
 * a hectare; anything past this is a farmer who typed square metres into the
 * hectares box, and the twin would rather ask again than simulate a ranch.
 */
const MAX_AREA_HECTARES = 1000;

/**
 * A parcel of land the farmer works.
 *
 * Area and location are optional on purpose. Registering a plot and
 * photographing a leaf must work the moment the app is installed, standing in
 * a field with no GPS fix and no idea of the hectares. What is missing stays
 * missing and visible, instead of being defaulted to a number that later reads
 * like a measurement.
 */
export interface Plot {
  readonly id: PlotId;
  readonly name: string;
  readonly createdAt: EpochMillis;
  readonly area?: Hectares;
  readonly location?: PlotLocation;
}

export interface CreatePlotProps {
  readonly id: PlotId;
  readonly name: string;
  readonly createdAt: EpochMillis;
  readonly area?: number;
  readonly location?: PlotLocationInput;
}

/**
 * Builds a plot, rejecting names the farmer could not tell apart.
 *
 * The name is trimmed rather than refused for surrounding spaces: a keyboard
 * on a phone adds them constantly and that is not the farmer's mistake.
 */
export function createPlot(input: CreatePlotProps): Plot {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new InvalidPlotNameError(input.name, 'it is empty');
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new InvalidPlotNameError(input.name, `it is longer than ${MAX_NAME_LENGTH} characters`);
  }

  return {
    id: input.id,
    name,
    createdAt: input.createdAt,
    ...(input.area === undefined ? {} : { area: validArea(input.area) }),
    ...(input.location === undefined ? {} : { location: createPlotLocation(input.location) }),
  };
}

export interface PlotDetailsUpdate {
  readonly name?: string;
  /** `null` clears the stored area. */
  readonly area?: number | null;
  /** `null` clears the stored location. */
  readonly location?: PlotLocationInput | null;
}

/**
 * Returns the plot with its details changed.
 *
 * Plots created before Phase 2 have no location, and Phase 3 cannot estimate
 * evapotranspiration without a latitude, so editing has to exist. Clearing is
 * explicit (`null`) rather than implied by omission: a screen that only edits
 * the name must not silently erase a latitude the farmer typed last week.
 */
export function updatePlotDetails(plot: Plot, update: PlotDetailsUpdate): Plot {
  const named = update.name === undefined ? plot : createPlot({ ...toProps(plot), name: update.name });

  const area =
    update.area === undefined ? named.area : update.area === null ? undefined : validArea(update.area);
  const location =
    update.location === undefined
      ? named.location
      : update.location === null
        ? undefined
        : createPlotLocation(update.location);

  return {
    id: named.id,
    name: named.name,
    createdAt: named.createdAt,
    ...(area === undefined ? {} : { area }),
    ...(location === undefined ? {} : { location }),
  };
}

function toProps(plot: Plot): CreatePlotProps {
  return {
    id: plot.id,
    name: plot.name,
    createdAt: plot.createdAt,
    ...(plot.area === undefined ? {} : { area: plot.area }),
    ...(plot.location === undefined
      ? {}
      : {
          location: {
            latitude: plot.location.latitude,
            longitude: plot.location.longitude,
            ...(plot.location.altitude === undefined ? {} : { altitude: plot.location.altitude }),
          },
        }),
  };
}

function validArea(value: number): Hectares {
  if (!Number.isFinite(value) || value <= 0) {
    throw new InvalidAreaError(value, 'it must be greater than zero');
  }
  if (value > MAX_AREA_HECTARES) {
    throw new InvalidAreaError(value, `it is larger than ${MAX_AREA_HECTARES} hectares`);
  }
  return hectares(value);
}
