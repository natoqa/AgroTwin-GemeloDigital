import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Vitest 5 replaced `vitest.workspace.ts` with `test.projects`; CLAUDE.md §15
 * asks for the former by name, and this is the supported equivalent.
 *
 * Packages are aliased to their sources so the suite runs without a prior
 * build, while production resolution still goes through `dist` via exports.
 */
const domainSrc = fileURLToPath(new URL('./packages/domain/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@agrotwin/domain': domainSrc,
    },
  },
  test: {
    projects: [
      {
        resolve: { alias: { '@agrotwin/domain': domainSrc } },
        test: {
          name: 'domain',
          environment: 'node',
          include: ['packages/domain/src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias: { '@agrotwin/domain': domainSrc } },
        test: {
          name: 'infrastructure',
          environment: 'node',
          include: ['packages/infrastructure/src/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reportsOnly: false,
      include: ['packages/domain/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      reporter: ['text', 'lcov'],
      // CLAUDE.md §7: the 85% domain threshold activates in Phase 3, not before.
    },
  },
});
