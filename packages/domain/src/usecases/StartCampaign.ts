import { ActiveCampaignAlreadyExistsError } from '../errors/ActiveCampaignAlreadyExistsError.js';
import { PlotNotFoundError } from '../errors/PlotNotFoundError.js';
import { startCampaign } from '../model/Campaign.js';
import type { Campaign } from '../model/Campaign.js';
import { campaignId } from '../model/Ids.js';
import type { PlotId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import type { CampaignRepositoryPort } from '../ports/CampaignRepositoryPort.js';
import type { ClockPort } from '../ports/ClockPort.js';
import type { IdGeneratorPort } from '../ports/IdGeneratorPort.js';
import type { PlotRepositoryPort } from '../ports/PlotRepositoryPort.js';

export interface StartCampaignDependencies {
  readonly plots: PlotRepositoryPort;
  readonly campaigns: CampaignRepositoryPort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
}

export interface StartCampaignInput {
  readonly plotId: PlotId;
  readonly plantingDate: LocalDate;
}

/**
 * Opens a crop cycle on a plot.
 *
 * The one-open-campaign-per-plot rule is enforced here rather than in the
 * database: it is a statement about what a plot *is*, and a unique index would
 * state it in a place the domain tests cannot reach.
 */
export function startCampaignUseCase(deps: StartCampaignDependencies) {
  return async function execute(input: StartCampaignInput): Promise<Campaign> {
    const plot = await deps.plots.findById(input.plotId);
    if (!plot) {
      throw new PlotNotFoundError(input.plotId);
    }

    const open = await deps.campaigns.findActiveByPlot(input.plotId);
    if (open) {
      throw new ActiveCampaignAlreadyExistsError(input.plotId, open.id);
    }

    const startedAt = deps.clock.now();
    const campaign = startCampaign({
      id: campaignId(deps.ids.newId()),
      plotId: plot.id,
      plantingDate: input.plantingDate,
      startedAt,
      today: LocalDate.fromEpochMillis(startedAt),
    });

    await deps.campaigns.save(campaign);
    return campaign;
  };
}
