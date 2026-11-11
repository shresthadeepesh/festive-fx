import type { EffectFactory } from '../types';
import { ALPHA_STEPS, TAU, alphaLevel, countFor, gust, rand, retain, sprite, spriteCache, stamp } from '../util';

interface Pellet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** 0 falling, then 1+ = bounces so far */
  bounces: number;
  variant: number;
  /** Thrown by a burst: dropped instead of recycled. */
  extra: boolean;
}

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
  life: number;
  max: number;
}

interface Lying {
  x: number;
  y: number;
  r: number;
  variant: number;
  life: number;
  max: number;
}

interface Impact {
  x: number;
  y: number;
  r: number;
  life: number;
}

const GRAVITY = 1500;
const MAX_LYING = 110;
const MAX_SHARDS = 500;

/** Translucent ice pellet: frosted edge, clearer core, bright highlight. Slightly irregular per variant. */
const pelletSprite = (tint: string, variant: number) =>
  sprite(24, 24, (ctx) => {
    ctx.translate(12, 12);
    const pts = 9;
    ctx.beginPath();
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * TAU;
      const r = 9.5 * (1 + 0.08 * Math.sin(a * (2 + variant) + variant));
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(-2, -2, 0, 0, 0, 10);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.45, 'rgba(235,246,255,0.75)');
    g.addColorStop(1, 'rgba(180,210,240,0.45)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = tint;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(-12, -12, 24, 24);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // Frosted rim
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Cloudy inner layer, as in real hailstones
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0.5, 0.5, 5, 0, TAU);
    ctx.stroke();
    // Specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.ellipse(-3.5, -4, 2.6, 1.6, -0.6, 0, TAU);
    ctx.fill();
  });

