import type { Campaign } from '../model/Campaign.js';
import type { Diagnosis } from '../model/Diagnosis.js';
import { epochMillis } from '../model/EpochMillis.js';
import type { EpochMillis } from '../model/EpochMillis.js';
import { imageRef } from '../model/Ids.js';
import type { CampaignId, ImageRef, ObservationId, PlotId, SnapshotId } from '../model/Ids.js';
import type { Observation } from '../model/Observation.js';
import type { Plot } from '../model/Plot.js';
import type { TwinSnapshot } from '../model/TwinSnapshot.js';
import type { CampaignRepositoryPort } from '../ports/CampaignRepositoryPort.js';
import type { ClockPort } from '../ports/ClockPort.js';
import type { IdGeneratorPort } from '../ports/IdGeneratorPort.js';
import type {
  EncodedImage,
  ImageStorePort,
  StoredImageInfo,
  StoredImagePair,
} from '../ports/ImageStorePort.js';
import type { InferencePort } from '../ports/InferencePort.js';
import type { ObservationRepositoryPort } from '../ports/ObservationRepositoryPort.js';
import type { PlotRepositoryPort } from '../ports/PlotRepositoryPort.js';
import type { SnapshotRepositoryPort } from '../ports/SnapshotRepositoryPort.js';
import type { StoragePort, StorageStatus } from '../ports/StoragePort.js';

/**
 * In-memory stand-ins for every port, shared by the domain's tests.
 *
 * They live in `src` rather than beside one test because half the use cases
 * need four repositories at once, and a copy of each double per test file is
 * how test suites start disagreeing with one another about what a repository
 * does. They are not exported from the package root: production code has no
 * business reaching them.
 */

export class InMemoryPlots implements PlotRepositoryPort {
  readonly items = new Map<PlotId, Plot>();

  constructor(initial: readonly Plot[] = []) {
    for (const plot of initial) this.items.set(plot.id, plot);
  }

  async save(plot: Plot): Promise<void> {
    this.items.set(plot.id, plot);
  }
  async findById(id: PlotId): Promise<Plot | undefined> {
    return this.items.get(id);
  }
  async listAll(): Promise<readonly Plot[]> {
    return [...this.items.values()].sort((left, right) => right.createdAt - left.createdAt);
  }
  async deleteAll(): Promise<void> {
    this.items.clear();
  }
}

export class InMemoryCampaigns implements CampaignRepositoryPort {
  readonly items = new Map<CampaignId, Campaign>();

  constructor(initial: readonly Campaign[] = []) {
    for (const campaign of initial) this.items.set(campaign.id, campaign);
  }

  async save(campaign: Campaign): Promise<void> {
    this.items.set(campaign.id, campaign);
  }
  async findById(id: CampaignId): Promise<Campaign | undefined> {
    return this.items.get(id);
  }
  async listByPlot(plotId: PlotId): Promise<readonly Campaign[]> {
    return [...this.items.values()]
      .filter((campaign) => campaign.plotId === plotId)
      .sort((left, right) => right.plantingDate.toEpochDay() - left.plantingDate.toEpochDay());
  }
  async findActiveByPlot(plotId: PlotId): Promise<Campaign | undefined> {
    return [...this.items.values()].find(
      (campaign) => campaign.plotId === plotId && campaign.status === 'active',
    );
  }
  async listAll(): Promise<readonly Campaign[]> {
    return [...this.items.values()];
  }
  async deleteAll(): Promise<void> {
    this.items.clear();
  }
}

export class InMemoryObservations implements ObservationRepositoryPort {
  readonly items = new Map<ObservationId, Observation>();

  async save(observation: Observation): Promise<void> {
    this.items.set(observation.id, observation);
  }
  async findById(id: ObservationId): Promise<Observation | undefined> {
    return this.items.get(id);
  }
  async listByCampaign(campaignId: CampaignId): Promise<readonly Observation[]> {
    return [...this.items.values()]
      .filter((observation) => observation.campaignId === campaignId)
      .sort((left, right) => right.at - left.at);
  }
  async findByOriginalImageRef(ref: ImageRef): Promise<Observation | undefined> {
    return [...this.items.values()].find((observation) => observation.imageRef === ref);
  }
  async listAll(): Promise<readonly Observation[]> {
    return [...this.items.values()];
  }
  async deleteAll(): Promise<void> {
    this.items.clear();
  }
}

export class InMemorySnapshots implements SnapshotRepositoryPort {
  readonly items = new Map<SnapshotId, TwinSnapshot>();

  async save(snapshot: TwinSnapshot): Promise<void> {
    this.items.set(snapshot.id, snapshot);
  }
  async listByPlot(plotId: PlotId): Promise<readonly TwinSnapshot[]> {
    return [...this.items.values()]
      .filter((snapshot) => snapshot.plotId === plotId)
      .sort((left, right) => right.at - left.at);
  }
  async listByCampaign(campaignId: CampaignId): Promise<readonly TwinSnapshot[]> {
    return [...this.items.values()]
      .filter((snapshot) => snapshot.campaignId === campaignId)
      .sort((left, right) => left.at - right.at);
  }
  async latestForPlot(plotId: PlotId): Promise<TwinSnapshot | undefined> {
    return (await this.listByPlot(plotId))[0];
  }
  async listAll(): Promise<readonly TwinSnapshot[]> {
    return [...this.items.values()];
  }
  async deleteAll(): Promise<void> {
    this.items.clear();
  }
}

