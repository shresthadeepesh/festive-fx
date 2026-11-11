import type { EffectFactory } from '../types';
import {
  ALPHA_STEPS,
  TAU,
  alphaLevel,
  baseTransform,
  countFor,
  drag,
  place,
  rand,
  resetTransform,
  retain,
  sprite,
  spriteCache,
} from '../util';

/** Sprite geometry: 128px box, bubble radius 58 (room for the soft edge). */
const S = 128;
const R = 58;
const VARIANTS = 6;

interface Bubble {
  x: number;
  y: number;
  r: number;
  z: number;
  vx: number;
  vy: number;
  rise: number;
  phase: number;
  wob: number;
  rot: number;
  spin: number;
  variant: number;
  age: number;
  popAt: number;
}

interface Droplet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  age: number;
}

/**
 * Soap film: barely-there body, an iridescent rim whose hues sweep around the
 * circle, inner thin-film swirls. Rotated per bubble so the colours drift.
 */
const filmSprite = (variant: number, colors: string[] | null) =>
  sprite(S, S, (ctx) => {
    const c = S / 2;
    const hue0 = (variant * 360) / VARIANTS;
    const colorAt = (f: number, l = 65) => {
      const u = ((f % 1) + 1) % 1;
      return colors ? colors[Math.floor(u * colors.length) % colors.length] : `hsl(${(hue0 + u * 360) % 360},95%,${l}%)`;
    };

    // Volume: transparent centre, slightly milky toward the edge
    const body = ctx.createRadialGradient(c, c, 0, c, c, R);
    body.addColorStop(0, 'rgba(255,255,255,0.015)');
    body.addColorStop(0.82, 'rgba(255,255,255,0.05)');
    body.addColorStop(1, 'rgba(255,255,255,0.14)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(c, c, R, 0, TAU);
    ctx.fill();

    // Iridescent rim: many short arcs, each its own hue
    const segs = 90;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * TAU;
      const a1 = a0 + TAU / segs + 0.02;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = colorAt(i / segs);
      ctx.beginPath();
      ctx.arc(c, c, R - 1.5, a0, a1);
      ctx.stroke();
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = colorAt(i / segs + 0.37, 72);
      ctx.beginPath();
      ctx.arc(c, c, R - 6, a0, a1);
      ctx.stroke();
    }

    // Thin-film swirls: curved colour bands drifting inside the rim
    for (let k = 0; k < 4; k++) {
      const start = k * 1.7 + variant;
      const rad = R * (0.62 + 0.08 * k);
      ctx.globalAlpha = 0.12;
      ctx.lineWidth = 5 - k;
      ctx.lineCap = 'round';
      ctx.strokeStyle = colorAt(k * 0.23 + 0.1, 70);
      ctx.beginPath();
      ctx.arc(c + Math.cos(start) * 4, c + Math.sin(start) * 4, rad, start, start + 1.2 + k * 0.3);
      ctx.stroke();
    }

    // Crisp outer edge
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(c, c, R + 0.5, 0, TAU);
    ctx.stroke();
  });

/** Reflections stay put (light comes from the top-left), so they're a separate, unrotated sprite. */
const glintSprite = () =>
  sprite(S, S, (ctx) => {
    const c = S / 2;
    // Window-shaped specular highlight bent around the sphere
    const a0 = Math.PI * 1.08;
    const a1 = Math.PI * 1.42;
    ctx.beginPath();
    ctx.arc(c, c, R * 0.84, a0, a1);
    ctx.arc(c, c, R * 0.6, a1 - 0.04, a0 + 0.06, true);
    ctx.closePath();
    const g = ctx.createLinearGradient(c - R * 0.8, c - R * 0.8, c - R * 0.2, c - R * 0.2);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0.15)');
    ctx.fillStyle = g;
    ctx.fill();
    // Window mullion: a thin gap makes it read as a reflected window
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(1.25 * Math.PI) * R * 0.58, c + Math.sin(1.25 * Math.PI) * R * 0.58);
    ctx.lineTo(c + Math.cos(1.25 * Math.PI) * R * 0.86, c + Math.sin(1.25 * Math.PI) * R * 0.86);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    // Small bright sparkle and a soft secondary reflection opposite
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(c - R * 0.38, c - R * 0.52, 2.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(c + R * 0.5, c + R * 0.5, 7, 3, -Math.PI / 4, 0, TAU);
    ctx.fill();
  });

