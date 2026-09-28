import { describe, expect, it } from 'vitest';
import { PlotNotFoundError } from '../errors/PlotNotFoundError.js';
import { epochMillis } from '../model/EpochMillis.js';
import { plotId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import type { WeatherObservation } from '../model/WeatherObservation.js';
import type { WeatherObservationRepositoryPort } from '../ports/WeatherObservationRepositoryPort.js';
import { InMemoryPlots, countingIds, fixedClock } from '../testing/doubles.js';
import { createPlotUseCase } from './CreatePlot.js';
import { recordWeatherObservationUseCase } from './RecordWeatherObservation.js';

const NOW = epochMillis(LocalDate.of(2026, 9, 20).toEpochDay() * 86_400_000 + 12 * 3_600_000);

class InMemoryWeatherObservations implements WeatherObservationRepositoryPort {
  readonly items = new Map<string, WeatherObservation>();

  private key(plot: string, date: string): string {
    return `${plot}|${date}`;
  }

  async save(observation: WeatherObservation): Promise<void> {
    this.items.set(this.key(observation.plotId, observation.date.toString()), observation);
  }
  async findByDate(plot: string, date: LocalDate): Promise<WeatherObservation | undefined> {
    return this.items.get(this.key(plot, date.toString()));
  }
  async listBetween(): Promise<readonly WeatherObservation[]> {
    return [...this.items.values()];
  }
  async listAll(): Promise<readonly WeatherObservation[]> {
    return [...this.items.values()];
  }
  async deleteAll(): Promise<void> {
    this.items.clear();
  }
}

async function subject() {
  const plots = new InMemoryPlots();
  const weatherObservations = new InMemoryWeatherObservations();
  const clock = fixedClock(NOW);

  const plot = await createPlotUseCase({ plots, clock, ids: countingIds() })({
    name: 'Chacra de arriba',
  });
  const execute = recordWeatherObservationUseCase({ plots, weatherObservations, clock });

  return { execute, plot, weatherObservations };
}

describe('recordWeatherObservationUseCase', () => {
  it('records yesterday by default, because that is the day being asked about', async () => {
    const { execute, plot } = await subject();

    const observation = await execute({ plotId: plot.id, rainfall: 'none', coldNight: false });

    expect(observation.date.toString()).toBe('2026-09-19');
    expect(observation.recordedAt).toBe(NOW);
  });

  it('stores what the farmer answered', async () => {
    const { execute, plot, weatherObservations } = await subject();

    await execute({ plotId: plot.id, rainfall: 'a_lot', coldNight: true });

    const stored = await weatherObservations.findByDate(plot.id, LocalDate.of(2026, 9, 19));
    expect(stored?.rainfall).toBe('a_lot');
    expect(stored?.coldNight).toBe(true);
  });

  it('accepts an explicit day, for a farmer catching up', async () => {
    const { execute, plot } = await subject();

    const observation = await execute({
      plotId: plot.id,
      rainfall: 'a_little',
      coldNight: false,
      date: LocalDate.of(2026, 9, 15),
    });

    expect(observation.date.toString()).toBe('2026-09-15');
  });

  it('replaces an earlier answer about the same day', async () => {
    const { execute, plot, weatherObservations } = await subject();

    await execute({ plotId: plot.id, rainfall: 'none', coldNight: false });
    await execute({ plotId: plot.id, rainfall: 'a_lot', coldNight: true });

    expect(await weatherObservations.listAll()).toHaveLength(1);
    expect((await weatherObservations.listAll())[0]?.rainfall).toBe('a_lot');
  });

  it('refuses a plot that does not exist', async () => {
    const { execute } = await subject();

    await expect(
      execute({ plotId: plotId('missing'), rainfall: 'none', coldNight: false }),
    ).rejects.toThrow(PlotNotFoundError);
  });
});
