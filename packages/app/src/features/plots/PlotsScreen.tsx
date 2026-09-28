import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Plot } from '@agrotwin/domain';
import { DomainError } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';
import { es } from '../../i18n/es';
import { Button } from '../../ui/Button';
import { Banner } from '../../ui/Card';
import { Field } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import { Screen, Section } from '../../ui/Screen';
import { StorageNotice } from '../onboarding/StorageNotice';

/** Lists the farmer's plots and registers new ones. */
export function PlotsScreen({
  onOpenPlot,
  onOpenBackup,
}: {
  onOpenPlot: (plot: Plot) => void;
  onOpenBackup: () => void;
}) {
  const { plots, createPlot } = useContainer();
  const [stored, setStored] = useState<readonly Plot[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    void plots.listAll().then(setStored);
  }, [plots]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    try {
      await createPlot({ name });
      setName('');
      setStored(await plots.listAll());
    } catch (cause) {
      // Domain errors are the ones worth showing; anything else is a bug.
      setError(
        cause instanceof DomainError && cause.code === 'INVALID_PLOT_NAME'
          ? es.plots.nameError
          : es.common.saveFailed,
      );
    }
  };

  return (
    <Screen title={es.plots.title} testId="plots-screen">
      <StorageNotice onOpenBackup={onOpenBackup} />

      {stored.length === 0 ? <p className="text-lg">{es.plots.empty}</p> : null}
      <ul data-testid="plot-list" className="flex flex-col gap-3">
        {stored.map((plot) => (
          <li key={plot.id}>
            <button
              type="button"
              onClick={() => onOpenPlot(plot)}
              data-testid="open-plot"
              className="flex min-h-16 w-full items-center gap-3 rounded-xl border-2 border-line bg-paper px-4 text-left text-xl font-bold"
            >
              <Icon name="field" className="h-8 w-8 text-brand" />
              <span className="flex-1">{plot.name}</span>
              <Icon name="back" className="h-6 w-6 rotate-180" />
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field
          id="plot-name"
          data-testid="plot-name"
          label={es.plots.nameLabel}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
        />
        <Button type="submit" variant="primary" icon="plus" wide data-testid="create-plot">
          {es.plots.create}
        </Button>
      </form>

      {error ? (
        <Banner tone="now" alert testId="plot-error">
          {error}
        </Banner>
      ) : null}

      <Section title={es.plots.backupTitle} icon="save">
        <Button icon="save" wide onClick={onOpenBackup} data-testid="go-backup">
          {es.plots.backupButton}
        </Button>
      </Section>
    </Screen>
  );
}
