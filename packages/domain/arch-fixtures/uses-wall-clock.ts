// ARCH FIXTURE — MUST FAIL LINT (no-restricted-syntax).
export function stampNow(): number {
  return Date.now();
}

export function alsoStampNow(): number {
  return new Date().getTime();
}
