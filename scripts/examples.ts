/**
 * Генерация примеров для README: заголовок → анализ (Claude, если есть ключ) → варианты → SVG + PNG + JSON.
 *   npx tsx scripts/examples.ts                # все варианты в tmp/examples-candidates/
 *   npx tsx scripts/examples.ts --pick 1,0,2   # выбранные варианты → examples/
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { composeFromText, renderComposition, type ComposeRequest, type ComposeResult } from '../packages/core/src/index.ts';
import { renderPng } from '../packages/extractor/src/raster.ts';
import { createAnalyzer } from '../apps/server/src/config.ts';
import { loadLibrary } from '../apps/server/src/library-repo.ts';

const EXAMPLES: Array<{ slug: string; request: ComposeRequest }> = [
  { slug: '01-nakopit-na-mechtu', request: { mode: 'metaphor', text: 'Как накопить на мечту', formatId: 'wide', schemeId: 'peach', size: 'L' } },
  { slug: '02-noch-pered-ekzamenom', request: { mode: 'metaphor', text: 'Ночь перед экзаменом', formatId: 'square', schemeId: 'lavender', size: 'L' } },
  { slug: '03-komandnaya-rabota', request: { mode: 'metaphor', text: 'Командная работа решает всё', formatId: 'tall', schemeId: 'mint', size: 'L' } },
  { slug: '04-nazvaniya-razmer-s', request: { mode: 'names', text: 'телефон, наушники, цветы на фоне', formatId: 'square', schemeId: 'mint', size: 'S' } },
];

const root = resolve(import.meta.dirname, '..');
const pickArg = process.argv.indexOf('--pick');
const picks = pickArg > 0 ? (process.argv[pickArg + 1] ?? '').split(',').map(Number) : null;
const outDir = resolve(root, picks ? 'examples' : 'tmp/examples-candidates');
mkdirSync(outDir, { recursive: true });

const lib = loadLibrary();
const analyzer = createAnalyzer();
// Шаг выбора берёт сохранённые результаты кандидатов — повторный вызов LLM мог бы дать другой разбор.
const cachePath = resolve(root, 'tmp/examples-candidates/results.json');
const cached: ComposeResult[] | null = picks && existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : null;
const results: ComposeResult[] = [];
for (const [k, ex] of EXAMPLES.entries()) {
  const res = cached?.[k] ?? (await composeFromText({ ...ex.request, variants: 4, seed: 7 + k }, lib, analyzer));
  results.push(res);
  const chosen = picks ? [picks[k] ?? 0] : res.variants.map((_, i) => i);
  for (const i of chosen) {
    const v = res.variants[i];
    if (!v) continue;
    const name = picks ? ex.slug : `${ex.slug}-v${i}`;
    const svg = renderComposition(v.composition, lib, { title: ex.request.text });
    writeFileSync(resolve(outDir, `${name}.svg`), svg);
    writeFileSync(resolve(outDir, `${name}.png`), renderPng(svg, 900));
    if (picks) {
      writeFileSync(
        resolve(outDir, `${name}.json`),
        JSON.stringify({ request: ex.request, analysis: res.analysis, layout: { mode: v.mode, score: v.score, start: v.source } }, null, 2),
      );
    }
    console.log(`${name}: ${v.mode} · ${v.composition.items.map((it) => `${it.objectId}${it.state === 'background' ? '(фон)' : ''}`).join(', ')}`);
  }
  console.log(`  анализ: ${res.analysis.source}${res.analysis.model ? ` (${res.analysis.model})` : ''} — ${res.analysis.summary}`);
}
if (!picks) writeFileSync(cachePath, JSON.stringify(results));
