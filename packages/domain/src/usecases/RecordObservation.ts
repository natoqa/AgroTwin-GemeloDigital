import { PlotNotFoundError } from '../errors/PlotNotFoundError.js';
import { LocalDate } from '../model/LocalDate.js';
import { snapshotId } from '../model/Ids.js';
import type { ImageRef, PlotId } from '../model/Ids.js';
import type { TwinSnapshot } from '../model/TwinSnapshot.js';
import type { ClockPort } from '../ports/ClockPort.js';
import type { IdGeneratorPort } from '../ports/IdGeneratorPort.js';
import type { ImageStorePort } from '../ports/ImageStorePort.js';
import type { InferencePort } from '../ports/InferencePort.js';
import type { PlotRepositoryPort } from '../ports/PlotRepositoryPort.js';
import type { SnapshotRepositoryPort } from '../ports/SnapshotRepositoryPort.js';

export interface RecordObservationDependencies {
  readonly plots: PlotRepositoryPort;
  readonly snapshots: SnapshotRepositoryPort;
  readonly images: ImageStorePort;
  readonly inference: InferencePort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
}

export interface RecordObservationInput {
  readonly plotId: PlotId;
  readonly image: ArrayBuffer;
  readonly contentType: string;
}

/**
 * The vertical slice, as one domain operation: a photograph of a plot becomes
 * a snapshot of the twin.
 *
 * The diagnosis is never returned on its own. It leaves here embedded in a
 * `TwinSnapshot`, with its date, its plot and its confidence, because a
 * diagnosis shown apart from the state of the twin is exactly what CLAUDE.md
 * section 18 forbids.
 */
export function recordObservationUseCase(deps: RecordObservationDependencies) {
  return async function execute(input: RecordObservationInput): Promise<TwinSnapshot> {
    const plot = await deps.plots.findById(input.plotId);
    if (!plot) {
      throw new PlotNotFoundError(input.plotId);
    }

    // The image is stored before inference so a diagnosis can never reference
    // a photograph that was never kept.
    const ref: ImageRef = await deps.images.put(input.image, input.contentType);
    const diagnosis = await deps.inference.diagnose(input.image);
    const at = deps.clock.now();

    const snapshot: TwinSnapshot = {
      id: snapshotId(deps.ids.newId()),
      plotId: plot.id,
      at,
      date: LocalDate.fromEpochMillis(at),
      diagnosis,
      imageRef: ref,
      // Image diagnosis is the only input the twin has in Phase 1, so the
      // snapshot can be no more confident than it is.
      confidence: diagnosis.confidence,
      provenance: [
        { field: 'diagnosis', source: 'image_diagnosis', confidence: diagnosis.confidence },
      ],
    };

    await deps.snapshots.save(snapshot);
    return snapshot;
  };
}
