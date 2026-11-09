import type { EffectFactory } from '../types';
import {
  ALPHA_STEPS,
  TAU,
  alphaLevel,
  clamp,
  drag,
  glowSprite,
  paletteOr,
  pick,
  polyline,
  rand,
  retain,
  sprite,
  spriteCache,
  stamp,
} from '../util';

/** Marigold, saffron, diya flame, rangoli pinks/greens/blues. */
const DIWALI = ['#ffd700', '#ff9933', '#ff5e1a', '#ff3d7f', '#e040fb', '#7cfc00', '#00e5ff', '#fff6d5'];
const GOLD = '#ffc54d';
const GLITTER = ['#fff3c4', '#ffe08a', '#ffffff'];

const ROCKET_G = 260;
const MAX_PARTICLES = 3200;
/** Longest spark trail, in points. Every pooled spark owns a buffer this size. */
const MAX_TRAIL = 16;

type Shell =
  | 'peony'
  | 'chrysanthemum'
  | 'ring'
  | 'doubleRing'
  | 'willow'
  | 'palm'
  | 'crossette'
  | 'strobe'
  | 'colorChange'
  | 'multiBreak';

/** Weighted: classic shells more often, showpieces now and then. */
const SHELLS: Shell[] = [
  'peony', 'peony', 'chrysanthemum', 'chrysanthemum', 'ring', 'doubleRing', 'willow',
  'palm', 'crossette', 'strobe', 'colorChange', 'colorChange', 'multiBreak',
];

interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  shell: Shell;
  trail: number[];
  seed: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  /** Switch to this color at mid-life (color-change shells, palm tips). */
  colorTo: string | null;
  drag: number;
  gravity: number;
  width: number;
  /**
   * Ring buffer of recent positions [x0, y0, x1, y1, ...]. Fixed size and
   * reused with the spark, so trails never allocate or shift.
   */
  trail: Float32Array;
  /** Points kept in the trail; 0 = draw a velocity streak instead. */
  trailLen: number;
  trailHead: number;
  trailCount: number;
  flicker: boolean;
  strobe: boolean;
  /** Glitter sparks shed per second. */
  glitter: number;
  /** Seconds until this star splits into a cross (crossette); -1 = never. */
  split: number;
  /** Glow halo size multiplier; 0 = none. */
  glow: number;
  seed: number;
  /** Alpha computed for this frame's draw (shared by the stroke and glow passes). */
  a: number;
}

type SparkInit = Partial<Omit<Spark, 'trail' | 'trailHead' | 'trailCount' | 'life' | 'seed' | 'a'>> &
  Pick<Spark, 'x' | 'y' | 'vx' | 'vy' | 'color'>;

interface StrokeGroup {
  color: string;
  alpha: number;
  width: number;
  items: Spark[];
}

interface Pending {
  x: number;
  y: number;
  delay: number;
  color: string;
}

interface Puff {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
}

interface Fountain {
  x: number;
  life: number;
  max: number;
}

interface Flash {
  x: number;
  y: number;
  life: number;
  color: string;
  size: number;
}

