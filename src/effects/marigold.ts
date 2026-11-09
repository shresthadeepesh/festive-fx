import type { EffectFactory } from '../types';
import {
  TAU,
  baseTransform,
  countFor,
  drag,
  paletteOr,
  pick,
  place,
  rand,
  resetTransform,
  retain,
  sprite,
  spriteCache,
  stamp,
} from '../util';
import { Litter } from './litter';

/** Saffron and yellow marigold (sayapatri / genda). */
const MARIGOLD = ['#ff8c00', '#ffa600', '#ffc300', '#ff7400', '#ffb300'];
const LEAF = '#3f8f2b';
const MAX_EXTRA = 600;

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
  z: number;
  rot: number;
  vrot: number;
  flip: number;
  vflip: number;
  sway: number;
  phase: number;
  color: string;
  flower: boolean;
  /** Thrown by a burst: removed when it lands instead of recycling to the top. */
  extra: boolean;
  img: HTMLCanvasElement | null;
  /** Sprite diameter. */
  d: number;
}

/** Ruffled pom-pom: three rings of petals, darker outside, lighter at the heart. */
const flowerSprite = (color: string) =>
  sprite(48, 48, (ctx) => {
    ctx.translate(24, 24);
    const rings = [
      { r: 14, n: 18, rx: 4.6, ry: 7.5, shade: 'rgba(90,30,0,0.22)' },
      { r: 9, n: 15, rx: 4, ry: 6, shade: 'rgba(90,30,0,0.08)' },
      { r: 4.5, n: 11, rx: 3.2, ry: 4.5, shade: 'rgba(255,255,200,0.15)' },
    ];
    for (const ring of rings) {
      for (let i = 0; i < ring.n; i++) {
        const a = (i / ring.n) * TAU + rand(-0.12, 0.12);
        ctx.save();
        ctx.rotate(a);
        ctx.translate(0, -ring.r);
        ctx.beginPath();
        ctx.ellipse(0, 0, ring.rx, ring.ry, 0, 0, TAU);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.fillStyle = ring.shade;
        ctx.fill();
        // Frilly edge
        ctx.strokeStyle = 'rgba(120,40,0,0.35)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.fillStyle = 'rgba(150,60,0,0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, 2.4, 0, TAU);
    ctx.fill();
  });

/** Single loose petal with a crinkled tip. */
const petalSprite = (color: string) =>
  sprite(16, 16, (ctx) => {
    ctx.translate(8, 8);
    ctx.beginPath();
    ctx.moveTo(0, 6.5);
    ctx.bezierCurveTo(5, 4, 5, -3, 3.5, -5);
    ctx.lineTo(2, -4);
    ctx.lineTo(1, -6);
    ctx.lineTo(0, -4.5);
    ctx.lineTo(-1, -6);
    ctx.lineTo(-2, -4);
    ctx.lineTo(-3.5, -5);
    ctx.bezierCurveTo(-5, -3, -5, 4, 0, 6.5);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    const g = ctx.createLinearGradient(0, -6, 0, 6.5);
    g.addColorStop(0, 'rgba(255,255,220,0.25)');
    g.addColorStop(1, 'rgba(120,40,0,0.3)');
    ctx.fillStyle = g;
    ctx.fill();
  });

const leafSprite = () =>
  sprite(16, 28, (ctx) => {
    ctx.translate(8, 14);
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.bezierCurveTo(7, -6, 6, 8, 0, 13);
    ctx.bezierCurveTo(-6, 8, -7, -6, 0, -13);
    ctx.fillStyle = LEAF;
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,255,180,0.4)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(0, 12);
    ctx.stroke();
  });

export const marigold: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = 0;
  const bits: Bit[] = [];
  const litter = new Litter(80);
  let recycled = 0; // bits that respawn at the top (not burst extras)

  const flowers = spriteCache((c: string) => flowerSprite(c));
  const petals = spriteCache((c: string) => petalSprite(c));
  const leaf = spriteCache(() => leafSprite());
  const palette = () => paletteOr(o.colors, MARIGOLD);

  const make = (extra: boolean, x = rand(0, w), y?: number, vx = 0, vy = 0, forceFlower = false): Bit => {
    const flower = forceFlower || (!extra && Math.random() < 0.18);
    const z = rand(0.6, 1.2);
    const color = pick(palette());
    const s = (flower ? rand(9, 13) * (forceFlower ? 1.7 : 1) : rand(5, 8)) * o.size * z;
    return {
      x,
      y: y ?? rand(-80, -10),
      vx,
      vy,
      s,
      z,
      rot: rand(0, TAU),
      vrot: rand(-2, 2),
      flip: rand(0, TAU),
      vflip: flower ? rand(0.5, 1.5) : rand(2, 5),
      sway: rand(15, 45) * z,
      phase: rand(0, TAU),
      color,
      flower,
      extra,
      img: flower ? flowers(color) : petals(color),
      d: flower ? s * 2.4 : s * 2.2,
    };
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      const want = countFor(w, h, 55, o.density);
      for (; recycled < want; recycled++) bits.push(make(false, rand(0, w), rand(-h * 0.2, h)));
      if (recycled > want) {
        let drop = recycled - want;
        retain(bits, (b) => b.extra || drop-- <= 0);
        recycled = want;
      }
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;
      const k = drag(0.97, s);
      retain(bits, (b) => {
        const terminal = (b.flower ? 75 : 42) * b.z;
        // Thrown petals ease into their gentle terminal fall
        b.vy += (terminal - b.vy) * Math.min(1, 1.6 * s);
        b.vx *= k;
        b.phase += 1.3 * s;
        b.rot += b.vrot * s;
        b.flip += b.vflip * s;
        b.x += (b.vx + Math.sin(b.phase) * b.sway + o.wind * 70 * b.z) * s;
        b.y += b.vy * s;

        const landed = o.ground && b.y >= h - b.s * 0.3;
        if (landed || b.y - b.s * 2 > h) {
          if (landed) litter.add(b.x, h, b.d, b.img, b.flower ? 0.75 : 0.5);
          if (b.extra) return false;
          Object.assign(b, make(false));
          return true;
        }
        if (!b.extra) {
          if (b.x < -30) b.x += w + 60;
          else if (b.x > w + 30) b.x -= w + 60;
        }
        return true;
      });
      litter.update(s, o.ground);
    },
    draw(ctx) {
      const m = baseTransform(ctx);
      litter.draw(ctx, m);

      for (const b of bits) {
        place(ctx, m, b.x, b.y, b.rot, b.flower ? 0.8 + 0.2 * Math.cos(b.flip) : Math.cos(b.flip), 1);
        ctx.globalAlpha = 0.65 + 0.35 * Math.min(1, b.z);
        stamp(ctx, b.img, 0, 0, b.d);
      }
      resetTransform(ctx, m);

      if (!o.ground || w < 120) return;

      // Garlands (toran) swagged along the top edge
      const pal = palette();
      const fs = 15 * o.size;
      const swags = Math.max(1, Math.round(w / (240 * o.size)));
      const span = w / swags;
      const step = fs * 0.78;
      ctx.globalAlpha = 1;
      for (let i = 0; i < swags; i++) {
        const x0 = i * span;
        const sag = 46 * o.size * (1 + 0.05 * Math.sin(t * 1.3 + i));
        const swing = Math.sin(t * 1.1 + i * 1.7) * 3;
        const n = Math.floor(span / step);
        for (let j = 0; j <= n; j++) {
          const u = j / n;
          const bow = 4 * u * (1 - u);
          const color = pal[(Math.floor(j / 3) + i) % 2 === 0 ? 0 : Math.min(2, pal.length - 1)];
          place(ctx, m, x0 + u * span + swing * bow, 4 * o.size + sag * bow, j * 1.7);
          stamp(ctx, flowers(color), 0, 0, fs * 1.6);
        }
      }
      // Hanging strands at each anchor, ending in a mango leaf
      for (let i = 0; i <= swags; i++) {
        const ax = Math.min(w - 6, Math.max(6, i * span));
        // Pendulum: each flower sits along the rotated strand
        const angle = Math.sin(t * 1.7 + i * 2.3) * 0.12;
        const dx = -Math.sin(angle);
        const dy = Math.cos(angle);
        for (let j = 0; j < 5; j++) {
          const along = 6 * o.size + j * fs * 0.75;
          place(ctx, m, ax + dx * along, 2 + dy * along, angle + j * 2.1);
          stamp(ctx, flowers(pal[j % 2 === 0 ? 0 : Math.min(2, pal.length - 1)]), 0, 0, fs * 1.5);
        }
        const along = 6 * o.size + 5 * fs * 0.75 + 6 * o.size;
        place(ctx, m, ax + dx * along, 2 + dy * along, angle);
        const lg = leaf('');
        if (lg) ctx.drawImage(lg, -6 * o.size, -10.5 * o.size, 12 * o.size, 21 * o.size);
      }
      resetTransform(ctx, m);
    },
    burst(x, y) {
      // A handful of petals thrown in the air, as at a puja or wedding
      const n = Math.min(50, MAX_EXTRA - (bits.length - recycled));
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + rand(-1.2, 1.2);
        const v = rand(140, 420);
        bits.push(make(true, x, y, Math.cos(a) * v, Math.sin(a) * v, i < 4));
      }
    },
  };
};
