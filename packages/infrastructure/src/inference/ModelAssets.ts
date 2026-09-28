import { InvalidModelContractError, LinearHead, parseModelContract } from '@agrotwin/domain';
import type { ModelContract } from '@agrotwin/domain';

/**
 * The leaf-recognition model on this device: downloading it once, keeping it,
 * and refusing it if it is not what its contract says (CLAUDE.md §10).
 *
 * Phase 5, D1: the model and the ONNX Runtime WASM (tens of MB together) are
 * **not** precached with the app shell. The farmer downloads them in an
 * explicit step, with progress, and they live in their own Cache Storage
 * bucket. From then on nothing here needs the network.
 *
 * Every artifact is hashed with SHA-256 on the way in *and* on the way out:
 * a cache can be corrupted or tampered with between the two.
 */
export const MODEL_CACHE = 'agrotwin-model-v1';

export interface ModelFiles {
  /** Where the contract lives; the artifacts are its siblings. */
  readonly contractUrl: string;
  /** The ONNX Runtime WASM binary. It has no contract entry: it is code. */
  readonly wasmUrl: string;
}

export interface LoadedModel {
  readonly contract: ModelContract;
  readonly head: LinearHead;
  readonly backbone: ArrayBuffer;
  readonly wasm: ArrayBuffer;
}

export interface DownloadProgress {
  readonly loadedBytes: number;
  readonly totalBytes: number;
}

/** The part of `CacheStorage` this needs; injected so it is testable in Node. */
export type ModelCacheStorage = Pick<CacheStorage, 'open' | 'has'>;

export class ModelAssets {
  constructor(
    private readonly files: ModelFiles,
    private readonly storage: ModelCacheStorage = caches,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  /** True when every file is on the device. Does not verify hashes. */
  async isDownloaded(): Promise<boolean> {
    // `open` would create an empty cache just by asking; `has` does not.
    if (!(await this.storage.has(MODEL_CACHE))) return false;
    const cache = await this.storage.open(MODEL_CACHE);
    const contract = await cache.match(this.files.contractUrl);
    if (!contract) return false;
    try {
      const parsed = parseModelContract(await contract.json());
      const urls = [
        this.sibling(parsed.backbone.file),
        this.sibling(parsed.head.file),
        this.files.wasmUrl,
      ];
      const present = await Promise.all(urls.map((url) => cache.match(url)));
      return present.every((response) => response !== undefined);
    } catch {
      return false;
    }
  }

  /** Fetches, verifies and stores every file. Nothing is stored unless all verify. */
  async download(onProgress: (progress: DownloadProgress) => void = () => undefined): Promise<void> {
    const contractResponse = await this.fetcher(this.files.contractUrl, { cache: 'no-store' });
    if (!contractResponse.ok) throw new Error(`contract: HTTP ${contractResponse.status}`);
    const contractBytes = await contractResponse.arrayBuffer();
    const contract = parseModelContract(JSON.parse(new TextDecoder().decode(contractBytes)));

    const wasmHead = await this.fetcher(this.files.wasmUrl, { method: 'HEAD', cache: 'no-store' });
    const wasmBytes = Number(wasmHead.headers.get('content-length') ?? 0);
    const totalBytes = contract.backbone.bytes + contract.head.bytes + wasmBytes;
    let loadedBytes = 0;
    const report = (bytes: number) => {
      loadedBytes += bytes;
      onProgress({ loadedBytes, totalBytes });
    };

    const backbone = await this.fetchBytes(this.sibling(contract.backbone.file), report);
    await verify(backbone, contract.backbone.sha256, 'the backbone');
    const head = await this.fetchBytes(this.sibling(contract.head.file), report);
    await verify(head, contract.head.sha256, 'the head');
    // Refuse a head that does not fit its contract before anything is kept.
    LinearHead.fromDocument(JSON.parse(new TextDecoder().decode(head)), contract);
    const wasm = await this.fetchBytes(this.files.wasmUrl, report);

    const cache = await this.storage.open(MODEL_CACHE);
    await cache.put(this.sibling(contract.backbone.file), binary(backbone));
    await cache.put(this.sibling(contract.head.file), binary(head));
    await cache.put(this.files.wasmUrl, binary(wasm));
    // The contract goes last: its presence is what `isDownloaded` checks first.
    await cache.put(this.files.contractUrl, binary(contractBytes));
  }

  /** Reads everything back from the device and verifies it again. */
  async load(): Promise<LoadedModel | undefined> {
    if (!(await this.storage.has(MODEL_CACHE))) return undefined;
    const cache = await this.storage.open(MODEL_CACHE);
    const contractResponse = await cache.match(this.files.contractUrl);
    if (!contractResponse) return undefined;
    const contract = parseModelContract(await contractResponse.json());

    const read = async (url: string) => {
      const response = await cache.match(url);
      if (!response) throw new InvalidModelContractError(`${url} is missing from the device`);
      return response.arrayBuffer();
    };
    const backbone = await read(this.sibling(contract.backbone.file));
    await verify(backbone, contract.backbone.sha256, 'the backbone');
    const headBytes = await read(this.sibling(contract.head.file));
    await verify(headBytes, contract.head.sha256, 'the head');
    const head = LinearHead.fromDocument(
      JSON.parse(new TextDecoder().decode(headBytes)),
      contract,
    );
    const wasm = await read(this.files.wasmUrl);

    return { contract, head, backbone, wasm };
  }

  private sibling(file: string): string {
    return new URL(file, new URL(this.files.contractUrl, 'http://model.invalid/')).pathname;
  }

  private async fetchBytes(url: string, report: (bytes: number) => void): Promise<ArrayBuffer> {
    const response = await this.fetcher(url, { cache: 'no-store' });
    if (!response.ok || !response.body) throw new Error(`${url}: HTTP ${response.status}`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
      report(value.byteLength);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes.buffer;
  }
}

async function verify(bytes: ArrayBuffer, expected: string, what: string): Promise<void> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const actual = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== expected) {
    throw new InvalidModelContractError(`${what} does not match the hash in its contract`);
  }
}

const binary = (bytes: ArrayBuffer) =>
  new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } });
