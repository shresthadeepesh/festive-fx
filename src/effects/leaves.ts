import type { EffectFactory } from '../types';
import { TAU, baseTransform, countFor, drag, gust, paletteOr, pick, place, rand, resetTransform, sprite, spriteCache, stamp } from '../util';
import { Litter } from './litter';

const AUTUMN = ['#d2691e', '#e8a33d', '#b5452b', '#8b4513', '#f4c430', '#a0522d', '#c0392b', '#9c6b1f'];
const SAKURA = ['#ffd1dc', '#ffb7c5', '#fcc9d3', '#f8a5c2', '#fff0f5'];
/** Lali gurans: rhododendron arboreum, Nepal's national flower. */
const LALI = ['#c8102e', '#e0234e', '#b5122f', '#f05a7e', '#ff8fa3'];

type LeafShape = 'maple' | 'oak' | 'beech' | 'petal' | 'rhodo' | 'bloom';

interface Leaf {
  x: number;
  y: number;
  vx: number;
  s: number;
  z: number;
  vy: number;
  rot: number;
  vrot: number;
  flip: number;
  vflip: number;
  sway: number;
  phase: number;
  /** Sprites resolved once at spawn, not looked up by string key every frame. */
  front: HTMLCanvasElement | null;
  back: HTMLCanvasElement | null;
}

/** Right half of an outline (top tip to bottom base); mirrored for the left. */
const MAPLE: [number, number][] = [
  [0, -20], [3, -11], [9, -15], [8, -7], [17, -10], [14, -3], [19, 1], [11, 2], [13, 9], [5, 6], [2, 10], [0, 11],
];
const OAK: [number, number][] = [
  [0, -20], [6, -17], [4, -12], [10, -9], [6, -4], [11, 0], [6, 4], [9, 9], [3, 11], [0, 14],
];

const mirrored = (half: [number, number][]) => [...half, ...half.slice(0, -1).reverse().map(([x, y]) => [-x, y] as [number, number])];

/** Outline in a ±20 box, tip up, base (stem end) down. */
const outline = (ctx: CanvasRenderingContext2D, shape: LeafShape) => {
  ctx.beginPath();
  if (shape === 'maple') {
    for (const [x, y] of mirrored(MAPLE)) ctx.lineTo(x, y);
  } else if (shape === 'oak') {
    // Smooth through midpoints so lobes come out rounded
    const pts = mirrored(OAK);
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i];
      const [nx, ny] = pts[i + 1];
      ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
  } else if (shape === 'beech') {
    ctx.moveTo(0, -20);
    ctx.bezierCurveTo(13, -10, 11, 8, 0, 15);
    ctx.bezierCurveTo(-11, 8, -13, -10, 0, -20);
  } else if (shape === 'rhodo') {
    // Broad rhododendron petal: narrow base, wide ruffled rounded tip
    ctx.moveTo(0, 15);
    ctx.bezierCurveTo(9, 11, 17, -2, 13, -11);
    ctx.quadraticCurveTo(10, -17, 5, -15);
    ctx.quadraticCurveTo(2, -18, 0, -15.5);
    ctx.quadraticCurveTo(-2, -18, -5, -15);
    ctx.quadraticCurveTo(-10, -17, -13, -11);
    ctx.bezierCurveTo(-17, -2, -9, 11, 0, 15);
  } else {
    // Cherry blossom petal with the notch at its tip
    ctx.moveTo(0, 14);
    ctx.bezierCurveTo(15, 6, 12, -15, 3.5, -15);
    ctx.lineTo(0, -10);
    ctx.lineTo(-3.5, -15);
    ctx.bezierCurveTo(-12, -15, -15, 6, 0, 14);
  }
  ctx.closePath();
};

/** Small rhododendron truss: five overlapping petals, spotted throat, curved stamens. */
const bloomSprite = (color: string, back: boolean) =>
  sprite(48, 48, (ctx) => {
    ctx.translate(24, 24);
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate((i / 5) * TAU + 0.3);
      ctx.translate(0, -9);
      ctx.scale(0.62, 0.62);
      outline(ctx, 'rhodo');
      ctx.fillStyle = color;
      ctx.fill();
      const g = ctx.createLinearGradient(0, 15, 0, -15);
      g.addColorStop(0, 'rgba(70,0,10,0.45)');
      g.addColorStop(0.5, 'rgba(70,0,10,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.18)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,0,15,0.35)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    }
    // Dark nectar spots in the throat
    ctx.fillStyle = 'rgba(60,0,10,0.7)';
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 4.5, Math.sin(a) * 4.5, 0.7, 0, TAU);
      ctx.fill();
    }
    // Stamens with pale anthers
    ctx.strokeStyle = 'rgba(255,220,225,0.85)';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.2;
      const r = 9 + (i % 3) * 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(x * 0.4 + 2, y * 0.4 - 2, x, y);
      ctx.stroke();
      ctx.fillStyle = '#4a1b0c';
      ctx.beginPath();
      ctx.arc(x, y, 0.9, 0, TAU);
      ctx.fill();
    }
    if (back) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(-24, -24, 48, 48);
    }
  });

