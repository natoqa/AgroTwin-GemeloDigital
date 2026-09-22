import { describe, expect, it } from 'vitest';
import { epochMillis } from '../model/EpochMillis.js';
import { plotId } from '../model/Ids.js';
import type { Diagnosis } from '../model/Diagnosis.js';
import { PlotNotFoundError } from '../errors/PlotNotFoundError.js';
import { fixedClock } from '../testing/doubles.js';
import { createTestTwin } from '../testing/scenario.js';

const AT = epochMillis(1_790_114_400_000);
const DIAGNOSIS: Diagnosis = { class: 'healthy', confidence: 0.9, modelVersion: 'mock-1' };

const twin = () => createTestTwin({ clock: fixedClock(AT), diagnosis: DIAGNOSIS });

describe('updatePlotDetailsUseCase', () => {
  it('adds the location a Phase 1 plot never had', async () => {
    const test = twin();
    const plot = await test.createPlot({ name: 'Chacra de arriba' });

    const updated = await test.updatePlotDetails({
      plotId: plot.id,
      update: { location: { latitude: -8.11, longitude: -78.01, altitude: 3100 } },
    });

    expect(updated.location?.latitude).toBe(-8.11);
    expect(await test.plots.findById(plot.id)).toEqual(updated);
  });

  it('refuses a plot that does not exist', async () => {
    const test = twin();

    await expect(
      test.updatePlotDetails({ plotId: plotId('missing'), update: { name: 'x' } }),
    ).rejects.toThrow(PlotNotFoundError);
  });
});
