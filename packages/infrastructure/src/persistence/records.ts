import {
  CROP,
  LocalDate,
  campaignId,
  createObservation,
  createPlot,
  epochMillis,
  imageRef,
  observationId,
  plotId,
  snapshotId,
} from '@agrotwin/domain';
import type {
  Campaign,
  CampaignStatus,
  DiagnosisClass,
  ImageKind,
  Observation,
  Plot,
  ProvenanceEntry,
  StoredImageInfo,
  TwinSnapshot,
} from '@agrotwin/domain';

/**
 * The stored shapes, and the mapping to and from the domain.
 *
 * IndexedDB stores structured-clonable data, so the domain's value objects do
 * not go in as they are: `LocalDate` is persisted as `YYYY-MM-DD` and rebuilt
 * on the way out. Keeping the mapping in one file means the domain never has
 * to know a database exists.
 *
 * Optional fields are omitted rather than stored as `undefined`: an absent
 * `imageRef` is how a purged photograph is recorded, and Dexie indexes a
 * missing key differently from one holding `undefined`.
 */

export interface PlotRecord {
  id: string;
  name: string;
  createdAt: number;
  area?: number;
  latitude?: number;
  longitude?: number;
  altitude?: number;
}

export interface CampaignRecord {
  id: string;
  plotId: string;
  crop: string;
  plantingDate: string;
  startedAt: number;
  status: CampaignStatus;
  closedOn?: string;
  closedAt?: number;
}

export interface ObservationRecord {
  id: string;
  plotId: string;
  campaignId: string;
  at: number;
  date: string;
  diagnosisClass: DiagnosisClass;
  diagnosisConfidence: number;
  modelVersion: string;
  imageRef?: string;
  thumbnailRef?: string;
  note?: string;
}

export interface SnapshotRecord {
  id: string;
  plotId: string;
  campaignId: string;
  at: number;
  date: string;
  diagnosisClass: DiagnosisClass;
  diagnosisConfidence: number;
  modelVersion: string;
  observationId?: string;
  confidence: number;
  provenance: ProvenanceEntry[];
}

/** The index of what OPFS holds. The bytes themselves are not in here. */
export interface ImageRecord {
  id: string;
  kind: ImageKind;
  contentType: string;
  byteLength: number;
  storedAt: number;
}

// --- Plots ---------------------------------------------------------------

export const toPlotRecord = (plot: Plot): PlotRecord => ({
  id: plot.id,
  name: plot.name,
  createdAt: plot.createdAt,
  ...(plot.area === undefined ? {} : { area: plot.area }),
  ...(plot.location === undefined
    ? {}
    : {
        latitude: plot.location.latitude,
        longitude: plot.location.longitude,
        ...(plot.location.altitude === undefined ? {} : { altitude: plot.location.altitude }),
      }),
});

export const toPlot = (record: PlotRecord): Plot =>
  createPlot({
    id: plotId(record.id),
    name: record.name,
    createdAt: epochMillis(record.createdAt),
    ...(record.area === undefined ? {} : { area: record.area }),
    ...(record.latitude === undefined || record.longitude === undefined
      ? {}
      : {
          location: {
            latitude: record.latitude,
            longitude: record.longitude,
            ...(record.altitude === undefined ? {} : { altitude: record.altitude }),
          },
        }),
  });

// --- Campaigns -----------------------------------------------------------

export const toCampaignRecord = (campaign: Campaign): CampaignRecord => ({
  id: campaign.id,
  plotId: campaign.plotId,
  crop: campaign.crop,
  plantingDate: campaign.plantingDate.toString(),
  startedAt: campaign.startedAt,
  status: campaign.status,
  ...(campaign.closedOn === undefined ? {} : { closedOn: campaign.closedOn.toString() }),
  ...(campaign.closedAt === undefined ? {} : { closedAt: campaign.closedAt }),
});

export const toCampaign = (record: CampaignRecord): Campaign => ({
  id: campaignId(record.id),
  plotId: plotId(record.plotId),
  crop: CROP,
  plantingDate: LocalDate.parse(record.plantingDate),
  startedAt: epochMillis(record.startedAt),
  status: record.status,
  ...(record.closedOn === undefined ? {} : { closedOn: LocalDate.parse(record.closedOn) }),
  ...(record.closedAt === undefined ? {} : { closedAt: epochMillis(record.closedAt) }),
});

// --- Observations --------------------------------------------------------

export const toObservationRecord = (observation: Observation): ObservationRecord => ({
  id: observation.id,
  plotId: observation.plotId,
  campaignId: observation.campaignId,
  at: observation.at,
  date: observation.date.toString(),
  diagnosisClass: observation.diagnosis.class,
  diagnosisConfidence: observation.diagnosis.confidence,
  modelVersion: observation.diagnosis.modelVersion,
  ...(observation.imageRef === undefined ? {} : { imageRef: observation.imageRef }),
  ...(observation.thumbnailRef === undefined ? {} : { thumbnailRef: observation.thumbnailRef }),
  ...(observation.note === undefined ? {} : { note: observation.note }),
});

export const toObservation = (record: ObservationRecord): Observation =>
  createObservation({
    id: observationId(record.id),
    plotId: plotId(record.plotId),
    campaignId: campaignId(record.campaignId),
    at: epochMillis(record.at),
    date: LocalDate.parse(record.date),
    diagnosis: {
      class: record.diagnosisClass,
      confidence: record.diagnosisConfidence,
      modelVersion: record.modelVersion,
    },
    ...(record.imageRef === undefined ? {} : { imageRef: imageRef(record.imageRef) }),
    ...(record.thumbnailRef === undefined ? {} : { thumbnailRef: imageRef(record.thumbnailRef) }),
    ...(record.note === undefined ? {} : { note: record.note }),
  });

// --- Snapshots -----------------------------------------------------------

export const toSnapshotRecord = (snapshot: TwinSnapshot): SnapshotRecord => ({
  id: snapshot.id,
  plotId: snapshot.plotId,
  campaignId: snapshot.campaignId,
  at: snapshot.at,
  date: snapshot.date.toString(),
  diagnosisClass: snapshot.diagnosis.class,
  diagnosisConfidence: snapshot.diagnosis.confidence,
  modelVersion: snapshot.diagnosis.modelVersion,
  ...(snapshot.observationId === undefined ? {} : { observationId: snapshot.observationId }),
  confidence: snapshot.confidence,
  provenance: [...snapshot.provenance],
});

export const toSnapshot = (record: SnapshotRecord): TwinSnapshot => ({
  id: snapshotId(record.id),
  plotId: plotId(record.plotId),
  campaignId: campaignId(record.campaignId),
  at: epochMillis(record.at),
  date: LocalDate.parse(record.date),
  diagnosis: {
    class: record.diagnosisClass,
    confidence: record.diagnosisConfidence,
    modelVersion: record.modelVersion,
  },
  ...(record.observationId === undefined
    ? {}
    : { observationId: observationId(record.observationId) }),
  confidence: record.confidence,
  provenance: record.provenance,
});

// --- Images --------------------------------------------------------------

export const toImageInfo = (record: ImageRecord): StoredImageInfo => ({
  ref: imageRef(record.id),
  kind: record.kind,
  contentType: record.contentType,
  byteLength: record.byteLength,
  storedAt: epochMillis(record.storedAt),
});
