import { FEDERATION_CONSENTS, LinearHead, epochMillis, observationId } from '@agrotwin/domain';
import type {
  CurrentModel,
  CurrentModelPort,
  FederationConsent,
  FederationSettingsPort,
  ModelClass,
  ModelContract,
  TrainingExample,
  TrainingExampleRepositoryPort,
} from '@agrotwin/domain';
import type { ModelAssets } from '../inference/ModelAssets.js';
import type { AgroTwinDb } from '../persistence/AgroTwinDb.js';

export class DexieTrainingExamples implements TrainingExampleRepositoryPort {
  constructor(private readonly db: AgroTwinDb) {}

  async save(example: TrainingExample): Promise<void> {
    await this.db.trainingExamples.put({
      observationId: example.observationId,
      label: example.label,
      embedding: example.embedding,
      backboneVersion: example.backboneVersion,
      labeledAt: example.labeledAt,
    });
  }

  async listByBackbone(version: string): Promise<readonly TrainingExample[]> {
    const records = await this.db.trainingExamples
      .where('backboneVersion')
      .equals(version)
      .toArray();
    return records.map((record) => ({
      observationId: observationId(record.observationId),
      label: record.label as ModelClass,
      embedding: record.embedding,
      backboneVersion: record.backboneVersion,
      labeledAt: epochMillis(record.labeledAt),
    }));
  }

  async deleteAll(): Promise<void> {
    await this.db.trainingExamples.clear();
  }
}

const CONSENT = 'federation.consent';
const HUB_KEY = 'federation.hubKey';

export class DexieFederationSettings implements FederationSettingsPort {
  constructor(private readonly db: AgroTwinDb) {}

  async getConsent(): Promise<FederationConsent> {
    const value = (await this.db.settings.get(CONSENT))?.value;
    // Anything unrecognised reads as "off": sharing is never the default.
    return value !== undefined && (FEDERATION_CONSENTS as readonly string[]).includes(value)
      ? (value as FederationConsent)
      : 'off';
  }
  async setConsent(consent: FederationConsent): Promise<void> {
    await this.db.settings.put({ key: CONSENT, value: consent });
  }
  async getTrustedHubKey(): Promise<string | undefined> {
    return (await this.db.settings.get(HUB_KEY))?.value;
  }
  async setTrustedHubKey(publicKey: string): Promise<void> {
    await this.db.settings.put({ key: HUB_KEY, value: publicKey });
  }
  async deleteAll(): Promise<void> {
    await this.db.settings.clear();
  }
}

/**
 * The model in use: the downloaded contract and head, unless the phone has
 * accepted a federated head for this backbone. Adopting one stores it and
 * tells the classifier to restart, so the next photograph uses it.
 */
export class DeviceCurrentModel implements CurrentModelPort {
  constructor(
    private readonly db: AgroTwinDb,
    private readonly assets: ModelAssets,
    private readonly onAdopted: () => void,
    private readonly now: () => number,
  ) {}

  async current(): Promise<CurrentModel | undefined> {
    const model = await this.assets.load();
    if (!model) return undefined;
    const adopted = await this.adoptedFor(model.contract);
    return adopted
      ? { contract: model.contract, head: adopted.head, headVersion: adopted.version }
      : { contract: model.contract, head: model.head, headVersion: model.contract.version };
  }

  /** The adopted head for a contract, if any: what the classifier should run. */
  async adoptedFor(
    contract: ModelContract,
  ): Promise<{ head: LinearHead; version: string } | undefined> {
    const record = await this.db.adoptedHeads.get(contract.version);
    if (!record) return undefined;
    const dimension = record.embeddingDimension;
    const rows = contract.classes.map((_, row) =>
      Array.from(record.weights.subarray(row * dimension, (row + 1) * dimension)),
    );
    return {
      head: LinearHead.of(contract.classes, rows, Array.from(record.bias)),
      version: record.headVersion,
    };
  }

  async adoptHead(head: LinearHead, headVersion: string): Promise<void> {
    const model = await this.assets.load();
    if (!model) return;
    await this.db.adoptedHeads.put({
      backboneVersion: model.contract.version,
      headVersion,
      classes: [...head.classes],
      embeddingDimension: head.embeddingDimension,
      weights: Float32Array.from(head.weights),
      bias: Float32Array.from(head.bias),
      adoptedAt: this.now(),
    });
    this.onAdopted();
  }

  async deleteAll(): Promise<void> {
    await this.db.adoptedHeads.clear();
  }
}
