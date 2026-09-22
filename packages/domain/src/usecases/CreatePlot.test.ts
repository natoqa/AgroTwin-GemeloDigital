import { describe, expect, it } from 'vitest';
import { createPlotUseCase } from './CreatePlot.js';
import { epochMillis } from '../model/EpochMillis.js';
import { InvalidPlotNameError } from '../errors/InvalidPlotNameError.js';
import { InMemoryPlots, countingIds, fixedClock } from '../testing/doubles.js';

const AT = epochMillis(1_790_028_000_000);

const subject = (plots = new InMemoryPlots()) => ({
  plots,
  execute: createPlotUseCase({ plots, clock: fixedClock(AT), ids: countingIds() }),
});

describe('createPlotUseCase', () => {
  it('stores the plot and stamps it with the injected clock', async () => {
    const { plots, execute } = subject();

    const plot = await execute({ name: 'Chacra de arriba' });

    expect(plot).toEqual({ id: 'id-1', name: 'Chacra de arriba', createdAt: AT });
    expect(await plots.findById(plot.id)).toEqual(plot);
  });

  it('keeps area and location when the farmer already knows them', async () => {
    const { execute } = subject();

    const plot = await execute({
      name: 'Chacra de arriba',
      area: 0.75,
      location: { latitude: -8.11, longitude: -78.01, altitude: 3100 },
    });

    expect(plot.area).toBe(0.75);
    expect(plot.location?.altitude).toBe(3100);
  });

  it('does not store anything when the name is refused', async () => {
    const { plots, execute } = subject();

    await expect(execute({ name: '   ' })).rejects.toThrow(InvalidPlotNameError);
    expect(await plots.listAll()).toHaveLength(0);
  });

  it('gives each plot its own identity', async () => {
    const { execute } = subject();

    const first = await execute({ name: 'Chacra uno' });
    const second = await execute({ name: 'Chacra dos' });

    expect(first.id).not.toBe(second.id);
  });
});
