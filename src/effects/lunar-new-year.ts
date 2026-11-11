import type { EffectFactory } from '../types';
import {
  ALPHA_STEPS,
  TAU,
  alphaLevel,
  baseTransform,
  clamp,
  drag,
  glowSprite,
  paletteOr,
  pick,
  place,
  rand,
  resetTransform,
  retain,
  shade,
  sprite,
  spriteCache,
  stamp,
} from '../util';

/** Lantern silk: lucky reds. */
const REDS = ['#d7191f', '#e3262b', '#c8141a'];
const GOLD = '#f2c14e';
const GOLD_DARK = '#a8761c';
const PAPER = ['#d7191f', '#b3121a', '#e8352f', '#f2c14e'];

interface Lantern {
  ax: number;
  lenFrac: number;
  len: number;
  amp: number;
  omega: number;
  phase: number;
  z: number;
  color: string;
  seed: number;
  x: number;
  y: number;
  angle: number;
}

type Phase = 'idle' | 'popping' | 'regrow';

interface CrackerString {
  /** Fraction of the width the string hangs at. */
  fx: number;
  phase: Phase;
  timer: number;
  /** Crackers still attached, counted from the top. */
  left: number;
  /** Fractional pop progress while popping. */
  popAcc: number;
  seed: number;
}

interface Fragment {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  tilt: number;
  vtilt: number;
  w: number;
  h: number;
  color: string;
  life: number;
  max: number;
}

interface Flash {
  x: number;
  y: number;
  life: number;
  size: number;
}

interface Puff {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
}

interface Twinkle {
  x: number;
  y: number;
  life: number;
  max: number;
  size: number;
}

/**
 * Round paper lantern, 60x100 sprite hanging from (30, 0): gold caps, silk
 * body ribbed like a globe and lit from inside, and a red tassel with a knot.
 */
const lanternSprite = (silk: string) =>
  sprite(60, 100, (ctx) => {
    ctx.translate(30, 0);
    const gold = (x0: number, x1: number) => {
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, GOLD_DARK);
      g.addColorStop(0.4, '#ffe08a');
      g.addColorStop(1, GOLD_DARK);
      return g;
    };
    // Cord and top cap
    ctx.strokeStyle = '#7a1010';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 8);
    ctx.stroke();
    ctx.fillStyle = gold(-11, 11);
    ctx.fillRect(-11, 8, 22, 6);
    ctx.fillRect(-13, 13, 26, 2);

    // Silk body glowing from the candle inside
    const cy = 36;
    const rx = 27;
    const ry = 22;
    const g = ctx.createRadialGradient(0, cy + 4, 2, 0, cy, rx);
    g.addColorStop(0, '#ffe7a0');
    g.addColorStop(0.35, '#ff6a3a');
    g.addColorStop(0.75, silk);
    g.addColorStop(1, shade(silk, 0.5));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, cy, rx, ry, 0, 0, TAU);
    ctx.fill();

    // Bamboo ribs follow the globe's meridians
    ctx.strokeStyle = 'rgba(90,0,0,0.45)';
    ctx.lineWidth = 1;
    for (const f of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.ellipse(0, cy, rx * f, ry, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, cy - ry);
    ctx.lineTo(0, cy + ry);
    ctx.stroke();
    // Light catching the ribs
    ctx.strokeStyle = 'rgba(255,210,150,0.25)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(-1, cy, rx * 0.5, ry, 0, Math.PI * 0.6, Math.PI * 1.4);
    ctx.stroke();
    // Soft sheen
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(-11, cy - 9, 7, 9, -0.3, 0, TAU);
    ctx.fill();

    // Bottom cap
    ctx.fillStyle = gold(-10, 10);
    ctx.fillRect(-12, cy + ry - 2, 24, 2);
    ctx.fillRect(-10, cy + ry, 20, 5);

    // Tassel: gold knot, red fringe, gold binding
    const ty = cy + ry + 5;
    ctx.strokeStyle = '#7a1010';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.lineTo(0, ty + 5);
    ctx.stroke();
    ctx.fillStyle = gold(-4, 4);
    ctx.beginPath();
    ctx.arc(0, ty + 7, 3.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#d7191f';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = -6; i <= 6; i++) {
      ctx.moveTo(i * 0.5, ty + 10);
      ctx.lineTo(i * 0.95, ty + 31);
    }
    ctx.stroke();
    ctx.fillStyle = gold(-4, 4);
    ctx.fillRect(-3.5, ty + 10, 7, 3);
  });

