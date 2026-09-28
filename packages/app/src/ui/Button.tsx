import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-paper border-brand hover:bg-brand-strong',
  secondary: 'bg-paper text-ink border-line hover:bg-brand-soft',
  danger: 'bg-now text-paper border-now',
  quiet: 'bg-transparent text-ink border-transparent underline underline-offset-4',
};

/**
 * The one button of the app.
 *
 * Every button is at least 56px tall — above the 48dp floor of CLAUDE.md §3,
 * because a thumb on a moving farmer misses — and says what it does in words.
 * The icon, when there is one, sits before the words and is never the only
 * label. `wide` stretches it across the screen, which is how primary actions
 * are laid out for one-handed use.
 */
export function Button({
  variant = 'secondary',
  icon,
  wide = false,
  children,
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: IconName;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      // The default is spelled out because a <button> inside a form submits.
      type={type}
      className={[
        'inline-flex min-h-14 items-center justify-center gap-3 rounded-xl border-2 px-5 py-3',
        'text-lg font-bold leading-tight',
        'disabled:cursor-not-allowed disabled:border-line disabled:bg-canvas disabled:text-muted',
        wide ? 'w-full' : '',
        VARIANT[variant],
        className,
      ].join(' ')}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : null}
      <span>{children}</span>
    </button>
  );
}
