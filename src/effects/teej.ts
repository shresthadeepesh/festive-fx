import type { EffectFactory } from '../types';
import {
  TAU,
  baseTransform,
  clamp,
  countFor,
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

/** Teej reds and greens with gold. */
const GLASS = ['#d4142a', '#b5121b', '#17a34a', '#0f7a3a', '#e8b923', '#c2185b', '#d4142a', '#17a34a'];
const GOLD = '#f2c94c';
const HENNA = '#9c3d1a';
const MAX_EXTRA = 160;

/** 0 plain glass, 1 gold-banded, 2 gold-dotted, 3 twisted stripes. */
type Style = 0 | 1 | 2 | 3;

interface Bangle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  R: number;
  thick: number;
  z: number;
  /** Ring tilt toward the viewer: the ellipse's minor radius is R * |cos(tilt)|. */
  tilt: number;
  vtilt: number;
  rot: number;
  vrot: number;
  phase: number;
  color: string;
  style: Style;
  extra: boolean;
}

/** 0 twinkle, 1 bindi, 2 mehendi swirl. */
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vrot: number;
  phase: number;
  kind: 0 | 1 | 2;
}

const starSprite = () =>
  sprite(32, 32, (ctx) => {
    ctx.translate(16, 16);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,236,190,0.75)');
    g.addColorStop(1, 'rgba(255,210,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 2 : 16;
      const a = (i * Math.PI) / 4;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  });

/** Red bindi with a glossy highlight and a ring of tiny gold beads. */
const bindiSprite = () =>
  sprite(24, 24, (ctx) => {
    ctx.translate(12, 12);
    ctx.fillStyle = GOLD;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 8.8, Math.sin(a) * 8.8, 1.1, 0, TAU);
      ctx.fill();
    }
    const g = ctx.createRadialGradient(-2, -2, 0.5, 0, 0, 7);
    g.addColorStop(0, '#ff6b6b');
    g.addColorStop(0.5, '#d00020');
    g.addColorStop(1, '#7a0010');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 6.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(-2.3, -2.6, 1.8, 1.1, -0.6, 0, TAU);
    ctx.fill();
  });

/** Mehendi swirl: a henna spiral with a leaf pair and dot trail, flecked with gold. */
const swirlSprite = () =>
  sprite(40, 40, (ctx) => {
    ctx.translate(20, 20);
    ctx.strokeStyle = HENNA;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const a = t * TAU * 2.1;
      const r = 1 + t * 11;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();
    // Leaf pair off the tail
    ctx.fillStyle = HENNA;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(10 + s * 3, 6 + s * 2, 4.2, 1.6, s * 0.8, 0, TAU);
      ctx.fill();
    }
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(14 + i * 1.6, -2 - i * 2.4, 0.9 - i * 0.1, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = GOLD;
    for (const [x, y] of [
      [0, 0],
      [-6, 5],
      [7, -7],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, 1.1, 0, TAU);
      ctx.fill();
    }
  });

