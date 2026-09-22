import { useEffect, useState } from 'react';
import type { StorageStatus } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';

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
      <p data-testid="storage-persisted">
        Tus datos están guardados en este teléfono y no se borrarán solos.
      </p>
    );
  }

  return (
    <div data-testid="storage-not-persisted">
      <p>
        Este teléfono podría borrar tus datos si se queda sin espacio. Guarda una copia de vez en
        cuando.
      </p>
      <button type="button" onClick={onOpenBackup} data-testid="storage-go-backup">
        Guardar una copia
      </button>
    </div>
  );
}
