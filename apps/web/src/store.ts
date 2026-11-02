import {
  addItem as addItemOp,
  createComposition,
  duplicateItem as duplicateOp,
  removeItem as removeOp,
  reorderItem as reorderOp,
  setFormat as setFormatOp,
  updateComposition,
  updateItem as updateItemOp,
  type ColorScheme,
  type ComposedVariant,
  type Composition,
  type CompositionItem,
  type Library,
  type MetaphorAnalysis,
  type ObjectState,
  type ReorderDirection,
} from '@ic/core';
import { create } from 'zustand';

/**
 * Состояние редактора. Композиция меняется только через чистые операции ядра;
 * история (undo/redo) хранит снимки композиции.
 */

const HISTORY_LIMIT = 100;
const STORAGE_KEY = 'ic.composition.v1';

function loadSaved(): Composition | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Composition;
    return Array.isArray(c.items) && typeof c.width === 'number' ? c : null;
  } catch {
    return null;
  }
}

function save(c: Composition) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* приватный режим и т.п. — не критично */
  }
}

export interface EditorState {
  library: Library | null;
  customSchemes: ColorScheme[];
  llm: { enabled: boolean; model?: string };
  composition: Composition;
  selected: string | null;
  past: Composition[];
  future: Composition[];
  /** Снимок до начала перетаскивания/поворота (одна запись в истории на жест). */
  gestureStart: Composition | null;
  variants: ComposedVariant[];
  analysis: MetaphorAnalysis | null;
  busy: boolean;
  error: string | null;
  toast: string | null;

  setLibrary(lib: Library): void;
  setCustomSchemes(s: ColorScheme[]): void;
  setLlm(l: { enabled: boolean; model?: string }): void;
  /** Применить изменение композиции с записью в историю. */
  commit(next: Composition): void;
  select(uid: string | null): void;
  undo(): void;
  redo(): void;

  addObject(objectId: string, state: ObjectState, at?: { x: number; y: number }): void;
  updateItem(uid: string, patch: Partial<Omit<CompositionItem, 'uid'>>): void;
  removeSelected(): void;
  duplicateSelected(): void;
  reorderSelected(dir: ReorderDirection): void;
  setFormat(format: string | { width: number; height: number }): void;
  patchComposition(patch: Parameters<typeof updateComposition>[1]): void;
  loadComposition(c: Composition): void;
  clear(): void;

  beginGesture(): void;
  /** Живое изменение во время жеста — без записи в историю. */
  gestureUpdate(uid: string, patch: Partial<Omit<CompositionItem, 'uid'>>): void;
  endGesture(): void;

  setVariants(v: ComposedVariant[], analysis: MetaphorAnalysis | null): void;
  setBusy(b: boolean): void;
  setError(e: string | null): void;
  showToast(t: string | null): void;
}

const initial = loadSaved() ?? createComposition({ formatId: 'square', size: 'L', schemeId: 'lavender', decor: 'strokes' });

export const useEditor = create<EditorState>((set, get) => ({
  library: null,
  customSchemes: [],
  llm: { enabled: false },
  composition: initial,
  selected: null,
  past: [],
  future: [],
  gestureStart: null,
  variants: [],
  analysis: null,
  busy: false,
  error: null,
  toast: null,

  setLibrary: (library) => set({ library }),
  setCustomSchemes: (customSchemes) => set({ customSchemes }),
  setLlm: (llm) => set({ llm }),

  commit(next) {
    const { composition, past } = get();
    if (next === composition) return;
    save(next);
    set({ composition: next, past: [...past, composition].slice(-HISTORY_LIMIT), future: [] });
  },
  select: (selected) => set({ selected }),
  undo() {
    const { past, composition, future, selected } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    save(prev);
    set({
      composition: prev,
      past: past.slice(0, -1),
      future: [composition, ...future],
      selected: prev.items.some((i) => i.uid === selected) ? selected : null,
    });
  },
  redo() {
    const { past, composition, future, selected } = get();
    const next = future[0];
    if (!next) return;
    save(next);
    set({
      composition: next,
      past: [...past, composition],
      future: future.slice(1),
      selected: next.items.some((i) => i.uid === selected) ? selected : null,
    });
  },

  addObject(objectId, state, at) {
    const { composition: c } = get();
    const r = addItemOp(c, objectId, state, at);
    get().commit(r.composition);
    set({ selected: r.uid });
  },
  updateItem(uid, patch) {
    get().commit(updateItemOp(get().composition, uid, patch));
  },
  removeSelected() {
    const { selected, composition } = get();
    if (!selected) return;
    get().commit(removeOp(composition, selected));
    set({ selected: null });
  },
  duplicateSelected() {
    const { selected, composition } = get();
    if (!selected) return;
    const r = duplicateOp(composition, selected);
    get().commit(r.composition);
    set({ selected: r.uid });
  },
  reorderSelected(dir) {
    const { selected, composition } = get();
    if (selected) get().commit(reorderOp(composition, selected, dir));
  },
  setFormat(format) {
    get().commit(setFormatOp(get().composition, format));
  },
  patchComposition(patch) {
    get().commit(updateComposition(get().composition, patch));
  },
  loadComposition(c) {
    get().commit(c);
    set({ selected: null });
  },
  clear() {
    const c = get().composition;
    get().commit({ ...c, items: [] });
    set({ selected: null });
  },

  beginGesture: () => set({ gestureStart: get().composition }),
  gestureUpdate(uid, patch) {
    set({ composition: updateItemOp(get().composition, uid, patch) });
  },
  endGesture() {
    const { gestureStart, composition, past } = get();
    if (gestureStart && gestureStart !== composition) {
      save(composition);
      set({ past: [...past, gestureStart].slice(-HISTORY_LIMIT), future: [] });
    }
    set({ gestureStart: null });
  },

  setVariants: (variants, analysis) => set({ variants, analysis }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
  showToast: (toast) => set({ toast }),
}));

/** Все доступные схемы: встроенные из библиотеки + загруженные. */
export function allSchemes(lib: Library | null, custom: ColorScheme[]): ColorScheme[] {
  return [...(lib?.schemes ?? []), ...custom];
}
