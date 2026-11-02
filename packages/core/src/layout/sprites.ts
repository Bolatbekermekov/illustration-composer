import type { Library, ObjectKind, ObjectState, SilhouetteMask } from '../domain/types.ts';
import { decodeMask } from './mask.ts';

/** Шаг грубой сетки оценки раскладки (в единицах L). */
export const GRID = 32;

/** Силуэт объекта на грубой сетке: покрытие клетки 0…16 (доля занятых 8-px подклеток). */
export interface Sprite {
  objectId: string;
  state: ObjectState;
  kind: ObjectKind;
  /** Габарит объекта в единицах L. */
  w: number;
  h: number;
  cols: number;
  rows: number;
  cov: Uint8Array;
  area: number;
}

const cache = new WeakMap<SilhouetteMask, { cols: number; rows: number; cov: Uint8Array; area: number }>();

function coarse(mask: SilhouetteMask) {
  const hit = cache.get(mask);
  if (hit) return hit;
  const f = Math.max(1, Math.round(GRID / mask.cell));
  const fine = decodeMask(mask);
  const cols = Math.ceil(mask.cols / f);
  const rows = Math.ceil(mask.rows / f);
  const cov = new Uint8Array(cols * rows);
  let area = 0;
  for (let r = 0; r < mask.rows; r++) {
    for (let c = 0; c < mask.cols; c++) {
      if (!fine[r * mask.cols + c]) continue;
      const k = Math.floor(r / f) * cols + Math.floor(c / f);
      cov[k] = (cov[k] as number) + 1;
    }
  }
  // Нормируем к 16 (при f=4 это уже 0…16).
  const k = 16 / (f * f);
  for (let i = 0; i < cov.length; i++) {
    cov[i] = Math.round((cov[i] as number) * k);
    area += cov[i] as number;
  }
  const out = { cols, rows, cov, area };
  cache.set(mask, out);
  return out;
}

/** Геометрия раскладки всегда в единицах L — S-вариант лишь подставляется при рендере. */
export function spriteFor(lib: Library, objectId: string, state: ObjectState): Sprite {
  const obj = lib.objects.find((o) => o.id === objectId);
  if (!obj) throw new Error(`В библиотеке нет объекта «${objectId}»`);
  const v = obj.variants.L[state];
  const c = coarse(v.mask);
  return { objectId, state, kind: obj.kind, w: v.box.width, h: v.box.height, ...c };
}
