import { CampaignNotFoundError } from '../errors/CampaignNotFoundError.js';
import { PlotNotFoundError } from '../errors/PlotNotFoundError.js';
import { isCampaignActive } from '../model/Campaign.js';
import type { Campaign } from '../model/Campaign.js';
import type { CampaignId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import type { Plot } from '../model/Plot.js';
import type { CampaignRepositoryPort } from '../ports/CampaignRepositoryPort.js';
import type { ClockPort } from '../ports/ClockPort.js';
import type { PlotRepositoryPort } from '../ports/PlotRepositoryPort.js';
import type { SnapshotRepositoryPort } from '../ports/SnapshotRepositoryPort.js';
import type { WeatherObservationRepositoryPort } from '../ports/WeatherObservationRepositoryPort.js';
import { WATER_LOOKAHEAD_DAYS, advise } from '../twin/Advisor.js';
import type { AdvisorInput, Recommendation } from '../twin/Advisor.js';
import { runBehaviorEngine } from '../twin/BehaviorEngine.js';
import { estimateHarvestDate, simulateNoIrrigation } from '../twin/Simulator.js';
import type { HarvestEstimate } from '../twin/Simulator.js';
import { loadSimulationInput } from './loadSimulationInput.js';
import type { SimulationSources } from './loadSimulationInput.js';
import { HARVEST_SEARCH_LIMIT_DAYS } from './SimulateScenario.js';

export interface AdviseCampaignDependencies extends SimulationSources {
  readonly plots: PlotRepositoryPort;
  readonly campaigns: CampaignRepositoryPort;
  readonly snapshots: SnapshotRepositoryPort;
  readonly weatherObservations: WeatherObservationRepositoryPort;
  readonly clock: ClockPort;
}

export interface CampaignAdvice {
  readonly campaign: Campaign;
  readonly plot: Plot;
  /** Most important first. Empty for a harvested campaign. */
  readonly recommendations: readonly Recommendation[];
  /** The harvest estimate the advice used, for the board to show on its own. */
  readonly harvest?: HarvestEstimate;
}

/**
 * Everything the Advisor needs, gathered once, and the advice it gives.
 *
 * This is where the twin's three parts meet: the BehaviorEngine's state of
 * today, the Simulator's next few days and harvest date, and the latest
 * photograph and weather answer. The Advisor itself stays pure; this use case
 * only reads.
 */
export function adviseCampaignUseCase(deps: AdviseCampaignDependencies) {
  return async function execute(id: CampaignId): Promise<CampaignAdvice> {
    const campaign = await deps.campaigns.findById(id);
    if (!campaign) throw new CampaignNotFoundError(id);
    const plot = await deps.plots.findById(campaign.plotId);
    if (!plot) throw new PlotNotFoundError(campaign.plotId);

    const today = LocalDate.fromEpochMillis(deps.clock.now());
    const active = isCampaignActive(campaign);
    if (!active) {
      return { campaign, plot, recommendations: [] };
    }

    const [snapshots, answers] = await Promise.all([
      deps.snapshots.listByCampaign(campaign.id),
      deps.weatherObservations.listBetween(plot.id, today.plusDays(-1), today),
    ]);
    const shared = {
      active,
      today,
      ...optional('latestSnapshot', snapshots[snapshots.length - 1]),
      ...optional('lastWeatherAnswer', answers[answers.length - 1]?.date),
    };

    const lookahead = today.plusDays(WATER_LOOKAHEAD_DAYS);
    const harvestLimit = campaign.plantingDate.plusDays(HARVEST_SEARCH_LIMIT_DAYS);
    const until = lookahead.daysUntil(harvestLimit) > 0 ? harvestLimit : lookahead;
    const input = await loadSimulationInput(deps, campaign, plot, today, until);

    let advisorInput: AdvisorInput;
    let harvest: HarvestEstimate | undefined;
    if (!input) {
      advisorInput = { ...shared, blocker: 'no_location' };
    } else if (input.history.length === 0) {
      advisorInput = { ...shared, blocker: 'no_weather' };
    } else {
      const present = runBehaviorEngine({
        campaign,
        location: input.location,
        coefficients: input.coefficients,
        weather: input.history,
        irrigatedDates: input.irrigatedDates,
      });
      if (!present.latest) {
        advisorInput = { ...shared, blocker: 'missing_coefficients' };
      } else {
        const water = simulateNoIrrigation(input, WATER_LOOKAHEAD_DAYS);
        harvest = estimateHarvestDate(input);
        advisorInput = {
          ...shared,
          state: present.latest,
          ...(water.available ? { water } : {}),
          harvest,
        };
      }
    }

    return {
      campaign,
      plot,
      recommendations: advise(advisorInput),
      ...(harvest === undefined ? {} : { harvest }),
    };
  };
}

/** `{ key: value }` when there is a value, `{}` when there is not. */
function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]?: V });
}
