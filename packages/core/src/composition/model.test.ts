import { describe, expect, it } from 'vitest';
import { loadTestLibrary } from '../test-support.ts';
import {
  addItem,
  createComposition,
  duplicateItem,
  moveItem,
  removeItem,
  reorderItem,
  rotateItem,
  setFormat,
  setItemState,
} from './model.ts';
import { autoZOrder } from './zorder.ts';

const lib = loadTestLibrary();
const base = () => createComposition({ formatId: 'square', size: 'L', schemeId: 'lavender' });

describe('composition operations', () => {
  it('creates an empty frame of the requested format', () => {
    const c = base();
    expect(c).toMatchObject({ width: 1000, height: 1000, size: 'L', schemeId: 'lavender', items: [] });
  });

  it('adds an object at the frame centre on top of the stack', () => {
    const a = addItem(base(), 'phone', 'main');
    const b = addItem(a.composition, 'coin', 'main');
    expect(a.composition.items[0]).toMatchObject({ objectId: 'phone', x: 500, y: 500, rotation: 0 });
    expect(b.composition.items.map((i) => i.objectId)).toEqual(['phone', 'coin']);
    expect(b.uid).not.toBe(a.uid);
  });

  it('moves, rotates and changes state without mutating the original', () => {
    const { composition: c, uid } = addItem(base(), 'lamp', 'main');
    const moved = moveItem(c, uid, 120, 340);
    const rotated = rotateItem(moved, uid, 370);
    const bg = setItemState(rotated, uid, 'background');
    expect(c.items[0]).toMatchObject({ x: 500, y: 500, rotation: 0, state: 'main' });
    expect(bg.items[0]).toMatchObject({ x: 120, y: 340, rotation: 10, state: 'background' });
  });

  it('duplicates right above the original with an offset and removes by uid', () => {
    const one = addItem(base(), 'coin', 'main');
    const two = addItem(one.composition, 'pen', 'main');
    const dup = duplicateItem(two.composition, one.uid);
    expect(dup.composition.items.map((i) => i.objectId)).toEqual(['coin', 'coin', 'pen']);
    const copy = dup.composition.items[1];
    expect(copy?.uid).toBe(dup.uid);
    expect(copy?.x).toBeGreaterThan(500);
    const removed = removeItem(dup.composition, one.uid);
    expect(removed.items.map((i) => i.uid)).toEqual([dup.uid, two.uid]);
  });

  it('reorders layers up, down, to top and to bottom', () => {
    let c = base();
    const uids: string[] = [];
    for (const id of ['book', 'phone', 'coin']) {
      const r = addItem(c, id, 'main');
      c = r.composition;
      uids.push(r.uid);
    }
    const [book, phone, coin] = uids as [string, string, string];
    expect(reorderItem(c, book, 'up').items.map((i) => i.uid)).toEqual([phone, book, coin]);
    expect(reorderItem(c, coin, 'down').items.map((i) => i.uid)).toEqual([book, coin, phone]);
    expect(reorderItem(c, book, 'top').items.map((i) => i.uid)).toEqual([phone, coin, book]);
    expect(reorderItem(c, coin, 'bottom').items.map((i) => i.uid)).toEqual([coin, book, phone]);
  });

  it('changing the format keeps the arrangement centred in the new frame', () => {
    const { composition: c } = addItem(base(), 'phone', 'main');
    const wide = setFormat(c, 'wide');
    expect(wide).toMatchObject({ width: 1200, height: 630, formatId: 'wide' });
    expect(wide.items[0]).toMatchObject({ x: 600, y: 315 });
  });
});

describe('autoZOrder (isometric painter order)', () => {
  it('puts background-state objects behind main ones', () => {
    let c = base();
    c = addItem(c, 'headphones', 'main', { x: 500, y: 300 }).composition;
    c = addItem(c, 'flowers', 'background', { x: 500, y: 700 }).composition;
    expect(autoZOrder(c.items, lib, c.size).map((i) => i.objectId)).toEqual(['flowers', 'headphones']);
  });

  it('draws nearer objects (lower base line) later', () => {
    let c = base();
    c = addItem(c, 'coin', 'main', { x: 300, y: 800 }).composition;
    c = addItem(c, 'wallet', 'main', { x: 600, y: 300 }).composition;
    expect(autoZOrder(c.items, lib, c.size).map((i) => i.objectId)).toEqual(['wallet', 'coin']);
  });

  it('keeps an item lying on a surface above that surface', () => {
    let c = base();
    // Телефон лежит на книге: его основание выше основания книги, но он должен быть сверху.
    c = addItem(c, 'phone', 'main', { x: 560, y: 430 }).composition;
    c = addItem(c, 'book', 'main', { x: 300, y: 520 }).composition;
    expect(autoZOrder(c.items, lib, c.size).map((i) => i.objectId)).toEqual(['book', 'phone']);
  });
});
