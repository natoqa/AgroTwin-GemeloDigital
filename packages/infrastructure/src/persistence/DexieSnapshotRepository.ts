import { Dexie } from 'dexie';
import type {
  CampaignId,
  PlotId,
  SnapshotRepositoryPort,
  TwinSnapshot,
} from '@agrotwin/domain';
import type { AgroTwinDb } from './AgroTwinDb.js';
import { toSnapshot, toSnapshotRecord } from './records.js';

export class DexieSnapshotRepository implements SnapshotRepositoryPort {
  constructor(private readonly db: AgroTwinDb) {}

  async save(snapshot: TwinSnapshot): Promise<void> {
    await this.db.snapshots.put(toSnapshotRecord(snapshot));
  }

  async listByPlot(plotId: PlotId): Promise<readonly TwinSnapshot[]> {
    const records = await this.db.snapshots
      .where('[plotId+at]')
      .between([plotId, Dexie.minKey], [plotId, Dexie.maxKey])
      .reverse()
      .toArray();
    return records.map(toSnapshot);
  }

  /** Oldest first: this is the series every agronomic model reads forward. */
  async listByCampaign(campaignId: CampaignId): Promise<readonly TwinSnapshot[]> {
    const records = await this.db.snapshots
      .where('[campaignId+at]')
      .between([campaignId, Dexie.minKey], [campaignId, Dexie.maxKey])
      .toArray();
    return records.map(toSnapshot);
  }

  async latestForPlot(plotId: PlotId): Promise<TwinSnapshot | undefined> {
    const record = await this.db.snapshots
      .where('[plotId+at]')
      .between([plotId, Dexie.minKey], [plotId, Dexie.maxKey])
      .last();
    return record ? toSnapshot(record) : undefined;
  }

  async listAll(): Promise<readonly TwinSnapshot[]> {
    return (await this.db.snapshots.toArray()).map(toSnapshot);
  }

  async deleteAll(): Promise<void> {
    await this.db.snapshots.clear();
  }
}
