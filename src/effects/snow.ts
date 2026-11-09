import type { EffectFactory } from '../types';
import { TAU, baseTransform, clamp, countFor, fillPool, glowSprite, gust, place, rand, resetTransform, sprite, spriteCache, stamp } from '../util';

interface Flake {
  x: number;
  y: number;
  r: number;
  vy: number;
  sway: number;
  phase: number;
  freq: number;
  alpha: number;
  rot: number;
  vrot: number;
  tumble: number;
  variant: number;
}

/** Far haze, mid flakes, near crystals: speed and wind response grow with closeness (parallax). */
const LAYERS = [
  { share: 0.5, r: [0.5, 1.3], alpha: [0.2, 0.4], fall: 0.55, drift: 0.5, sway: [4, 12] },
  { share: 0.42, r: [1.3, 2.8], alpha: [0.55, 0.85], fall: 1, drift: 1, sway: [10, 28] },
  { share: 0.08, r: [3.5, 7], alpha: [0.75, 0.95], fall: 1.35, drift: 1.6, sway: [18, 40] },
] as const;

const COL = 4; // px per snow-pile column

/** Six-armed dendrite. Three variants so near flakes don't all look cloned. */
const crystal = (color: string, variant: number) =>
  sprite(64, 64, (ctx) => {
    ctx.translate(32, 32);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    const arm = 25;
    const branches = [
      [ [9, 6], [16, 5] ],
      [ [7, 8], [13, 6], [19, 4] ],
      [ [12, 9] ],
    ][variant];
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 3);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -arm);
      for (const [at, len] of branches) {
        ctx.moveTo(0, -at);
        ctx.lineTo(-len * 0.7, -at - len);
        ctx.moveTo(0, -at);
        ctx.lineTo(len * 0.7, -at - len);
      }
      ctx.stroke();
      if (variant === 2) {
        // Plate-type tips
        ctx.beginPath();
        ctx.arc(0, -arm, 2.6, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    // Hexagonal centre plate
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.lineTo(Math.cos(a) * 5, Math.sin(a) * 5);
    }
    ctx.closePath();
    ctx.fill();
  });

export const snow: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = rand(0, 100);
  const layers: Flake[][] = [[], [], []];
  let pile = new Float32Array(0);
  let smoothTimer = 0;

  const color = () => o.colors?.[0] ?? '#ffffff';
  const dot = spriteCache((c: string) => glowSprite(c, false, 0.35));
  const crystals = spriteCache((key: string) => {
    const [c, v] = key.split('|');
    return crystal(c, Number(v));
  });

  const pileMax = () => Math.min(26, h * 0.05) * o.size;
  const pileAt = (x: number) => pile[clamp((x / COL) | 0, 0, pile.length - 1)] ?? 0;

  const make = (layer: number, anywhere: boolean): Flake => {
    const L = LAYERS[layer];
    const r = rand(L.r[0], L.r[1]) * o.size;
    return {
      x: rand(-20, w + 20),
      y: anywhere ? rand(-20, h) : -r * 4 - rand(0, 60),
      r,
      vy: (22 + r * 9) * L.fall,
      sway: rand(L.sway[0], L.sway[1]),
      phase: rand(0, TAU),
      freq: rand(0.4, 1.3),
      alpha: rand(L.alpha[0], L.alpha[1]),
      rot: rand(0, TAU),
      vrot: rand(-0.7, 0.7),
      tumble: rand(0, TAU),
      variant: (Math.random() * 3) | 0,
    };
  };

  const deposit = (x: number, amount: number) => {
    const i = clamp((x / COL) | 0, 0, pile.length - 1);
    const max = pileMax();
    // Spread over neighbours so the pile grows as soft mounds, not spikes.
    const weights = [0.12, 0.2, 0.36, 0.2, 0.12];
    for (let k = 0; k < 5; k++) {
      const j = i + k - 2;
      if (j >= 0 && j < pile.length) pile[j] = Math.min(max, pile[j] + amount * weights[k]);
    }
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      const total = countFor(w, h, 220, o.density);
      LAYERS.forEach((L, i) => fillPool(layers[i], Math.round(total * L.share), () => make(i, true)));
      const cols = Math.ceil(w / COL) + 1;
      if (cols !== pile.length) pile = new Float32Array(cols);
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;
      const wind = o.wind + gust(t) * 0.3;
      const ground = o.ground;

      for (let li = 0; li < 3; li++) {
        const L = LAYERS[li];
        for (const f of layers[li]) {
          f.phase += f.freq * s;
          f.rot += f.vrot * s;
          f.tumble += 0.8 * s;
          f.y += f.vy * s;
          f.x += (Math.cos(f.phase) * f.sway + wind * 55 * L.drift) * s;

          if (ground && li > 0 && f.y + f.r * 0.5 >= h - pileAt(f.x)) {
            deposit(f.x, f.r * 2.2);
            Object.assign(f, make(li, false));
          } else if (f.y - f.r * 3 > h) {
            Object.assign(f, make(li, false));
          }
          const m = f.r * 3;
          if (f.x < -m) f.x += w + m * 2;
          else if (f.x > w + m) f.x -= w + m * 2;
        }
      }

      if (!ground) {
        pile.fill(0);
      } else {
        smoothTimer -= s;
        if (smoothTimer <= 0) {
          smoothTimer = 0.1;
          const max = pileMax();
          for (let i = 1; i < pile.length - 1; i++) {
            pile[i] = pile[i] * 0.8 + (pile[i - 1] + pile[i + 1]) * 0.1;
            // Slow melt, faster near the cap: settles at a natural-looking height.
            pile[i] = Math.max(0, pile[i] - 0.06 * (pile[i] / max) ** 3);
          }
        }
      }
    },
    draw(ctx) {
      const c = color();
      const d = dot(c);

      for (let li = 0; li < 2; li++) {
        for (const f of layers[li]) {
          ctx.globalAlpha = f.alpha;
          stamp(ctx, d, f.x, f.y, f.r * 3.2);
        }
      }

      if (o.ground) {
        let top = 0;
        for (let i = 0; i < pile.length; i++) if (pile[i] > top) top = pile[i];
        if (top > 0.4) {
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let i = 0; i < pile.length; i++) ctx.lineTo(i * COL, h - pile[i]);
          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = c;
          ctx.fill();
          // Cool blue shadow deeper in the drift
          const g = ctx.createLinearGradient(0, h - top, 0, h);
          g.addColorStop(0, 'rgba(150,180,220,0)');
          g.addColorStop(1, 'rgba(150,180,220,0.45)');
          ctx.fillStyle = g;
          ctx.fill();
          // Sparkle along the crest
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 0; i < pile.length; i++) ctx.lineTo(i * COL, h - pile[i] + 0.5);
          ctx.stroke();
        }
      }

      const near = layers[2];
      if (near.length) {
        const m = baseTransform(ctx);
        const variants = [crystals(`${c}|0`), crystals(`${c}|1`), crystals(`${c}|2`)];
        for (const f of near) {
          place(ctx, m, f.x, f.y, f.rot, 0.7 + 0.3 * Math.cos(f.tumble), 1);
          ctx.globalAlpha = f.alpha * 0.35;
          stamp(ctx, d, 0, 0, f.r * 4.5); // soft halo
          ctx.globalAlpha = f.alpha;
          stamp(ctx, variants[f.variant], 0, 0, f.r * 5);
        }
        resetTransform(ctx, m);
      }
    },
  };
};
