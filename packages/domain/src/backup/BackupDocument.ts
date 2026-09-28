import { BackupFormatError } from '../errors/BackupFormatError.js';
import { epochMillis } from '../model/EpochMillis.js';
import { isDiagnosisClass } from '../model/Diagnosis.js';
import type { Diagnosis } from '../model/Diagnosis.js';
import { campaignId, imageRef, observationId, plotId, snapshotId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import { createObservation } from '../model/Observation.js';
import type { Observation } from '../model/Observation.js';
import { createPlot } from '../model/Plot.js';
import type { Plot } from '../model/Plot.js';
import { CROP } from '../model/Campaign.js';
import type { Campaign } from '../model/Campaign.js';
import { isProvenanceSource } from '../model/Provenance.js';
import type { ProvenanceEntry } from '../model/Provenance.js';
import type { TwinSnapshot } from '../model/TwinSnapshot.js';
import { isRainfallAnswer } from '../model/WeatherObservation.js';
import type { RainfallAnswer, WeatherObservation } from '../model/WeatherObservation.js';
import type { EncodedImage } from '../ports/ImageStorePort.js';

/**
 * The on-disk shape of a backup (ADR-0008).
 *
 * This is deliberately *not* the database schema. The database is free to
 * change indexes, split tables or move bytes to OPFS; a backup file written
 * last season must still restore. The two mappings are therefore separate, and
 * the duplication between them is the price of that independence.
 *
 * Thumbnails travel inside the file as base64; full photographs do not. A
 * farmer's backup has to fit on the phone that wrote it and be copyable over a
 * cable, and the originals are the one part the twin can reason without.
 */
export const BACKUP_FORMAT = 'agrotwin-backup';
export const BACKUP_FORMAT_VERSION = 2;

/**
 * Every version this app can still restore.
 *
 * Version 1 (Phase 2) predates the farmer's weather answers. A version 1 file
 * is still a complete record of what that app knew, so it restores as-is, with
 * no weather answers — which is exactly what it held.
 */
export const READABLE_BACKUP_FORMAT_VERSIONS: readonly number[] = [1, 2];

export interface BackupDocument {
  readonly format: typeof BACKUP_FORMAT;
  readonly formatVersion: number;
  readonly createdAt: number;
  readonly plots: readonly PlotDto[];
  readonly campaigns: readonly CampaignDto[];
  readonly observations: readonly ObservationDto[];
  readonly snapshots: readonly SnapshotDto[];
  readonly images: readonly EncodedImageDto[];
  /** Since version 2. What the farmer said the weather did, per plot and day. */
  readonly weatherObservations: readonly WeatherObservationDto[];
}

export interface PlotLocationDto {
  readonly latitude: number;
  readonly longitude: number;
  readonly altitude?: number;
}

export interface PlotDto {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly area?: number;
  readonly location?: PlotLocationDto;
}

export interface CampaignDto {
  readonly id: string;
  readonly plotId: string;
  readonly crop: string;
  readonly plantingDate: string;
  readonly startedAt: number;
  readonly status: string;
  readonly closedOn?: string;
  readonly closedAt?: number;
}

export interface DiagnosisDto {
  readonly class: string;
  readonly confidence: number;
  readonly modelVersion: string;
}

export interface ObservationDto {
  readonly id: string;
  readonly plotId: string;
  readonly campaignId: string;
  readonly at: number;
  readonly date: string;
  readonly diagnosis: DiagnosisDto;
  readonly imageRef?: string;
  readonly thumbnailRef?: string;
  readonly note?: string;
}

export interface SnapshotDto {
  readonly id: string;
  readonly plotId: string;
  readonly campaignId: string;
  readonly at: number;
  readonly date: string;
  readonly diagnosis: DiagnosisDto;
  readonly observationId?: string;
  readonly confidence: number;
  readonly provenance: readonly ProvenanceEntry[];
}

export interface WeatherObservationDto {
  readonly plotId: string;
  readonly date: string;
  /** Checked while parsing, so a mapped DTO never needs checking again. */
  readonly rainfall: RainfallAnswer;
  readonly coldNight: boolean;
  readonly recordedAt: number;
}

export interface EncodedImageDto {
  readonly ref: string;
  readonly kind: string;
  readonly contentType: string;
  readonly base64: string;
  readonly storedAt: number;
}

// --- Domain to document -------------------------------------------------

export const toPlotDto = (plot: Plot): PlotDto => ({
  id: plot.id,
  name: plot.name,
  createdAt: plot.createdAt,
  ...(plot.area === undefined ? {} : { area: plot.area }),
  ...(plot.location === undefined
    ? {}
    : {
        location: {
          latitude: plot.location.latitude,
          longitude: plot.location.longitude,
          ...(plot.location.altitude === undefined ? {} : { altitude: plot.location.altitude }),
        },
      }),
});

export const toCampaignDto = (campaign: Campaign): CampaignDto => ({
  id: campaign.id,
  plotId: campaign.plotId,
  crop: campaign.crop,
  plantingDate: campaign.plantingDate.toString(),
  startedAt: campaign.startedAt,
  status: campaign.status,
  ...(campaign.closedOn === undefined ? {} : { closedOn: campaign.closedOn.toString() }),
  ...(campaign.closedAt === undefined ? {} : { closedAt: campaign.closedAt }),
});

const toDiagnosisDto = (diagnosis: Diagnosis): DiagnosisDto => ({
  class: diagnosis.class,
  confidence: diagnosis.confidence,
  modelVersion: diagnosis.modelVersion,
});

export const toObservationDto = (observation: Observation): ObservationDto => ({
  id: observation.id,
  plotId: observation.plotId,
  campaignId: observation.campaignId,
  at: observation.at,
  date: observation.date.toString(),
  diagnosis: toDiagnosisDto(observation.diagnosis),
  ...(observation.imageRef === undefined ? {} : { imageRef: observation.imageRef }),
  ...(observation.thumbnailRef === undefined ? {} : { thumbnailRef: observation.thumbnailRef }),
  ...(observation.note === undefined ? {} : { note: observation.note }),
});

export const toSnapshotDto = (snapshot: TwinSnapshot): SnapshotDto => ({
  id: snapshot.id,
  plotId: snapshot.plotId,
  campaignId: snapshot.campaignId,
  at: snapshot.at,
  date: snapshot.date.toString(),
  diagnosis: toDiagnosisDto(snapshot.diagnosis),
  ...(snapshot.observationId === undefined ? {} : { observationId: snapshot.observationId }),
  confidence: snapshot.confidence,
  provenance: [...snapshot.provenance],
});

export const toEncodedImageDto = (image: EncodedImage): EncodedImageDto => ({
  ref: image.ref,
  kind: image.kind,
  contentType: image.contentType,
  base64: image.base64,
  storedAt: image.storedAt,
});

export const toWeatherObservationDto = (
  observation: WeatherObservation,
): WeatherObservationDto => ({
  plotId: observation.plotId,
  date: observation.date.toString(),
  rainfall: observation.rainfall,
  coldNight: observation.coldNight,
  recordedAt: observation.recordedAt,
});

/** The file as text. Pretty-printed so a human can inspect what they hold. */
export const serializeBackup = (backup: BackupDocument): string =>
  JSON.stringify(backup, undefined, 2);

// --- Document to domain -------------------------------------------------

export const toPlot = (dto: PlotDto): Plot =>
  createPlot({
    id: plotId(dto.id),
    name: dto.name,
    createdAt: epochMillis(dto.createdAt),
    ...(dto.area === undefined ? {} : { area: dto.area }),
    ...(dto.location === undefined ? {} : { location: dto.location }),
  });

export const toCampaign = (dto: CampaignDto): Campaign => ({
  id: campaignId(dto.id),
  plotId: plotId(dto.plotId),
  crop: CROP,
  plantingDate: LocalDate.parse(dto.plantingDate),
  startedAt: epochMillis(dto.startedAt),
  status: dto.status === 'closed' ? 'closed' : 'active',
  ...(dto.closedOn === undefined ? {} : { closedOn: LocalDate.parse(dto.closedOn) }),
  ...(dto.closedAt === undefined ? {} : { closedAt: epochMillis(dto.closedAt) }),
});

const toDiagnosis = (dto: DiagnosisDto, path: string): Diagnosis => {
  if (!isDiagnosisClass(dto.class)) {
    throw new BackupFormatError(`${path} names a diagnosis this version does not know`);
  }
  return { class: dto.class, confidence: dto.confidence, modelVersion: dto.modelVersion };
};

export const toObservation = (dto: ObservationDto): Observation =>
  createObservation({
    id: observationId(dto.id),
    plotId: plotId(dto.plotId),
    campaignId: campaignId(dto.campaignId),
    at: epochMillis(dto.at),
    date: LocalDate.parse(dto.date),
    diagnosis: toDiagnosis(dto.diagnosis, `observation ${dto.id}`),
    ...(dto.imageRef === undefined ? {} : { imageRef: imageRef(dto.imageRef) }),
    ...(dto.thumbnailRef === undefined ? {} : { thumbnailRef: imageRef(dto.thumbnailRef) }),
    ...(dto.note === undefined ? {} : { note: dto.note }),
  });

export const toSnapshot = (dto: SnapshotDto): TwinSnapshot => ({
  id: snapshotId(dto.id),
  plotId: plotId(dto.plotId),
  campaignId: campaignId(dto.campaignId),
  at: epochMillis(dto.at),
  date: LocalDate.parse(dto.date),
  diagnosis: toDiagnosis(dto.diagnosis, `snapshot ${dto.id}`),
  ...(dto.observationId === undefined ? {} : { observationId: observationId(dto.observationId) }),
  confidence: dto.confidence,
  provenance: dto.provenance,
});

export const toEncodedImage = (dto: EncodedImageDto): EncodedImage => ({
  ref: imageRef(dto.ref),
  kind: dto.kind === 'thumbnail' ? 'thumbnail' : 'original',
  contentType: dto.contentType,
  base64: dto.base64,
  storedAt: epochMillis(dto.storedAt),
});

export const toWeatherObservation = (dto: WeatherObservationDto): WeatherObservation => ({
  plotId: plotId(dto.plotId),
  date: LocalDate.parse(dto.date),
  rainfall: dto.rainfall,
  coldNight: dto.coldNight,
  recordedAt: epochMillis(dto.recordedAt),
});

// --- Parsing ------------------------------------------------------------

/**
 * Reads a backup file, refusing anything it cannot restore whole.
 *
 * Validation is explicit rather than schema-driven: the domain carries no
 * validation library, and a backup that half-parses is worse than one that is
 * rejected, because the farmer would keep the broken copy believing it works.
 */
export function parseBackup(text: string): BackupDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupFormatError('it is not valid JSON');
  }

  const root = asRecord(parsed, 'the file');
  if (root['format'] !== BACKUP_FORMAT) {
    throw new BackupFormatError(`it is not an ${BACKUP_FORMAT} file`);
  }
  const formatVersion = asNumber(root['formatVersion'], 'formatVersion');
  if (!READABLE_BACKUP_FORMAT_VERSIONS.includes(formatVersion)) {
    throw new BackupFormatError(
      `it uses format version ${formatVersion}, and this app reads versions ${READABLE_BACKUP_FORMAT_VERSIONS.join(', ')}`,
    );
  }

  return {
    format: BACKUP_FORMAT,
    formatVersion,
    createdAt: asNumber(root['createdAt'], 'createdAt'),
    plots: asArray(root['plots'], 'plots').map(parsePlot),
    campaigns: asArray(root['campaigns'], 'campaigns').map(parseCampaign),
    observations: asArray(root['observations'], 'observations').map(parseObservation),
    snapshots: asArray(root['snapshots'], 'snapshots').map(parseSnapshot),
    images: asArray(root['images'], 'images').map(parseEncodedImage),
    // Absent from version 1 files, which is not the same as a malformed list.
    weatherObservations:
      formatVersion === 1
        ? []
        : asArray(root['weatherObservations'], 'weatherObservations').map(
            parseWeatherObservation,
          ),
  };
}