export const teej: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = 0;
  const bangles: Bangle[] = [];
  const bits: Bit[] = [];
  let recycled = 0;

  const star = spriteCache(() => starSprite());
  const bindi = spriteCache(() => bindiSprite());
  const swirl = spriteCache(() => swirlSprite());
  const glint = spriteCache(() => glowSprite('#ffffff', true, 0.25));

  const palette = () => paletteOr(o.colors, GLASS);

  const make = (extra: boolean, x = rand(-20, w + 20), y = rand(-120, -30), vx = 0, vy = rand(40, 90)): Bangle => {
    const z = rand(0.6, 1.2);
    const R = rand(17, 25) * o.size * z;
    const r = Math.random();
    return {
      x,
      y,
      vx,
      vy,
      R,
      thick: R * rand(0.2, 0.28),
      z,
      tilt: rand(0, TAU),
      vtilt: rand(1, 2.8) * (Math.random() < 0.5 ? -1 : 1),
      rot: rand(0, TAU),
      vrot: rand(-0.8, 0.8),
      phase: rand(0, TAU),
      color: pick(palette()),
      style: (r < 0.4 ? 0 : r < 0.65 ? 1 : r < 0.85 ? 2 : 3) as Style,
      extra,
    };
  };

  const makeBit = (anywhere: boolean): Bit => {
    const r = Math.random();
    return {
      x: rand(0, w),
      y: anywhere ? rand(-20, h) : rand(-40, -10),
      vx: 0,
      vy: rand(14, 34),
      size: rand(0.7, 1.3) * o.size,
      rot: rand(0, TAU),
      vrot: rand(-0.8, 0.8),
      phase: rand(0, TAU),
      kind: r < 0.62 ? 0 : r < 0.8 ? 1 : 2,
    };
  };

  /** Stroke part of the ring's ellipse in its local frame. */
  const arc = (ctx: CanvasRenderingContext2D, rx: number, ry: number, a0: number, a1: number, dy = 0) => {
    ctx.beginPath();
    ctx.ellipse(0, dy, Math.max(0.5, rx), Math.max(0.3, ry), 0, a0, a1);
    ctx.stroke();
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      const want = countFor(w, h, 28, o.density);
      for (; recycled < want; recycled++) bangles.push(make(false, rand(0, w), rand(-h * 0.2, h)));
      if (recycled > want) {
        let drop = recycled - want;
        retain(bangles, (b) => b.extra || drop-- <= 0);
        recycled = want;
      }
      const bitsWant = countFor(w, h, 34, o.density);
      while (bits.length < bitsWant) bits.push(makeBit(true));
      bits.length = bitsWant;
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;
      const k = drag(0.985, s);
      retain(bangles, (b) => {
        const terminal = (70 + 50 * b.z) * (b.extra ? 1.3 : 1);
        b.vy = Math.min(terminal, b.vy + 520 * s);
        b.vx = b.vx * k + o.wind * 45 * s;
        b.phase += 1.2 * s;
        b.tilt += b.vtilt * s;
        b.rot += b.vrot * s;
        b.x += (b.vx + Math.sin(b.phase) * 14 * b.z) * s;
        b.y += b.vy * s;
        if (b.y - b.R * 2 > h) {
          if (b.extra) return false;
          Object.assign(b, make(false));
        } else if (!b.extra) {
          if (b.x < -40) b.x += w + 80;
          else if (b.x > w + 40) b.x -= w + 80;
        }
        return true;
      });
      for (const p of bits) {
        p.phase += 1.4 * s;
        p.rot += p.vrot * s;
        p.y += p.vy * s;
        p.x += (Math.sin(p.phase) * 10 + o.wind * 30) * s;
        if (p.y > h + 20) Object.assign(p, makeBit(false));
        if (p.x < -20) p.x += w + 40;
        else if (p.x > w + 20) p.x -= w + 40;
      }
    },
    draw(ctx) {
      const m = baseTransform(ctx);
      ctx.lineCap = 'round';

      // Drifting bindis and mehendi swirls (behind the glass)
      for (const p of bits) {
        if (p.kind === 0) continue;
        ctx.globalAlpha = 0.85;
        place(ctx, m, p.x, p.y, p.rot);
        stamp(ctx, p.kind === 1 ? bindi('') : swirl(''), 0, 0, (p.kind === 1 ? 15 : 34) * p.size);
      }

      for (const b of bangles) {
        const c = Math.cos(b.tilt);
        const ry = b.R * Math.abs(c);
        // The half nearer the viewer is drawn last, over the far half
        const front0 = c >= 0 ? 0 : Math.PI;
        const back0 = front0 + Math.PI;
        const a = clamp(0.62 + 0.35 * b.z, 0, 1);
        place(ctx, m, b.x, b.y, b.rot);

        // Far half: darker, more see-through glass
        ctx.globalAlpha = a * 0.55;
        ctx.strokeStyle = shade(b.color, 0.4);
        ctx.lineWidth = b.thick;
        arc(ctx, b.R, ry, back0, back0 + Math.PI);
        if (b.style === 1) {
          ctx.globalAlpha = a * 0.45;
          ctx.strokeStyle = GOLD;
          ctx.lineWidth = b.thick * 0.22;
          arc(ctx, b.R, ry, back0, back0 + Math.PI);
        }

        // Near half
        ctx.globalAlpha = a * 0.9;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = b.thick;
        arc(ctx, b.R, ry, front0, front0 + Math.PI);

        if (b.style === 1) {
          // Two gold bands framing the glass
          ctx.globalAlpha = a;
          ctx.strokeStyle = GOLD;
          ctx.lineWidth = b.thick * 0.2;
          const d = b.thick * 0.34;
          arc(ctx, b.R + d, ry + d * Math.abs(c), front0, front0 + Math.PI);
          arc(ctx, b.R - d, Math.max(0.3, ry - d * Math.abs(c)), front0, front0 + Math.PI);
        } else if (b.style === 2) {
          // Gold beads set into the glass
          ctx.globalAlpha = a;
          ctx.fillStyle = GOLD;
          ctx.beginPath();
          const n = 11;
          for (let i = 0; i < n; i++) {
            const tt = front0 + ((i + 0.5) / n) * Math.PI;
            const x = Math.cos(tt) * b.R;
            const y = Math.sin(tt) * ry;
            const rr = b.thick * 0.24;
            ctx.moveTo(x + rr, y);
            ctx.arc(x, y, rr, 0, TAU);
          }
          ctx.fill();
        } else if (b.style === 3) {
          // Twisted glass: diagonal stripes across the near half
          ctx.globalAlpha = a * 0.8;
          ctx.strokeStyle = shade(b.color, -0.55);
          ctx.lineWidth = b.thick * 0.18;
          ctx.beginPath();
          const n = 13;
          for (let i = 0; i < n; i++) {
            const tt = front0 + ((i + 0.5) / n) * Math.PI;
            const cx = Math.cos(tt) * b.R;
            const cy = Math.sin(tt) * ry;
            // Stripe runs across the tube, skewed along the ring
            const nx = Math.cos(tt);
            const ny = Math.sin(tt) * (ry / b.R);
            const len = b.thick * 0.42;
            ctx.moveTo(cx - nx * len - ny * len * 0.6, cy - ny * len + nx * len * 0.6);
            ctx.lineTo(cx + nx * len + ny * len * 0.6, cy + ny * len - nx * len * 0.6);
          }
          ctx.stroke();
        }

        // Light passing through the glass: a brighter core along the tube
        ctx.globalAlpha = a * 0.5;
        ctx.strokeStyle = shade(b.color, -0.45);
        ctx.lineWidth = b.thick * 0.32;
        arc(ctx, b.R, ry, front0 + 0.15, front0 + Math.PI - 0.15);
        // Glossy reflection running along the inside of the near half
        ctx.globalAlpha = a * 0.8;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = b.thick * 0.24;
        const shine = front0 + Math.PI * 0.18;
        arc(ctx, b.R - b.thick * 0.12, Math.max(0.3, ry - b.thick * 0.12 * Math.abs(c)), shine, shine + Math.PI * 0.32);
      }
      resetTransform(ctx, m);

      // Specular flashes as rings turn edge-on to the light, and twinkles
      ctx.globalCompositeOperation = 'lighter';
      const st = star('');
      const gl = glint('');
      for (const b of bangles) {
        const flash = Math.pow(Math.max(0, Math.sin(b.tilt * 2 + 0.9)), 5);
        if (flash < 0.06) continue;
        const sx = b.x + Math.cos(b.rot + 2.4) * b.R * 0.9;
        const sy = b.y + Math.sin(b.rot + 2.4) * b.R * 0.4;
        ctx.globalAlpha = flash * 0.5;
        stamp(ctx, gl, sx, sy, b.R * 1.2);
        ctx.globalAlpha = flash * 0.85;
        stamp(ctx, st, sx, sy, b.R * 1.4);
      }
      for (const p of bits) {
        if (p.kind !== 0) continue;
        const tw = Math.pow(0.5 + 0.5 * Math.sin(t * 3 + p.phase * 2), 3);
        if (tw < 0.04) continue;
        ctx.globalAlpha = tw;
        stamp(ctx, st, p.x, p.y, 12 * p.size * (0.6 + 0.4 * tw));
      }
    },
    burst(x, y) {
      const n = Math.min(18, MAX_EXTRA - (bangles.length - recycled));
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + rand(-1, 1);
        const v = rand(220, 480) * clamp(h / 700, 0.6, 1.3);
        const b = make(true, x, y, Math.cos(a) * v, Math.sin(a) * v);
        b.vtilt *= 1.8;
        bangles.push(b);
      }
    },
  };
};
