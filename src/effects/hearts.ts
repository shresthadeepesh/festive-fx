import type { EffectFactory } from '../types';
import {
  TAU,
  baseTransform,
  clamp,
  countFor,
  drag,
  paletteOr,
  pick,
  place,
  rand,
  resetTransform,
  retain,
  shade,
  sprite,
  spriteCache,
  stamp,
} from '../util';

const PINKS = ['#ff4d6d', '#ff8fab', '#e5383b', '#ff006e', '#ffb3c6', '#c9184a', '#ff758f'];
const MAX_EXTRA = 200;

/** 0 glossy solid, 1 line-art outline, 2 solid with orbiting twinkles. */
type Kind = 0 | 1 | 2;

interface Heart {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
  z: number;
  rot: number;
  phase: number;
  sway: number;
  color: string;
  kind: Kind;
  extra: boolean;
  img: HTMLCanvasElement | null;
}

/** Heart outline in a ±20 box, point down. */
const heartPath = (ctx: CanvasRenderingContext2D, k = 1) => {
  ctx.beginPath();
  ctx.moveTo(0, 17 * k);
  ctx.bezierCurveTo(-6 * k, 11 * k, -20 * k, 3 * k, -20 * k, -7 * k);
  ctx.bezierCurveTo(-20 * k, -15 * k, -13 * k, -19 * k, -9 * k, -19 * k);
  ctx.bezierCurveTo(-4 * k, -19 * k, -1 * k, -16 * k, 0, -12 * k);
  ctx.bezierCurveTo(1 * k, -16 * k, 4 * k, -19 * k, 9 * k, -19 * k);
  ctx.bezierCurveTo(13 * k, -19 * k, 20 * k, -15 * k, 20 * k, -7 * k);
  ctx.bezierCurveTo(20 * k, 3 * k, 6 * k, 11 * k, 0, 17 * k);
  ctx.closePath();
};

/** Glossy heart: lit gradient, darker rim, soft lobe highlight and a specular dot. */
const solidSprite = (color: string) =>
  sprite(48, 48, (ctx) => {
    ctx.translate(24, 25);
    heartPath(ctx);
    const g = ctx.createRadialGradient(-7, -10, 1, 0, 0, 24);
    g.addColorStop(0, shade(color, -0.45));
    g.addColorStop(0.5, color);
    g.addColorStop(1, shade(color, 0.4));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = shade(color, 0.35);
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.save();
    heartPath(ctx);
    ctx.clip();
    // Soft reflection on the upper-left lobe
    const r = ctx.createRadialGradient(-10, -11, 0, -10, -11, 9);
    r.addColorStop(0, 'rgba(255,255,255,0.75)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = r;
    ctx.fillRect(-24, -24, 48, 48);
    // Rim light along the lower-right edge
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(17, -2);
    ctx.bezierCurveTo(14, 6, 6, 11, 1, 15);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.ellipse(-11, -12, 2.6, 1.6, -0.6, 0, TAU);
    ctx.fill();
  });

/** Line-art heart: double outline with a little flourish. */
const outlineSprite = (color: string) =>
  sprite(48, 48, (ctx) => {
    ctx.translate(24, 25);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    heartPath(ctx);
    ctx.stroke();
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    heartPath(ctx, 0.72);
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, -1, 2, 0, TAU);
    ctx.fill();
  });

const twinkleSprite = () =>
  sprite(32, 32, (ctx) => {
    ctx.translate(16, 16);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,225,235,0.75)');
    g.addColorStop(1, 'rgba(255,190,210,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 2 : 16;
      const a = (i * Math.PI) / 4;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  });

