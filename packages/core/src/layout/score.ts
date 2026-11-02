import type { Library, LayoutMode, ObjectState } from '../domain/types.ts';
import { GRID, spriteFor, type Sprite } from './sprites.ts';

/**
 * Функция качества раскладки — формализованные правила из вкладок Figma и 18 эталонов дизайнера:
 *  - объекты не масштабируются, кадр их обрезает; «герой» виден целиком, второстепенные — почти целиком;
 *  - фоновые объекты крупные, частично уходят за край и лежат позади/выше главных;
 *  - главные объекты не перекрывают друг друга (кроме «предмет лежит на поверхности»: книга, папка);
 *  - композиция собрана (без дыр), сбалансирована, без «касаний» краёв кадра;
 *  - в режиме «Под заголовок» зона заголовка свободна.
 * Меньше — лучше.
 */

export type LayoutRole = 'hero' | 'support' | 'background';

export interface LayoutItemInput {
  objectId: string;
  state: ObjectState;
  role?: LayoutRole;
  /** Состояние задано пользователем явно — движок не будет переводить объект в фоновый. */
  lockState?: boolean;
}

interface ModeParams {
  heroVis: number;
  supportVis: number;
  surfaceVis: number;
  coverage: [number, number];
}

const MODES: Record<LayoutMode, ModeParams> = {
  compact: { heroVis: 0.97, supportVis: 0.9, surfaceVis: 0.82, coverage: [0.22, 0.6] },
  offset: { heroVis: 0.86, supportVis: 0.62, surfaceVis: 0.45, coverage: [0.3, 0.78] },
  heading: { heroVis: 0.95, supportVis: 0.82, surfaceVis: 0.7, coverage: [0.18, 0.62] },
};

const W = {
  vis: 60,
  bgVis: 20,
  overlap: 40,
  heroCovered: 120,
  bgHidden: 30,
  coverage: 6,
  balance: 6,
  cohesion: 10,
  edge: 0.5,
  depth: 8,
  zone: 60,
};

export interface Zone {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Зона под заголовок: слева для горизонтальных кадров, сверху — для квадратных и вертикальных. */
export function headingZone(width: number, height: number): Zone {
  if (width / height >= 1.25) return { x: 0, y: 0, width: width * 0.42, height };
  return { x: 0, y: 0, width, height: height * (height / width >= 1.25 ? 0.33 : 0.3) };
}

function targetPoint(width: number, height: number, mode: LayoutMode): { x: number; y: number } {
  if (mode !== 'heading') return { x: width / 2, y: height / 2 };
  const z = headingZone(width, height);
  if (z.height === height) return { x: z.width + (width - z.width) / 2, y: height / 2 };
  return { x: width / 2, y: z.height + (height - z.height) / 2 };
}

/** Какую долю силуэта можно показать в кадре (объект по центру; для крупных объектов < 1). */
export function achievableVisibility(s: Sprite, width: number, height: number): number {
  const Wc = Math.ceil(width / GRID);
  const Hc = Math.ceil(height / GRID);
  const ox = Math.round((width / 2 - s.w / 2) / GRID);
  const oy = Math.round((height / 2 - s.h / 2) / GRID);
  let vis = 0;
  for (let r = Math.max(0, -oy); r < Math.min(s.rows, Hc - oy); r++) {
    for (let c = Math.max(0, -ox); c < Math.min(s.cols, Wc - ox); c++) vis += s.cov[r * s.cols + c] as number;
  }
  return s.area > 0 ? vis / s.area : 0;
}

/**
 * Роли: явно заданный герой сохраняется; иначе герой — первый главный предмет (не поверхность),
 * который помещается в кадр (≥ 90% силуэта), а если таких нет — самый «помещающийся».
 */
export function assignRoles(items: LayoutItemInput[], lib: Library, frame?: { width: number; height: number }): LayoutRole[] {
  const kind = (id: string) => lib.objects.find((o) => o.id === id)?.kind ?? 'flat';
  const roles: LayoutRole[] = items.map((i) => (i.state === 'background' ? 'background' : i.role === 'hero' ? 'hero' : 'support'));
  if (roles.includes('hero')) return roles;
  const fit = items.map((i) => (frame && i.state === 'main' ? achievableVisibility(spriteFor(lib, i.objectId, i.state), frame.width, frame.height) : 1));
  const mains = items.map((i, idx) => ({ i, idx })).filter(({ i }) => i.state === 'main');
  const pick =
    mains.find(({ i, idx }) => kind(i.objectId) !== 'surface' && (fit[idx] as number) >= 0.9) ??
    mains.find(({ idx }) => (fit[idx] as number) >= 0.9) ??
    [...mains].sort((a, b) => (fit[b.idx] as number) - (fit[a.idx] as number))[0];
  if (pick) roles[pick.idx] = 'hero';
  return roles;
}

export interface ScoreBreakdown {
  total: number;
  terms: Record<keyof typeof W, number>;
  visibility: number[];
  heroVisibility: number;
  /** Максимально достижимая видимость героя в этом кадре. */
  heroAchievable: number;
  maxMainOverlap: number;
  backgroundVisibility: number[];
  headingZoneCoverage: number;
  coverage: number;
}

/** Быстрый оценщик для оптимизатора: позиции → энергия. */
export class Evaluator {
  readonly n: number;
  readonly sprites: Sprite[];
  readonly roles: LayoutRole[];
  private readonly Wc: number;
  private readonly Hc: number;
  private readonly acc: Uint8Array;
  private readonly mode: ModeParams;
  private readonly zone: Zone | null;
  private readonly target: { x: number; y: number };
  private readonly vis: Float64Array;
  private readonly cx: Float64Array;
  private readonly cy: Float64Array;
  private readonly zoneCov: Float64Array;
  private readonly ox: Int32Array;
  private readonly oy: Int32Array;
  readonly maxVis: number[];

