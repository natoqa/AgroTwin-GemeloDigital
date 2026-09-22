// ARCH FIXTURE — MUST FAIL LINT (no-restricted-imports / boundaries).
import { SystemClockAdapter } from '@agrotwin/infrastructure';

export const leaked = SystemClockAdapter;
