import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { DomainError } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';
import { es } from '../../i18n/es';
import { Button } from '../../ui/Button';
import { Banner } from '../../ui/Card';
import { Field } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import { Screen, Section } from '../../ui/Screen';

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
      setMessage(es.backup.saved);
    } catch {
      setError(es.backup.saveFailed);
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
      setMessage(es.backup.restored(summary.plots, summary.campaigns, summary.observations));
      onChanged();
    } catch (cause) {
      setError(cause instanceof DomainError ? es.backup.notABackup : es.backup.restoreFailed);
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
      setMessage(es.backup.erased);
      onChanged();
    } catch {
      setError(es.backup.eraseFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title={es.backup.title}
      back={{ label: es.common.myPlots, onClick: onBack }}
      testId="backup-screen"
    >
      <p className="text-lg">{es.backup.intro}</p>

      {/* Results first, where the farmer is already looking after tapping. */}
      {message ? (
        <Banner tone="good" icon="check" testId="backup-message">
          {message}
        </Banner>
      ) : null}
      {error ? (
        <Banner tone="now" alert testId="backup-error">
          {error}
        </Banner>
      ) : null}

      <Section title={es.backup.saveTitle} icon="save">
        <p className="text-lg text-muted">{es.backup.saveHelp}</p>
        <Button
          variant="primary"
          icon="save"
          wide
          onClick={() => void save()}
          disabled={busy}
          data-testid="export-backup"
        >
          {es.backup.saveButton}
        </Button>
      </Section>

      <Section title={es.backup.restoreTitle} icon="history">
        <label
          htmlFor="backup-file"
          className="flex min-h-14 cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-line bg-paper px-5 text-lg font-bold"
        >
          <Icon name="history" />
          <span>{es.backup.restoreLabel}</span>
        </label>
        <input
          id="backup-file"
          data-testid="import-backup"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void restore(event)}
          disabled={busy}
          className="sr-only"
        />
      </Section>

      <Section title={es.backup.eraseTitle} icon="trash">
        <p className="text-lg text-muted">{es.backup.eraseHelp(ERASE_WORD)}</p>
        <Field
          id="erase-confirmation"
          data-testid="erase-confirmation"
          label={es.backup.eraseLabel(ERASE_WORD)}
          type="text"
          value={eraseConfirmation}
          onChange={(event) => setEraseConfirmation(event.target.value)}
          autoComplete="off"
        />
        <Button
          variant="danger"
          icon="trash"
          wide
          onClick={() => void erase()}
          disabled={busy || eraseConfirmation !== ERASE_WORD}
          data-testid="erase-all"
        >
          {es.backup.eraseButton}
        </Button>
      </Section>
    </Screen>
  );
}
