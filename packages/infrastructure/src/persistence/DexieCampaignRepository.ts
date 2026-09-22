import type { Campaign, CampaignId, CampaignRepositoryPort, PlotId } from '@agrotwin/domain';
import type { AgroTwinDb } from './AgroTwinDb.js';
import { toCampaign, toCampaignRecord } from './records.js';

export class DexieCampaignRepository implements CampaignRepositoryPort {
  constructor(private readonly db: AgroTwinDb) {}

  async save(campaign: Campaign): Promise<void> {
    await this.db.campaigns.put(toCampaignRecord(campaign));
  }

  async findById(id: CampaignId): Promise<Campaign | undefined> {
    const record = await this.db.campaigns.get(id);
    return record ? toCampaign(record) : undefined;
  }

  async listByPlot(plotId: PlotId): Promise<readonly Campaign[]> {
    const records = await this.db.campaigns.where('plotId').equals(plotId).toArray();
    return records
      .map(toCampaign)
      .sort((left, right) => right.plantingDate.toEpochDay() - left.plantingDate.toEpochDay());
  }

  /**
   * The compound `[plotId+status]` index is what makes the one-open-campaign
   * rule cheap to check on every observation, which is the hot path.
   */
  async findActiveByPlot(plotId: PlotId): Promise<Campaign | undefined> {
    const record = await this.db.campaigns.where('[plotId+status]').equals([plotId, 'active']).first();
    return record ? toCampaign(record) : undefined;
  }

  async listAll(): Promise<readonly Campaign[]> {
    return (await this.db.campaigns.toArray()).map(toCampaign);
  }

  async deleteAll(): Promise<void> {
    await this.db.campaigns.clear();
  }
}
