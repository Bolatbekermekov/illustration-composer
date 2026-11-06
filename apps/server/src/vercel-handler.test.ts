import { describe, expect, it } from 'vitest';
import { restoreUrl } from './vercel-handler.ts';

describe('restoreUrl', () => {
  it('восстанавливает путь API после rewrite Vercel и сохраняет прочие параметры', () => {
    expect(restoreUrl('/api?__path=compose')).toBe('/api/compose');
    expect(restoreUrl('/api?__path=palettes%2Fabc&x=1')).toBe('/api/palettes/abc?x=1');
  });
  it('не трогает исходный путь', () => {
    expect(restoreUrl('/api/health')).toBe('/api/health');
  });
});
