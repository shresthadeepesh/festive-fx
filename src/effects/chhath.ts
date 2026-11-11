import type { EffectFactory } from '../types';
import {
  ALPHA_STEPS,
  SPRITE_SCALE,
  TAU,
  alphaLevel,
  baseTransform,
  clamp,
  countFor,
  glowSprite,
  place,
  rand,
  resetTransform,
  retain,
  sprite,
  spriteCache,
  stamp,
} from '../util';

const FLAME_OUTER = '#ff8a1c';
const FLAME_MID = '#ffd23f';
const SUN = '#ffb347';
const MAX_EXTRA = 30;

/** Boat sprite size in CSS px; the waterline sits at BOAT_WL from its top. */
const BOAT_W = 80;
const BOAT_H = 44;
const BOAT_WL = 31;
/** Wick position relative to the boat's waterline centre. */
const WICK_X = 7;
const WICK_Y = -16;

interface Diya {
  x: number;
  vx: number;
  seed: number;
  extra: boolean;
  /** Seconds until this diya sends out a small ripple. */
  ripple: number;
}

interface Ripple {
  x: number;
  y: number;
  max: number;
  life: number;
}

interface Shimmer {
  x: number;
  depth: number;
  len: number;
  phase: number;
  freq: number;
}

/**
 * Banana-leaf boat carrying a clay diya, marigolds and sindoor dots.
 * Drawn with its waterline at (BOAT_W / 2, BOAT_WL).
 */
const boatSprite = () =>
  sprite(BOAT_W, BOAT_H, (ctx) => {
    ctx.translate(BOAT_W / 2, BOAT_WL);

    // Leaf boat: shallow hull with folded, upturned ends
    const hull = () => {
      ctx.beginPath();
      ctx.moveTo(-36, -9);
      ctx.quadraticCurveTo(-30, -1, -22, -1);
      ctx.lineTo(22, -1);
      ctx.quadraticCurveTo(30, -1, 36, -9);
      ctx.quadraticCurveTo(32, 3, 18, 6);
      ctx.quadraticCurveTo(0, 9, -18, 6);
      ctx.quadraticCurveTo(-32, 3, -36, -9);
      ctx.closePath();
    };
    hull();
    const g = ctx.createLinearGradient(0, -9, 0, 9);
    g.addColorStop(0, '#6fbf45');
    g.addColorStop(0.45, '#3f8f2b');
    g.addColorStop(1, '#1d5216');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#174412';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // Midrib and parallel veins of the leaf
    ctx.save();
    hull();
    ctx.clip();
    ctx.strokeStyle = 'rgba(210,255,170,0.55)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-34, -6);
    ctx.quadraticCurveTo(0, 7, 34, -6);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(20,70,15,0.45)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = -28; x <= 28; x += 4) {
      ctx.moveTo(x, -1);
      ctx.lineTo(x + 2.5, 8);
    }
    ctx.stroke();
    ctx.restore();
    // Inner rim of the fold, catching light
    ctx.strokeStyle = 'rgba(190,240,140,0.7)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-30, -3);
    ctx.lineTo(30, -3);
    ctx.stroke();

    // Marigolds tucked at the sides
    const marigold = (x: number, y: number, r: number, c: string) => {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        ctx.fillStyle = i % 2 ? c : '#ff7a00';
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, r * 0.32, a, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#b34700';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.28, 0, TAU);
      ctx.fill();
    };
    marigold(-20, -5, 5, '#ffb300');
    marigold(-12, -4, 4.2, '#ffc400');
    marigold(21, -4.5, 4.6, '#ffb300');

    // Clay diya in the middle, spout to the right where the wick sits
    ctx.beginPath();
    ctx.moveTo(-6, -11);
    ctx.bezierCurveTo(-6, -3, 6, -3, 9, -9);
    ctx.quadraticCurveTo(11, -11, 12, -14);
    ctx.quadraticCurveTo(8, -12, 4, -11.5);
    ctx.quadraticCurveTo(-1, -12.5, -6, -11);
    ctx.closePath();
    const clay = ctx.createLinearGradient(0, -13, 0, -3);
    clay.addColorStop(0, '#e06a32');
    clay.addColorStop(1, '#6e2507');
    ctx.fillStyle = clay;
    ctx.fill();
    ctx.fillStyle = '#3b1a06';
    ctx.beginPath();
    ctx.ellipse(0, -11.3, 5, 1, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffd27a';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(-3 + i * 2.6, -7, 0.55, 0, TAU);
      ctx.fill();
    }
    // Sindoor dots on the leaf
    ctx.fillStyle = '#e0182d';
    for (const [x, y] of [
      [-27, -6],
      [10, -2.5],
      [28, -6],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, TAU);
      ctx.fill();
    }
  });

