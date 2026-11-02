import { describe, expect, it } from 'vitest';
import type { LayoutMode } from '../domain/types.ts';
import { loadTestLibrary } from '../test-support.ts';
import { autoLayout, type LayoutRequest } from './engine.ts';
import { analyzeLayout } from './score.ts';

const lib = loadTestLibrary();

const req = (items: LayoutRequest['items'], formatId: string, mode: LayoutMode = 'compact', seed = 7): LayoutRequest => {
  const f = lib.formats.find((x) => x.id === formatId);
  if (!f) throw new Error(formatId);
  return { items, width: f.width, height: f.height, mode, seed, variants: 3 };
};

const SETS: Array<LayoutRequest['items']> = [
  [{ objectId: 'phone', state: 'main' }, { objectId: 'puzzle', state: 'main' }],
  [{ objectId: 'wallet', state: 'main' }, { objectId: 'coin', state: 'main' }, { objectId: 'lamp', state: 'background' }],
  [{ objectId: 'headphones', state: 'main' }, { objectId: 'flowers', state: 'background' }],
  [{ objectId: 'lamp', state: 'main' }, { objectId: 'book', state: 'main' }, { objectId: 'pen', state: 'main' }],
  [{ objectId: 'phone', state: 'main' }, { objectId: 'coin', state: 'main' }, { objectId: 'wallet', state: 'main' }, { objectId: 'folder', state: 'background' }],
];

describe('autoLayout', () => {
  it('is deterministic for a given seed', () => {
    const a = autoLayout(req(SETS[0] as LayoutRequest['items'], 'square'), lib);
    const b = autoLayout(req(SETS[0] as LayoutRequest['items'], 'square'), lib);
    expect(a.map((v) => v.items)).toEqual(b.map((v) => v.items));
  });

  it('returns several distinct variants, best first', () => {
    const res = autoLayout(req(SETS[1] as LayoutRequest['items'], 'square'), lib);
    expect(res.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < res.length; i++) expect((res[i] as { score: number }).score).toBeGreaterThanOrEqual((res[i - 1] as { score: number }).score);
    const key = (v: (typeof res)[number]) => v.items.map((i) => `${Math.round(i.x / 50)},${Math.round(i.y / 50)}`).join('|');
    expect(new Set(res.map(key)).size).toBe(res.length);
  });

  for (const formatId of ['square', 'wide', 'tall', 'slide']) {
    it(`compact layouts in «${formatId}» keep the hero visible and main objects apart`, () => {
      for (const items of SETS) {
        const best = autoLayout(req(items, formatId, 'compact'), lib)[0];
        expect(best).toBeTruthy();
        const a = analyzeLayout(best?.items ?? [], { width: lib.formats.find((f) => f.id === formatId)?.width ?? 0, height: lib.formats.find((f) => f.id === formatId)?.height ?? 0 }, lib);
        const label = `${formatId}: ${items.map((i) => i.objectId).join('+')}`;
        expect(a.heroVisibility / a.heroAchievable, label).toBeGreaterThan(0.88);
        expect(a.maxMainOverlap, label).toBeLessThan(0.2);
        for (const v of a.background) expect(v.visibility, label).toBeGreaterThan(0.2);
      }
    });
  }

  it('puts background-state objects behind main objects', () => {
    const best = autoLayout(req(SETS[2] as LayoutRequest['items'], 'wide'), lib)[0];
    expect(best?.items[0]?.state).toBe('background');
  });

  it('heading mode leaves the heading zone free', () => {
    for (const formatId of ['wide', 'square', 'tall']) {
      const f = lib.formats.find((x) => x.id === formatId);
      const best = autoLayout(req(SETS[0] as LayoutRequest['items'], formatId, 'heading'), lib)[0];
      const a = analyzeLayout(best?.items ?? [], { width: f?.width ?? 0, height: f?.height ?? 0 }, lib, 'heading');
      expect(a.headingZoneCoverage, formatId).toBeLessThan(0.06);
    }
  });

  it('reproduces the designer arrangement when the same objects are requested', () => {
    const ex = lib.examples.find((e) => e.formatId === 'square' && e.items.length === 2 && e.items.some((i) => i.objectId === 'puzzle'));
    expect(ex).toBeTruthy();
    const res = autoLayout(
      { items: ex?.items.map((i) => ({ objectId: i.objectId, state: i.state })) ?? [], width: 1000, height: 1000, mode: 'compact', seed: 1, variants: 4 },
      lib,
    );
    expect(res.some((r) => r.source.startsWith('example'))).toBe(true);
  });

  it('designer examples score as good layouts under our quality function', () => {
    for (const ex of lib.examples) {
      const a = analyzeLayout(ex.items, ex, lib, 'offset', { heroBy: 'visibility' });
      expect(a.heroVisibility, ex.id).toBeGreaterThan(0.8);
      expect(a.score, ex.id).toBeLessThan(1.5);
    }
  });

  it('is fast enough for interactive use', () => {
    const t = performance.now();
    autoLayout(req(SETS[4] as LayoutRequest['items'], 'square', 'compact', 3), lib);
    expect(performance.now() - t).toBeLessThan(1500);
  });
});
