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
import {
  estimateHarvestDate,
  simulateFungicideToday,
  simulateNoIrrigation,
} from '../twin/Simulator.js';
import type {
  FungicideProjection,
  HarvestEstimate,
  SimulationInput,
  SimulationUnavailable,
  WaterProjection,
} from '../twin/Simulator.js';
import { loadSimulationInput } from './loadSimulationInput.js';
import type { SimulationSources } from './loadSimulationInput.js';

/**
 * How far the fungicide comparison looks ahead.
 *
 * An engineering bound, not agronomy: three weeks is long enough to watch a
 * protection period of any plausible length end and the count start again,
 * and short enough that the answer is still about the coming days rather than
 * about climatological normals months out.
 */
export const FUNGICIDE_HORIZON_DAYS = 21;

/**
 * How far past planting the harvest search may run.
 *
 * A search bound, not a season length: if the thermal clock has not reached
 * maturity within a year, the answer is "I cannot tell", not a date.
 */
export const HARVEST_SEARCH_LIMIT_DAYS = 365;

/** The longest dry spell the farmer can ask about, in days. */
export const MAX_DAYS_WITHOUT_WATER = 30;

export type Scenario =
  | { readonly kind: 'no_irrigation'; readonly days: number }
  | { readonly kind: 'fungicide_today' }
  | { readonly kind: 'harvest_date' };

/** Why the question could not even be put to the Simulator. */
export type ScenarioPrecondition =
  | { readonly available: false; readonly reason: 'no_location' }
  | { readonly available: false; readonly reason: 'campaign_closed' };

export type ScenarioOutcome =
  | { readonly kind: 'no_irrigation'; readonly result: WaterProjection | SimulationUnavailable }
  | {
      readonly kind: 'fungicide_today';
      readonly result: FungicideProjection | SimulationUnavailable;
    }
  | { readonly kind: 'harvest_date'; readonly result: HarvestEstimate };

export interface ScenarioAnswer {
  readonly campaign: Campaign;
  readonly plot: Plot;
  readonly outcome: ScenarioOutcome | ScenarioPrecondition;
}

export interface SimulateScenarioDependencies extends SimulationSources {
  readonly plots: PlotRepositoryPort;
  readonly campaigns: CampaignRepositoryPort;
  readonly clock: ClockPort;
}

/**
 * Answers one what-if question about a campaign (CLAUDE.md §8.3).
 *
 * Every refusal is a named outcome the screen can explain, the same rule as
 * `computeCampaignState`: a harvested campaign has no future to simulate, a
 * plot without a location has no water balance, and a scenario resting on an
 * unknown coefficient says which one.
 */
export function simulateScenarioUseCase(deps: SimulateScenarioDependencies) {
  return async function execute(id: CampaignId, scenario: Scenario): Promise<ScenarioAnswer> {
    const campaign = await deps.campaigns.findById(id);
    if (!campaign) throw new CampaignNotFoundError(id);
    const plot = await deps.plots.findById(campaign.plotId);
    if (!plot) throw new PlotNotFoundError(campaign.plotId);

    if (!isCampaignActive(campaign)) {
      return { campaign, plot, outcome: { available: false, reason: 'campaign_closed' } };
    }

    const today = LocalDate.fromEpochMillis(deps.clock.now());
    const until = horizonFor(scenario, campaign, today);
    const input = await loadSimulationInput(deps, campaign, plot, today, until);
    if (!input) {
      return { campaign, plot, outcome: { available: false, reason: 'no_location' } };
    }

    return { campaign, plot, outcome: run(scenario, input) };
  };
}

function horizonFor(scenario: Scenario, campaign: Campaign, today: LocalDate): LocalDate {
  switch (scenario.kind) {
    case 'no_irrigation':
      return today.plusDays(clampDays(scenario.days));
    case 'fungicide_today':
      return today.plusDays(FUNGICIDE_HORIZON_DAYS);
    case 'harvest_date':
      return campaign.plantingDate.plusDays(HARVEST_SEARCH_LIMIT_DAYS);
  }
}

function run(scenario: Scenario, input: SimulationInput): ScenarioOutcome {
  switch (scenario.kind) {
    case 'no_irrigation':
      return {
        kind: 'no_irrigation',
        result: simulateNoIrrigation(input, clampDays(scenario.days)),
      };
    case 'fungicide_today':
      return {
        kind: 'fungicide_today',
        result: simulateFungicideToday(input, FUNGICIDE_HORIZON_DAYS),
      };
    case 'harvest_date':
      return { kind: 'harvest_date', result: estimateHarvestDate(input) };
  }
}

/** Whole days between one and the maximum; anything else is a UI slip. */
const clampDays = (days: number): number =>
  Number.isFinite(days) ? Math.min(MAX_DAYS_WITHOUT_WATER, Math.max(1, Math.floor(days))) : 1;
