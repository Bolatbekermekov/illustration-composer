import { describe, expect, it } from 'vitest';
import { loadTestLibrary } from '../test-support.ts';
import { analyzeByKeywords } from './keyword-analyzer.ts';
import { parseComponentNames } from './names.ts';
import { stem, tokenize } from './normalize.ts';

const lib = loadTestLibrary();
const ids = (items: Array<{ objectId: string }>) => items.map((i) => i.objectId);

describe('normalize', () => {
  it('tokenizes Russian text, folding ё and punctuation', () => {
    expect(tokenize('Ёлки, палки! Кошелёк-2')).toEqual(['елки', 'палки', 'кошелек', '2']);
  });

  it('stems inflected forms to a common base', () => {
    expect(stem('телефона')).toBe(stem('телефон'));
    expect(stem('монеты')).toBe(stem('монета'));
    expect(stem('наушниками')).toBe(stem('наушники'));
    expect(stem('лампой')).toBe(stem('лампа'));
  });
});

describe('parseComponentNames (scenario 2)', () => {
  it('reads a simple list', () => {
    expect(ids(parseComponentNames('телефон, пазл', lib).items)).toEqual(['phone', 'puzzle']);
  });

  it('understands inflections, synonyms and conjunctions', () => {
    expect(ids(parseComponentNames('Смартфона и пазлы + книжка', lib).items)).toEqual(['phone', 'puzzle', 'book']);
  });

  it('reads state modifiers and quantities', () => {
    const r = parseComponentNames('фоновая лампа, кошелёк, 2 монеты', lib);
    expect(r.items.map((i) => `${i.objectId}:${i.state}`)).toEqual(['lamp:background', 'wallet:main', 'coin:main', 'coin:main']);
    expect(r.items[0]?.lockState).toBe(true);
    expect(r.items[1]?.lockState).toBe(false);
  });

  it('accepts «на фоне» after the name', () => {
    const r = parseComponentNames('наушники на фоне; телефон', lib);
    expect(r.items.map((i) => `${i.objectId}:${i.state}`)).toEqual(['headphones:background', 'phone:main']);
  });

  it('tolerates a typo', () => {
    expect(ids(parseComponentNames('тлефон, кошелк', lib).items)).toEqual(['phone', 'wallet']);
  });

  it('reports names that are not in the library', () => {
    const r = parseComponentNames('самолёт, телефон', lib);
    expect(ids(r.items)).toEqual(['phone']);
    expect(r.unknown).toEqual(['самолёт']);
  });

  it('understands English names', () => {
    expect(ids(parseComponentNames('phone, coin and lamp', lib).items)).toEqual(['phone', 'coin', 'lamp']);
  });
});

describe('analyzeByKeywords (scenario 1, offline)', () => {
  it('maps a finance headline to money objects', () => {
    const a = analyzeByKeywords('Финансовая грамотность для подростков', lib);
    expect(ids(a.items).some((id) => id === 'coin' || id === 'wallet')).toBe(true);
    expect(a.items.find((i) => i.role === 'hero')?.objectId).toMatch(/coin|wallet/);
  });

  it('maps «идея» to the lamp', () => {
    expect(ids(analyzeByKeywords('Как найти идею для стартапа', lib).items)).toContain('lamp');
  });

  it('maps music and focus to headphones', () => {
    expect(ids(analyzeByKeywords('Музыка помогает сосредоточиться на работе', lib).items)).toContain('headphones');
  });

  it('maps a celebration to flowers', () => {
    expect(ids(analyzeByKeywords('Поздравляем с 8 марта!', lib).items)).toContain('flowers');
  });

  it('explains every pick', () => {
    const a = analyzeByKeywords('Подпишите договор онлайн', lib);
    expect(a.items.length).toBeGreaterThanOrEqual(2);
    for (const it of a.items) expect(it.reason.length).toBeGreaterThan(3);
    expect(a.source).toBe('keywords');
  });

  it('still proposes a scene when nothing matches, flagged as low confidence', () => {
    const a = analyzeByKeywords('Квантовая хромодинамика', lib);
    expect(a.items.length).toBeGreaterThanOrEqual(2);
    expect(a.confidence).toBe('low');
  });
});
