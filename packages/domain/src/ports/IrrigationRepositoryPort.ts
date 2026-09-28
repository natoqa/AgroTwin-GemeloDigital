import type { CampaignId } from '../model/Ids.js';
import type { Irrigation } from '../model/Irrigation.js';

export interface IrrigationRepositoryPort {
  /** Stores one day's irrigation, replacing any earlier record for that day. */
  save(irrigation: Irrigation): Promise<void>;
  /** Oldest first. */
  listByCampaign(campaignId: CampaignId): Promise<readonly Irrigation[]>;
  listAll(): Promise<readonly Irrigation[]>;
  deleteAll(): Promise<void>;
}
