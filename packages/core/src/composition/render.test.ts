import { Resvg } from '@resvg/resvg-js';
import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { MINT, PEACH } from '../domain/schemes.ts';
import { collectColors } from '../palette/recolor.ts';
import { loadTestLibrary } from '../test-support.ts';
import { addItem, createComposition, duplicateItem } from './model.ts';
import { readCompositionFromSvg, renderComposition } from './render.ts';

const lib = loadTestLibrary();
const pathsOf = (markup: string) => [...markup.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);

function sample(scheme = 'lavender', size: 'L' | 'S' = 'L') {
  let c = createComposition({ formatId: 'square', size, schemeId: scheme, decor: 'strokes' });
  c = addItem(c, 'flowers', 'background', { x: 300, y: 250 }).composition;
  c = addItem(c, 'phone', 'main', { x: 470, y: 615 }).composition;
  c = addItem(c, 'puzzle', 'main', { x: 600, y: 320 }).composition;
  return c;
}

describe('renderComposition', () => {
  it('produces well-formed SVG: frame clip, background, decor and one group per object', () => {
    const svg = renderComposition(sample(), lib);
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const root = doc.documentElement;
    expect(root?.getAttribute('viewBox')).toBe('0 0 1000 1000');
    const groups = [...doc.getElementsByTagName('g')].filter((g) => g.getAttribute('data-object'));
    expect(groups.map((g) => g.getAttribute('data-object'))).toEqual(['flowers', 'phone', 'puzzle']);
    expect(svg).toContain('clip-path="url(#');
    expect(svg).not.toMatch(/<image\b/);
  });

  it('copies object geometry byte-for-byte (objects are never modified)', () => {
    const svg = renderComposition(sample('peach'), lib);
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const phone = [...doc.getElementsByTagName('g')].find((g) => g.getAttribute('data-object') === 'phone');
    const libPhone = lib.objects.find((o) => o.id === 'phone')?.variants.L.main;
    expect(pathsOf(String(phone))).toEqual(pathsOf(libPhone?.markup ?? ''));
  });

  it('recolours into the selected scheme; background uses only background colours', () => {
    const svg = renderComposition(sample('mint'), lib);
    const allowed = new Set(Object.values(MINT.colors));
    for (const c of collectColors(svg).keys()) expect(allowed).toContain(c);
    expect(svg).toContain(`fill="${MINT.colors.bg1}"`);
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const flowers = [...doc.getElementsByTagName('g')].find((g) => g.getAttribute('data-object') === 'flowers');
    expect([...collectColors(String(flowers)).keys()].sort()).toEqual([MINT.colors.bg1, MINT.colors.bg3].sort());
  });

  it('uses an uploaded scheme passed explicitly', () => {
    const custom = { ...PEACH, id: 'custom-x', name: 'Своя', colors: { ...PEACH.colors, obj2: '#123456' } };
    const svg = renderComposition({ ...sample(), schemeId: 'custom-x' }, lib, { scheme: custom });
    expect(svg).toContain('#123456');
  });

  it('S size renders a half-size frame with the simplified assets', () => {
    const svg = renderComposition(sample('lavender', 'S'), lib);
    expect(svg).toMatch(/<svg[^>]*width="500"[^>]*height="500"/);
    const sPhone = lib.objects.find((o) => o.id === 'phone')?.variants.S.main;
    expect(svg).toContain(pathsOf(sPhone?.markup ?? '')[0]);
  });

  it('gives duplicated objects unique ids', () => {
    let c = createComposition({ formatId: 'square', size: 'L', schemeId: 'lavender' });
    const r = addItem(c, 'coin', 'main');
    c = duplicateItem(r.composition, r.uid).composition;
    const svg = renderComposition(c, lib);
    const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('places the object centre exactly at the item position', () => {
    let c = createComposition({ formatId: 'square', size: 'L', schemeId: 'lavender', decor: 'none' });
    c = addItem(c, 'lamp', 'main', { x: 400, y: 450 }).composition;
    const svg = renderComposition(c, lib, { background: false, clip: false });
    const box = new Resvg(svg).getBBox();
    expect(box).toBeTruthy();
    expect((box?.x ?? 0) + (box?.width ?? 0) / 2).toBeCloseTo(400, 0);
    expect((box?.y ?? 0) + (box?.height ?? 0) / 2).toBeCloseTo(450, 0);
  });

  it('embeds the composition so an exported SVG can be reopened for editing', () => {
    const c = sample('peach');
    expect(readCompositionFromSvg(renderComposition(c, lib))).toEqual(c);
  });
});
