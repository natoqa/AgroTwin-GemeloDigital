import type { InputHTMLAttributes, ReactNode } from 'react';

/**
 * A labelled input.
 *
 * The label sits above the box, in full, never as a placeholder that vanishes
 * the moment the farmer starts typing. The box is 56px tall with a 2px border
 * that holds 5:1 against the page.
 */
export function Field({
  id,
  label,
  hint,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-lg font-semibold">
        {label}
      </label>
      {hint ? <p className="text-base text-muted">{hint}</p> : null}
      <input
        id={id}
        className="min-h-14 w-full rounded-xl border-2 border-line bg-paper px-4 text-lg text-ink"
        {...input}
      />
    </div>
  );
}

/**
 * One answer of a multiple-choice question, as a big toggle.
 *
 * `aria-pressed` carries the state for assistive technology; a thick border,
 * a filled background and a check mark carry it for the eye. Colour alone
 * would not be enough in sun.
 */
export function Choice({
  pressed,
  onClick,
  children,
  testId,
  compact = false,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
  /** For short answers laid out side by side: centred, with the check inline. */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-testid={testId}
      onClick={onClick}
      className={[
        'flex min-h-14 w-full items-center gap-2 rounded-xl border-2 text-lg font-bold',
        compact ? 'justify-center whitespace-nowrap px-2' : 'justify-between px-5 text-left',
        pressed ? 'border-brand bg-brand text-paper' : 'border-line bg-paper text-ink',
      ].join(' ')}
    >
      <span>{children}</span>
      {compact && !pressed ? null : (
        <span aria-hidden="true" className={compact ? 'text-xl' : 'text-2xl'}>
          {pressed ? '✓' : ''}
        </span>
      )}
    </button>
  );
}

/** A question with its answers stacked, one per row, for a thumb. */
export function ChoiceGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 text-xl font-bold">{legend}</legend>
      {children}
    </fieldset>
  );
}
