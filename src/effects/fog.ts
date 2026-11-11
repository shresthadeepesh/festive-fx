import type { EffectFactory } from '../types';
import { clamp, countFor, glowSprite, gust, rand, retain, sprite, spriteCache } from '../util';

const MIST = '#dfe6ee';

/** Parallax layers, back to front: slower, fainter, smaller at the back. */
const LAYERS = [
  { share: 0.4, speed: 6, alpha: 0.5, scale: 0.85 },
  { share: 0.35, speed: 12, alpha: 0.6, scale: 1.05 },
  { share: 0.25, speed: 22, alpha: 0.7, scale: 1.3 },
] as const;

const CW = 256;
const CH = 128;

interface Puff {
  layer: number;
  x: number;
  y: number;
  w: number;
  variant: number;
  seed: number;
}

interface Hole {
  x: number;
  y: number;
  /** 0..1; eases in while held, heals back to 0 afterwards. */
  strength: number;
  held: boolean;
}

interface Wave {
  x: number;
  y: number;
  age: number;
}

/**
 * A lumpy cloud: dozens of overlapping soft blobs packed toward the middle,
 * so edges break up instead of reading as one smooth ellipse.
 */
const cloudSprite = (color: string, variant: number) =>
  sprite(CW, CH, (ctx) => {
    let seed = 1 + variant * 977;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) {
      // Gaussian-ish spread around the centre
      const gx = (r() + r() + r()) / 3;
      const gy = (r() + r() + r()) / 3;
      const x = CW * (0.12 + 0.76 * gx);
      const y = CH * (0.22 + 0.56 * gy);
      // Mix of big soft masses and small wisps for texture
      const wisp = i % 3 === 0;
      const rad = CH * (wisp ? 0.05 + 0.08 * r() : 0.14 + 0.24 * r());
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const a = wisp ? 0.08 + 0.1 * r() : 0.05 + 0.09 * r();
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, CW, CH);
  });

/** Vertical band for the ground bank: clear at the top, thick at the bottom. */
const bankSprite = (color: string) =>
  sprite(8, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0.75)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 128);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 8, 128);
  });

/** Soft annulus used to punch the expanding ring of a push wave. */
const ringSprite = () =>
  sprite(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(0.78, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });

