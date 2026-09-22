import { Dexie } from 'dexie';
import type { EntityTable } from 'dexie';
import type {
  CampaignRecord,
  ImageRecord,
  ObservationRecord,
  PlotRecord,
  SnapshotRecord,
} from './records.js';

/**
 * The device's own database. There is no other copy of it anywhere.
 *
 * Version 2 is where the twin stops being a photo log: campaigns and
 * observations become tables of their own, and the image table stops holding
 * bytes — those move to OPFS (ADR-0007) and what stays here is the index that
 * retention and backup read.
 *
 * The Phase 1 snapshots are dropped by the upgrade rather than adopted. Every
 * snapshot now belongs to a campaign, and there is no honest way to invent the
 * planting date a Phase 1 snapshot never had: a guessed date would propagate
 * into growing degree days and the water balance as if it were a fact. The
 * `fase-1` tag was never distributed, so what this deletes is development
 * data on two devices.
 */
export class AgroTwinDb extends Dexie {
  declare plots: EntityTable<PlotRecord, 'id'>;
  declare campaigns: EntityTable<CampaignRecord, 'id'>;
  declare observations: EntityTable<ObservationRecord, 'id'>;
  declare snapshots: EntityTable<SnapshotRecord, 'id'>;
  declare images: EntityTable<ImageRecord, 'id'>;

  constructor(name = 'agrotwin') {
    super(name);

    this.version(1).stores({
      plots: 'id, createdAt',
      snapshots: 'id, plotId, at, [plotId+at]',
      images: 'id, storedAt',
    });

    this.version(2)
      .stores({
        plots: 'id, createdAt',
        campaigns: 'id, plotId, status, [plotId+status]',
        observations: 'id, campaignId, imageRef, at, [campaignId+at]',
        snapshots: 'id, plotId, campaignId, at, [plotId+at], [campaignId+at]',
        // Metadata only from here on: the bytes live in OPFS.
        images: 'id, kind, storedAt, [kind+storedAt]',
      })
      .upgrade(async (transaction) => {
        await transaction.table('snapshots').clear();
        await transaction.table('images').clear();
      });
  }
}
