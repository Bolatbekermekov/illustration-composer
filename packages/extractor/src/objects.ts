import {
  BASE_SCHEME,
  CATALOG,
  COLOR_ROLES,
  collectColors,
  type Box,
  type ColorRole,
  type ObjectState,
  type ObjectVariant,
  type SizeClass,
} from '@ic/core';
import type { Element } from '@xmldom/xmldom';
import { baseName, descendants, elementChildren, serialize, type FigmaSvg } from './figma.ts';
import { cleanMarkup } from './markup.ts';
import { bboxOf, renderMask, visualBox } from './raster.ts';

export const MASK_CELL = 8;

interface Candidate {
  el: Element;
  name: string;
  objectId?: string;
  state: ObjectState;
  box: Box;
  markup: string;
}

const round = (v: number) => Math.round(v * 100) / 100;
const roundBox = (b: Box): Box => ({ x: round(b.x), y: round(b.y), width: round(b.width), height: round(b.height) });

/** Плашки палитры: группа из ≥ 6 прямоугольников без вложенных групп. */
function isPalette(el: Element): boolean {
  const kids = elementChildren(el);
  return kids.filter((k) => k.tagName === 'rect').length >= 6 && !kids.some((k) => k.tagName === 'g');
}

const BG_ONLY = new Set([BASE_SCHEME.colors.bg1, BASE_SCHEME.colors.bg2, BASE_SCHEME.colors.bg3]);

export function stateFromColors(markup: string): ObjectState {
  const colors = [...collectColors(markup).keys()];
  return colors.length > 0 && colors.every((c) => BG_ONLY.has(c)) ? 'background' : 'main';
}

function resolveByName(el: Element): string | undefined {
  const names = [baseName(el), ...descendants(el).filter((d) => d.tagName === 'g').map(baseName)];
  for (const n of names) {
    const hit = CATALOG.find((c) => c.figmaNames.includes(n));
    if (hit) return hit.id;
  }
  return undefined;
}

export interface ExtractedObjects {
  variants: ObjectVariant[];
  /** Пропорции главных вариантов — эталон для распознавания безымянных групп в другом размере. */
  aspects: Record<string, number>;
}

/**
 * Находит в кадре библиотеки все объекты (главные и фоновые), распознаёт их по именам слоёв,
 * а безымянные группы — по пропорциям относительно эталона (или как единственный оставшийся объект).
 */
export function extractObjects(fig: FigmaSvg, size: SizeClass, referenceAspects?: Record<string, number>): ExtractedObjects {
  const candidates: Candidate[] = [];
  for (const el of elementChildren(fig.frame)) {
    if (el.tagName !== 'g') continue;
    const name = baseName(el);
    if (name === 'Фон' || isPalette(el)) continue;
    const markup = cleanMarkup(el);
    const geom = bboxOf(serialize(el), fig.viewBox);
    if (!geom || geom.width < 40 || geom.height < 40) continue;
    const box = visualBox(markup, geom);
    candidates.push({ el, name, objectId: resolveByName(el), state: stateFromColors(markup), box, markup });
  }

  const assigned = new Set(candidates.flatMap((c) => (c.objectId ? [c.objectId] : [])));
  const remaining = CATALOG.map((c) => c.id).filter((id) => !assigned.has(id));
  for (const c of candidates.filter((x) => !x.objectId)) {
    if (remaining.length === 1) {
      c.objectId = remaining[0];
      continue;
    }
    if (!referenceAspects) continue;
    const aspect = Math.log(c.box.width / c.box.height);
    let best: string | undefined;
    let bestErr = Infinity;
    for (const id of remaining) {
      const ref = referenceAspects[id];
      if (ref === undefined) continue;
      const err = Math.abs(aspect - Math.log(ref));
      if (err < bestErr) {
        bestErr = err;
        best = id;
      }
    }
    if (best && bestErr < 0.05) c.objectId = best;
  }

  const variants: ObjectVariant[] = [];
  for (const def of CATALOG) {
    for (const state of ['main', 'background'] as const) {
      const hits = candidates.filter((c) => c.objectId === def.id && c.state === state);
      if (hits.length !== 1) {
        throw new Error(
          `Размер ${size}: для «${def.name}» (${state}) найдено ${hits.length} групп. ` +
            `Нераспознанные: ${candidates.filter((c) => !c.objectId).map((c) => c.name).join(', ') || '—'}`,
        );
      }
      const hit = hits[0] as Candidate;
      variants.push({
        objectId: def.id,
        size,
        state,
        file: `objects/${size}/${def.id}.${state}.svg`,
        box: roundBox(hit.box),
        markup: hit.markup,
        roles: roleUsage(hit.markup),
        mask: renderMask(hit.markup, hit.box, MASK_CELL),
      });
    }
  }
  const aspects: Record<string, number> = {};
  for (const v of variants) if (v.state === 'main') aspects[v.objectId] = v.box.width / v.box.height;
  return { variants, aspects };
}

function roleUsage(markup: string): Partial<Record<ColorRole, number>> {
  const byHex = new Map(COLOR_ROLES.map((r) => [BASE_SCHEME.colors[r], r] as const));
  const out: Partial<Record<ColorRole, number>> = {};
  for (const [hex, n] of collectColors(markup)) {
    const role = byHex.get(hex);
    if (role) out[role] = (out[role] ?? 0) + n;
  }
  return out;
}
