import { describe, expect, it } from 'vitest';
import { loadTestLibrary } from '../test-support.ts';
import { ComposeError, composeFromText, type MetaphorAnalyzer } from './compose.ts';

const lib = loadTestLibrary();

describe('composeFromText', () => {
  it('scenario 2: names → several editable compositions in the requested frame, size and scheme', async () => {
    const res = await composeFromText(
      { mode: 'names', text: 'телефон, пазл', formatId: 'wide', size: 'S', schemeId: 'mint', variants: 3, seed: 5 },
      lib,
    );
    expect(res.variants.length).toBe(3);
    for (const v of res.variants) {
      expect(v.composition).toMatchObject({ width: 1200, height: 630, size: 'S', schemeId: 'mint' });
      expect(v.composition.items.map((i) => i.objectId).sort()).toEqual(['phone', 'puzzle']);
      expect(new Set(v.composition.items.map((i) => i.uid)).size).toBe(2);
    }
  });

  it('scenario 2: explains when nothing from the library was recognised', async () => {
    await expect(composeFromText({ mode: 'names', text: 'самолёт, жираф' }, lib)).rejects.toThrow(ComposeError);
    await expect(composeFromText({ mode: 'names', text: 'самолёт, жираф' }, lib)).rejects.toThrow(/Телефон/);
  });

  it('scenario 1: uses the injected analyzer (e.g. Claude) and passes its explanation through', async () => {
    const analyzer: MetaphorAnalyzer = {
      name: 'fake-llm',
      analyze: async () => ({
        source: 'claude',
        confidence: 'high',
        summary: 'Идея → лампа, учёба → книга',
        items: [
          { objectId: 'lamp', state: 'main', role: 'hero', reason: 'идея' },
          { objectId: 'book', state: 'background', role: 'background', reason: 'учёба' },
        ],
      }),
    };
    const res = await composeFromText({ mode: 'metaphor', text: 'Учимся с идеей', variants: 2 }, lib, analyzer);
    expect(res.analysis.source).toBe('claude');
    expect(res.analysis.summary).toContain('лампа');
    expect(res.variants[0]?.composition.items.map((i) => `${i.objectId}:${i.state}`).sort()).toEqual(['book:background', 'lamp:main']);
  });

  it('scenario 1: falls back to offline analysis when the analyzer fails', async () => {
    const broken: MetaphorAnalyzer = { name: 'broken', analyze: async () => Promise.reject(new Error('timeout')) };
    const res = await composeFromText({ mode: 'metaphor', text: 'Деньги любят счёт', variants: 1 }, lib, broken);
    expect(res.analysis.source).toBe('keywords');
    expect(res.analysis.fallbackReason).toMatch(/timeout/);
    expect(res.variants.length).toBe(1);
  });

  it('ignores analyzer picks that are not in the library', async () => {
    const analyzer: MetaphorAnalyzer = {
      name: 'hallucinating',
      analyze: async () => ({
        source: 'claude',
        confidence: 'high',
        summary: '',
        items: [
          { objectId: 'rocket', state: 'main', role: 'hero', reason: '?' },
          { objectId: 'phone', state: 'main', role: 'support', reason: 'связь' },
        ],
      }),
    };
    const res = await composeFromText({ mode: 'metaphor', text: 'Полетели', variants: 1 }, lib, analyzer);
    expect(res.variants[0]?.composition.items.map((i) => i.objectId)).toEqual(['phone']);
  });
});