  constructor(
    items: LayoutItemInput[],
    readonly width: number,
    readonly height: number,
    lib: Library,
    readonly modeId: LayoutMode,
    roles?: LayoutRole[],
  ) {
    this.n = items.length;
    this.sprites = items.map((i) => spriteFor(lib, i.objectId, i.state));
    this.maxVis = this.sprites.map((sp) => achievableVisibility(sp, width, height));
    this.roles = roles ?? assignRoles(items, lib, { width, height });
    this.Wc = Math.ceil(width / GRID);
    this.Hc = Math.ceil(height / GRID);
    this.acc = new Uint8Array(this.Wc * this.Hc);
    this.mode = MODES[modeId];
    this.zone = modeId === 'heading' ? headingZone(width, height) : null;
    this.target = targetPoint(width, height, modeId);
    this.vis = new Float64Array(this.n);
    this.cx = new Float64Array(this.n);
    this.cy = new Float64Array(this.n);
    this.zoneCov = new Float64Array(this.n);
    this.ox = new Int32Array(this.n);
    this.oy = new Int32Array(this.n);
  }

  /** i рисуется поверх j? Фон — ниже главных; предмет на поверхности — выше неё; иначе — по линии основания. */
  private above(i: number, j: number, xs: ArrayLike<number>, ys: ArrayLike<number>): boolean {
    const a = this.sprites[i] as Sprite;
    const b = this.sprites[j] as Sprite;
    if (a.state !== b.state) return a.state === 'main';
    const stack = (x: Sprite, y: Sprite) => x.kind === 'flat' && y.kind === 'surface';
    if (a.state === 'main' && (stack(a, b) || stack(b, a))) {
      const [item, surf, itemIdx, surfIdx] = a.kind === 'flat' ? [a, b, i, j] : [b, a, j, i];
      const sx = (xs[surfIdx] as number) - surf.w / 2;
      const sy = (ys[surfIdx] as number) - surf.h / 2;
      const c = Math.floor(((xs[itemIdx] as number) - sx) / GRID);
      const r = Math.floor(((ys[itemIdx] as number) - sy) / GRID);
      const onSurface = c >= 0 && r >= 0 && c < surf.cols && r < surf.rows && (surf.cov[r * surf.cols + c] as number) > 6;
      if (onSurface) return a === item;
    }
    return (ys[i] as number) + a.h / 2 > (ys[j] as number) + b.h / 2;
  }

