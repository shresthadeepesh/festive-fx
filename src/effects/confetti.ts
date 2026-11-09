import type { EffectFactory } from '../types';
import { TAU, baseTransform, countFor, drag, paletteOr, pick, place, rand, resetTransform, retain, shade } from '../util';

const PALETTE = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c', '#ff70a6', '#4cc9f0'];
const FOIL = ['#d4af37', '#e6e8ef', '#c9a227', '#f1d78a'];
const MAX_BURST = 1500;

type Shape = 'rect' | 'square' | 'circle' | 'triangle' | 'star' | 'streamer';
const SHAPES: Shape[] = ['rect', 'rect', 'rect', 'rect', 'square', 'square', 'circle', 'triangle', 'star', 'star', 'rect', 'streamer'];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vrot: number;
  tilt: number;
  vtilt: number;
  wave: number;
  color: string;
  shape: Shape;
  /** Metallic foil: stronger glint when facing the viewer. */
  foil: boolean;
  /** Continuous pieces recycle to the top; burst pieces are dropped once off-screen. */
  recycle: boolean;
  /** This frame's flip factor (cos of tilt), computed once in draw. */
  f: number;
}

/**
 * Append a piece's outline to the current path in world space: rotation and
 * the 3D flip (`f` squashes local y) are applied here in JS, so every piece
 * of the same shaded colour shares one path and one fill().
 */
const addShape = (ctx: CanvasRenderingContext2D, p: Piece, f: number) => {
  const cos = Math.cos(p.rot);
  const sin = Math.sin(p.rot);
  const X = (lx: number, ly: number) => p.x + cos * lx - sin * ly * f;
  const Y = (lx: number, ly: number) => p.y + sin * lx + cos * ly * f;
  const poly = (pts: readonly number[]) => {
    ctx.moveTo(X(pts[0], pts[1]), Y(pts[0], pts[1]));
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(X(pts[i], pts[i + 1]), Y(pts[i], pts[i + 1]));
    ctx.closePath();
  };
  const { w, h } = p;
  switch (p.shape) {
    case 'circle': {
      const r = h * 0.6;
      ctx.moveTo(p.x + cos * r, p.y + sin * r);
      ctx.ellipse(p.x, p.y, r, Math.max(0.01, r * Math.abs(f)), p.rot, 0, TAU);
      break;
    }
    case 'triangle':
      poly([0, -h * 0.8, w * 0.55, h * 0.6, -w * 0.55, h * 0.6]);
      break;
    case 'star':
      poly(STAR.map((v) => v * w));
      break;
    case 'square':
      poly([-w / 2, -w / 2, w / 2, -w / 2, w / 2, w / 2, -w / 2, w / 2]);
      break;
    default:
      poly([-w / 2, -h / 2, w / 2, -h / 2, w / 2, h / 2, -w / 2, h / 2]);
  }
};

/** Unit five-point star outline (outer radius 0.6), scaled by piece width. */
const STAR: number[] = [];
for (let i = 0; i < 10; i++) {
  const r = i % 2 ? 0.27 : 0.6;
  const a = (i * Math.PI) / 5 - Math.PI / 2;
  STAR.push(Math.cos(a) * r, Math.sin(a) * r);
}

