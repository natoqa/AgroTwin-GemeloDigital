import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { FEDERATION_CONSENTS } from '@agrotwin/domain';
import type { FederationConsent, FederationStatus } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';
import { es } from '../../i18n/es';
import { Button } from '../../ui/Button';
import { Banner } from '../../ui/Card';
import { Choice, ChoiceGroup } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import { Screen, Section } from '../../ui/Screen';
import { ModelDownload } from '../model/ModelDownload';

/**
 * Federated learning, as the farmer sees it (CLAUDE.md §11).
 *
 * Consent first, in words, with "share nothing" as the default and
 * "only receive" as a middle ground. Sharing is a file the farmer carries to
 * the hub (FileTransport, the path that always works); receiving is a file
 * the phone judges against its own confirmed photos before using it.
 */
export function FederationScreen({ onBack }: { onBack: () => void }) {
  const {
    getFederationStatus,
    setFederationConsent,
    prepareContribution,
    importAggregatedModel,
    backupFile,
  } = useContainer();
  const [status, setStatus] = useState<FederationStatus | undefined>(undefined);
  const [message, setMessage] = useState<{ tone: 'good' | 'now'; text: string } | undefined>();

  const refresh = useCallback(() => {
    void getFederationStatus().then(setStatus);
  }, [getFederationStatus]);
  useEffect(refresh, [refresh]);

  const choose = async (consent: FederationConsent) => {
    await setFederationConsent(consent);
    setMessage(undefined);
    refresh();
  };

  const prepare = async () => {
    setMessage(undefined);
    try {
      const contribution = await prepareContribution();
      const day = new Date(contribution.header.createdAt).toISOString().slice(0, 10);
      backupFile.downloadBytes(
        contribution.bytes,
        `aporte-${day}-${contribution.header.ephemeralId.slice(0, 6)}.agrotwin-delta`,
      );
      setMessage({ tone: 'good', text: es.federation.prepared });
    } catch (cause) {
      setMessage({
        tone: 'now',
        text: es.federation.prepareFailed(cause instanceof Error ? cause.message : String(cause)),
      });
    }
  };

  const load = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage(undefined);
    try {
      const verdict = await importAggregatedModel(await backupFile.readBytes(file));
      setMessage(
        verdict.accepted
          ? { tone: 'good', text: es.federation.accepted(verdict.holdoutBefore, verdict.holdoutAfter) }
          : { tone: 'now', text: es.federation.rejected[verdict.reason] ?? es.federation.importFailed },
      );
    } catch {
      setMessage({ tone: 'now', text: es.federation.importFailed });
    } finally {
      event.target.value = '';
      refresh();
    }
  };

  return (
    <Screen
      title={es.federation.title}
      back={{ label: es.common.myPlots, onClick: onBack }}
      testId="federation-screen"
    >
      <p className="text-lg">{es.federation.intro}</p>
      <Banner tone="info" icon="info">
        {es.federation.privacy}
      </Banner>

      <ModelDownload quietWhenReady onReady={refresh} />

      {message ? (
        <Banner tone={message.tone} alert={message.tone === 'now'} testId="federation-message">
          {message.text}
        </Banner>
      ) : null}

      {status ? (
        <>
          <ChoiceGroup legend={es.federation.consentLegend}>
            {FEDERATION_CONSENTS.map((consent) => (
              <Choice
                key={consent}
                pressed={status.consent === consent}
                testId={`consent-${consent}`}
                onClick={() => void choose(consent)}
              >
                {es.federation.consent[consent] ?? consent}
              </Choice>
            ))}
          </ChoiceGroup>

          <p className="text-lg" data-testid="federation-status">
            {es.federation.status(
              status.trainingExamples,
              status.holdoutExamples,
              status.minimumExamples,
            )}
          </p>
          {status.headVersion ? (
            <p className="text-base text-muted" data-testid="federation-model">
              {es.federation.modelVersion(status.headVersion)}
            </p>
          ) : null}

          <Section title={es.federation.prepare} icon="save">
            {status.consent === 'share_and_receive' ? (
              <Button variant="primary" icon="save" wide onClick={() => void prepare()} data-testid="prepare-contribution">
                {es.federation.prepare}
              </Button>
            ) : (
              <p className="text-lg">{es.federation.prepareBlocked}</p>
            )}
          </Section>

          <Section title={es.federation.importLabel} icon="history">
            <label
              htmlFor="aggregated-model"
              className="flex min-h-14 cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-line bg-paper px-5 text-lg font-bold"
            >
              <Icon name="history" />
              <span>{es.federation.importLabel}</span>
            </label>
            <input
              id="aggregated-model"
              data-testid="import-model"
              type="file"
              accept=".agrotwin-model,application/octet-stream"
              onChange={(event) => void load(event)}
              className="sr-only"
            />
          </Section>
        </>
      ) : null}
    </Screen>
  );
}
