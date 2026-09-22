import type { CampaignId, PlotId } from '../model/Ids.js';
import type { TwinSnapshot } from '../model/TwinSnapshot.js';

export interface SnapshotRepositoryPort {
  save(snapshot: TwinSnapshot): Promise<void>;
  /** The snapshots of one plot, newest first. */
  listByPlot(plotId: PlotId): Promise<readonly TwinSnapshot[]>;
  /** The snapshots of one campaign, oldest first: the twin's time series. */
  listByCampaign(campaignId: CampaignId): Promise<readonly TwinSnapshot[]>;
  latestForPlot(plotId: PlotId): Promise<TwinSnapshot | undefined>;
  listAll(): Promise<readonly TwinSnapshot[]>;
  deleteAll(): Promise<void>;
}
