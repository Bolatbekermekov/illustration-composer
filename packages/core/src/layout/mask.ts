import type { SilhouetteMask } from '../domain/types.ts';

/** Упаковывает сетку 0/1 (построчно) в base64-строку бит, старший бит первым. */
export function encodeMask(cells: ArrayLike<number>, cols: number, rows: number, cell: number): SilhouetteMask {
  const total = cols * rows;
  const bytes = new Uint8Array(Math.ceil(total / 8));
  for (let i = 0; i < total; i++) {
    if (cells[i]) bytes[i >> 3] = (bytes[i >> 3] as number) | (0x80 >> (i & 7));
  }
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return { cell, cols, rows, bits: btoa(bin) };
}

export function decodeMask(mask: SilhouetteMask): Uint8Array {
  const bin = atob(mask.bits);
  const total = mask.cols * mask.rows;
  const out = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    out[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
  }
  return out;
}

export function maskArea(mask: SilhouetteMask): number {
  let n = 0;
  for (const v of decodeMask(mask)) n += v;
  return n;
}
