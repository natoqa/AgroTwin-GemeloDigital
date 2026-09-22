declare const plotIdBrand: unique symbol;
declare const campaignIdBrand: unique symbol;
declare const observationIdBrand: unique symbol;
declare const snapshotIdBrand: unique symbol;
declare const imageRefBrand: unique symbol;

/** Identity of a plot. Opaque: the domain never parses it. */
export type PlotId = string & { readonly [plotIdBrand]: 'PlotId' };

/** Identity of a crop cycle on one plot. */
export type CampaignId = string & { readonly [campaignIdBrand]: 'CampaignId' };

/** Identity of one thing the farmer recorded in the field. */
export type ObservationId = string & { readonly [observationIdBrand]: 'ObservationId' };

/** Identity of a twin snapshot. */
export type SnapshotId = string & { readonly [snapshotIdBrand]: 'SnapshotId' };

/**
 * Handle to a stored image. The domain moves it around and never reads the
 * bytes: that is `ImageStorePort`'s business.
 */
export type ImageRef = string & { readonly [imageRefBrand]: 'ImageRef' };

export const plotId = (value: string): PlotId => value as PlotId;
export const campaignId = (value: string): CampaignId => value as CampaignId;
export const observationId = (value: string): ObservationId => value as ObservationId;
export const snapshotId = (value: string): SnapshotId => value as SnapshotId;
export const imageRef = (value: string): ImageRef => value as ImageRef;
