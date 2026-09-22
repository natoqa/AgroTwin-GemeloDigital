/**
 * Executable proof of the Phase 0 DoD.
 *
 * Each guard points at a fixture that MUST be rejected. The script fails if a
 * fixture is accepted, so the architectural rules cannot silently rot: a
 * regression in tsconfig or eslint.config.js turns this red.
 *
 * Run with `pnpm test:arch`.
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const GUARDS = [
  {
    name: 'A browser global inside the domain breaks compilation',
    tool: 'tsc',
    args: ['--noEmit', '-p', 'packages/domain/arch-fixtures/tsconfig.json'],
    expect: /Cannot find name 'window'/,
  },
  {
    name: 'Date.now() and new Date() inside the domain break lint',
    tool: 'eslint',
    args: ['--no-ignore', 'packages/domain/arch-fixtures/uses-wall-clock.ts'],
    expect: /no-restricted-syntax/,
  },
  {
    name: 'Math.random inside the domain breaks lint',
    tool: 'eslint',
    args: ['--no-ignore', 'packages/domain/arch-fixtures/uses-randomness.ts'],
    expect: /no-restricted-syntax/,
  },
  {
    name: 'Importing infrastructure from the domain breaks lint',
    tool: 'eslint',
    args: ['--no-ignore', 'packages/domain/arch-fixtures/imports-infrastructure.ts'],
    expect: /no-restricted-imports|boundaries\/dependencies/,
  },
];

let failed = 0;

for (const guard of GUARDS) {
  const result = spawnSync('pnpm', ['exec', guard.tool, ...guard.args], {
    encoding: 'utf8',
    shell: true,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const rejected = result.status !== 0;
  const matched = guard.expect.test(output);

  if (rejected && matched) {
    console.log(`  PASS  ${guard.name}`);
    continue;
  }

  failed += 1;
  console.error(`  FAIL  ${guard.name}`);
  console.error(
    rejected
      ? `        rejected, but not for the expected reason (${String(guard.expect)})`
      : '        the fixture was ACCEPTED; the architectural rule is not being enforced',
  );
  console.error(
    output
      .split('\n')
      .map((line) => `        | ${line}`)
      .join('\n'),
  );
}

console.log(`\n${GUARDS.length - failed}/${GUARDS.length} architectural guards hold.`);
process.exit(failed === 0 ? 0 : 1);
