import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Plot } from '@agrotwin/domain';
import { DomainError } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';

/** Lists the farmer's plots and registers new ones. */
export function PlotsScreen({ onOpenPlot }: { onOpenPlot: (plot: Plot) => void }) {
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
      setError(cause instanceof DomainError ? nameErrorMessage(cause) : 'No se pudo guardar.');
    }
  };

  return (
    <section data-testid="plots-screen">
      <h1>Mis parcelas</h1>

      <form onSubmit={submit}>
        <label htmlFor="plot-name">Nombre de la parcela</label>
        <input
          id="plot-name"
          data-testid="plot-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
        />
        <button type="submit" data-testid="create-plot">
          Crear parcela
        </button>
      </form>

      {error ? (
        <p role="alert" data-testid="plot-error">
          {error}
        </p>
      ) : null}

      <ul data-testid="plot-list">
        {stored.map((plot) => (
          <li key={plot.id}>
            <button type="button" onClick={() => onOpenPlot(plot)} data-testid="open-plot">
              {plot.name}
            </button>
          </li>
        ))}
      </ul>

      {stored.length === 0 ? <p>Todavía no tienes parcelas. Crea la primera.</p> : null}
    </section>
  );
}

function nameErrorMessage(error: DomainError): string {
  return error.code === 'INVALID_PLOT_NAME'
    ? 'Escribe un nombre para la parcela.'
    : 'No se pudo guardar.';
}
