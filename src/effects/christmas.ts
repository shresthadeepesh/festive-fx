import type { EffectFactory } from '../types';
import {
  TAU,
  baseTransform,
  clamp,
  glowSprite,
  paletteOr,
  place,
  rand,
  resetTransform,
  retain,
  shade,
  sprite,
  spriteCache,
  stamp,
} from '../util';

/** Classic C9 multicolour: red, green, blue, orange, yellow. */
const C9 = ['#ff3b30', '#26d15a', '#2f7bff', '#ff9a1a', '#ffd83d'];
const WIRE = '#173a22';

/** Seconds per twinkle mode; modes crossfade into each other. */
const MODE_SECONDS = 6;
const BLEND = 0.9;

interface Bulb {
  row: number;
  swag: number;
  /** Position along its swag, 0..1. */
  u: number;
  color: number;
  seed: number;
  /** Resting lean either side of straight down, so the string looks hand-hung. */
  lean: number;
  /** World position and tilt, refreshed every frame. */
  x: number;
  y: number;
  rot: number;
  b: number;
  flash: number;
}

interface Row {
  y0: number;
  sag: number;
  span: number;
  offset: number;
  swags: number;
}

interface Wave {
  x: number;
  age: number;
}

/**
 * C9 bulb hanging from its socket: 24x40 sprite, socket at the top centre.
 * `lit` bakes the glowing glass; the unlit version is the dark glass under it.
 */
const bulbSprite = (color: string, lit: boolean) =>
  sprite(24, 40, (ctx) => {
    ctx.translate(12, 1);
    // Socket: ribbed green plastic
    ctx.fillStyle = '#1f5130';
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(4, 0);
    ctx.lineTo(4.4, 9.5);
    ctx.lineTo(-4.4, 9.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,200,140,0.35)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (const y of [2.5, 5, 7.5]) {
      ctx.moveTo(-4, y);
      ctx.lineTo(4, y);
    }
    ctx.stroke();

    // Glass: the classic C9 cone that tapers to a soft point
    const glass = () => {
      ctx.beginPath();
      ctx.moveTo(-3.8, 9);
      ctx.bezierCurveTo(-9.5, 13, -9.2, 24, -2, 34.5);
      ctx.quadraticCurveTo(0, 37.5, 2, 34.5);
      ctx.bezierCurveTo(9.2, 24, 9.5, 13, 3.8, 9);
      ctx.closePath();
    };
    glass();
    const g = ctx.createRadialGradient(-1, 19, 1, 0, 21, 15);
    if (lit) {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.18, shade(color, -0.65));
      g.addColorStop(0.55, color);
      g.addColorStop(1, shade(color, 0.3));
    } else {
      g.addColorStop(0, shade(color, 0.2));
      g.addColorStop(1, shade(color, 0.7));
    }
    ctx.fillStyle = g;
    ctx.fill();

    // Faceted glass ridges catch the light
    ctx.save();
    glass();
    ctx.clip();
    ctx.strokeStyle = lit ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const x of [-4.5, 0, 4.5]) {
      ctx.moveTo(x * 0.9, 10);
      ctx.quadraticCurveTo(x * 1.25, 22, x * 0.25, 35);
    }
    ctx.stroke();
    ctx.restore();

    // Specular highlight
    ctx.fillStyle = lit ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.ellipse(-3.4, 16, 1.4, 4.2, 0.25, 0, TAU);
    ctx.fill();
  });

/** Brightness of one bulb in each twinkle mode, 0..1. */
const MODES: ((i: number, c: number, seed: number, t: number) => number)[] = [
  // chase: a lit wave runs along the string
  (i, _c, _s, t) => 0.18 + 0.82 * Math.pow(0.5 + 0.5 * Math.cos(i * 2.094 - t * 6), 4),
  // twinkle: every bulb on its own rhythm
  (_i, _c, s, t) => 0.25 + 0.75 * clamp(0.5 + 0.9 * Math.sin(t * (1.4 + (s % 1) * 3) + s * 10), 0, 1),
  // fade: colours breathe in turn
  (_i, c, _s, t) => 0.22 + 0.78 * (0.5 + 0.5 * Math.sin(t * 1.5 - c * 1.26)),
  // all on, with a gentle shimmer
  (_i, _c, s, t) => 0.9 + 0.1 * Math.sin(t * 9 + s * 5),
];

