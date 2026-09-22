import type { Diagnosis } from '../model/Diagnosis.js';
import type { RetentionPolicy } from '../model/RetentionPolicy.js';
import type { ClockPort } from '../ports/ClockPort.js';
import type { IdGeneratorPort } from '../ports/IdGeneratorPort.js';
import { applyImageRetentionUseCase } from '../usecases/ApplyImageRetention.js';
import { closeCampaignUseCase } from '../usecases/CloseCampaign.js';
import { createPlotUseCase } from '../usecases/CreatePlot.js';
import { eraseAllDataUseCase } from '../usecases/EraseAllData.js';
import { exportBackupUseCase } from '../usecases/ExportBackup.js';
import { getCampaignTimelineUseCase } from '../usecases/GetCampaignTimeline.js';
import { importBackupUseCase } from '../usecases/ImportBackup.js';
import { recordObservationUseCase } from '../usecases/RecordObservation.js';
import { startCampaignUseCase } from '../usecases/StartCampaign.js';
import { updatePlotDetailsUseCase } from '../usecases/UpdatePlotDetails.js';
import {
  InMemoryCampaigns,
  InMemoryImageStore,
  InMemoryObservations,
  InMemoryPlots,
  InMemorySnapshots,
  countingIds,
  stubInference,
} from './doubles.js';

export interface TestTwinOptions {
  readonly clock: ClockPort;
  readonly diagnosis: Diagnosis;
  readonly ids?: IdGeneratorPort;
  readonly retention?: RetentionPolicy;
}

/**
 * A whole twin wired from doubles.
 *
 * Several use cases in this phase only mean anything against four
 * repositories and an image store at once — retention has to reach
 * observations, backup has to reach everything — so the tests assemble the
 * same graph the composition root does, just with memory behind it.
 */
export function createTestTwin(options: TestTwinOptions) {
  const { clock, diagnosis } = options;
  const ids = options.ids ?? countingIds();

  const plots = new InMemoryPlots();
  const campaigns = new InMemoryCampaigns();
  const observations = new InMemoryObservations();
  const snapshots = new InMemorySnapshots();
  const images = new InMemoryImageStore(clock);
  const inference = stubInference(diagnosis);

  return {
    plots,
    campaigns,
    observations,
    snapshots,
    images,
    clock,
    ids,
    createPlot: createPlotUseCase({ plots, clock, ids }),
    updatePlotDetails: updatePlotDetailsUseCase({ plots }),
    startCampaign: startCampaignUseCase({ plots, campaigns, clock, ids }),
    closeCampaign: closeCampaignUseCase({ campaigns, clock }),
    recordObservation: recordObservationUseCase({
      plots,
      campaigns,
      observations,
      snapshots,
      images,
      inference,
      clock,
      ids,
    }),
    getCampaignTimeline: getCampaignTimelineUseCase({ plots, campaigns, observations, snapshots }),
    applyImageRetention: applyImageRetentionUseCase({
      images,
      observations,
      clock,
      ...(options.retention === undefined ? {} : { policy: options.retention }),
    }),
    exportBackup: exportBackupUseCase({
      plots,
      campaigns,
      observations,
      snapshots,
      images,
      clock,
    }),
    importBackup: importBackupUseCase({ plots, campaigns, observations, snapshots, images }),
    eraseAllData: eraseAllDataUseCase({ plots, campaigns, observations, snapshots, images }),
  };
}

export type TestTwin = ReturnType<typeof createTestTwin>;
