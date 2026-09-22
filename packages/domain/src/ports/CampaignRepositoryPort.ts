import type { Campaign } from '../model/Campaign.js';
import type { CampaignId, PlotId } from '../model/Ids.js';

export interface CampaignRepositoryPort {
  save(campaign: Campaign): Promise<void>;
  findById(id: CampaignId): Promise<Campaign | undefined>;
  /** The campaigns of one plot, most recently planted first. */
  listByPlot(plotId: PlotId): Promise<readonly Campaign[]>;
  /** The open campaign of a plot, if it has one. At most one can exist. */
  findActiveByPlot(plotId: PlotId): Promise<Campaign | undefined>;
  /** Every campaign. Used by backup, not by any screen. */
  listAll(): Promise<readonly Campaign[]>;
  deleteAll(): Promise<void>;
}
