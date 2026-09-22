import { createPlot } from '../model/Plot.js';
import type { Plot } from '../model/Plot.js';
import { plotId } from '../model/Ids.js';
import type { PlotLocationInput } from '../model/PlotLocation.js';
import type { ClockPort } from '../ports/ClockPort.js';
import type { IdGeneratorPort } from '../ports/IdGeneratorPort.js';
import type { PlotRepositoryPort } from '../ports/PlotRepositoryPort.js';

export interface CreatePlotDependencies {
  readonly plots: PlotRepositoryPort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
}

export interface CreatePlotInput {
  readonly name: string;
  /** In hectares, if the farmer knows it. */
  readonly area?: number;
  readonly location?: PlotLocationInput;
}

/**
 * Registers a new plot.
 *
 * Only the name is required. Asking for area and coordinates up front would
 * put a form between the farmer and the first photograph; both can be filled
 * in later through `updatePlotDetails`.
 */
export function createPlotUseCase(deps: CreatePlotDependencies) {
  return async function execute(input: CreatePlotInput): Promise<Plot> {
    const plot = createPlot({
      id: plotId(deps.ids.newId()),
      name: input.name,
      createdAt: deps.clock.now(),
      ...(input.area === undefined ? {} : { area: input.area }),
      ...(input.location === undefined ? {} : { location: input.location }),
    });
    await deps.plots.save(plot);
    return plot;
  };
}
