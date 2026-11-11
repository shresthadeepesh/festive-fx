import type { EffectFactory } from '../types';
import {
  ALPHA_STEPS,
  TAU,
  alphaLevel,
  baseTransform,
  countFor,
  drag,
  paletteOr,
  pick,
  place,
  rand,
  resetTransform,
  retain,
  shade,
  sprite,
  spriteCache,
} from '../util';

const LATEX = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#e9c46a', '#9b5de5', '#f15bb5', '#00bbf9', '#06d6a0'];
const FOIL = ['#d4af37', '#c0c0c8', '#e8a7b5'];
const CONFETTI = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#ffffff'];

type Kind = 'latex' | 'foil' | 'heart';

/** Points in each string's verlet chain. */
const SEGS = 9;

interface Balloon {
  x: number;
  y: number;
  z: number;
  r: number;
  vy: number;
  sway: number;
  phase: number;
  color: string;
  kind: Kind;
  img: HTMLCanvasElement | null;
  /** String chain: positions and previous positions, [x0, y0, x1, y1, ...]. */
  pts: Float32Array;
  prev: Float32Array;
  curl: number;
  extra: boolean;
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  s: number;
  color: string;
  shred: boolean;
  life: number;
  max: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  life: number;
}

/** Latex: glossy radial shading, specular highlight, rim light and a tied knot. */
const latexSprite = (color: string) =>
  sprite(64, 76, (ctx) => {
    ctx.translate(32, 32);
    const body = () => {
      ctx.beginPath();
      // Slightly pear-shaped: wider top, narrowing toward the knot
      ctx.moveTo(0, -28);
      ctx.bezierCurveTo(18, -28, 27, -14, 26, 0);
      ctx.bezierCurveTo(25, 16, 12, 30, 0, 33);
      ctx.bezierCurveTo(-12, 30, -25, 16, -26, 0);
      ctx.bezierCurveTo(-27, -14, -18, -28, 0, -28);
      ctx.closePath();
    };
    // Knot
    ctx.fillStyle = shade(color, 0.3);
    ctx.beginPath();
    ctx.moveTo(-4, 37);
    ctx.lineTo(4, 37);
    ctx.lineTo(1.5, 32);
    ctx.lineTo(-1.5, 32);
    ctx.closePath();
    ctx.fill();

    body();
    const g = ctx.createRadialGradient(-9, -12, 2, 0, 0, 34);
    g.addColorStop(0, shade(color, -0.45));
    g.addColorStop(0.35, color);
    g.addColorStop(1, shade(color, 0.45));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // Rim light on the lower right edge (bounce light)
    const rim = ctx.createRadialGradient(-6, -8, 26, -6, -8, 40);
    rim.addColorStop(0, 'rgba(255,255,255,0)');
    rim.addColorStop(1, 'rgba(255,255,255,0.28)');
    ctx.fillStyle = rim;
    ctx.fillRect(-32, -32, 64, 72);
    ctx.restore();
    // Specular highlight plus a small hot spot
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-10, -14, 5, 9, 0.55, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(-12, -17, 1.8, 3, 0.55, 0, TAU);
    ctx.fill();
  });

/** Foil: mirror-like bands, a hard specular streak and crimped seam. Round or heart. */
const foilSprite = (color: string, heart: boolean) =>
  sprite(64, 76, (ctx) => {
    ctx.translate(32, 32);
    const body = () => {
      ctx.beginPath();
      if (heart) {
        ctx.moveTo(0, 30);
        ctx.bezierCurveTo(-34, 6, -26, -30, 0, -14);
        ctx.bezierCurveTo(26, -30, 34, 6, 0, 30);
      } else {
        ctx.arc(0, 0, 27, 0, TAU);
      }
      ctx.closePath();
    };
    ctx.fillStyle = shade(color, 0.35);
    ctx.fillRect(-1.5, heart ? 29 : 26, 3, 6);
    body();
    const g = ctx.createLinearGradient(-28, -28, 28, 28);
    g.addColorStop(0, shade(color, -0.6));
    g.addColorStop(0.25, color);
    g.addColorStop(0.45, shade(color, 0.35));
    g.addColorStop(0.6, shade(color, -0.3));
    g.addColorStop(0.8, color);
    g.addColorStop(1, shade(color, 0.5));
    ctx.fillStyle = g;
    ctx.fill();
    // Crimped seam
    ctx.strokeStyle = shade(color, -0.5);
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 18, -2.6, -1.9);
    ctx.stroke();
    ctx.restore();
  });

