import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Library } from './domain/types.ts';

/** Только для тестов: настоящая библиотека, собранная экстрактором. */
let cached: Library | undefined;
export function loadTestLibrary(): Library {
  if (!cached) {
    const path = fileURLToPath(new URL('../../../library/library.json', import.meta.url));
    cached = JSON.parse(readFileSync(path, 'utf8')) as Library;
  }
  return cached;
}