/** Single firecracker, 6x18: red tube, gold band, fuse tip at the outer end. */
const crackerSprite = () =>
  sprite(8, 20, (ctx) => {
    ctx.translate(4, 1);
    const g = ctx.createLinearGradient(-3, 0, 3, 0);
    g.addColorStop(0, '#8a0d12');
    g.addColorStop(0.45, '#f0353a');
    g.addColorStop(1, '#8a0d12');
    ctx.fillStyle = g;
    ctx.fillRect(-3, 0, 6, 16);
    ctx.fillStyle = GOLD;
    ctx.fillRect(-3, 6.5, 6, 2.5);
    ctx.fillStyle = '#4a2a10';
    ctx.fillRect(-0.5, 16, 1, 2.5);
  });

export const lunarNewYear: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = 0;
  const lanterns: Lantern[] = [];
  const strings: CrackerString[] = [];
  const fragments: Fragment[] = [];
  const flashes: Flash[] = [];
  const smoke: Puff[] = [];
  const twinkles: Twinkle[] = [];
  let twinkleTimer = 0.5;
  /** Fragments bucketed by colour and alpha level, reused every frame. */
  const groups = new Map<string, Fragment[][]>();

  const lamp = spriteCache((c: string) => lanternSprite(c));
  const cracker = spriteCache(() => crackerSprite());
  const glow = spriteCache((c: string) => glowSprite(c, false, 0.3));
  const hot = spriteCache((c: string) => glowSprite(c, true, 0.2));
  const puffSprite = spriteCache(() => glowSprite('#a8a0a0', false, 0.35));

  const palette = () => paletteOr(o.colors, REDS);
  const lz = (l: Lantern) => l.z * o.size * clamp(h / 420, 0.6, 1.35);
  const spacing = () => 9 * o.size;
  const crackerCount = () => Math.max(0, Math.floor((Math.min(h * 0.6, 420 * o.size) - 16) / spacing()));

  const layout = () => {
    const active = o.density > 0 && w > 0;
    const crackers = active && o.ground && w >= 160;
    const span0 = crackers ? 0.16 : 0.05;
    const n = active ? clamp(Math.round((w / (150 * o.size)) * 0.55 * o.density), 1, 14) : 0;
    while (lanterns.length < n) {
      const i = lanterns.length;
      lanterns.push({
        ax: 0,
        lenFrac: i % 2 ? rand(0.04, 0.1) : rand(0.12, 0.22),
        len: 0,
        amp: rand(0.04, 0.08),
        omega: 0,
        phase: rand(0, TAU),
        z: rand(0.75, 1.1),
        color: '',
        seed: rand(0, 100),
        x: 0,
        y: 0,
        angle: 0,
      });
    }
    lanterns.length = n;
    const pal = palette();
    lanterns.forEach((l, i) => {
      l.ax = w * (span0 + ((1 - 2 * span0) * (i + 0.5)) / n);
      l.len = l.lenFrac * h + 4;
      l.omega = 2.2 / Math.sqrt(Math.max(0.4, l.len / 100));
      l.color = pal[i % pal.length];
    });

    const want = crackers ? [0.06, 0.94] : [];
    while (strings.length < want.length) {
      strings.push({ fx: 0, phase: 'idle', timer: rand(1, 3), left: crackerCount(), popAcc: 0, seed: rand(0, 100) });
    }
    strings.length = want.length;
    strings.forEach((st, i) => {
      st.fx = want[i];
      st.left = Math.min(st.left, crackerCount());
      if (st.phase === 'idle') st.left = crackerCount();
    });
  };

  /** Where cracker `i` (from the top) hangs on a string, and its angle. */
  const crackerAt = (st: CrackerString, i: number) => {
    const y = 16 + i * spacing();
    const sway = (Math.sin(t * 1.3 + st.seed + y * 0.012) * 3 + o.wind * 8) * (y / 200) * o.size;
    const x = st.fx * w + sway;
    // Slight per-knot variation so the bunch doesn't look machine-made
    const spread = 0.95 + 0.2 * Math.sin(i * 2.3 + st.seed);
    return { x, y, rot: spread + o.wind * 0.1, spread };
  };

  const pop = (x: number, y: number, power = 1) => {
    flashes.push({ x, y, life: 1, size: rand(40, 60) * o.size * power });
    smoke.push({ x, y, r: 6 * o.size, life: 0, max: rand(1.3, 2) });
    const n = Math.round(8 * power);
    for (let i = 0; i < n && fragments.length < 900; i++) {
      const a = rand(0, TAU);
      const v = rand(60, 220) * Math.sqrt(power);
      const max = rand(1.4, 2.6);
      fragments.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 60,
        rot: rand(0, TAU),
        vrot: rand(-9, 9),
        tilt: rand(0, TAU),
        vtilt: rand(5, 12),
        w: rand(3, 6) * o.size,
        h: rand(2, 4) * o.size,
        color: pick(PAPER),
        life: max,
        max,
      });
    }
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      layout();
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;

      for (const l of lanterns) {
        l.angle = l.amp * Math.sin(t * l.omega + l.phase) + o.wind * 0.12;
        l.x = l.ax - Math.sin(l.angle) * l.len;
        l.y = Math.cos(l.angle) * l.len;
      }

      const total = crackerCount();
      for (const st of strings) {
        if (st.phase === 'idle') {
          st.left = total;
          if ((st.timer -= s) <= 0) {
            st.phase = 'popping';
            st.popAcc = 0;
          }
        } else if (st.phase === 'popping') {
          // Pops race up the string from the bottom, a little irregularly
          st.popAcc += s * rand(8, 14);
          while (st.popAcc >= 1 && st.left > 0) {
            st.popAcc -= 1;
            st.left--;
            const c = crackerAt(st, st.left);
            pop(c.x, c.y + 8 * o.size, 1.2);
          }
          if (st.left <= 0) {
            st.phase = 'regrow';
            st.timer = 0;
          }
        } else {
          st.timer += s;
          st.left = Math.min(total, Math.floor((st.timer / 2.5) * total));
          if (st.left >= total) {
            st.phase = 'idle';
            st.timer = rand(2, 5) / Math.max(0.3, o.density);
          }
        }
      }

      if (o.density > 0 && w > 0) {
        twinkleTimer -= s;
        while (twinkleTimer <= 0) {
          twinkleTimer += rand(0.15, 0.5) / o.density;
          const max = rand(0.6, 1.1);
          twinkles.push({ x: rand(0, w), y: rand(0, h * 0.6), life: max, max, size: rand(8, 15) * o.size });
        }
      }
      retain(twinkles, (tw) => (tw.life -= s) > 0);

      const k = drag(0.97, s);
      retain(fragments, (f) => {
        f.tilt += f.vtilt * s;
        f.rot += f.vrot * s;
        f.vx = f.vx * k + o.wind * 50 * s;
        f.vy = Math.min(f.vy * k + 420 * s, 160); // paper flutters down
        f.x += (f.vx + Math.sin(f.tilt) * 15) * s;
        f.y += f.vy * s;
        return (f.life -= s) > 0 && f.y < h + 20;
      });
      retain(flashes, (f) => (f.life -= s * 7) > 0);
      retain(smoke, (p) => {
        p.r += 14 * s * o.size;
        p.y -= 10 * s;
        p.x += o.wind * 20 * s;
        return (p.life += s) < p.max;
      });
    },
    draw(ctx) {
      const m = baseTransform(ctx);

      // Gold sparkles: four-point glints
      if (twinkles.length) {
        ctx.globalCompositeOperation = 'lighter';
        const g = hot('#ffd76a');
        ctx.strokeStyle = '#ffe9a8';
        ctx.lineWidth = 0.8;
        for (const tw of twinkles) {
          const a = Math.sin((Math.PI * tw.life) / tw.max);
          ctx.globalAlpha = a;
          stamp(ctx, g, tw.x, tw.y, tw.size * 0.8);
          const L = tw.size * a;
          ctx.beginPath();
          ctx.moveTo(tw.x - L, tw.y);
          ctx.lineTo(tw.x + L, tw.y);
          ctx.moveTo(tw.x, tw.y - L);
          ctx.lineTo(tw.x, tw.y + L);
          ctx.stroke();
        }
      }

      // Lantern halos, cords, bodies
      if (lanterns.length) {
        ctx.globalCompositeOperation = 'lighter';
        for (const l of lanterns) {
          const z = lz(l);
          const fl = 0.85 + 0.1 * Math.sin(t * 9 + l.seed) + 0.05 * Math.sin(t * 21 + l.seed);
          ctx.globalAlpha = 0.62 * fl;
          stamp(ctx, glow('#ff4a22'), l.x - Math.sin(l.angle) * 36 * z, l.y + Math.cos(l.angle) * 36 * z, 150 * z);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#7a1010';
        ctx.lineWidth = 1.2 * o.size;
        ctx.beginPath();
        for (const l of lanterns) {
          ctx.moveTo(l.ax, 0);
          ctx.lineTo(l.x, l.y);
        }
        ctx.stroke();
        for (const l of lanterns) {
          const z = lz(l);
          place(ctx, m, l.x, l.y, l.angle);
          const img = lamp(l.color);
          if (img) ctx.drawImage(img, -30 * z, 0, 60 * z, 100 * z);
        }
        resetTransform(ctx, m);
        ctx.globalCompositeOperation = 'lighter';
        for (const l of lanterns) {
          const z = lz(l);
          const fl = 0.75 + 0.15 * Math.sin(t * 13 + l.seed) + 0.1 * Math.sin(t * 31 + l.seed * 2);
          ctx.globalAlpha = 0.35 * fl;
          stamp(ctx, hot('#ffb35c'), l.x - Math.sin(l.angle) * 38 * z, l.y + Math.cos(l.angle) * 38 * z, 34 * z);
        }
      }

      // Firecracker strings: braided cord, crackers in a herringbone
      if (strings.length) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        const total = crackerCount();
        ctx.strokeStyle = '#8a1a14';
        ctx.lineWidth = 1.6 * o.size;
        ctx.beginPath();
        for (const st of strings) {
          ctx.moveTo(st.fx * w, 0);
          for (let i = 0; i < total; i++) {
            const c = crackerAt(st, i);
            ctx.lineTo(c.x, c.y);
          }
        }
        ctx.stroke();
        const img = cracker(0);
        const k = o.size;
        for (const st of strings) {
          for (let i = 0; i < st.left; i++) {
            const c = crackerAt(st, i);
            // A pair at every knot, splayed either side: a dense herringbone bunch
            for (const side of [-1, 1]) {
              place(ctx, m, c.x, c.y, side * c.spread + o.wind * 0.1);
              if (img) ctx.drawImage(img, -5 * k, -1 * k, 10 * k, 24 * k);
            }
          }
        }
        resetTransform(ctx, m);
        // Burning fuse at the bottom while popping
        ctx.globalCompositeOperation = 'lighter';
        for (const st of strings) {
          if (st.phase !== 'popping' || st.left <= 0) continue;
          const c = crackerAt(st, st.left - 1);
          ctx.globalAlpha = 0.7 + 0.3 * Math.random();
          stamp(ctx, hot('#ffd25a'), c.x, c.y + 6 * k, 16 * k);
        }
      }

      // Smoke, then flashes over it
      ctx.globalCompositeOperation = 'source-over';
      const puff = puffSprite(0);
      for (const p of smoke) {
        ctx.globalAlpha = 0.26 * Math.sin((Math.PI * p.life) / p.max);
        stamp(ctx, puff, p.x, p.y, p.r * 2);
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const f of flashes) {
        ctx.globalAlpha = f.life;
        stamp(ctx, hot('#fff1b0'), f.x, f.y, f.size * (1.3 - f.life * 0.3));
      }

      // Paper fragments: rotated, flip-shaded rects, one fill per colour/alpha group
      if (fragments.length) {
        ctx.globalCompositeOperation = 'source-over';
        for (const f of fragments) {
          const flip = Math.cos(f.tilt);
          const color = shade(f.color, flip < 0 ? 0.35 : 0);
          let lv = groups.get(color);
          if (!lv) groups.set(color, (lv = Array.from({ length: ALPHA_STEPS + 1 }, () => [])));
          lv[alphaLevel(Math.min(1, f.life / 0.5))].push(f);
        }
        groups.forEach((lv, color) => {
          ctx.fillStyle = color;
          for (let a = 1; a <= ALPHA_STEPS; a++) {
            const list = lv[a];
            if (!list.length) continue;
            ctx.globalAlpha = a / ALPHA_STEPS;
            ctx.beginPath();
            for (const f of list) {
              const cos = Math.cos(f.rot);
              const sin = Math.sin(f.rot);
              const fy = Math.cos(f.tilt);
              const hx = f.w / 2;
              const hy = (f.h / 2) * fy;
              ctx.moveTo(f.x - cos * hx + sin * hy, f.y - sin * hx - cos * hy);
              ctx.lineTo(f.x + cos * hx + sin * hy, f.y + sin * hx - cos * hy);
              ctx.lineTo(f.x + cos * hx - sin * hy, f.y + sin * hx + cos * hy);
              ctx.lineTo(f.x - cos * hx - sin * hy, f.y - sin * hx + cos * hy);
              ctx.closePath();
            }
            ctx.fill();
            list.length = 0;
          }
        });
      }
    },
    burst(x, y) {
      // A handful of crackers going off together
      for (let i = 0; i < 5; i++) pop(x + rand(-24, 24) * o.size, y + rand(-16, 16) * o.size, 1.4);
    },
  };
};