export const hail: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = rand(0, 100);
  const pellets: Pellet[] = [];
  const shards: Shard[] = [];
  const lying: Lying[] = [];
  const impacts: Impact[] = [];
  let recycled = 0;

  const tint = () => o.colors?.[0] ?? '#cfe6ff';
  const sprites = spriteCache((key: string) => {
    const [c, v] = key.split('|');
    return pelletSprite(c, Number(v));
  });
  const shardGroups: Shard[][] = Array.from({ length: ALPHA_STEPS + 1 }, () => []);
  const impactGroups: Impact[][] = Array.from({ length: ALPHA_STEPS + 1 }, () => []);

  const slant = () => (o.wind + gust(t) * 0.15) * 0.3;

  const respawn = (p: Pellet, anywhere: boolean) => {
    const sl = slant();
    const spread = Math.abs(sl) * h;
    p.r = rand(2.2, 6) * o.size;
    p.x = rand(sl > 0 ? -spread : 0, sl < 0 ? w + spread : w);
    p.y = anywhere ? rand(-h, h) : rand(-h * 0.3, -10);
    // Bigger stones fall faster
    p.vy = rand(620, 820) + p.r * 45;
    p.vx = p.vy * sl;
    p.bounces = 0;
    p.variant = (Math.random() * 3) | 0;
    p.extra = false;
  };

  const make = (anywhere: boolean): Pellet => {
    const p: Pellet = { x: 0, y: 0, vx: 0, vy: 0, r: 0, bounces: 0, variant: 0, extra: false };
    respawn(p, anywhere);
    return p;
  };

  const shatter = (x: number, y: number, r: number) => {
    const n = 4 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n && shards.length < MAX_SHARDS; i++) {
      const a = -Math.PI / 2 + rand(-1.3, 1.3);
      const v = rand(80, 260);
      const max = rand(0.35, 0.7);
      shards.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: rand(0.8, 1.8) * (r / 4), life: max, max });
    }
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      const want = countFor(w, h, 110, o.density);
      for (; recycled < want; recycled++) pellets.push(make(true));
      if (recycled > want) {
        let drop = recycled - want;
        retain(pellets, (p) => p.extra || drop-- <= 0);
        recycled = want;
      }
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;
      const sl = slant();

      retain(pellets, (p) => {
        if (p.bounces === 0) {
          // Falling at near-terminal speed, steered by the wind
          p.vx += (p.vy * sl - p.vx) * Math.min(1, 3 * s);
        } else {
          p.vy += GRAVITY * s;
          p.vx *= 1 - Math.min(1, 1.5 * s);
        }
        p.x += p.vx * s;
        p.y += p.vy * s;

        const floor = h - p.r;
        if (o.ground && p.y >= floor && p.vy > 0) {
          p.y = floor;
          if (p.bounces === 0 && impacts.length < 300) impacts.push({ x: p.x, y: h - 1, r: p.r * 2.4, life: 1 });
          if (p.bounces === 0 && p.r > 3 && Math.random() < 0.14) {
            shatter(p.x, floor, p.r);
          } else {
            const rest = p.bounces === 0 ? rand(0.32, 0.5) : rand(0.25, 0.4);
            p.vy = -p.vy * rest;
            // Sideways skip on impact
            p.vx = p.vx * 0.4 + rand(-90, 90);
            p.bounces++;
            if (p.bounces <= 3 && Math.abs(p.vy) > 50) return true;
            if (lying.length < MAX_LYING) {
              const max = rand(3, 6);
              lying.push({ x: p.x, y: h - p.r * 0.7, r: p.r, variant: p.variant, life: max, max });
            }
          }
          if (p.extra) return false;
          respawn(p, false);
          return true;
        }
        if (p.y - p.r > h || p.x < -80 - h || p.x > w + 80 + h) {
          if (p.extra) return false;
          respawn(p, false);
        }
        return true;
      });

      retain(shards, (sh) => {
        sh.vy += GRAVITY * 0.8 * s;
        sh.x += sh.vx * s;
        sh.y = Math.min(h - 1, sh.y + sh.vy * s);
        return (sh.life -= s) > 0;
      });
      retain(lying, (l) => o.ground && (l.life -= s) > 0);
      retain(impacts, (i) => (i.life -= s * 3) > 0);
    },
    draw(ctx) {
      const c = tint();
      const sl = slant();

      // Melting pellets on the ground shrink and fade
      for (const l of lying) {
        const k = l.life / l.max;
        ctx.globalAlpha = Math.min(1, k * 1.6) * 0.7;
        stamp(ctx, sprites(`${c}|${l.variant}`), l.x, l.y, l.r * 2.6 * (0.5 + 0.5 * k));
      }

      // Motion streaks behind the fastest falling stones: one path
      ctx.strokeStyle = 'rgba(225,240,255,1)';
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.1 * o.size;
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      let any = false;
      for (const p of pellets) {
        if (p.bounces || p.vy < 800) continue;
        const len = (p.vy - 700) * 0.07;
        ctx.moveTo(p.x, p.y - p.r);
        ctx.lineTo(p.x - len * sl, p.y - p.r - len);
        any = true;
      }
      if (any) ctx.stroke();

      for (const p of pellets) {
        ctx.globalAlpha = 1;
        stamp(ctx, sprites(`${c}|${p.variant}`), p.x, p.y, p.r * 2.6);
      }

      // Impact rings and ice shards, batched per alpha level
      ctx.lineWidth = 1;
      for (const i of impacts) impactGroups[alphaLevel(i.life)].push(i);
      for (const sh of shards) shardGroups[alphaLevel(sh.life / sh.max)].push(sh);
      ctx.fillStyle = '#f2f9ff';
      for (let lv = 1; lv <= ALPHA_STEPS; lv++) {
        const ig = impactGroups[lv];
        if (ig.length) {
          ctx.globalAlpha = (lv / ALPHA_STEPS) * 0.45;
          ctx.beginPath();
          for (const i of ig) {
            const rx = i.r * (1.6 - i.life);
            ctx.moveTo(i.x + rx, i.y);
            ctx.ellipse(i.x, i.y, rx, rx * 0.25, 0, 0, TAU);
          }
          ctx.stroke();
          ig.length = 0;
        }
        const sg = shardGroups[lv];
        if (sg.length) {
          ctx.globalAlpha = (lv / ALPHA_STEPS) * 0.9;
          ctx.beginPath();
          for (const sh of sg) {
            // Tiny splinters: little triangles
            ctx.moveTo(sh.x, sh.y - sh.s);
            ctx.lineTo(sh.x + sh.s, sh.y + sh.s * 0.6);
            ctx.lineTo(sh.x - sh.s, sh.y + sh.s * 0.6);
            ctx.closePath();
          }
          ctx.fill();
          sg.length = 0;
        }
      }
    },
    burst(x, y) {
      let extras = pellets.length - recycled;
      for (let i = 0; i < 26 && extras < 300; i++, extras++) {
        const a = -Math.PI / 2 + rand(-1.2, 1.2);
        const v = rand(180, 520);
        const p = make(false);
        p.x = x;
        p.y = y;
        p.vx = Math.cos(a) * v;
        p.vy = Math.sin(a) * v;
        p.bounces = 1; // already airborne under gravity
        p.extra = true;
        pellets.push(p);
      }
    },
  };
};
