import * as ort from 'onnxruntime-web/wasm';
import type { ModelInputSpec } from '@agrotwin/domain';
import { centreCropSource, toNormalizedTensor } from './preprocess.js';

/**
 * The inside of the inference Web Worker (CLAUDE.md §10: never on the main
 * thread).
 *
 * It receives the backbone and the ONNX Runtime WASM binary as bytes, already
 * read from the device's cache and checked against the contract by the main
 * thread, so nothing here touches the network: the worker works identically
 * with or without it.
 *
 * Single thread + SIMD is the baseline. Multithreaded WASM needs
 * cross-origin isolation (COOP/COEP, risk R-04), which only the LAN hub
 * provides; it is a later, detected improvement, not a dependency.
 */

export interface InitMessage {
  readonly type: 'init';
  readonly backbone: ArrayBuffer;
  readonly wasm: ArrayBuffer;
  readonly input: ModelInputSpec;
  readonly outputName: string;
}

export interface EmbedMessage {
  readonly type: 'embed';
  readonly id: number;
  readonly image: ArrayBuffer;
}

export type WorkerRequest = InitMessage | EmbedMessage;

export type WorkerResponse =
  | { readonly type: 'ready' }
  | { readonly type: 'embedding'; readonly id: number; readonly embedding: Float32Array }
  | { readonly type: 'error'; readonly id?: number; readonly message: string };

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}

export function runEmbeddingWorker(scope: WorkerScope): void {
  let session: ort.InferenceSession | undefined;
  let spec: InitMessage | undefined;

  scope.onmessage = (event) => {
    const message = event.data;
    if (message.type === 'init') {
      void initialise(message).then(
        () => scope.postMessage({ type: 'ready' }),
        (cause: unknown) => scope.postMessage({ type: 'error', message: describe(cause) }),
      );
      return;
    }
    void embed(message).then(
      (embedding) =>
        scope.postMessage({ type: 'embedding', id: message.id, embedding }, [embedding.buffer]),
      (cause: unknown) =>
        scope.postMessage({ type: 'error', id: message.id, message: describe(cause) }),
    );
  };

  async function initialise(message: InitMessage): Promise<void> {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmBinary = message.wasm;
    session = await ort.InferenceSession.create(new Uint8Array(message.backbone), {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    spec = message;
  }

  async function embed(message: EmbedMessage): Promise<Float32Array> {
    if (!session || !spec) throw new Error('the worker was not initialised');
    const { input } = spec;

    const bitmap = await createImageBitmap(new Blob([message.image]));
    const source = centreCropSource(bitmap.width, bitmap.height, input);
    const canvas = new OffscreenCanvas(input.width, input.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2D context in the worker');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      bitmap,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      input.width,
      input.height,
    );
    bitmap.close();

    const pixels = context.getImageData(0, 0, input.width, input.height).data;
    const tensor = new ort.Tensor('float32', toNormalizedTensor(pixels, input), [
      1,
      3,
      input.height,
      input.width,
    ]);
    const output = await session.run({ [input.name]: tensor });
    const embedding = output[spec.outputName];
    if (!embedding) throw new Error(`the model has no output named ${spec.outputName}`);
    // A copy the worker can hand over without keeping ORT's buffer alive.
    return Float32Array.from(embedding.data as Float32Array);
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
