import { formatById } from '../domain/formats.ts';
import type {
  Composition,
  CompositionItem,
  DecorSetId,
  ObjectState,
  SizeClass,
} from '../domain/types.ts';

/**
 * Операции редактора над композицией. Все функции чистые: возвращают новую композицию,
 * исходная не меняется (удобно для undo/redo и тестов).
 */

export interface CreateOptions {
  formatId?: string;
  width?: number;
  height?: number;
  size?: SizeClass;
  schemeId?: string;
  background?: Composition['background'];
  decor?: DecorSetId | 'none';
}

export function createComposition(o: CreateOptions = {}): Composition {
  const format = formatById(o.formatId ?? 'square');
  const width = o.width ?? format?.width ?? 1000;
  const height = o.height ?? format?.height ?? 1000;
  return {
    width,
    height,
    ...(format && !o.width ? { formatId: format.id } : {}),
    size: o.size ?? 'L',
    schemeId: o.schemeId ?? 'lavender',
    background: o.background ?? 'bg1',
    decor: o.decor ?? 'strokes',
    items: [],
  };
}

let counter = 0;
export function newUid(): string {
  counter = (counter + 1) % 1_000_000;
  return `it${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const normalizeAngle = (deg: number) => {
  const r = (((deg % 360) + 540) % 360) - 180;
  return Object.is(r, -0) ? 0 : r;
};

function mapItem(c: Composition, uid: string, fn: (i: CompositionItem) => CompositionItem): Composition {
  return { ...c, items: c.items.map((i) => (i.uid === uid ? fn(i) : i)) };
}

export function addItem(
  c: Composition,
  objectId: string,
  state: ObjectState = 'main',
  at?: { x: number; y: number },
  rotation = 0,
): { composition: Composition; uid: string } {
  const uid = newUid();
  const item: CompositionItem = {
    uid,
    objectId,
    state,
    x: at?.x ?? c.width / 2,
    y: at?.y ?? c.height / 2,
    rotation: normalizeAngle(rotation),
  };
  return { composition: { ...c, items: [...c.items, item] }, uid };
}

export function updateItem(c: Composition, uid: string, patch: Partial<Omit<CompositionItem, 'uid'>>): Composition {
  return mapItem(c, uid, (i) => ({
    ...i,
    ...patch,
    ...(patch.rotation !== undefined ? { rotation: normalizeAngle(patch.rotation) } : {}),
  }));
}

export function moveItem(c: Composition, uid: string, x: number, y: number): Composition {
  return updateItem(c, uid, { x, y });
}

export function rotateItem(c: Composition, uid: string, degrees: number): Composition {
  return updateItem(c, uid, { rotation: degrees });
}

export function setItemState(c: Composition, uid: string, state: ObjectState): Composition {
  return updateItem(c, uid, { state });
}

export function duplicateItem(c: Composition, uid: string, offset = 40): { composition: Composition; uid: string } {
  const idx = c.items.findIndex((i) => i.uid === uid);
  const src = c.items[idx];
  if (!src) return { composition: c, uid };
  const copy: CompositionItem = { ...src, uid: newUid(), x: src.x + offset, y: src.y + offset };
  const items = [...c.items.slice(0, idx + 1), copy, ...c.items.slice(idx + 1)];
  return { composition: { ...c, items }, uid: copy.uid };
}

export function removeItem(c: Composition, uid: string): Composition {
  return { ...c, items: c.items.filter((i) => i.uid !== uid) };
}

export type ReorderDirection = 'up' | 'down' | 'top' | 'bottom';

export function reorderItem(c: Composition, uid: string, dir: ReorderDirection): Composition {
  const idx = c.items.findIndex((i) => i.uid === uid);
  if (idx < 0) return c;
  const items = [...c.items];
  const [item] = items.splice(idx, 1) as [CompositionItem];
  const target =
    dir === 'up' ? Math.min(idx + 1, items.length) : dir === 'down' ? Math.max(idx - 1, 0) : dir === 'top' ? items.length : 0;
  items.splice(target, 0, item);
  return { ...c, items };
}

/** Новый кадр; раскладка сдвигается так, чтобы её центр совпал с центром нового кадра. */
export function setFormat(c: Composition, format: string | { width: number; height: number }): Composition {
  const f = typeof format === 'string' ? formatById(format) : undefined;
  const width = typeof format === 'string' ? f?.width : format.width;
  const height = typeof format === 'string' ? f?.height : format.height;
  if (!width || !height) return c;
  const dx = (width - c.width) / 2;
  const dy = (height - c.height) / 2;
  const { formatId: _old, ...rest } = c;
  return {
    ...rest,
    ...(f ? { formatId: f.id } : {}),
    width,
    height,
    items: c.items.map((i) => ({ ...i, x: i.x + dx, y: i.y + dy })),
  };
}

export function updateComposition(
  c: Composition,
  patch: Partial<Pick<Composition, 'size' | 'schemeId' | 'background' | 'decor'>>,
): Composition {
  return { ...c, ...patch };
}
