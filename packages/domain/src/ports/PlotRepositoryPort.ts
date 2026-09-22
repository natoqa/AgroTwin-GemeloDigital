import type { PlotId } from '../model/Ids.js';
import type { Plot } from '../model/Plot.js';

export interface PlotRepositoryPort {
  save(plot: Plot): Promise<void>;
  findById(id: PlotId): Promise<Plot | undefined>;
  /** Every plot, newest first. */
  listAll(): Promise<readonly Plot[]>;
  deleteAll(): Promise<void>;
}
