import { autoZOrder, newUid, type LayoutMode, type Library } from '@ic/core';
import { useState } from 'react';
import { api, ApiError } from '../api.ts';
import { useEditor } from '../store.ts';
import { Icon } from './Icon.tsx';
import { useCurrentScheme } from './useScheme.ts';

export function Inspector({ lib }: { lib: Library }) {
  const c = useEditor((s) => s.composition);
  const selected = useEditor((s) => s.selected);
  const { updateItem, removeSelected, duplicateSelected, reorderSelected, patchComposition, commit, clear, showToast } = useEditor.getState();
  const scheme = useCurrentScheme();
  const item = c.items.find((i) => i.uid === selected);
  const obj = item ? lib.objects.find((o) => o.id === item.objectId) : undefined;
  const [relayoutMode, setRelayoutMode] = useState<LayoutMode>('compact');
  const [busy, setBusy] = useState(false);

  const relayout = async () => {
    if (!c.items.length) return;
    setBusy(true);
    try {
      const res = await api.layout({
        items: c.items.map((i) => ({ objectId: i.objectId, state: i.state, lockState: true })),
        width: c.width,
        height: c.height,
        mode: relayoutMode,
        seed: Math.floor(Math.random() * 1e6),
        variants: 1,
      });
      const v = res.variants[0];
      if (v) {
        commit({ ...c, items: v.items.map((it) => ({ uid: newUid(), objectId: it.objectId, state: it.state, x: it.x, y: it.y, rotation: 0 })) });
      }
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Не удалось переразложить');
    } finally {
      setBusy(false);
    }
  };

  if (item && obj) {
    return (
      <section className="panel-section" aria-labelledby="insp-title">
        <h2 id="insp-title">{obj.name}</h2>
        <div className="segmented wide" role="radiogroup" aria-label="Состояние объекта">
          <button role="radio" aria-checked={item.state === 'main'} className={item.state === 'main' ? 'active' : ''} onClick={() => updateItem(item.uid, { state: 'main' })}>
            Главный
          </button>
          <button
            role="radio"
            aria-checked={item.state === 'background'}
            className={item.state === 'background' ? 'active' : ''}
            onClick={() => updateItem(item.uid, { state: 'background' })}
          >
            Фоновый
          </button>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>X</span>
            <input type="number" value={Math.round(item.x)} onChange={(e) => updateItem(item.uid, { x: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>Y</span>
            <input type="number" value={Math.round(item.y)} onChange={(e) => updateItem(item.uid, { y: Number(e.target.value) })} />
          </label>
        </div>
        <label className="field">
          <span>Поворот: {Math.round(item.rotation)}°</span>
          <input type="range" min={-180} max={180} step={1} value={item.rotation} onChange={(e) => updateItem(item.uid, { rotation: Number(e.target.value) })} />
        </label>
        <div className="btn-row">
          <button className="icon-btn" onClick={() => updateItem(item.uid, { rotation: 0 })} title="Сбросить поворот" aria-label="Сбросить поворот">
            <Icon name="rotate" />
          </button>
          <button className="icon-btn" onClick={() => updateItem(item.uid, { flipX: !item.flipX })} aria-pressed={Boolean(item.flipX)} title="Отразить по горизонтали" aria-label="Отразить по горизонтали">
            <Icon name="flip" />
          </button>
          <button className="icon-btn" onClick={duplicateSelected} title="Дублировать (⌘D)" aria-label="Дублировать">
            <Icon name="duplicate" />
          </button>
          <button className="icon-btn danger" onClick={removeSelected} title="Удалить (Delete)" aria-label="Удалить">
            <Icon name="trash" />
          </button>
        </div>
        <div className="btn-row">
          <button className="icon-btn" onClick={() => reorderSelected('top')} title="На передний план (⇧])" aria-label="На передний план">
            <Icon name="top" />
          </button>
          <button className="icon-btn" onClick={() => reorderSelected('up')} title="Выше (])" aria-label="Выше">
            <Icon name="up" />
          </button>
          <button className="icon-btn" onClick={() => reorderSelected('down')} title="Ниже ([)" aria-label="Ниже">
            <Icon name="down" />
          </button>
          <button className="icon-btn" onClick={() => reorderSelected('bottom')} title="На задний план (⇧[)" aria-label="На задний план">
            <Icon name="bottom" />
          </button>
        </div>
        <p className="muted small">Масштаб объектов не меняется — пропорции между объектами по правилам библиотеки фиксированы.</p>
      </section>
    );
  }

  return (
    <section className="panel-section" aria-labelledby="comp-title">
      <h2 id="comp-title">Композиция</h2>
      <label className="field">
        <span>Фон кадра</span>
        <div className="swatches" role="radiogroup" aria-label="Цвет фона">
          {(['bg1', 'bg2', 'bg3'] as const).map((role) => (
            <button
              key={role}
              role="radio"
              aria-checked={c.background === role}
              className={`swatch${c.background === role ? ' active' : ''}`}
              style={{ background: scheme.colors[role] }}
              onClick={() => patchComposition({ background: role })}
              title={role === 'bg1' ? 'Светлый' : role === 'bg2' ? 'Средний' : 'Тёмный'}
            />
          ))}
        </div>
      </label>
      <label className="field">
        <span>Декор из тайлов библиотеки</span>
        <select value={c.decor} onChange={(e) => patchComposition({ decor: e.target.value as 'strokes' | 'plane' | 'none' })}>
          <option value="strokes">Штрихи и конфетти</option>
          <option value="plane">Плоскость и линии</option>
          <option value="none">Без декора</option>
        </select>
      </label>
      <label className="field">
        <span>Авто-раскладка текущих объектов</span>
        <select value={relayoutMode} onChange={(e) => setRelayoutMode(e.target.value as LayoutMode)}>
          <option value="compact">Собранно</option>
          <option value="offset">Со смещением</option>
          <option value="heading">Под заголовок</option>
        </select>
      </label>
      <button className="btn" onClick={relayout} disabled={busy || !c.items.length} title="Разложить текущие объекты автоматически">
        {busy ? <span className="spinner dark" aria-hidden="true" /> : <Icon name="shuffle" />} Переразложить
      </button>
      <div className="btn-row">
        <button
          className="btn ghost"
          disabled={!c.items.length}
          onClick={() => commit({ ...c, items: autoZOrder(c.items, lib, c.size) })}
          title="Расставить слои по глубине изометрической сцены"
        >
          <Icon name="layers" /> Слои по глубине
        </button>
        <button className="btn ghost danger" disabled={!c.items.length} onClick={clear}>
          <Icon name="trash" /> Очистить
        </button>
      </div>
      <p className="muted small">Выберите объект на холсте, чтобы двигать, поворачивать, дублировать или менять состояние.</p>
    </section>
  );
}
