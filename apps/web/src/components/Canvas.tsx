import { decorTransform, headingZone, itemTransform, type CompositionItem, type Library } from '@ic/core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { frameSize, recolored, recolorWith } from '../render.ts';
import { useEditor } from '../store.ts';
import { useCurrentScheme } from './useScheme.ts';

type Gesture =
  | { kind: 'move'; uid: string; startX: number; startY: number; itemX: number; itemY: number; moved: boolean }
  | { kind: 'rotate'; uid: string; cx: number; cy: number };

export const DRAG_MIME = 'application/x-ic-object';

export function Canvas({ lib, showZone }: { lib: Library; showZone: boolean }) {
  const c = useEditor((s) => s.composition);
  const selected = useEditor((s) => s.selected);
  const select = useEditor((s) => s.select);
  const beginGesture = useEditor((s) => s.beginGesture);
  const gestureUpdate = useEditor((s) => s.gestureUpdate);
  const endGesture = useEditor((s) => s.endGesture);
  const addObject = useEditor((s) => s.addObject);
  const scheme = useCurrentScheme();

  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [unitsPerPx, setUnitsPerPx] = useState(1);

  const { W, H, k } = frameSize(c, lib);
  const pad = Math.max(W, H) * 0.16;
  const viewBox = `${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}`;

  // Размер элементов интерфейса (ручки, рамки) — постоянный в экранных пикселях.
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const update = () => {
      const ctm = el.getScreenCTM();
      if (ctm && ctm.a) setUnitsPerPx(1 / ctm.a);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  const toSvg = useCallback((clientX: number, clientY: number) => {
    const el = svgRef.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g) return;
      const p = toSvg(e.clientX, e.clientY);
      if (g.kind === 'move') {
        const dx = (p.x - g.startX) / k;
        const dy = (p.y - g.startY) / k;
        if (!g.moved && Math.hypot(dx, dy) < 1) return;
        g.moved = true;
        gestureUpdate(g.uid, { x: Math.round(g.itemX + dx), y: Math.round(g.itemY + dy) });
      } else {
        let angle = (Math.atan2(p.y - g.cy, p.x - g.cx) * 180) / Math.PI + 90;
        if (e.shiftKey) angle = Math.round(angle / 15) * 15;
        gestureUpdate(g.uid, { rotation: Math.round(angle) });
      }
    };
    const up = () => {
      if (!gesture.current) return;
      gesture.current = null;
      endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [toSvg, k, gestureUpdate, endGesture]);

  const startMove = (e: React.PointerEvent, item: CompositionItem) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    select(item.uid);
    const p = toSvg(e.clientX, e.clientY);
    beginGesture();
    gesture.current = { kind: 'move', uid: item.uid, startX: p.x, startY: p.y, itemX: item.x, itemY: item.y, moved: false };
  };

  const startRotate = (e: React.PointerEvent, item: CompositionItem) => {
    e.stopPropagation();
    e.preventDefault();
    beginGesture();
    gesture.current = { kind: 'rotate', uid: item.uid, cx: item.x * k, cy: item.y * k };
  };

  const decor = useMemo(() => {
    if (c.decor === 'none') return [];
    return lib.decor[c.size]
      .filter((d) => d.set === c.decor)
      .map((d) => ({ id: d.id, transform: decorTransform(d, W, H), html: recolorWith(lib, `decor|${d.id}`, d.markup, scheme) }));
  }, [lib, c.decor, c.size, W, H, scheme]);

  const zone = showZone ? headingZone(W, H) : null;
  const sel = c.items.find((i) => i.uid === selected);
  const selVariant = sel ? lib.objects.find((o) => o.id === sel.objectId)?.variants[c.size][sel.state] : undefined;
  const veil = `M${-pad} ${-pad}h${W + 2 * pad}v${H + 2 * pad}h${-(W + 2 * pad)}Z M0 0v${H}h${W}v${-H}Z`;

  return (
    <svg
      ref={svgRef}
      className="stage"
      viewBox={viewBox}
      fill="none"
      role="application"
      aria-label="Холст композиции"
      onPointerDown={() => select(null)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_MIME)) e.preventDefault();
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData(DRAG_MIME);
        if (!raw) return;
        e.preventDefault();
        const { objectId, state } = JSON.parse(raw) as { objectId: string; state: 'main' | 'background' };
        const p = toSvg(e.clientX, e.clientY);
        addObject(objectId, state, { x: Math.round(p.x / k), y: Math.round(p.y / k) });
      }}
    >
      <defs>
        <clipPath id="editor-frame-clip">
          <rect width={W} height={H} />
        </clipPath>
      </defs>
      <g clipPath="url(#editor-frame-clip)">
        <rect width={W} height={H} fill={scheme.colors[c.background]} />
        {decor.map((d) => (
          <g key={d.id} transform={d.transform} dangerouslySetInnerHTML={{ __html: d.html }} />
        ))}
      </g>
      {c.items.map((item) => {
        const v = lib.objects.find((o) => o.id === item.objectId)?.variants[c.size][item.state];
        if (!v) return null;
        return (
          <g
            key={item.uid}
            className={`item${item.uid === selected ? ' is-selected' : ''}`}
            data-uid={item.uid}
            data-object={item.objectId}
            transform={itemTransform(item, v, k)}
            onPointerDown={(e) => startMove(e, item)}
            dangerouslySetInnerHTML={{ __html: recolored(lib, item.objectId, item.state, c.size, scheme) }}
          />
        );
      })}
      <path d={veil} fillRule="evenodd" className="veil" />
      <rect width={W} height={H} className="frame-outline" style={{ strokeWidth: unitsPerPx }} />
      {zone ? (
        <g className="zone" pointerEvents="none">
          <rect
            x={zone.x + 12 * unitsPerPx}
            y={zone.y + 12 * unitsPerPx}
            width={zone.width - 24 * unitsPerPx}
            height={zone.height - 24 * unitsPerPx}
            style={{ strokeWidth: unitsPerPx * 1.5, strokeDasharray: `${6 * unitsPerPx} ${5 * unitsPerPx}` }}
          />
          <text x={zone.x + 28 * unitsPerPx} y={zone.y + 44 * unitsPerPx} style={{ fontSize: 15 * unitsPerPx }}>
            Зона заголовка (не экспортируется)
          </text>
        </g>
      ) : null}
      {sel && selVariant ? (
        <g transform={`translate(${sel.x * k} ${sel.y * k}) rotate(${sel.rotation})`} className="selection">
          <rect
            x={-selVariant.box.width / 2}
            y={-selVariant.box.height / 2}
            width={selVariant.box.width}
            height={selVariant.box.height}
            style={{ strokeWidth: 1.5 * unitsPerPx }}
            pointerEvents="none"
          />
          <line
            x1={0}
            y1={-selVariant.box.height / 2}
            x2={0}
            y2={-selVariant.box.height / 2 - 28 * unitsPerPx}
            style={{ strokeWidth: 1.5 * unitsPerPx }}
          />
          <circle
            className="rotate-handle"
            cx={0}
            cy={-selVariant.box.height / 2 - 28 * unitsPerPx}
            r={7 * unitsPerPx}
            style={{ strokeWidth: 1.5 * unitsPerPx }}
            onPointerDown={(e) => startRotate(e, sel)}
          >
            <title>Повернуть (Shift — шаг 15°)</title>
          </circle>
        </g>
      ) : null}
    </svg>
  );
}
