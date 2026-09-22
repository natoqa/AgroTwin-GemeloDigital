declare const hectaresBrand: unique symbol;
declare const degreesBrand: unique symbol;
declare const metersBrand: unique symbol;

/**
 * Units of measure as branded numbers.
 *
 * A bare `number` is the classic way to add a latitude to an altitude and get
 * a plausible-looking answer. The brands make that a compile error, which
 * matters most in Phase 3: Hargreaves-Samani takes a latitude in *radians*
 * derived from these degrees, and a silent unit mix-up there would produce
 * evapotranspiration numbers that look fine and are wrong.
 *
 * Only the units Phase 2 actually stores live here. Millimetres and degrees
 * Celsius arrive with the water balance, in the phase that needs them.
 */

/** Surface area of a plot. */
export type Hectares = number & { readonly [hectaresBrand]: 'Hectares' };

/** An angle on the Earth's surface: latitude or longitude. */
export type Degrees = number & { readonly [degreesBrand]: 'Degrees' };

/** A length in metres. Used for altitude above sea level. */
export type Meters = number & { readonly [metersBrand]: 'Meters' };

/**
 * Narrows a raw number to `Hectares`.
 *
 * Callers validate the range: the domain has no opinion on how big a plot may
 * be, only on the unit it is expressed in.
 */
export const hectares = (value: number): Hectares => value as Hectares;

export const degrees = (value: number): Degrees => value as Degrees;

export const meters = (value: number): Meters => value as Meters;
