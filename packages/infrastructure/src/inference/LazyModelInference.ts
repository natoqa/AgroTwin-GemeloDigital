import { HeadClassifier, ModelUnavailableError } from '@agrotwin/domain';
import type { Diagnosis, InferencePort } from '@agrotwin/domain';
import type { ModelAssets } from './ModelAssets.js';
import { OnnxEmbeddingAdapter } from './OnnxEmbeddingAdapter.js';

/**
 * The `InferencePort` the app wires in: the real classifier, started on first
 * use.
 *
 * Starting ONNX Runtime costs a WASM compile and a session; doing it at app
 * start would slow every cold start (RNF-05) for farmers who are not taking a
 * photograph. It happens on the first diagnosis instead, and is reused.
 *
 * When the model has not been downloaded, it says so with a domain error
 * rather than falling back to anything: there is no mock in production.
 */
export class LazyModelInference implements InferencePort {
  private classifier: Promise<HeadClassifier> | undefined;

  constructor(
    private readonly assets: ModelAssets,
    private readonly createWorker: () => Worker,
  ) {}

  async diagnose(image: ArrayBuffer): Promise<Diagnosis> {
    return (await this.ready()).diagnose(image);
  }

  /** Starts the model now, for a screen that wants to warm it up. */
  ready(): Promise<HeadClassifier> {
    this.classifier ??= this.start().catch((cause: unknown) => {
      // A failed start must not stick: the farmer may download and retry.
      this.classifier = undefined;
      throw cause;
    });
    return this.classifier;
  }

  private async start(): Promise<HeadClassifier> {
    const model = await this.assets.load();
    if (!model) throw new ModelUnavailableError('it has not been downloaded to this device');
    const embedder = await OnnxEmbeddingAdapter.start(
      this.createWorker(),
      model.contract,
      model.backbone,
      model.wasm,
    );
    return new HeadClassifier(embedder, model.head, model.contract);
  }
}
