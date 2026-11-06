import { describe, expect, it } from 'vitest';
import type { Library, MetaphorAnalyzer } from '@ic/core';
import { RateLimitedAnalyzer } from './rate-limited-analyzer.ts';

const inner: MetaphorAnalyzer = {
  name: 'stub',
  analyze: async () => ({ objects: [] }) as never,
};
const lib = {} as Library;

describe('RateLimitedAnalyzer', () => {
  it('пропускает запросы в пределах лимита и отклоняет сверх него до конца окна', async () => {
    let t = 0;
    const a = new RateLimitedAnalyzer(inner, 2, 1000, () => t);
    await expect(a.analyze('a', lib)).resolves.toBeDefined();
    await expect(a.analyze('b', lib)).resolves.toBeDefined();
    await expect(a.analyze('c', lib)).rejects.toThrow(/лимит/);
    t = 1000;
    await expect(a.analyze('d', lib)).resolves.toBeDefined();
    expect(a.name).toBe('stub');
  });
});
