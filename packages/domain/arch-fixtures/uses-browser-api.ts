// ARCH FIXTURE — MUST NOT COMPILE.
// `packages/domain/tsconfig.json` declares "lib": ["ES2022"] with no "DOM",
// so a browser global inside the domain is a type error, not a convention.
// Verified by `pnpm test:arch`.
export function readViewportWidth(): number {
  return window.innerWidth;
}
