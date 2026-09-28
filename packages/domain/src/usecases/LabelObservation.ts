import { ModelUnavailableError } from '../errors/ModelUnavailableError.js';
import { ObservationNotLabelableError } from '../errors/ObservationNotLabelableError.js';
import type { TrainingExample } from '../learning/Federation.js';
import type { ModelClass } from '../learning/ModelContract.js';
import type { ObservationId } from '../model/Ids.js';
import type { FederationDependencies } from './federationDependencies.js';

/**
 * The farmer confirms or corrects a diagnosis. Only such examples are ever
 * trained on (CLAUDE.md §11): the model's own guesses would teach it nothing.
 *
 * The embedding is computed from the original photograph, which the retention
 * policy keeps for a while. Once it is purged, the observation can no longer
 * become a training example.
 */
export function labelObservationUseCase(deps: FederationDependencies) {
  return async function execute(
    observationId: ObservationId,
    label: ModelClass,
  ): Promise<TrainingExample> {
    const observation = await deps.observations.findById(observationId);
    if (!observation) throw new ObservationNotLabelableError(observationId, 'it does not exist');
    if (observation.imageRef === undefined) {
      throw new ObservationNotLabelableError(observationId, 'its photograph is no longer kept');
    }
    const image = await deps.images.get(observation.imageRef);
    if (!image) throw new ObservationNotLabelableError(observationId, 'its photograph is missing');
    const current = await deps.model.current();
    if (!current) throw new ModelUnavailableError('it has not been downloaded to this device');

    const example: TrainingExample = {
      observationId,
      label,
      embedding: await deps.embedder.embed(image),
      backboneVersion: current.contract.version,
      labeledAt: deps.clock.now(),
    };
    await deps.examples.save(example);
    return example;
  };
}