function parsePlot(value: unknown, index: number): PlotDto {
  const path = `plots[${index}]`;
  const record = asRecord(value, path);
  const location = record['location'];

  return {
    id: asString(record['id'], `${path}.id`),
    name: asString(record['name'], `${path}.name`),
    createdAt: asNumber(record['createdAt'], `${path}.createdAt`),
    ...(record['area'] === undefined ? {} : { area: asNumber(record['area'], `${path}.area`) }),
    ...(location === undefined ? {} : { location: parseLocation(location, `${path}.location`) }),
  };
}

function parseLocation(value: unknown, path: string): PlotLocationDto {
  const record = asRecord(value, path);
  return {
    latitude: asNumber(record['latitude'], `${path}.latitude`),
    longitude: asNumber(record['longitude'], `${path}.longitude`),
    ...(record['altitude'] === undefined
      ? {}
      : { altitude: asNumber(record['altitude'], `${path}.altitude`) }),
  };
}

function parseCampaign(value: unknown, index: number): CampaignDto {
  const path = `campaigns[${index}]`;
  const record = asRecord(value, path);
  return {
    id: asString(record['id'], `${path}.id`),
    plotId: asString(record['plotId'], `${path}.plotId`),
    crop: asString(record['crop'], `${path}.crop`),
    plantingDate: asString(record['plantingDate'], `${path}.plantingDate`),
    startedAt: asNumber(record['startedAt'], `${path}.startedAt`),
    status: asString(record['status'], `${path}.status`),
    ...(record['closedOn'] === undefined
      ? {}
      : { closedOn: asString(record['closedOn'], `${path}.closedOn`) }),
    ...(record['closedAt'] === undefined
      ? {}
      : { closedAt: asNumber(record['closedAt'], `${path}.closedAt`) }),
  };
}

