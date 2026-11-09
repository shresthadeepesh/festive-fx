import type { EffectFactory } from '../types';
import { ALPHA_STEPS, TAU, alphaLevel, countFor, fillPool, gust, polyline, rand, retain } from '../util';

interface Drop {
  x: number;
  y: number;
  len: number;
  vy: number;
  ground: number;
  bright: boolean;
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

interface Ripple {
  x: number;
  y: number;
  max: number;
  life: number;
}

interface Bolt {
  /** Main channel and branches as flat [x0,y0,x1,y1,...] polylines; index 0 is the trunk. */
  paths: number[][];
  age: number;
}

/** Far layer: short, faint, slow. Near layer: long, bright, splashes. */
const LAYERS = [
  { share: 0.55, len: [6, 11], width: 0.7, alpha: 0.16, fall: 0.75 },
  { share: 0.45, len: [16, 28], width: 1.3, alpha: 0.42, fall: 1.15 },
] as const;

const GRAVITY = 980;
const MAX_SPLASH = 900;

/** Lightning brightness over time: strike, dip, restrike, fade. */
const flashCurve = (t: number): number => {
  if (t < 0.07) return 1;
  if (t < 0.13) return 0.25;
  if (t < 0.21) return 0.85;
  return Math.max(0, 0.85 * Math.exp(-(t - 0.21) * 7));
};

export const makeRain =
  (storm: boolean): EffectFactory =>
  (o) => {
    let w = 0;
    let h = 0;
    let t = rand(0, 100);
    const layers: Drop[][] = [[], []];
    const droplets: Droplet[] = [];
    const ripples: Ripple[] = [];
    const bolts: Bolt[] = [];
    let nextStrike = rand(1.5, 4);

    // Horizontal velocity per unit of vertical velocity.
    const slant = () => (o.wind + (storm ? 0.35 + gust(t) * 0.3 : gust(t) * 0.1)) * 0.35;

    const make = (layer: number, anywhere: boolean): Drop => {
      const L = LAYERS[layer];
      const spread = Math.abs(slant()) * h * 1.2;
      const sl = slant();
      return {
        x: rand(sl > 0 ? -spread : 0, sl < 0 ? w + spread : w),
        y: anywhere ? rand(-h, h) : rand(-h * 0.25, -20),
        len: rand(L.len[0], L.len[1]) * o.size * (storm ? 1.25 : 1),
        vy: rand(700, 980) * L.fall,
        // Far drops "land" somewhere in the distance, near ones on the bottom edge.
        ground: layer === 0 ? rand(h * 0.6, h) : h - rand(0, Math.min(36, h * 0.07)),
        bright: Math.random() < 0.3,
      };
    };

    const splash = (x: number, y: number, power = 1) => {
      if (droplets.length < MAX_SPLASH) {
        const n = 3 + ((Math.random() * 4) | 0);
        for (let i = 0; i < n; i++) {
          // Crown: droplets thrown up and out in a fan
          const a = -Math.PI / 2 + rand(-1.1, 1.1);
          const v = rand(90, 230) * power * Math.sqrt(o.size);
          const max = rand(0.25, 0.5);
          droplets.push({
            x,
            y,
            vx: Math.cos(a) * v + slant() * 120,
            vy: Math.sin(a) * v,
            life: max,
            max,
            r: rand(0.7, 1.5) * o.size,
          });
        }
      }
      if (ripples.length < MAX_SPLASH / 2) ripples.push({ x, y, max: rand(6, 14) * o.size * power, life: 1 });
    };

    const strike = (x = rand(w * 0.1, w * 0.9)) => {
      const trunk: number[] = [x, -10];
      const paths: number[][] = [trunk];
      const end = rand(h * 0.55, h * 0.95);
      let cx = x;
      let cy = -10;
      while (cy < end) {
        cx += rand(-28, 28);
        cy += rand(14, 34);
        trunk.push(cx, cy);
        if (Math.random() < 0.22 && paths.length < 7) {
          const branch = [cx, cy];
          let bx = cx;
          let by = cy;
          const dir = Math.random() < 0.5 ? -1 : 1;
          const segs = 3 + ((Math.random() * 6) | 0);
          for (let i = 0; i < segs; i++) {
            bx += dir * rand(6, 26);
            by += rand(8, 24);
            branch.push(bx, by);
          }
          paths.push(branch);
        }
      }
      bolts.push({ paths, age: 0 });
    };

    // Reused per-frame buckets: one path per alpha level instead of one per particle.
    const rippleGroups: Ripple[][] = Array.from({ length: ALPHA_STEPS + 1 }, () => []);
    const dropletGroups: Droplet[][] = Array.from({ length: ALPHA_STEPS + 1 }, () => []);

    return {
      resize(nw, nh) {
        w = nw;
        h = nh;
        const total = countFor(w, h, 240, o.density * (storm ? 1.7 : 1));
        LAYERS.forEach((L, i) => {
          for (const d of layers[i]) d.ground = make(i, false).ground;
          fillPool(layers[i], Math.round(total * L.share), () => make(i, true));
        });
      },
      update(dt) {
        const s = dt * o.speed;
        t += s;
        const sl = slant();

        for (let li = 0; li < 2; li++) {
          for (const d of layers[li]) {
            d.y += d.vy * s;
            d.x += d.vy * sl * s;
            if (d.y >= d.ground) {
              if (li === 1 && Math.random() < 0.85) splash(d.x, d.ground);
              Object.assign(d, make(li, false));
            }
          }
        }

        retain(droplets, (p) => {
          p.vy += GRAVITY * s;
          p.x += p.vx * s;
          p.y += p.vy * s;
          return (p.life -= s) > 0;
        });
        retain(ripples, (r) => (r.life -= s * 1.8) > 0);

        if (storm) {
          if (o.density > 0) {
            nextStrike -= s;
            if (nextStrike <= 0) {
              strike();
              nextStrike = rand(3, 9) / Math.max(0.3, o.density);
            }
          }
          retain(bolts, (b) => (b.age += s) <= 0.9);
        }
      },
      draw(ctx) {
        const color = o.colors?.[0] ?? 'rgb(174, 194, 224)';
        const sl = slant();

        // Sky flash first so rain draws on top of it
        let flash = 0;
        for (const b of bolts) flash = Math.max(flash, flashCurve(b.age));
        if (flash > 0) {
          ctx.globalAlpha = flash * 0.2;
          ctx.fillStyle = 'rgb(205, 215, 255)';
          ctx.fillRect(0, 0, w, h);
        }

        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        // Batched strokes: one path per layer x brightness x (tail|head).
        for (let li = 0; li < 2; li++) {
          const L = LAYERS[li];
          if (!layers[li].length) continue;
          for (const bright of [false, true]) {
            const a = L.alpha * (bright ? 1.35 : 1) * (1 + flash * 0.8);
            // Tail: full streak, faint
            ctx.globalAlpha = Math.min(1, a * 0.45);
            ctx.lineWidth = L.width * o.size;
            ctx.beginPath();
            for (const d of layers[li]) {
              if (d.bright !== bright) continue;
              ctx.moveTo(d.x, d.y);
              ctx.lineTo(d.x - d.len * sl, d.y - d.len);
            }
            ctx.stroke();
            // Head: leading third, brighter and a touch thicker
            ctx.globalAlpha = Math.min(1, a);
            ctx.lineWidth = (L.width + 0.35) * o.size;
            ctx.beginPath();
            for (const d of layers[li]) {
              if (d.bright !== bright) continue;
              ctx.moveTo(d.x, d.y);
              ctx.lineTo(d.x - d.len * 0.35 * sl, d.y - d.len * 0.35);
            }
            ctx.stroke();
          }
        }

        // Ripples: outer ring plus a delayed inner ring
        ctx.lineWidth = 1;
        for (const r of ripples) rippleGroups[alphaLevel(r.life)].push(r);
        for (let lv = 1; lv <= ALPHA_STEPS; lv++) {
          const group = rippleGroups[lv];
          if (!group.length) continue;
          const a = lv / ALPHA_STEPS;
          ctx.globalAlpha = a * 0.45;
          ctx.beginPath();
          for (const r of group) {
            const rx = r.max * (1 - r.life);
            ctx.moveTo(r.x + rx, r.y);
            ctx.ellipse(r.x, r.y, rx, rx * 0.28, 0, 0, TAU);
          }
          ctx.stroke();
          ctx.globalAlpha = a * 0.3;
          ctx.beginPath();
          for (const r of group) {
            const k = 1 - r.life;
            if (k <= 0.35) continue;
            const rx = r.max * ((k - 0.35) / 0.65) * 0.6;
            ctx.moveTo(r.x + rx, r.y);
            ctx.ellipse(r.x, r.y, rx, rx * 0.28, 0, 0, TAU);
          }
          ctx.stroke();
          group.length = 0;
        }

        ctx.fillStyle = color;
        for (const p of droplets) dropletGroups[alphaLevel(p.life / p.max)].push(p);
        for (let lv = 1; lv <= ALPHA_STEPS; lv++) {
          const group = dropletGroups[lv];
          if (!group.length) continue;
          ctx.globalAlpha = (lv / ALPHA_STEPS) * 0.85;
          ctx.beginPath();
          for (const p of group) {
            ctx.moveTo(p.x + p.r, p.y);
            ctx.arc(p.x, p.y, p.r, 0, TAU);
          }
          ctx.fill();
          group.length = 0;
        }

        if (o.ground && o.density > 0) {
          // Low mist where the rain hits
          const mh = Math.min(70, h * 0.15);
          const g = ctx.createLinearGradient(0, h - mh, 0, h);
          g.addColorStop(0, 'rgba(200,210,230,0)');
          g.addColorStop(1, `rgba(200,210,230,${storm ? 0.16 : 0.1})`);
          ctx.globalAlpha = 1;
          ctx.fillStyle = g;
          ctx.fillRect(0, h - mh, w, mh);
        }

        if (bolts.length) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineJoin = 'round';
          for (const b of bolts) {
            const a = flashCurve(b.age);
            if (a <= 0.01) continue;
            b.paths.forEach((p, i) => {
              const k = i === 0 ? 1 : 0.5;
              ctx.globalAlpha = a * 0.25;
              ctx.strokeStyle = '#8fa8ff';
              ctx.lineWidth = 9 * k;
              polyline(ctx, p);
              ctx.globalAlpha = a * 0.6;
              ctx.strokeStyle = '#cfdcff';
              ctx.lineWidth = 3.2 * k;
              polyline(ctx, p);
              ctx.globalAlpha = a;
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1.4 * k;
              polyline(ctx, p);
            });
          }
        }
      },
      burst(x, y) {
        if (storm) strike(x);
        else for (let i = 0; i < 6; i++) splash(x + rand(-18, 18), y + rand(-4, 4), 1.4);
      },
    };
  };

export const rain = makeRain(false);
export const storm = makeRain(true);
