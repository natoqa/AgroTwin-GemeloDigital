import { describe, expect, it } from 'vitest';
import { epochMillis } from './EpochMillis.js';
import { plotId } from './Ids.js';
import { createPlot, updatePlotDetails } from './Plot.js';
import { InvalidAreaError } from '../errors/InvalidAreaError.js';
import { InvalidCoordinatesError } from '../errors/InvalidCoordinatesError.js';
import { InvalidPlotNameError } from '../errors/InvalidPlotNameError.js';

const at = epochMillis(1_790_028_000_000);
const base = { id: plotId('p1'), name: 'Chacra de arriba', createdAt: at };

describe('createPlot', () => {
  it('trims the name instead of refusing it', () => {
    expect(createPlot({ ...base, name: '  Chacra de arriba  ' }).name).toBe('Chacra de arriba');
  });

  it('refuses a name that is empty or only spaces', () => {
    expect(() => createPlot({ ...base, name: '' })).toThrow(InvalidPlotNameError);
    expect(() => createPlot({ ...base, name: '   ' })).toThrow(InvalidPlotNameError);
  });

  it('refuses a name longer than the domain allows', () => {
    expect(() => createPlot({ ...base, name: 'a'.repeat(61) })).toThrow(InvalidPlotNameError);
    expect(createPlot({ ...base, name: 'a'.repeat(60) }).name).toHaveLength(60);
  });

  it('leaves area and location absent rather than defaulting them', () => {
    const plot = createPlot(base);
    expect(plot.area).toBeUndefined();
    expect(plot.location).toBeUndefined();
    expect('area' in plot).toBe(false);
  });

  it('keeps an area and a location when the farmer knows them', () => {
    const plot = createPlot({
      ...base,
      area: 0.75,
      location: { latitude: -8.11, longitude: -78.01, altitude: 3100 },
    });

    expect(plot.area).toBe(0.75);
    expect(plot.location).toEqual({ latitude: -8.11, longitude: -78.01, altitude: 3100 });
  });

  it('refuses an area that cannot be a plot', () => {
    expect(() => createPlot({ ...base, area: 0 })).toThrow(InvalidAreaError);
    expect(() => createPlot({ ...base, area: -1 })).toThrow(InvalidAreaError);
    expect(() => createPlot({ ...base, area: 5000 })).toThrow(InvalidAreaError);
  });

  it('refuses coordinates that are not on the Earth', () => {
    expect(() => createPlot({ ...base, location: { latitude: 91, longitude: 0 } })).toThrow(
      InvalidCoordinatesError,
    );
    expect(() => createPlot({ ...base, location: { latitude: 0, longitude: 181 } })).toThrow(
      InvalidCoordinatesError,
    );
    expect(() =>
      createPlot({ ...base, location: { latitude: 0, longitude: 0, altitude: 20_000 } }),
    ).toThrow(InvalidCoordinatesError);
  });
});

describe('updatePlotDetails', () => {
  it('adds a location to a plot registered without one', () => {
    const plot = createPlot(base);

    const updated = updatePlotDetails(plot, {
      location: { latitude: -8.11, longitude: -78.01, altitude: 3100 },
    });

    expect(updated.location?.latitude).toBe(-8.11);
    expect(updated.id).toBe(plot.id);
    expect(updated.createdAt).toBe(plot.createdAt);
  });

  it('leaves untouched fields alone when only the name changes', () => {
    const plot = createPlot({ ...base, area: 0.5, location: { latitude: -8, longitude: -78 } });

    const updated = updatePlotDetails(plot, { name: 'Chacra de abajo' });

    expect(updated.name).toBe('Chacra de abajo');
    expect(updated.area).toBe(0.5);
    expect(updated.location).toEqual({ latitude: -8, longitude: -78 });
  });

  it('clears a field only when asked explicitly with null', () => {
    const plot = createPlot({ ...base, area: 0.5, location: { latitude: -8, longitude: -78 } });

    const cleared = updatePlotDetails(plot, { area: null, location: null });

    expect(cleared.area).toBeUndefined();
    expect(cleared.location).toBeUndefined();
  });

  it('refuses an update that would make the plot invalid', () => {
    const plot = createPlot(base);

    expect(() => updatePlotDetails(plot, { name: '  ' })).toThrow(InvalidPlotNameError);
    expect(() => updatePlotDetails(plot, { area: -2 })).toThrow(InvalidAreaError);
  });
});
