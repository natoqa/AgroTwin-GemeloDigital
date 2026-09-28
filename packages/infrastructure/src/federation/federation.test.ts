import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DELTA_MAGIC,
  decodeModelPackage,
  encodePackage,
  epochMillis,
  observationId,
  signedBytesFor,
} from '@agrotwin/domain';
import type { ModelClass } from '@agrotwin/domain';
import { AgroTwinDb } from '../persistence/AgroTwinDb.js';
import { CryptoRandom } from '../system/CryptoRandom.js';
import { DexieFederationSettings, DexieTrainingExamples } from './DexieFederationStore.js';
import { WebCryptoSigner } from './WebCryptoSigner.js';

describe('WebCryptoSigner', () => {
  it('verifies what it signs, and nothing altered', async () => {
    const signer = new WebCryptoSigner();
    const ephemeral = await signer.createEphemeralSigner();
    const bytes = Uint8Array.of(1, 2, 3, 4);

    const signature = await ephemeral.sign(bytes);

    expect(await signer.verify(bytes, signature, ephemeral.publicKey)).toBe(true);
    expect(await signer.verify(Uint8Array.of(1, 2, 3, 5), signature, ephemeral.publicKey)).toBe(false);
    expect(await signer.verify(bytes, signature, 'not-a-key')).toBe(false);
  });

  it('uses a new key for every package', async () => {
    const signer = new WebCryptoSigner();

    const first = await signer.createEphemeralSigner();
    const second = await signer.createEphemeralSigner();

    expect(first.publicKey).not.toBe(second.publicKey);
    // Raw uncompressed P-256 point: 65 bytes, base64.
    expect(atob(first.publicKey)).toHaveLength(65);
  });

  /**
   * The other half of the interoperability check: this file was signed by the
   * hub's Python code (`services/edge-hub/tests/fixtures/make_hub_model.py`).
   * The hub's own tests check a delta signed by this class.
   */
  it('verifies an aggregate signed by the Python hub', async () => {
    // Node's fs, typed here: the package's tsconfig has no Node types, on purpose.
    const fs = (await import('node:' + 'fs')) as { readFileSync(path: URL): Uint8Array };
    const bytes = new Uint8Array(fs.readFileSync(new URL('./fixtures/hub.agrotwin-model', import.meta.url)));
    const parts = decodeModelPackage(bytes);

    const valid = await new WebCryptoSigner().verify(
      parts.signedBytes,
      parts.signature,
      parts.header.publicKey,
    );

    expect(valid).toBe(true);
    expect(parts.header.contributors).toBe(1);
    expect(parts.body[0]).toBeCloseTo(0.5, 6);
  });

  it('signs deltas the domain can lay out', async () => {
    const ephemeral = await new WebCryptoSigner().createEphemeralSigner();
    const header = { format: 'agrotwin-delta', publicKey: ephemeral.publicKey };
    const body = Float32Array.of(1, 2);

    const signature = await ephemeral.sign(signedBytesFor(DELTA_MAGIC, header, body));

    expect(encodePackage(DELTA_MAGIC, header, body, signature).length).toBeGreaterThan(8);
  });
});

describe('CryptoRandom', () => {
  it('draws uniformly from [0, 1)', () => {
    const random = new CryptoRandom();
    const draws = Array.from({ length: 2000 }, () => random.next());

    expect(Math.min(...draws)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...draws)).toBeLessThan(1);
    const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});

describe('Dexie federation stores', () => {
  let db: AgroTwinDb;
  let unique = 0;

  beforeEach(async () => {
    unique += 1;
    db = new AgroTwinDb(`agrotwin-federation-${unique}`);
    await db.open();
  });
  afterEach(async () => {
    db.close();
    await AgroTwinDb.delete(`agrotwin-federation-${unique}`);
  });

  it('keeps one example per observation, per backbone', async () => {
    const examples = new DexieTrainingExamples(db);
    const example = {
      observationId: observationId('o1'),
      label: 'late_blight' as ModelClass,
      embedding: Float32Array.of(0.25, 0.5),
      backboneVersion: 'bb-1',
      labeledAt: epochMillis(1),
    };

    await examples.save(example);
    await examples.save({ ...example, label: 'healthy' });
    await examples.save({ ...example, observationId: observationId('o2'), backboneVersion: 'bb-2' });

    const stored = await examples.listByBackbone('bb-1');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.label).toBe('healthy');
    expect(Array.from(stored[0]?.embedding ?? [])).toEqual([0.25, 0.5]);

    await examples.deleteAll();
    expect(await examples.listByBackbone('bb-1')).toHaveLength(0);
  });

  it('defaults to sharing nothing, and remembers consent and the hub key', async () => {
    const settings = new DexieFederationSettings(db);

    expect(await settings.getConsent()).toBe('off');
    await settings.setConsent('receive_only');
    await settings.setTrustedHubKey('hub-key');

    expect(await settings.getConsent()).toBe('receive_only');
    expect(await settings.getTrustedHubKey()).toBe('hub-key');

    await db.settings.put({ key: 'federation.consent', value: 'everything' });
    expect(await settings.getConsent()).toBe('off');

    await settings.deleteAll();
    expect(await settings.getTrustedHubKey()).toBeUndefined();
  });
});
