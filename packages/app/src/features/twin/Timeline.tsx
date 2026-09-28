import type { TimelineEvent } from '@agrotwin/domain';
import { DIAGNOSIS_LABEL, es } from '../../i18n/es';
import { Icon } from '../../ui/Icon';
import type { IconName } from '../../ui/Icon';

const ICON: Record<TimelineEvent['kind'], IconName> = {
  photo: 'camera',
  irrigation: 'drop',
  weather_answer: 'rain',
};

function describe(event: TimelineEvent): string {
  switch (event.kind) {
    case 'photo':
      return es.twin.history.photo(
        DIAGNOSIS_LABEL[event.entry.snapshot.diagnosis.class],
        event.entry.snapshot.confidence,
        !event.entry.hasOriginalImage,
      );
    case 'irrigation':
      return es.twin.history.irrigation;
    case 'weather_answer':
      return es.twin.history.weather(event.answer.rainfall, event.answer.coldNight);
  }
}

/**
 * The campaign's history, newest first: what was photographed, watered and
 * reported, on the campaign's own day count. The domain merges and orders the
 * events; this only draws them.
 */
export function Timeline({ events }: { events: readonly TimelineEvent[] }) {
  const newestFirst = [...events].reverse();
  if (newestFirst.length === 0) {
    return (
      <p data-testid="snapshot-history" className="text-lg">
        {es.twin.historyEmpty}
      </p>
    );
  }
  return (
    <ol data-testid="snapshot-history" className="flex flex-col border-l-4 border-line pl-4">
      {newestFirst.map((event, index) => (
        <li
          // Events have no shared id; date, kind and position identify one.
          key={`${event.date.toString()}-${event.kind}-${index}`}
          className="relative flex gap-3 py-2"
        >
          <span className="absolute -left-[1.85rem] top-2.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-line bg-paper">
            <Icon name={ICON[event.kind]} className="h-4 w-4" />
          </span>
          <div className="flex flex-col">
            <span className="text-base font-semibold text-muted">
              {es.twin.history.day(event.dayOfCampaign, event.date)}
            </span>
            <span className="text-lg">{describe(event)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
