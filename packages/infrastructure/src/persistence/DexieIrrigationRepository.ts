import type { CampaignId, Irrigation, IrrigationRepositoryPort } from '@agrotwin/domain';
import type { AgroTwinDb } from './AgroTwinDb.js';
import { toIrrigation, toIrrigationRecord } from './records.js';

export class DexieIrrigationRepository implements IrrigationRepositoryPort {
  constructor(private readonly db: AgroTwinDb) {}

  /** The key is campaign and day, so a second tap on the same day replaces the first. */
  async save(irrigation: Irrigation): Promise<void> {
    await this.db.irrigations.put(toIrrigationRecord(irrigation));
  }

  async listByCampaign(campaignId: CampaignId): Promise<readonly Irrigation[]> {
    // The compound index sorts by date inside the campaign, which is the order
    // the water balance walks in.
    const records = await this.db.irrigations
      .where('[campaignId+date]')
      .between([campaignId, ''], [campaignId, '￿'])
      .toArray();
    return records.map(toIrrigation);
  }

  async listAll(): Promise<readonly Irrigation[]> {
    return (await this.db.irrigations.toArray()).map(toIrrigation);
  }

  async deleteAll(): Promise<void> {
    await this.db.irrigations.clear();
  }
}
