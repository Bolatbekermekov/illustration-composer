import { Resvg } from '@resvg/resvg-js';
import { encodeMask, type Box, type SilhouetteMask } from '@ic/core';

const SVG_NS = 'http://www.w3.org/2000/svg';

function wrap(markup: string, box: Box, width: number, height: number): string {
  return (
    `<svg xmlns="${SVG_NS}" fill="none" viewBox="${box.x} ${box.y} ${box.width} ${box.height}" ` +
    `width="${width}" height="${height}">${markup}</svg>`
  );
}

/** Точный геометрический габарит фрагмента в координатах `space`. */
export function bboxOf(markup: string, space: Box): Box | null {
  const r = new Resvg(wrap(markup, space, space.width, space.height));
  const b = r.getBBox();
  if (!b) return null;
  return { x: b.x, y: b.y, width: b.width, height: b.height };
}

/** Рендер произвольного SVG-документа, обрезанного до области `region`, на белом фоне → RGBA. */
export function renderRegion(svgSource: string, region: Box, widthPx: number): Uint8Array {
  const vb = `${region.x} ${region.y} ${region.width} ${region.height}`;
  const patched = svgSource.replace(/<svg\b[^>]*>/, (tag) =>
    tag
      .replace(/\s(viewBox|width|height)="[^"]*"/g, '')
      .replace(/<svg\b/, `<svg viewBox="${vb}" width="${region.width}" height="${region.height}"`),
  );
  const r = new Resvg(patched, { fitTo: { mode: 'width', value: widthPx }, background: '#ffffff' });
  return new Uint8Array(r.render().pixels);
}

/** Рендер SVG в PNG заданной ширины. */
export function renderPng(svgSource: string, widthPx: number, background?: string): Buffer {
  const r = new Resvg(svgSource, { fitTo: { mode: 'width', value: widthPx }, ...(background ? { background } : {}) });
  return r.render().asPng();
}

/** Маска силуэта: клетка считается занятой, если покрыта ≥ ~40% (по альфа-каналу). */
export function renderMask(markup: string, box: Box, cell: number): SilhouetteMask {
  const cols = Math.ceil(box.width / cell);
  const rows = Math.ceil(box.height / cell);
  const area: Box = { x: box.x, y: box.y, width: cols * cell, height: rows * cell };
  const r = new Resvg(wrap(markup, area, cols, rows));
  const px = r.render().pixels;
  const cells = new Uint8Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) cells[i] = (px[i * 4 + 3] as number) >= 100 ? 1 : 0;
  return encodeMask(cells, cols, rows, cell);
}
