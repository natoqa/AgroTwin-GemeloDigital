import type { Coefficients } from '../agronomy/Coefficients.js';
import { runBehaviorEngine } from '../twin/BehaviorEngine.js';
import type { TwinDayState } from '../twin/BehaviorEngine.js';
import type { WeatherPort } from '../ports/WeatherPort.js';
import { CampaignNotActiveError } from '../errors/CampaignNotActiveError.js';
import { CampaignNotFoundError } from '../errors/CampaignNotFoundError.js';
import { PlotNotFoundError } from '../errors/PlotNotFoundError.js';
import { isCampaignActive } from '../model/Campaign.js';
import type { Campaign } from '../model/Campaign.js';
import type { Plot } from '../model/Plot.js';
import { observationId, snapshotId } from '../model/Ids.js';
import type { CampaignId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import { createObservation } from '../model/Observation.js';
import type { Observation } from '../model/Observation.js';
import type { TwinSnapshot } from '../model/TwinSnapshot.js';
import type { CampaignRepositoryPort } from '../ports/CampaignRepositoryPort.js';
import type { ClockPort } from '../ports/ClockPort.js';
import type { IdGeneratorPort } from '../ports/IdGeneratorPort.js';
import type { ImageStorePort } from '../ports/ImageStorePort.js';
import type { InferencePort } from '../ports/InferencePort.js';
import type { ObservationRepositoryPort } from '../ports/ObservationRepositoryPort.js';
import type { PlotRepositoryPort } from '../ports/PlotRepositoryPort.js';
import type { SnapshotRepositoryPort } from '../ports/SnapshotRepositoryPort.js';

export interface RecordObservationDependencies {
  readonly plots: PlotRepositoryPort;
  readonly campaigns: CampaignRepositoryPort;
  readonly observations: ObservationRepositoryPort;
  readonly snapshots: SnapshotRepositoryPort;
  readonly images: ImageStorePort;
  readonly inference: InferencePort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  /**
   * Optional, because the slice must keep working without it. When it is
   * supplied and the plot has a location, the snapshot carries the agronomic
   * state of the day as well as the diagnosis; when it is not, those fields
   * stay absent rather than zero.
   */
  readonly agronomy?: {
    readonly weather: WeatherPort;
    readonly coefficients: Coefficients;
  };
}

export interface RecordObservationInput {
  readonly campaignId: CampaignId;
  readonly image: ArrayBuffer;
  readonly contentType: string;
  readonly note?: string;
}

export interface RecordObservationResult {
  readonly observation: Observation;
  readonly snapshot: TwinSnapshot;
}

/**
 * A photograph of a plot becomes evidence, and evidence becomes a state of the
 * twin.
 *
 * The two are written separately because they decay differently: the
 * observation may lose its photograph to the retention policy, while the
 * snapshot is what the twin reasons with and is never purged.
 *
 * The diagnosis is never returned on its own. It leaves here inside a
 * `TwinSnapshot`, with its campaign, its date and its confidence, because a
 * diagnosis shown apart from the state of the twin is what CLAUDE.md §18
 * forbids.
 */
export function recordObservationUseCase(deps: RecordObservationDependencies) {
  return async function execute(input: RecordObservationInput): Promise<RecordObservationResult> {
    const campaign = await deps.campaigns.findById(input.campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(input.campaignId);
    }
    if (!isCampaignActive(campaign)) {
      throw new CampaignNotActiveError(campaign.id, 'take new observations');
    }
    const plot = await deps.plots.findById(campaign.plotId);
    if (!plot) {
      throw new PlotNotFoundError(campaign.plotId);
    }

    // The image is stored before inference so a diagnosis can never reference
    // a photograph that was never kept.
    const stored = await deps.images.put(input.image, input.contentType);
    const diagnosis = await deps.inference.diagnose(input.image);
    const at = deps.clock.now();
    const date = LocalDate.fromEpochMillis(at);

    const observation = createObservation({
      id: observationId(deps.ids.newId()),
      plotId: plot.id,
      campaignId: campaign.id,
      at,
      date,
      diagnosis,
      imageRef: stored.original,
      ...(stored.thumbnail === undefined ? {} : { thumbnailRef: stored.thumbnail }),
      ...(input.note === undefined ? {} : { note: input.note }),
    });
    await deps.observations.save(observation);

    const agronomy = await agronomicStateFor(deps, campaign, plot, date);

    const snapshot: TwinSnapshot = {
      id: snapshotId(deps.ids.newId()),
      plotId: plot.id,
      campaignId: campaign.id,
      at,
      date,
      diagnosis,
      observationId: observation.id,
      // Image diagnosis is the only input the twin has so far, so the snapshot
      // can be no more confident than it is.
      confidence: diagnosis.confidence,
      ...agronomicFields(agronomy),
      provenance: [
        { field: 'diagnosis', source: 'image_diagnosis', confidence: diagnosis.confidence },
        ...(agronomy?.provenance ?? []),
      ],
    };
    await deps.snapshots.save(snapshot);

    return { observation, snapshot };
  };
}

/** Runs the engine up to the day of the observation, if it can. */
async function agronomicStateFor(
  deps: RecordObservationDependencies,
  campaign: Campaign,
  plot: Plot,
  date: LocalDate,
): Promise<TwinDayState | undefined> {
  if (!deps.agronomy || !plot.location) return undefined;

  const weather = await deps.agronomy.weather.weatherBetween(campaign.plantingDate, date, plot);
  if (weather.length === 0) return undefined;

  const result = runBehaviorEngine({
    campaign,
    location: plot.location,
    coefficients: deps.agronomy.coefficients,
    weather,
  });
  return result.latest;
}

function agronomicFields(state: TwinDayState | undefined) {
  if (!state) return {};
  return {
    accumulatedGdd: state.accumulatedGdd,
    ...(state.phenologicalStage === undefined
      ? {}
      : { phenologicalStage: state.phenologicalStage }),
    waterDepletion: state.waterBalance.depletion,
    underWaterStress: state.waterBalance.underStress,
    ...(state.lateBlightRisk === undefined
      ? {}
      : {
          lateBlightSeverity: state.lateBlightRisk.accumulatedSeverity,
          sprayAdvised: state.lateBlightRisk.sprayAdvised,
        }),
  };
}
