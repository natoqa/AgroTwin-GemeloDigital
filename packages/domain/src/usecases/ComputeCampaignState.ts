import type { Coefficients } from '../agronomy/Coefficients.js';
import { CampaignNotFoundError } from '../errors/CampaignNotFoundError.js';
import { PlotNotFoundError } from '../errors/PlotNotFoundError.js';
import type { Campaign } from '../model/Campaign.js';
import type { CampaignId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import type { Plot } from '../model/Plot.js';
import type { CampaignRepositoryPort } from '../ports/CampaignRepositoryPort.js';
import type { ClockPort } from '../ports/ClockPort.js';
import type { PlotRepositoryPort } from '../ports/PlotRepositoryPort.js';
import type { WeatherPort } from '../ports/WeatherPort.js';
import { runBehaviorEngine } from '../twin/BehaviorEngine.js';
import type { TwinDayState } from '../twin/BehaviorEngine.js';

export interface ComputeCampaignStateDependencies {
  readonly plots: PlotRepositoryPort;
  readonly campaigns: CampaignRepositoryPort;
  readonly weather: WeatherPort;
  readonly coefficients: Coefficients;
  readonly clock: ClockPort;
}

/** Why the engine could not produce a state, when it could not. */
export type UnavailableReason = 'no_location' | 'no_weather' | 'missing_coefficients';

export interface CampaignState {
  readonly campaign: Campaign;
  readonly plot: Plot;
  /** Oldest first. Empty when nothing could be computed. */
  readonly days: readonly TwinDayState[];
  readonly latest?: TwinDayState;
  readonly unavailable?: UnavailableReason;
  /** Which coefficients were missing, when that is the reason. */
  readonly missingCoefficients?: readonly string[];
}

/**
 * Runs the twin forward over a campaign and returns what it found.
 *
 * Every way this can fail is a *named* outcome, not an exception and not a
 * blank screen. A plot with no coordinates, a campaign with no weather, a
 * coefficient nobody supplied — the farmer is owed a reason in each case, and
 * the Advisor in Phase 4 needs to distinguish them to say anything useful.
 */
export function computeCampaignStateUseCase(deps: ComputeCampaignStateDependencies) {
  return async function execute(id: CampaignId): Promise<CampaignState> {
    const campaign = await deps.campaigns.findById(id);
    if (!campaign) {
      throw new CampaignNotFoundError(id);
    }
    const plot = await deps.plots.findById(campaign.plotId);
    if (!plot) {
      throw new PlotNotFoundError(campaign.plotId);
    }

    if (!plot.location) {
      // Hargreaves-Samani derives radiation from latitude. Without one there
      // is no evapotranspiration, so there is no water balance either.
      return { campaign, plot, days: [], unavailable: 'no_location' };
    }

    const today = LocalDate.fromEpochMillis(deps.clock.now());
    const until = campaign.closedOn ?? today;
    const weather = await deps.weather.weatherBetween(campaign.plantingDate, until, plot);
    if (weather.length === 0) {
      return { campaign, plot, days: [], unavailable: 'no_weather' };
    }

    const result = runBehaviorEngine({
      campaign,
      location: plot.location,
      coefficients: deps.coefficients,
      weather,
    });

    if (result.unavailable.length > 0) {
      return {
        campaign,
        plot,
        days: [],
        unavailable: 'missing_coefficients',
        missingCoefficients: result.unavailable,
      };
    }

    return {
      campaign,
      plot,
      days: result.days,
      ...(result.latest === undefined ? {} : { latest: result.latest }),
    };
  };
}
