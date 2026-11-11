import type { EffectFactory } from '../types';
import { TAU, shade, clamp, countFor, glowSprite, paletteOr, pick, rand, retain, sprite, spriteCache, stamp } from '../util';

/** Vivid powder colours (gulal-bright, as poured by hand). */
const POWDER = ['#e6194b', '#ff7f00', '#ffd400', '#3cb44b', '#0082c8', '#911eb4', '#f032e6', '#ff4f79', '#00b3a4'];
const RICE = '#fbf6ea';

type RingKind = 'flower' | 'dots' | 'petals' | 'lotus' | 'chevron' | 'scallop' | 'band' | 'diamonds';

interface Ring {
  kind: RingKind;
  r0: number;
  r1: number;
  color: string;
  accent: string;
  /** Soft ground tone under the motifs. */
  base: string;
  /** Pre-rendered ring (with grain); swept in during its reveal. */
  img: HTMLCanvasElement | null;
}

interface Rangoli {
  x: number;
  y: number;
  R: number;
  fold: number;
  rings: Ring[];
  /** Finished rings are merged here so a frame draws at most two images. */
  base: HTMLCanvasElement | null;
  baseCtx: CanvasRenderingContext2D | null;
  ring: number;
  progress: number;
  /** Time since the last ring finished (glow, hold, fade). */
  after: number;
  rot: number;
  auto: boolean;
}

const RING_TIME = 0.7; // seconds to pour one ring
const GLOW = 2.2;
const HOLD = 3;
const FADE = 1.6;

/** Fine speckle used to give poured powder its grain. */
const noiseSprite = () =>
  sprite(64, 64, (ctx) => {
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)';
      ctx.fillRect(Math.random() * 64, Math.random() * 64, 0.6, 0.6);
    }
  });

/** Path of one petal (almond) from radius a to b at angle th, half-width hw (radians). */
const petalPath = (ctx: CanvasRenderingContext2D, th: number, a: number, b: number, hw: number) => {
  const cx = Math.cos(th);
  const cy = Math.sin(th);
  const mid = (a + b) / 2;
  const side = mid * Math.tan(hw);
  const px = -cy;
  const py = cx;
  ctx.moveTo(cx * a, cy * a);
  ctx.quadraticCurveTo(cx * mid + px * side * 1.3, cy * mid + py * side * 1.3, cx * b, cy * b);
  ctx.quadraticCurveTo(cx * mid - px * side * 1.3, cy * mid - py * side * 1.3, cx * a, cy * a);
};

