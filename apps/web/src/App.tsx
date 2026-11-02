import { useEffect, useState } from 'react';
import { api, ApiError } from './api.ts';
import { Canvas } from './components/Canvas.tsx';
import { ComposePanel } from './components/ComposePanel.tsx';
import { Inspector } from './components/Inspector.tsx';
import { LayersPanel } from './components/LayersPanel.tsx';
import { LibraryPanel } from './components/LibraryPanel.tsx';
import { PaletteDialog } from './components/PaletteDialog.tsx';
import { TopBar } from './components/TopBar.tsx';
import { useEditor } from './store.ts';

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return Boolean(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable));
}

export function App() {
  const lib = useEditor((s) => s.library);
  const items = useEditor((s) => s.composition.items.length);
  const toast = useEditor((s) => s.toast);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showZone, setShowZone] = useState(false);

  useEffect(() => {
    const s = useEditor.getState();
    api
      .library()
      .then(s.setLibrary)
      .catch((e: unknown) => setLoadError(e instanceof ApiError ? e.message : 'Не удалось загрузить библиотеку'));
    api.palettes().then((r) => s.setCustomSchemes(r.palettes)).catch(() => undefined);
    api.health().then((h) => s.setLlm(h.llm)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useEditor.getState().showToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const s = useEditor.getState();
      const mod = e.metaKey || e.ctrlKey;
      const sel = s.composition.items.find((i) => i.uid === s.selected);
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        s.duplicateSelected();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault();
        s.removeSelected();
      } else if (e.key === 'Escape') {
        s.select(null);
      } else if (e.code === 'BracketRight' && sel) {
        s.reorderSelected(e.shiftKey ? 'top' : 'up');
      } else if (e.code === 'BracketLeft' && sel) {
        s.reorderSelected(e.shiftKey ? 'bottom' : 'down');
      } else if (sel && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        s.updateItem(sel.uid, { x: sel.x + dx, y: sel.y + dy });
      } else if (sel && e.key.toLowerCase() === 'r' && !mod) {
        s.updateItem(sel.uid, { rotation: sel.rotation + (e.shiftKey ? -15 : 15) });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loadError) {
    return (
      <div className="fatal" role="alert">
        <h1>Библиотека недоступна</h1>
        <p>{loadError}</p>
      </div>
    );
  }
  if (!lib) {
    return (
      <div className="fatal" aria-busy="true">
        <span className="spinner dark" aria-hidden="true" /> Загружаю библиотеку…
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar lib={lib} showZone={showZone} onToggleZone={() => setShowZone((z) => !z)} onOpenPalette={() => setPaletteOpen(true)} />
      <aside className="panel left">
        <ComposePanel lib={lib} />
        <LibraryPanel lib={lib} />
      </aside>
      <main className="workspace">
        <Canvas lib={lib} showZone={showZone} />
        {items === 0 ? (
          <div className="empty-hint">
            <strong>Холст пуст</strong>
            <span>Опишите метафору или перечислите объекты слева — или перетащите объекты из библиотеки.</span>
          </div>
        ) : null}
        <p className="shortcuts">
          Перетаскивание — двигать · ручка над рамкой — поворот (Shift — 15°) · ⌘D дубль · Delete удалить · [ ] слои · ⌘Z отмена
        </p>
      </main>
      <aside className="panel right">
        <Inspector lib={lib} />
        <LayersPanel lib={lib} />
      </aside>
      {paletteOpen ? <PaletteDialog lib={lib} onClose={() => setPaletteOpen(false)} /> : null}
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