  energy(xs: ArrayLike<number>, ys: ArrayLike<number>, detail?: { out?: ScoreBreakdown }): number {
    const { n, sprites, Wc, Hc, acc } = this;
    acc.fill(0);
    let zx0 = -1;
    let zx1 = -1;
    let zy0 = -1;
    let zy1 = -1;
    if (this.zone) {
      zx0 = Math.floor(this.zone.x / GRID);
      zy0 = Math.floor(this.zone.y / GRID);
      zx1 = Math.ceil((this.zone.x + this.zone.width) / GRID);
      zy1 = Math.ceil((this.zone.y + this.zone.height) / GRID);
    }

    // 1. Видимость, центр масс видимой части, покрытие зоны заголовка, объединение для заполнения.
    for (let i = 0; i < n; i++) {
      const s = sprites[i] as Sprite;
      const ox = Math.round(((xs[i] as number) - s.w / 2) / GRID);
      const oy = Math.round(((ys[i] as number) - s.h / 2) / GRID);
      this.ox[i] = ox;
      this.oy[i] = oy;
      let vis = 0;
      let sx = 0;
      let sy = 0;
      let z = 0;
      const r0 = Math.max(0, -oy);
      const r1 = Math.min(s.rows, Hc - oy);
      const c0 = Math.max(0, -ox);
      const c1 = Math.min(s.cols, Wc - ox);
      for (let r = r0; r < r1; r++) {
        const fy = oy + r;
        const row = r * s.cols;
        const frow = fy * Wc;
        for (let c = c0; c < c1; c++) {
          const v = s.cov[row + c] as number;
          if (v === 0) continue;
          const fx = ox + c;
          vis += v;
          sx += v * fx;
          sy += v * fy;
          if (fx >= zx0 && fx < zx1 && fy >= zy0 && fy < zy1) z += v;
          if (v > (acc[frow + fx] as number)) acc[frow + fx] = v;
        }
      }
      this.vis[i] = vis;
      this.cx[i] = vis > 0 ? (sx / vis + 0.5) * GRID : (xs[i] as number);
      this.cy[i] = vis > 0 ? (sy / vis + 0.5) * GRID : (ys[i] as number);
      this.zoneCov[i] = z;
    }

    const terms = { vis: 0, bgVis: 0, overlap: 0, heroCovered: 0, bgHidden: 0, coverage: 0, balance: 0, cohesion: 0, edge: 0, depth: 0, zone: 0 };
    const visibility: number[] = [];
    let heroVisibility = 1;
    let heroAchievable = 1;
    const bgVis: number[] = [];

    for (let i = 0; i < n; i++) {
      const s = sprites[i] as Sprite;
      const v = s.area > 0 ? (this.vis[i] as number) / s.area : 0;
      visibility.push(v);
      const role = this.roles[i];
      if (role === 'background') {
        bgVis.push(v);
        terms.bgVis += Math.max(0, 0.3 - v) ** 2 + Math.max(0, v - 0.8) ** 2;
      } else {
        const base = role === 'hero' ? this.mode.heroVis : s.kind === 'surface' ? this.mode.surfaceVis : this.mode.supportVis;
        const need = Math.min(base, 0.96 * (this.maxVis[i] as number));
        terms.vis += Math.max(0, need - v) ** 2;
        if (role === 'hero') {
          heroVisibility = v;
          heroAchievable = this.maxVis[i] as number;
        }
      }
    }

    // 2. Перекрытия (по видимой части): закрываемый — тот, кто ниже по слоям.
    let maxMainOverlap = 0;
    const hiddenBg = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = sprites[i] as Sprite;
        const b = sprites[j] as Sprite;
        const ox0 = Math.max(this.ox[i] as number, this.ox[j] as number, 0);
        const ox1 = Math.min((this.ox[i] as number) + a.cols, (this.ox[j] as number) + b.cols, Wc);
        const oy0 = Math.max(this.oy[i] as number, this.oy[j] as number, 0);
        const oy1 = Math.min((this.oy[i] as number) + a.rows, (this.oy[j] as number) + b.rows, Hc);
        if (ox0 >= ox1 || oy0 >= oy1) continue;
        let ov = 0;
        for (let fy = oy0; fy < oy1; fy++) {
          const ra = (fy - (this.oy[i] as number)) * a.cols - (this.ox[i] as number);
          const rb = (fy - (this.oy[j] as number)) * b.cols - (this.ox[j] as number);
          for (let fx = ox0; fx < ox1; fx++) {
            const va = a.cov[ra + fx] as number;
            if (va === 0) continue;
            const vb = b.cov[rb + fx] as number;
            ov += va < vb ? va : vb;
          }
        }
        if (ov === 0) continue;
        const iTop = this.above(i, j, xs, ys);
        const lower = iTop ? j : i;
        const upper = iTop ? i : j;
        const lowS = sprites[lower] as Sprite;
        const upS = sprites[upper] as Sprite;
        const frac = ov / Math.max(1, this.vis[lower] as number);
        if (lowS.state === 'background') {
          if (upS.state === 'main') hiddenBg[lower] = (hiddenBg[lower] as number) + ov;
          continue;
        }
        if (upS.state === 'background') continue;
        const stacked = lowS.kind === 'surface' && upS.kind === 'flat';
        maxMainOverlap = Math.max(maxMainOverlap, stacked ? 0 : frac);
        if (this.roles[lower] === 'hero') terms.heroCovered += frac ** 2;
        const allowance = stacked ? 0.45 : 0.04;
        terms.overlap += Math.max(0, frac - allowance) ** 2;
      }
    }
    for (let i = 0; i < n; i++) {
      if ((sprites[i] as Sprite).state !== 'background') continue;
      const s = sprites[i] as Sprite;
      const uncovered = ((this.vis[i] as number) - (hiddenBg[i] as number)) / Math.max(1, s.area);
      terms.bgHidden += Math.max(0, 0.32 - uncovered) ** 2;
    }