const leafSprite = (shape: LeafShape, color: string, back: boolean) =>
  sprite(48, 48, (ctx) => {
    ctx.translate(24, 24);
    const rhodo = shape === 'rhodo';
    const petal = shape === 'petal' || rhodo;

    if (!petal) {
      // Stem
      ctx.strokeStyle = '#5a3216';
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.quadraticCurveTo(1, 16, 3, 21);
      ctx.stroke();
    }

    outline(ctx, shape);
    ctx.fillStyle = color;
    ctx.fill();

    // Everything below is clipped to the leaf
    ctx.save();
    ctx.clip();
    const g = ctx.createLinearGradient(-15, -15, 15, 15);
    if (rhodo) {
      g.addColorStop(0, 'rgba(255,235,240,0.2)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
    } else if (petal) {
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      g.addColorStop(0, 'rgba(255,240,200,0.25)');
      g.addColorStop(1, 'rgba(40,10,0,0.3)');
    }
    ctx.fillStyle = g;
    ctx.fillRect(-24, -24, 48, 48);
    if (rhodo) {
      // Deeper crimson toward the base, freckled throat spots
      const b = ctx.createRadialGradient(0, 15, 0, 0, 15, 22);
      b.addColorStop(0, 'rgba(80,0,15,0.5)');
      b.addColorStop(1, 'rgba(80,0,15,0)');
      ctx.fillStyle = b;
      ctx.fillRect(-24, -24, 48, 48);
      ctx.fillStyle = 'rgba(70,0,12,0.55)';
      for (const [x, y, r] of [[-3, 5, 0.9], [2, 4, 0.8], [0, 1, 1], [-4, 0, 0.7], [4, -1, 0.7], [-1, -3, 0.6], [3, -5, 0.6], [-3, -5, 0.5]]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
    } else if (petal) {
      // Blush at the base
      const b = ctx.createRadialGradient(0, 14, 0, 0, 14, 14);
      b.addColorStop(0, 'rgba(230,80,120,0.45)');
      b.addColorStop(1, 'rgba(230,80,120,0)');
      ctx.fillStyle = b;
      ctx.fillRect(-24, -24, 48, 48);
    }

    // Veins
    ctx.strokeStyle = rhodo ? 'rgba(90,0,20,0.3)' : petal ? 'rgba(200,90,120,0.25)' : 'rgba(60,25,5,0.4)';
    ctx.lineWidth = petal ? 0.6 : 0.8;
    ctx.beginPath();
    if (shape === 'maple') {
      for (const [x, y] of [[0, -18], [16, -9], [-16, -9], [17, 1], [-17, 1]]) {
        ctx.moveTo(0, 9);
        ctx.lineTo(x * 0.85, y * 0.85);
      }
    } else if (rhodo) {
      for (const x of [-11, -6, -2, 2, 6, 11]) {
        ctx.moveTo(0, 14);
        ctx.quadraticCurveTo(x * 0.5, 0, x, -12);
      }
    } else if (petal) {
      for (const x of [-6, -2, 2, 6]) {
        ctx.moveTo(0, 13);
        ctx.quadraticCurveTo(x * 0.6, 0, x, -10);
      }
    } else {
      ctx.moveTo(0, -18);
      ctx.lineTo(0, 13);
      for (let i = 0; i < 5; i++) {
        const y = -12 + i * 5.5;
        ctx.moveTo(0, y + 4);
        ctx.lineTo(8, y - 2);
        ctx.moveTo(0, y + 4);
        ctx.lineTo(-8, y - 2);
      }
    }
    ctx.stroke();

    if (back) {
      // Underside: paler and matte
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(-24, -24, 48, 48);
    }
    ctx.restore();
  });

export const makeLeaves =
  (kind: 'leaves' | 'sakura' | 'laligurans'): EffectFactory =>
  (o) => {
    const lali = kind === 'laligurans';
    const petals = kind === 'sakura' || lali;
    let w = 0;
    let h = 0;
    let t = rand(0, 100);
    const pool: Leaf[] = [];
    const litter = new Litter(60);
    const sprites = spriteCache((key: string) => {
      const [shape, color, back] = key.split('|');
      return shape === 'bloom' ? bloomSprite(color, back === '1') : leafSprite(shape as LeafShape, color, back === '1');
    });

    const palette = () => paletteOr(o.colors, lali ? LALI : petals ? SAKURA : AUTUMN);

    const make = (anywhere: boolean, z = rand(0.55, 1.25)): Leaf => {
      const shape: LeafShape = lali
        ? Math.random() < 0.14
          ? 'bloom'
          : 'rhodo'
        : petals
          ? 'petal'
          : pick<LeafShape>(['maple', 'maple', 'oak', 'beech']);
      const s = (shape === 'bloom' ? rand(16, 21) : lali ? rand(9.5, 13.5) : petals ? rand(6, 9) : rand(11, 17)) * o.size * z;
      const color = pick(palette());
      return {
        x: rand(-20, w + 20),
        y: anywhere ? rand(-h * 0.2, h) : rand(-80, -s * 2),
        vx: 0,
        s,
        z,
        vy: (shape === 'bloom' ? rand(45, 65) : petals ? rand(28, 50) : rand(38, 70)) * z,
        rot: rand(0, TAU),
        vrot: rand(-1.4, 1.4),
        flip: rand(0, TAU),
        vflip: rand(1.5, 3.8) * (shape === 'bloom' ? 0.35 : petals ? 1.3 : 1),
        sway: rand(25, 65) * z,
        phase: rand(0, TAU),
        front: sprites(`${shape}|${color}|0`),
        back: sprites(`${shape}|${color}|1`),
      };
    };

    const sortByDepth = () => pool.sort((a, b) => a.z - b.z);

    return {
      resize(nw, nh) {
        w = nw;
        h = nh;
        const n = countFor(w, h, lali ? 50 : petals ? 70 : 35, o.density);
        while (pool.length < n) pool.push(make(true));
        pool.length = n;
        sortByDepth();
      },
      update(dt) {
        const s = dt * o.speed;
        t += s;
        const g = gust(t, 1.7);
        const wind = o.wind + g * 0.45;
        // Strong gusts lift leaves and set them spinning
        const lift = g > 0.45 ? (g - 0.45) * 1.4 : 0;
        const k = drag(0.97, s);

        for (let i = 0; i < pool.length; i++) {
          const l = pool[i];
          l.phase += 1.1 * s;
          l.flip += l.vflip * (1 + lift * 2) * s;
          l.rot += l.vrot * (1 + lift) * s;
          l.vx *= k;
          l.y += l.vy * (1 - lift * 0.8) * s;
          l.x += (Math.sin(l.phase) * l.sway + wind * 90 * l.z + l.vx) * s;

          if (o.ground && l.y >= h - l.s * 0.3) {
            litter.add(l.x, h, l.s * 2.4, l.front);
            pool[i] = make(false, l.z);
          } else if (l.y - l.s * 2 > h) {
            pool[i] = make(false, l.z);
          }
          const m = l.s * 3;
          if (pool[i].x < -m) pool[i].x += w + m * 2;
          else if (pool[i].x > w + m) pool[i].x -= w + m * 2;
        }

        litter.update(s, o.ground);
      },
      draw(ctx) {
        const m = baseTransform(ctx);
        litter.draw(ctx, m);
        for (const l of pool) {
          const sx = Math.cos(l.flip);
          place(ctx, m, l.x, l.y, l.rot, sx, 1); // tumbling: underside shows when sx < 0
          ctx.globalAlpha = 0.5 + 0.45 * Math.min(1, l.z);
          stamp(ctx, sx < 0 ? l.back : l.front, 0, 0, l.s * 2.4);
        }
        resetTransform(ctx, m);
      },
      burst(x, y) {
        // A puff of air: push nearby leaves away and up
        for (const l of pool) {
          const dx = l.x - x;
          const dy = l.y - y;
          const d = Math.hypot(dx, dy);
          if (d < 200 && d > 0) {
            const f = 1 - d / 200;
            l.vx += (dx / d) * 400 * f;
            l.y -= 30 * f;
            l.vflip = Math.min(l.vflip + 4 * f, 12);
          }
        }
      },
    };
  };

export const leaves = makeLeaves('leaves');
export const sakura = makeLeaves('sakura');
export const laliGurans = makeLeaves('laligurans');
