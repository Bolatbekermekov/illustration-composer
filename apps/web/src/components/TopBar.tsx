import { readCompositionFromSvg, renderComposition, type Library } from '@ic/core';
import { useRef, useState } from 'react';
import { downloadText } from '../render.ts';
import { useEditor } from '../store.ts';
import { Icon } from './Icon.tsx';
import { useCurrentScheme, useSchemes } from './useScheme.ts';

export function TopBar({
  lib,
  showZone,
  onToggleZone,
  onOpenPalette,
}: {
  lib: Library;
  showZone: boolean;
  onToggleZone: () => void;
  onOpenPalette: () => void;
}) {
  const c = useEditor((s) => s.composition);
  const past = useEditor((s) => s.past.length);
  const future = useEditor((s) => s.future.length);
  const { undo, redo, setFormat, patchComposition, loadComposition, showToast } = useEditor.getState();
  const schemes = useSchemes();
  const scheme = useCurrentScheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const [custom, setCustom] = useState({ w: c.width, h: c.height });
  const formatValue = c.formatId ?? 'custom';

  const exportSvg = () => renderComposition(c, lib, { scheme, title: 'Композиция из библиотеки иллюстраций' });
  const fileName = () => `composition-${scheme.id}-${c.size}-${Math.round(c.width * lib.sizeScale[c.size])}x${Math.round(c.height * lib.sizeScale[c.size])}.svg`;

  return (
    <header className="topbar">
      <div className="brand">
        <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="#7864D7" />
          <path d="M16 6 26 11.5 16 17 6 11.5Z" fill="#D7CDF5" />
          <path d="M6 15.5 16 21l10-5.5V20L16 25.5 6 20Z" fill="#F9ECB0" />
        </svg>
        <span>Illustration Composer</span>
      </div>

      <div className="toolbar-group">
        <label className="field-inline">
          <select
            value={formatValue}
            onChange={(e) => (e.target.value === 'custom' ? setFormat({ width: custom.w, height: custom.h }) : setFormat(e.target.value))}
            aria-label="Формат кадра"
          >
            {lib.formats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
            <option value="custom">Свой размер</option>
          </select>
        </label>
        {formatValue === 'custom' ? (
          <span className="custom-size">
            <input
              type="number"
              min={300}
              max={3000}
              value={custom.w}
              aria-label="Ширина кадра"
              onChange={(e) => setCustom({ ...custom, w: Number(e.target.value) })}
              onBlur={() => setFormat({ width: custom.w, height: custom.h })}
            />
            ×
            <input
              type="number"
              min={300}
              max={3000}
              value={custom.h}
              aria-label="Высота кадра"
              onChange={(e) => setCustom({ ...custom, h: Number(e.target.value) })}
              onBlur={() => setFormat({ width: custom.w, height: custom.h })}
            />
          </span>
        ) : null}

        <div className="segmented" role="radiogroup" aria-label="Размер иллюстраций">
          {(['L', 'S'] as const).map((size) => (
            <button
              key={size}
              role="radio"
              aria-checked={c.size === size}
              className={c.size === size ? 'active' : ''}
              onClick={() => patchComposition({ size })}
              title={size === 'L' ? 'L — детальная отрисовка, кадр в полный размер' : 'S — упрощённая отрисовка, кадр в 2 раза меньше'}
            >
              {size}
            </button>
          ))}
        </div>
        <span className="hint">
          {Math.round(c.width * lib.sizeScale[c.size])}×{Math.round(c.height * lib.sizeScale[c.size])} px
        </span>
      </div>

      <div className="toolbar-group schemes" role="radiogroup" aria-label="Цветовая схема">
        {schemes.map((s) => (
          <button
            key={s.id}
            role="radio"
            aria-checked={s.id === c.schemeId}
            className={`scheme-chip${s.id === c.schemeId ? ' active' : ''}`}
            title={s.name}
            onClick={() => patchComposition({ schemeId: s.id })}
          >
            <span className="dot" style={{ background: s.colors.bg1 }} />
            <span className="dot" style={{ background: s.colors.bg3 }} />
            <span className="dot" style={{ background: s.colors.obj2 }} />
            <span className="label">{s.name}</span>
          </button>
        ))}
        <button className="btn ghost" onClick={onOpenPalette} title="Загрузить или создать палитру">
          <Icon name="palette" /> Палитра
        </button>
      </div>

      <div className="toolbar-group right">
        <button className="icon-btn" onClick={undo} disabled={!past} aria-label="Отменить" title="Отменить (⌘Z)">
          <Icon name="undo" />
        </button>
        <button className="icon-btn" onClick={redo} disabled={!future} aria-label="Повторить" title="Повторить (⇧⌘Z)">
          <Icon name="redo" />
        </button>
        <button className={`icon-btn${showZone ? ' on' : ''}`} onClick={onToggleZone} aria-pressed={showZone} title="Показать зону заголовка">
          <Icon name="info" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".svg,image/svg+xml"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            const comp = readCompositionFromSvg(await file.text());
            if (comp) {
              loadComposition(comp);
              showToast('Композиция открыта для редактирования');
            } else showToast('В этом SVG нет данных композиции — откройте файл, экспортированный из сервиса');
          }}
        />
        <button className="icon-btn" onClick={() => fileRef.current?.click()} title="Открыть ранее экспортированный SVG для редактирования" aria-label="Открыть SVG">
          <Icon name="folderOpen" />
        </button>
        <button
          className="btn ghost"
          disabled={!c.items.length}
          title="Скопировать SVG — вставьте прямо в Figma"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(exportSvg());
              showToast('SVG скопирован — вставьте в Figma (⌘V): объекты останутся векторными группами');
            } catch {
              showToast('Браузер не дал доступ к буферу обмена — используйте «Скачать SVG»');
            }
          }}
        >
          <Icon name="copy" /> Копировать
        </button>
        <button className="btn primary" disabled={!c.items.length} onClick={() => downloadText(fileName(), exportSvg())} title="Скачать SVG" aria-label="Скачать SVG">
          <Icon name="download" /> SVG
        </button>
      </div>
    </header>
  );
}
