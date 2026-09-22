declare const plotIdBrand: unique symbol;
declare const snapshotIdBrand: unique symbol;
declare const imageRefBrand: unique symbol;

/** Identity of a plot. Opaque: the domain never parses it. */
export type PlotId = string & { readonly [plotIdBrand]: 'PlotId' };

/** Identity of a twin snapshot. */
export type SnapshotId = string & { readonly [snapshotIdBrand]: 'SnapshotId' };

/**
 * Handle to a stored image. The domain moves it around and never reads the
 * bytes: that is `ImageStorePort`'s business.
 */
export type ImageRef = string & { readonly [imageRefBrand]: 'ImageRef' };

export const plotId = (value: string): PlotId => value as PlotId;
export const snapshotId = (value: string): SnapshotId => value as SnapshotId;
export const imageRef = (value: string): ImageRef => value as ImageRef;
