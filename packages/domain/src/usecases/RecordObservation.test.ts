import { describe, expect, it } from 'vitest';
import { epochMillis } from '../model/EpochMillis.js';
import { campaignId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import type { Diagnosis } from '../model/Diagnosis.js';
import { CampaignNotActiveError } from '../errors/CampaignNotActiveError.js';
import { CampaignNotFoundError } from '../errors/CampaignNotFoundError.js';
import { fixedClock } from '../testing/doubles.js';
import { createTestTwin } from '../testing/scenario.js';

const AT = epochMillis(1_790_028_000_000); // 2026-09-21T22:00:00Z
const HEALTHY: Diagnosis = { class: 'healthy', confidence: 0.91, modelVersion: 'mock-1' };
const REJECTED: Diagnosis = { class: 'rejected', confidence: 0.22, modelVersion: 'mock-1' };

async function twinWithCampaign(diagnosis: Diagnosis) {
  const twin = createTestTwin({ clock: fixedClock(AT), diagnosis });
  const plot = await twin.createPlot({ name: 'Chacra de arriba' });
  const campaign = await twin.startCampaign({
    plotId: plot.id,
    plantingDate: LocalDate.of(2026, 9, 1),
  });
  return { twin, plot, campaign };
}

describe('recordObservationUseCase', () => {
  it('turns a photograph into evidence and a state of the twin', async () => {
    const { twin, plot, campaign } = await twinWithCampaign(HEALTHY);

    const { observation, snapshot } = await twin.recordObservation({
      campaignId: campaign.id,
      image: new ArrayBuffer(64),
      contentType: 'image/jpeg',
    });

    expect(observation.plotId).toBe(plot.id);
    expect(observation.campaignId).toBe(campaign.id);
    expect(observation.imageRef).toBeDefined();
    expect(observation.thumbnailRef).toBeDefined();

    expect(snapshot.campaignId).toBe(campaign.id);
    expect(snapshot.observationId).toBe(observation.id);
    expect(snapshot.at).toBe(AT);
    expect(snapshot.date.toString()).toBe('2026-09-21');
    expect(snapshot.diagnosis).toEqual(HEALTHY);
  });

  it('carries the provenance and confidence of its only input', async () => {
    const { twin, campaign } = await twinWithCampaign(HEALTHY);

    const { snapshot } = await twin.recordObservation({
      campaignId: campaign.id,
      image: new ArrayBuffer(8),
      contentType: 'image/jpeg',
    });

    expect(snapshot.confidence).toBe(HEALTHY.confidence);
    expect(snapshot.provenance).toEqual([
      { field: 'diagnosis', source: 'image_diagnosis', confidence: HEALTHY.confidence },
    ]);
  });

  it('keeps the farmer note with the evidence', async () => {
    const { twin, campaign } = await twinWithCampaign(HEALTHY);

    const { observation } = await twin.recordObservation({
      campaignId: campaign.id,
      image: new ArrayBuffer(8),
      contentType: 'image/jpeg',
      note: 'hojas de la esquina baja',
    });

    expect(observation.note).toBe('hojas de la esquina baja');
  });

  it('records a rejection as history too, with its low confidence', async () => {
    const { twin, campaign } = await twinWithCampaign(REJECTED);

    const { snapshot } = await twin.recordObservation({
      campaignId: campaign.id,
      image: new ArrayBuffer(8),
      contentType: 'image/jpeg',
    });

    // A refusal is part of the twin's history, not a discarded attempt.
    expect(snapshot.diagnosis.class).toBe('rejected');
    expect(snapshot.confidence).toBe(0.22);
    expect(await twin.snapshots.listByCampaign(campaign.id)).toHaveLength(1);
  });

  it('refuses a campaign that does not exist, storing nothing', async () => {
    const { twin } = await twinWithCampaign(HEALTHY);

    await expect(
      twin.recordObservation({
        campaignId: campaignId('missing'),
        image: new ArrayBuffer(8),
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow(CampaignNotFoundError);

    expect(await twin.observations.listAll()).toHaveLength(0);
    expect(twin.images.items.size).toBe(0);
  });

  it('refuses to add observations to a harvested campaign', async () => {
    const { twin, campaign } = await twinWithCampaign(HEALTHY);
    await twin.closeCampaign({ campaignId: campaign.id });

    await expect(
      twin.recordObservation({
        campaignId: campaign.id,
        image: new ArrayBuffer(8),
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow(CampaignNotActiveError);

    expect(await twin.observations.listAll()).toHaveLength(0);
  });
});