export const christmas: EffectFactory = (o) => {
  let w = 0;
  let t = 0;
  let rows: Row[] = [];
  let bulbs: Bulb[] = [];
  const waves: Wave[] = [];

  const lit = spriteCache((c: string) => bulbSprite(c, true));
  const unlit = spriteCache((c: string) => bulbSprite(c, false));
  const glow = spriteCache((c: string) => glowSprite(c, false, 0.22));
  const sparkle = spriteCache((c: string) => glowSprite(c, true, 0.15));

  const palette = () => paletteOr(o.colors, C9);

  const layout = () => {
    const n = o.density > 0 && w > 0 ? clamp(Math.round(o.density * 1.4 + 0.3), 1, 4) : 0;
    const k = o.size;
    rows = [];
    bulbs = [];
    for (let r = 0; r < n; r++) {
      const target = (230 + r * 40) * k;
      const swags = Math.max(1, Math.round(w / target));
      const span = w / swags;
      // Odd rows are offset half a swag so the scallops interleave
      const offset = r % 2 ? -span / 2 : 0;
      const count = swags + (r % 2 ? 1 : 0);
      rows.push({ y0: (2 + r * 32) * k, sag: (30 + r * 8) * k, span, offset, swags: count });
      const per = Math.max(2, Math.floor(span / (30 * k)));
      for (let s = 0; s < count; s++) {
        for (let j = 0; j < per; j++) {
          bulbs.push({
            row: r,
            swag: s,
            u: (j + 0.5) / per,
            color: bulbs.length % 5,
            seed: rand(0, 100),
            lean: rand(-0.22, 0.22),
            x: 0,
            y: 0,
            rot: 0,
            b: 1,
            flash: 0,
          });
        }
      }
    }
  };

  /** Point and slope on swag `s` of `row` at parameter u, including sway. */
  const swagAt = (row: Row, r: number, s: number, u: number) => {
    const bow = 4 * u * (1 - u);
    const sway = (Math.sin(t * 0.8 + r * 1.3 + s * 0.9) * 4 + o.wind * 10) * o.size;
    const sag = row.sag * (1 + 0.05 * Math.sin(t * 1.1 + s + r));
    const x = row.offset + (s + u) * row.span + sway * bow;
    const y = row.y0 + sag * bow;
    const slope = (sag * 4 * (1 - 2 * u)) / row.span;
    return { x, y, slope };
  };

  return {
    resize(nw) {
      w = nw;
      layout();
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;
      retain(waves, (wv) => (wv.age += s) * 900 < w + 400);

      const cycle = t / MODE_SECONDS;
      const mode = Math.floor(cycle) % MODES.length;
      const prev = (mode + MODES.length - 1) % MODES.length;
      const local = (cycle % 1) * MODE_SECONDS;
      const mix = local < BLEND ? local / BLEND : 1;

      bulbs.forEach((b, i) => {
        const row = rows[b.row];
        const p = swagAt(row, b.row, b.swag, b.u);
        b.x = p.x;
        b.y = p.y;
        b.rot = Math.atan(p.slope) * 0.45 + b.lean + Math.sin(t * 1.6 + b.seed) * 0.06 + o.wind * 0.15;
        const now = MODES[mode](i, b.color, b.seed, t);
        b.b = mix < 1 ? MODES[prev](i, b.color, b.seed, t) * (1 - mix) + now * mix : now;
        // Flash waves travel outward from where the user clicked
        let f = 0;
        for (const wv of waves) {
          const d = Math.abs(b.x - wv.x) - wv.age * 900;
          f += Math.exp(-(d * d) / 3600) * Math.max(0, 1 - wv.age * 0.6);
        }
        b.flash = Math.min(1, f);
      });
    },
    draw(ctx) {
      if (!bulbs.length) return;
      const pal = palette();
      const k = o.size;
      const m = baseTransform(ctx);

      // Wire: two twisted strands, one path for every swag
      ctx.lineCap = 'round';
      for (const [width, color, phase] of [[1.8, WIRE, 0], [1, '#2c5e3a', 1.5]] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width * k;
        ctx.beginPath();
        rows.forEach((row, r) => {
          for (let s = 0; s < row.swags; s++) {
            for (let i = 0; i <= 20; i++) {
              const p = swagAt(row, r, s, i / 20);
              const twist = Math.sin(i * 1.7 + phase) * 0.7 * k;
              if (i === 0) ctx.moveTo(p.x, p.y + twist);
              else ctx.lineTo(p.x, p.y + twist);
            }
          }
        });
        ctx.stroke();
      }

      // Coloured light spilling around each bulb
      ctx.globalCompositeOperation = 'lighter';
      for (const b of bulbs) {
        const c = pal[b.color % pal.length];
        const cx = b.x - Math.sin(b.rot) * 22 * k;
        const cy = b.y + Math.cos(b.rot) * 22 * k;
        const v = Math.min(1, b.b + b.flash);
        ctx.globalAlpha = 0.72 * v;
        stamp(ctx, glow(c), cx, cy, 78 * k * (0.6 + 0.4 * v));
      }

      // Bulbs: dark glass, lit glass faded in on top
      ctx.globalCompositeOperation = 'source-over';
      for (const b of bulbs) {
        const c = pal[b.color % pal.length];
        place(ctx, m, b.x, b.y, b.rot);
        const v = Math.min(1, b.b + b.flash);
        if (v < 0.98) {
          ctx.globalAlpha = 1;
          const img = unlit(c);
          if (img) ctx.drawImage(img, -12 * k, -1 * k, 24 * k, 40 * k);
        }
        ctx.globalAlpha = v;
        const img = lit(c);
        if (img) ctx.drawImage(img, -12 * k, -1 * k, 24 * k, 40 * k);
      }
      resetTransform(ctx, m);

      // White-hot glints: flash waves and the all-on sparkle mode
      ctx.globalCompositeOperation = 'lighter';
      const white = sparkle('#fff6e0');
      for (const b of bulbs) {
        const twinkle = Math.sin(t * 3.3 + b.seed * 17) > 0.97 ? 0.8 : 0;
        const a = Math.max(b.flash, twinkle * b.b);
        if (a < 0.05) continue;
        ctx.globalAlpha = a;
        stamp(ctx, white, b.x - Math.sin(b.rot) * 20 * k, b.y + Math.cos(b.rot) * 20 * k, 26 * k);
      }
    },
    burst(x) {
      waves.push({ x, age: 0 });
      if (waves.length > 8) waves.shift();
    },
  };
};
