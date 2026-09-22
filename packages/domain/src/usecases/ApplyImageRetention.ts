import type { ImageRef } from '../model/Ids.js';
import { withOriginalPurged } from '../model/Observation.js';
import { DEFAULT_RETENTION_POLICY } from '../model/RetentionPolicy.js';
import type { RetentionPolicy } from '../model/RetentionPolicy.js';
import type { ClockPort } from '../ports/ClockPort.js';
import type { ImageStorePort, StoredImageInfo } from '../ports/ImageStorePort.js';
import type { ObservationRepositoryPort } from '../ports/ObservationRepositoryPort.js';

const MILLIS_PER_DAY = 86_400_000;

export interface ApplyImageRetentionDependencies {
  readonly images: ImageStorePort;
  readonly observations: ObservationRepositoryPort;
  readonly clock: ClockPort;
  readonly policy?: RetentionPolicy;
}

export interface ApplyImageRetentionResult {
  readonly purgedCount: number;
  readonly freedBytes: number;
  readonly remainingBytes: number;
}

/**
 * Drops full photographs the device no longer needs to keep.
 *
 * The policy lives in the domain and the bytes live in the adapter, so what
 * gets deleted is decided by a pure, testable rule rather than by whichever
 * storage backend happens to be installed. Thumbnails are never candidates:
 * they are what keeps a purged observation recognisable to the farmer.
 *
 * Purging is a two-step commitment. The observation forgets the reference
 * first and the bytes go second, so a crash in between leaves orphaned bytes —
 * recoverable waste — rather than an observation pointing at a photograph that
 * no longer exists.
 */
export function applyImageRetentionUseCase(deps: ApplyImageRetentionDependencies) {
  const policy = deps.policy ?? DEFAULT_RETENTION_POLICY;

  return async function execute(): Promise<ApplyImageRetentionResult> {
    const originals = [...(await deps.images.listOriginals())].sort(
      (left, right) => left.storedAt - right.storedAt,
    );
    const cutoff = deps.clock.now() - policy.keepOriginalsForDays * MILLIS_PER_DAY;

    const doomed: StoredImageInfo[] = [];
    const kept: StoredImageInfo[] = [];
    for (const image of originals) {
      if (image.storedAt < cutoff) {
        doomed.push(image);
      } else {
        kept.push(image);
      }
    }

    // Still over budget after the age pass: give up the oldest survivors until
    // it fits. Oldest first, because the newest photograph is the one the
    // farmer is most likely to want to look at again.
    let keptBytes = kept.reduce((total, image) => total + image.byteLength, 0);
    while (keptBytes > policy.maxOriginalBytes && kept.length > 0) {
      const oldest = kept.shift();
      if (!oldest) break;
      keptBytes -= oldest.byteLength;
      doomed.push(oldest);
    }

    let freedBytes = 0;
    for (const image of doomed) {
      await forget(deps.observations, image.ref);
      await deps.images.delete(image.ref);
      freedBytes += image.byteLength;
    }

    return { purgedCount: doomed.length, freedBytes, remainingBytes: keptBytes };
  };
}

async function forget(observations: ObservationRepositoryPort, ref: ImageRef): Promise<void> {
  const observation = await observations.findByOriginalImageRef(ref);
  if (observation) {
    await observations.save(withOriginalPurged(observation));
  }
}
