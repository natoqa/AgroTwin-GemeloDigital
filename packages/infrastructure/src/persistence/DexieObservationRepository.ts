import { Dexie } from 'dexie';
import type {
  CampaignId,
  ImageRef,
  Observation,
  ObservationId,
  ObservationRepositoryPort,
} from '@agrotwin/domain';
import type { AgroTwinDb } from './AgroTwinDb.js';
import { toObservation, toObservationRecord } from './records.js';

export class DexieObservationRepository implements ObservationRepositoryPort {
  constructor(private readonly db: AgroTwinDb) {}

  async save(observation: Observation): Promise<void> {
    await this.db.observations.put(toObservationRecord(observation));
  }

  async findById(id: ObservationId): Promise<Observation | undefined> {
    const record = await this.db.observations.get(id);
    return record ? toObservation(record) : undefined;
  }

  async listByCampaign(campaignId: CampaignId): Promise<readonly Observation[]> {
    const records = await this.db.observations
      .where('[campaignId+at]')
      .between([campaignId, Dexie.minKey], [campaignId, Dexie.maxKey])
      .reverse()
      .toArray();
    return records.map(toObservation);
  }

  async findByOriginalImageRef(ref: ImageRef): Promise<Observation | undefined> {
    const record = await this.db.observations.where('imageRef').equals(ref).first();
    return record ? toObservation(record) : undefined;
  }

  async listAll(): Promise<readonly Observation[]> {
    return (await this.db.observations.toArray()).map(toObservation);
  }

  async deleteAll(): Promise<void> {
    await this.db.observations.clear();
  }
}
