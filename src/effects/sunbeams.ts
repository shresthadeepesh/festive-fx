import type { EffectFactory } from '../types';
import {
  TAU,
  baseTransform,
  clamp,
  countFor,
  fillPool,
  glowSprite,
  place,
  rand,
  resetTransform,
  retain,
  sprite,
  spriteCache,
  stamp,
} from '../util';

interface Ray {
  /** Base direction (radians, canvas convention) from the source. */
  angle: number;
  /** Half-width of the beam in radians. */
  half: number;
  intensity: number;
  phase: number;
  freq: number;
  /** Current animated values, refreshed each update. */
  a: number;
  alpha: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
  glow: number;
}

interface Flare {
  x: number;
  y: number;
  life: number;
}

/** A beam pointing down +y from its top centre: bright at the source, feathered edges. */
const raySprite = (color: string) =>
  sprite(64, 256, (ctx) => {
    // Alpha mask: along-beam falloff times cross-beam falloff, built row by row
    for (let y = 0; y < 256; y += 2) {
      const along = Math.pow(1 - y / 256, 1.6);
      const g = ctx.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.3, `rgba(255,255,255,${0.55 * along})`);
      g.addColorStop(0.5, `rgba(255,255,255,${along})`);
      g.addColorStop(0.7, `rgba(255,255,255,${0.55 * along})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y, 64, 2);
    }
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 64, 256);
  });

/** Hexagonal aperture ghost, the classic camera flare artefact. */
const ghostSprite = (color: string) =>
  sprite(48, 48, (ctx) => {
    ctx.translate(24, 24);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      ctx.lineTo(Math.cos(a) * 22, Math.sin(a) * 22);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 22);
    g.addColorStop(0, 'rgba(255,255,255,0.15)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0.9)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(-24, -24, 48, 48);
  });

/** Horizontal anamorphic streak through a bright point. */
const streakSprite = (color: string) =>
  sprite(128, 8, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 3, 128, 2);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(0, 1, 128, 6);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 8);
  });

const GHOSTS = [
  { at: 0.38, size: 0.05, color: '#b8ffcf', alpha: 0.1 },
  { at: 0.62, size: 0.11, color: '#ffd6f2', alpha: 0.07 },
  { at: 0.8, size: 0.03, color: '#fff1b8', alpha: 0.16 },
  { at: 1.12, size: 0.16, color: '#c7d9ff', alpha: 0.05 },
  { at: 1.35, size: 0.06, color: '#ffc58a', alpha: 0.1 },
];

export const sunbeams: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = rand(0, 50);
  const rays: Ray[] = [];
  const motes: Mote[] = [];
  const flares: Flare[] = [];

  const color = () => o.colors?.[0] ?? '#fff0c4';
  const beam = spriteCache((c: string) => raySprite(c));
  const glow = spriteCache((c: string) => glowSprite(c, true, 0.25));
  const soft = spriteCache((c: string) => glowSprite(c, false, 0.35));
  const ghost = spriteCache((c: string) => ghostSprite(c));
  const streak = spriteCache((c: string) => streakSprite(c));

  /** Light source just off a top corner; the wind decides which one. */
  const source = () => (o.wind < 0 ? { x: w * 1.04, y: -h * 0.08 } : { x: -w * 0.04, y: -h * 0.08 });

  const buildRays = () => {
    rays.length = 0;
    const n = 8 + ((Math.random() * 7) | 0);
    for (let i = 0; i < n; i++) {
      // Spread across the screen diagonal, with jitter so spacing looks natural
      const u = (i + rand(0.15, 0.85)) / n;
      rays.push({
        angle: 0.2 + u * 1.15,
        half: rand(0.012, 0.045),
        intensity: rand(0.55, 1),
        phase: rand(0, TAU),
        freq: rand(0.15, 0.45),
        a: 0,
        alpha: 0,
      });
    }
  };
  buildRays();

  const makeMote = (): Mote => ({
    x: rand(0, w),
    y: rand(0, h),
    vx: rand(-6, 6),
    vy: rand(-4, 6),
    r: rand(0.6, 2) * o.size,
    phase: rand(0, TAU),
    glow: 0,
  });

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      fillPool(motes, countFor(w, h, 130, o.density), makeMote);
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;
      const flip = o.wind < 0;
      const strength = clamp(o.density, 0, 1.6);
      for (const r of rays) {
        // Slow sway and breathing; mirrored when the source is top-right
        const base = r.angle + Math.sin(t * 0.06 + r.phase) * 0.035;
        r.a = flip ? Math.PI - base : base;
        r.alpha = r.intensity * (0.7 + 0.3 * Math.sin(t * r.freq + r.phase)) * strength;
      }

      const src = source();
      for (const m of motes) {
        m.phase += s;
        m.vx += rand(-8, 8) * s + o.wind * 4 * s;
        m.vy += rand(-8, 8) * s;
        m.vx *= 1 - Math.min(1, 0.6 * s);
        m.vy *= 1 - Math.min(1, 0.6 * s);
        m.x += (m.vx + Math.sin(m.phase * 0.7) * 3) * s;
        m.y += m.vy * s;
        if (m.x < -10) m.x += w + 20;
        else if (m.x > w + 10) m.x -= w + 20;
        if (m.y < -10) m.y += h + 20;
        else if (m.y > h + 10) m.y -= h + 20;
        // How strongly a beam lights this mote
        const a = Math.atan2(m.y - src.y, m.x - src.x);
        let lit = 0;
        for (const r of rays) {
          const d = Math.abs(Math.atan2(Math.sin(a - r.a), Math.cos(a - r.a)));
          if (d < r.half * 1.4) lit = Math.max(lit, (1 - d / (r.half * 1.4)) * r.alpha);
        }
        m.glow += (lit - m.glow) * Math.min(1, 4 * s);
      }

      retain(flares, (f) => (f.life -= s * 0.9) > 0);
    },
    draw(ctx) {
      if (o.density <= 0 && !flares.length) return;
      const c = color();
      const src = source();
      const len = Math.hypot(w, h) * 1.35;
      const m = baseTransform(ctx);
      ctx.globalCompositeOperation = 'lighter';

      if (o.density > 0) {
        // Beams: one stretched sprite each, rotated about the source
        const img = beam(c);
        if (img) {
          for (const r of rays) {
            if (r.alpha < 0.01) continue;
            const bw = len * Math.tan(r.half) * 2.6;
            place(ctx, m, src.x, src.y, r.a - Math.PI / 2);
            ctx.globalAlpha = Math.min(1, r.alpha * 0.32);
            ctx.drawImage(img, -bw / 2, 0, bw, len);
          }
          resetTransform(ctx, m);
        }

        // Source bloom
        const d = Math.min(w, h);
        ctx.globalAlpha = 0.55 * Math.min(1, o.density);
        stamp(ctx, soft(c), src.x, src.y, d * 1.1);
        ctx.globalAlpha = 0.9 * Math.min(1, o.density);
        stamp(ctx, glow(c), src.x, src.y, d * 0.35);

        // Lens-flare ghosts along the axis through the screen centre
        const ax = w / 2 - src.x;
        const ay = h / 2 - src.y;
        for (const g of GHOSTS) {
          ctx.globalAlpha = g.alpha * Math.min(1, o.density);
          stamp(ctx, ghost(g.color), src.x + ax * g.at * 2, src.y + ay * g.at * 2, d * g.size * 2);
        }

        // Dust motes: faint in shadow, sparkling inside a beam
        const mote = glow(c);
        for (const p of motes) {
          const tw = 0.75 + 0.25 * Math.sin(p.phase * 3);
          ctx.globalAlpha = Math.min(1, 0.1 + p.glow * 1.1 * tw);
          stamp(ctx, mote, p.x, p.y, p.r * (3 + p.glow * 3));
        }
      }

      // Flare pulses from bursts
      for (const f of flares) {
        const k = f.life;
        const d = Math.min(w, h);
        ctx.globalAlpha = k;
        stamp(ctx, glow(c), f.x, f.y, d * 0.25 * (1.6 - k * 0.6));
        ctx.globalAlpha = k * 0.8;
        const st = streak(c);
        if (st) ctx.drawImage(st, f.x - d * 0.6, f.y - d * 0.012, d * 1.2, d * 0.024);
        ctx.globalAlpha = k * 0.18;
        stamp(ctx, ghost('#ffe0b0'), f.x, f.y, d * 0.22 * (1.4 - k * 0.4));
      }
    },
    burst(x, y) {
      flares.push({ x, y, life: 1 });
      if (flares.length > 6) flares.shift();
    },
  };
};
