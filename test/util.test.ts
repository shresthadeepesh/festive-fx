// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { alphaLevel, ALPHA_STEPS, place, placeFlat, retain, shade, type Mat } from '../src/util';

/** Capture what place()/placeFlat() hand to setTransform. */
const recorder = () => {
  let last: number[] = [];
  const ctx = { setTransform: (...m: number[]) => (last = m) } as unknown as CanvasRenderingContext2D;
  return { ctx, get: () => last };
};

/** Apply a canvas-order matrix to a point. */
const apply = ([a, b, c, d, e, f]: number[], x: number, y: number) => [a * x + c * y + e, b * x + d * y + f];

const close = (got: number[], want: number[]) => got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 9));

describe('retain', () => {
  it('filters in place, keeps order', () => {
    const xs = [1, 2, 3, 4, 5, 6];
    retain(xs, (x) => x % 2 === 0);
    expect(xs).toEqual([2, 4, 6]);
  });

  it('visits items appended during the pass (child particles)', () => {
    const xs = [1, 2];
    const seen: number[] = [];
    retain(xs, (x) => {
      seen.push(x);
      if (x === 1) xs.push(10);
      return x !== 2;
    });
    expect(seen).toEqual([1, 2, 10]);
    expect(xs).toEqual([1, 10]);
  });
});

describe('place / placeFlat', () => {
  const dpr2: Mat = { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 };

  it('place = base * translate * rotate * scale', () => {
    const r = recorder();
    place(r.ctx, dpr2, 10, 20, Math.PI / 2, 3, 0.5);
    // local (1, 0): scaled to (3, 0), rotated 90deg to (0, 3), moved to (10, 23), base x2
    close(apply(r.get(), 1, 0), [20, 46]);
    // local (0, 2): scaled to (0, 1), rotated to (-1, 0), moved to (9, 20), base x2
    close(apply(r.get(), 0, 2), [18, 40]);
  });

  it('placeFlat = base * translate * scale * rotate', () => {
    const r = recorder();
    placeFlat(r.ctx, dpr2, 10, 20, Math.PI / 2, 1, 0.5);
    // local (1, 0): rotated to (0, 1), squashed to (0, 0.5), moved to (10, 20.5), base x2
    close(apply(r.get(), 1, 0), [20, 41]);
  });
});

describe('shade', () => {
  it('mixes toward black and white, leaves 0 alone', () => {
    expect(shade('#ff0000', 0)).toBe('#ff0000');
    expect(shade('#ff0000', 1)).toBe('rgb(0,0,0)');
    expect(shade('#ff0000', -1)).toBe('rgb(255,255,255)');
    expect(shade('#ff0000', 0.5)).toBe('rgb(128,0,0)');
  });

  it('quantises to tenths so the cache stays small', () => {
    expect(shade('#336699', 0.31)).toBe(shade('#336699', 0.29));
  });

  it('passes through colors it cannot parse', () => {
    expect(shade('not-a-color', 0.5)).toBe('not-a-color');
  });
});

describe('alphaLevel', () => {
  it('maps 0..1 onto 0..ALPHA_STEPS, rounding up so faint particles still draw', () => {
    expect(alphaLevel(0)).toBe(0);
    expect(alphaLevel(0.01)).toBe(1);
    expect(alphaLevel(1)).toBe(ALPHA_STEPS);
    expect(alphaLevel(2)).toBe(ALPHA_STEPS);
  });
});
