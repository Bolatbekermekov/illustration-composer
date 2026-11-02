import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MetaphorAnalyzer } from '@ic/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';
import { loadLibrary } from './library-repo.ts';
import { PaletteStore } from './palettes-store.ts';

const MINT_SVG = `<svg xmlns="http://www.w3.org/2000/svg"><g>
<rect x="0" y="0" width="500" height="158" fill="#BEEBEB"/><rect x="500" y="0" width="500" height="158" fill="#FFD4F2"/>
<rect x="0" y="158" width="500" height="158" fill="#80DADA"/><rect x="500" y="158" width="500" height="158" fill="#6D7BFC"/>
<rect x="0" y="316" width="500" height="158" fill="#5ABEBE"/><rect x="500" y="316" width="500" height="158" fill="#B6C6FE"/>
<rect x="0" y="474" width="500" height="158" fill="#181817"/><rect x="500" y="474" width="500" height="158" fill="#FFFFFF"/>
</g></svg>`;

const fakeLlm: MetaphorAnalyzer = {
  name: 'fake-claude',
  analyze: async () => ({
    source: 'claude',
    confidence: 'high',
    summary: 'Идея → лампа',
    model: 'fake',
    items: [
      { objectId: 'lamp', state: 'main', role: 'hero', reason: 'идея' },
      { objectId: 'pen', state: 'main', role: 'support', reason: 'записать' },
    ],
  }),
};

let dir: string;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ic-server-'));
  app = await buildApp({
    library: loadLibrary(),
    analyzer: fakeLlm,
    palettes: new PaletteStore(join(dir, 'palettes.json')),
    llm: { enabled: true, model: 'fake' },
  });
});

afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('HTTP API', () => {
  it('GET /api/health reports LLM status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, llm: { enabled: true } });
  });

  it('GET /api/library returns objects, schemes, formats and decor', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/library' });
    expect(res.statusCode).toBe(200);
    const lib = res.json();
    expect(lib.objects).toHaveLength(10);
    expect(lib.schemes.map((s: { id: string }) => s.id)).toEqual(['lavender', 'peach', 'mint']);
  });

  it('POST /api/compose (names) returns editable variants', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/compose',
      payload: { mode: 'names', text: 'телефон, 2 монеты', formatId: 'square', variants: 2 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.variants).toHaveLength(2);
    expect(body.variants[0].composition.items.map((i: { objectId: string }) => i.objectId).sort()).toEqual(['coin', 'coin', 'phone']);
  });

  it('POST /api/compose (names) explains unknown objects with 422', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/compose', payload: { mode: 'names', text: 'жираф' } });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatch(/жираф/);
  });

  it('POST /api/compose (metaphor) goes through the LLM analyzer', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/compose', payload: { mode: 'metaphor', text: 'Идея на миллион', variants: 1 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().analysis).toMatchObject({ source: 'claude', summary: 'Идея → лампа' });
  });

  it('POST /api/compose validates the body', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/compose', payload: { mode: 'poem', text: 1 } });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/layout re-arranges given objects', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/layout',
      payload: { items: [{ objectId: 'phone', state: 'main' }, { objectId: 'puzzle', state: 'main' }], width: 1200, height: 630, mode: 'heading', variants: 2 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().variants.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/render exports SVG for download', async () => {
    const compose = await app.inject({ method: 'POST', url: '/api/compose', payload: { mode: 'names', text: 'кошелёк', variants: 1 } });
    const composition = compose.json().variants[0].composition;
    const res = await app.inject({ method: 'POST', url: '/api/render?download=1', payload: { composition } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/svg\+xml/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.body).toContain('data-object="wallet"');
  });

  it('POST /api/palettes stores an uploaded palette and lists it', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/palettes', payload: { content: MINT_SVG, filename: 'Моя мята.svg' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().scheme.name).toBe('Моя мята');
    const list = await app.inject({ method: 'GET', url: '/api/palettes' });
    expect(list.json().palettes).toHaveLength(1);
  });

  it('POST /api/palettes rejects a palette that breaks the scheme rules', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/palettes',
      payload: { content: '#BEEBEB #80DADA #5ABEBE #80DADA #6D7BFC #B6C6FE', filename: 'bad.txt' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatch(/фон/);
  });
});
