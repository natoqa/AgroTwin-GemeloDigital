import { PlotNotFoundError } from '../errors/PlotNotFoundError.js';
import type { PlotId } from '../model/Ids.js';
import { updatePlotDetails } from '../model/Plot.js';
import type { Plot, PlotDetailsUpdate } from '../model/Plot.js';
import type { PlotRepositoryPort } from '../ports/PlotRepositoryPort.js';

export interface UpdatePlotDetailsDependencies {
  readonly plots: PlotRepositoryPort;
}

export interface UpdatePlotDetailsInput {
  readonly plotId: PlotId;
  readonly update: PlotDetailsUpdate;
}

/**
 * Changes a plot's name, area or location.
 *
 * This exists because Phase 1 plots carry none of the agronomy Phase 3 needs:
 * without a latitude there is no extraterrestrial radiation, and without that
 * there is no evapotranspiration. The farmer has to be able to add it later.
 */
export function updatePlotDetailsUseCase(deps: UpdatePlotDetailsDependencies) {
  return async function execute(input: UpdatePlotDetailsInput): Promise<Plot> {
    const plot = await deps.plots.findById(input.plotId);
    if (!plot) {
      throw new PlotNotFoundError(input.plotId);
    }

    const updated = updatePlotDetails(plot, input.update);
    await deps.plots.save(updated);
    return updated;
  };
}
