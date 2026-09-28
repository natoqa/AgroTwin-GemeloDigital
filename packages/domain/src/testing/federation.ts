import type { CurrentModel, FederationConsent, TrainingExample } from '../learning/Federation.js';
import type { LinearHead } from '../learning/LinearHead.js';
import type {
  CurrentModelPort,
  FederationSettingsPort,
  TrainingExampleRepositoryPort,
} from '../ports/FederationPorts.js';
import type { RandomPort } from '../ports/RandomPort.js';
import type { EphemeralSigner, SignerPort } from '../ports/SignerPort.js';

/** Mulberry32: small, seeded, good enough to make training reproducible in tests. */
export function seededRandom(seed: number): RandomPort {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/**
 * A stand-in for ECDSA: the "signature" is a keyed FNV-1a hash. It has none of
 * the security and all of the behaviour the domain relies on — a signature
 * matches only the exact bytes and key it was made for.
 */
export class FakeSigner implements SignerPort {
  private counter = 0;

  async createEphemeralSigner(): Promise<EphemeralSigner> {
    this.counter += 1;
    const publicKey = `key-${this.counter}`;
    return { publicKey, sign: async (bytes) => FakeSigner.digest(bytes, publicKey) };
  }

  async verify(bytes: Uint8Array, signature: string, publicKey: string): Promise<boolean> {
    return FakeSigner.digest(bytes, publicKey) === signature;
  }

  static digest(bytes: Uint8Array, key: string): string {
    let hash = 0x811c9dc5;
    for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    return hash.toString(16);
  }
}

export class InMemoryTrainingExamples implements TrainingExampleRepositoryPort {
  readonly items = new Map<string, TrainingExample>();
  async save(example: TrainingExample): Promise<void> {
    this.items.set(example.observationId, example);
  }
  async listByBackbone(version: string): Promise<readonly TrainingExample[]> {
    return [...this.items.values()].filter((example) => example.backboneVersion === version);
  }
  async deleteAll(): Promise<void> {
    this.items.clear();
  }
}

export class InMemoryFederationSettings implements FederationSettingsPort {
  consent: FederationConsent = 'off';
  hubKey: string | undefined;
  async getConsent(): Promise<FederationConsent> {
    return this.consent;
  }
  async setConsent(consent: FederationConsent): Promise<void> {
    this.consent = consent;
  }
  async getTrustedHubKey(): Promise<string | undefined> {
    return this.hubKey;
  }
  async setTrustedHubKey(key: string): Promise<void> {
    this.hubKey = key;
  }
}

export class InMemoryCurrentModel implements CurrentModelPort {
  constructor(public model: CurrentModel | undefined) {}
  async current(): Promise<CurrentModel | undefined> {
    return this.model;
  }
  async adoptHead(head: LinearHead, headVersion: string): Promise<void> {
    if (this.model) this.model = { ...this.model, head, headVersion };
  }
}
