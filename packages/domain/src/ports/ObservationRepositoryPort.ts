import type { CampaignId, ImageRef, ObservationId } from '../model/Ids.js';
import type { Observation } from '../model/Observation.js';

export interface ObservationRepositoryPort {
  save(observation: Observation): Promise<void>;
  findById(id: ObservationId): Promise<Observation | undefined>;
  /** The observations of one campaign, newest first. */
  listByCampaign(campaignId: CampaignId): Promise<readonly Observation[]>;
  /**
   * The observation holding a given full photograph.
   *
   * Retention works from the image store's side — it knows the bytes and their
   * age — and has to find the observation to forget the reference. Without
   * this lookup it would have to scan every observation on the device.
   */
  findByOriginalImageRef(ref: ImageRef): Promise<Observation | undefined>;
  listAll(): Promise<readonly Observation[]>;
  deleteAll(): Promise<void>;
}
