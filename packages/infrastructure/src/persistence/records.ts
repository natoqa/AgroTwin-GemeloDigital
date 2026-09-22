import { LocalDate, imageRef, plotId, snapshotId } from '@agrotwin/domain';
import type { DiagnosisClass, Plot, ProvenanceEntry, TwinSnapshot } from '@agrotwin/domain';
import { epochMillis } from '@agrotwin/domain';

/**
 * The stored shapes, and the mapping to and from the domain.
 *
 * IndexedDB stores structured-clonable data, so the domain's value objects do
 * not go in as they are: `LocalDate` is persisted as `YYYY-MM-DD` and rebuilt
 * on the way out. Keeping the mapping in one file means the domain never has
 * to know a database exists.
 */

export interface PlotRecord {
  id: string;
  name: string;
  createdAt: number;
}

export interface SnapshotRecord {
  id: string;
  plotId: string;
  at: number;
  date: string;
  diagnosisClass: DiagnosisClass;
  diagnosisConfidence: number;
  modelVersion: string;
  imageRef?: string;
  confidence: number;
  provenance: ProvenanceEntry[];
}

export interface ImageRecord {
  id: string;
  data: ArrayBuffer;
  contentType: string;
  storedAt: number;
}

export const toPlotRecord = (plot: Plot): PlotRecord => ({
  id: plot.id,
  name: plot.name,
  createdAt: plot.createdAt,
});

export const toPlot = (record: PlotRecord): Plot => ({
  id: plotId(record.id),
  name: record.name,
  createdAt: epochMillis(record.createdAt),
});

export const toSnapshotRecord = (snapshot: TwinSnapshot): SnapshotRecord => ({
  id: snapshot.id,
  plotId: snapshot.plotId,
  at: snapshot.at,
  date: snapshot.date.toString(),
  diagnosisClass: snapshot.diagnosis.class,
  diagnosisConfidence: snapshot.diagnosis.confidence,
  modelVersion: snapshot.diagnosis.modelVersion,
  ...(snapshot.imageRef === undefined ? {} : { imageRef: snapshot.imageRef }),
  confidence: snapshot.confidence,
  provenance: [...snapshot.provenance],
});

export const toSnapshot = (record: SnapshotRecord): TwinSnapshot => ({
  id: snapshotId(record.id),
  plotId: plotId(record.plotId),
  at: epochMillis(record.at),
  date: LocalDate.parse(record.date),
  diagnosis: {
    class: record.diagnosisClass,
    confidence: record.diagnosisConfidence,
    modelVersion: record.modelVersion,
  },
  ...(record.imageRef === undefined ? {} : { imageRef: imageRef(record.imageRef) }),
  confidence: record.confidence,
  provenance: record.provenance,
});