/** Paint one ring around (0, 0) in local coordinates. */
const paintRing = (ctx: CanvasRenderingContext2D, ring: Ring, fold: number, noise: HTMLCanvasElement | null, size: number) => {
  const { r0, r1, color, accent } = ring;
  const mid = (r0 + r1) / 2;
  const step = TAU / fold;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Ground colour poured first so motifs sit on powder, not bare floor
  if (ring.kind !== 'flower' && ring.kind !== 'band') {
    ctx.fillStyle = ring.base;
    ctx.beginPath();
    ctx.arc(0, 0, r1, 0, TAU);
    ctx.arc(0, 0, r0, 0, TAU, true);
    ctx.fill();
  }

  switch (ring.kind) {
    case 'flower': {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < fold; i++) petalPath(ctx, i * step, 0, r1, step * 0.42);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(0, 0, r1 * 0.32, 0, TAU);
      ctx.fill();
      ctx.fillStyle = RICE;
      ctx.beginPath();
      ctx.arc(0, 0, r1 * 0.12, 0, TAU);
      ctx.fill();
      break;
    }
    case 'dots': {
      const n = fold * 2;
      const dr = Math.min((r1 - r0) * 0.42, (Math.PI * mid) / n * 0.7);
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = i * (TAU / n);
        ctx.moveTo(Math.cos(a) * mid + dr, Math.sin(a) * mid);
        ctx.arc(Math.cos(a) * mid, Math.sin(a) * mid, dr, 0, TAU);
      }
      ctx.fill();
      ctx.fillStyle = RICE;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = i * (TAU / n);
        ctx.moveTo(Math.cos(a) * mid + dr * 0.35, Math.sin(a) * mid);
        ctx.arc(Math.cos(a) * mid, Math.sin(a) * mid, dr * 0.35, 0, TAU);
      }
      ctx.fill();
      break;
    }
    case 'petals': {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < fold; i++) petalPath(ctx, i * step, r0, r1, step * 0.4);
      ctx.fill();
      // Inner petal in the accent colour, layered like poured powder
      ctx.fillStyle = accent;
      ctx.beginPath();
      for (let i = 0; i < fold; i++) petalPath(ctx, i * step, r0 + (r1 - r0) * 0.18, r1 - (r1 - r0) * 0.22, step * 0.2);
      ctx.fill();
      break;
    }
    case 'lotus': {
      // Two layers: back petals offset half a step, front petals on the axis
      ctx.fillStyle = accent;
      ctx.beginPath();
      for (let i = 0; i < fold; i++) petalPath(ctx, i * step + step / 2, r0, r1 * 0.94, step * 0.45);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < fold; i++) petalPath(ctx, i * step, r0, r1, step * 0.36);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 0.9 * size;
      ctx.beginPath();
      for (let i = 0; i < fold; i++) {
        const a = i * step;
        ctx.moveTo(Math.cos(a) * (r0 + 2), Math.sin(a) * (r0 + 2));
        ctx.lineTo(Math.cos(a) * (r1 - 3), Math.sin(a) * (r1 - 3));
      }
      ctx.stroke();
      break;
    }
    case 'chevron': {
      // Parallel zigzag band: outer edge peaks at r1, inner edge follows it inward
      const n = fold * 2;
      const depth = (r1 - r0) * 0.5;
      const zig = (outer: number, i: number) => (i % 2 ? outer : outer - depth);
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = i * (TAU / n);
        ctx.lineTo(Math.cos(a) * zig(r1, i), Math.sin(a) * zig(r1, i));
      }
      for (let i = n; i >= 0; i--) {
        const a = i * (TAU / n);
        ctx.lineTo(Math.cos(a) * zig(r0 + depth, i), Math.sin(a) * zig(r0 + depth, i));
      }
      ctx.closePath();
      ctx.fill();
      // Accent dots tucked into each outer peak
      ctx.fillStyle = accent;
      ctx.beginPath();
      const dr = Math.max(1.2, depth * 0.22);
      for (let i = 1; i <= n; i += 2) {
        const a = i * (TAU / n);
        const r = r1 - depth * 0.55;
        ctx.moveTo(Math.cos(a) * r + dr, Math.sin(a) * r);
        ctx.arc(Math.cos(a) * r, Math.sin(a) * r, dr, 0, TAU);
      }
      ctx.fill();
      break;
    }
    case 'scallop': {
      const n = fold * 2;
      const half = Math.PI / n;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, r0, 0, TAU);
      for (let i = 0; i < n; i++) {
        const a = i * (TAU / n) + half;
        const br = Math.min(r1 - r0, mid * Math.sin(half) * 1.05);
        ctx.moveTo(Math.cos(a) * r0 + Math.cos(a) * br, Math.sin(a) * r0 + Math.sin(a) * br);
        ctx.arc(Math.cos(a) * r0, Math.sin(a) * r0, br, 0, TAU);
      }
      ctx.fill('nonzero');
      // Punch the centre back out so only the bumps and band remain
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(0, 0, r0 - (r1 - r0) * 0.25, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = accent;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = i * (TAU / n) + half;
        const r = r0 + (r1 - r0) * 0.45;
        ctx.moveTo(Math.cos(a) * r + 1.6 * size, Math.sin(a) * r);
        ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.6 * size, 0, TAU);
      }
      ctx.fill();
      break;
    }
    case 'band': {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, r1, 0, TAU);
      ctx.arc(0, 0, r0, 0, TAU, true);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2 * size;
      ctx.setLineDash([3 * size, 4 * size]);
      ctx.beginPath();
      ctx.arc(0, 0, mid, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'diamonds': {
      ctx.fillStyle = color;
      ctx.beginPath();
      const hw = step * 0.3;
      for (let i = 0; i < fold; i++) {
        const a = i * step + step / 2;
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a - hw) * mid, Math.sin(a - hw) * mid);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a + hw) * mid, Math.sin(a + hw) * mid);
        ctx.closePath();
      }
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath();
      for (let i = 0; i < fold; i++) {
        const a = i * step + step / 2;
        ctx.moveTo(Math.cos(a) * mid + 1.8 * size, Math.sin(a) * mid);
        ctx.arc(Math.cos(a) * mid, Math.sin(a) * mid, 1.8 * size, 0, TAU);
      }
      ctx.fill();
      break;
    }
  }

  // Powder grain over what was just poured
  if (noise) {
    const pat = ctx.createPattern(noise, 'repeat');
    if (pat) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = pat;
      ctx.fillRect(-r1 - 4, -r1 - 4, r1 * 2 + 8, r1 * 2 + 8);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // Rice-flour outline dots marking the ring's outer edge
  if (ring.kind !== 'flower') {
    const n = Math.max(fold * 3, Math.round((TAU * r1) / (5.5 * size)));
    ctx.fillStyle = RICE;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const r = r1 + 2.2 * size;
      ctx.moveTo(Math.cos(a) * r + 0.9 * size, Math.sin(a) * r);
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 0.9 * size, 0, TAU);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }
};

