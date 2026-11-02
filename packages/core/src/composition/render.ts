import { BASE_SCHEME } from '../domain/schemes.ts';
import type {
  ColorScheme,
  Composition,
  CompositionItem,
  DecorElement,
  Library,
  ObjectVariant,
} from '../domain/types.ts';
import { buildColorMap, recolorMarkup } from '../palette/recolor.ts';

export interface RenderOptions {
  /** Явная схема (например, загруженная палитра). По умолчанию — схема по `schemeId` из библиотеки. */
  scheme?: ColorScheme;
  /** Заливка кадра цветом фона (по умолчанию да). */
  background?: boolean;
  /** Обрезка по кадру (по умолчанию да). */
  clip?: boolean;
  /** Декор из тайлов «Фон» (по умолчанию — как в композиции). */
  decor?: boolean;
  /** Встроить JSON композиции в <metadata> для повторного редактирования (по умолчанию да). */
  metadata?: boolean;
  title?: string;
  /** Множитель width/height итогового SVG (вектор масштабируется без потерь). */
  exportScale?: number;
  /** Префикс id — когда несколько SVG встраиваются в одну HTML-страницу. */
  idPrefix?: string;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);
const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unescapeXml = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

export function resolveScheme(lib: Library, schemeId: string, override?: ColorScheme): ColorScheme {
  if (override) return override;
  return lib.schemes.find((s) => s.id === schemeId) ?? lib.schemes.find((s) => s.id === lib.baseSchemeId) ?? BASE_SCHEME;
}

export function variantOf(lib: Library, c: Pick<Composition, 'size'>, item: Pick<CompositionItem, 'objectId' | 'state'>): ObjectVariant {
  const obj = lib.objects.find((o) => o.id === item.objectId);
  if (!obj) throw new Error(`В библиотеке нет объекта «${item.objectId}»`);
  return obj.variants[c.size][item.state];
}

/** Трансформация, ставящая центр габарита варианта в точку элемента (с поворотом/отражением). */
export function itemTransform(item: CompositionItem, v: ObjectVariant, scale: number): string {
  const cx = item.x * scale;
  const cy = item.y * scale;
  const bx = v.box.x + v.box.width / 2;
  const by = v.box.y + v.box.height / 2;
  if (!item.rotation && !item.flipX) return `translate(${fmt(cx - bx)} ${fmt(cy - by)})`;
  return [
    `translate(${fmt(cx)} ${fmt(cy)})`,
    item.rotation ? `rotate(${fmt(item.rotation)})` : '',
    item.flipX ? 'scale(-1 1)' : '',
    `translate(${fmt(-bx)} ${fmt(-by)})`,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Позиция элемента декора: привязка к своему углу кадра. */
export function decorTransform(d: DecorElement, frameW: number, frameH: number): string {
  const cornerX = d.corner.endsWith('r') ? frameW : 0;
  const cornerY = d.corner.startsWith('b') ? frameH : 0;
  return `translate(${fmt(cornerX + d.offset.x - d.box.x)} ${fmt(cornerY + d.offset.y - d.box.y)})`;
}

/** Уникальные читаемые id групп для слоёв Figma/Illustrator: «Телефон», «Монета_2», «Лампа_фон». */
function layerIds(c: Composition, lib: Library): string[] {
  const seen = new Map<string, number>();
  return c.items.map((i) => {
    const name = lib.objects.find((o) => o.id === i.objectId)?.name ?? i.objectId;
    const base = `${name}${i.state === 'background' ? '_фон' : ''}`.replace(/\s+/g, '_');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

/**
 * Собирает итоговый SVG. Объекты вставляются исходной разметкой из библиотеки — меняются только
 * значения цветовых атрибутов (перекраска по ролям) и внешняя трансформация группы.
 */
export function renderComposition(c: Composition, lib: Library, o: RenderOptions = {}): string {
  const scale = lib.sizeScale[c.size];
  const W = c.width * scale;
  const H = c.height * scale;
  const scheme = resolveScheme(lib, c.schemeId, o.scheme);
  const base = lib.schemes.find((s) => s.id === lib.baseSchemeId) ?? BASE_SCHEME;
  const colorMap = buildColorMap(base, scheme);
  const p = o.idPrefix ?? '';
  const clipId = `${p}frame-clip`;
  const k = o.exportScale ?? 1;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(W * k)}" height="${fmt(H * k)}" viewBox="0 0 ${fmt(W)} ${fmt(H)}" fill="none">`,
  );
  if (o.title) parts.push(`<title>${escapeXml(o.title)}</title>`);
  const names = c.items.map((i) => {
    const n = lib.objects.find((x) => x.id === i.objectId)?.name ?? i.objectId;
    return i.state === 'background' ? `${n} (фон)` : n;
  });
  parts.push(
    `<desc>${escapeXml(
      `Собрано из библиотеки иллюстраций: ${names.join(', ') || 'пусто'} · схема «${scheme.name}» · размер ${c.size} · ${fmt(W)}×${fmt(H)}`,
    )}</desc>`,
  );
  if (o.metadata !== false) parts.push(`<metadata data-ic="composition">${escapeXml(JSON.stringify(c))}</metadata>`);
  if (o.clip !== false) {
    parts.push(`<defs><clipPath id="${clipId}"><rect width="${fmt(W)}" height="${fmt(H)}"/></clipPath></defs>`);
    parts.push(`<g id="Композиция" clip-path="url(#${clipId})">`);
  } else {
    parts.push(`<g id="Композиция">`);
  }
  if (o.background !== false) {
    parts.push(`<rect id="Фон" width="${fmt(W)}" height="${fmt(H)}" fill="${scheme.colors[c.background]}"/>`);
  }
  if (o.decor !== false && c.decor !== 'none') {
    const decor = lib.decor[c.size].filter((d) => d.set === c.decor);
    if (decor.length) {
      parts.push(`<g id="Декор">`);
      for (const d of decor) {
        parts.push(`<g transform="${decorTransform(d, W, H)}">${recolorMarkup(d.markup, colorMap)}</g>`);
      }
      parts.push(`</g>`);
    }
  }
  const ids = layerIds(c, lib);
  c.items.forEach((item, idx) => {
    const v = variantOf(lib, c, item);
    parts.push(
      `<g id="${escapeXml(ids[idx] as string)}" data-object="${item.objectId}" data-state="${item.state}" ` +
        `transform="${itemTransform(item, v, scale)}">${recolorMarkup(v.markup, colorMap)}</g>`,
    );
  });
  parts.push(`</g></svg>`);
  return parts.join('');
}

/** Достаёт композицию из экспортированного SVG (для повторного открытия в редакторе). */
export function readCompositionFromSvg(svg: string): Composition | null {
  const m = /<metadata[^>]*data-ic="composition"[^>]*>([\s\S]*?)<\/metadata>/.exec(svg);
  if (!m) return null;
  try {
    const data = JSON.parse(unescapeXml(m[1] as string)) as Composition;
    if (!Array.isArray(data.items) || typeof data.width !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}
