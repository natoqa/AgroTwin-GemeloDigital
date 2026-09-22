import type { LocalDate } from '../model/LocalDate.js';
import type { Plot } from '../model/Plot.js';
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
 *
 * The whole `Plot` is passed, not just its coordinates, because the layers
 * need different parts of it: normals need the place, and the farmer's own
 * answers are keyed by which plot they were standing in.
 */
export interface WeatherPort {
  weatherFor(date: LocalDate, plot: Plot): Promise<DailyWeather | undefined>;
  /** Oldest first. Days the source cannot supply are simply absent. */
  weatherBetween(from: LocalDate, to: LocalDate, plot: Plot): Promise<readonly DailyWeather[]>;
}
