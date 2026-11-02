import { describe, expect, it } from 'vitest';
import { decodeMask, encodeMask, maskArea } from './mask.ts';

describe('silhouette masks', () => {
  it('round-trips an arbitrary bit grid through base64 packing', () => {
    const cols = 13;
    const rows = 7;
    const cells = Uint8Array.from({ length: cols * rows }, (_, i) => (i * 7 + (i % 3)) % 5 === 0 ? 1 : 0);
    const mask = encodeMask(cells, cols, rows, 8);
    expect(mask).toMatchObject({ cols, rows, cell: 8 });
    expect([...decodeMask(mask)]).toEqual([...cells]);
  });

  it('maskArea counts filled cells', () => {
    const cells = new Uint8Array([1, 0, 1, 1, 0, 0]);
    expect(maskArea(encodeMask(cells, 3, 2, 4))).toBe(3);
  });
});