const KINDS: RingKind[] = ['dots', 'petals', 'lotus', 'chevron', 'scallop', 'band', 'diamonds'];

export const rangoli: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let spawnTimer = 0.3;
  const designs: Rangoli[] = [];
  let noise: HTMLCanvasElement | null | undefined;
  const glow = spriteCache((c: string) => glowSprite(c, true, 0.3));
  const halo = spriteCache((c: string) => glowSprite(c, false, 0.5));

  const palette = () => paletteOr(o.colors, POWDER);
  const radiusFor = () => clamp(rand(88, 135) * o.size, 0, Math.min(w, h) * 0.44);

  const design = (x: number, y: number, R: number, auto: boolean): Rangoli | null => {
    if (R < 14) return null;
    if (noise === undefined) noise = noiseSprite();
    const fold = pick([6, 8, 8, 10, 12, 12]);
    const pal = palette();
    // Ring widths from the centre out, normalised to fill R
    const kinds: RingKind[] = ['flower'];
    const count = R > 105 ? 8 : R > 75 ? 7 : R > 45 ? 5 : 3;
    let last: RingKind = 'flower';
    while (kinds.length < count) {
      let k = pick(KINDS);
      if (k === last) k = pick(KINDS);
      kinds.push(k);
      last = k;
    }
    // Petal-ish rings read best near the rim
    if (kinds[kinds.length - 1] === 'band' || kinds[kinds.length - 1] === 'dots') kinds[kinds.length - 1] = pick(['lotus', 'petals', 'scallop']);
    const weights = kinds.map((k) => (k === 'flower' ? 1.4 : k === 'band' || k === 'dots' ? 0.7 : 1.2));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = 0;
    const rings: Ring[] = kinds.map((kind, i) => {
      const r0 = r;
      r += (weights[i] / total) * R;
      const color = pick(pal);
      let accent = pick(pal);
      if (accent === color) accent = pal[(pal.indexOf(color) + 3) % pal.length];
      // Ground tone: a pale wash of the accent, or a deep tone for contrast
      const base = shade(accent, Math.random() < 0.65 ? -0.6 : 0.3);
      return { kind, r0, r1: r, color, accent, base, img: null };
    });
    const box = R * 2 + 16;
    const base = sprite(box, box, () => {});
    let baseCtx: CanvasRenderingContext2D | null = null;
    try {
      baseCtx = base?.getContext('2d') ?? null;
    } catch {
      baseCtx = null;
    }
    return { x, y, R, fold, rings, base, baseCtx, ring: 0, progress: 0, after: 0, rot: rand(0, TAU), auto };
  };

  /** Render ring i into its own canvas (grain included) the first time it's poured. */
  const prepare = (d: Rangoli, i: number) => {
    const ring = d.rings[i];
    if (ring.img) return;
    const box = d.R * 2 + 16;
    ring.img = sprite(box, box, (ctx) => {
      ctx.translate(box / 2, box / 2);
      ctx.rotate(d.rot);
      paintRing(ctx, ring, d.fold, noise ?? null, o.size);
    });
  };

  /** Somewhere free: the candidate farthest from existing designs. */
  const spot = (R: number) => {
    let best = { x: w / 2, y: h / 2, score: -1 };
    for (let i = 0; i < 12; i++) {
      const x = rand(R + 8, Math.max(R + 9, w - R - 8));
      const y = rand(R + 8, Math.max(R + 9, h - R - 8));
      let score = Infinity;
      for (const d of designs) score = Math.min(score, Math.hypot(d.x - x, d.y - y) - d.R - R);
      if (score > best.score) best = { x, y, score };
    }
    return best;
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    update(dt) {
      const s = dt * o.speed;
      const want = o.density > 0 ? Math.max(1, countFor(w, h, 2, o.density)) : 0;
      let auto = 0;
      for (const d of designs) if (d.auto) auto++;
      spawnTimer -= s;
      if (auto < want && spawnTimer <= 0) {
        const R = radiusFor();
        const at = spot(R);
        const d = design(at.x, at.y, R, true);
        if (d) designs.push(d);
        spawnTimer = rand(1.2, 2.6);
      }

      retain(designs, (d) => {
        if (d.ring < d.rings.length) {
          prepare(d, d.ring);
          d.progress += s / RING_TIME;
          if (d.progress >= 1) {
            // Merge the finished ring into the base image
            const img = d.rings[d.ring].img;
            const box = d.R * 2 + 16;
            if (img && d.baseCtx) d.baseCtx.drawImage(img, 0, 0, box, box);
            d.rings[d.ring].img = null;
            d.ring++;
            d.progress = 0;
          }
          return true;
        }
        d.after += s;
        return d.after < GLOW + HOLD + FADE;
      });
    },
    draw(ctx) {
      for (const d of designs) {
        const box = d.R * 2 + 16;
        const fade = d.after > GLOW + HOLD ? 1 - (d.after - GLOW - HOLD) / FADE : 1;
        if (fade <= 0) continue;
        const left = d.x - box / 2;
        const top = d.y - box / 2;

        // Warm glow once the design is complete
        const done = d.ring >= d.rings.length;
        if (done) {
          const g = Math.min(1, d.after / 0.8) * fade;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.22 * g;
          stamp(ctx, halo('#ffb347'), d.x, d.y, d.R * 3);
          ctx.globalCompositeOperation = 'source-over';
        }

        ctx.globalAlpha = fade;
        if (d.base && d.ring > 0) ctx.drawImage(d.base, left, top, box, box);

        if (!done) {
          const ring = d.rings[d.ring];
          if (ring.img) {
            // Sweep the ring in like powder poured around the circle
            const a0 = d.rot - Math.PI / 2;
            const a1 = a0 + d.progress * TAU;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.arc(d.x, d.y, ring.r1 + 6 * o.size, a0, a1);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(ring.img, left, top, box, box);
            ctx.restore();
            // A pinch of glitter at the pouring hand
            const rm = (ring.r0 + ring.r1) / 2;
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.8;
            stamp(ctx, glow('#ffe9b0'), d.x + Math.cos(a1) * rm, d.y + Math.sin(a1) * rm, 10 * o.size);
            ctx.globalCompositeOperation = 'source-over';
          }
        } else {
          // Little diyas set around the finished rangoli, flickering
          const n = d.fold;
          const rr = d.R + 9 * o.size;
          const lit = Math.min(1, d.after / 0.6) * fade;
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < n; i++) {
            const a = d.rot + (i / n) * TAU + TAU / n / 2;
            const fl = 0.8 + 0.2 * Math.sin(d.after * 13 + i * 2.1) + rand(-0.05, 0.05);
            const px = d.x + Math.cos(a) * rr;
            const py = d.y + Math.sin(a) * rr;
            ctx.globalAlpha = 0.5 * lit * fl;
            stamp(ctx, halo('#ff8a1c'), px, py, 26 * o.size * fl);
            ctx.globalAlpha = lit;
            stamp(ctx, glow('#ffd23f'), px, py, 7 * o.size * fl);
          }
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    },
    burst(x, y) {
      const R = radiusFor();
      const d = design(clamp(x, 0, w), clamp(y, 0, h), R, false);
      if (d) designs.push(d);
      if (designs.length > 12) designs.shift();
    },
  };
};