export const hearts: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = 0;
  let recycled = 0;
  const pool: Heart[] = [];

  const solids = spriteCache((c: string) => solidSprite(c));
  const outlines = spriteCache((c: string) => outlineSprite(c));
  const twinkle = spriteCache(() => twinkleSprite());
  const palette = () => paletteOr(o.colors, PINKS);

  const make = (extra: boolean, x = rand(-20, w + 20), y = h + rand(20, 120), vx = 0, vy?: number): Heart => {
    const z = rand(0.55, 1.2);
    const r = Math.random();
    const kind: Kind = r < 0.68 ? 0 : r < 0.86 ? 1 : 2;
    const color = pick(palette());
    return {
      x,
      y,
      vx,
      vy: vy ?? -rand(25, 55) * z,
      s: rand(9, 15) * o.size * z,
      z,
      rot: rand(-0.3, 0.3),
      phase: rand(0, TAU),
      sway: rand(12, 30) * z,
      color,
      kind,
      extra,
      img: kind === 1 ? outlines(color) : solids(color),
    };
  };

  // Depth order: far (small, faint) hearts first
  const sortByDepth = () => pool.sort((a, b) => a.z - b.z);

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      const want = countFor(w, h, 34, o.density);
      for (; recycled < want; recycled++) pool.push(make(false, rand(0, w), rand(0, h + 60)));
      if (recycled > want) {
        let drop = recycled - want;
        retain(pool, (p) => p.extra || drop-- <= 0);
        recycled = want;
      }
      sortByDepth();
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;
      const k = drag(0.96, s);
      retain(pool, (p) => {
        const rise = -(25 + 30 * p.z);
        // Thrown hearts ease back into a gentle rise
        p.vy += (rise - p.vy) * Math.min(1, 1.4 * s);
        p.vx = p.vx * k;
        p.phase += 1.3 * s;
        p.x += (p.vx + Math.sin(p.phase) * p.sway + o.wind * 40 * p.z) * s;
        p.y += p.vy * s;
        p.rot = Math.sin(p.phase * 0.7) * 0.25;
        if (p.y < -p.s * 3) {
          if (p.extra) return false;
          Object.assign(p, make(false), { z: p.z });
          return true;
        }
        if (!p.extra) {
          if (p.x < -40) p.x += w + 80;
          else if (p.x > w + 40) p.x -= w + 80;
        }
        return true;
      });
    },
    draw(ctx) {
      const m = baseTransform(ctx);
      const fadeBand = Math.max(1, h * 0.18);
      for (const p of pool) {
        // Fade out as they near the top
        const top = clamp((p.y + p.s) / fadeBand, 0, 1);
        const a = (0.45 + 0.5 * Math.min(1, p.z)) * top;
        if (a < 0.02) continue;
        // Twinkle hearts pulse like a heartbeat
        const beat = p.kind === 2 ? 1 + 0.07 * Math.pow(Math.max(0, Math.sin(t * 5 + p.phase)), 8) : 1;
        ctx.globalAlpha = a;
        place(ctx, m, p.x, p.y, p.rot, beat, beat);
        stamp(ctx, p.img, 0, 0, p.s * 2.4);
      }
      resetTransform(ctx, m);

      ctx.globalCompositeOperation = 'lighter';
      const tw = twinkle('');
      for (const p of pool) {
        if (p.kind !== 2) continue;
        const top = clamp((p.y + p.s) / fadeBand, 0, 1);
        for (let i = 0; i < 3; i++) {
          const ph = t * 1.4 + p.phase + (i * TAU) / 3;
          const pulse = Math.pow(0.5 + 0.5 * Math.sin(t * 4 + i * 2.1 + p.phase), 3);
          if (pulse < 0.05) continue;
          ctx.globalAlpha = pulse * top;
          stamp(ctx, tw, p.x + Math.cos(ph) * p.s * 1.5, p.y + Math.sin(ph) * p.s * 1.2, p.s * 1.1 * (0.6 + 0.4 * pulse));
        }
      }
    },
    burst(x, y) {
      const n = Math.min(16, MAX_EXTRA - (pool.length - recycled));
      for (let i = 0; i < n; i++) {
        const a = (i / Math.max(1, n)) * TAU + rand(-0.15, 0.15);
        const v = rand(140, 260);
        pool.push(make(true, x, y, Math.cos(a) * v, Math.sin(a) * v - 40));
      }
      sortByDepth();
    },
  };
};
