import { formatIdForSize, type Box, type DecorSetId, type ExampleLayout, type ObjectVariant } from '@ic/core';
import type { Element } from '@xmldom/xmldom';
import { baseName, descendants, elementChildren, type FigmaSvg } from './figma.ts';
import { cleanMarkup } from './markup.ts';
import { stateFromColors } from './objects.ts';

interface PathIndex {
  variant: ObjectVariant;
  byShape: Map<string, Array<[number, number]>>;
}

/** Сигнатура формы пути: последовательность команд и число чисел (не зависит от сдвига). */
function shapeKey(d: string): { key: string; start: [number, number] } | null {
  const cmds = d.replace(/[^MLHVCSQTAZ]/gi, '');
  const nums = d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi);
  if (!nums || nums.length < 2) return null;
  return { key: `${cmds}:${nums.length}`, start: [Number(nums[0]), Number(nums[1])] };
}

function indexVariant(v: ObjectVariant): PathIndex {
  const byShape = new Map<string, Array<[number, number]>>();
  for (const m of v.markup.matchAll(/ d="([^"]+)"/g)) {
    const s = shapeKey(m[1] as string);
    if (s) byShape.set(s.key, [...(byShape.get(s.key) ?? []), s.start]);
  }
  return { variant: v, byShape };
}

/**
 * Определяет, какой объект библиотеки лежит в группе эталона и где именно: каждый путь эталона «голосует»
 * за сдвиг относительно путей той же формы в библиотеке. Работает и для объектов, обрезанных кадром.
 */
function matchGroup(group: Element, index: PathIndex[]): { variant: ObjectVariant; dx: number; dy: number; votes: number } | null {
  const paths = descendants(group).filter((e) => e.tagName === 'path');
  let best: { variant: ObjectVariant; dx: number; dy: number; votes: number } | null = null;
  for (const idx of index) {
    const votes = new Map<string, number>();
    for (const p of paths) {
      const s = shapeKey(p.getAttribute('d') ?? '');
      if (!s) continue;
      for (const [x, y] of idx.byShape.get(s.key) ?? []) {
        const k = `${Math.round((s.start[0] - x) * 2) / 2},${Math.round((s.start[1] - y) * 2) / 2}`;
        votes.set(k, (votes.get(k) ?? 0) + 1);
      }
    }
    for (const [k, n] of votes) {
      if (!best || n > best.votes) {
        const [dx, dy] = k.split(',').map(Number) as [number, number];
        best = { variant: idx.variant, dx, dy, votes: n };
      }
    }
  }
  if (!best || best.votes < Math.max(3, paths.length * 0.25)) return null;
  return best;
}

function frameBox(frame: Element): Box | null {
  const rect = elementChildren(frame).find((k) => k.tagName === 'rect');
  if (!rect) return null;
  const t = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(rect.getAttribute('transform') ?? '');
  return {
    x: Number(rect.getAttribute('x') ?? 0) + (t ? Number(t[1]) : 0),
    y: Number(rect.getAttribute('y') ?? 0) + (t ? Number(t[2]) : 0),
    width: Number(rect.getAttribute('width')),
    height: Number(rect.getAttribute('height')),
  };
}

function decorOf(frame: Element): DecorSetId | 'none' {
  const names = elementChildren(frame).map(baseName);
  if (names.some((n) => /^(Line [67]|Vector 2)$/.test(n))) return 'plane';
  if (names.some((n) => /^(Line [1-5]|конфетти|Group)$/.test(n))) return 'strokes';
  return 'none';
}

/** Восстанавливает раскладки из страницы «Примеры композиций» (объекты L в масштабе 1:1). */
export function extractExamples(fig: FigmaSvg, libraryL: ObjectVariant[]): ExampleLayout[] {
  const index = libraryL.filter((v) => v.state === 'main').map(indexVariant);
  const frames = descendants(fig.root).filter((e) => e.tagName === 'g' && baseName(e) === 'Фон' && frameBox(e));
  const layouts: ExampleLayout[] = [];
  frames.forEach((frame, i) => {
    const box = frameBox(frame) as Box;
    const items: ExampleLayout['items'] = [];
    for (const g of elementChildren(frame).filter((k) => k.tagName === 'g')) {
      const hit = matchGroup(g, index);
      if (!hit) continue;
      const vb = hit.variant.box;
      items.push({
        objectId: hit.variant.objectId,
        state: stateFromColors(cleanMarkup(g)),
        x: Math.round((vb.x + vb.width / 2 + hit.dx - box.x) * 10) / 10,
        y: Math.round((vb.y + vb.height / 2 + hit.dy - box.y) * 10) / 10,
      });
    }
    layouts.push({
      id: `example-${i + 1}`,
      formatId: formatIdForSize(box.width, box.height),
      width: box.width,
      height: box.height,
      decor: decorOf(frame),
      items,
    });
  });
  return layouts;
}
