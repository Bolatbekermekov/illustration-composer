import type { Library } from '@ic/core';
import { useEditor } from '../store.ts';
import { Icon } from './Icon.tsx';

export function LayersPanel({ lib }: { lib: Library }) {
  const items = useEditor((s) => s.composition.items);
  const selected = useEditor((s) => s.selected);
  const { select, reorderSelected } = useEditor.getState();
  const ordered = [...items].reverse();

  return (
    <section className="panel-section" aria-labelledby="layers-title">
      <h2 id="layers-title">
        <Icon name="list" /> Слои · {items.length}
      </h2>
      {ordered.length === 0 ? <p className="muted small">Пока пусто.</p> : null}
      <ul className="layers" role="listbox" aria-label="Слои композиции">
        {ordered.map((i) => {
          const name = lib.objects.find((o) => o.id === i.objectId)?.name ?? i.objectId;
          const active = i.uid === selected;
          return (
            <li key={i.uid} role="option" aria-selected={active} className={active ? 'active' : ''}>
              <button className="layer-name" onClick={() => select(i.uid)}>
                <span className={`state-dot ${i.state}`} aria-hidden="true" />
                {name}
                {i.state === 'background' ? <span className="muted"> · фон</span> : null}
                {i.rotation ? <span className="muted"> · {Math.round(i.rotation)}°</span> : null}
              </button>
              {active ? (
                <span className="layer-actions">
                  <button className="icon-btn small" onClick={() => reorderSelected('up')} aria-label="Выше">
                    <Icon name="up" size={14} />
                  </button>
                  <button className="icon-btn small" onClick={() => reorderSelected('down')} aria-label="Ниже">
                    <Icon name="down" size={14} />
                  </button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