export const balloons: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = rand(0, 50);
  const flock: Balloon[] = [];
  const bits: Bit[] = [];
  const rings: Ring[] = [];
  let recycled = 0;

  const latex = spriteCache((c: string) => latexSprite(c));
  const foil = spriteCache((c: string) => foilSprite(c, false));
  const heart = spriteCache((c: string) => foilSprite(c, true));
  const bitGroups = new Map<string, Bit[][]>();

  const palette = () => paletteOr(o.colors, LATEX);

  const stringLen = (b: Balloon) => b.r * 3.2;

  const setup = (b: Balloon, x: number, y: number) => {
    const z = rand(0.6, 1.15);
    const roll = Math.random();
    const kind: Kind = o.colors ? 'latex' : roll < 0.12 ? 'heart' : roll < 0.27 ? 'foil' : 'latex';
    const color = kind === 'latex' ? pick(palette()) : kind === 'heart' ? pick(['#e63946', '#f15bb5', '#d4af37']) : pick(FOIL);
    b.x = x;
    b.y = y;
    b.z = z;
    b.r = rand(20, 28) * z * o.size;
    b.vy = rand(38, 70) * z;
    b.sway = rand(10, 24) * z;
    b.phase = rand(0, TAU);
    b.color = color;
    b.kind = kind;
    b.img = kind === 'latex' ? latex(color) : kind === 'heart' ? heart(color) : foil(color);
    b.curl = rand(0, TAU);
    // String hangs straight down from the knot to start
    const seg = stringLen(b) / (SEGS - 1);
    for (let i = 0; i < SEGS; i++) {
      b.pts[i * 2] = b.prev[i * 2] = x;
      b.pts[i * 2 + 1] = b.prev[i * 2 + 1] = y + b.r * 1.2 + i * seg;
    }
  };

  const make = (x: number, y: number, extra: boolean): Balloon => {
    const b = {
      x: 0, y: 0, z: 1, r: 1, vy: 0, sway: 0, phase: 0, color: '', kind: 'latex' as Kind, img: null,
      pts: new Float32Array(SEGS * 2), prev: new Float32Array(SEGS * 2), curl: 0, extra,
    };
    setup(b, x, y);
    return b;
  };

  const fromBelow = (b: Balloon) => setup(b, rand(0, w), h + rand(40, h * 0.6 + 40));
  const sortByDepth = () => flock.sort((a, b) => a.z - b.z);

  const pop = (b: Balloon) => {
    rings.push({ x: b.x, y: b.y, r: b.r, life: 1 });
    // Torn rubber shreds in the balloon's colour
    for (let i = 0; i < 10; i++) {
      const a = rand(0, TAU);
      const v = rand(120, 380);
      const max = rand(0.9, 1.6);
      bits.push({ x: b.x + Math.cos(a) * b.r * 0.6, y: b.y + Math.sin(a) * b.r * 0.6, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60,
        rot: rand(0, TAU), vrot: rand(-12, 12), s: rand(3, 6) * b.z * o.size, color: b.color, shred: true, life: max, max });
    }
    for (let i = 0; i < 16; i++) {
      const a = rand(0, TAU);
      const v = rand(60, 260);
      const max = rand(1.2, 2.2);
      bits.push({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, rot: rand(0, TAU), vrot: rand(-8, 8),
        s: rand(1.5, 3) * o.size, color: pick(CONFETTI), shred: false, life: max, max });
    }
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      const want = countFor(w, h, 24, o.density);
      for (; recycled < want; recycled++) flock.push(make(rand(0, w), rand(h * 0.1, h * 1.4), false));
      if (recycled > want) {
        let drop = recycled - want;
        retain(flock, (b) => b.extra || drop-- <= 0);
        recycled = want;
      }
      sortByDepth();
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;
      retain(flock, (b) => {
        b.phase += 0.8 * s;
        const dx = (Math.sin(b.phase) * b.sway + o.wind * 60 * b.z) * s;
        b.x += dx;
        b.y -= b.vy * s;
        if (b.y < -b.r * 2 - stringLen(b)) {
          if (b.extra) return false;
          fromBelow(b);
          return true;
        }
        if (w > 0) {
          if (b.x < -b.r * 2) b.x += w + b.r * 4;
          else if (b.x > w + b.r * 2) b.x -= w + b.r * 4;
        }
        // Verlet string: pinned at the knot, light gravity, drag from the air
        const p = b.pts;
        const q = b.prev;
        const kx = b.x;
        const ky = b.y + b.r * 1.2;
        for (let i = 1; i < SEGS; i++) {
          const ix = i * 2;
          const vx = (p[ix] - q[ix]) * 0.96;
          const vy = (p[ix + 1] - q[ix + 1]) * 0.96;
          q[ix] = p[ix];
          q[ix + 1] = p[ix + 1];
          p[ix] += vx + o.wind * 500 * s * s;
          p[ix + 1] += vy + 160 * s * s;
        }
        p[0] = q[0] = kx;
        p[1] = q[1] = ky;
        const seg = stringLen(b) / (SEGS - 1);
        for (let it = 0; it < 3; it++) {
          for (let i = 1; i < SEGS; i++) {
            const ax = (i - 1) * 2;
            const bx = i * 2;
            let ddx = p[bx] - p[ax];
            let ddy = p[bx + 1] - p[ax + 1];
            const d = Math.hypot(ddx, ddy) || 1e-6;
            const k = (d - seg) / d;
            ddx *= k;
            ddy *= k;
            if (i === 1) {
              p[bx] -= ddx;
              p[bx + 1] -= ddy;
            } else {
              p[ax] += ddx * 0.5;
              p[ax + 1] += ddy * 0.5;
              p[bx] -= ddx * 0.5;
              p[bx + 1] -= ddy * 0.5;
            }
          }
        }
        // A wrap teleported the balloon: snap the string with it
        if (Math.abs(p[2] - kx) > b.r * 4) {
          for (let i = 0; i < SEGS; i++) {
            p[i * 2] = q[i * 2] = kx;
            p[i * 2 + 1] = q[i * 2 + 1] = ky + i * seg;
          }
        }
        return true;
      });

      const k = drag(0.96, s);
      retain(bits, (b) => {
        b.vx = b.vx * k + o.wind * 30 * s;
        b.vy = b.vy * k + (b.shred ? 520 : 260) * s;
        b.x += b.vx * s;
        b.y += b.vy * s;
        b.rot += b.vrot * s;
        return (b.life -= s) > 0;
      });
      retain(rings, (r) => (r.life -= s * 4) > 0);
    },
    draw(ctx) {
      // Strings first, so balloons sit on top: one path for all of them
      if (flock.length) {
        ctx.strokeStyle = 'rgba(150,140,130,1)';
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 0.9;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (const b of flock) {
          const p = b.pts;
          ctx.moveTo(p[0], p[1]);
          for (let i = 1; i < SEGS; i++) {
            // Curly ribbon: a small perpendicular wiggle along the chain
            const c = Math.sin(i * 1.4 + b.curl + t * 1.5) * 2.2 * b.z * (i / SEGS);
            ctx.lineTo(p[i * 2] + c, p[i * 2 + 1]);
          }
        }
        ctx.stroke();
      }

      const m = baseTransform(ctx);
      for (const b of flock) {
        const tilt = Math.cos(b.phase) * 0.08 + o.wind * 0.1;
        place(ctx, m, b.x, b.y, tilt);
        ctx.globalAlpha = 0.75 + 0.25 * Math.min(1, b.z);
        if (b.img) ctx.drawImage(b.img, -b.r * 1.15, -b.r * 1.15, b.r * 2.3, b.r * 2.73);
      }
      resetTransform(ctx, m);

      // Shreds and confetti: grouped by colour and alpha level
      for (const b of bits) {
        let g = bitGroups.get(b.color);
        if (!g) bitGroups.set(b.color, (g = Array.from({ length: ALPHA_STEPS + 1 }, () => [])));
        g[alphaLevel(Math.min(1, (b.life / b.max) * 2))].push(b);
      }
      bitGroups.forEach((groups, color) => {
        ctx.fillStyle = color;
        for (let lv = 1; lv <= ALPHA_STEPS; lv++) {
          const g = groups[lv];
          if (!g.length) continue;
          ctx.globalAlpha = lv / ALPHA_STEPS;
          ctx.beginPath();
          for (const b of g) {
            const c = Math.cos(b.rot) * b.s;
            const sn = Math.sin(b.rot) * b.s;
            if (b.shred) {
              // Jagged rubber scrap
              ctx.moveTo(b.x + c, b.y + sn);
              ctx.lineTo(b.x - sn * 0.6, b.y + c * 0.6);
              ctx.lineTo(b.x - c * 0.8, b.y - sn * 0.8);
              ctx.lineTo(b.x + sn * 0.3, b.y - c * 0.5);
              ctx.closePath();
            } else {
              ctx.moveTo(b.x + c, b.y + sn * 0.5);
              ctx.lineTo(b.x - sn * 0.5, b.y + c);
              ctx.lineTo(b.x - c, b.y - sn * 0.5);
              ctx.lineTo(b.x + sn * 0.5, b.y - c);
              ctx.closePath();
            }
          }
          ctx.fill();
          g.length = 0;
        }
      });

      // Pop flash: a quick expanding ring
      if (rings.length) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        for (const r of rings) {
          ctx.globalAlpha = r.life * 0.8;
          ctx.beginPath();
          const rr = r.r * (1.8 - r.life * 0.8);
          ctx.moveTo(r.x + rr, r.y);
          ctx.arc(r.x, r.y, rr, 0, TAU);
          ctx.stroke();
        }
      }
    },
    burst(x, y) {
      const reach = 70 * o.size;
      let hit = false;
      for (const b of flock) {
        if (Math.hypot(b.x - x, b.y - y) < b.r + reach) {
          pop(b);
          hit = true;
          if (b.extra) b.y = -1e6; // removed next update
          else fromBelow(b);
        }
      }
      if (!hit && flock.length - recycled < 40) {
        flock.push(make(x, y, true));
        sortByDepth();
      }
    },
  };
};
