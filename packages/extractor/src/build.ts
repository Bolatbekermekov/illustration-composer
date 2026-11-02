import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BASE_SCHEME,
  BUILTIN_SCHEMES,
  CATALOG,
  FORMATS,
  SIZE_SCALE,
  type Library,
  type LibraryObject,
  type ObjectVariant,
  type SizeClass,
} from '@ic/core';
import { extractDecor } from './decorations.ts';
import { extractExamples } from './examples.ts';
import { loadFigmaSvg } from './figma.ts';
import { extractObjects } from './objects.ts';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const FIGMA_EXPORT_DIR = resolve(REPO_ROOT, 'assets/figma-export');
export const LIBRARY_DIR = resolve(REPO_ROOT, 'library');

/** Собирает библиотеку из экспортов Figma (чистая функция над файлами экспорта). */
export function buildLibrary(dir = FIGMA_EXPORT_DIR): Library {
  const figL = loadFigmaSvg(resolve(dir, 'library-L.svg'));
  const figS = loadFigmaSvg(resolve(dir, 'library-S.svg'));
  const L = extractObjects(figL, 'L');
  const S = extractObjects(figS, 'S', L.aspects);
  const all = [...L.variants, ...S.variants];

  const pick = (id: string, size: SizeClass, state: 'main' | 'background') =>
    all.find((v) => v.objectId === id && v.size === size && v.state === state) as ObjectVariant;
  const objects: LibraryObject[] = CATALOG.map(({ figmaNames: _f, ...entry }) => ({
    ...entry,
    variants: {
      L: { main: pick(entry.id, 'L', 'main'), background: pick(entry.id, 'L', 'background') },
      S: { main: pick(entry.id, 'S', 'main'), background: pick(entry.id, 'S', 'background') },
    },
  }));

  const examples = extractExamples(loadFigmaSvg(resolve(dir, 'examples.svg')), L.variants);

  return {
    version: '1.0.0',
    baseSchemeId: BASE_SCHEME.id,
    schemes: [...BUILTIN_SCHEMES],
    sizeScale: SIZE_SCALE,
    formats: [...FORMATS],
    objects,
    decor: { L: extractDecor(figL, 'L'), S: extractDecor(figS, 'S') },
    examples,
  };
}

/** Самостоятельный SVG варианта: исходные координаты сохранены, viewBox = габарит объекта. */
export function standaloneSvg(v: ObjectVariant): string {
  const { x, y, width, height } = v.box;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="${x} ${y} ${width} ${height}" ` +
    `width="${width}" height="${height}"><g id="${v.objectId}-${v.state}">${v.markup}</g></svg>\n`
  );
}