export const bubbles: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let target = 0;
  const pool: Bubble[] = [];
  const droplets: Droplet[] = [];
  const rings: Ring[] = [];
  const ringGroups: Ring[][] = Array.from({ length: ALPHA_STEPS + 1 }, () => []);
  const dropGroups: Droplet[][] = Array.from({ length: ALPHA_STEPS + 1 }, () => []);

  const films = spriteCache((key: string) => {
    const [v, cs] = key.split('#');
    return filmSprite(Number(v), cs ? cs.split('|') : null);
  });
  const glint = spriteCache(() => glintSprite());

  const make = (anywhere: boolean, x = rand(0, w), y?: number): Bubble => {
    const z = rand(0.55, 1.2);
    const r = rand(12, 34) * z * o.size;
    const popAt = rand(7, 22);
    return {
      x,
      y: y ?? (anywhere ? rand(0, h) : h + r + rand(0, 80)),
      r,
      z,
      vx: 0,
      vy: 0,
      rise: rand(16, 34) * (0.6 + 0.4 * z),
      phase: rand(0, TAU),
      wob: rand(1.5, 3),
      rot: rand(0, TAU),
      spin: rand(-0.25, 0.25),
      variant: (Math.random() * VARIANTS) | 0,
      age: anywhere ? rand(0, popAt * 0.8) : 0,
      popAt,
    };
  };

  const pop = (b: Bubble) => {
    const n = 8 + ((Math.random() * 6) | 0);
    for (let i = 0; i < n && droplets.length < 600; i++) {
      const a = rand(0, TAU);
      const v = rand(50, 140) * Math.sqrt(b.r / 20);
      const max = rand(0.3, 0.55);
      droplets.push({
        x: b.x + Math.cos(a) * b.r,
        y: b.y + Math.sin(a) * b.r,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: max,
        max,
        r: rand(0.7, 1.6) * o.size,
      });
    }
    if (rings.length < 120) rings.push({ x: b.x, y: b.y, r: b.r, age: 0 });
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      target = countFor(w, h, 26, o.density);
      while (pool.length < target) pool.push(make(true));
      if (pool.length > target) pool.length = target;
    },
    update(dt) {
      const s = dt * o.speed;
      const k = drag(0.96, s);
      let alive = pool.length;
      retain(pool, (b) => {
        b.age += s;
        b.phase += b.wob * s;
        b.rot += b.spin * s;
        b.vx *= k;
        b.vy *= k;
        b.x += (b.vx + Math.sin(b.phase * 0.5) * 12 * b.z + o.wind * 40 * b.z) * s;
        b.y += (b.vy - b.rise) * s;
        const gone = b.y + b.r < -20 || b.x < -b.r * 4 || b.x > w + b.r * 4;
        if (!gone && b.age < b.popAt) return true;
        if (!gone) pop(b);
        // Burst extras retire instead of respawning
        if (alive > target) {
          alive--;
          return false;
        }
        Object.assign(b, make(false));
        return true;
      });
      retain(droplets, (d) => {
        d.vy += 320 * s;
        d.x += d.vx * s;
        d.y += d.vy * s;
        return (d.life -= s) > 0;
      });
      retain(rings, (r) => (r.age += s) < 0.35);
    },
    draw(ctx) {
      if (!pool.length && !droplets.length && !rings.length) return;
      const m = baseTransform(ctx);
      const cs = o.colors && o.colors.length ? o.colors.join('|') : '';
      const g = glint('');
      for (const b of pool) {
        const d = (b.r * 2 * S) / (2 * R);
        // Wobble: a gentle squash that trades width for height
        const sq = 1 + 0.045 * Math.sin(b.phase * 2);
        const a = 0.6 + 0.4 * Math.min(1, b.z);
        // Fade in as it rises into view, out just before popping
        const life = Math.min(1, b.age * 2) * Math.min(1, (b.popAt - b.age) * 4 + 0.2);
        ctx.globalAlpha = a * life;
        const film = films(`${b.variant}#${cs}`);
        place(ctx, m, b.x, b.y, b.rot, sq, 1 / sq);
        if (film) ctx.drawImage(film, -d / 2, -d / 2, d, d);
        place(ctx, m, b.x, b.y, 0, sq, 1 / sq);
        if (g) ctx.drawImage(g, -d / 2, -d / 2, d, d);
      }
      resetTransform(ctx, m);

      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 1;
      for (const r of rings) ringGroups[alphaLevel(1 - r.age / 0.35)].push(r);
      for (const d of droplets) dropGroups[alphaLevel(d.life / d.max)].push(d);
      for (let lv = 1; lv <= ALPHA_STEPS; lv++) {
        const rg = ringGroups[lv];
        if (rg.length) {
          ctx.globalAlpha = (lv / ALPHA_STEPS) * 0.6;
          ctx.beginPath();
          for (const r of rg) {
            const rad = r.r * (1 + (r.age / 0.35) * 0.45);
            ctx.moveTo(r.x + rad, r.y);
            ctx.arc(r.x, r.y, rad, 0, TAU);
          }
          ctx.stroke();
          rg.length = 0;
        }
        const dg = dropGroups[lv];
        if (dg.length) {
          ctx.globalAlpha = (lv / ALPHA_STEPS) * 0.8;
          ctx.beginPath();
          for (const d of dg) {
            ctx.moveTo(d.x + d.r, d.y);
            ctx.arc(d.x, d.y, d.r, 0, TAU);
          }
          ctx.fill();
          dg.length = 0;
        }
      }
    },
    burst(x, y) {
      const reach = 170 * o.size;
      for (const b of pool) {
        if (Math.hypot(b.x - x, b.y - y) < reach + b.r) b.age = b.popAt; // pops on the next update
      }
      // Blow a few fresh ones from the point
      for (let i = 0; i < 5 && pool.length < target + 30; i++) {
        const b = make(false, x, y);
        b.r *= 0.7;
        b.vx = rand(-140, 140);
        b.vy = rand(-90, -20);
        b.age = 0.3;
        pool.push(b);
      }
    },
  };
};
