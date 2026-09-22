import { describe, expect, it } from 'vitest';
import { epochMillis } from './EpochMillis.js';
import { plotId } from './Ids.js';
import { createPlot } from './Plot.js';
import { InvalidPlotNameError } from '../errors/InvalidPlotNameError.js';

const at = epochMillis(1_790_028_000_000);

describe('createPlot', () => {
  it('trims the name instead of refusing it', () => {
    expect(createPlot({ id: plotId('p1'), name: '  Chacra de arriba  ', createdAt: at }).name).toBe(
      'Chacra de arriba',
    );
  });

  it('refuses a name that is empty or only spaces', () => {
    expect(() => createPlot({ id: plotId('p1'), name: '', createdAt: at })).toThrow(InvalidPlotNameError);
    expect(() => createPlot({ id: plotId('p1'), name: '   ', createdAt: at })).toThrow(InvalidPlotNameError);
  });

  it('refuses a name longer than the domain allows', () => {
    expect(() => createPlot({ id: plotId('p1'), name: 'a'.repeat(61), createdAt: at })).toThrow(
      InvalidPlotNameError,
    );
    expect(createPlot({ id: plotId('p1'), name: 'a'.repeat(60), createdAt: at }).name).toHaveLength(60);
  });
});
