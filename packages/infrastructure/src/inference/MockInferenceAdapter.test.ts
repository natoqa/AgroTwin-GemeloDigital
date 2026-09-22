import { describe, expect, it } from 'vitest';
import { DIAGNOSIS_CLASSES } from '@agrotwin/domain';
import { MockInferenceAdapter } from './MockInferenceAdapter.js';

const bytes = (...values: number[]) => new Uint8Array(values).buffer;

describe('MockInferenceAdapter', () => {
  it('gives the same answer for the same bytes', async () => {
    const adapter = new MockInferenceAdapter();
    const image = bytes(1, 2, 3, 4);

    const first = await adapter.diagnose(image);
    const second = await adapter.diagnose(bytes(1, 2, 3, 4));

    // Determinism is the whole point: a random mock makes the E2E flaky.
    expect(first).toEqual(second);
  });

  it('answers with a class the domain knows', async () => {
    const adapter = new MockInferenceAdapter();

    for (let i = 0; i < 40; i += 1) {
      const { class: klass, confidence } = await adapter.diagnose(bytes(i, i * 7, i * 13));
      expect(DIAGNOSIS_CLASSES).toContain(klass);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    }
  });

  it('rejects rather than guesses below the threshold', async () => {
    // Threshold at 1 forces every input under it.
    const always = new MockInferenceAdapter(1);
    const never = new MockInferenceAdapter(0);
    const image = bytes(5, 6, 7);

    expect((await always.diagnose(image)).class).toBe('rejected');
    expect((await never.diagnose(image)).class).not.toBe('rejected');
  });

  it('keeps the confidence when it rejects, so the snapshot can say how close it was', async () => {
    const adapter = new MockInferenceAdapter(1);
    const { confidence } = await adapter.diagnose(bytes(5, 6, 7));

    expect(confidence).toBeGreaterThan(0);
  });

  it('reaches every diagnosable class across ordinary inputs', async () => {
    const adapter = new MockInferenceAdapter(0);
    const seen = new Set<string>();

    for (let i = 0; i < 60; i += 1) {
      seen.add((await adapter.diagnose(bytes(i))).class);
    }

    expect(seen).toEqual(new Set(['healthy', 'early_blight', 'late_blight']));
  });

  it('stamps the model version on every diagnosis', async () => {
    expect((await new MockInferenceAdapter().diagnose(bytes(1))).modelVersion).toBe('mock-1');
  });
});
