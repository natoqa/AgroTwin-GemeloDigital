import { describe, expect, it } from 'vitest';
import { InvalidModelContractError } from '@agrotwin/domain';
import type { ModelInputSpec } from '@agrotwin/domain';
import { MODEL_CACHE, ModelAssets } from './ModelAssets.js';
import { centreCropSource, toNormalizedTensor } from './preprocess.js';

const INPUT: ModelInputSpec = {
  name: 'image',
  height: 224,
  width: 224,
  resizeShorterSide: 256,
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225],
};

describe('preprocessing, as the pipeline does it', () => {
  it('reads the centred square of the shorter side, scaled 256 → 224', () => {
    // A 4000×3000 photo: shorter side 3000 maps to 256, so 224 output pixels
    // cover 224 × 3000/256 = 2625 source pixels, centred.
    const source = centreCropSource(4000, 3000, INPUT);

    expect(source.width).toBeCloseTo(2625, 9);
    expect(source.height).toBeCloseTo(2625, 9);
    expect(source.x).toBeCloseTo((4000 - 2625) / 2, 9);
    expect(source.y).toBeCloseTo((3000 - 2625) / 2, 9);
  });

  it('normalises each channel into its own NCHW plane', () => {
    const small: ModelInputSpec = { ...INPUT, width: 2, height: 1 };
    const rgba = Uint8ClampedArray.of(255, 0, 128, 255, 0, 255, 0, 255);

    const tensor = toNormalizedTensor(rgba, small);

    expect(tensor).toHaveLength(6);
    expect(tensor[0]).toBeCloseTo((1 - 0.485) / 0.229, 5); // R of pixel 0
    expect(tensor[1]).toBeCloseTo((0 - 0.485) / 0.229, 5); // R of pixel 1
    expect(tensor[3]).toBeCloseTo((1 - 0.456) / 0.224, 5); // G of pixel 1
    expect(tensor[4]).toBeCloseTo((128 / 255 - 0.406) / 0.225, 5); // B of pixel 0
  });

  it('refuses pixels of the wrong size', () => {
    expect(() => toNormalizedTensor(new Uint8ClampedArray(3), INPUT)).toThrow(/RGBA bytes/u);
  });
});

// --- ModelAssets against an in-memory cache and server ---------------------

class MemoryCache {
  readonly entries = new Map<string, ArrayBuffer>();
  async match(url: string): Promise<Response | undefined> {
    const body = this.entries.get(url);
    return body ? new Response(body.slice(0)) : undefined;
  }
  async put(url: string, response: Response): Promise<void> {
    this.entries.set(url, await response.arrayBuffer());
  }
}

const encode = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function server(options: { tamperBackbone?: boolean } = {}) {
  const backbone = new Uint8Array([1, 2, 3, 4, 5]).buffer;
  const head = encode(
    JSON.stringify({
      format: 'agrotwin-head',
      formatVersion: 1,
      classes: ['healthy', 'early_blight', 'late_blight'],
      embeddingDimension: 2,
      weights: [
        [1, 0],
        [0, 1],
        [1, 1],
      ],
      bias: [0, 0, 0],
    }),
  );
  const wasm = new Uint8Array([0, 97, 115, 109]).buffer;
  const contract = encode(
    JSON.stringify({
      format: 'agrotwin-model-contract',
      formatVersion: 1,
      version: 'test',
      artifacts: {
        backbone: { file: 'backbone.int8.onnx', sha256: await sha256(backbone), bytes: 5 },
        head: { file: 'head.json', sha256: await sha256(head), bytes: head.byteLength },
      },
      input: {
        name: 'image',
        layout: 'NCHW',
        channels: 3,
        height: 224,
        width: 224,
        resizeShorterSide: 256,
        crop: 'center',
        colorSpace: 'RGB',
        scale: '0-1',
        mean: [0.485, 0.456, 0.406],
        std: [0.229, 0.224, 0.225],
      },
      output: { name: 'embedding', embeddingDimension: 2 },
      classes: ['healthy', 'early_blight', 'late_blight'],
      temperature: 1.5,
      rejectionThreshold: 0.6,
    }),
  );
  const files = new Map<string, ArrayBuffer>([
    ['/model/model-contract.json', contract],
    ['/model/backbone.int8.onnx', options.tamperBackbone ? new Uint8Array([9]).buffer : backbone],
    ['/model/head.json', head],
    ['/assets/ort.wasm', wasm],
  ]);
  const requests: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push(`${init?.method ?? 'GET'} ${url}`);
    const body = files.get(url);
    if (!body) return new Response(null, { status: 404 });
    return init?.method === 'HEAD'
      ? new Response(null, { headers: { 'content-length': String(body.byteLength) } })
      : new Response(body.slice(0));
  }) as typeof fetch;
  return { fetcher, requests };
}

