import { normalizeHex, type ColorMap } from '@ic/core';
import type { Element } from '@xmldom/xmldom';
import { descendants, elementChildren, serialize } from './figma.ts';

const COLOR_ATTRS = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color'];

/**
 * Готовит разметку объекта к переиспользованию, не трогая геометрию:
 * - удаляет служебные id Figma (Vector_123…), кроме тех, на которые есть ссылки url(#…)/href;
 * - приводит цвета к каноническому #RRGGBB (white → #FFFFFF), опционально переводя их в базовую схему.
 * Возвращает внутреннюю разметку группы (без самой группы, если у неё нет своих атрибутов).
 */
export function cleanMarkup(group: Element, toBase?: ColorMap): string {
  const clone = group.cloneNode(true) as Element;
  const all = [clone, ...descendants(clone)];
  const text = serialize(clone);
  const referenced = new Set([...text.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)].map((m) => m[1] ?? m[2]));
  for (const el of all) {
    const id = el.getAttribute('id');
    if (id !== null && !referenced.has(id)) el.removeAttribute('id');
    for (const attr of COLOR_ATTRS) {
      const v = el.getAttribute(attr);
      if (v === null) continue;
      const hex = normalizeHex(v);
      if (hex) el.setAttribute(attr, toBase?.get(hex) ?? hex);
    }
  }
  const ownAttrs = [...Array.from({ length: clone.attributes.length }, (_, i) => clone.attributes.item(i))].filter(
    (a) => a && a.name !== 'id',
  );
  const out = ownAttrs.length > 0 ? serialize(clone) : elementChildren(clone).map((c) => serialize(c)).join('');
  return out.replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');
}
