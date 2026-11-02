import { createComposition, newUid } from '../composition/model.ts';
import { formatById } from '../domain/formats.ts';
import type { Composition, DecorSetId, LayoutMode, Library, SizeClass } from '../domain/types.ts';
import { autoLayout, pickDecor, type LayoutVariant } from '../layout/engine.ts';
import type { LayoutItemInput } from '../layout/score.ts';
import type { AnalysisItem, MetaphorAnalysis, MetaphorAnalyzer } from '../text/analysis.ts';
import { analyzeByKeywords } from '../text/keyword-analyzer.ts';
import { parseComponentNames } from '../text/names.ts';

export type { AnalysisItem, MetaphorAnalysis, MetaphorAnalyzer } from '../text/analysis.ts';

export class ComposeError extends Error {
  constructor(
    message: string,
    readonly code: 'EMPTY_TEXT' | 'NO_OBJECTS',
  ) {
    super(message);
    this.name = 'ComposeError';
  }
}

export interface ComposeRequest {
  /** metaphor — сценарий 1 (метафора/заголовок), names — сценарий 2 (названия компонентов). */
  mode: 'metaphor' | 'names';
  text: string;
  formatId?: string;
  width?: number;
  height?: number;
  size?: SizeClass;
  schemeId?: string;
  /** Режим раскладки; auto — варианты «собранно», «со смещением» и «под заголовок». */
  layout?: LayoutMode | 'auto';
  variants?: number;
  seed?: number;
  decor?: DecorSetId | 'none' | 'auto';
}

export interface ComposedVariant {
  composition: Composition;
  score: number;
  mode: LayoutMode;
  source: string;
}

export interface ComposeResult {
  analysis: MetaphorAnalysis;
  variants: ComposedVariant[];
}

const MAX_ITEMS = 5;

function sanitize(items: AnalysisItem[], lib: Library): AnalysisItem[] {
  const known = new Set(lib.objects.map((o) => o.id));
  const out = items
    .filter((i) => known.has(i.objectId))
    .map((i) => ({ ...i, state: i.state === 'background' ? ('background' as const) : ('main' as const) }))
    .slice(0, MAX_ITEMS);
  if (out.length && !out.some((i) => i.state === 'main')) out[0] = { ...(out[0] as AnalysisItem), state: 'main', role: 'hero' };
  return out;
}

async function analyze(
  req: ComposeRequest,
  lib: Library,
  analyzer: MetaphorAnalyzer | undefined,
  frame: { width: number; height: number },
): Promise<MetaphorAnalysis> {
  if (req.mode === 'names') {
    const parsed = parseComponentNames(req.text, lib);
    if (parsed.items.length === 0) {
      const names = lib.objects.map((o) => o.name).join(', ');
      const what = parsed.unknown.length ? `Не нашёл в библиотеке: ${parsed.unknown.join(', ')}. ` : '';
      throw new ComposeError(`${what}Доступные объекты: ${names}.`, 'NO_OBJECTS');
    }
    const firstMain = parsed.items.findIndex((i) => i.state === 'main');
    return {
      source: 'names',
      confidence: parsed.unknown.length ? 'medium' : 'high',
      unknown: parsed.unknown,
      summary: parsed.unknown.length ? `Не нашёл в библиотеке: ${parsed.unknown.join(', ')}` : '',
      items: parsed.items.map((i, k) => ({
        ...i,
        role: i.state === 'background' ? 'background' : k === firstMain ? 'hero' : 'support',
        reason: 'указано пользователем',
      })),
    };
  }
  if (!analyzer) return analyzeByKeywords(req.text, lib);
  try {
    const res = await analyzer.analyze(req.text, lib, frame);
    const items = sanitize(res.items, lib);
    if (items.length === 0) throw new Error('анализатор не выбрал ни одного объекта из библиотеки');
    return { ...res, items };
  } catch (e) {
    const fallback = analyzeByKeywords(req.text, lib);
    return { ...fallback, fallbackReason: `${analyzer.name}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Use-case «текст → композиции»: смысловой анализ (сценарий 1 или 2) → авто-раскладка в нескольких
 * режимах → готовые редактируемые композиции.
 */
export async function composeFromText(req: ComposeRequest, lib: Library, analyzer?: MetaphorAnalyzer): Promise<ComposeResult> {
  if (!req.text?.trim()) throw new ComposeError('Введите метафору, заголовок или названия объектов.', 'EMPTY_TEXT');
  const format = req.formatId ? formatById(req.formatId) : undefined;
  const width = req.width ?? format?.width ?? 1000;
  const height = req.height ?? format?.height ?? 1000;
  const analysis = await analyze(req, lib, analyzer, { width, height });
  const wanted = Math.max(1, Math.min(8, req.variants ?? 4));
  const modes: LayoutMode[] = !req.layout || req.layout === 'auto' ? ['compact', 'offset', 'heading'] : [req.layout];
  const items: LayoutItemInput[] = analysis.items.map((i) => ({
    objectId: i.objectId,
    state: i.state,
    ...(i.role === 'hero' ? { role: 'hero' as const } : {}),
    ...(i.lockState ? { lockState: true } : {}),
  }));

  const perMode = modes.map((mode, k) =>
    autoLayout({ items, width, height, mode, seed: (req.seed ?? 1) + k * 101, variants: Math.ceil(wanted / modes.length) + 1 }, lib),
  );
  const ordered: LayoutVariant[] = [];
  for (let round = 0; ordered.length < wanted && round < 8; round++) {
    for (const list of perMode) {
      const v = list[round];
      if (v && ordered.length < wanted) ordered.push(v);
    }
  }

  const variants = ordered.map((v) => {
    const base = createComposition({
      ...(format && !req.width ? { formatId: format.id } : { width, height }),
      size: req.size ?? 'L',
      schemeId: req.schemeId ?? 'lavender',
      decor: !req.decor || req.decor === 'auto' ? v.decor ?? pickDecor(v.items, lib) : req.decor,
    });
    const composition: Composition = {
      ...base,
      items: v.items.map((it) => ({ uid: newUid(), objectId: it.objectId, state: it.state, x: it.x, y: it.y, rotation: 0 })),
    };
    return { composition, score: v.score, mode: v.mode, source: v.source };
  });
  return { analysis, variants };
}
