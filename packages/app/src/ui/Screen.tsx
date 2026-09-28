import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * The frame every screen shares: a way back, a title, and the content.
 *
 * The way back is at the top and says where it goes ("Volver a las campañas",
 * not a bare arrow), because the farmer should never have to guess what a
 * button will do. The content column is capped at a phone's width and padded
 * 16px on each side, so nothing ever scrolls sideways.
 */
export function Screen({
  title,
  subtitle,
  back,
  testId,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  back?: { label: string; onClick: () => void };
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={testId} className="mx-auto flex max-w-xl flex-col gap-5 px-4 pb-12 pt-3">
      {back ? (
        <button
          type="button"
          onClick={back.onClick}
          className="-ml-2 inline-flex min-h-12 items-center gap-2 self-start rounded-lg px-2 text-lg font-semibold text-ink underline underline-offset-4"
        >
          <Icon name="back" />
          <span>{back.label}</span>
        </button>
      ) : null}
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold leading-tight">{title}</h1>
        {subtitle ? <div className="text-lg text-muted">{subtitle}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** A titled block inside a screen. */
export function Section({
  title,
  icon,
  children,
  testId,
}: {
  title: string;
  icon?: Parameters<typeof Icon>[0]['name'];
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="flex flex-col gap-3" data-testid={testId}>
      <h2 className="flex items-center gap-2 text-2xl font-extrabold">
        {icon ? <Icon name={icon} className="h-7 w-7" /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}
