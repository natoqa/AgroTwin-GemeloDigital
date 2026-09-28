import { useEffect, useState } from 'react';
import type { StorageStatus } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';
import { es } from '../../i18n/es';
import { Button } from '../../ui/Button';
import { Banner } from '../../ui/Card';

/**
 * Asks the browser to keep the twin, and says plainly what the answer means.
 *
 * With no cloud anywhere, eviction is the single largest threat to the
 * farmer's data (risk R-07). The request is made once, on the first screen,
 * because by the time storage is under pressure Chrome is far less likely to
 * grant it. A refusal is not hidden: it becomes a reason to keep a backup.
 */
export function StorageNotice({ onOpenBackup }: { onOpenBackup: () => void }) {
  const { ensurePersistentStorage } = useContainer();
  const [status, setStatus] = useState<StorageStatus | undefined>(undefined);

  useEffect(() => {
    void ensurePersistentStorage().then(setStatus);
  }, [ensurePersistentStorage]);

  if (!status) {
    return null;
  }

  if (status.persisted) {
    return (
      <Banner tone="good" icon="check" testId="storage-persisted">
        {es.storage.persisted}
      </Banner>
    );
  }

  return (
    <div data-testid="storage-not-persisted" className="flex flex-col gap-3">
      <Banner tone="soon">{es.storage.notPersisted}</Banner>
      <Button icon="save" onClick={onOpenBackup} data-testid="storage-go-backup">
        {es.storage.goBackup}
      </Button>
    </div>
  );
}
