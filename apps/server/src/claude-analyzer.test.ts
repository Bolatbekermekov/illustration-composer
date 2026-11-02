import { describe, expect, it } from 'vitest';
import { ClaudeMetaphorAnalyzer, type ParseFn } from './claude-analyzer.ts';
import { loadLibrary } from './library-repo.ts';

const lib = loadLibrary();

const reply = (parsed: unknown, stop_reason = 'end_turn') =>
  ({ stop_reason, model: 'claude-opus-5-5', parsed_output: parsed }) as Awaited<ReturnType<ParseFn>>;

describe('ClaudeMetaphorAnalyzer', () => {
  it('sends the whole catalog as the only allowed vocabulary and maps the structured answer', async () => {
    let seen: Parameters<ParseFn>[0] | undefined;
    const parse: ParseFn = async (params) => {
      seen = params;
      return reply({
        summary: 'Монета и кошелёк — накопления',
        confidence: 'high',
        items: [
          { objectId: 'coin', state: 'main', role: 'hero', reason: 'накопления' },
          { objectId: 'wallet', state: 'main', role: 'support', reason: 'бюджет' },
        ],
      });
    };
    const a = new ClaudeMetaphorAnalyzer({ parse, model: 'claude-opus-5-5' });
    const res = await a.analyze('Как накопить на мечту', lib);
    expect(res).toMatchObject({ source: 'claude', confidence: 'high', model: 'claude-opus-5-5' });
    expect(res.items.map((i) => i.objectId)).toEqual(['coin', 'wallet']);
    const system = JSON.stringify(seen?.system);
    for (const o of lib.objects) expect(system).toContain(o.id);
    expect(JSON.stringify(seen?.messages)).toContain('Как накопить на мечту');
  });

  it('caches answers for the same text', async () => {
    let calls = 0;
    const parse: ParseFn = async () => {
      calls++;
      return reply({ summary: '', confidence: 'medium', items: [{ objectId: 'lamp', state: 'main', role: 'hero', reason: 'идея' }] });
    };
    const a = new ClaudeMetaphorAnalyzer({ parse, model: 'm' });
    await a.analyze('Идея', lib);
    await a.analyze('  идея ', lib);
    expect(calls).toBe(1);
  });

  it('treats a refusal or an empty answer as an error (the use case then falls back)', async () => {
    const refusing = new ClaudeMetaphorAnalyzer({ parse: async () => reply(null, 'refusal'), model: 'm' });
    await expect(refusing.analyze('x', lib)).rejects.toThrow(/отказ/);
    const empty = new ClaudeMetaphorAnalyzer({ parse: async () => reply(null), model: 'm' });
    await expect(empty.analyze('y', lib)).rejects.toThrow();
  });
});
