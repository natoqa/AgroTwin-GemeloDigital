import type { Plot, PlotId, PlotRepositoryPort } from '@agrotwin/domain';
import type { AgroTwinDb } from './AgroTwinDb.js';
import { toPlot, toPlotRecord } from './records.js';

export class DexiePlotRepository implements PlotRepositoryPort {
  constructor(private readonly db: AgroTwinDb) {}

  async save(plot: Plot): Promise<void> {
    await this.db.plots.put(toPlotRecord(plot));
  }

  async findById(id: PlotId): Promise<Plot | undefined> {
    const record = await this.db.plots.get(id);
    return record ? toPlot(record) : undefined;
  }

  async listAll(): Promise<readonly Plot[]> {
    const records = await this.db.plots.orderBy('createdAt').reverse().toArray();
    return records.map(toPlot);
  }

  async deleteAll(): Promise<void> {
    await this.db.plots.clear();
  }
}
