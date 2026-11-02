/** Токенизация и стемминг (упрощённый Snowball для русского + базовый английский). */

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^a-zа-я0-9]+/i)
    .filter(Boolean);
}

/** Токены с исходным написанием (для сообщений пользователю). */
export function tokenizeWithOriginal(text: string): Array<{ norm: string; raw: string }> {
  return [...text.matchAll(/[a-zа-яё0-9]+/gi)].map((m) => ({ raw: m[0], norm: m[0].toLowerCase().replace(/ё/g, 'е') }));
}

const VOWELS = /[аеиоуыэюя]/;
const PERFECTIVE_1 = ['вшись', 'вши', 'в'];
const PERFECTIVE_2 = ['ывшись', 'ившись', 'ывши', 'ивши', 'ыв', 'ив'];
const REFLEXIVE = ['ся', 'сь'];
const ADJECTIVE = ['ими', 'ыми', 'его', 'ого', 'ему', 'ому', 'ее', 'ие', 'ые', 'ое', 'ей', 'ий', 'ый', 'ой', 'ем', 'им', 'ым', 'ом', 'их', 'ых', 'ую', 'юю', 'ая', 'яя', 'ою', 'ею'];
const PARTICIPLE_1 = ['ем', 'нн', 'вш', 'ющ', 'щ'];
const PARTICIPLE_2 = ['ивш', 'ывш', 'ующ'];
const VERB_1 = ['ла', 'на', 'ете', 'йте', 'ли', 'й', 'л', 'ем', 'н', 'ло', 'но', 'ет', 'ют', 'ны', 'ть', 'ешь', 'нно'];
const VERB_2 = ['ила', 'ыла', 'ена', 'ейте', 'уйте', 'ите', 'или', 'ыли', 'ей', 'уй', 'ил', 'ыл', 'им', 'ым', 'ен', 'ило', 'ыло', 'ено', 'ят', 'ует', 'уют', 'ит', 'ыт', 'ены', 'ить', 'ыть', 'ишь', 'ую', 'ю'];
const NOUN = ['а', 'ев', 'ов', 'ие', 'ье', 'е', 'иями', 'ями', 'ами', 'еи', 'ии', 'и', 'ией', 'ей', 'ой', 'ий', 'й', 'иям', 'ям', 'ием', 'ем', 'ам', 'ом', 'о', 'у', 'ах', 'иях', 'ях', 'ы', 'ь', 'ию', 'ью', 'ю', 'ия', 'ья', 'я'];

const byLength = (l: string[]) => [...l].sort((a, b) => b.length - a.length);
const G1 = byLength(PERFECTIVE_1);
const G2 = byLength(PERFECTIVE_2);
const ADJ = byLength(ADJECTIVE);
const P1 = byLength(PARTICIPLE_1);
const P2 = byLength(PARTICIPLE_2);
const V1 = byLength(VERB_1);
const V2 = byLength(VERB_2);
const N = byLength(NOUN);

/** Удаляет самое длинное окончание из списка (для группы 1 — только после «а»/«я»). */
function strip(rv: string, list: string[], afterAorYa = false): string | null {
  for (const end of list) {
    if (!rv.endsWith(end)) continue;
    const rest = rv.slice(0, rv.length - end.length);
    if (afterAorYa && !/[ая]$/.test(rest)) continue;
    return rest;
  }
  return null;
}

function stemRu(word: string): string {
  const m = VOWELS.exec(word);
  if (!m) return word;
  const pre = word.slice(0, m.index + 1);
  let rv = word.slice(m.index + 1);

  const gerund = strip(rv, G2) ?? strip(rv, G1, true);
  if (gerund !== null) {
    rv = gerund;
  } else {
    rv = strip(rv, REFLEXIVE) ?? rv;
    const adj = strip(rv, ADJ);
    if (adj !== null) {
      rv = strip(adj, P2) ?? strip(adj, P1, true) ?? adj;
    } else {
      rv = strip(rv, V2) ?? strip(rv, V1, true) ?? strip(rv, N) ?? rv;
    }
  }
  if (rv.endsWith('и')) rv = rv.slice(0, -1);
  if (rv.length > 4) rv = strip(rv, ['ость', 'ост']) ?? rv;
  const sup = strip(rv, ['ейше', 'ейш']);
  if (sup !== null) rv = sup;
  if (rv.endsWith('нн')) rv = rv.slice(0, -1);
  else if (rv.endsWith('ь')) rv = rv.slice(0, -1);
  return pre + rv;
}