function assetsWith(cache: MemoryCache, fetcher: typeof fetch) {
  const opened: string[] = [];
  let exists = false;
  const assets = new ModelAssets(
    { contractUrl: '/model/model-contract.json', wasmUrl: '/assets/ort.wasm' },
    {
      has: async () => exists,
      open: async (name) => {
        opened.push(name);
        exists = true;
        return cache as unknown as Cache;
      },
    },
    fetcher,
  );
  return { assets, opened };
}

describe('ModelAssets', () => {
  it('downloads, verifies and keeps every file, reporting progress to 100%', async () => {
    const cache = new MemoryCache();
    const { fetcher } = await server();
    const { assets, opened } = assetsWith(cache, fetcher);
    const progress: number[] = [];

    expect(await assets.isDownloaded()).toBe(false);
    // Asking must not create the cache.
    expect(opened).toEqual([]);
    await assets.download(({ loadedBytes, totalBytes }) => progress.push(loadedBytes / totalBytes));

    expect(await assets.isDownloaded()).toBe(true);
    expect(opened.every((name) => name === MODEL_CACHE)).toBe(true);
    expect(progress[progress.length - 1]).toBe(1);

    const loaded = await assets.load();
    expect(loaded?.contract.version).toBe('test');
    expect(Array.from(loaded?.head.logits(Float32Array.of(2, 3)) ?? [])).toEqual([2, 3, 5]);
    expect(new Uint8Array(loaded?.wasm ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array([0, 97, 115, 109]),
    );
  });

  it('refuses an artifact whose hash does not match, and keeps nothing', async () => {
    const cache = new MemoryCache();
    const { fetcher } = await server({ tamperBackbone: true });
    const { assets } = assetsWith(cache, fetcher);

    await expect(assets.download()).rejects.toThrow(InvalidModelContractError);
    expect(cache.entries.size).toBe(0);
    expect(await assets.isDownloaded()).toBe(false);
  });

  it('checks the hashes again when loading, in case the cache was altered', async () => {
    const cache = new MemoryCache();
    const { fetcher } = await server();
    const { assets } = assetsWith(cache, fetcher);
    await assets.download();

    cache.entries.set('/model/backbone.int8.onnx', new Uint8Array([7, 7]).buffer);

    await expect(assets.load()).rejects.toThrow(/does not match the hash/u);
  });

  it('has nothing to load before the download, and treats a partial cache as missing', async () => {
    const cache = new MemoryCache();
    const { fetcher } = await server();
    const { assets } = assetsWith(cache, fetcher);

    expect(await assets.load()).toBeUndefined();

    await assets.download();
    cache.entries.delete('/assets/ort.wasm');
    expect(await assets.isDownloaded()).toBe(false);
    await expect(assets.load()).rejects.toThrow(/missing/u);
  });

  it('reports a server error instead of storing a partial model', async () => {
    const cache = new MemoryCache();
    const fetcher = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch;
    const { assets } = assetsWith(cache, fetcher);

    await expect(assets.download()).rejects.toThrow(/503/u);
    expect(cache.entries.size).toBe(0);
  });
});
