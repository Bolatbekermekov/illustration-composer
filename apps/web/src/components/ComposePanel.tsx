import type { LayoutMode, Library } from '@ic/core';
import { useState } from 'react';
import { api, ApiError } from '../api.ts';
import { useEditor } from '../store.ts';
import { Icon } from './Icon.tsx';
import { useCurrentScheme, useSchemes } from './useScheme.ts';
import { VariantThumb } from './VariantThumb.tsx';

const MODE_LABEL: Record<LayoutMode, string> = { compact: 'Собранно', offset: 'Со смещением', heading: 'Под заголовок' };

/** Объекты, которые раскладка перевела в фон, чтобы всё поместилось (метка «+фон:<id>» в источнике). */
const demoted = (source: string) => [...source.matchAll(/\+фон:([a-z]+)/g)].map((m) => m[1] as string);

const EXAMPLES = {
  metaphor: ['Как накопить на мечту', 'Ночь перед экзаменом', 'Командная работа решает всё', 'Подкаст о карьере'],
  names: ['телефон, пазл', 'фоновая лампа, кошелёк, 2 монеты', 'книга, ручка, цветы на фоне'],
};

export function ComposePanel({ lib }: { lib: Library }) {
  const [mode, setMode] = useState<'metaphor' | 'names'>('metaphor');
  const [text, setText] = useState('');
  const [layout, setLayout] = useState<LayoutMode | 'auto'>('auto');
  const c = useEditor((s) => s.composition);
  const busy = useEditor((s) => s.busy);
  const variants = useEditor((s) => s.variants);
  const analysis = useEditor((s) => s.analysis);
  const llm = useEditor((s) => s.llm);
  const error = useEditor((s) => s.error);
  const { setBusy, setError, setVariants, loadComposition } = useEditor.getState();
  const scheme = useCurrentScheme();
  const schemes = useSchemes();

  const run = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.compose({
        mode,
        text,
        ...(c.formatId ? { formatId: c.formatId } : { width: c.width, height: c.height }),
        size: c.size,
        schemeId: c.schemeId,
        layout,
        variants: 4,
        seed: Math.floor(Math.random() * 1e6),
      });
      setVariants(res.variants, res.analysis);
      const first = res.variants[0];
      if (first) loadComposition(first.composition);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось собрать композицию');
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (id: string) => lib.objects.find((o) => o.id === id)?.name ?? id;

  return (
    <section className="panel-section" aria-labelledby="compose-title">
      <h2 id="compose-title">
        <Icon name="sparkles" /> Автосборка
      </h2>
      <div className="segmented wide" role="tablist" aria-label="Сценарий">
        <button role="tab" aria-selected={mode === 'metaphor'} className={mode === 'metaphor' ? 'active' : ''} onClick={() => setMode('metaphor')}>
          По метафоре
        </button>
        <button role="tab" aria-selected={mode === 'names'} className={mode === 'names' ? 'active' : ''} onClick={() => setMode('names')}>
          По названиям
        </button>
      </div>
      <label className="field">
        <span>{mode === 'metaphor' ? 'Метафора или заголовок' : 'Объекты через запятую'}</span>
        <textarea
          rows={3}
          value={text}
          maxLength={500}
          placeholder={mode === 'metaphor' ? 'Например: «Финансовая подушка безопасности»' : 'Например: «телефон, фоновая лампа, 2 монеты»'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run();
          }}
        />
      </label>
      <div className="examples">
        {EXAMPLES[mode].map((ex) => (
          <button key={ex} className="chip" onClick={() => setText(ex)}>
            {ex}
          </button>
        ))}
      </div>
      <div className="row">
        <label className="field-inline grow">
          <span>Раскладка</span>
          <select value={layout} onChange={(e) => setLayout(e.target.value as LayoutMode | 'auto')}>
            <option value="auto">Все режимы</option>
            <option value="compact">Собранно</option>
            <option value="offset">Со смещением</option>
            <option value="heading">Под заголовок</option>
          </select>
        </label>
        <button className="btn primary" onClick={run} disabled={busy || !text.trim()} aria-busy={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="wand" />}
          {busy ? 'Собираю…' : 'Собрать'}
        </button>
      </div>
      <p className="muted small">
        {mode === 'metaphor'
          ? llm.enabled
            ? `Смысл анализирует ${llm.model ?? 'Claude'}; без сети — офлайн-словарь смыслов.`
            : 'Ключ Claude не задан — работает офлайн-анализ по словарю смыслов.'
          : 'Понимает формы слов, опечатки, количество («2 монеты») и пометку «фоновый».'}
      </p>
      {error ? (
        <div className="alert" role="alert">
          {error}
        </div>
      ) : null}

      {analysis ? (
        <div className="analysis">
          <div className="analysis-head">
            <span className={`badge ${analysis.source}`}>
              {analysis.source === 'claude' ? `Claude · ${analysis.model ?? ''}` : analysis.source === 'names' ? 'По названиям' : 'Офлайн-анализ'}
            </span>
            <span className={`badge conf-${analysis.confidence}`}>
              {analysis.confidence === 'high' ? 'уверенно' : analysis.confidence === 'medium' ? 'средне' : 'неуверенно'}
            </span>
          </div>
          {analysis.summary ? <p className="small">{analysis.summary}</p> : null}
          <ul className="picks">
            {analysis.items.map((i, idx) => (
              <li key={`${i.objectId}-${idx}`}>
                <strong>{nameOf(i.objectId)}</strong>
                <span className={`state ${i.state}`}>{i.state === 'background' ? 'фон' : i.role === 'hero' ? 'герой' : 'главный'}</span>
                <span className="muted">{i.reason}</span>
              </li>
            ))}
          </ul>
          {analysis.fallbackReason ? <p className="muted small">Claude недоступен ({analysis.fallbackReason}) — использован офлайн-анализ.</p> : null}
        </div>
      ) : null}

      {variants.length ? (
        <div className="variants" aria-label="Варианты композиции">
          {variants.map((v, idx) => (
            <button
              key={idx}
              className="variant"
              onClick={() => loadComposition(v.composition)}
              title={`Вариант ${idx + 1}: ${MODE_LABEL[v.mode]}`}
            >
              <VariantThumb lib={lib} composition={{ ...v.composition, schemeId: c.schemeId, size: c.size }} scheme={schemes.find((s) => s.id === c.schemeId) ?? scheme} />
              <span>
                {idx + 1}. {MODE_LABEL[v.mode]}
                {demoted(v.source).map((id) => (
                  <em key={id} className="demoted">
                    {' '}
                    · {nameOf(id)} → фон
                  </em>
                ))}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
