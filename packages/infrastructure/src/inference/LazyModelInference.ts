import { HeadClassifier, ModelUnavailableError } from '@agrotwin/domain';
import type { Diagnosis, EmbeddingPort, InferencePort, LinearHead, ModelContract } from '@agrotwin/domain';
import type { ModelAssets } from './ModelAssets.js';
import { OnnxEmbeddingAdapter } from './OnnxEmbeddingAdapter.js';

/** Replaces the shipped head when the phone has accepted a federated one. */
export type ActiveHeadLookup = (
  contract: ModelContract,
) => Promise<{ head: LinearHead; version: string } | undefined>;

interface Running {
  readonly classifier: HeadClassifier;
  readonly embedder: OnnxEmbeddingAdapter;
}

/**
 * The `InferencePort` the app wires in: the real classifier, started on first
 * use.
 *
 * Starting ONNX Runtime costs a WASM compile and a session; doing it at app
 * start would slow every cold start (RNF-05) for farmers who are not taking a
 * photograph. It happens on the first diagnosis instead, and is reused until
 * `reset` — which federated learning calls after adopting a new head.
 *
 * It is also the `EmbeddingPort` the labelling use case needs: the embedding
 * of a confirmed photograph comes from the same backbone that diagnosed it.
 *
 * When the model has not been downloaded, it says so with a domain error
 * rather than falling back to anything: there is no mock in production.
 */
export class LazyModelInference implements InferencePort, EmbeddingPort {
  private running: Promise<Running> | undefined;

  constructor(
    private readonly assets: ModelAssets,
    private readonly createWorker: () => Worker,
    private readonly activeHead: ActiveHeadLookup = async () => undefined,
  ) {}

  async diagnose(image: ArrayBuffer): Promise<Diagnosis> {
    return (await this.start()).classifier.diagnose(image);
  }

  async embed(image: ArrayBuffer): Promise<Float32Array> {
    return (await this.start()).embedder.embed(image);
  }

  /** Starts the model now, for a screen that wants to warm it up. */
  async ready(): Promise<HeadClassifier> {
    return (await this.start()).classifier;
  }

  /** Drops the running classifier; the next call starts it with the current head. */
  reset(): void {
    const previous = this.running;
    this.running = undefined;
    void previous?.then((running) => running.embedder.terminate()).catch(() => undefined);
  }

  private start(): Promise<Running> {
    this.running ??= this.boot().catch((cause: unknown) => {
      // A failed start must not stick: the farmer may download and retry.
      this.running = undefined;
      throw cause;
    });
    return this.running;
  }

  private async boot(): Promise<Running> {
    const model = await this.assets.load();
    if (!model) throw new ModelUnavailableError('it has not been downloaded to this device');
    const embedder = await OnnxEmbeddingAdapter.start(
      this.createWorker(),
      model.contract,
      model.backbone,
      model.wasm,
    );
    const active = await this.activeHead(model.contract);
    const classifier = new HeadClassifier(
      embedder,
      active?.head ?? model.head,
      model.contract,
      active?.version ?? model.contract.version,
    );
    return { classifier, embedder };
  }
}
