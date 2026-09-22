import type { PlotId } from '../model/Ids.js';
import type { TwinSnapshot } from '../model/TwinSnapshot.js';

export interface SnapshotRepositoryPort {
  save(snapshot: TwinSnapshot): Promise<void>;
  /** The snapshots of one plot, newest first. */
  listByPlot(plotId: PlotId): Promise<readonly TwinSnapshot[]>;
  latestForPlot(plotId: PlotId): Promise<TwinSnapshot | undefined>;
}