function parseDiagnosis(value: unknown, path: string): DiagnosisDto {
  const record = asRecord(value, path);
  const diagnosisClass = asString(record['class'], `${path}.class`);
  // Checked here rather than during mapping, so a file naming a diagnosis this
  // version cannot represent is refused before a single row is written.
  if (!isDiagnosisClass(diagnosisClass)) {
    throw new BackupFormatError(`${path}.class names a diagnosis this version does not know`);
  }
  return {
    class: diagnosisClass,
    confidence: asNumber(record['confidence'], `${path}.confidence`),
    modelVersion: asString(record['modelVersion'], `${path}.modelVersion`),
  };
}

function parseObservation(value: unknown, index: number): ObservationDto {
  const path = `observations[${index}]`;
  const record = asRecord(value, path);
  return {
    id: asString(record['id'], `${path}.id`),
    plotId: asString(record['plotId'], `${path}.plotId`),
    campaignId: asString(record['campaignId'], `${path}.campaignId`),
    at: asNumber(record['at'], `${path}.at`),
    date: asString(record['date'], `${path}.date`),
    diagnosis: parseDiagnosis(record['diagnosis'], `${path}.diagnosis`),
    ...(record['imageRef'] === undefined
      ? {}
      : { imageRef: asString(record['imageRef'], `${path}.imageRef`) }),
    ...(record['thumbnailRef'] === undefined
      ? {}
      : { thumbnailRef: asString(record['thumbnailRef'], `${path}.thumbnailRef`) }),
    ...(record['note'] === undefined ? {} : { note: asString(record['note'], `${path}.note`) }),
  };
}

