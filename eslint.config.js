import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

/**
 * Architectural rules are enforced by tooling, not by discipline (CLAUDE.md §7).
 *
 * Layering is guarded twice on purpose:
 *  - `boundaries/dependencies` catches relative imports that cross a layer
 *    (`../../infrastructure/src/...`).
 *  - `no-restricted-imports` catches workspace package specifiers
 *    (`@agrotwin/infrastructure`). The plugin's Node resolver cannot see a
 *    workspace package that is deliberately absent from the importer's
 *    dependencies, so this rule closes that gap.
 */

const FORBIDDEN_IN_DOMAIN = [
  {
    selector:
      'CallExpression[callee.type="MemberExpression"][callee.object.name="Date"][callee.property.name="now"]',
    message:
      'Date.now() is forbidden in the domain. Inject time through ClockPort (CLAUDE.md §7).',
  },
  {
    selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
    message:
      'new Date() without arguments reads the wall clock. Inject time through ClockPort (CLAUDE.md §7).',
  },
  {
    selector: 'MemberExpression[object.name="Math"][property.name="random"]',
    message:
      'Math.random is forbidden in the domain. Inject randomness through RandomPort (CLAUDE.md §7).',
  },
];

const FORBIDDEN_IMPORTS_IN_DOMAIN = [
  {
    group: ['@agrotwin/infrastructure', '@agrotwin/infrastructure/*'],
    message: 'The domain must not depend on infrastructure. Define a port instead (CLAUDE.md §7).',
  },
  {
    group: ['@agrotwin/app', '@agrotwin/app/*'],
    message: 'The domain must not depend on the app layer (CLAUDE.md §7).',
  },
  {
    group: ['**/infrastructure/**', '**/app/**'],
    message: 'The domain must not reach into another layer by path (CLAUDE.md §7).',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      // Fixtures here are *expected* to fail lint; `pnpm test:arch` runs
      // ESLint against them explicitly with --no-ignore.
      '**/arch-fixtures/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'domain', pattern: 'packages/domain/src/**/*' },
        { type: 'infrastructure', pattern: 'packages/infrastructure/src/**/*' },
        { type: 'app', pattern: 'packages/app/src/**/*' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: { element: { type: 'domain' } },
              allow: [{ to: { element: { type: 'domain' } } }],
            },
            {
              from: { element: { type: 'infrastructure' } },
              allow: [
                { to: { element: { type: 'infrastructure' } } },
                { to: { element: { type: 'domain' } } },
              ],
            },
            {
              from: { element: { type: 'app' } },
              allow: [
                { to: { element: { type: 'app' } } },
                { to: { element: { type: 'infrastructure' } } },
                { to: { element: { type: 'domain' } } },
              ],
            },
          ],
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // --- The domain: pure TypeScript, no ambient anything -------------------
  {
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-console': 'error',
      'no-restricted-syntax': ['error', ...FORBIDDEN_IN_DOMAIN],
      'no-restricted-globals': [
        'error',
        { name: 'crypto', message: 'Use a domain port; Web Crypto belongs to infrastructure.' },
      ],
      'no-restricted-imports': ['error', { patterns: FORBIDDEN_IMPORTS_IN_DOMAIN }],
    },
  },

  // --- Tooling and config files run on Node -------------------------------
  {
    files: ['*.js', '*.mjs', 'scripts/**/*.mjs', '**/*.config.ts'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly' },
    },
    rules: { 'no-console': 'off' },
  },
);
