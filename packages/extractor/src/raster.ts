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

/**
 * Визуальный габарит: по рендеру, с отсечением «пылинок» — микроскопических обрывков путей,
 * которые встречаются в исходных векторах (например, точка 0.5×1.3 px под монетой).
 * Отбрасываются только фрагменты, отделённые от основной формы пустой полосой, с долей «чернил» < `trim`.
 */
export function visualBox(markup: string, geom: Box, trim = 0.001): Box {
  const pad = 2;
  const area: Box = { x: geom.x - pad, y: geom.y - pad, width: geom.width + 2 * pad, height: geom.height + 2 * pad };
  const scale = Math.min(1, 1600 / Math.max(area.width, area.height));
  const w = Math.max(1, Math.round(area.width * scale));
  const h = Math.max(1, Math.round(area.height * scale));
  const px = new Resvg(wrap(markup, area, w, h)).render().pixels;
  const rows = new Float64Array(h);
  const cols = new Float64Array(w);
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = px[(y * w + x) * 4 + 3] as number;
      rows[y] = (rows[y] as number) + a;
      cols[x] = (cols[x] as number) + a;
      total += a;
    }
  }
  if (total === 0) return geom;
  const limit = total * trim;
  /** Срезает с края только изолированные фрагменты (отделённые пустой полосой) с долей чернил < trim. */
  const cut = (arr: Float64Array, fromEnd: boolean) => {
    const at = (k: number) => arr[fromEnd ? arr.length - 1 - k : k] as number;
    let k = 0;
    while (k < arr.length && at(k) === 0) k++;
    for (;;) {
      let seg = 0;
      let e = k;
      while (e < arr.length && at(e) > 0) seg += at(e++);
      let gapEnd = e;
      while (gapEnd < arr.length && at(gapEnd) === 0) gapEnd++;
      if (seg >= limit || gapEnd === e || gapEnd >= arr.length) return k;
      k = gapEnd;
    }
  };
  const x0 = cut(cols, false);
  const x1 = w - cut(cols, true);
  const y0 = cut(rows, false);
  const y1 = h - cut(rows, true);
  return {
    x: area.x + x0 / scale,
    y: area.y + y0 / scale,
    width: (x1 - x0) / scale,
    height: (y1 - y0) / scale,
  };
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
