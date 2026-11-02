import type { Library, ObjectState } from '@ic/core';
import { useState } from 'react';
import { recolored } from '../render.ts';
import { useEditor } from '../store.ts';
import { DRAG_MIME } from './Canvas.tsx';
import { Icon } from './Icon.tsx';
import { useCurrentScheme } from './useScheme.ts';

export function LibraryPanel({ lib }: { lib: Library }) {
  const [state, setState] = useState<ObjectState>('main');
  const size = useEditor((s) => s.composition.size);
  const addObject = useEditor((s) => s.addObject);
  const scheme = useCurrentScheme();

  return (
    <section className="panel-section" aria-labelledby="lib-title">
      <h2 id="lib-title">
        <Icon name="layers" /> Библиотека · {lib.objects.length} объектов
      </h2>
      <div className="segmented wide" role="radiogroup" aria-label="Состояние добавляемого объекта">
        <button role="radio" aria-checked={state === 'main'} className={state === 'main' ? 'active' : ''} onClick={() => setState('main')}>
          Главный
        </button>
        <button
          role="radio"
          aria-checked={state === 'background'}
          className={state === 'background' ? 'active' : ''}
          onClick={() => setState('background')}
        >
          Фоновый
        </button>
      </div>
      <div className="library-grid">
        {lib.objects.map((o) => {
          const v = o.variants[size][state];
          return (
            <button
              key={o.id}
              className="lib-item"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ objectId: o.id, state }));
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => addObject(o.id, state)}
              title={`${o.name}: клик — в центр кадра, или перетащите на холст`}
            >
              <svg viewBox={`${v.box.x} ${v.box.y} ${v.box.width} ${v.box.height}`} fill="none" aria-hidden="true">
                <rect x={v.box.x - 1000} y={v.box.y - 1000} width={v.box.width + 2000} height={v.box.height + 2000} fill={scheme.colors.bg1} opacity={state === 'background' ? 1 : 0} />
                <g dangerouslySetInnerHTML={{ __html: recolored(lib, o.id, state, size, scheme) }} />
              </svg>
              <span>{o.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
