import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Plot, PlotDetailsUpdate } from '@agrotwin/domain';
import { DomainError } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';

/**
 * The details of one plot: what it is called, how big it is, and where.
 *
 * Area and location are optional everywhere else, and they are optional here
 * too, but this is where they can be filled in. Phase 3 cannot estimate
 * evapotranspiration without a latitude, so the screen says why it is asking
 * instead of presenting an unexplained pair of number boxes.
 */
export function PlotScreen({
  plot,
  onOpenCampaigns,
  onSaved,
  onBack,
}: {
  plot: Plot;
  onOpenCampaigns: () => void;
  onSaved: (plot: Plot) => void;
  onBack: () => void;
}) {
  const { updatePlotDetails } = useContainer();
  const [name, setName] = useState(plot.name);
  const [area, setArea] = useState(plot.area === undefined ? '' : String(plot.area));
  const [latitude, setLatitude] = useState(
    plot.location === undefined ? '' : String(plot.location.latitude),
  );
  const [longitude, setLongitude] = useState(
    plot.location === undefined ? '' : String(plot.location.longitude),
  );
  const [altitude, setAltitude] = useState(
    plot.location?.altitude === undefined ? '' : String(plot.location.altitude),
  );
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    setSaved(false);

    const update: PlotDetailsUpdate = {
      name,
      area: area.trim() === '' ? null : Number(area),
      location:
        latitude.trim() === '' || longitude.trim() === ''
          ? null
          : {
              latitude: Number(latitude),
              longitude: Number(longitude),
              ...(altitude.trim() === '' ? {} : { altitude: Number(altitude) }),
            },
    };

    try {
      const updated = await updatePlotDetails({ plotId: plot.id, update });
      setSaved(true);
      onSaved(updated);
    } catch (cause) {
      setError(cause instanceof DomainError ? messageFor(cause) : 'No se pudo guardar.');
    }
  };

  return (
    <section data-testid="plot-screen">
      <h1>{plot.name}</h1>

      <button type="button" onClick={onOpenCampaigns} data-testid="go-campaigns">
        Campañas de esta parcela
      </button>

      <h2>Datos de la parcela</h2>
      <p>
        La ubicación sirve para calcular el clima de tu parcela. Si no la sabes, puedes dejarla en
        blanco y llenarla después.
      </p>

      <form onSubmit={submit}>
        <label htmlFor="plot-detail-name">Nombre</label>
        <input
          id="plot-detail-name"
          data-testid="plot-detail-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
        />

        <label htmlFor="plot-area">Tamaño en hectáreas</label>
        <input
          id="plot-area"
          data-testid="plot-area"
          type="number"
          inputMode="decimal"
          step="0.01"
          value={area}
          onChange={(event) => setArea(event.target.value)}
        />

        <label htmlFor="plot-latitude">Latitud</label>
        <input
          id="plot-latitude"
          data-testid="plot-latitude"
          type="number"
          inputMode="decimal"
          step="0.0001"
          value={latitude}
          onChange={(event) => setLatitude(event.target.value)}
        />

        <label htmlFor="plot-longitude">Longitud</label>
        <input
          id="plot-longitude"
          data-testid="plot-longitude"
          type="number"
          inputMode="decimal"
          step="0.0001"
          value={longitude}
          onChange={(event) => setLongitude(event.target.value)}
        />

        <label htmlFor="plot-altitude">Altura sobre el mar, en metros</label>
        <input
          id="plot-altitude"
          data-testid="plot-altitude"
          type="number"
          inputMode="numeric"
          step="1"
          value={altitude}
          onChange={(event) => setAltitude(event.target.value)}
        />

        <button type="submit" data-testid="save-plot-details">
          Guardar datos
        </button>
      </form>

      {saved ? <p data-testid="plot-saved">Datos guardados.</p> : null}
      {error ? (
        <p role="alert" data-testid="plot-detail-error">
          {error}
        </p>
      ) : null}

      <button type="button" onClick={onBack}>
        Mis parcelas
      </button>
    </section>
  );
}

function messageFor(error: DomainError): string {
  switch (error.code) {
    case 'INVALID_PLOT_NAME':
      return 'Escribe un nombre para la parcela.';
    case 'INVALID_AREA':
      return 'El tamaño debe ser un número mayor que cero.';
    case 'INVALID_COORDINATES':
      return 'Revisa la latitud, la longitud y la altura.';
    default:
      return 'No se pudo guardar.';
  }
}
