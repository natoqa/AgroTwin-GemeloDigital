import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

export type Tone = 'neutral' | 'now' | 'soon' | 'info' | 'good';

const TONE: Record<Tone, { box: string; accent: string }> = {
  neutral: { box: 'bg-paper border-line', accent: 'text-ink' },
  now: { box: 'bg-now-soft border-now', accent: 'text-now' },
  soon: { box: 'bg-soon-soft border-soon', accent: 'text-soon' },
  info: { box: 'bg-info-soft border-info', accent: 'text-info' },
  good: { box: 'bg-brand-soft border-brand', accent: 'text-brand-strong' },
};

/**
 * A block of information with an icon and a tone.
 *
 * The tone colours the border and the icon, but the meaning is always also
 * in words (CLAUDE.md §3: high contrast, legible in sun, and not everyone
 * reads colour). The left border is thick so the tone survives glare.
 */
export function Card({
  tone = 'neutral',
  icon,
  title,
  children,
  testId,
  as = 'article',
}: {
  tone?: Tone;
  icon?: IconName;
  title?: ReactNode;
  children?: ReactNode;
  testId?: string;
  as?: 'article' | 'div' | 'li';
}) {
  const Tag = as;
  const style = TONE[tone];
  return (
    <Tag
      data-testid={testId}
      className={`flex gap-3 rounded-xl border-2 border-l-8 p-4 ${style.box}`}
    >
      {icon ? <Icon name={icon} className={`mt-0.5 h-8 w-8 ${style.accent}`} /> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {title ? <h3 className="text-xl font-bold leading-snug">{title}</h3> : null}
        {children}
      </div>
    </Tag>
  );
}

/**
 * Something the farmer must not miss: the synthetic-climate warning, an error.
 *
 * `role="alert"` is kept for failures the farmer just caused; standing
 * warnings use `note`, so a screen reader does not interrupt on every load.
 */
export function Banner({
  tone,
  icon = 'warning',
  children,
  testId,
  alert = false,
}: {
  tone: Exclude<Tone, 'neutral'>;
  icon?: IconName;
  children: ReactNode;
  testId?: string;
  alert?: boolean;
}) {
  const style = TONE[tone];
  return (
    <div
      role={alert ? 'alert' : 'note'}
      data-testid={testId}
      className={`flex items-start gap-3 rounded-xl border-2 p-4 text-lg ${style.box}`}
    >
      <Icon name={icon} className={`mt-0.5 h-7 w-7 ${style.accent}`} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
