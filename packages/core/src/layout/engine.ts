import { autoZOrder } from '../composition/zorder.ts';
import type { CompositionItem, DecorSetId, ExampleLayout, LayoutMode, Library, ObjectState } from '../domain/types.ts';
import { createRng, gaussian } from './prng.ts';
import { assignRoles, Evaluator, type LayoutItemInput, type LayoutRole } from './score.ts';

export interface LayoutRequest {
  items: LayoutItemInput[];
  /** Кадр в единицах L. */
  width: number;
  height: number;
  mode?: LayoutMode;
  seed?: number;
  /** Сколько различных вариантов вернуть. */
  variants?: number;
  /** Итераций отжига на один старт. */
  iterations?: number;
}

export interface LayoutVariant {
  /** Элементы в порядке слоёв (снизу вверх), координаты — центры в единицах L. */
  items: Array<{ objectId: string; state: ObjectState; x: number; y: number }>;
  score: number;
  mode: LayoutMode;
  /** Откуда старт: example:<id> (эталон дизайнера), pattern:<id> (по ролям эталона), heuristic, random. */
  source: string;
  decor: DecorSetId;
}

interface Start {
  source: string;
  xs: Float64Array;
  ys: Float64Array;
}

interface Candidate extends Start {
  e: number;
}

const key = (i: { objectId: string; state: ObjectState }) => `${i.objectId}:${i.state}`;

/** Перенос позиций эталона в кадр другого размера (пропорционально). */
function transfer(ex: ExampleLayout, idx: number, width: number, height: number): [number, number] {
  const it = ex.items[idx] as ExampleLayout['items'][number];
  return [(it.x / ex.width) * width, (it.y / ex.height) * height];
}

function exampleStarts(req: LayoutRequest, lib: Library, roles: LayoutRole[]): Start[] {
  const n = req.items.length;
  const aspect = req.width / req.height;
  const byAspect = [...lib.examples].sort(
    (a, b) => Math.abs(Math.log(a.width / a.height / aspect)) - Math.abs(Math.log(b.width / b.height / aspect)),
  );
  const exact: Start[] = [];
  const pattern: Start[] = [];
  const area = (id: string, state: ObjectState) => {
    const v = lib.objects.find((o) => o.id === id)?.variants.L[state];
    return v ? v.box.width * v.box.height : 0;
  };

  for (const ex of byAspect) {
    if (ex.items.length !== n) continue;
    // Точное совпадение набора объектов и состояний → берём раскладку дизайнера.
    const used = new Set<number>();
    const map: number[] = [];
    for (const it of req.items) {
      const j = ex.items.findIndex((e, k) => !used.has(k) && key(e) === key(it));
      if (j < 0) break;
      used.add(j);
      map.push(j);
    }
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    if (map.length === n) {
      map.forEach((j, i) => {
        [xs[i], ys[i]] = transfer(ex, j, req.width, req.height);
      });
      exact.push({ source: `example:${ex.id}`, xs, ys });
      continue;
    }
    // Совпадение по ролям (фон / герой / второстепенные по убыванию размера).
    const exRoles = assignRoles(ex.items, lib, ex);
    const order = (rs: LayoutRole[], items: Array<{ objectId: string; state: ObjectState }>) =>
      items
        .map((it, i) => ({ i, role: rs[i] as LayoutRole, a: area(it.objectId, it.state) }))
        .sort((p, q) => p.role.localeCompare(q.role) || q.a - p.a);
    const a = order(roles, req.items);
    const b = order(exRoles, ex.items);
    if (a.some((x, k) => x.role !== b[k]?.role)) continue;
    a.forEach((x, k) => {
      [xs[x.i], ys[x.i]] = transfer(ex, (b[k] as { i: number }).i, req.width, req.height);
    });
    pattern.push({ source: `pattern:${ex.id}`, xs, ys });
  }
  return [...exact.slice(0, 3), ...pattern.slice(0, 3)];
}