export const fireworks: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = 0;
  let timer = 0.3;
  let fountainTimer = rand(2, 5);
  const rockets: Rocket[] = [];
  const sparks: Spark[] = [];
  const pending: Pending[] = [];
  const smoke: Puff[] = [];
  const fountains: Fountain[] = [];
  const flashes: Flash[] = [];

  /** Dead sparks waiting for reuse (keeps their trail buffers). */
  const free: Spark[] = [];
  /** Per-frame stroke batches keyed by colour, alpha level and width. */
  const groups = new Map<number, StrokeGroup>();
  const colorIds = new Map<string, number>();

  const glow = spriteCache((c: string) => glowSprite(c));
  /** Coloured halo with a hot core baked in: one drawImage per star instead of two. */
  const star = spriteCache((c: string) =>
    sprite(32, 32, (ctx) => {
      const halo = glowSprite(c, false, 0.2);
      const core = glowSprite(c);
      ctx.globalAlpha = 0.45;
      if (halo) ctx.drawImage(halo, 0, 0, 32, 32);
      ctx.globalAlpha = 1;
      if (core) ctx.drawImage(core, 16 - 6.4, 16 - 6.4, 12.8, 12.8);
    }),
  );
  const smokeSprite = spriteCache((c: string) => glowSprite(c, false, 0.3));

  const palette = () => paletteOr(o.colors, DIWALI);
  const scale = () => o.size * clamp(h / 700, 0.7, 1.4);

  const launch = (x = rand(w * 0.1, w * 0.9), targetY = rand(h * 0.1, h * 0.42)) => {
    const rise = Math.max(60, h - targetY);
    rockets.push({
      x,
      y: h + 4,
      vx: rand(-20, 20),
      // Initial speed so gravity brings it to rest right at targetY.
      vy: -Math.sqrt(2 * ROCKET_G * rise),
      color: pick(palette()),
      shell: pick(SHELLS),
      trail: [],
      seed: rand(0, TAU),
    });
  };

  const blank = (): Spark => ({
    x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, color: '', colorTo: null, drag: 0, gravity: 0, width: 0,
    trail: new Float32Array(MAX_TRAIL * 2), trailLen: 0, trailHead: 0, trailCount: 0,
    flicker: false, strobe: false, glitter: 0, split: -1, glow: 0, seed: 0, a: 0,
  });

  const spark = (s: SparkInit): Spark | null => {
    if (sparks.length >= MAX_PARTICLES) return null;
    const p = free.pop() ?? blank();
    const max = s.max ?? rand(1.1, 1.9);
    p.x = s.x;
    p.y = s.y;
    p.vx = s.vx;
    p.vy = s.vy;
    p.color = s.color;
    p.life = max;
    p.max = max;
    p.colorTo = s.colorTo ?? null;
    p.drag = s.drag ?? 0.975;
    p.gravity = s.gravity ?? 90;
    p.width = s.width ?? 2 * o.size;
    p.trailLen = Math.min(MAX_TRAIL, s.trailLen ?? 0);
    p.trailHead = 0;
    p.trailCount = 0;
    p.flicker = s.flicker ?? false;
    p.strobe = s.strobe ?? false;
    p.glitter = s.glitter ?? 0;
    p.split = s.split ?? -1;
    p.glow = s.glow ?? 1;
    p.seed = rand(0, TAU);
    sparks.push(p);
    return p;
  };

  const groupFor = (color: string, alpha: number, width: number): StrokeGroup => {
    let id = colorIds.get(color);
    if (id === undefined) {
      id = colorIds.size;
      colorIds.set(color, id);
    }
    const wl = Math.min(63, Math.round(width * 4));
    const key = (id * (ALPHA_STEPS + 1) + alpha) * 64 + wl;
    let g = groups.get(key);
    if (!g) {
      g = { color, alpha: alpha / ALPHA_STEPS, width: wl / 4, items: [] };
      groups.set(key, g);
    }
    return g;
  };

  /** Uniformly filled sphere (sqrt keeps it from looking hollow). */
  const sphere = (x: number, y: number, n: number, power: number, props: (i: number) => Omit<SparkInit, 'x' | 'y' | 'vx' | 'vy'>) => {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const v = Math.sqrt(Math.random()) * power;
      spark({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ...props(i) });
    }
  };

  const ring = (x: number, y: number, n: number, power: number, color: string) => {
    const tilt = rand(0.3, 1); // a squashed ring reads as 3D
    const rot = rand(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const cx = Math.cos(a) * power;
      const cy = Math.sin(a) * power * tilt;
      spark({
        x,
        y,
        vx: cx * Math.cos(rot) - cy * Math.sin(rot),
        vy: cx * Math.sin(rot) + cy * Math.cos(rot),
        color,
        trailLen: 3,
      });
    }
  };

  const explode = (x: number, y: number, color: string, shell: Shell, size = 1) => {
    const k = scale() * size;
    const power = rand(150, 240) * k;
    const second = pick(palette());
    flashes.push({ x, y, life: 1, color, size: 90 * k });
    for (let i = 0; i < 4 * size; i++) {
      smoke.push({ x: x + rand(-25, 25) * k, y: y + rand(-25, 25) * k, r: rand(25, 45) * k, life: 0, max: rand(2.5, 4) });
    }

    switch (shell) {
      case 'chrysanthemum':
        sphere(x, y, 120 * size, power, () => ({ color, trailLen: 7, glitter: 22, glow: 0.8 }));
        break;
      case 'ring':
        ring(x, y, 60, power, color);
        // Small pistil in the centre
        sphere(x, y, 24, power * 0.3, () => ({ color: '#fff6d5', width: 1.4 * o.size, max: rand(0.6, 1) }));
        break;
      case 'doubleRing':
        ring(x, y, 54, power, color);
        ring(x, y, 40, power * 0.6, second);
        break;
      case 'willow':
        sphere(x, y, 90 * size, power * 0.8, () => ({
          color: GOLD,
          trailLen: 16,
          max: rand(2.4, 3.4),
          drag: 0.955,
          gravity: 120,
          width: 1.5 * o.size,
          glitter: 6,
          glow: 0.6,
        }));
        break;
      case 'palm': {
        const arms = 7 + ((Math.random() * 3) | 0);
        for (let i = 0; i < arms; i++) {
          const a = (i / arms) * TAU + rand(-0.1, 0.1);
          for (let j = 0; j < 4; j++) {
            const v = power * (j === 0 ? rand(0.9, 1) : rand(0.55, 0.9));
            spark({
              x,
              y,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              color: GOLD,
              colorTo: color,
              trailLen: j === 0 ? 14 : 8,
              width: (j === 0 ? 3.2 : 1.8) * o.size,
              glitter: j === 0 ? 40 : 0,
              max: rand(1.6, 2.2),
              drag: 0.965,
            });
          }
        }
        break;
      }
      case 'crossette':
        sphere(x, y, 16, power * 0.9, () => ({ color, trailLen: 5, split: rand(0.4, 0.6), width: 2.6 * o.size }));
        break;
      case 'strobe':
        sphere(x, y, 70 * size, power * 0.85, () => ({
          color: '#ffffff',
          strobe: true,
          max: rand(2, 2.8),
          drag: 0.96,
          width: 2.2 * o.size,
          glow: 1.2,
        }));
        break;
      case 'colorChange':
        sphere(x, y, 110 * size, power, (i) => ({ color: i % 3 ? color : second, colorTo: i % 3 ? second : color, trailLen: 4 }));
        break;
      case 'multiBreak': {
        sphere(x, y, 50, power * 0.6, () => ({ color: GOLD, trailLen: 4, glitter: 10 }));
        const n = 4 + ((Math.random() * 3) | 0);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + rand(-0.3, 0.3);
          const d = power * rand(0.35, 0.5);
          pending.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, delay: rand(0.25, 0.5), color: pick(palette()) });
        }
        break;
      }
      default:
        sphere(x, y, 110 * size, power, (i) => ({ color: size < 1 || i % 7 ? color : '#fff6d5', trailLen: 5 }));
    }
  };

  const splitCross = (p: Spark) => {
    const base = rand(0, TAU);
    for (let i = 0; i < 4; i++) {
      const a = base + (i * Math.PI) / 2;
      const v = rand(70, 100) * o.size;
      spark({
        x: p.x,
        y: p.y,
        vx: p.vx * 0.4 + Math.cos(a) * v,
        vy: p.vy * 0.4 + Math.sin(a) * v,
        color: p.color,
        trailLen: 4,
        max: rand(0.6, 0.9),
        width: 1.6 * o.size,
      });
    }
  };

  const glitter = (p: Spark) =>
    spark({
      x: p.x,
      y: p.y,
      vx: p.vx * 0.1 + rand(-12, 12),
      vy: p.vy * 0.1 + rand(-5, 20),
      color: pick(GLITTER),
      max: rand(0.3, 0.6),
      gravity: 140,
      width: 1 * o.size,
      flicker: true,
      glow: 0.5,
    });

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;

      if (o.density > 0) {
        timer -= s;
        if (timer <= 0) {
          const salvo = Math.random() < 0.12 ? 3 : Math.random() < 0.3 ? 2 : 1;
          for (let i = 0; i < salvo; i++) launch();
          timer = rand(0.7, 1.7) / o.density;
        }
        if (o.ground) {
          fountainTimer -= s;
          if (fountainTimer <= 0) {
            fountains.push({ x: rand(w * 0.08, w * 0.92), life: 0, max: rand(3, 4.5) });
            fountainTimer = rand(5, 12) / o.density;
          }
        }
      }

      retain(rockets, (r) => {
        r.vy += ROCKET_G * s;
        r.vx += (o.wind * 40 + Math.sin(t * 18 + r.seed) * 35) * s; // slight wobble
        r.x += r.vx * s;
        r.y += r.vy * s;
        r.trail.push(r.x, r.y);
        if (r.trail.length > 24) r.trail.splice(0, 2);
        if (Math.random() < 0.9) {
          spark({
            x: r.x + rand(-1, 1),
            y: r.y + 2,
            vx: rand(-18, 18),
            vy: rand(10, 60),
            color: pick(GLITTER),
            max: rand(0.25, 0.55),
            gravity: 60,
            width: 1.1 * o.size,
            flicker: Math.random() < 0.4,
            glow: 0.5,
          });
        }
        if (r.vy < -12) return true;
        explode(r.x, r.y, r.color, r.shell);
        return false;
      });

      retain(pending, (p) => {
        if ((p.delay -= s) > 0) return true;
        explode(p.x, p.y, p.color, 'peony', 0.4);
        return false;
      });

      retain(fountains, (f) => {
        if ((f.life += s) >= f.max) return false;
        const env = Math.sin((Math.PI * f.life) / f.max);
        const n = Math.round(240 * s * env + Math.random());
        const reach = clamp(h / 700, 0.55, 1.3) * o.size;
        for (let j = 0; j < n; j++) {
          const a = -Math.PI / 2 + rand(-0.3, 0.3);
          const v = rand(250, 520) * reach * Math.sqrt(env);
          spark({
            x: f.x + rand(-2, 2),
            y: h - 8,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            color: Math.random() < 0.12 ? pick(palette()) : pick(GLITTER),
            max: rand(0.7, 1.3),
            gravity: 430,
            drag: 0.985,
            width: 1.4 * o.size,
            flicker: Math.random() < 0.3,
            glow: 0.6,
          });
        }
        return true;
      });

      retain(sparks, (p) => {
        const k = drag(p.drag, s);
        p.vx = p.vx * k + o.wind * 20 * s;
        p.vy = p.vy * k + p.gravity * s;
        p.x += p.vx * s;
        p.y += p.vy * s;
        p.life -= s;
        if (p.trailLen) {
          p.trail[p.trailHead * 2] = p.x;
          p.trail[p.trailHead * 2 + 1] = p.y;
          p.trailHead = (p.trailHead + 1) % p.trailLen;
          if (p.trailCount < p.trailLen) p.trailCount++;
        }
        if (p.colorTo && p.life < p.max * 0.55) {
          p.color = p.colorTo;
          p.colorTo = null;
        }
        if (p.glitter && Math.random() < p.glitter * s) glitter(p);
        if (p.split >= 0) {
          p.split -= s;
          if (p.split < 0) {
            splitCross(p);
            p.life = 0;
          }
        }
        if (p.life > 0) return true;
        free.push(p);
        return false;
      });

      retain(smoke, (p) => {
        p.r += 12 * s;
        p.y -= 4 * s;
        p.x += o.wind * 25 * s;
        return (p.life += s) < p.max;
      });

      retain(flashes, (f) => (f.life -= s * 4) > 0);
    },
    draw(ctx) {
      // Lingering smoke, lit faintly by the sky
      const puff = smokeSprite('#b8bcc8');
      for (const p of smoke) {
        const k = p.life / p.max;
        ctx.globalAlpha = 0.07 * Math.sin(Math.PI * k);
        stamp(ctx, puff, p.x, p.y, p.r * 2);
      }

      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const f of flashes) {
        // Whole-sky illumination plus a hot core at the burst
        ctx.globalAlpha = f.life * 0.06;
        ctx.fillStyle = f.color;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = f.life * 0.7;
        stamp(ctx, glow(f.color), f.x, f.y, f.size * (1.4 - f.life * 0.4));
      }

      for (const f of fountains) {
        const env = Math.sin((Math.PI * f.life) / f.max);
        ctx.globalAlpha = 0.55 * env;
        stamp(ctx, glow(GOLD), f.x, h - 6, 90 * o.size * env);
      }

      for (const r of rockets) {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 1.5 * o.size;
        if (r.trail.length >= 4) polyline(ctx, r.trail);
        ctx.globalAlpha = 1;
        stamp(ctx, glow(GOLD), r.x, r.y, 14 * o.size);
      }

      // Pass 1: bucket strokes by (colour, alpha level, width) so thousands of
      // sparks become a few dozen stroke() calls. Additive blending makes the
      // order of strokes vs glows irrelevant, so they can be split into passes.
      for (const p of sparks) {
        const life = p.life / p.max;
        let a = life < 0.3 ? life / 0.3 : 1; // fade only in the last 30%
        if (p.flicker) a *= Math.random() < 0.5 ? 0.15 : 1;
        if (p.strobe) a *= Math.sin((p.max - p.life) * 28 + p.seed) > 0.2 ? 1 : 0.04;
        p.a = a;
        if (a < 0.02) continue;
        const trail = p.trailCount >= 2;
        const lv = alphaLevel(trail ? a * 0.6 : a);
        if (lv > 0) groupFor(p.color, lv, trail ? p.width * 0.7 : p.width).items.push(p);
      }

      groups.forEach((g) => {
        if (!g.items.length) return;
        ctx.strokeStyle = g.color;
        ctx.globalAlpha = g.alpha;
        ctx.lineWidth = g.width;
        ctx.beginPath();
        for (const p of g.items) {
          if (p.trailCount >= 2) {
            // Walk the ring buffer oldest to newest
            const n = p.trailLen;
            let idx = (p.trailHead - p.trailCount + n) % n;
            ctx.moveTo(p.trail[idx * 2], p.trail[idx * 2 + 1]);
            for (let i = 1; i < p.trailCount; i++) {
              idx = (idx + 1) % n;
              ctx.lineTo(p.trail[idx * 2], p.trail[idx * 2 + 1]);
            }
          } else {
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          }
        }
        ctx.stroke();
        g.items.length = 0;
      });

      // Pass 2: glows
      for (const p of sparks) {
        if (!p.glow || p.a < 0.02) continue;
        ctx.globalAlpha = p.a;
        stamp(ctx, star(p.color), p.x, p.y, p.width * 4.5 * p.glow);
      }
    },
    burst(x, y) {
      launch(x, y);
    },
  };
};
