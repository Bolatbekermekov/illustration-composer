import {
  BASE_SCHEME,
  BUILTIN_SCHEMES,
  buildColorMap,
  normalizeHex,
  type Box,
  type Corner,
  type DecorElement,
  type DecorSetId,
  type SizeClass,
} from '@ic/core';
import type { Element } from '@xmldom/xmldom';
import { baseName, elementChildren, serialize, type FigmaSvg } from './figma.ts';
import { cleanMarkup } from './markup.ts';
import { bboxOf } from './raster.ts';

const LEAF = new Set(['path', 'ellipse', 'circle', 'rect', 'line', 'polygon', 'polyline']);

interface Tile {
  el: Element;
  box: Box;
  schemeId: string;
}

function tileBox(rect: Element): Box {
  const t = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(rect.getAttribute('transform') ?? '');
  return {
    x: Number(rect.getAttribute('x') ?? 0) + (t ? Number(t[1]) : 0),
    y: Number(rect.getAttribute('y') ?? 0) + (t ? Number(t[2]) : 0),
    width: Number(rect.getAttribute('width')),
    height: Number(rect.getAttribute('height')),
  };
}

function findTiles(fig: FigmaSvg): Tile[] {
  const tiles: Tile[] = [];
  for (const el of elementChildren(fig.frame)) {
    if (el.tagName !== 'g' || baseName(el) !== 'Фон') continue;
    const rect = elementChildren(el).find((k) => k.tagName === 'rect');
    if (!rect) continue;
    const fill = normalizeHex(rect.getAttribute('fill') ?? '');
    const scheme = BUILTIN_SCHEMES.find((s) => s.colors.bg1 === fill);
    if (scheme) tiles.push({ el, box: tileBox(rect), schemeId: scheme.id });
  }
  return tiles;
}

function leaves(el: Element, skip: Element): Element[] {
  const out: Element[] = [];
  for (const k of elementChildren(el)) {
    if (k === skip) continue;
    if (k.tagName === 'g') out.push(...leaves(k, skip));
    else if (LEAF.has(k.tagName)) out.push(k);
  }
  return out;
}

const intersects = (a: Box, b: Box, pad: number) =>
  a.x - pad < b.x + b.width && b.x - pad < a.x + a.width && a.y - pad < b.y + b.height && b.y - pad < a.y + a.height;

/**
 * Декор из тайлов «Фон»: «штрихи» (лавандовый тайл: линии + конфетти) и «плоскость» (персиковый тайл:
 * плоскость пола + длинные линии). Элементы группируются по пересечению габаритов и привязываются
 * к ближайшему углу тайла — так набор работает в кадре любой пропорции.
 */
export function extractDecor(fig: FigmaSvg, size: SizeClass): DecorElement[] {
  const sets: Array<{ set: DecorSetId; schemeId: string }> = [
    { set: 'strokes', schemeId: 'lavender' },
    { set: 'plane', schemeId: 'peach' },
  ];
  const tiles = findTiles(fig);
  const out: DecorElement[] = [];
  for (const { set, schemeId } of sets) {
    const tile = tiles.find((t) => t.schemeId === schemeId);
    if (!tile) throw new Error(`Размер ${size}: не найден тайл «Фон» схемы ${schemeId}`);
    const scheme = BUILTIN_SCHEMES.find((s) => s.id === schemeId) ?? BASE_SCHEME;
    const toBase = buildColorMap(scheme, BASE_SCHEME);
    const bgRect = elementChildren(tile.el).find((k) => k.tagName === 'rect') as Element;
    const items = leaves(tile.el, bgRect)
      .map((el) => ({ el, box: bboxOf(serialize(el), fig.viewBox) }))
      .filter((x): x is { el: Element; box: Box } => x.box !== null);

    // Объединяем пересекающиеся элементы (пара эллипсов «конфетти» и т.п.).
    const parent = items.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i] as number)));
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (intersects((items[i] as { box: Box }).box, (items[j] as { box: Box }).box, 2)) parent[find(i)] = find(j);
      }
    }
    const clusters = new Map<number, typeof items>();
    items.forEach((it, i) => clusters.set(find(i), [...(clusters.get(find(i)) ?? []), it]));

    let n = 0;
    for (const members of clusters.values()) {
      const box = union(members.map((m) => m.box));
      const cx = box.x + box.width / 2 - tile.box.x;
      const cy = box.y + box.height / 2 - tile.box.y;
      const right = cx > tile.box.width / 2;
      const bottom = cy > tile.box.height / 2;
      const corner = `${bottom ? 'b' : 't'}${right ? 'r' : 'l'}` as Corner;
      const cornerX = tile.box.x + (right ? tile.box.width : 0);
      const cornerY = tile.box.y + (bottom ? tile.box.height : 0);
      out.push({
        id: `${set}-${size}-${++n}`,
        set,
        corner,
        offset: { x: round(box.x - cornerX), y: round(box.y - cornerY) },
        box: { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) },
        markup: members.map((m) => cleanMarkup(wrapLeaf(m.el), toBase)).join(''),
      });
    }
  }
  return out;
}

/** cleanMarkup ожидает группу: оборачиваем лист во временную группу того же документа. */
function wrapLeaf(el: Element): Element {
  const doc = el.ownerDocument;
  if (!doc) throw new Error('Элемент вне документа');
  const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.appendChild(el.cloneNode(true));
  return g;
}

function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.width));
  const btm = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: r - x, height: btm - y };
}

const round = (v: number) => Math.round(v * 100) / 100;
