import { placeFlat, rand, resetTransform, retain, stamp, type Mat } from '../util';

interface Piece {
  x: number;
  y: number;
  d: number;
  rot: number;
  squash: number;
  img: HTMLCanvasElement | null;
  life: number;
}

/**
 * Things that landed on the ground (leaves, petals, flowers): they lie flat,
 * linger, then fade. Shared by the leaf-like effects.
 */
export class Litter {
  private pieces: Piece[] = [];

  constructor(private readonly max: number) {}

  /** Drop something at x on the ground line `h`. `d` is its sprite diameter. */
  add(x: number, h: number, d: number, img: HTMLCanvasElement | null, squash = 0.45): void {
    if (this.pieces.length >= this.max) return;
    this.pieces.push({ x, y: h - rand(1, 3), d, rot: rand(0, Math.PI * 2), squash, img, life: rand(6, 11) });
  }

  update(s: number, enabled: boolean): void {
    if (!enabled) {
      this.pieces.length = 0;
      return;
    }
    retain(this.pieces, (p) => (p.life -= s) > 0);
  }

  draw(ctx: CanvasRenderingContext2D, m: Mat): void {
    for (const p of this.pieces) {
      ctx.globalAlpha = Math.min(1, p.life / 1.5) * 0.9;
      placeFlat(ctx, m, p.x, p.y, p.rot, 1, p.squash);
      stamp(ctx, p.img, 0, 0, p.d);
    }
    if (this.pieces.length) resetTransform(ctx, m);
  }
}