    // 3. Заполнение кадра (объединение силуэтов).
    let union = 0;
    for (let k = 0; k < acc.length; k++) union += acc[k] as number;
    const coverage = union / (16 * Wc * Hc);
    const [lo, hi] = this.mode.coverage;
    terms.coverage = Math.max(0, lo - coverage) ** 2 + Math.max(0, coverage - hi) ** 2;

    // 4. Баланс: центр масс видимых силуэтов (фон — с весом 0.35) около целевой точки.
    let mx = 0;
    let my = 0;
    let mw = 0;
    for (let i = 0; i < n; i++) {
      const w = ((sprites[i] as Sprite).state === 'background' ? 0.35 : 1) * (this.vis[i] as number);
      mx += w * (this.cx[i] as number);
      my += w * (this.cy[i] as number);
      mw += w;
    }
    if (mw > 0) {
      terms.balance = ((mx / mw - this.target.x) / this.width) ** 2 + ((my / mw - this.target.y) / this.height) ** 2;
    }

    // 5. Связность: главные объекты не «разбегаются». Связкой может служить и фоновый объект под ними.
    const minDim = Math.min(this.width, this.height);
    for (let i = 0; i < n; i++) {
      const a = sprites[i] as Sprite;
      if (a.state === 'background') continue;
      let best = Infinity;
      for (let j = 0; j < n; j++) {
        const b = sprites[j] as Sprite;
        if (i === j) continue;
        const gx = Math.abs((xs[i] as number) - (xs[j] as number)) - (a.w + b.w) / 2;
        const gy = Math.abs((ys[i] as number) - (ys[j] as number)) - (a.h + b.h) / 2;
        best = Math.min(best, Math.max(0, gx, gy));
      }
      if (Number.isFinite(best)) terms.cohesion += Math.max(0, best / minDim - 0.06) ** 2;
    }

