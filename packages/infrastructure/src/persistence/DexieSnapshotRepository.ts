import { Dexie } from 'dexie';
import type { PlotId, SnapshotRepositoryPort, TwinSnapshot } from '@agrotwin/domain';
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

  async latestForPlot(plotId: PlotId): Promise<TwinSnapshot | undefined> {
    const records = await this.listByPlot(plotId);
    return records[0];
  }
}
