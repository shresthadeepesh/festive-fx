import type { EffectFactory } from '../types';
import { TAU, clamp, fillPool, glowSprite, paletteOr, rand, sprite, spriteCache } from '../util';

/** Lower edge green, teal body, violet crown, a thin magenta fringe at the very bottom. */
const AURORA = ['#5dffa0', '#2fd3c8', '#b45cff', '#ff5fa8'];

/** Ray sprite size in CSS px (rasterised at 2x). */
const RW = 16;
const RH = 160;
/** Fraction of the ray sprite where the bright lower fringe sits; the rest is a soft fade. */
const FRINGE = 0.78;

interface Curtain {
  /** Lower edge height as a fraction of h. */
  base: number;
  amp: number;
  /** Horizontal extent as fractions of w. */
  start: number;
  len: number;
  /** Ray height as a fraction of h. */
  height: number;
  /** Rise across the span (fraction of h): curtains sweep diagonally, not along a horizon. */
  tilt: number;
  bright: number;
  /** Direction the shimmer slides along the curtain. */
  dir: number;
  seeds: number[];
}

interface Pulse {
  x: number;
  age: number;
}

/** One colour band of a ray: an alpha profile (top to bottom) tinted with `color`. */
const band = (color: string, stops: [number, number][]) =>
  sprite(RW, RH, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, RH);
    for (const [p, a] of stops) g.addColorStop(p, `rgba(255,255,255,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, RW, RH);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, RW, RH);
  });

/**
 * A single vertical ray: violet crown fading into teal, a bright green lower
 * edge, a hint of magenta at the very bottom, soft on both sides.
 */
const raySprite = (colors: readonly string[]) =>
  sprite(RW, RH, (ctx) => {
    const c = (i: number) => colors[i % colors.length];
    const bands: [string, [number, number][]][] = [
      // Body kept dim so the lower fringe is clearly the brightest part:
      // a luminous edge reads as light, a dim one as a dark silhouette.
      [c(2), [[0, 0], [0.12, 0.3], [0.32, 0.24], [0.5, 0]]],
      [c(1), [[0.18, 0], [0.42, 0.3], [0.6, 0.3], [0.74, 0]]],
      // Bright fringe at FRINGE, a short (~8 px) fade, then a long, very faint
      // apron of scattered light so the sky under a curtain isn't a dark cut-out
      // A broad green glow that builds toward the fringe instead of a crisp line:
      // a hard bright edge over a wavy base reads as a rim-lit ridge.
      [c(0), [[0.22, 0], [0.5, 0.3], [0.68, 0.62], [0.77, 0.92], [0.83, 0.42], [0.9, 0.14], [1, 0]]],
      // Soft hot core around the fringe row
      ['#b8ffd2', [[0.7, 0], [0.78, 0.28], [0.84, 0]]],
      // Faint magenta tint just under it
      [c(3), [[0.76, 0], [0.82, 0.22], [0.9, 0.04], [0.95, 0]]],
    ];
    ctx.globalCompositeOperation = 'lighter';
    for (const [color, stops] of bands) {
      const b = band(color, stops);
      if (b) ctx.drawImage(b, 0, 0, RW, RH);
    }
    // Soft sides so neighbouring rays blend into a continuous curtain
    ctx.globalCompositeOperation = 'destination-in';
    const hg = ctx.createLinearGradient(0, 0, RW, 0);
    hg.addColorStop(0, 'rgba(255,255,255,0)');
    hg.addColorStop(0.5, 'rgba(255,255,255,1)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, RW, RH);
  });

export const aurora: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = rand(0, 100);
  const curtains: Curtain[] = [];
  const pulses: Pulse[] = [];

  const rays = spriteCache((key: string) => raySprite(key.split('|')));
  const glow = spriteCache((c: string) => glowSprite(c, false, 0.35));

  const make = (): Curtain => {
    // Partial, overlapping arcs at different heights and slants
    const i = curtains.length;
    const len = rand(0.6, 1);
    return {
      // Ribbons float mid-sky with dark sky above and below: rays that fill
      // all the way to the top turn the scene into a lit-sky-over-dark-ground
      // landscape, which reads as hills.
      base: rand(0.42, 0.6),
      // Gentle base waves: big slow undulations of the lower edge are what
      // turn tall curtains into a hilly horizon.
      amp: rand(0.025, 0.05),
      start: i % 2 ? rand(0.25, 0.55) : rand(-0.2, 0.15),
      len,
      tilt: rand(0.05, 0.14) * (Math.random() < 0.5 ? -1 : 1),
      // Tall rays fading far upward: the defining aurora silhouette
      height: rand(0.3, 0.44),
      bright: rand(0.75, 1),
      dir: Math.random() < 0.5 ? -1 : 1,
      seeds: Array.from({ length: 10 }, () => rand(0, TAU)),
    };
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      const n = o.density > 0 ? clamp(Math.round(1 + o.density * 1.5), 1, 4) : 0;
      fillPool(curtains, n, make);
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;
      for (const p of pulses) p.age += s;
      while (pulses.length && pulses[0].age > 2.6) pulses.shift();
    },
    draw(ctx) {
      if (!curtains.length || w < 2 || h < 2) return;
      const palette = paletteOr(o.colors, AURORA);
      const ray = rays(palette.join('|'));
      const haze = glow(palette[0]);
      if (!ray) return;
      const intensity = Math.min(1.4, 0.6 + 0.4 * o.density);
      const step = 4;
      const rw = step * 2.2;
      const fold = 26 * o.size;
      const drift = o.wind * 0.5;

      ctx.globalCompositeOperation = 'lighter';
      for (const c of curtains) {
        const [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10] = c.seeds;
        const x0 = c.start * w;
        const span = c.len * w;
        for (let x = x0, k = 0; x <= x0 + span; x += step, k++) {
          if (x < -rw * 2 || x > w + rw * 2) continue;
          const u = (x - x0) / span;
          const env = Math.pow(Math.sin(Math.PI * u), 0.7);
          const kx = x / Math.max(1, w);
          // Lower edge: slow waves (wind drifts them sideways), plus a scalloped
          // fold term whose cusps hang downward like curtain pleats (upward
          // cusps would read as mountain peaks), and a faster ripple.
          const wave =
            Math.sin(kx * 5.1 + t * (0.23 + drift) + p1) +
            0.5 * Math.sin(kx * 11.3 - t * 0.41 + p2) +
            0.6 * (0.5 - Math.abs(Math.sin(kx * 8.3 + t * 0.27 + p9))) +
            0.3 * Math.sin(kx * 23 + t * 0.5 + p10);
          // Per-ray ragged end: a few px of jitter, and now and then a longer drip
          const jitter = 2.5 * Math.sin(x * 0.19 + p9 * 3) + 1.5 * Math.sin(x * 0.47 + t * 1.2 + p10);
          const d = Math.sin(x * 0.11 + p1 * 2 + t * 0.15) * Math.sin(x * 0.037 + p2);
          const drip = d > 0.82 ? ((d - 0.82) / 0.18) ** 2 * 24 * o.size : 0;
          const y = h * (c.base + c.amp * wave + c.tilt * (u - 0.5)) + jitter + drip;
          // Folds: rays lean sideways in slowly travelling pleats
          const dx = fold * Math.sin(kx * 9.7 + t * 0.6 + p3) * Math.sin(t * 0.13 + p4);
          const rayH =
            h * c.height * o.size * (0.72 + 0.28 * Math.sin(kx * 7.3 + t * 0.35 + p5)) * (0.85 + 0.15 * Math.sin(x * 0.05 + p8));
          // Fine ray streaks (per-pixel frequencies, so they stay crisp at any width)
          // that slide along the curtain, under broader slow brightness waves.
          const streak = 0.5 + 0.5 * Math.sin(x * 0.23 - t * 1.6 * c.dir + p6) * Math.sin(x * 0.071 + t * 0.45 + p7);
          // High contrast along the curtain: bright ray clusters with near-gaps,
          // so the lower edge reads as luminous segments, not one outline.
          const cluster = 0.5 + 0.5 * Math.sin(kx * 13 + t * 0.7 + p7);
          let b = (0.15 + 1.0 * streak * streak) * (0.35 + 0.65 * cluster);
          b *= 0.8 + 0.2 * Math.sin(t * 0.9 + p8 + kx * 3);
          for (const p of pulses) {
            const front = p.age * 650;
            const d = Math.abs(Math.abs(x - p.x) - front) / 70;
            if (d < 3) b += 1.6 * Math.exp(-d * d) * (1 - p.age / 2.6);
          }
          const a = env * c.bright * b * intensity;
          if (a <= 0.01) continue;
          ctx.globalAlpha = Math.min(1, a * 0.8);
          // The sprite's bright fringe lands on y; its soft tail fades out below
          const full = rayH / FRINGE;
          ctx.drawImage(ray, x + dx - rw / 2, y - rayH, rw, full);
          // Every few columns, a faint wide bloom hugging the lower edge
          if (k % 10 === 0 && haze) {
            ctx.globalAlpha = Math.min(1, env * c.bright * intensity * 0.08);
            ctx.drawImage(haze, x + dx - rayH * 0.5, y - rayH * 0.4, rayH, rayH * 0.5);
          }
        }
      }
    },
    burst(x) {
      pulses.push({ x, age: 0 });
      if (pulses.length > 6) pulses.shift();
    },
  };
};
