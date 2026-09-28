import { describe, expect, it } from 'vitest';
import { FederationPackageError } from '../errors/FederationPackageError.js';
import { ModelUnavailableError } from '../errors/ModelUnavailableError.js';
import { ObservationNotLabelableError } from '../errors/ObservationNotLabelableError.js';
import { flatten, subtract } from '../learning/Delta.js';
import type { CurrentModel } from '../learning/Federation.js';
import {
  MODEL_MAGIC,
  decodeDeltaPackage,
  encodePackage,
  signedBytesFor,
} from '../learning/FederationPackage.js';
import { LinearHead } from '../learning/LinearHead.js';
import type { ModelClass, ModelContract } from '../learning/ModelContract.js';
import { isHoldout } from '../learning/Training.js';
import { createObservation } from '../model/Observation.js';
import { campaignId, observationId, plotId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import { epochMillis } from '../model/EpochMillis.js';
import type { EmbeddingPort } from '../ports/EmbeddingPort.js';
import { InMemoryImageStore, InMemoryObservations, fixedClock } from '../testing/doubles.js';
import {
  FakeSigner,
  InMemoryCurrentModel,
  InMemoryFederationSettings,
  InMemoryTrainingExamples,
  seededRandom,
} from '../testing/federation.js';
import type { FederationDependencies } from './federationDependencies.js';
import { getFederationStatusUseCase } from './GetFederationStatus.js';
import { importAggregatedModelUseCase } from './ImportAggregatedModel.js';
import { labelObservationUseCase } from './LabelObservation.js';
import { prepareContributionUseCase } from './PrepareContribution.js';
import { setFederationConsentUseCase } from './SetFederationConsent.js';

const NOW = epochMillis(1_790_000_000_000);
const CLASSES: readonly ModelClass[] = ['healthy', 'early_blight', 'late_blight'];

const contract = { version: 'bb-1', classes: CLASSES } as unknown as ModelContract;
const startHead = LinearHead.of(
  CLASSES,
  CLASSES.map(() => [0, 0, 0]),
  [0, 0, 0],
);

/** The "embedding" of a photo is its first three bytes: enough to separate classes. */
const embedder: EmbeddingPort = {
  embed: async (image) => Float32Array.from(new Uint8Array(image).subarray(0, 3)),
};

const LABELS: Record<ModelClass, number[]> = {
  healthy: [2, 0, 0],
  early_blight: [0, 2, 0],
  late_blight: [0, 0, 2],
};

async function subject(options: { model?: CurrentModel | undefined } = {}) {
  const observations = new InMemoryObservations();
  const images = new InMemoryImageStore(fixedClock(NOW));
  const examples = new InMemoryTrainingExamples();
  const settings = new InMemoryFederationSettings();
  const model = new InMemoryCurrentModel(
    'model' in options ? options.model : { contract, head: startHead, headVersion: 'bb-1' },
  );
  const signer = new FakeSigner();
  const deps: FederationDependencies = {
    observations,
    images,
    embedder,
    examples,
    settings,
    model,
    signer,
    random: seededRandom(5),
    clock: fixedClock(NOW),
    training: { epochs: 30, batchSize: 4, learningRate: 0.3, l2: 0 },
  };

  /** A photographed observation whose "photo" encodes its true class. */
  async function photo(index: number, label: ModelClass, keepOriginal = true) {
    const bytes = Uint8Array.from([...(LABELS[label] ?? []), index]);
    const stored = await images.put(bytes.buffer, 'image/jpeg');
    const observation = createObservation({
      id: observationId(`obs-${label}-${index}`),
      plotId: plotId('p1'),
      campaignId: campaignId('c1'),
      at: NOW,
      date: LocalDate.fromEpochMillis(NOW),
      diagnosis: { class: 'healthy', confidence: 0.9, modelVersion: 'bb-1' },
      ...(keepOriginal ? { imageRef: stored.original } : {}),
    });
    await observations.save(observation);
    return observation;
  }

  /** Labels enough photos to leave several training and holdout examples. */
  async function labelMany(perClass = 8) {
    const label = labelObservationUseCase(deps);
    for (const cls of CLASSES) {
      for (let index = 0; index < perClass; index += 1) {
        const observation = await photo(index, cls);
        await label(observation.id, cls);
      }
    }
  }

  /** What a hub would send: a head, signed with `key`, for `base`. */
  async function aggregate(head: LinearHead, overrides: Record<string, unknown> = {}, key = 'hub') {
    const header = {
      format: 'agrotwin-model',
      formatVersion: 1,
      backboneVersion: 'bb-1',
      baseHeadVersion: 'bb-1',
      headVersion: 'bb-1+fed1',
      parameterCount: 12,
      contributors: 3,
      totalSamples: 30,
      createdAt: NOW,
      publicKey: key,
      ...overrides,
    };
    const body = flatten(head);
    return encodePackage(MODEL_MAGIC, header, body, FakeSigner.digest(signedBytesFor(MODEL_MAGIC, header, body), key));
  }

  return { deps, examples, settings, model, photo, labelMany, aggregate };
}

/** A head that gets every cluster right. */
const goodHead = LinearHead.of(
  CLASSES,
  [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  [0, 0, 0],
);
/** One that gets every cluster wrong. */
const badHead = LinearHead.of(
  CLASSES,
  [
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 0],
  ],
  [0, 0, 0],
);

describe('labelObservationUseCase', () => {
  it('turns a confirmed photo into an embedding with its label', async () => {
    const { deps, photo, examples } = await subject();
    const observation = await photo(1, 'late_blight');

    const example = await labelObservationUseCase(deps)(observation.id, 'late_blight');

    expect(Array.from(example.embedding)).toEqual([0, 0, 2]);
    expect(example.backboneVersion).toBe('bb-1');
    expect(examples.items.size).toBe(1);
  });

  it('cannot label a photo whose original is gone, or that does not exist', async () => {
    const { deps, photo } = await subject();
    const purged = await photo(1, 'healthy', false);

    await expect(labelObservationUseCase(deps)(purged.id, 'healthy')).rejects.toThrow(
      ObservationNotLabelableError,
    );
    await expect(labelObservationUseCase(deps)(observationId('nope'), 'healthy')).rejects.toThrow(
      /does not exist/u,
    );
  });

  it('needs the model, to compute the embedding', async () => {
    const { deps, photo } = await subject({ model: undefined });
    const observation = await photo(1, 'healthy');

    await expect(labelObservationUseCase(deps)(observation.id, 'healthy')).rejects.toThrow(
      ModelUnavailableError,
    );
  });
});

describe('prepareContributionUseCase', () => {
  it('refuses to share without consent, or with too few examples', async () => {
    const { deps } = await subject();

    await expect(prepareContributionUseCase(deps)()).rejects.toThrow(/not agreed/u);

    await setFederationConsentUseCase(deps)('share_and_receive');
    await expect(prepareContributionUseCase(deps)()).rejects.toThrow(FederationPackageError);
  });

  it('produces a signed, clipped, noised delta carrying no data', async () => {
    const { deps, labelMany } = await subject();
    await setFederationConsentUseCase(deps)('share_and_receive');
    await labelMany();

    const contribution = await prepareContributionUseCase(deps)();
    const parts = decodeDeltaPackage(contribution.bytes);

    expect(parts.header.baseHeadVersion).toBe('bb-1');
    expect(parts.header.parameterCount).toBe(12);
    expect(parts.header.clipNorm).toBe(1);
    expect(parts.header.noiseSigma).toBe(0.01);
    expect(parts.header.sampleCount).toBe(contribution.header.sampleCount);
    expect(await deps.signer.verify(parts.signedBytes, parts.signature, parts.header.publicKey)).toBe(true);
    // Local training helped on the holdout, before anything left the phone.
    expect(contribution.holdoutAccuracyAfter).toBeGreaterThan(contribution.holdoutAccuracyBefore ?? 1);
    // The raw delta was longer than the clip norm; what is shared is not.
    expect(contribution.rawNorm).toBeGreaterThan(1);
    expect(Math.hypot(...parts.body)).toBeLessThan(1.5);
    // The header names no observation, plot or label.
    expect(JSON.stringify(parts.header)).not.toMatch(/obs-|p1|c1|blight|healthy/u);
  });

  it('gives each package its own key and identifier', async () => {
    const { deps, labelMany } = await subject();
    await setFederationConsentUseCase(deps)('share_and_receive');
    await labelMany();

    const first = await prepareContributionUseCase(deps)();
    const second = await prepareContributionUseCase(deps)();

    expect(first.header.publicKey).not.toBe(second.header.publicKey);
    expect(first.header.ephemeralId).not.toBe(second.header.ephemeralId);
  });
});

describe('importAggregatedModelUseCase', () => {
  it('accepts a signed aggregate that does not hurt the holdout, and adopts it', async () => {
    const { deps, labelMany, aggregate, model, settings } = await subject();
    await setFederationConsentUseCase(deps)('receive_only');
    await labelMany();

    const verdict = await importAggregatedModelUseCase(deps)(await aggregate(goodHead));

    expect(verdict).toMatchObject({ accepted: true, headVersion: 'bb-1+fed1', holdoutAfter: 1 });
    expect(model.model?.headVersion).toBe('bb-1+fed1');
    expect(Array.from(subtract(flatten(model.model?.head ?? startHead), flatten(goodHead)))).toEqual(
      new Array(12).fill(0),
    );
    // Trusted on first use from here on.
    expect(settings.hubKey).toBe('hub');
  });

  it('rejects an aggregate that degrades the local holdout', async () => {
    const { deps, labelMany, aggregate, model } = await subject();
    await setFederationConsentUseCase(deps)('receive_only');
    await labelMany();
    await model.adoptHead(goodHead, 'bb-1');

    const verdict = await importAggregatedModelUseCase(deps)(await aggregate(badHead));

    expect(verdict).toMatchObject({ accepted: false, reason: 'holdout_dropped', holdoutBefore: 1, holdoutAfter: 0 });
    expect(model.model?.head).toBe(goodHead);
  });

  it('rejects a tampered file, another hub, another backbone or base, and a phone with no holdout', async () => {
    const { deps, labelMany, aggregate, settings } = await subject();
    await setFederationConsentUseCase(deps)('receive_only');
    const importIt = importAggregatedModelUseCase(deps);

    expect(await importIt(await aggregate(goodHead))).toMatchObject({ reason: 'no_holdout' });

    await labelMany();
    const tampered = await aggregate(goodHead);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0x01;
    expect(await importIt(tampered)).toMatchObject({ reason: 'bad_signature' });

    expect(await importIt(await aggregate(goodHead, { backboneVersion: 'bb-2' }))).toMatchObject({
      reason: 'other_backbone',
    });
    expect(await importIt(await aggregate(goodHead, { baseHeadVersion: 'old' }))).toMatchObject({
      reason: 'other_base',
    });

    settings.hubKey = 'hub';
    expect(await importIt(await aggregate(goodHead, {}, 'impostor'))).toMatchObject({
      reason: 'untrusted_hub',
    });
  });

  it('receives nothing while consent is off', async () => {
    const { deps, aggregate } = await subject();

    expect(await importAggregatedModelUseCase(deps)(await aggregate(goodHead))).toEqual({
      accepted: false,
      reason: 'consent_off',
    });
  });
});

describe('getFederationStatusUseCase', () => {
  it('counts training and holdout examples, and reports holdout accuracy', async () => {
    const { deps, labelMany } = await subject();
    await setFederationConsentUseCase(deps)('share_and_receive');
    await labelMany(4);

    const status = await getFederationStatusUseCase(deps)();

    expect(status.consent).toBe('share_and_receive');
    expect(status.trainingExamples + status.holdoutExamples).toBe(12);
    const expectedHoldout = CLASSES.flatMap((cls) =>
      [0, 1, 2, 3].map((index) => `obs-${cls}-${index}`),
    ).filter(isHoldout).length;
    expect(status.holdoutExamples).toBe(expectedHoldout);
    expect(status.headVersion).toBe('bb-1');
  });

  it('reports nothing to count before the model is downloaded', async () => {
    const { deps } = await subject({ model: undefined });

    expect(await getFederationStatusUseCase(deps)()).toMatchObject({
      consent: 'off',
      trainingExamples: 0,
    });
  });
});