function stemEn(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('es') && /(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  return word;
}

export function stem(word: string): string {
  const w = word.toLowerCase().replace(/ё/g, 'е');
  if (/^[a-z]+$/.test(w)) return stemEn(w);
  if (/^[а-я]+$/.test(w)) return stemRu(w);
  return w;
}

/**
 * Варианты основы: Snowball-основа плюс основы после снятия именного, адъективного или глагольного окончания.
 * Нужны, потому что Snowball по-разному режет формы одного слова («идея» → «иде», «идею» → «ид»).
 */
export function stemVariants(word: string): string[] {
  const w = word.toLowerCase().replace(/ё/g, 'е');
  const out = new Set<string>([stem(w), w]);
  if (/^[а-я]+$/.test(w)) {
    const m = VOWELS.exec(w);
    if (m) {
      const pre = w.slice(0, m.index + 1);
      const rv = w.slice(m.index + 1);
      for (const list of [N, ADJ, V2]) {
        const r = strip(rv, list);
        if (r !== null && (pre + r).length >= 3) out.add(pre + r);
      }
      const r1 = strip(rv, V1, true);
      if (r1 !== null && (pre + r1).length >= 3) out.add(pre + r1);
    }
  }
  return [...out];
}

/** Лучшее совпадение между наборами вариантов основ двух слов. */
export function variantsMatch(a: string[], b: string[], allowTypos = false): 'exact' | 'prefix' | 'typo' | null {
  const rank = { exact: 3, prefix: 2, typo: 1 } as const;
  let best: 'exact' | 'prefix' | 'typo' | null = null;
  for (const x of a) {
    for (const y of b) {
      const m = stemsMatch(x, y, allowTypos);
      if (m && (!best || rank[m] > rank[best])) best = m;
      if (best === 'exact') return best;
    }
  }
  return best;
}

/** Расстояние Дамерау — Левенштейна (оптимальное выравнивание строк). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) (d[0] as number[])[j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const row = d[i] as number[];
      const prev = d[i - 1] as number[];
      row[j] = Math.min((prev[j] as number) + 1, (row[j - 1] as number) + 1, (prev[j - 1] as number) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j] as number, ((d[i - 2] as number[])[j - 2] as number) + 1);
      }
    }
  }
  return (d[a.length] as number[])[b.length] as number;
}

/** Похожи ли основы: точное совпадение, префикс (≥4 букв) или опечатка. */
export function stemsMatch(a: string, b: string, allowTypos = true): 'exact' | 'prefix' | 'typo' | null {
  if (a === b) return 'exact';
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 4 && l.startsWith(s) && l.length - s.length <= 3) return 'prefix';
  if (allowTypos && s.length >= 4 && editDistance(a, b) <= (s.length >= 8 ? 2 : 1)) return 'typo';
  return null;
}

export const STOPWORDS = new Set([
  'и', 'а', 'с', 'со', 'на', 'в', 'во', 'к', 'ко', 'у', 'по', 'для', 'из', 'от', 'до', 'или', 'плюс', 'это', 'как',
  'что', 'не', 'но', 'же', 'ли', 'бы', 'мы', 'вы', 'он', 'она', 'они', 'наш', 'ваш', 'свой', 'при', 'про', 'над',
  'под', 'без', 'за', 'о', 'об', 'шт', 'штук', 'штуки', 'штука', 'также', 'and', 'the', 'a', 'an', 'with', 'of',
  'to', 'for', 'in', 'on', 'or', 'how', 'your', 'our',
]);
