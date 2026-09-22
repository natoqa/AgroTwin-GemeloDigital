import { createPlot } from '../model/Plot.js';
import type { Plot } from '../model/Plot.js';
import { plotId } from '../model/Ids.js';
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
}

/** Registers a new plot. Throws `InvalidPlotNameError` if the name is unusable. */
export function createPlotUseCase(deps: CreatePlotDependencies) {
  return async function execute(input: CreatePlotInput): Promise<Plot> {
    const plot = createPlot({
      id: plotId(deps.ids.newId()),
      name: input.name,
      createdAt: deps.clock.now(),
    });
    await deps.plots.save(plot);
    return plot;
  };
}
