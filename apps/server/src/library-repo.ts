import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Library } from '@ic/core';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const DEFAULT_LIBRARY_PATH = fileURLToPath(new URL('../../../library/library.json', import.meta.url));

/** Хранилище библиотеки: собранный экстрактором library.json (неизменяемые данные). */
export function loadLibrary(path = DEFAULT_LIBRARY_PATH): Library {
  const lib = JSON.parse(readFileSync(path, 'utf8')) as Library;
  if (!Array.isArray(lib.objects) || lib.objects.length === 0) {
    throw new Error(`Библиотека пуста или повреждена: ${path}. Пересоберите: npm run library:build`);
  }
  return lib;
}
