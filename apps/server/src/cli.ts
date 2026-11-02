import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ComposeError, composeFromText, renderComposition } from '@ic/core';
import { createAnalyzer } from './config.ts';
import { loadLibrary } from './library-repo.ts';

/**
 * Автоматическая сборка из командной строки:
 *   npm run compose -- --text "Финансовая подушка" --mode metaphor --format wide --scheme peach --out examples/finance
 * Пишет <out>-1.svg, <out>-2.svg… и печатает разбор метафоры.
 */
const { values } = parseArgs({
  options: {
    text: { type: 'string' },
    mode: { type: 'string', default: 'metaphor' },
    format: { type: 'string', default: 'square' },
    size: { type: 'string', default: 'L' },
    scheme: { type: 'string', default: 'lavender' },
    layout: { type: 'string', default: 'auto' },
    variants: { type: 'string', default: '3' },
    seed: { type: 'string', default: '1' },
    out: { type: 'string', default: 'out/composition' },
    offline: { type: 'boolean', default: false },
  },
});

if (!values.text) {
  console.error('Укажите --text "метафора или названия объектов"');
  process.exit(2);
}

const lib = loadLibrary();
try {
  const res = await composeFromText(
    {
      mode: values.mode === 'names' ? 'names' : 'metaphor',
      text: values.text,
      formatId: values.format,
      size: values.size === 'S' ? 'S' : 'L',
      schemeId: values.scheme,
      layout: values.layout as 'auto',
      variants: Number(values.variants),
      seed: Number(values.seed),
    },
    lib,
    values.offline ? undefined : createAnalyzer(),
  );
  console.log(`Анализ (${res.analysis.source}${res.analysis.model ? `, ${res.analysis.model}` : ''}, уверенность ${res.analysis.confidence}):`);
  for (const i of res.analysis.items) console.log(`  · ${i.objectId} [${i.state}/${i.role}] — ${i.reason}`);
  if (res.analysis.summary) console.log(`  ${res.analysis.summary}`);
  if (res.analysis.fallbackReason) console.log(`  (офлайн-анализ: ${res.analysis.fallbackReason})`);
  res.variants.forEach((v, k) => {
    const path = resolve(process.cwd(), `${values.out}-${k + 1}.svg`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, renderComposition(v.composition, lib, { title: values.text }));
    console.log(`→ ${path} (${v.mode}, оценка ${v.score}, старт: ${v.source})`);
  });
} catch (e) {
  if (e instanceof ComposeError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
