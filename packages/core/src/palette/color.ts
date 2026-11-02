const NAMED: Record<string, string> = {
  white: '#FFFFFF',
  black: '#000000',
};

/** Приводит цвет к виду `#RRGGBB` (верхний регистр). Не-сплошные значения (none, url(...)) → null. */
export function normalizeHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (v in NAMED) return NAMED[v] ?? null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (!m || !m[1]) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#${hex.toUpperCase()}`;
}

function toRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex);
  if (!h) throw new Error(`Некорректный цвет: ${hex}`);
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** CIE Lab (D65). */
export function toLab(hex: string): [number, number, number] {
  const [r, g, b] = toRgb(hex).map(srgbToLinear) as [number, number, number];
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** ΔE76 — достаточно для проверок «цвета слишком похожи» и сортировки по светлоте. */
export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Светлота L* (0…100). */
export function relativeLightness(hex: string): number {
  return toLab(hex)[0];
}
