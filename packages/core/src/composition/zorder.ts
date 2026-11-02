import type { CompositionItem, Library, LibraryObject, SizeClass, SilhouetteMask } from '../domain/types.ts';
import { decodeMask } from '../layout/mask.ts';

const maskCache = new WeakMap<SilhouetteMask, Uint8Array>();
function cells(mask: SilhouetteMask): Uint8Array {
  let c = maskCache.get(mask);
  if (!c) {
    c = decodeMask(mask);
    maskCache.set(mask, c);
  }
  return c;
}

/** Лежит ли точка (в единицах L) на силуэте объекта-поверхности. */
function onSilhouette(surface: CompositionItem, obj: LibraryObject, px: number, py: number): boolean {
  const v = obj.variants.L[surface.state];
  const lx = px - (surface.x - v.box.width / 2);
  const ly = py - (surface.y - v.box.height / 2);
  const col = Math.floor(lx / v.mask.cell);
  const row = Math.floor(ly / v.mask.cell);
  if (col < 0 || row < 0 || col >= v.mask.cols || row >= v.mask.rows) return false;
  return cells(v.mask)[row * v.mask.cols + col] === 1;
}

/**
 * Порядок слоёв для изометрической сцены:
 * фоновые объекты — позади главных; внутри группы ближе к зрителю тот, у кого ниже «линия основания»;
 * предмет, лежащий на поверхности (книга, папка), всегда рисуется поверх неё.
 */
export function autoZOrder(items: CompositionItem[], lib: Library, _size: SizeClass): CompositionItem[] {
  const objects = new Map(lib.objects.map((o) => [o.id, o]));
  const baseline = (i: CompositionItem) => {
    const o = objects.get(i.objectId);
    return i.y + (o ? o.variants.L[i.state].box.height / 2 : 0);
  };
  const sorted = [...items].sort(
    (a, b) => (a.state === 'background' ? 0 : 1) - (b.state === 'background' ? 0 : 1) || baseline(a) - baseline(b),
  );

  const surfaces = sorted.filter((i) => i.state === 'main' && objects.get(i.objectId)?.kind === 'surface');
  for (let pass = 0; pass < items.length; pass++) {
    let changed = false;
    for (const s of surfaces) {
      const so = objects.get(s.objectId) as LibraryObject;
      for (const a of [...sorted]) {
        if (a === s || a.state !== 'main' || objects.get(a.objectId)?.kind === 'surface') continue;
        if (!onSilhouette(s, so, a.x, a.y)) continue;
        const ia = sorted.indexOf(a);
        const is = sorted.indexOf(s);
        if (ia < is) {
          sorted.splice(ia, 1);
          sorted.splice(sorted.indexOf(s) + 1, 0, a);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return sorted;
}
