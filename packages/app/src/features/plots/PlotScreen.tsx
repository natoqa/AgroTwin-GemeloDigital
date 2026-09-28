import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Plot, PlotDetailsUpdate } from '@agrotwin/domain';
import { DomainError } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';
import { es } from '../../i18n/es';
import { Button } from '../../ui/Button';
import { Banner } from '../../ui/Card';
import { Field } from '../../ui/Field';
import { Screen, Section } from '../../ui/Screen';

/**
 * The details of one plot: what it is called, how big it is, and where.
 *
 * Area and location are optional everywhere else, and they are optional here
 * too, but this is where they can be filled in. The water balance cannot run
 * without a latitude, so the screen says why it is asking instead of
 * presenting an unexplained pair of number boxes.
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
      setError(
        (cause instanceof DomainError ? es.plot.errors[cause.code] : undefined) ??
          es.common.saveFailed,
      );
    }
  };

  return (
    <Screen
      title={plot.name}
      back={{ label: es.common.myPlots, onClick: onBack }}
      testId="plot-screen"
    >
      <Button variant="primary" icon="sprout" wide onClick={onOpenCampaigns} data-testid="go-campaigns">
        {es.plot.campaigns}
      </Button>

      <Section title={es.plot.detailsTitle} icon="pin">
        <p className="text-lg text-muted">{es.plot.detailsHelp}</p>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field
            id="plot-detail-name"
            data-testid="plot-detail-name"
            label={es.plot.name}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
          <Field
            id="plot-area"
            data-testid="plot-area"
            label={es.plot.area}
            type="number"
            inputMode="decimal"
            step="0.01"
            value={area}
            onChange={(event) => setArea(event.target.value)}
          />
          <Field
            id="plot-latitude"
            data-testid="plot-latitude"
            label={es.plot.latitude}
            type="number"
            inputMode="decimal"
            step="0.0001"
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
          />
          <Field
            id="plot-longitude"
            data-testid="plot-longitude"
            label={es.plot.longitude}
            type="number"
            inputMode="decimal"
            step="0.0001"
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
          />
          <Field
            id="plot-altitude"
            data-testid="plot-altitude"
            label={es.plot.altitude}
            type="number"
            inputMode="numeric"
            step="1"
            value={altitude}
            onChange={(event) => setAltitude(event.target.value)}
          />

          <Button type="submit" variant="primary" icon="check" wide data-testid="save-plot-details">
            {es.plot.save}
          </Button>
        </form>

        {saved ? (
          <Banner tone="good" icon="check" testId="plot-saved">
            {es.plot.saved}
          </Banner>
        ) : null}
        {error ? (
          <Banner tone="now" alert testId="plot-detail-error">
            {error}
          </Banner>
        ) : null}
      </Section>
    </Screen>
  );
}