export const fog: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = rand(0, 100);
  const puffs: Puff[] = [];
  const holes: Hole[] = [];
  const waves: Wave[] = [];
  let lastX = -1e9;
  let lastY = -1e9;

  const clouds = spriteCache((key: string) => {
    const [c, v] = key.split('|');
    return cloudSprite(c, Number(v));
  });
  const bank = spriteCache((c: string) => bankSprite(c));
  const hole = spriteCache(() => glowSprite('#000', false, 0.7));
  const ring = spriteCache(() => ringSprite());

  const make = (layer: number, x = rand(-0.2, 1.2) * w): Puff => {
    const L = LAYERS[layer];
    const low = o.ground ? 0.28 : 0;
    // With ground on, mist pools toward the bottom
    const v = o.ground ? Math.sqrt(Math.random()) : Math.random();
    return {
      layer,
      x,
      y: h * (low + (1 - low) * v) - h * 0.05,
      w: rand(380, 720) * L.scale * o.size * clamp(Math.max(w, h) / 1280, 0.45, 1.4),
      variant: (Math.random() * 4) | 0,
      seed: rand(0, 100),
    };
  };

  const sync = () => {
    const total = countFor(w, h, 42, o.density);
    const want = LAYERS.map((L) => Math.round(total * L.share));
    const have = [0, 0, 0];
    for (const p of puffs) have[p.layer]++;
    LAYERS.forEach((_, i) => {
      for (; have[i] < want[i]; have[i]++) puffs.push(make(i));
    });
    const kept = [0, 0, 0];
    retain(puffs, (p) => kept[p.layer]++ < want[p.layer]);
    puffs.sort((a, b) => a.layer - b.layer);
  };

  return {
    resize(nw, nh) {
      const rescale = w > 0 && h > 0;
      if (rescale) for (const p of puffs) p.y *= nh / h;
      w = nw;
      h = nh;
      sync();
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;
      const wind = o.wind + gust(t * 0.5, 3.1) * 0.25;
      // Mist always creeps a little; wind sets direction and pace
      const pace = (0.35 + Math.abs(wind) * 3) * (wind < 0 ? -1 : 1);
      for (const p of puffs) {
        p.x += LAYERS[p.layer].speed * pace * s;
        if (p.x - p.w / 2 > w + 40) p.x = -p.w / 2 - 40;
        else if (p.x + p.w / 2 < -40) p.x = w + p.w / 2 + 40;
      }
      // Holes left behind by the cursor heal; the held one eases open
      for (const hl of holes) hl.strength = hl.held ? Math.min(1, hl.strength + s * 3) : hl.strength - s * 0.45;
      retain(holes, (hl) => hl.held || hl.strength > 0);
      retain(waves, (wv) => (wv.age += s) < 1.8);
    },
    draw(ctx) {
      if (!puffs.length || w < 2 || h < 2) return;
      const color = o.colors?.[0] ?? MIST;

      for (const p of puffs) {
        const L = LAYERS[p.layer];
        const img = clouds(`${color}|${p.variant}`);
        if (!img) continue;
        // Breathing: each puff thickens and thins slowly
        ctx.globalAlpha = L.alpha * (0.7 + 0.3 * Math.sin(t * 0.18 + p.seed)) * Math.min(1, 0.5 + 0.5 * o.density);
        const ph = p.w * (CH / CW) * (0.85 + 0.15 * Math.sin(t * 0.11 + p.seed * 2));
        ctx.drawImage(img, p.x - p.w / 2, p.y - ph / 2, p.w, ph);
      }

      // A thin veil over everything so partings read even between puffs
      const veil = bank(color);
      if (veil) {
        ctx.globalAlpha = 0.22 * Math.min(1, 0.5 + 0.5 * o.density);
        ctx.drawImage(veil, 0, -h * 0.6, w, h * 2.2);
      }

      if (o.ground) {
        const b = bank(color);
        if (b) {
          const bh = h * 0.35;
          ctx.globalAlpha = 0.55 * (0.85 + 0.15 * Math.sin(t * 0.2));
          ctx.drawImage(b, 0, h - bh, w, bh);
        }
      }

      // Part the mist: punch soft holes where the cursor is and has been
      const r = 150 * o.size;
      if (holes.length || waves.length) {
        ctx.globalCompositeOperation = 'destination-out';
        const hi = hole('');
        if (hi) {
          for (const hl of holes) {
            const k = hl.strength * hl.strength * (3 - 2 * hl.strength); // smoothstep
            ctx.globalAlpha = Math.min(1, k * 0.95);
            ctx.drawImage(hi, hl.x - r, hl.y - r, r * 2, r * 2);
          }
        }
        const ri = ring('');
        for (const wv of waves) {
          const k = wv.age / 1.8;
          const rad = 40 + k * Math.max(w, h) * 0.45;
          ctx.globalAlpha = (1 - k) * 0.9;
          if (ri) ctx.drawImage(ri, wv.x - rad, wv.y - rad, rad * 2, rad * 2);
          if (hi && k < 0.6) {
            // The centre clears first, then heals as the ring moves on
            ctx.globalAlpha = (1 - k / 0.6) * 0.8;
            ctx.drawImage(hi, wv.x - rad * 0.6, wv.y - rad * 0.6, rad * 1.2, rad * 1.2);
          }
        }
      }
    },
    burst(x, y) {
      waves.push({ x, y, age: 0 });
      if (waves.length > 5) waves.shift();
    },
    pointer(x, y, inside) {
      for (const hl of holes) hl.held = false;
      if (!inside) {
        lastX = lastY = -1e9;
        return;
      }
      // Keep a trail: a new hole every ~30 px so a sweep leaves a healing wake
      const moved = Math.hypot(x - lastX, y - lastY);
      const last = holes[holes.length - 1];
      if (last && moved < 30) {
        last.held = true;
        last.x = x;
        last.y = y;
        return;
      }
      lastX = x;
      lastY = y;
      holes.push({ x, y, strength: last ? Math.max(0.35, last.strength) : 0, held: true });
      if (holes.length > 40) holes.shift();
    },
  };
};
