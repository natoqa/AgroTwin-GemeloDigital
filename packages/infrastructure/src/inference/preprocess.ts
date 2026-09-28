import type { ModelInputSpec } from '@agrotwin/domain';

/**
 * Where to read from the original image so that, drawn into the model's
 * input square, it reproduces the pipeline's "shorter side to N, centre crop"
 * (`ml/pipeline/src/agrotwin_ml/transforms.py`).
 *
 * Computed in source coordinates, so the browser scales once, straight from
 * the photograph to 224×224, instead of resizing and then cropping.
 */
export function centreCropSource(
  sourceWidth: number,
  sourceHeight: number,
  input: ModelInputSpec,
): { x: number; y: number; width: number; height: number } {
  const scale = input.resizeShorterSide / Math.min(sourceWidth, sourceHeight);
  const width = input.width / scale;
  const height = input.height / scale;
  return {
    x: (sourceWidth - width) / 2,
    y: (sourceHeight - height) / 2,
    width,
    height,
  };
}

/**
 * RGBA pixels, row-major, to the normalised NCHW float32 tensor the backbone
 * expects: each channel scaled to 0–1, then `(value - mean) / std`.
 */
export function toNormalizedTensor(rgba: Uint8ClampedArray, input: ModelInputSpec): Float32Array {
  const plane = input.width * input.height;
  if (rgba.length !== plane * 4) {
    throw new Error(`expected ${plane * 4} RGBA bytes, got ${rgba.length}`);
  }
  const tensor = new Float32Array(plane * 3);
  const [meanR, meanG, meanB] = input.mean;
  const [stdR, stdG, stdB] = input.std;
  for (let pixel = 0; pixel < plane; pixel += 1) {
    const offset = pixel * 4;
    tensor[pixel] = ((rgba[offset] ?? 0) / 255 - meanR) / stdR;
    tensor[plane + pixel] = ((rgba[offset + 1] ?? 0) / 255 - meanG) / stdG;
    tensor[2 * plane + pixel] = ((rgba[offset + 2] ?? 0) / 255 - meanB) / stdB;
  }
  return tensor;
}