export const confetti: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  const pieces: Piece[] = [];
  /** Per-frame buckets keyed by shaded colour; arrays are reused. */
  const fills = new Map<string, Piece[]>();

  const palette = () => paletteOr(o.colors, PALETTE);

  const make = (x: number, y: number, vx: number, vy: number, recycle: boolean): Piece => {
    const size = rand(5, 10) * o.size;
    const shape = pick(SHAPES);
    const foil = !o.colors && Math.random() < 0.12;
    return {
      x,
      y,
      vx,
      vy,
      w: shape === 'streamer' ? size * rand(2.2, 3.2) : size,
      h: shape === 'streamer' ? rand(2.2, 3) * o.size : size * rand(0.45, 0.7),
      rot: rand(0, TAU),
      vrot: rand(-5, 5),
      tilt: rand(0, TAU),
      vtilt: rand(4, 11),
      wave: rand(0, TAU),
      color: foil ? pick(FOIL) : pick(palette()),
      shape,
      foil,
      recycle,
      f: 1,
    };
  };

  const fromTop = (anywhere: boolean) =>
    make(rand(0, w), anywhere ? rand(-h, h) : rand(-60, -10), 0, rand(55, 115), true);

  const sync = () => {
    const want = countFor(w, h, 120, o.density);
    let have = 0;
    for (const p of pieces) if (p.recycle) have++;
    for (; have < want; have++) pieces.push(fromTop(true));
    if (have > want) {
      let drop = have - want;
      retain(pieces, (p) => !p.recycle || drop-- <= 0);
    }
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      sync();
    },
    update(dt) {
      const s = dt * o.speed;
      const k = drag(0.985, s);
      retain(pieces, (p) => {
        p.tilt += p.vtilt * s;
        p.rot += p.vrot * s * (p.shape === 'streamer' ? 0.4 : 1);
        p.wave += 7 * s;
        // Paper falls slowest when flat to the air: drop speed follows the flip.
        const face = Math.abs(Math.cos(p.tilt));
        if (p.recycle) {
          p.x += (Math.sin(p.tilt) * 28 + o.wind * 80) * s;
          p.y += p.vy * (0.65 + 0.35 * (1 - face)) * s;
        } else {
          p.vx = p.vx * k + o.wind * 60 * s;
          p.vy = p.vy * k + 500 * s;
          if (p.vy > 150) p.vy = 150; // paper hits terminal velocity fast
          p.x += (p.vx + Math.sin(p.tilt) * 22) * s;
          p.y += p.vy * s;
        }
        if (p.y > h + 30) {
          if (!p.recycle) return false;
          Object.assign(p, fromTop(false));
        } else if (p.recycle) {
          if (p.x < -30) p.x += w + 60;
          else if (p.x > w + 30) p.x -= w + 60;
        }
        return true;
      });
    },
    draw(ctx) {
      ctx.globalAlpha = 1;
      // Flat pieces: bucket by pre-shaded colour, one path + fill per bucket.
      for (const p of pieces) {
        if (p.shape === 'streamer') continue;
        const f = Math.cos(p.tilt);
        const af = Math.abs(f);
        // Back face darker, edge-on darker still; specular glint when facing the viewer.
        const glint = af > 0.88 ? (af - 0.88) * 8 * (p.foil ? 0.75 : 0.3) : 0;
        const dark = f < 0 ? 0.28 + 0.2 * (1 - af) : 0.3 * (1 - af);
        p.f = f;
        const color = shade(p.color, glint > 0 ? -glint : dark);
        let list = fills.get(color);
        if (!list) fills.set(color, (list = []));
        list.push(p);
      }
      fills.forEach((list, color) => {
        if (!list.length) return;
        ctx.fillStyle = color;
        ctx.beginPath();
        for (const p of list) addShape(ctx, p, p.f);
        ctx.fill();
        list.length = 0;
      });

      // Streamers: a travelling sine wave, shaded where it twists away
      const m = baseTransform(ctx);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      let any = false;
      for (const p of pieces) {
        if (p.shape !== 'streamer') continue;
        any = true;
        place(ctx, m, p.x, p.y, p.rot);
        const segs = 7;
        const amp = p.h * 1.6;
        ctx.strokeStyle = shade(p.color, 0.12 + 0.1 * Math.sin(p.wave));
        ctx.lineWidth = p.h;
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) ctx.lineTo(-p.w / 2 + (i / segs) * p.w, Math.sin(p.wave + i * 0.95) * amp);
        ctx.stroke();
      }
      if (any) resetTransform(ctx, m);
    },
    burst(x, y) {
      let added = 0;
      for (const p of pieces) if (!p.recycle) added++;
      const n = Math.min(170, MAX_BURST - added);
      const power = Math.min(1.5, Math.max(0.6, h / 700));
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + rand(-0.85, 0.85); // upward cone
        const v = rand(250, 720) * power;
        pieces.push(make(x, y, Math.cos(a) * v, Math.sin(a) * v, false));
      }
    },
  };
};