    // 6. Касания краёв кадра (почти касается или выступает на волосок) — мягкий штраф, только для главных.
    for (let i = 0; i < n; i++) {
      const s = sprites[i] as Sprite;
      if (s.state === 'background') continue;
      const weight = 1;
      const ex = [
        [(xs[i] as number) - s.w / 2, this.width],
        [this.width - ((xs[i] as number) + s.w / 2), this.width],
        [(ys[i] as number) - s.h / 2, this.height],
        [this.height - ((ys[i] as number) + s.h / 2), this.height],
      ] as const;
      for (const [d, dim] of ex) {
        const thr = 0.02 * dim;
        if (Math.abs(d) < thr) terms.edge += weight * (1 - Math.abs(d) / thr) ** 2;
      }
    }

    // 7. Глубина: фоновые объекты — дальше (выше по кадру), чем главные.
    let mainY = 0;
    let mains = 0;
    for (let i = 0; i < n; i++) {
      if ((sprites[i] as Sprite).state === 'main') {
        mainY += ys[i] as number;
        mains++;
      }
    }
    if (mains > 0) {
      mainY /= mains;
      for (let i = 0; i < n; i++) {
        if ((sprites[i] as Sprite).state !== 'background') continue;
        terms.depth += Math.max(0, ((ys[i] as number) - mainY) / this.height + 0.05) ** 2;
      }
    }

    // 8. Зона заголовка.
    let zoneCoverage = 0;
    if (this.zone) {
      const zoneCells = Math.max(1, (zx1 - zx0) * (zy1 - zy0) * 16);
      let z = 0;
      for (let i = 0; i < n; i++) z += ((sprites[i] as Sprite).state === 'background' ? 0.5 : 1) * (this.zoneCov[i] as number);
      zoneCoverage = z / zoneCells;
      terms.zone = zoneCoverage + 4 * zoneCoverage ** 2;
    }

    let total = 0;
    for (const k of Object.keys(terms) as Array<keyof typeof W>) {
      terms[k] *= W[k];
      total += terms[k];
    }
    if (detail) {
      detail.out = {
        total,
        terms,
        visibility,
        heroVisibility,
        heroAchievable,
        maxMainOverlap,
        backgroundVisibility: bgVis,
        headingZoneCoverage: zoneCoverage,
        coverage,
      };
    }
    return total;
  }
}

export interface LayoutAnalysis extends ScoreBreakdown {
  score: number;
  background: Array<{ objectId: string; visibility: number }>;
}

/**
 * Читаемый разбор готовой раскладки (для тестов, отладки и подсказок в интерфейсе).
 * `heroBy: 'visibility'` — герой определяется как самый видимый главный объект (так читаются эталоны дизайнера).
 */
export function analyzeLayout(
  items: Array<LayoutItemInput & { x: number; y: number }>,
  frame: { width: number; height: number },
  lib: Library,
  mode: LayoutMode = 'compact',
  options: { heroBy?: 'order' | 'visibility' } = {},
): LayoutAnalysis {
  let roles: LayoutRole[] | undefined;
  if (options.heroBy === 'visibility') {
    const probe = new Evaluator(items, frame.width, frame.height, lib, mode);
    const d: { out?: ScoreBreakdown } = {};
    probe.energy(items.map((i) => i.x), items.map((i) => i.y), d);
    const vis = d.out?.visibility ?? [];
    let hero = -1;
    items.forEach((it, i) => {
      if (it.state === 'main' && (hero < 0 || (vis[i] as number) > (vis[hero] as number) + 1e-9)) hero = i;
    });
    roles = items.map((it, i) => (it.state === 'background' ? 'background' : i === hero ? 'hero' : 'support'));
  }
  const ev = new Evaluator(items, frame.width, frame.height, lib, mode, roles);
  const detail: { out?: ScoreBreakdown } = {};
  const score = ev.energy(
    items.map((i) => i.x),
    items.map((i) => i.y),
    detail,
  );
  const out = detail.out as ScoreBreakdown;
  return {
    ...out,
    score,
    background: items
      .map((it, idx) => ({ objectId: it.objectId, visibility: out.visibility[idx] as number, state: it.state }))
      .filter((x) => x.state === 'background')
      .map(({ objectId, visibility }) => ({ objectId, visibility })),
  };
}
