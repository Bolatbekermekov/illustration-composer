import { BASE_SCHEME, type ColorScheme } from '@ic/core';
import { allSchemes, useEditor } from '../store.ts';

export function useSchemes(): ColorScheme[] {
  const lib = useEditor((s) => s.library);
  const custom = useEditor((s) => s.customSchemes);
  return allSchemes(lib, custom);
}

/** Схема текущей композиции (встроенная или загруженная); если её удалили — базовая. */
export function useCurrentScheme(): ColorScheme {
  const schemes = useSchemes();
  const id = useEditor((s) => s.composition.schemeId);
  return schemes.find((s) => s.id === id) ?? schemes[0] ?? BASE_SCHEME;
}
