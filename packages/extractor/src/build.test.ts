import { resolve } from 'node:path';
import {
  BASE_SCHEME,
  CATALOG,
  LAVENDER,
  PEACH,
  buildColorMap,
  buildStateMap,
  collectColors,
  maskArea,
  recolorMarkup,
  type Library,
  type ObjectVariant,
} from '@ic/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildLibrary, FIGMA_EXPORT_DIR, standaloneSvg } from './build.ts';
import type { Element } from '@xmldom/xmldom';
import { loadFigmaSvg, findById } from './figma.ts';
import { renderRegion } from './raster.ts';

let lib: Library;
const variants = (): ObjectVariant[] =>
  lib.objects.flatMap((o) => (['L', 'S'] as const).flatMap((s) => [o.variants[s].main, o.variants[s].background]));
const variant = (id: string, size: 'L' | 'S', state: 'main' | 'background') => {
  const o = lib.objects.find((x) => x.id === id);
  if (!o) throw new Error(`no ${id}`);
  return o.variants[size][state];
};
const pathsOf = (markup: string) => [...markup.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);

beforeAll(() => {
  lib = buildLibrary();
}, 60_000);

describe('objects', () => {
  it('resolves all 10 catalog objects in both sizes and both states', () => {
    expect(lib.objects.map((o) => o.id).sort()).toEqual(CATALOG.map((c) => c.id).sort());
    expect(variants()).toHaveLength(40);
  });

  it('keeps Figma sizes: L phone is 796.5 × 461.7 and S is half of it', () => {
    const l = variant('phone', 'L', 'main').box;
    const s = variant('phone', 'S', 'main').box;
    expect(Math.abs(l.width - 796.5)).toBeLessThan(2);
    expect(Math.abs(l.height - 461.7)).toBeLessThan(2);
    expect(s.width / l.width).toBeCloseTo(0.5, 1);
  });

  it('uses only colours of the base scheme', () => {
    const allowed = new Set(Object.values(BASE_SCHEME.colors));
    for (const v of variants()) {
      for (const c of collectColors(v.markup).keys()) expect(allowed, `${v.objectId}/${v.size}/${v.state}: ${c}`).toContain(c);
    }
  });

  it('background variants are two-tone: bg1 fill and bg3 outline', () => {
    for (const v of variants().filter((x) => x.state === 'background')) {
      expect([...collectColors(v.markup).keys()].sort()).toEqual([LAVENDER.colors.bg3, LAVENDER.colors.bg1].sort());
    }
  });

  it('L background variant follows the two-tone rule path by path (designer exceptions ≤ 2 paths)', () => {
    const toBg = buildStateMap(LAVENDER, 'background');
    const fills = (markup: string) => [...markup.matchAll(/<path\b[^>]*?\bfill="(#[0-9A-F]{6})"/g)].map((m) => m[1] as string);
    let total = 0;
    let deviations = 0;
    for (const o of lib.objects) {
      const main = fills(o.variants.L.main.markup);
      const bg = fills(o.variants.L.background.markup);
      expect(bg.length, o.id).toBe(main.length);
      const off = main.filter((c, i) => (toBg.get(c) ?? c) !== bg[i]).length;
      expect(off, o.id).toBeLessThanOrEqual(2);
      total += main.length;
      deviations += off;
    }
    expect(deviations / total).toBeLessThan(0.01);
  });

  it('copies path geometry byte-for-byte from the Figma export', () => {
    const fig = loadFigmaSvg(resolve(FIGMA_EXPORT_DIR, 'library-L.svg'));
    const src = findById(fig, 'Телефон');
    expect(src).toBeTruthy();
    const original = [...(src as Element).getElementsByTagName('path')].map((p) => p.getAttribute('d'));
    expect(pathsOf(variant('phone', 'L', 'main').markup)).toEqual(original);
  });

  it('renders pixel-identical to the original Figma group (cleaning changes nothing visible)', () => {
    const cases = [
      ['lamp', 'L', 'Лампа'],
      ['flowers', 'L', 'Group 2136136344'],
      ['book', 'S', 'Group 2136136335'],
    ] as const;
    for (const [id, size, figmaId] of cases) {
      const v = variant(id, size, 'main');
      const fig = loadFigmaSvg(resolve(FIGMA_EXPORT_DIR, `library-${size}.svg`));
      const original = findById(fig, figmaId);
      expect(original, figmaId).toBeTruthy();
      const source = `<svg xmlns="http://www.w3.org/2000/svg" fill="none">${String(original)}</svg>`;
      const a = renderRegion(source, v.box, 200);
      const b = renderRegion(standaloneSvg(v), v.box, 200);
      let diff = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
      expect(diff, `${id}/${size}`).toBe(0);
    }
  });

  it('ignores stray specks in the source vectors when measuring the visual box (coin)', () => {
    const coin = variant('coin', 'L', 'main');
    expect(coin.box.height).toBeLessThan(150);
    expect(coin.markup).toContain('4271.6'); // сама «пылинка» остаётся в разметке — объект не меняем
  });

  it('builds silhouette masks that cover a plausible share of the box', () => {
    for (const v of variants()) {
      const ratio = maskArea(v.mask) / (v.mask.cols * v.mask.rows);
      expect(ratio, `${v.objectId}/${v.size}/${v.state}`).toBeGreaterThan(0.2);
      expect(ratio).toBeLessThan(0.97);
      expect(v.mask.cols).toBe(Math.ceil(v.box.width / v.mask.cell));
    }
  });
});

