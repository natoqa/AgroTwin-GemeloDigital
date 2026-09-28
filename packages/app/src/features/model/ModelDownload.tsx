import { useEffect, useRef, useState } from 'react';
import { useContainer } from '../../composition/ContainerContext';
import { es } from '../../i18n/es';
import { Button } from '../../ui/Button';
import { Banner, Card } from '../../ui/Card';

type Status =
  | { kind: 'checking' }
  | { kind: 'missing' }
  | { kind: 'downloading'; percent: number }
  | { kind: 'ready' }
  | { kind: 'failed' };

/**
 * The one-time download of the leaf-recognition model (Phase 5, D1).
 *
 * Explicit, with progress, and never silent: it is the largest download the
 * app ever makes, and a farmer on mobile data should choose when it happens.
 * Until it is done, everything works except diagnosing photographs, and the
 * capture screen says so instead of failing.
 *
 * `quietWhenReady` hides the card once the model is there, for screens where
 * a permanent "ready" line would be noise.
 */
export function ModelDownload({
  onReady,
  quietWhenReady = false,
}: {
  onReady?: () => void;
  quietWhenReady?: boolean;
}) {
  const { model, warmUpModel } = useContainer();
  const [status, setStatus] = useState<Status>({ kind: 'checking' });
  // A notification, not an input: kept in a ref so a new callback from the
  // parent does not trigger another check.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    let current = true;
    void model.isDownloaded().then((present) => {
      if (!current) return;
      setStatus(present ? { kind: 'ready' } : { kind: 'missing' });
      if (present) onReadyRef.current?.();
    });
    return () => {
      current = false;
    };
  }, [model]);

  const download = async () => {
    setStatus({ kind: 'downloading', percent: 0 });
    try {
      await model.download(({ loadedBytes, totalBytes }) => {
        const percent = totalBytes > 0 ? Math.min(99, Math.floor((loadedBytes / totalBytes) * 100)) : 0;
        setStatus({ kind: 'downloading', percent });
      });
      setStatus({ kind: 'ready' });
      // Start the classifier now, so the first photograph does not wait for it.
      void warmUpModel().catch(() => undefined);
      onReadyRef.current?.();
    } catch {
      setStatus({ kind: 'failed' });
    }
  };

  if (status.kind === 'checking') return null;
  if (status.kind === 'ready') {
    return quietWhenReady ? null : (
      <Banner tone="good" icon="check" testId="model-ready">
        {es.model.ready}
      </Banner>
    );
  }

  return (
    <Card tone="info" icon="leaf" title={es.model.title} testId="model-download">
      <p className="text-lg">{es.model.missing}</p>
      <p className="text-base text-muted">{es.model.size}</p>
      {status.kind === 'downloading' ? (
        <div className="flex flex-col gap-2" role="status" data-testid="model-downloading">
          <p className="text-lg font-semibold">{es.model.downloading(status.percent)}</p>
          <div
            className="h-4 w-full overflow-hidden rounded-full border-2 border-line bg-paper"
            role="progressbar"
            aria-label={es.model.title}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={status.percent}
          >
            <div className="h-full bg-brand" style={{ width: `${status.percent}%` }} />
          </div>
        </div>
      ) : (
        <Button variant="primary" icon="save" wide onClick={() => void download()} data-testid="download-model">
          {es.model.download}
        </Button>
      )}
      {status.kind === 'failed' ? (
        <Banner tone="now" alert testId="model-download-failed">
          {es.model.failed}
        </Banner>
      ) : null}
    </Card>
  );
}