function heuristicStart(req: LayoutRequest, ev: Evaluator, rng: () => number, kind: 'heuristic' | 'random'): Start {
  const n = req.items.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const { width: W, height: H } = req;
  const hero = ev.roles.indexOf('hero');
  const hx = W * (0.4 + 0.2 * rng());
  const hy = H * (0.45 + 0.15 * rng());
  let angle = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const s = ev.sprites[i];
    if (!s) continue;
    if (ev.roles[i] === 'background') {
      xs[i] = W * (rng() < 0.5 ? 0.15 + 0.2 * rng() : 0.65 + 0.2 * rng());
      ys[i] = H * (0.05 + 0.2 * rng()) - s.h * 0.15;
    } else if (kind === 'random') {
      xs[i] = W * (0.2 + 0.6 * rng());
      ys[i] = H * (0.25 + 0.55 * rng());
    } else if (i === hero || hero < 0) {
      xs[i] = hx;
      ys[i] = hy;
    } else {
      const hs = ev.sprites[hero] ?? s;
      const r = 0.45 * (Math.hypot(hs.w, hs.h) + Math.hypot(s.w, s.h)) * (0.8 + 0.3 * rng());
      // Изометрические направления (±30°) дают естественную «сцену на столе».
      const iso = [Math.PI / 6, (5 * Math.PI) / 6, (7 * Math.PI) / 6, (11 * Math.PI) / 6];
      const a = (iso[Math.floor(rng() * 4)] as number) + (angle += 0.7) * 0;
      xs[i] = hx + Math.cos(a) * r;
      ys[i] = hy + Math.sin(a) * r;
    }
  }
  return { source: kind, xs, ys };
}

function anneal(ev: Evaluator, start: Start, rng: () => number, iterations: number, W: number, H: number): Candidate {
  const n = ev.n;
  const xs = Float64Array.from(start.xs);
  const ys = Float64Array.from(start.ys);
  let e = ev.energy(xs, ys);
  let best: Candidate = { ...start, xs: Float64Array.from(xs), ys: Float64Array.from(ys), e };
  const minDim = Math.min(W, H);
  const T0 = 0.6;
  const T1 = 0.003;
  for (let k = 0; k < iterations; k++) {
    const t = k / iterations;
    const T = T0 * (T1 / T0) ** t;
    const sigma = minDim * (0.2 * (1 - t) + 0.012);
    const i = Math.floor(rng() * n);
    const j = Math.floor(rng() * n);
    const swap = n > 1 && i !== j && rng() < 0.06 && ev.sprites[i]?.state === ev.sprites[j]?.state;
    const px = xs[i] as number;
    const py = ys[i] as number;
    const qx = xs[j] as number;
    const qy = ys[j] as number;
    if (swap) {
      xs[i] = qx;
      ys[i] = qy;
      xs[j] = px;
      ys[j] = py;
    } else {
      xs[i] = Math.min(1.3 * W, Math.max(-0.3 * W, px + gaussian(rng) * sigma));
      ys[i] = Math.min(1.3 * H, Math.max(-0.4 * H, py + gaussian(rng) * sigma * 0.85));
    }
    const e2 = ev.energy(xs, ys);
    if (e2 <= e || rng() < Math.exp((e - e2) / T)) {
      e = e2;
      if (e < best.e) best = { source: start.source, xs: Float64Array.from(xs), ys: Float64Array.from(ys), e };
    } else {
      xs[i] = px;
      ys[i] = py;
      if (swap) {
        xs[j] = qx;
        ys[j] = qy;
      }
    }
  }
  return best;
}

function similar(a: Candidate, b: Candidate, W: number, H: number): boolean {
  for (let i = 0; i < a.xs.length; i++) {
    if (Math.abs((a.xs[i] as number) - (b.xs[i] as number)) / W + Math.abs((a.ys[i] as number) - (b.ys[i] as number)) / H > 0.09) {
      return false;
    }
  }
  return true;
}

/** Декор из библиотеки: «плоскость» для сцен с поверхностями/крупным фоном, иначе «штрихи». */
export function pickDecor(items: Array<{ objectId: string; state: ObjectState }>, lib: Library): DecorSetId {
  const heavy = items.some((i) => lib.objects.find((o) => o.id === i.objectId)?.kind === 'surface' || (i.objectId === 'lamp' && i.state === 'background'));
  return heavy ? 'plane' : 'strokes';
}

/**
 * Варианты состояний. Если крупные объекты не помещаются в кадр главными, дизайнер переводит
 * «контекстный» объект (книгу, лампу, папку…) в фоновое состояние — это разрешено правилами библиотеки.
 * Объекты с явно заданным состоянием (lockState) не трогаем; первый главный объект — смысловой центр — тоже.
 */
