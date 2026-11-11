import type { EffectFactory } from '../types';
import { ALPHA_STEPS, TAU, alphaLevel, drag, glowSprite, paletteOr, rand, retain, spriteCache, stamp } from '../util';

/** Hot to cool: white core sparks, gold mid-life, orange as they die. */
const HEAT = ['#ffffff', '#ffe7a3', '#ffb347'];
const MAX_SPARKS = 2600;

interface Spark {
  /** Where this spark was born (or forked): it is drawn as a line from here. */
  ox: number;
  oy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  /** 0 = primary, 1-2 = forked children. */
  gen: number;
  /** Seconds until this spark forks; < 0 = never. */
  forkIn: number;
}

export const sparkler: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = rand(0, 10);
  let emitCarry = 0;
  // Pointer target and smoothed tip position
  let px = 0;
  let py = 0;
  let active = false;
  let tx = 0;
  let ty = 0;
  let placed = false;
  const sparks: Spark[] = [];
  /** Brief star-flashes where sparks branch. */
  const forks: { x: number; y: number; life: number }[] = [];
  /** Per-frame groups: heat colour x alpha level. */
  const groups: Spark[][] = Array.from({ length: HEAT.length * (ALPHA_STEPS + 1) }, () => []);

  const glow = spriteCache((c: string) => glowSprite(c, true, 0.25));
  const halo = spriteCache((c: string) => glowSprite(c, false, 0.3));
  const palette = () => paletteOr(o.colors, HEAT);

  /** Idle path when nobody is pointing: a slow lissajous figure. */
  const idle = () => ({
    x: w / 2 + Math.sin(t * 0.8) * w * 0.3,
    y: h * 0.5 + Math.sin(t * 1.3 + 1) * h * 0.22,
  });

  const spark = (x: number, y: number, a: number, v: number, gen: number, life: number) => {
    if (sparks.length >= MAX_SPARKS) return;
    sparks.push({
      ox: x,
      oy: y,
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life,
      max: life,
      gen,
      // Real sparkler sparks branch: primaries usually fork, children sometimes
      forkIn: gen < 2 && Math.random() < (gen === 0 ? 0.75 : 0.35) ? life * rand(0.3, 0.6) : -1,
    });
  };

  const emit = (x: number, y: number, n: number, power = 1) => {
    for (let i = 0; i < n; i++) {
      spark(x, y, rand(0, TAU), rand(320, 780) * power * o.size, 0, rand(0.11, 0.26));
    }
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;
      const target = active ? { x: px, y: py } : idle();
      if (!placed) {
        tx = target.x;
        ty = target.y;
        placed = true;
      }
      // Follow the target closely but not rigidly
      const f = Math.min(1, 18 * s);
      tx += (target.x - tx) * f;
      ty += (target.y - ty) * f;

      if (o.density > 0 && w > 0 && h > 0) {
        emitCarry += 560 * o.density * s;
        const n = emitCarry | 0;
        emitCarry -= n;
        emit(tx, ty, n);
      }

      const k = drag(0.86, s);
      retain(sparks, (p) => {
        p.vx = p.vx * k + o.wind * 30 * s;
        p.vy = p.vy * k + 140 * s;
        p.x += p.vx * s;
        p.y += p.vy * s;
        if (p.forkIn >= 0 && (p.forkIn -= s) < 0) {
          const heading = Math.atan2(p.vy, p.vx);
          const sp = Math.hypot(p.vx, p.vy) * 0.8 + 120;
          if (forks.length < 200) forks.push({ x: p.x, y: p.y, life: 1 });
          const kids = 2 + (Math.random() < 0.4 ? 1 : 0);
          for (let i = 0; i < kids; i++) {
            const side = i === 0 ? -1 : i === 1 ? 1 : 0;
            spark(p.x, p.y, heading + side * rand(0.4, 1.0), sp * rand(0.7, 1.1), p.gen + 1, rand(0.06, 0.14));
          }
          return false;
        }
        return (p.life -= s) > 0;
      });
      retain(forks, (f) => (f.life -= s * 12) > 0);
    },
    draw(ctx) {
      if (o.density <= 0 && !sparks.length) return;
      const pal = palette();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';

      if (o.density > 0 && placed) {
        // The wire and its burnt coating, angled down from the tip
        const sx = tx + 26 * o.size;
        const sy = ty + 62 * o.size;
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#5b5b62';
        ctx.lineWidth = 1.6 * o.size;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(sx, sy);
        ctx.stroke();
        ctx.strokeStyle = '#8a8580';
        ctx.lineWidth = 3.4 * o.size;
        ctx.beginPath();
        ctx.moveTo(tx + (sx - tx) * 0.12, ty + (sy - ty) * 0.12);
        ctx.lineTo(tx + (sx - tx) * 0.55, ty + (sy - ty) * 0.55);
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        // Glowing ember along the burning end
        ctx.strokeStyle = '#ff7a1a';
        ctx.lineWidth = 3.4 * o.size;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + (sx - tx) * 0.12, ty + (sy - ty) * 0.12);
        ctx.stroke();
      }

      // Sparks: short streaks, one path per (heat colour, alpha level)
      for (const p of sparks) {
        const k = p.life / p.max;
        const heat = k > 0.66 ? 0 : k > 0.33 ? 1 : 2;
        const a = Math.min(1, k * 1.6) * (Math.random() < 0.12 ? 0.3 : 1);
        groups[heat * (ALPHA_STEPS + 1) + alphaLevel(a)].push(p);
      }
      for (let heat = 0; heat < HEAT.length; heat++) {
        ctx.strokeStyle = pal[heat % pal.length];
        ctx.lineWidth = (heat === 0 ? 1.1 : 0.8) * o.size;
        for (let lv = 1; lv <= ALPHA_STEPS; lv++) {
          const g = groups[heat * (ALPHA_STEPS + 1) + lv];
          if (!g.length) continue;
          ctx.globalAlpha = lv / ALPHA_STEPS;
          ctx.beginPath();
          for (const p of g) {
            // Fine line from birth point: children start where the parent
            // forked, so the strokes join into branching dendrites.
            ctx.moveTo(p.ox, p.oy);
            ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
          g.length = 0;
        }
        groups[heat * (ALPHA_STEPS + 1)].length = 0;
      }

      const star = glow('#fff3c4');
      for (const f of forks) {
        ctx.globalAlpha = f.life;
        stamp(ctx, star, f.x, f.y, 7 * o.size);
      }

      if (o.density > 0 && placed) {
        // Warm halo and white-hot core, flickering
        const fl = 0.85 + Math.random() * 0.3;
        ctx.globalAlpha = 0.35 * fl;
        stamp(ctx, halo('#ff9a3c'), tx, ty, 150 * o.size * fl);
        ctx.globalAlpha = 1;
        stamp(ctx, glow('#ffd27a'), tx, ty, 26 * o.size * fl);
      }
    },
    burst(x, y) {
      emit(x, y, 160, 1.5);
    },
    pointer(x, y, inside) {
      active = inside;
      if (inside) {
        px = x;
        py = y;
      }
    },
  };
};
