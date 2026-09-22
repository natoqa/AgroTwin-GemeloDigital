declare const hectaresBrand: unique symbol;
declare const degreesBrand: unique symbol;
declare const metersBrand: unique symbol;
declare const celsiusBrand: unique symbol;
declare const millimetersBrand: unique symbol;
declare const radiationBrand: unique symbol;
declare const degreeDaysBrand: unique symbol;

/**
 * Units of measure as branded numbers.
 *
 * A bare `number` is the classic way to add a latitude to an altitude and get
 * a plausible-looking answer. The brands make that a compile error, which
 * matters most here in the agronomy: Hargreaves-Samani takes a latitude in
 * *radians* derived from these degrees and a radiation in *millimetres of
 * equivalent evaporation* derived from megajoules, and a silent unit mix-up
 * would produce evapotranspiration numbers that look fine and are wrong.
 */

/** Surface area of a plot. */
export type Hectares = number & { readonly [hectaresBrand]: 'Hectares' };

/** An angle on the Earth's surface: latitude or longitude. */
export type Degrees = number & { readonly [degreesBrand]: 'Degrees' };

/** A length in metres. Used for altitude above sea level. */
export type Meters = number & { readonly [metersBrand]: 'Meters' };

/** A temperature in degrees Celsius. */
export type Celsius = number & { readonly [celsiusBrand]: 'Celsius' };

/** A depth of water: rainfall, irrigation, evapotranspiration, soil depletion. */
export type Millimeters = number & { readonly [millimetersBrand]: 'Millimeters' };

/** Radiation as MJ m⁻² day⁻¹, the unit FAO-56 works in. */
export type MegajoulesPerSquareMeterPerDay = number & {
  readonly [radiationBrand]: 'MegajoulesPerSquareMeterPerDay';
};

/** Accumulated thermal time, in degree-days above a base temperature. */
export type DegreeDays = number & { readonly [degreeDaysBrand]: 'DegreeDays' };

export const hectares = (value: number): Hectares => value as Hectares;
export const degrees = (value: number): Degrees => value as Degrees;
export const meters = (value: number): Meters => value as Meters;
export const celsius = (value: number): Celsius => value as Celsius;
export const millimeters = (value: number): Millimeters => value as Millimeters;
export const megajoulesPerSquareMeterPerDay = (
  value: number,
): MegajoulesPerSquareMeterPerDay => value as MegajoulesPerSquareMeterPerDay;
export const degreeDays = (value: number): DegreeDays => value as DegreeDays;

/**
 * Radiation as the depth of water it could evaporate.
 *
 * FAO-56 Equation 20: equivalent evaporation [mm day⁻¹] = 0.408 × radiation
 * [MJ m⁻² day⁻¹], the factor being the inverse of the latent heat of
 * vaporisation (1/2.45). The Hargreaves equation wants Ra in these units, not
 * in megajoules, and that conversion is the easiest step in the whole chain to
 * forget.
 */
export const EQUIVALENT_EVAPORATION_FACTOR = 0.408;

export const asEquivalentEvaporation = (
  radiation: MegajoulesPerSquareMeterPerDay,
): Millimeters => millimeters(radiation * EQUIVALENT_EVAPORATION_FACTOR);

export const DEGREES_TO_RADIANS = Math.PI / 180;

export const toRadians = (value: Degrees): number => value * DEGREES_TO_RADIANS;
