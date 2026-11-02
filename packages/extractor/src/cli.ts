import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildLibrary, LIBRARY_DIR, standaloneSvg } from './build.ts';
import { renderPng } from './raster.ts';

/**
 * Пересобирает `library/` из `assets/figma-export/`:
 *   library.json          — вся библиотека (объекты, декор, схемы, форматы, эталоны раскладок);
 *   objects/{L,S}/*.svg   — каждый вариант объекта отдельным SVG (для дизайнеров и проверки);
 *   previews/{L,S}/*.png  — превью 240 px.
 */
const started = Date.now();
const lib = buildLibrary();
rmSync(resolve(LIBRARY_DIR, 'objects'), { recursive: true, force: true });
rmSync(resolve(LIBRARY_DIR, 'previews'), { recursive: true, force: true });

let files = 0;
for (const obj of lib.objects) {
  for (const size of ['L', 'S'] as const) {
    for (const state of ['main', 'background'] as const) {
      const v = obj.variants[size][state];
      const svg = standaloneSvg(v);
      const svgPath = resolve(LIBRARY_DIR, v.file);
      mkdirSync(dirname(svgPath), { recursive: true });
      writeFileSync(svgPath, svg);
      const pngPath = resolve(LIBRARY_DIR, 'previews', size, `${obj.id}.${state}.png`);
      mkdirSync(dirname(pngPath), { recursive: true });
      writeFileSync(pngPath, renderPng(svg, 240));
      files += 2;
    }
  }
}
writeFileSync(resolve(LIBRARY_DIR, 'library.json'), JSON.stringify(lib));

const kb = (n: number) => `${Math.round(n / 1024)} КБ`;
console.log(
  `Библиотека собрана за ${((Date.now() - started) / 1000).toFixed(1)} с: ` +
    `${lib.objects.length} объектов × 2 размера × 2 состояния, ` +
    `декор L/S: ${lib.decor.L.length}/${lib.decor.S.length}, эталонов: ${lib.examples.length}, ` +
    `файлов: ${files + 1}, library.json: ${kb(JSON.stringify(lib).length)}`,
);