describe('recolouring matches the colours used in the Figma «SVG-drop» frames', () => {
  it('lavender → peach lamp has the same colour histogram as the peach lamp in «Под заголовок · L»', () => {
    const drop = loadFigmaSvg(resolve(FIGMA_EXPORT_DIR, 'svg-drop/heading-L.svg'));
    const lampGroup = [...drop.doc.getElementsByTagName('g')].find((g) => (g.getAttribute('id') ?? '').startsWith('lamp-'));
    expect(lampGroup).toBeTruthy();
    const expected = collectColors(String(lampGroup));
    const ours = collectColors(recolorMarkup(variant('lamp', 'L', 'main').markup, buildColorMap(LAVENDER, PEACH)));
    expect(ours).toEqual(expected);
  });
});

describe('decor from the «Фон» tiles', () => {
  it('extracts both decor sets for both sizes in background colours only', () => {
    const allowed = new Set([LAVENDER.colors.bg1, LAVENDER.colors.bg2, LAVENDER.colors.bg3, LAVENDER.colors.paper]);
    for (const size of ['L', 'S'] as const) {
      const decor = lib.decor[size];
      expect(decor.filter((d) => d.set === 'strokes').length).toBeGreaterThanOrEqual(4);
      expect(decor.filter((d) => d.set === 'plane').length).toBeGreaterThanOrEqual(2);
      for (const d of decor) for (const c of collectColors(d.markup).keys()) expect(allowed).toContain(c);
    }
  });
});

describe('designer examples', () => {
  it('recovers 18 example layouts: six per format', () => {
    expect(lib.examples).toHaveLength(18);
    const byFormat = new Map<string, number>();
    for (const e of lib.examples) byFormat.set(e.formatId, (byFormat.get(e.formatId) ?? 0) + 1);
    expect(Object.fromEntries(byFormat)).toEqual({ square: 6, wide: 6, tall: 6 });
    for (const e of lib.examples) expect(e.items.length).toBeGreaterThanOrEqual(2);
  });

  it('places the phone of the square «phone + puzzle» example where the designer put it', () => {
    const ex = lib.examples.find(
      (e) => e.formatId === 'square' && e.items.some((i) => i.objectId === 'puzzle') && e.items.some((i) => i.objectId === 'phone'),
    );
    expect(ex).toBeTruthy();
    const phone = ex?.items.find((i) => i.objectId === 'phone');
    expect(phone?.x).toBeCloseTo(73 + 796.5 / 2, -1);
    expect(phone?.y).toBeCloseTo(384 + 461.7 / 2, -1);
  });

  it('recognises background-state objects in the examples', () => {
    const states = lib.examples.flatMap((e) => e.items.map((i) => `${i.objectId}:${i.state}`));
    expect(states).toContain('lamp:background');
    expect(states).toContain('flowers:background');
    expect(states).toContain('book:background');
  });
});