function stateConfigs(req: LayoutRequest, lib: Library): Array<{ items: LayoutItemInput[]; penalty: number; label: string }> {
  const configs = [{ items: req.items, penalty: 0, label: '' }];
  const area = (id: string) => {
    const v = lib.objects.find((o) => o.id === id)?.variants.L.main;
    return v ? v.box.width * v.box.height : 0;
  };
  const mains = req.items.map((it, i) => ({ it, i })).filter(({ it }) => it.state === 'main');
  if (mains.length < 2) return configs;
  const first = mains[0]?.i;
  const demotable = mains
    .filter(({ it, i }) => i !== first && !it.lockState && it.role !== 'hero')
    .sort((a, b) => area(b.it.objectId) - area(a.it.objectId));
  const frameArea = req.width * req.height;
  for (const d of demotable.slice(0, mains.length >= 3 ? 2 : 1)) {
    if (area(d.it.objectId) < 0.12 * frameArea) continue; // мелкие предметы фоном не делаем
    const items = req.items.map((it, i) => (i === d.i ? { ...it, state: 'background' as const } : it));
    configs.push({ items, penalty: 0.25, label: `+фон:${d.it.objectId}` });
  }
  return configs;
}

/**
 * Авто-раскладка: объекты в натуральном масштабе, оптимизация позиций (отжиг) из нескольких стартов —
 * эталоны дизайнера, раскладки «по ролям» эталонов, эвристики и случайные. Детерминирована по seed.
 */
export function autoLayout(req: LayoutRequest, lib: Library): LayoutVariant[] {
  const mode = req.mode ?? 'compact';
  const n = req.items.length;
  if (n === 0) return [];
  const rng = createRng(req.seed ?? 1);
  const iterations = req.iterations ?? 900;
  const wanted = req.variants ?? 4;

  const candidates: Array<Candidate & { items: LayoutItemInput[] }> = [];
  for (const config of stateConfigs(req, lib)) {
    const creq = { ...req, items: config.items };
    const ev = new Evaluator(config.items, req.width, req.height, lib, mode);
    const starts: Start[] = [...exampleStarts(creq, lib, ev.roles)];
    for (let k = 0; k < 4; k++) starts.push(heuristicStart(creq, ev, rng, 'heuristic'));
    for (let k = 0; k < 2; k++) starts.push(heuristicStart(creq, ev, rng, 'random'));
    for (const s of starts) {
      const src = { ...s, source: s.source + config.label };
      if (s.source.startsWith('example:')) candidates.push({ ...src, e: ev.energy(s.xs, s.ys) + config.penalty, items: config.items });
      const best = anneal(ev, src, rng, iterations, req.width, req.height);
      candidates.push({ ...best, e: best.e + config.penalty, items: config.items });
    }
  }
  candidates.sort((a, b) => a.e - b.e);

  const same = (a: (typeof candidates)[number], b: (typeof candidates)[number]) =>
    a.items === b.items && similar(a, b, req.width, req.height);
  const picked: typeof candidates = [];
  for (const c of candidates) {
    if (picked.length >= wanted) break;
    if (!picked.some((p) => same(p, c))) picked.push(c);
  }
  // Эталон дизайнера для того же набора объектов всегда попадает в варианты.
  const designer = candidates.find((c) => c.source.startsWith('example:'));
  if (designer && !picked.includes(designer) && !picked.some((p) => same(p, designer))) {
    picked[picked.length - 1] = designer;
    picked.sort((a, b) => a.e - b.e);
  }

  return picked.map((c) => {
    const decor = pickDecor(c.items, lib);
    const placed: CompositionItem[] = c.items.map((it, i) => ({
      uid: String(i),
      objectId: it.objectId,
      state: it.state,
      x: Math.round(c.xs[i] as number),
      y: Math.round(c.ys[i] as number),
      rotation: 0,
    }));
    return {
      items: autoZOrder(placed, lib, 'L').map(({ objectId, state, x, y }) => ({ objectId, state, x, y })),
      score: Math.round(c.e * 1000) / 1000,
      mode,
      source: c.source,
      decor,
    };
  });
}
