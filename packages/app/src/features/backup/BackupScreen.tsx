import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { DomainError } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';

/**
 * Export, restore and erase.
 *
 * This screen is the whole of the farmer's insurance: with no cloud (CLAUDE.md
 * §3), a lost phone is a lost twin unless a file left the device first. Erasing
 * asks for a typed confirmation rather than a dialog, because a `confirm()`
 * blocks the page and because a mis-tap must not be able to delete a season.
 */
const ERASE_WORD = 'BORRAR';

export function BackupScreen({ onChanged, onBack }: { onChanged: () => void; onBack: () => void }) {
  const { exportBackup, importBackup, eraseAllData, backupFile } = useContainer();
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [eraseConfirmation, setEraseConfirmation] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const backup = await exportBackup();
      backupFile.download(backup.contents, `agrotwin-${backup.createdOn.toString()}.json`);
      setMessage('Copia guardada en tus descargas.');
    } catch {
      setError('No se pudo guardar la copia.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const summary = await importBackup(await backupFile.read(file));
      setMessage(
        `Copia restaurada: ${summary.plots} parcelas, ${summary.campaigns} campañas y ${summary.observations} observaciones.`,
      );
      onChanged();
    } catch (cause) {
      setError(
        cause instanceof DomainError
          ? 'Ese archivo no es una copia que esta aplicación pueda leer.'
          : 'No se pudo restaurar la copia.',
      );
    } finally {
      // Lets the farmer pick the same file again after a failure.
      event.target.value = '';
      setBusy(false);
    }
  };

  const erase = async () => {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await eraseAllData();
      setEraseConfirmation('');
      setMessage('Se borraron todos los datos de este teléfono.');
      onChanged();
    } catch {
      setError('No se pudieron borrar los datos.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid="backup-screen">
      <h1>Copia de seguridad</h1>
      <p>
        Tus datos viven solo en este teléfono. Guarda una copia y pásala a una computadora o a una
        memoria para no perderla.
      </p>

      <h2>Guardar una copia</h2>
      <p>La copia guarda tus parcelas, campañas y observaciones, con fotos pequeñas.</p>
      <button type="button" onClick={() => void save()} disabled={busy} data-testid="export-backup">
        Guardar copia
      </button>

      <h2>Restaurar una copia</h2>
      <label htmlFor="backup-file">Elige el archivo de la copia</label>
      <input
        id="backup-file"
        data-testid="import-backup"
        type="file"
        accept="application/json,.json"
        onChange={(event) => void restore(event)}
        disabled={busy}
      />

      <h2>Borrar todo</h2>
      <p>
        Esto borra todo lo que hay en este teléfono y no se puede deshacer. Escribe {ERASE_WORD}{' '}
        para confirmar.
      </p>
      <label htmlFor="erase-confirmation">Escribe {ERASE_WORD}</label>
      <input
        id="erase-confirmation"
        data-testid="erase-confirmation"
        type="text"
        value={eraseConfirmation}
        onChange={(event) => setEraseConfirmation(event.target.value)}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => void erase()}
        disabled={busy || eraseConfirmation !== ERASE_WORD}
        data-testid="erase-all"
      >
        Borrar todo
      </button>

      {message ? <p data-testid="backup-message">{message}</p> : null}
      {error ? (
        <p role="alert" data-testid="backup-error">
          {error}
        </p>
      ) : null}

      <button type="button" onClick={onBack}>
        Mis parcelas
      </button>
    </section>
  );
}
