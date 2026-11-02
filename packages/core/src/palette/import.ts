import { DEFAULT_INK, DEFAULT_PAPER } from '../domain/schemes.ts';
import {
  BACKGROUND_ROLES,
  COLOR_ROLES,
  OBJECT_ROLES,
  ROLE_LABELS,
  type ColorRole,
  type ColorScheme,
} from '../domain/types.ts';
import { deltaE, normalizeHex, relativeLightness } from './color.ts';

export type PaletteParseResult =
  | { ok: true; scheme: ColorScheme; warnings: string[] }
  | { ok: false; error: string };

export interface SchemeValidation {
  errors: string[];
  warnings: string[];
}

/**
 * Разбирает загруженную палитру. Поддерживаются:
 * - SVG-экспорт сетки палитры из Figma (левый столбец — цвета фона, правый — цвета объектов);
 * - JSON `{name, background:[3], objects:[3], ink?, paper?}`, `{name, colors:{bg1…paper}}` или массив HEX;
 * - текст со списком из 6 или 8 HEX в порядке сетки Figma (bg1 bg2 bg3 [ink] obj1 obj2 obj3 [paper]).
 */
export function parsePalette(content: string, filename = 'palette'): PaletteParseResult {
  const text = content.trim();
  const fallbackName = filename.replace(/\.[^.]+$/, '').trim() || 'Своя палитра';
  let parsed: { name?: string; colors: string[] | Record<ColorRole, string> } | { error: string };
  if (text.startsWith('<')) parsed = { colors: readSvgSwatches(text) };
  else if (text.startsWith('{') || text.startsWith('[')) parsed = readJson(text);
  else parsed = { colors: readHexList(text) };
  if ('error' in parsed) return { ok: false, error: parsed.error };

  const colors = Array.isArray(parsed.colors) ? fromColorList(parsed.colors) : fromRoles(parsed.colors);
  if ('error' in colors) return { ok: false, error: colors.error };

  const name = parsed.name?.trim() || fallbackName;
  const scheme: ColorScheme = { id: `custom-${hashColors(colors)}`, name, colors };
  const { errors, warnings } = validateScheme(scheme);
  if (errors.length) return { ok: false, error: errors.join(' ') };
  return { ok: true, scheme, warnings };
}

/** Правила схемы из библиотеки: цвета объектов не могут использоваться в фоне. */
export function validateScheme(scheme: ColorScheme): SchemeValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const role of COLOR_ROLES) {
    if (!normalizeHex(scheme.colors[role] ?? '')) errors.push(`«${ROLE_LABELS[role]}»: некорректный цвет.`);
  }
  if (errors.length) return { errors, warnings };

  const c = (r: ColorRole) => normalizeHex(scheme.colors[r]) as string;
  for (const o of OBJECT_ROLES) {
    for (const b of BACKGROUND_ROLES) {
      if (c(o) === c(b)) {
        errors.push(
          `Цвет «${ROLE_LABELS[o]}» (${c(o)}) совпадает с цветом фона «${ROLE_LABELS[b]}» — ` +
            'цвета объектов нельзя использовать в фоне.',
        );
      }
    }
  }
  const [l1, l2, l3] = BACKGROUND_ROLES.map((r) => relativeLightness(c(r))) as [number, number, number];
  if (!(l1 > l2 && l2 > l3)) {
    warnings.push('Цвета фона должны идти от светлого к тёмному (bg1 → bg3): иначе фоновые объекты потеряют контур.');
  }
  for (const o of OBJECT_ROLES) {
    if (deltaE(c(o), c('bg1')) < 6) warnings.push(`«${ROLE_LABELS[o]}» почти не отличается от фона — объект может слиться.`);
  }
  if (relativeLightness(c('ink')) > 45) warnings.push('Цвет контура слишком светлый.');
  if (relativeLightness(c('paper')) < 80) warnings.push('«Белый» слишком тёмный.');
  return { errors, warnings };
}

function fromColorList(list: string[]): Record<ColorRole, string> | { error: string } {
  const hex = list.map((v) => normalizeHex(v));
  const bad = list.find((_, i) => !hex[i]);
  if (bad !== undefined) return { error: `Не удалось распознать цвет «${bad}».` };
  const h = hex as string[];
  if (h.length === 8) {
    return Object.fromEntries(COLOR_ROLES.map((r, i) => [r, h[i]])) as Record<ColorRole, string>;
  }
  if (h.length === 6) {
    const [bg1, bg2, bg3, obj1, obj2, obj3] = h as [string, string, string, string, string, string];
    return { bg1, bg2, bg3, ink: DEFAULT_INK, obj1, obj2, obj3, paper: DEFAULT_PAPER };
  }
  return {
    error:
      `Ожидается 6 или 8 цветов (найдено ${h.length}): 3 цвета фона от светлого к тёмному, ` +
      '[контур], 3 цвета объектов, [белый].',
  };
}

function fromRoles(roles: Partial<Record<ColorRole, string>>): Record<ColorRole, string> | { error: string } {
  const out: Partial<Record<ColorRole, string>> = { ink: DEFAULT_INK, paper: DEFAULT_PAPER };
  for (const role of COLOR_ROLES) {
    const v = roles[role];
    if (v === undefined) {
      if (role === 'ink' || role === 'paper') continue;
      return { error: `В палитре нет цвета для роли «${ROLE_LABELS[role]}» (${role}).` };
    }
    const hex = normalizeHex(v);
    if (!hex) return { error: `Не удалось распознать цвет «${v}» (${role}).` };
    out[role] = hex;
  }
  return out as Record<ColorRole, string>;
}

