import { describe, expect, it } from 'vitest';
import { deltaE, normalizeHex, relativeLightness } from './color.ts';

describe('normalizeHex', () => {
  it('canonicalises short, lowercase and named colours to #RRGGBB', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    expect(normalizeHex('d7cdf5')).toBe('#D7CDF5');
    expect(normalizeHex(' #d7cdf5 ')).toBe('#D7CDF5');
    expect(normalizeHex('white')).toBe('#FFFFFF');
    expect(normalizeHex('BLACK')).toBe('#000000');
  });

  it('returns null for values that are not a solid colour', () => {
    expect(normalizeHex('none')).toBeNull();
    expect(normalizeHex('url(#paint0)')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('#GGGGGG')).toBeNull();
  });
});

describe('perceptual helpers', () => {
  it('deltaE is zero for equal colours and large for black vs white', () => {
    expect(deltaE('#D7CDF5', '#D7CDF5')).toBe(0);
    expect(deltaE('#000000', '#FFFFFF')).toBeGreaterThan(90);
  });

  it('relativeLightness orders the lavender background ramp light → dark', () => {
    const l1 = relativeLightness('#D7CDF5');
    const l2 = relativeLightness('#AA9BF0');
    const l3 = relativeLightness('#7864D7');
    expect(l1).toBeGreaterThan(l2);
    expect(l2).toBeGreaterThan(l3);
  });
});
