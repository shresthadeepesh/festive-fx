import type { EffectFactory } from '../types';
import { TAU, countFor, fillPool, glowSprite, paletteOr, pick, rand, retain, spriteCache, stamp } from '../util';

/** Real stars aren't all white: a few run blue-hot or warm. */
const TINTS = ['#ffffff', '#ffffff', '#ffffff', '#dfe8ff', '#cfdcff', '#fff1d6', '#ffe2b8'];

interface Star {
  x: number;
  y: number;
  r: number;
  base: number;
  freq: number;
  phase: number;
  color: string;
  /** Brightest few get diffraction spikes. */
  spikes: boolean;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  life: number;
  max: number;
}

export const stars: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = 0;
  let nextMeteor = rand(1, 3);
  const field: Star[] = [];
  const meteors: Meteor[] = [];

  const glow = spriteCache((c: string) => glowSprite(c, true, 0.25));
  const palette = () => paletteOr(o.colors, TINTS);

  const make = (): Star => {
    const bright = Math.random() < 0.06;
    return {
      x: rand(0, w),
      // Denser toward the top, thinning toward the horizon
      y: h * Math.pow(Math.random(), 1.4),
      r: (bright ? rand(1.4, 2.2) : rand(0.4, 1.3)) * o.size,
      base: bright ? rand(0.8, 1) : rand(0.25, 0.75),
      freq: rand(0.6, 3),
      phase: rand(0, TAU),
      color: pick(palette()),
      spikes: bright,
    };
  };

  const meteor = (x = rand(w * 0.1, w * 0.9), y = rand(0, h * 0.35)) => {
    const dir = o.wind !== 0 ? Math.sign(o.wind) : Math.random() < 0.5 ? -1 : 1;
    const a = rand(0.35, 0.7); // radians below horizontal
    const v = rand(650, 950);
    const max = rand(0.6, 1.1);
    meteors.push({ x, y, vx: Math.cos(a) * v * dir, vy: Math.sin(a) * v, len: rand(110, 200) * o.size, life: max, max });
  };

  return {
    resize(nw, nh) {
      const rescale = w > 0 && h > 0;
      for (const s of field) {
        if (rescale) {
          s.x *= nw / w;
          s.y *= nh / h;
        }
      }
      w = nw;
      h = nh;
      fillPool(field, countFor(w, h, 170, o.density), make);
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;
      if (o.density > 0) {
        nextMeteor -= s;
        if (nextMeteor <= 0) {
          meteor();
          nextMeteor = rand(2.5, 7) / o.density;
        }
      }
      retain(meteors, (m) => {
        m.x += m.vx * s;
        m.y += m.vy * s;
        return (m.life -= s) > 0;
      });
    },
    draw(ctx) {
      ctx.globalCompositeOperation = 'lighter';
      for (const s of field) {
        // Twinkle: slow sine plus a faster shimmer
        const tw = 0.65 + 0.25 * Math.sin(t * s.freq + s.phase) + 0.1 * Math.sin(t * s.freq * 3.7 + s.phase);
        const a = s.base * tw;
        ctx.globalAlpha = a;
        stamp(ctx, glow(s.color), s.x, s.y, s.r * 4);
        if (s.spikes) {
          const L = s.r * 6 * tw;
          ctx.globalAlpha = a * 0.5;
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(s.x - L, s.y);
          ctx.lineTo(s.x + L, s.y);
          ctx.moveTo(s.x, s.y - L);
          ctx.lineTo(s.x, s.y + L);
          ctx.stroke();
        }
      }

      ctx.lineCap = 'round';
      for (const m of meteors) {
        const life = m.life / m.max;
        // Fade in fast, burn out slowly
        const a = Math.min(1, (1 - life) * 6) * Math.min(1, life * 2.5);
        const sp = Math.hypot(m.vx, m.vy);
        const tx = m.x - (m.vx / sp) * m.len;
        const ty = m.y - (m.vy / sp) * m.len;
        const g = ctx.createLinearGradient(tx, ty, m.x, m.y);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.7, 'rgba(200,220,255,0.35)');
        g.addColorStop(1, 'rgba(255,255,255,1)');
        ctx.globalAlpha = a;
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.8 * o.size;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();
        stamp(ctx, glow('#cfe0ff'), m.x, m.y, 12 * o.size);
      }
    },
    burst(x, y) {
      meteor(x, y);
    },
  };
};
