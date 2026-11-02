import {
  BASE_SCHEME,
  buildColorMap,
  recolorMarkup,
  type ColorScheme,
  type Composition,
  type Library,
  type ObjectState,
  type SizeClass,
} from '@ic/core';

/** Кэш перекрашенной разметки: при перетаскивании меняется только transform, строки не пересобираются. */
const cache = new Map<string, string>();
const schemeKey = (s: ColorScheme) => `${s.id}|${Object.values(s.colors).join('')}`;

/** Перекраска разметки из базовой схемы библиотеки в выбранную (по ролям цветов). */
export function recolorWith(lib: Library, cacheKey: string, markup: string, scheme: ColorScheme): string {
  const key = `${cacheKey}|${schemeKey(scheme)}`;
  let out = cache.get(key);
  if (out === undefined) {
    const base = lib.schemes.find((s) => s.id === lib.baseSchemeId) ?? BASE_SCHEME;
    out = recolorMarkup(markup, buildColorMap(base, scheme));
    if (cache.size > 400) cache.clear();
    cache.set(key, out);
  }
  return out;
}

export function recolored(lib: Library, objectId: string, state: ObjectState, size: SizeClass, scheme: ColorScheme): string {
  const v = lib.objects.find((o) => o.id === objectId)?.variants[size][state];
  return v ? recolorWith(lib, `${objectId}|${state}|${size}`, v.markup, scheme) : '';
}

export function frameSize(c: Composition, lib: Library): { W: number; H: number; k: number } {
  const k = lib.sizeScale[c.size];
  return { W: c.width * k, H: c.height * k, k };
}

export function downloadText(filename: string, text: string, type = 'image/svg+xml') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
