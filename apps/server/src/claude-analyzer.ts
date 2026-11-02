import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { AnalysisContext, AnalysisItem, Library, MetaphorAnalysis, MetaphorAnalyzer } from '@ic/core';
import { z } from 'zod';

/**
 * Адаптер порта MetaphorAnalyzer на Claude API.
 * Модель выбирает объекты ТОЛЬКО из каталога библиотеки: id объектов передаются как enum в схеме
 * структурированного вывода, поэтому «придумать» новый объект она не может технически.
 */

const KIND_LABEL = {
  surface: 'поверхность — на неё можно положить плоский предмет',
  flat: 'плоский предмет — может лежать на поверхности',
  standing: 'объёмный предмет — стоит рядом',
} as const;

function schemaFor(lib: Library) {
  const ids = lib.objects.map((o) => o.id) as [string, ...string[]];
  return z.object({
    summary: z.string().describe('1–2 предложения: как метафора читается в сцене'),
    confidence: z.enum(['high', 'medium', 'low']),
    items: z
      .array(
        z.object({
          objectId: z.enum(ids),
          state: z.enum(['main', 'background']),
          role: z.enum(['hero', 'support', 'background']),
          reason: z.string().describe('коротко по-русски: какой смысл объект передаёт'),
        }),
      )
      .describe('2–4 объекта'),
  });
}

export function systemPrompt(lib: Library): string {
  const catalog = lib.objects
    .map((o) => {
      const b = o.variants.L.main.box;
      return `- ${o.id} — «${o.name}», ≈${Math.round(b.width)}×${Math.round(b.height)} px (${KIND_LABEL[o.kind]}). Смыслы: ${o.meanings.join(', ')}.`;
    })
    .join('\n');
  return [
    'Ты — арт-директор. По заголовку или метафоре подбираешь объекты для изометрической иллюстрации',
    'из ФИКСИРОВАННОЙ библиотеки. Новых объектов не существует: используй только id из каталога.',
    '',
    'Каталог:',
    catalog,
    '',
    'Правила библиотеки:',
    '- 2–3 главных объекта (state "main") и при необходимости 1 фоновый (state "background") для глубины.',
    '- Ровно один герой (role "hero") — объект, который точнее всего передаёт смысл; он будет виден целиком.',
    '- Фоновый объект — контекст и атмосфера, не главный смысл; он крупный и частично уходит за край кадра.',
    '  Для фона подходят крупные: book, folder, lamp, flowers, headphones.',
    '- Плоские предметы (phone, puzzle, coin, wallet, pen) естественно лежат на поверхностях (book, folder).',
    '- Буквальные совпадения слов не обязательны: ищи визуальную метафору (идея → лампа, команда → пазлы).',
    '- Не больше 4 объектов. Повтор объекта — только если он усиливает смысл (например, несколько монет).',
    '- Объекты не масштабируются: размеры выше — их настоящий размер в кадре. Учитывай формат кадра из запроса:',
    '  в низкий широкий кадр помещается меньше крупных объектов; лишнее лучше отдать в фон или не брать.',
    '',
    'Ответь строго по схеме. reason — коротко по-русски.',
  ].join('\n');
}

/** Минимальный контракт вызова SDK — подменяется в тестах. */
export type ParseFn = (
  params: MessageCreateParamsNonStreaming,
) => Promise<{ stop_reason: string | null; model: string; parsed_output: unknown }>;

export interface ClaudeAnalyzerOptions {
  parse: ParseFn;
  model: string;
  effort?: 'low' | 'medium' | 'high';
  cacheSize?: number;
}

export class ClaudeMetaphorAnalyzer implements MetaphorAnalyzer {
  readonly name = 'claude';
  private readonly cache = new Map<string, MetaphorAnalysis>();

  constructor(private readonly opts: ClaudeAnalyzerOptions) {}

  async analyze(text: string, lib: Library, context?: AnalysisContext): Promise<MetaphorAnalysis> {
    const frame = context ? `${Math.round(context.width)}×${Math.round(context.height)}` : '1000×1000';
    const key = `${frame}|${text.trim().toLowerCase().replace(/\s+/g, ' ')}`;
    const hit = this.cache.get(key);
    if (hit) return hit;

    const schema = schemaFor(lib);
    const response = await this.opts.parse({
      model: this.opts.model,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: systemPrompt(lib), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Заголовок или метафора: «${text.trim()}»\nКадр: ${frame} px.` }],
      output_config: { effort: this.opts.effort ?? 'low', format: betaZodOutputFormat(schema) },
    });
    if (response.stop_reason === 'refusal') throw new Error('модель вернула отказ (refusal)');
    const parsed = schema.safeParse(response.parsed_output);
    if (!parsed.success) throw new Error('ответ модели не соответствует схеме');
    const items: AnalysisItem[] = parsed.data.items.map((i) => ({
      objectId: i.objectId,
      state: i.state,
      role: i.state === 'background' ? 'background' : i.role === 'background' ? 'support' : i.role,
      reason: i.reason,
    }));
    if (items.length === 0) throw new Error('модель не выбрала ни одного объекта');

    const result: MetaphorAnalysis = {
      items,
      summary: parsed.data.summary,
      confidence: parsed.data.confidence,
      source: 'claude',
      model: response.model,
    };
    this.cache.set(key, result);
    if (this.cache.size > (this.opts.cacheSize ?? 200)) this.cache.delete(this.cache.keys().next().value as string);
    return result;
  }
}

/** Реальный вызов: таймаут и одна повторная попытка; типизированные ошибки SDK пробрасываются. */
export function sdkParse(client: Anthropic, timeoutMs: number): ParseFn {
  return async (params) => {
    const r = await client.beta.messages.parse(params, { timeout: timeoutMs, maxRetries: 1 });
    return { stop_reason: r.stop_reason, model: r.model, parsed_output: r.parsed_output };
  };
}
