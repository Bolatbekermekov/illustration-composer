import { describe, expect, it } from 'vitest';
import { BUILTIN_SCHEMES, LAVENDER, MINT, PEACH } from '../domain/schemes.ts';
import { buildColorMap, buildStateMap, collectColors, recolorMarkup } from './recolor.ts';

describe('built-in schemes (values read from the Figma palette grids)', () => {
  it('has three schemes with eight role colours each', () => {
    expect(BUILTIN_SCHEMES.map((s) => s.id)).toEqual(['lavender', 'peach', 'mint']);
    for (const s of BUILTIN_SCHEMES) expect(Object.keys(s.colors)).toHaveLength(8);
  });
});

describe('buildColorMap', () => {
  it('maps every base colour to the colour of the same role in the target scheme', () => {
    const map = buildColorMap(LAVENDER, PEACH);
    expect(map.get('#D7CDF5')).toBe('#FDD7B9'); // bg1
    expect(map.get('#AA9BF0')).toBe('#FAC896'); // bg2
    expect(map.get('#7864D7')).toBe('#D27532'); // bg3
    expect(map.get('#181817')).toBe('#181817'); // ink
    expect(map.get('#F9ECB0')).toBe('#F9ECB0'); // obj1
    expect(map.get('#F9A3AA')).toBe('#80DADA'); // obj2
    expect(map.get('#FFE3E1')).toBe('#BEEBEB'); // obj3
    expect(map.get('#FFFFFF')).toBe('#FFFFFF'); // paper
  });

  it('is the identity when base and target are the same scheme', () => {
    const map = buildColorMap(MINT, MINT);
    for (const [from, to] of map) expect(to).toBe(from);
  });
});

describe('recolorMarkup', () => {
  const markup =
    '<g id="lamp"><path d="M10 10L20 20Z" fill="#d7cdf5"/><path d="M1 1" stroke="#F9A3AA" fill="none"/>' +
    '<stop offset="0" stop-color="#7864D7"/><path d="M2 2" fill="#123456"/></g>';

  it('rewrites fill, stroke and stop-color values through the map', () => {
    const out = recolorMarkup(markup, buildColorMap(LAVENDER, PEACH));
    expect(out).toContain('fill="#FDD7B9"');
    expect(out).toContain('stroke="#80DADA"');
    expect(out).toContain('stop-color="#D27532"');
  });

  it('keeps geometry, ids, "none" and colours that are not in the map untouched', () => {
    const out = recolorMarkup(markup, buildColorMap(LAVENDER, PEACH));
    expect(out).toContain('d="M10 10L20 20Z"');
    expect(out).toContain('id="lamp"');
    expect(out).toContain('fill="none"');
    expect(out).toContain('fill="#123456"');
  });

  it('collectColors counts canonical colour usage', () => {
    expect(collectColors(markup)).toEqual(new Map([
      ['#D7CDF5', 1],
      ['#F9A3AA', 1],
      ['#7864D7', 1],
      ['#123456', 1],
    ]));
  });
});

describe('buildStateMap (main → background state)', () => {
  it('turns outlines and dark tone into bg3 and everything else into bg1', () => {
    const map = buildStateMap(LAVENDER, 'background');
    expect(map.get('#181817')).toBe('#7864D7');
    expect(map.get('#7864D7')).toBe('#7864D7');
    for (const c of ['#D7CDF5', '#AA9BF0', '#F9ECB0', '#F9A3AA', '#FFE3E1', '#FFFFFF']) {
      expect(map.get(c)).toBe('#D7CDF5');
    }
  });

  it('is the identity for the main state', () => {
    const map = buildStateMap(LAVENDER, 'main');
    for (const [from, to] of map) expect(to).toBe(from);
  });
});
