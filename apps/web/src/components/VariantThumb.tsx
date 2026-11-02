import { renderComposition, type ColorScheme, type Composition, type Library } from '@ic/core';
import { useMemo } from 'react';

let seq = 0;

/** Превью композиции: тот же рендерер, что и экспорт (гарантия «что видишь — то и скачаешь»). */
export function VariantThumb({ lib, composition, scheme }: { lib: Library; composition: Composition; scheme: ColorScheme }) {
  const prefix = useMemo(() => `thumb${++seq}-`, []);
  const html = useMemo(
    () => renderComposition(composition, lib, { scheme, idPrefix: prefix, metadata: false }),
    [composition, lib, scheme, prefix],
  );
  return <div className="thumb-svg" dangerouslySetInnerHTML={{ __html: html }} />;
}
