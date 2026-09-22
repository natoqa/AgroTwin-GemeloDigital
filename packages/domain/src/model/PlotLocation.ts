import { InvalidCoordinatesError } from '../errors/InvalidCoordinatesError.js';
import { degrees, meters } from './Units.js';
import type { Degrees, Meters } from './Units.js';

/** Physical bounds, not agronomic ones: the deepest land and the highest peak. */
const MIN_ALTITUDE_METERS = -500;
const MAX_ALTITUDE_METERS = 9000;

/**
 * Where the plot is.
 *
 * This is the input Phase 3 cannot do without: Hargreaves-Samani derives
 * extraterrestrial radiation from latitude and day of year, and the water
 * balance uses altitude. It is optional on a `Plot` because a farmer must be
 * able to register a plot and take a photograph today, without a GPS fix. A
 * plot with no location simply cannot be simulated, and the twin will have to
 * say so rather than guess a latitude.
 *
 * Phase 2 fills it by hand. A `GeolocationPort` is a later decision: it adds a
 * permission prompt, and CLAUDE.md §3 makes GPS raw data that never leaves the
 * device, so it deserves its own design rather than a free ride here.
 */
export interface PlotLocation {
  readonly latitude: Degrees;
  readonly longitude: Degrees;
  /** Above sea level. Absent when the farmer does not know it. */
  readonly altitude?: Meters;
}

export interface PlotLocationInput {
  readonly latitude: number;
  readonly longitude: number;
  readonly altitude?: number;
}

export function createPlotLocation(input: PlotLocationInput): PlotLocation {
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    throw new InvalidCoordinatesError('latitude', input.latitude, 'it must be between -90 and 90');
  }
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    throw new InvalidCoordinatesError(
      'longitude',
      input.longitude,
      'it must be between -180 and 180',
    );
  }
  if (input.altitude !== undefined) {
    if (
      !Number.isFinite(input.altitude) ||
      input.altitude < MIN_ALTITUDE_METERS ||
      input.altitude > MAX_ALTITUDE_METERS
    ) {
      throw new InvalidCoordinatesError(
        'altitude',
        input.altitude,
        `it must be between ${MIN_ALTITUDE_METERS} and ${MAX_ALTITUDE_METERS} metres`,
      );
    }
  }

  return {
    latitude: degrees(input.latitude),
    longitude: degrees(input.longitude),
    ...(input.altitude === undefined ? {} : { altitude: meters(input.altitude) }),
  };
}