interface HeldImage {
  readonly info: StoredImageInfo;
  readonly bytes: Uint8Array;
}

/**
 * An image store that keeps bytes in a map.
 *
 * The thumbnail is the first few bytes of the original, which is nonsense as
 * an image and exactly right as a double: the domain never looks inside, it
 * only cares that a second, smaller reference exists and survives purging.
 */
export class InMemoryImageStore implements ImageStorePort {
  readonly items = new Map<ImageRef, HeldImage>();
  private counter = 0;

  constructor(private readonly clock: ClockPort) {}

  async put(image: ArrayBuffer, contentType: string): Promise<StoredImagePair> {
    const bytes = new Uint8Array(image);
    const original = this.hold(bytes, contentType, 'original');
    const thumbnail = this.hold(bytes.slice(0, Math.ceil(bytes.length / 4)), contentType, 'thumbnail');
    return { original, thumbnail };
  }

  async get(ref: ImageRef): Promise<ArrayBuffer | undefined> {
    const held = this.items.get(ref);
    return held ? toArrayBuffer(held.bytes) : undefined;
  }

  async delete(ref: ImageRef): Promise<void> {
    this.items.delete(ref);
  }

  async listOriginals(): Promise<readonly StoredImageInfo[]> {
    return [...this.items.values()]
      .filter((held) => held.info.kind === 'original')
      .map((held) => held.info)
      .sort((left, right) => left.storedAt - right.storedAt);
  }

  async exportEncoded(ref: ImageRef): Promise<EncodedImage | undefined> {
    const held = this.items.get(ref);
    if (!held) return undefined;
    return {
      ref: held.info.ref,
      kind: held.info.kind,
      contentType: held.info.contentType,
      base64: encodeBase64(held.bytes),
      storedAt: held.info.storedAt,
    };
  }

  async importEncoded(image: EncodedImage): Promise<void> {
    const bytes = decodeBase64(image.base64);
    this.items.set(image.ref, {
      bytes,
      info: {
        ref: image.ref,
        kind: image.kind,
        contentType: image.contentType,
        byteLength: bytes.length,
        storedAt: image.storedAt,
      },
    });
  }

  async deleteAll(): Promise<void> {
    this.items.clear();
  }

  /** Puts an image in as if it had been stored at another time, for retention tests. */
  holdAt(bytes: Uint8Array, contentType: string, storedAt: EpochMillis): ImageRef {
    return this.hold(bytes, contentType, 'original', storedAt);
  }

  private hold(
    bytes: Uint8Array,
    contentType: string,
    kind: StoredImageInfo['kind'],
    storedAt: EpochMillis = this.clock.now(),
  ): ImageRef {
    this.counter += 1;
    const ref = imageRef(`${kind}-${this.counter}`);
    this.items.set(ref, {
      bytes,
      info: { ref, kind, contentType, byteLength: bytes.length, storedAt },
    });
    return ref;
  }
}

export class FakeStorage implements StoragePort {
  requests = 0;

  constructor(
    private persisted: boolean,
    private readonly grant: boolean,
  ) {}

  async status(): Promise<StorageStatus> {
    return { persisted: this.persisted, usedBytes: 1024, quotaBytes: 1024 * 1024 };
  }

  async requestPersistence(): Promise<boolean> {
    this.requests += 1;
    this.persisted = this.persisted || this.grant;
    return this.persisted;
  }
}

export const fixedClock = (at: EpochMillis): ClockPort => ({ now: () => at });

/** A clock the test moves by hand, for anything that spans days. */
export class MovableClock implements ClockPort {
  constructor(private at: EpochMillis) {}
  now(): EpochMillis {
    return this.at;
  }
  advanceDays(days: number): void {
    this.at = epochMillis(this.at + days * 86_400_000);
  }
}

export const countingIds = (prefix = 'id'): IdGeneratorPort => {
  let next = 0;
  return {
    newId: () => {
      next += 1;
      return `${prefix}-${next}`;
    },
  };
};

export const stubInference = (diagnosis: Diagnosis): InferencePort => ({
  diagnose: async () => diagnosis,
});

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.length);
  new Uint8Array(copy).set(bytes);
  return copy;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Base64 in pure TypeScript, because the domain has neither `btoa` nor
 * `Buffer` and the backup round trip is only worth testing if the bytes really
 * come back. The adapter uses the platform's own encoder.
 */
export function encodeBase64(bytes: Uint8Array): string {
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const triple = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);

    out += BASE64_ALPHABET[(triple >> 18) & 63];
    out += BASE64_ALPHABET[(triple >> 12) & 63];
    out += second === undefined ? '=' : BASE64_ALPHABET[(triple >> 6) & 63];
    out += third === undefined ? '=' : BASE64_ALPHABET[triple & 63];
  }
  return out;
}

export function decodeBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/u, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of clean) {
    const value = BASE64_ALPHABET.indexOf(character);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}