function parseSnapshot(value: unknown, index: number): SnapshotDto {
  const path = `snapshots[${index}]`;
  const record = asRecord(value, path);
  return {
    id: asString(record['id'], `${path}.id`),
    plotId: asString(record['plotId'], `${path}.plotId`),
    campaignId: asString(record['campaignId'], `${path}.campaignId`),
    at: asNumber(record['at'], `${path}.at`),
    date: asString(record['date'], `${path}.date`),
    diagnosis: parseDiagnosis(record['diagnosis'], `${path}.diagnosis`),
    ...(record['observationId'] === undefined
      ? {}
      : { observationId: asString(record['observationId'], `${path}.observationId`) }),
    confidence: asNumber(record['confidence'], `${path}.confidence`),
    provenance: asArray(record['provenance'], `${path}.provenance`).map((entry, position) =>
      parseProvenance(entry, `${path}.provenance[${position}]`),
    ),
  };
}

function parseProvenance(value: unknown, path: string): ProvenanceEntry {
  const record = asRecord(value, path);
  const source = asString(record['source'], `${path}.source`);
  if (!isProvenanceSource(source)) {
    throw new BackupFormatError(`${path}.source names a source this version does not know`);
  }
  return {
    field: asString(record['field'], `${path}.field`),
    source,
    confidence: asNumber(record['confidence'], `${path}.confidence`),
  };
}

function parseEncodedImage(value: unknown, index: number): EncodedImageDto {
  const path = `images[${index}]`;
  const record = asRecord(value, path);
  return {
    ref: asString(record['ref'], `${path}.ref`),
    kind: asString(record['kind'], `${path}.kind`),
    contentType: asString(record['contentType'], `${path}.contentType`),
    base64: asString(record['base64'], `${path}.base64`),
    storedAt: asNumber(record['storedAt'], `${path}.storedAt`),
  };
}

function parseWeatherObservation(value: unknown, index: number): WeatherObservationDto {
  const path = `weatherObservations[${index}]`;
  const record = asRecord(value, path);
  const rainfall = asString(record['rainfall'], `${path}.rainfall`);
  if (!isRainfallAnswer(rainfall)) {
    throw new BackupFormatError(`${path}.rainfall names an answer this version does not know`);
  }
  return {
    plotId: asString(record['plotId'], `${path}.plotId`),
    date: asString(record['date'], `${path}.date`),
    rainfall,
    coldNight: asBoolean(record['coldNight'], `${path}.coldNight`),
    recordedAt: asNumber(record['recordedAt'], `${path}.recordedAt`),
  };
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BackupFormatError(`${path} is not an object`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new BackupFormatError(`${path} is not a list`);
  }
  return value as readonly unknown[];
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new BackupFormatError(`${path} is not text`);
  }
  return value;
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BackupFormatError(`${path} is not a number`);
  }
  return value;
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new BackupFormatError(`${path} is not true or false`);
  }
  return value;
}
