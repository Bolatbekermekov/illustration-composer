import { readFileSync } from 'node:fs';
import { DOMParser, XMLSerializer, type Document, type Element, type Node } from '@xmldom/xmldom';
import type { Box } from '@ic/core';

/** Разобранный SVG-экспорт Figma: корневой кадр, defs и viewBox. */
export interface FigmaSvg {
  source: string;
  doc: Document;
  root: Element;
  /** Первая группа верхнего уровня — экспортированный кадр/секция. */
  frame: Element;
  viewBox: Box;
}

export function parseFigmaSvg(source: string): FigmaSvg {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName !== 'svg') throw new Error('Ожидался SVG-документ');
  const frame = elementChildren(root).find((e) => e.tagName === 'g');
  if (!frame) throw new Error('В экспорте нет группы кадра');
  const [x, y, width, height] = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number) as number[];
  return { source, doc, root, frame, viewBox: { x: x ?? 0, y: y ?? 0, width: width ?? 0, height: height ?? 0 } };
}

export function loadFigmaSvg(path: string): FigmaSvg {
  return parseFigmaSvg(readFileSync(path, 'utf8'));
}

/**
 * Figma пишет id как HTML-сущности по байтам UTF-8 («&#208;&#154;…»), парсер превращает их в latin1-символы.
 * Восстанавливаем исходную кириллицу.
 */
export function decodeFigmaId(raw: string | null | undefined): string {
  if (!raw) return '';
  if (![...raw].some((ch) => ch.charCodeAt(0) >= 0x80 && ch.charCodeAt(0) <= 0xff)) return raw;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from([...raw].map((c) => c.charCodeAt(0))));
  } catch {
    return raw;
  }
}

/** Имя слоя без суффикса дубликата («Телефон_2» → «Телефон»). */
export function baseName(el: Element): string {
  return decodeFigmaId(el.getAttribute('id')).replace(/_\d+$/, '');
}

export function elementChildren(node: Node): Element[] {
  const out: Element[] = [];
  for (let n = node.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element);
  return out;
}

export function descendants(node: Node): Element[] {
  const out: Element[] = [];
  const walk = (n: Node) => {
    for (const c of elementChildren(n)) {
      out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

export function findById(fig: FigmaSvg, decodedId: string): Element | undefined {
  return descendants(fig.root).find((e) => decodeFigmaId(e.getAttribute('id')) === decodedId);
}

const serializer = new XMLSerializer();
export function serialize(node: Node): string {
  return serializer.serializeToString(node);
}
