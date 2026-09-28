import type { ReactNode } from 'react';

/**
 * The icon set, drawn here rather than pulled from a library (Phase 4, D5).
 *
 * About twenty glyphs cost less than a dependency, and drawing them means the
 * stroke is as thick as sunlight needs: 2.5 on a 24-unit grid, noticeably
 * heavier than the 1.5–2 most icon sets ship with.
 *
 * Icons are decoration next to words, never instead of them: every one is
 * `aria-hidden`, and the component that uses it supplies the text. A farmer
 * who does not recognise a glyph still reads the label; a screen reader never
 * announces "image".
 */
const PATHS = {
  back: <path d="M15 5l-7 7 7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  drop: <path d="M12 3c3.5 4.5 6 8 6 11a6 6 0 0 1-12 0c0-3 2.5-6.5 6-11z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </>
  ),
  rain: (
    <>
      <path d="M7 15a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 6.5 4 4 0 0 1 17 15z" />
      <path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15z" />
      <path d="M5 19l7-7" />
    </>
  ),
  thermometer: (
    <>
      <path d="M10 4a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0z" />
      <path d="M12 9v7" />
    </>
  ),
  sprout: (
    <>
      <path d="M12 21v-9" />
      <path d="M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 10c0-3.5 2.5-5.5 7-5.5 0 3.5-2.5 5.5-7 5.5z" />
    </>
  ),
  spray: (
    <>
      <path d="M8 9h6v11H8z" />
      <path d="M10 9V6h3l3-2M18 6h2M18 9l2 1M18 3l2-1" />
    </>
  ),
  calendar: (
    <>
      <path d="M4 6h16v14H4z" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 18v.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  check: <path d="M4 12.5l5 5L20 6.5" />,
  pin: (
    <>
      <path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17v.5" />
    </>
  ),
  save: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 17v3h16v-3" />
    </>
  ),
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" />
      <path d="M4 4v4.5h4.5M12 8v4l3 2" />
    </>
  ),
  field: (
    <>
      <path d="M3 20l4-12h10l4 12z" />
      <path d="M9 8l-2 12M15 8l2 12M12 8v12" />
    </>
  ),
  basket: (
    <>
      <path d="M3 10h18l-2 10H5z" />
      <path d="M8 10l3-6M16 10l-3-6" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'h-6 w-6' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
