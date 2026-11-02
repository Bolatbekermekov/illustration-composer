import { COLOR_ROLES, normalizeHex, parsePalette, ROLE_LABELS, validateScheme, type ColorRole, type ColorScheme, type Library } from '@ic/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api.ts';
import { useEditor } from '../store.ts';
import { Icon } from './Icon.tsx';
import { useCurrentScheme } from './useScheme.ts';
import { VariantThumb } from './VariantThumb.tsx';

const SAMPLE = '{\n  "name": "Закат",\n  "background": ["#FFE1D6", "#FFB79E", "#E0603F"],\n  "objects": ["#FFF1B8", "#4F7CFF", "#C9D6FF"]\n}\n';

export function PaletteDialog({ lib, onClose }: { lib: Library; onClose: () => void }) {
  const current = useCurrentScheme();
  const composition = useEditor((s) => s.composition);
  const custom = useEditor((s) => s.customSchemes);
  const { setCustomSchemes, patchComposition, showToast } = useEditor.getState();
  const [draft, setDraft] = useState<ColorScheme>({ id: 'draft', name: 'Своя палитра', colors: { ...current.colors } });
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const validation = useMemo(() => validateScheme(draft), [draft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const load = (content: string, filename: string) => {
    const res = parsePalette(content, filename);
    if (!res.ok) {
      setParseError(res.error);
      return;
    }
    setParseError(null);
    setDraft({ ...res.scheme });
  };

  const setColor = (role: ColorRole, value: string) => {
    setDraft((d) => ({ ...d, colors: { ...d.colors, [role]: value.toUpperCase() } }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const id = `custom-${Date.now().toString(36)}`;
      const res = await api.savePalette({ ...draft, id });
      setCustomSchemes([...custom.filter((s) => s.id !== res.scheme.id), res.scheme]);
      patchComposition({ schemeId: res.scheme.id });
      showToast(`Палитра «${res.scheme.name}» сохранена — композиция перекрашена`);
      onClose();
    } catch (e) {
      setParseError(e instanceof ApiError ? e.message : 'Не удалось сохранить палитру');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deletePalette(id);
      setCustomSchemes(custom.filter((s) => s.id !== id));
      if (composition.schemeId === id) patchComposition({ schemeId: lib.baseSchemeId });
    } catch (e) {
      setParseError(e instanceof ApiError ? e.message : 'Не удалось удалить');
    }
  };

  const half = (roles: ColorRole[]) =>
    roles.map((role) => (
      <label key={role} className="color-row">
        <input type="color" value={normalizeHex(draft.colors[role]) ?? '#000000'} onChange={(e) => setColor(role, e.target.value)} aria-label={ROLE_LABELS[role]} />
        <span className="color-meta">
          <span>{ROLE_LABELS[role]}</span>
          <input
            className="hex"
            value={draft.colors[role]}
            onChange={(e) => setColor(role, e.target.value)}
            aria-label={`${ROLE_LABELS[role]} HEX`}
            spellCheck={false}
          />
        </span>
      </label>
    ));

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="palette-title"
        tabIndex={-1}
        ref={dialogRef}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="palette-title">
            <Icon name="palette" /> Цветовая палитра
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <Icon name="x" />
          </button>
        </header>
        <div className="modal-body">
          <div className="palette-editor">
            <div>
              <p className="small">
                Загрузите палитру — композиция перекрасится автоматически: каждый цвет объекта заменяется цветом той же
                роли. Поддерживаются <b>SVG-экспорт сетки палитры из Figma</b>, JSON и список HEX (6 или 8 цветов в порядке
                сетки).
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".svg,.json,.txt,.csv,image/svg+xml,application/json,text/plain"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) load(await f.text(), f.name);
                }}
              />
              <div className="btn-row">
                <button className="btn" onClick={() => fileRef.current?.click()}>
                  <Icon name="upload" /> Загрузить файл
                </button>
                <button
                  className="btn ghost"
                  onClick={() => {
                    load(SAMPLE, 'Закат.json');
                  }}
                >
                  Пример JSON
                </button>
              </div>
              <label className="field">
                <span>Или вставьте HEX/JSON</span>
                <textarea
                  rows={2}
                  placeholder="#FDD7B9 #FAC896 #D27532 #F9ECB0 #80DADA #BEEBEB"
                  onChange={(e) => e.target.value.trim() && load(e.target.value, 'Своя палитра')}
                />
              </label>
              <label className="field">
                <span>Название</span>
                <input value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <div className="grid-2 colors">
                <div>
                  <h3>Цвета фона</h3>
                  {half(['bg1', 'bg2', 'bg3', 'ink'])}
                </div>
                <div>
                  <h3>Цвета объектов</h3>
                  {half(['obj1', 'obj2', 'obj3', 'paper'])}
                </div>
              </div>
            </div>
            <div className="palette-preview">
              <h3>Предпросмотр</h3>
              {validation.errors.length === 0 ? (
                <VariantThumb lib={lib} composition={{ ...composition, schemeId: 'draft' }} scheme={draft} />
              ) : (
                <div className="thumb-placeholder">Исправьте ошибки палитры</div>
              )}
              {parseError ? (
                <div className="alert" role="alert">
                  {parseError}
                </div>
              ) : null}
              {validation.errors.map((e) => (
                <div key={e} className="alert" role="alert">
                  {e}
                </div>
              ))}
              {validation.warnings.map((w) => (
                <div key={w} className="note">
                  {w}
                </div>
              ))}
              {custom.length ? (
                <>
                  <h3>Загруженные палитры</h3>
                  <ul className="custom-list">
                    {custom.map((s) => (
                      <li key={s.id}>
                        {COLOR_ROLES.map((r) => (
                          <span key={r} className="mini-dot" style={{ background: s.colors[r] }} />
                        ))}
                        <span className="grow">{s.name}</span>
                        <button className="icon-btn small danger" onClick={() => remove(s.id)} aria-label={`Удалить палитру ${s.name}`}>
                          <Icon name="trash" size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <footer className="modal-foot">
          <button className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" onClick={save} disabled={saving || validation.errors.length > 0}>
            <Icon name="check" /> Сохранить и применить
          </button>
        </footer>
      </div>
    </div>
  );
}
