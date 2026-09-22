import { Dexie } from 'dexie';
import type { EntityTable } from 'dexie';
import type { ImageRecord, PlotRecord, SnapshotRecord } from './records.js';

/**
 * The device's own database. There is no other copy of it anywhere.
 *
 * Phase 1 keeps images in here as blobs so the whole slice is offline on day
 * one. Phase 2 moves them to OPFS with a retention policy; the schema version
 * bump and migration belong to that phase.
 */
export class AgroTwinDb extends Dexie {
  declare plots: EntityTable<PlotRecord, 'id'>;
  declare snapshots: EntityTable<SnapshotRecord, 'id'>;
  declare images: EntityTable<ImageRecord, 'id'>;

  constructor(name = 'agrotwin') {
    super(name);
    this.version(1).stores({
      plots: 'id, createdAt',
      // `[plotId+at]` is what serves the twin's time series for one plot.
      snapshots: 'id, plotId, at, [plotId+at]',
      images: 'id, storedAt',
    });
  }
}
