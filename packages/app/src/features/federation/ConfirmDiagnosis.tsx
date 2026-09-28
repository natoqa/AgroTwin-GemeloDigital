import { useState } from 'react';
import type { ModelClass, ObservationId } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';
import { DIAGNOSIS_LABEL, es } from '../../i18n/es';

const CLASSES: readonly ModelClass[] = ['healthy', 'early_blight', 'late_blight'];

/**
 * "Did I get it right?" under the latest photograph.
 *
 * The farmer's answer is the only thing the phone ever trains on
 * (CLAUDE.md §11): the model's own guesses would teach it nothing. One tap to
 * confirm, one tap to correct; nothing is shared by answering.
 */
export function ConfirmDiagnosis({
  observationId,
  predicted,
}: {
  observationId: ObservationId;
  predicted: ModelClass | 'rejected';
}) {
  const { labelObservation } = useContainer();
  const [state, setState] = useState<'idle' | 'saved' | 'failed'>('idle');

  const answer = async (label: ModelClass) => {
    try {
      await labelObservation(observationId, label);
      setState('saved');
    } catch {
      setState('failed');
    }
  };

  if (state === 'saved') {
    return (
      <p className="text-base font-semibold" data-testid="diagnosis-confirmed">
        {es.federation.confirmed}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="confirm-diagnosis">
      <p className="text-base font-semibold">{es.federation.confirmQuestion}</p>
      <div className="flex flex-wrap gap-2">
        {CLASSES.map((label) => (
          <button
            key={label}
            type="button"
            data-testid={`label-${label}`}
            onClick={() => void answer(label)}
            className="min-h-12 rounded-xl border-2 border-line bg-paper px-3 text-base font-bold"
          >
            {label === predicted
              ? es.federation.confirmYes
              : es.federation.confirmAs(DIAGNOSIS_LABEL[label].replace('Posible ', ''))}
          </button>
        ))}
      </div>
      {state === 'failed' ? (
        <p role="alert" className="text-base">
          {es.federation.confirmFailed}
        </p>
      ) : null}
    </div>
  );
}
