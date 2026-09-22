import type { DailyWeather, LocalDate, PlotLocation, WeatherPort } from '@agrotwin/domain';

/**
 * An opportunistic cache in front of a network source, and never a requirement.
 *
 * **On where the network may point.** CLAUDE.md §9 asks for this adapter while
 * §3 and §18 forbid any cloud service or remote API. The two are reconciled by
 * §3's own carve-out: a LAN hub with no route to the internet is allowed. So
 * the fetcher is injected and deliberately left unimplemented in this phase,
 * and the only admissible implementation is one that talks to the LAN hub.
 * Nothing here reaches the internet, and nothing here can be made to without
 * somebody supplying a fetcher that does.
 *
 * Whatever the fetcher returns is remembered, so a day fetched once stays
 * available afterwards with no network at all. A fetcher that throws, times
 * out or is simply absent costs nothing: the wrapped source answers.
 */
export interface WeatherFetcher {
  fetch(date: LocalDate, location: PlotLocation): Promise<DailyWeather | undefined>;
}

export class CachedNetworkWeatherAdapter implements WeatherPort {
  private readonly cache = new Map<string, DailyWeather>();

  constructor(
    private readonly fallback: WeatherPort,
    private readonly fetcher?: WeatherFetcher,
  ) {}

  async weatherFor(date: LocalDate, location: PlotLocation): Promise<DailyWeather | undefined> {
    const key = date.toString();

    const cached = this.cache.get(key);
    if (cached) return cached;

    const fetched = await this.tryFetch(date, location);
    if (fetched) {
      this.cache.set(key, fetched);
      return fetched;
    }

    return this.fallback.weatherFor(date, location);
  }

  async weatherBetween(
    from: LocalDate,
    to: LocalDate,
    location: PlotLocation,
  ): Promise<readonly DailyWeather[]> {
    const days: DailyWeather[] = [];
    for (let cursor = from; cursor.daysUntil(to) >= 0; cursor = cursor.plusDays(1)) {
      const day = await this.weatherFor(cursor, location);
      if (day) days.push(day);
    }
    return days;
  }

  private async tryFetch(
    date: LocalDate,
    location: PlotLocation,
  ): Promise<DailyWeather | undefined> {
    if (!this.fetcher) return undefined;
    try {
      return await this.fetcher.fetch(date, location);
    } catch {
      // No network is the normal case here, not an error worth surfacing.
      return undefined;
    }
  }
}
