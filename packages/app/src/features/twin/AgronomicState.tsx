import type { CampaignState } from '@agrotwin/domain';
import { confidenceLabel } from './diagnosisText';

/**
 * What the twin believes about the crop, in words a farmer can act on.
 *
 * Every branch here is a different *kind* of not-knowing, and they are kept
 * apart on purpose. "I have no location for this plot" is fixable by the
 * farmer in a minute; "nobody has told me when this variety starts making
 * tubers" is not, and is not their problem. Collapsing both into a blank
 * screen would waste the first and hide the second.
 *
 * Nothing here invents a number. A field the engine could not compute is a
 * sentence saying so.
 */
const STAGE_LABEL: Record<string, string> = {
  emergence: 'brotando',
  vegetative_development: 'creciendo la planta',
  tuber_initiation: 'empezando a formar papas',
  bulking: 'engordando las papas',
  maturity: 'lista para cosechar',
};

export function AgronomicState({ state }: { state: CampaignState }) {
  if (state.unavailable === 'no_location') {
    return (
      <p data-testid="agronomy-no-location">
        Para calcular el agua de tu parcela necesito saber dónde queda. Puedes ponerlo en los datos
        de la parcela.
      </p>
    );
  }

  if (state.unavailable === 'no_weather') {
    return <p data-testid="agronomy-no-weather">Todavía no tengo el clima de esta campaña.</p>;
  }

  if (state.unavailable === 'missing_coefficients' || !state.latest) {
    return (
      <p data-testid="agronomy-unavailable">
        Todavía no puedo calcular el estado del cultivo. Faltan datos del cultivo que el equipo
        técnico debe revisar.
      </p>
    );
  }

  const latest = state.latest;
  const synthetic = latest.provenance.some((entry) => entry.source === 'synthetic_normals');

  return (
    <article data-testid="agronomic-state">
      <h2>Cómo va el cultivo</h2>

      <p data-testid="gdd">
        Calor acumulado desde la siembra: {Math.round(latest.accumulatedGdd)} grados-día
      </p>

      {latest.phenologicalStage ? (
        <p data-testid="stage">
          La planta está {STAGE_LABEL[latest.phenologicalStage] ?? latest.phenologicalStage}
        </p>
      ) : (
        <p data-testid="stage-unknown">
          Todavía no puedo decirte en qué etapa está la planta: falta información del cultivo para
          esta zona.
        </p>
      )}

      <p data-testid="water">
        {latest.waterBalance.underStress
          ? `A tu parcela le faltan unos ${Math.round(latest.waterBalance.depletion)} mm de agua. La planta ya está pasando sed.`
          : `A tu parcela le faltan unos ${Math.round(latest.waterBalance.depletion)} mm de agua. Todavía alcanza.`}
      </p>

      {latest.lateBlightRisk ? (
        <p data-testid="blight">
          {latest.lateBlightRisk.sprayAdvised
            ? 'El clima ha estado favorable para el tizón tardío. Conviene revisar y considerar fungicida.'
            : 'Por ahora el clima no ha sido muy favorable para el tizón tardío.'}
        </p>
      ) : (
        <p data-testid="blight-unknown">
          No puedo calcular el riesgo de tizón: nadie mide cuántas horas se moja la hoja aquí.
        </p>
      )}

      <p data-testid="agronomy-confidence">
        Qué tan seguro estoy: {confidenceLabel(latest.confidence)}
      </p>

      {synthetic ? (
        <p data-testid="synthetic-warning">
          <strong>Atención:</strong> estos cálculos usan un clima de ejemplo, no el clima real de tu
          zona. Sirven para probar la aplicación, no para decidir en tu parcela.
        </p>
      ) : null}
    </article>
  );
}