function readJson(text: string): { name?: string; colors: string[] | Record<ColorRole, string> } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'Файл похож на JSON, но содержит синтаксическую ошибку.' };
  }
  if (Array.isArray(data)) return { colors: data.map(String) };
  if (!data || typeof data !== 'object') return { error: 'Неподдерживаемая структура JSON.' };
  const obj = data as Record<string, unknown>;
  const name = typeof obj.name === 'string' ? obj.name : undefined;
  if (Array.isArray(obj.background) && Array.isArray(obj.objects)) {
    const list = [...obj.background.map(String)];
    const objects = obj.objects.map(String);
    if (list.length !== 3 || objects.length !== 3) {
      return { error: 'Ожидается ровно 3 цвета фона и 3 цвета объектов.' };
    }
    const all = [...list, String(obj.ink ?? DEFAULT_INK), ...objects, String(obj.paper ?? DEFAULT_PAPER)];
    return { name, colors: all };
  }
  if (Array.isArray(obj.colors)) return { name, colors: obj.colors.map(String) };
  const roles = (obj.colors && typeof obj.colors === 'object' ? obj.colors : obj) as Record<ColorRole, string>;
  if (COLOR_ROLES.some((r) => typeof roles[r] === 'string')) return { name, colors: roles };
  return { error: 'В JSON не найдено полей background/objects или ролей bg1…obj3.' };
}

function readHexList(text: string): string[] {
  return [...text.matchAll(/#?\b([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)].map((m) => `#${m[1]}`);
}

interface Swatch {
  color: string;
  /** Центр и размер плашки. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Читает плашки палитры из SVG и упорядочивает их как сетку Figma: по столбцам, сверху вниз. */
function readSvgSwatches(svg: string): string[] {
  const swatches: Swatch[] = [];
  for (const m of svg.matchAll(/<(rect|path|circle|ellipse|polygon)\b([^>]*)>/g)) {
    const attrs = parseAttrs(m[2] ?? '');
    const color = normalizeHex(attrs.fill ?? '');
    if (!color) continue;
    const box = shapeBox(m[1] as string, attrs);
    if (box) swatches.push({ color, ...box });
  }
  if (swatches.length === 0) return [];
  const colTol = median(swatches.map((s) => s.w)) / 2;
  const rowTol = median(swatches.map((s) => s.h)) / 2;
  const columns = clusterBy(swatches, (s) => s.x, colTol);
  if (columns.length === 2 && columns.every((c) => c.length >= 3)) {
    return columns.flatMap((col) => col.sort((a, b) => a.y - b.y).map((s) => s.color));
  }
  return clusterBy(swatches, (s) => s.y, rowTol).flatMap((row) => row.sort((a, b) => a.x - b.x).map((s) => s.color));
}

function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1] as string] = m[2] as string;
  return out;
}

function shapeBox(tag: string, a: Record<string, string>): Omit<Swatch, 'color'> | null {
  const t = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(a.transform ?? '');
  const tx = t ? Number(t[1]) : 0;
  const ty = t ? Number(t[2]) : 0;
  const num = (v: string | undefined) => Number(v ?? 0);
  if (tag === 'rect') {
    const w = num(a.width);
    const h = num(a.height);
    return { x: num(a.x) + w / 2 + tx, y: num(a.y) + h / 2 + ty, w, h };
  }
  if (tag === 'circle') return { x: num(a.cx) + tx, y: num(a.cy) + ty, w: 2 * num(a.r), h: 2 * num(a.r) };
  if (tag === 'ellipse') return { x: num(a.cx) + tx, y: num(a.cy) + ty, w: 2 * num(a.rx), h: 2 * num(a.ry) };
  const pts = tag === 'path' ? pathPoints(a.d ?? '') : pairs(numbers(a.points ?? ''));
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: (minX + maxX) / 2 + tx, y: (minY + maxY) / 2 + ty, w: maxX - minX, h: maxY - minY };
}

function numbers(src: string): number[] {
  return [...src.matchAll(/-?\d*\.?\d+(?:e-?\d+)?/gi)].map((m) => Number(m[0]));
}

function pairs(n: number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i] as number, n[i + 1] as number]);
  return out;
}

/** Опорные точки пути с абсолютными командами M/L/H/V/C/Z (так экспортирует Figma). */
function pathPoints(d: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let cx = 0;
  let cy = 0;
  for (const m of d.matchAll(/([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/gi)) {
    const cmd = (m[1] as string).toUpperCase();
    const n = numbers(m[2] ?? '');
    if (cmd === 'H') for (const v of n) out.push([(cx = v), cy]);
    else if (cmd === 'V') for (const v of n) out.push([cx, (cy = v)]);
    else if (cmd !== 'Z') for (const [x, y] of pairs(n)) out.push([(cx = x), (cy = y)]);
  }
  return out;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? (s[Math.floor(s.length / 2)] as number) : 0;
}

function clusterBy<T>(items: T[], key: (t: T) => number, tolerance: number): T[][] {
  const sorted = [...items].sort((a, b) => key(a) - key(b));
  const tol = Math.max(1, tolerance);
  const groups: T[][] = [];
  for (const it of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(key(it) - key(last[0] as T)) <= tol) last.push(it);
    else groups.push([it]);
  }
  return groups;
}

function hashColors(colors: Record<ColorRole, string>): string {
  let h = 2166136261;
  for (const ch of COLOR_ROLES.map((r) => colors[r]).join('')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
