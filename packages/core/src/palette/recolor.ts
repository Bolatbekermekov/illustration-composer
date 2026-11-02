import { COLOR_ROLES, type ColorRole, type ColorScheme, type ObjectState } from '../domain/types.ts';
import { normalizeHex } from './color.ts';

export type ColorMap = Map<string, string>;

/** Атрибуты, в которых живут сплошные цвета в экспорте Figma. */
const COLOR_ATTR = /\b(fill|stroke|stop-color|flood-color|lighting-color|color)="([^"]*)"/g;

/**
 * Карта перекраски: каждый цвет базовой схемы → цвет той же роли в целевой схеме.
 * Именно так перекрашены кадры «SVG-drop» в Figma (проверено в тестах экстрактора).
 */
export function buildColorMap(base: ColorScheme, target: ColorScheme): ColorMap {
  const map: ColorMap = new Map();
  for (const role of COLOR_ROLES) {
    map.set(base.colors[role].toUpperCase(), target.colors[role].toUpperCase());
  }
  return map;
}

/**
 * Карта смены состояния внутри одной схемы.
 * Фоновое состояние (по правилу библиотеки): контур и тёмный тон → bg3, всё остальное → bg1.
 */
export function buildStateMap(scheme: ColorScheme, state: ObjectState): ColorMap {
  const map: ColorMap = new Map();
  const dark: ColorRole[] = ['ink', 'bg3'];
  for (const role of COLOR_ROLES) {
    const from = scheme.colors[role].toUpperCase();
    const to = state === 'main' ? from : scheme.colors[dark.includes(role) ? 'bg3' : 'bg1'].toUpperCase();
    if (!map.has(from)) map.set(from, to);
  }
  return map;
}

/** Композиция карт: сначала a, затем b. */
export function composeMaps(a: ColorMap, b: ColorMap): ColorMap {
  const out: ColorMap = new Map();
  for (const [from, mid] of a) out.set(from, b.get(mid) ?? mid);
  return out;
}

/** Меняет только значения цветовых атрибутов. Геометрия и структура не трогаются. */
export function recolorMarkup(markup: string, map: ColorMap): string {
  if (map.size === 0) return markup;
  return markup.replace(COLOR_ATTR, (whole, attr: string, value: string) => {
    const hex = normalizeHex(value);
    if (!hex) return whole;
    const to = map.get(hex);
    return to ? `${attr}="${to}"` : whole;
  });
}

/** Подсчёт использования сплошных цветов (канонический HEX → количество атрибутов). */
export function collectColors(markup: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of markup.matchAll(COLOR_ATTR)) {
    const hex = normalizeHex(m[2] ?? '');
    if (hex) out.set(hex, (out.get(hex) ?? 0) + 1);
  }
  return out;
}
