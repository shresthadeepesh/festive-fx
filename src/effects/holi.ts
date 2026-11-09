import type { EffectFactory } from '../types';
import { ALPHA_STEPS, TAU, alphaLevel, drag, glowSprite, paletteOr, pick, rand, retain, sprite, spriteCache, stamp } from '../util';

/** Gulal: magenta, yellow, green, blue, orange, purple, red. */
const GULAL = ['#ff1f8e', '#ffd400', '#00c853', '#2979ff', '#ff6d00', '#aa00ff', '#ff1744'];
const MAX_CLOUDS = 700;
const MAX_GRAINS = 1500;

interface Cloud {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  life: number;
  max: number;
  color: string;
}

interface Grain {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
  color: string;
}

interface Splat {
  x: number;
  y: number;
  size: number;
  img: HTMLCanvasElement | null;
  life: number;
  max: number;
  drips: { dx: number; len: number; w: number }[];
  color: string;
}

/** Irregular blob with satellite droplets, rendered once per splat. */
const splatSprite = (color: string) =>
  sprite(128, 128, (ctx) => {
    ctx.translate(64, 64);
    ctx.fillStyle = color;
    const pts = 16;
    ctx.beginPath();
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * TAU;
      const r = 30 * rand(0.75, 1.15);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.quadraticCurveTo(Math.cos(a - 0.2) * r * 1.15, Math.sin(a - 0.2) * r * 1.15, x, y);
    }
    ctx.fill();
    const n = 7 + ((Math.random() * 6) | 0);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const d = rand(36, 58);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d, rand(1.5, 5), 0, TAU);
      ctx.fill();
    }
    // Wet sheen
    const g = ctx.createRadialGradient(-10, -12, 0, -10, -12, 26);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = g;
    ctx.fillRect(-64, -64, 128, 128);
  });

export const holi: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let throwTimer = 0.2;
  let splatTimer = rand(1.5, 3);
  const clouds: Cloud[] = [];
  const grains: Grain[] = [];
  const splats: Splat[] = [];

  // Grains grouped by color and alpha level: one path + fill per group.
  const grainGroups = new Map<string, Grain[][]>();
  const puff = spriteCache((c: string) => glowSprite(c, false, 0.4));
  const palette = () => paletteOr(o.colors, GULAL);

  /** A fistful of powder thrown from (x, y) toward `dir`. */
  const toss = (x: number, y: number, dir = -Math.PI / 2 + rand(-1, 1)) => {
    const main = pick(palette());
    const mix = Math.random() < 0.35 ? pick(palette()) : main;
    const k = o.size;
    for (let i = 0; i < 42 && clouds.length < MAX_CLOUDS; i++) {
      const a = dir + rand(-0.9, 0.9);
      const v = rand(40, 380) * k;
      const max = rand(1.8, 3.2);
      clouds.push({
        x: x + rand(-6, 6),
        y: y + rand(-6, 6),
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        r: rand(6, 18) * k,
        vr: rand(12, 30) * k,
        life: max,
        max,
        color: i % 4 === 3 ? mix : main,
      });
    }
    for (let i = 0; i < 140 && grains.length < MAX_GRAINS; i++) {
      const a = dir + rand(-1.1, 1.1);
      const v = rand(180, 620) * k;
      const max = rand(0.9, 2);
      grains.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        r: rand(0.8, 2.2) * k,
        life: max,
        max,
        color: Math.random() < 0.7 ? main : mix,
      });
    }
  };

  const splat = (x = rand(w * 0.05, w * 0.95), y = rand(h * 0.05, h * 0.85)) => {
    const color = pick(palette());
    const ndrips = 1 + ((Math.random() * 3) | 0);
    splats.push({
      x,
      y,
      size: rand(55, 110) * o.size,
      img: splatSprite(color),
      life: 0,
      max: rand(3, 4.5),
      color,
      drips: Array.from({ length: ndrips }, () => ({ dx: rand(-0.18, 0.18), len: rand(0.4, 1), w: rand(2, 4) })),
    });
    if (splats.length > 25) splats.shift();
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    update(dt) {
      const s = dt * o.speed;

      if (o.density > 0) {
        throwTimer -= s;
        if (throwTimer <= 0) {
          toss(rand(w * 0.1, w * 0.9), rand(h * 0.35, h * 0.95));
          throwTimer = rand(0.6, 1.6) / o.density;
        }
        splatTimer -= s;
        if (splatTimer <= 0) {
          splat();
          splatTimer = rand(2.5, 6) / o.density;
        }
      }

      const kc = drag(0.92, s);
      const kr = drag(0.985, s);
      retain(clouds, (c) => {
        c.vx = c.vx * kc + o.wind * 30 * s;
        c.vy = c.vy * kc + 18 * s; // powder slowly settles
        c.x += c.vx * s;
        c.y += c.vy * s;
        c.r += c.vr * s;
        c.vr *= kr;
        return (c.life -= s) > 0;
      });

      const kg = drag(0.965, s);
      retain(grains, (g) => {
        g.vx = g.vx * kg + o.wind * 40 * s;
        g.vy = g.vy * kg + 260 * s;
        g.x += g.vx * s;
        g.y += g.vy * s;
        return (g.life -= s) > 0 && g.y <= h + 10;
      });

      retain(splats, (p) => (p.life += s) < p.max);
    },
    draw(ctx) {
      for (const p of splats) {
        const k = p.life / p.max;
        // Pop in, hold, fade
        const a = Math.min(1, p.life * 8) * Math.min(1, (1 - k) / 0.4) * 0.75;
        const grow = Math.min(1, p.life * 6);
        const d = p.size * (0.7 + 0.3 * grow);
        ctx.globalAlpha = a;
        stamp(ctx, p.img, p.x, p.y, d);
        // Drips run down over the first second
        const run = Math.min(1, p.life / 1.2);
        ctx.fillStyle = p.color;
        ctx.lineCap = 'round';
        ctx.strokeStyle = p.color;
        for (const dr of p.drips) {
          const x = p.x + dr.dx * d;
          const y0 = p.y + d * 0.15;
          const y1 = y0 + d * 0.55 * dr.len * run;
          ctx.lineWidth = dr.w * o.size;
          ctx.beginPath();
          ctx.moveTo(x, y0);
          ctx.lineTo(x, y1);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y1, dr.w * o.size * 0.9, 0, TAU);
          ctx.fill();
        }
      }

      for (const c of clouds) {
        const k = c.life / c.max;
        ctx.globalAlpha = Math.pow(k, 0.8) * 0.6;
        stamp(ctx, puff(c.color), c.x, c.y, c.r * 2);
      }

      for (const g of grains) {
        let groups = grainGroups.get(g.color);
        if (!groups) {
          groups = Array.from({ length: ALPHA_STEPS + 1 }, () => []);
          grainGroups.set(g.color, groups);
        }
        groups[alphaLevel((g.life / g.max) * 1.5)].push(g);
      }
      grainGroups.forEach((groups, color) => {
        ctx.fillStyle = color;
        for (let lv = 1; lv <= ALPHA_STEPS; lv++) {
          const group = groups[lv];
          if (!group.length) continue;
          ctx.globalAlpha = lv / ALPHA_STEPS;
          ctx.beginPath();
          for (const g of group) ctx.rect(g.x - g.r / 2, g.y - g.r / 2, g.r, g.r);
          ctx.fill();
          group.length = 0;
        }
      });
    },
    burst(x, y) {
      toss(x, y, rand(0, TAU));
      if (Math.random() < 0.5) splat(x + rand(-40, 40), y + rand(-40, 40));
    },
  };
};
