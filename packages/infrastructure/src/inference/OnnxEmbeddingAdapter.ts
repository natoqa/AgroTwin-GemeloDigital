import type { EmbeddingPort, ModelContract } from '@agrotwin/domain';
import type { WorkerRequest, WorkerResponse } from './embeddingWorker.js';

/**
 * The main-thread side of the inference worker.
 *
 * `start` hands the worker the backbone and the WASM runtime and waits until
 * the ONNX session exists, so a failure to load the model surfaces once, at
 * start, rather than on the farmer's first photograph.
 */
export class OnnxEmbeddingAdapter implements EmbeddingPort {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (embedding: Float32Array) => void; reject: (error: Error) => void }
  >();

  private constructor(private readonly worker: Worker) {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === 'embedding') {
        this.pending.get(message.id)?.resolve(message.embedding);
        this.pending.delete(message.id);
      } else if (message.type === 'error' && message.id !== undefined) {
        this.pending.get(message.id)?.reject(new Error(message.message));
        this.pending.delete(message.id);
      }
    };
  }

  static start(
    worker: Worker,
    contract: ModelContract,
    backbone: ArrayBuffer,
    wasm: ArrayBuffer,
  ): Promise<OnnxEmbeddingAdapter> {
    return new Promise((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === 'ready') resolve(new OnnxEmbeddingAdapter(worker));
        else if (event.data.type === 'error') reject(new Error(event.data.message));
      };
      worker.onerror = (event) => reject(new Error(event.message || 'the inference worker failed'));
      const init: WorkerRequest = {
        type: 'init',
        backbone,
        wasm,
        input: contract.input,
        outputName: contract.outputName,
      };
      worker.postMessage(init, [backbone, wasm]);
    });
  }

  embed(image: ArrayBuffer): Promise<Float32Array> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      // A copy: the caller still needs its bytes, to store the photograph.
      const copy = image.slice(0);
      const request: WorkerRequest = { type: 'embed', id, image: copy };
      this.worker.postMessage(request, [copy]);
    });
  }

  terminate(): void {
    this.worker.terminate();
  }
}
