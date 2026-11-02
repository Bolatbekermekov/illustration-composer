import type { Library, ObjectState } from '../domain/types.ts';
import { STOPWORDS, stem, stemVariants, tokenizeWithOriginal, variantsMatch } from './normalize.ts';

export interface ParsedItem {
  objectId: string;
  state: ObjectState;
  /** Состояние указано явно («фоновая лампа») — раскладка его не меняет. */
  lockState: boolean;
}

export interface ParsedNames {
  items: ParsedItem[];
  /** Слова, которых нет в библиотеке (в исходном написании). */
  unknown: string[];
}

const BACKGROUND_WORDS = ['фон', 'фоновый', 'фоновая', 'фоновое', 'фоном', 'фоне', 'сзади', 'позади', 'background', 'bg', 'back'];
const MAIN_WORDS = ['главный', 'главная', 'главное', 'главным', 'основной', 'основная', 'акцент', 'акцентом', 'передний', 'main', 'hero'];
const NUMBERS: Record<string, number> = {
  один: 1, одна: 1, одно: 1, два: 2, две: 2, пара: 2, пару: 2, три: 3, четыре: 4, one: 1, two: 2, three: 3, four: 4,
};
const MAX_ITEMS = 6;

const bgStems = new Set(BACKGROUND_WORDS.map(stem));
const mainStems = new Set(MAIN_WORDS.map(stem));

interface AliasIndex {
  objectId: string;
  variants: string[];
}

function buildIndex(lib: Library): AliasIndex[] {
  const out: AliasIndex[] = [];
  for (const o of lib.objects) {
    for (const alias of [o.name, ...o.aliases]) {
      const words = alias.split(/\s+/);
      // Многословные синонимы («настольная лампа») индексируем по последнему значимому слову.
      const word = words[words.length - 1] as string;
      out.push({ objectId: o.id, variants: stemVariants(word) });
    }
  }
  return out;
}

/** Ищет объект по слову: точное совпадение основы, затем префикс, затем опечатка. */
export function matchObject(word: string, lib: Library, index = buildIndex(lib)): string | null {
  const v = stemVariants(word);
  let best: { id: string; rank: number } | null = null;
  const rankOf = { exact: 3, prefix: 2, typo: 1 } as const;
  for (const a of index) {
    const m = variantsMatch(v, a.variants, true);
    if (m && (!best || rankOf[m] > best.rank)) best = { id: a.objectId, rank: rankOf[m] };
    if (best?.rank === 3) break;
  }
  return best?.id ?? null;
}

/**
 * Сценарий 2: «телефон, 2 монеты, фоновая лампа» → элементы композиции.
 * Части разделяются запятыми, «;», переводом строки, «и», «+», «&»; пометки состояния и количества
 * относятся к объектам своей части.
 */
export function parseComponentNames(text: string, lib: Library): ParsedNames {
  const index = buildIndex(lib);
  const parts = text.split(/[,;\n]+|\s+(?:и|а также|плюс|and)\s+|\s*[+&]\s*/i).filter((p) => p.trim());
  const items: ParsedItem[] = [];
  const unknown: string[] = [];
  for (const part of parts) {
    let state: ObjectState | null = null;
    let count = 1;
    const found: string[] = [];
    for (const { norm, raw } of tokenizeWithOriginal(part)) {
      if (STOPWORDS.has(norm)) continue;
      const s = stem(norm);
      if (bgStems.has(s)) {
        state = 'background';
        continue;
      }
      if (mainStems.has(s)) {
        state = 'main';
        continue;
      }
      if (/^\d+$/.test(norm)) {
        count = Math.min(4, Math.max(1, Number(norm)));
        continue;
      }
      if (NUMBERS[norm]) {
        count = NUMBERS[norm] as number;
        continue;
      }
      const id = matchObject(norm, lib, index);
      if (id) found.push(id);
      else unknown.push(raw);
    }
    found.forEach((id, k) => {
      const n = k === 0 ? count : 1;
      for (let i = 0; i < n && items.length < MAX_ITEMS; i++) {
        items.push({ objectId: id, state: state ?? 'main', lockState: state !== null });
      }
    });
  }
  return { items, unknown };
}