/** Teardrop flame of height fh, tip leaning by `lean`, base at (x, y). */
const flamePath = (ctx: CanvasRenderingContext2D, x: number, y: number, fw: number, fh: number, lean: number) => {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x + fw, y - fh * 0.15, x + fw * 0.6 + lean * 0.5, y - fh * 0.7, x + lean, y - fh);
  ctx.bezierCurveTo(x - fw * 0.6 + lean * 0.5, y - fh * 0.7, x - fw, y - fh * 0.15, x, y);
  ctx.fill();
};

export const chhath: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = 0;
  let recycled = 0;
  const diyas: Diya[] = [];
  const ripples: Ripple[] = [];
  const shimmers: Shimmer[] = [];
  const rippleGroups: Ripple[][] = Array.from({ length: ALPHA_STEPS + 1 }, () => []);
  const shimmerGroups: Shimmer[][] = Array.from({ length: ALPHA_STEPS + 1 }, () => []);

  const boat = spriteCache(() => boatSprite());
  const glow = spriteCache((c: string) => glowSprite(c, true, 0.3));
  const soft = spriteCache((c: string) => glowSprite(c, false, 0.35));

  const waterH = () => clamp(h * 0.2, 30, 130);
  /** Calm-water line: top of the water band, or the bottom edge without ground. */
  const line = () => (o.ground ? h - waterH() : h - 6);
  /** Surface height at x, with two crossing swells. */
  const surf = (x: number) => line() + Math.sin(x * 0.018 + t * 1.1) * 1.8 + Math.sin(x * 0.047 - t * 1.9) * 1.0;
  const sunX = () => w * 0.72;

  const makeDiya = (extra: boolean, x = rand(0, w)): Diya => ({
    x,
    vx: rand(-6, 6),
    seed: rand(0, 100),
    extra,
    ripple: rand(1, 4),
  });

  const flicker = (seed: number) =>
    1 + 0.1 * Math.sin(t * 13 + seed) + 0.07 * Math.sin(t * 29 + seed * 1.7) + rand(-0.04, 0.04);

  const ripple = (x: number, y: number, max: number) => {
    if (ripples.length < 120) ripples.push({ x, y, max, life: 1 });
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      const want = countFor(w, h, 9, o.density);
      for (; recycled < want; recycled++) diyas.push(makeDiya(false));
      if (recycled > want) {
        let drop = recycled - want;
        retain(diyas, (d) => d.extra || drop-- <= 0);
        recycled = want;
      }
      const sh = countFor(w, h, 46, 1);
      while (shimmers.length < sh) {
        shimmers.push({ x: rand(0, w), depth: Math.pow(Math.random(), 0.8), len: rand(6, 26), phase: rand(0, TAU), freq: rand(1, 2.6) });
      }
      shimmers.length = sh;
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;
      for (const d of diyas) {
        d.x += (o.wind * 22 + d.vx) * s;
        if (d.x < -50) d.x += w + 100;
        else if (d.x > w + 50) d.x -= w + 100;
        d.ripple -= s;
        if (d.ripple <= 0) {
          ripple(d.x + rand(-10, 10), surf(d.x) + 3, rand(14, 26) * o.size);
          d.ripple = rand(2, 5);
        }
      }
      for (const p of shimmers) p.x += (o.wind * 12 + 4) * s * (0.5 + p.depth);
      for (const p of shimmers) {
        if (p.x > w + 30) p.x -= w + 60;
        else if (p.x < -30) p.x += w + 60;
      }
      retain(ripples, (r) => (r.life -= s * 0.55) > 0);
    },
    draw(ctx) {
      const m = baseTransform(ctx);
      const L = line();
      const water = o.ground && w > 0 && h > 0;
      const sx = sunX();

      if (water) {
        const H = h - L;
        // Water body following the surface
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w + 12; x += 12) ctx.lineTo(x, surf(x));
        ctx.lineTo(w, h);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, L, 0, h);
        g.addColorStop(0, 'rgba(255,170,100,0.55)');
        g.addColorStop(0.3, 'rgba(150,80,95,0.62)');
        g.addColorStop(1, 'rgba(22,26,58,0.88)');
        ctx.fillStyle = g;
        ctx.fill();

        ctx.globalCompositeOperation = 'lighter';
        // Sunrise glow hugging the waterline, and its broad reflection
        ctx.globalAlpha = 0.4;
        place(ctx, m, sx, L, 0, 1, 0.22);
        stamp(ctx, soft(SUN), 0, 0, Math.max(w * 0.7, 300));
        ctx.globalAlpha = 0.5;
        place(ctx, m, sx, L + H * 0.25, 0, 0.35, 1);
        stamp(ctx, soft(SUN), 0, 0, H * 1.6);
        resetTransform(ctx, m);

        // Sun path: broken golden streaks under the sun
        ctx.strokeStyle = '#ffd28a';
        ctx.lineCap = 'round';
        for (let pass = 0; pass < 3; pass++) {
          ctx.globalAlpha = 0.55 - pass * 0.16;
          ctx.lineWidth = 1.6 - pass * 0.3;
          ctx.beginPath();
          for (let y = L + 4 + pass * 2; y < h; y += 6) {
            const depth = (y - L) / H;
            const half = (14 + depth * 70) * (0.55 + 0.45 * Math.sin(t * 2.6 + y * 0.31));
            const off = Math.sin(t * 1.7 + y * 0.13) * 6 * depth;
            const x0 = sx + off - half;
            // Break each streak into two dashes so it shimmers
            ctx.moveTo(x0, y);
            ctx.lineTo(x0 + half * 0.8, y);
            ctx.moveTo(x0 + half * 1.1, y);
            ctx.lineTo(x0 + half * 2, y);
          }
          ctx.stroke();
        }

        // Shimmering highlight lines across the water
        for (const p of shimmers) {
          const a = Math.pow(Math.max(0, Math.sin(t * p.freq + p.phase)), 2) * (0.25 + 0.4 * (1 - p.depth));
          shimmerGroups[alphaLevel(a)].push(p);
        }
        ctx.strokeStyle = '#ffe6c8';
        ctx.lineWidth = 1;
        for (let lv = 1; lv <= ALPHA_STEPS; lv++) {
          const group = shimmerGroups[lv];
          if (!group.length) continue;
          ctx.globalAlpha = lv / ALPHA_STEPS;
          ctx.beginPath();
          for (const p of group) {
            const y = L + 5 + p.depth * (H - 8);
            const len = p.len * (0.5 + p.depth);
            ctx.moveTo(p.x, y);
            ctx.lineTo(p.x + len, y);
          }
          ctx.stroke();
          group.length = 0;
        }
        ctx.globalCompositeOperation = 'source-over';

        // Bright meniscus along the surface
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#ffd9a8';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (let x = 0; x <= w + 12; x += 12) ctx.lineTo(x, surf(x));
        ctx.stroke();
      }

      // Ripples: flattened rings, one path per alpha level
      ctx.strokeStyle = '#ffe1b0';
      ctx.lineWidth = 1;
      for (const r of ripples) rippleGroups[alphaLevel(r.life * 0.6)].push(r);
      for (let lv = 1; lv <= ALPHA_STEPS; lv++) {
        const group = rippleGroups[lv];
        if (!group.length) continue;
        ctx.globalAlpha = lv / ALPHA_STEPS;
        ctx.beginPath();
        for (const r of group) {
          const rx = r.max * (1 - r.life) + 2;
          ctx.moveTo(r.x + rx, r.y);
          ctx.ellipse(r.x, r.y, rx, rx * 0.22, 0, 0, TAU);
          const rx2 = rx * 0.6;
          ctx.moveTo(r.x + rx2, r.y);
          ctx.ellipse(r.x, r.y, rx2, rx2 * 0.22, 0, 0, TAU);
        }
        ctx.stroke();
        group.length = 0;
      }

      const img = boat('');
      const sz = o.size;
      const bw = BOAT_W * sz;
      const bh = BOAT_H * sz;
      for (const d of diyas) {
        const y = surf(d.x) + Math.sin(t * 1.7 + d.seed) * 1.2;
        const tilt = Math.atan((surf(d.x + 8) - surf(d.x - 8)) / 16) + Math.sin(t * 1.3 + d.seed) * 0.05;
        const fl = flicker(d.seed);
        const cos = Math.cos(tilt);
        const sin = Math.sin(tilt);
        const wx = d.x + (WICK_X * cos - WICK_Y * sin) * sz;
        const wy = y + (WICK_X * sin + WICK_Y * cos) * sz;

        if (water && img) {
          // Reflection: flipped, squashed, faded, sliced into wavering strips
          ctx.globalAlpha = 0.32;
          place(ctx, m, d.x, y + 1, -tilt, 1, -0.7);
          const strips = 5;
          const sw = img.width;
          const shPx = (BOAT_WL * SPRITE_SCALE) / strips;
          for (let i = 0; i < strips; i++) {
            const off = Math.sin(t * 4 + i * 1.3 + d.seed) * 1.6 * (i + 1) * 0.4;
            const syPx = BOAT_WL * SPRITE_SCALE - (i + 1) * shPx;
            const dy = (syPx / SPRITE_SCALE - BOAT_WL) * sz;
            ctx.drawImage(img, 0, syPx, sw, shPx, -bw / 2 + off, dy, bw, (shPx / SPRITE_SCALE) * sz);
          }
          resetTransform(ctx, m);
        }

        // Warm pool of light on the water, and the flame's long reflection
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.4 * fl;
        place(ctx, m, d.x, y + 2, 0, 1, 0.28);
        stamp(ctx, soft(FLAME_OUTER), 0, 0, 110 * sz * fl);
        if (water) {
          ctx.globalAlpha = 0.3 * fl;
          place(ctx, m, wx, y + 18 * sz, 0, 0.32, 1.5);
          stamp(ctx, soft(FLAME_MID), 0, 0, 34 * sz);
        }
        resetTransform(ctx, m);
        ctx.globalCompositeOperation = 'source-over';

        // Boat
        ctx.globalAlpha = 1;
        place(ctx, m, d.x, y, tilt);
        if (img) ctx.drawImage(img, -bw / 2, -BOAT_WL * sz, bw, bh);
        resetTransform(ctx, m);

        // Flame: outer, mid, core, blue base
        const fh = 15 * sz * fl;
        const lean = Math.sin(t * 2.3 + d.seed) * 1.2 + o.wind * 4;
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = FLAME_OUTER;
        flamePath(ctx, wx, wy, 3.8 * sz, fh, lean);
        ctx.fillStyle = FLAME_MID;
        flamePath(ctx, wx, wy - 0.8, 2.6 * sz, fh * 0.72, lean * 0.8);
        ctx.fillStyle = '#fff8e0';
        flamePath(ctx, wx, wy - 1.1, 1.5 * sz, fh * 0.42, lean * 0.6);
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#8fc8ff';
        ctx.beginPath();
        ctx.ellipse(wx, wy - 0.8, 1.2 * sz, 1.7 * sz, 0, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 * fl;
        stamp(ctx, glow(FLAME_OUTER), wx + lean * 0.5, wy - fh * 0.45, 56 * sz * fl);
        ctx.globalCompositeOperation = 'source-over';
      }
    },
    burst(x) {
      if (diyas.length - recycled < MAX_EXTRA) diyas.push(makeDiya(true, x));
      const y = surf(x) + 3;
      ripple(x, y, 34 * o.size);
      ripple(x, y, 20 * o.size);
    },
  };
};
