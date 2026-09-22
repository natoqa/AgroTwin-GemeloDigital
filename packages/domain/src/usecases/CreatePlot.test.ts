import { describe, expect, it } from 'vitest';
import { createPlotUseCase } from './CreatePlot.js';
import { epochMillis } from '../model/EpochMillis.js';
import type { EpochMillis } from '../model/EpochMillis.js';
import type { PlotId } from '../model/Ids.js';
import type { Plot } from '../model/Plot.js';
import type { PlotRepositoryPort } from '../ports/PlotRepositoryPort.js';
import { InvalidPlotNameError } from '../errors/InvalidPlotNameError.js';

class InMemoryPlots implements PlotRepositoryPort {
  readonly saved: Plot[] = [];
  async save(plot: Plot): Promise<void> {
    this.saved.push(plot);
  }
  async findById(id: PlotId): Promise<Plot | undefined> {
    return this.saved.find((plot) => plot.id === id);
  }
  async listAll(): Promise<readonly Plot[]> {
    return [...this.saved].reverse();
  }
}

const fixedClock = (at: EpochMillis) => ({ now: () => at });
const countingIds = () => {
  let next = 0;
  return {
    newId: () => {
      next += 1;
      return `id-${next}`;
    },
  };
};

describe('createPlotUseCase', () => {
  it('stores the plot and stamps it with the injected clock', async () => {
    const plots = new InMemoryPlots();
    const at = epochMillis(1_790_028_000_000);
    const execute = createPlotUseCase({ plots, clock: fixedClock(at), ids: countingIds() });

    const plot = await execute({ name: 'Chacra de arriba' });

    expect(plot).toEqual({ id: 'id-1', name: 'Chacra de arriba', createdAt: at });
    expect(plots.saved).toEqual([plot]);
  });

  it('does not store anything when the name is refused', async () => {
    const plots = new InMemoryPlots();
    const execute = createPlotUseCase({
      plots,
      clock: fixedClock(epochMillis(0)),
      ids: countingIds(),
    });

    await expect(execute({ name: '   ' })).rejects.toThrow(InvalidPlotNameError);
    expect(plots.saved).toHaveLength(0);
  });

  it('gives each plot its own identity', async () => {
    const plots = new InMemoryPlots();
    const execute = createPlotUseCase({
      plots,
      clock: fixedClock(epochMillis(0)),
      ids: countingIds(),
    });

    const first = await execute({ name: 'Chacra uno' });
    const second = await execute({ name: 'Chacra dos' });

    expect(first.id).not.toBe(second.id);
  });
});
