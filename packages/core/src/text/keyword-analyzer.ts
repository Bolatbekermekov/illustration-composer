import type { Library, LibraryObject } from '../domain/types.ts';
import type { AnalysisItem, MetaphorAnalysis, MetaphorAnalyzer } from './analysis.ts';
import { STOPWORDS, stemVariants, tokenize, variantsMatch } from './normalize.ts';

/** Естественные пары объектов (как в эталонах дизайнера) — чем дополнить сцену из одного объекта. */
const AFFINITY: Record<string, string[]> = {
  coin: ['wallet', 'folder'],
  wallet: ['coin', 'phone'],
  phone: ['puzzle', 'headphones'],
  puzzle: ['phone', 'book'],
  book: ['pen', 'lamp'],
  pen: ['book', 'folder'],
  lamp: ['book', 'pen'],
  folder: ['pen', 'coin'],
  headphones: ['phone', 'flowers'],
  flowers: ['book', 'headphones'],
};

/** Нейтральные сцены, если ассоциаций не нашлось (выбираются детерминированно по тексту). */
const FALLBACK_SCENES: string[][] = [
  ['phone', 'puzzle'],
  ['lamp', 'book', 'pen'],
  ['wallet', 'coin'],
  ['headphones', 'flowers'],
];

interface Scored {
  obj: LibraryObject;
  score: number;
  hits: string[];
  named: boolean;
}

function scoreObjects(text: string, lib: Library): Scored[] {
  const words = tokenize(text).filter((w) => !STOPWORDS.has(w));
  const variants = words.map(stemVariants);
  const has = (word: string, allowPrefix: boolean) => {
    const v = stemVariants(word);
    return variants.some((t) => {
      const m = variantsMatch(t, v);
      return m === 'exact' || (allowPrefix && m === 'prefix');
    });
  };
  return lib.objects
    .map((obj) => {
      let score = 0;
      const hits: string[] = [];
      let named = false;
      for (const alias of [obj.name, ...obj.aliases]) {
        const parts = tokenize(alias);
        if (parts.every((p) => has(p, false))) {
          named = true;
          hits.push(alias);
        }
      }
      if (named) score += 3;
      for (const meaning of obj.meanings) {
        const parts = tokenize(meaning).filter((w) => !STOPWORDS.has(w));
        if (parts.length === 0) continue;
        if (parts.every((p) => has(p, true))) {
          score += parts.length > 1 ? 2.5 : 1.5;
          hits.push(meaning);
        }
      }
      return { obj, score, hits: [...new Set(hits)], named };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

const isBig = (o: LibraryObject) => o.kind !== 'flat';

/**
 * Офлайн-анализ метафоры/заголовка: совпадения со смыслами и синонимами каталога (со стеммингом),
 * дополнение сцены естественными парами, фоновый объект для глубины. Работает без сети и ключей.
 */
export function analyzeByKeywords(text: string, lib: Library): MetaphorAnalysis {
  const scored = scoreObjects(text, lib);
  const byId = new Map(lib.objects.map((o) => [o.id, o]));
  const items: AnalysisItem[] = [];
  const add = (id: string, role: AnalysisItem['role'], reason: string) => {
    if (!byId.has(id) || items.some((i) => i.objectId === id)) return;
    items.push({ objectId: id, state: role === 'background' ? 'background' : 'main', role, reason });
  };

  if (scored.length === 0) {
    const tokens = tokenize(text);
    let h = 0;
    for (const ch of tokens.join(' ')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const scene = FALLBACK_SCENES[h % FALLBACK_SCENES.length] as string[];
    scene.forEach((id, i) => add(id, i === 0 ? 'hero' : 'support', 'нейтральная сцена из библиотеки'));
    return {
      items,
      source: 'keywords',
      confidence: 'low',
      summary:
        'Явных ассоциаций с объектами библиотеки не нашлось — предложена нейтральная сцена. ' +
        'Уточните заголовок или перечислите объекты (сценарий «По названиям»).',
    };
  }

  const top = (scored[0] as Scored).score;
  const mains = scored.filter((s) => s.score >= Math.max(1, top * 0.4)).slice(0, 3);
  // Герой — названный прямо или самый «сильный» предмет (не поверхность, если есть выбор).
  const hero = mains.find((s) => s.named) ?? mains.find((s) => s.obj.kind !== 'surface') ?? (mains[0] as Scored);
  add(hero.obj.id, 'hero', `«${hero.hits.slice(0, 3).join('», «')}»`);
  for (const s of mains) if (s !== hero) add(s.obj.id, 'support', `«${s.hits.slice(0, 3).join('», «')}»`);

  if (items.length === 1) {
    const pair = (AFFINITY[hero.obj.id] ?? []).find((id) => !items.some((i) => i.objectId === id));
    if (pair) add(pair, 'support', `естественная пара к объекту «${hero.obj.name}»`);
  }
  // Фон для глубины: следующий по смыслу крупный объект или крупная пара героя.
  if (items.length < 4) {
    const rest = scored.find((s) => !items.some((i) => i.objectId === s.obj.id) && isBig(s.obj));
    const pair = (AFFINITY[hero.obj.id] ?? []).map((id) => byId.get(id)).find((o) => o && isBig(o) && !items.some((i) => i.objectId === o.id));
    if (rest) add(rest.obj.id, 'background', `фон: «${rest.hits.slice(0, 2).join('», «')}»`);
    else if (pair && items.length < 3) add(pair.id, 'background', 'фон для глубины сцены');
  }

  const confidence = top >= 3 ? 'high' : top >= 1.5 ? 'medium' : 'low';
  const summary = items
    .filter((i) => i.role !== 'background' || i.reason.startsWith('фон: «'))
    .map((i) => `${byId.get(i.objectId)?.name}${i.role === 'background' ? ' (фон)' : ''} ← ${i.reason}`)
    .join('; ');
  return { items, source: 'keywords', confidence, summary };
}

export const keywordAnalyzer: MetaphorAnalyzer = {
  name: 'keywords',
  analyze: async (text, lib) => analyzeByKeywords(text, lib),
};
