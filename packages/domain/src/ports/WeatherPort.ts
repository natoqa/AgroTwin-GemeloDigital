import type { LocalDate } from '../model/LocalDate.js';
import type { PlotLocation } from '../model/PlotLocation.js';
import type { DailyWeather } from '../model/Weather.js';

/**
 * Where the twin's weather comes from.
 *
 * Three adapters implement this (CLAUDE.md §9) and they are layered, not
 * alternatives: climatological normals are the floor, the farmer's answers
 * correct them for this plot on this day, and a cached forecast improves on
 * both when there happened to be a network. None of them is ever required.
 *
 * A source returns `undefined` for a day it knows nothing about. It does not
 * return a fabricated average.
 */
export interface WeatherPort {
  weatherFor(date: LocalDate, location: PlotLocation): Promise<DailyWeather | undefined>;
  /** Oldest first. Days the source cannot supply are simply absent. */
  weatherBetween(
    from: LocalDate,
    to: LocalDate,
    location: PlotLocation,
  ): Promise<readonly DailyWeather[]>;
}
