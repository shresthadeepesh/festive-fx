import type { EffectFactory } from '../types';
import { TAU, baseTransform, clamp, countFor, fillPool, glowSprite, paletteOr, pick, place, rand, resetTransform, retain, sprite, spriteCache, stamp } from '../util';

/** Warm paper tones for sky lanterns (akash deep). */
const LANTERNS = ['#ffb347', '#ff8c42', '#ffd166', '#ff6f3c', '#ffa94d'];
const FLAME_OUTER = '#ff8a1c';
const FLAME_MID = '#ffd23f';

interface Diya {
  x: number;
  seed: number;
}

interface Lantern {
  x: number;
  y: number;
  z: number;
  vy: number;
  sway: number;
  phase: number;
  color: string;
  seed: number;
}

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  seed: number;
}

/** Clay oil lamp: bowl with a pinched spout on the right where the wick sits. */
const diyaSprite = () =>
  sprite(48, 24, (ctx) => {
    ctx.translate(24, 10);
    ctx.beginPath();
    ctx.moveTo(-17, -1);
    ctx.bezierCurveTo(-16, 12, 12, 13, 16, 2);
    ctx.quadraticCurveTo(19, -1, 21, -5); // spout tip
    ctx.quadraticCurveTo(14, -3, 8, -2);
    ctx.quadraticCurveTo(-5, -4, -17, -1);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -4, 0, 12);
    g.addColorStop(0, '#d9622b');
    g.addColorStop(0.5, '#a63c10');
    g.addColorStop(1, '#5e1f05');
    ctx.fillStyle = g;
    ctx.fill();

    // Oil surface glimpsed over the rim
    ctx.fillStyle = '#3b1a06';
    ctx.beginPath();
    ctx.ellipse(-2, -1.5, 13, 2, 0, 0, TAU);
    ctx.fill();

    // Rim highlight
    ctx.strokeStyle = '#f08a4b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-17, -1);
    ctx.quadraticCurveTo(-5, -4, 8, -2);
    ctx.quadraticCurveTo(14, -3, 21, -5);
    ctx.stroke();

    // Painted dot band
    ctx.fillStyle = '#ffd27a';
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(-12 + i * 4, 4.5 + Math.sin(i * 0.9) * 0.4, 0.9, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(-10 + i * 4, 7.5, 0.6, 0, TAU);
      ctx.fill();
    }
  });

/** Paper lantern body: wider top, ribs, bright where the flame lights it from inside. */
const lanternSprite = (color: string) =>
  sprite(32, 40, (ctx) => {
    ctx.translate(16, 20);
    ctx.beginPath();
    ctx.moveTo(-12, -16);
    ctx.lineTo(12, -16);
    ctx.quadraticCurveTo(13, 2, 8, 16);
    ctx.lineTo(-8, 16);
    ctx.quadraticCurveTo(-13, 2, -12, -16);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.save();
    ctx.clip();
    const g = ctx.createRadialGradient(0, 12, 0, 0, 6, 22);
    g.addColorStop(0, 'rgba(255,250,210,0.95)');
    g.addColorStop(0.5, 'rgba(255,220,140,0.35)');
    g.addColorStop(1, 'rgba(120,30,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(-16, -20, 32, 40);
    ctx.strokeStyle = 'rgba(140,50,0,0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const x of [-6, 0, 6]) {
      ctx.moveTo(x * 1.1, -16);
      ctx.lineTo(x * 0.75, 16);
    }
    ctx.moveTo(-13, -4);
    ctx.lineTo(13, -4);
    ctx.stroke();
    ctx.restore();
    // Bottom ring
    ctx.strokeStyle = '#7a2e00';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-8, 16);
    ctx.lineTo(8, 16);
    ctx.stroke();
  });

/** Teardrop flame of height `fh`, tip leaning by `lean`. */
const flamePath = (ctx: CanvasRenderingContext2D, x: number, y: number, fw: number, fh: number, lean: number) => {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x + fw, y - fh * 0.15, x + fw * 0.6 + lean * 0.5, y - fh * 0.7, x + lean, y - fh);
  ctx.bezierCurveTo(x - fw * 0.6 + lean * 0.5, y - fh * 0.7, x - fw, y - fh * 0.15, x, y);
  ctx.fill();
};

export const diyas: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = 0;
  const row: Diya[] = [];
  const lanterns: Lantern[] = [];
  const embers: Ember[] = [];

  const bowl = spriteCache(() => diyaSprite());
  const paper = spriteCache((c: string) => lanternSprite(c));
  const glow = spriteCache((c: string) => glowSprite(c, true, 0.3));

  const palette = () => paletteOr(o.colors, LANTERNS);

  const makeLantern = (anywhere: boolean, x = rand(0, w), y?: number): Lantern => ({
    x,
    y: y ?? (anywhere ? rand(h * 0.1, h * 1.1) : h + rand(30, 200)),
    z: rand(0.6, 1.2),
    vy: rand(18, 34),
    sway: rand(6, 16),
    phase: rand(0, TAU),
    color: pick(palette()),
    seed: rand(0, 100),
  });

  /** Flicker in ~0.8..1.2: two fast sines plus jitter. */
  const flicker = (seed: number) =>
    1 + 0.1 * Math.sin(t * 13 + seed) + 0.07 * Math.sin(t * 29 + seed * 1.7) + rand(-0.04, 0.04);

  const wickY = () => h - 14 * o.size;
  const wick = (d: Diya) => d.x + 13 * o.size;

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      const spacing = 90 * o.size;
      const n = o.ground ? Math.max(1, Math.floor(w / spacing)) : 0;
      const offset = (w - (n - 1) * spacing) / 2;
      while (row.length < n) row.push({ x: 0, seed: rand(0, 100) });
      row.length = n;
      row.forEach((d, i) => (d.x = offset + i * spacing));
      fillPool(lanterns, countFor(w, h, 9, o.density), () => makeLantern(true));
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;

      for (const l of lanterns) {
        l.phase += 0.6 * s;
        // Perspective: lanterns shrink as they climb
        l.y -= l.vy * l.z * s;
        l.x += (Math.sin(l.phase) * l.sway + o.wind * 30) * s;
        if (l.y < -60) Object.assign(l, makeLantern(false));
      }

      if (o.density > 0) {
        for (const d of row) {
          if (embers.length < 220 && Math.random() < 1.8 * o.density * s) {
            const max = rand(1, 2.2);
            embers.push({ x: wick(d), y: wickY() - 14 * o.size, vx: rand(-8, 8), vy: rand(-55, -25), life: max, max, seed: rand(0, TAU) });
          }
        }
      }
      retain(embers, (e) => {
        e.x += (e.vx + Math.sin(t * 3 + e.seed) * 10 + o.wind * 30) * s;
        e.y += e.vy * s;
        return (e.life -= s) > 0;
      });
    },
    draw(ctx) {
      const sz = o.size;

      // Sky lanterns
      for (const l of lanterns) {
        const depth = h > 0 ? l.y / h : 1; // guard: a 0-height surface would give NaN
        const k = l.z * (0.7 + 0.5 * clamp(depth, 0, 1)) * sz;
        const fl = flicker(l.seed);
        const a = clamp(0.35 + 0.65 * depth, 0.3, 1);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.45 * a * fl;
        stamp(ctx, glow(l.color), l.x, l.y + 5 * k, 120 * k);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a;
        const img = paper(l.color);
        if (img) ctx.drawImage(img, l.x - 17 * k, l.y - 21 * k, 34 * k, 42 * k);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * fl;
        stamp(ctx, glow(FLAME_MID), l.x, l.y + 17 * k, 12 * k);
      }

      // Embers
      ctx.globalCompositeOperation = 'lighter';
      for (const e of embers) {
        const k = e.life / e.max;
        ctx.globalAlpha = k * (Math.random() < 0.15 ? 0.3 : 0.9);
        stamp(ctx, glow(FLAME_OUTER), e.x, e.y, 5 * sz);
      }

      if (!row.length) return;
      const wy = wickY();
      const lean = Math.sin(t * 2.3) * 1.5 + o.wind * 5;

      // Warm pool of light on the ground
      const m = baseTransform(ctx);
      const pool = glow(FLAME_OUTER);
      for (const d of row) {
        const fl = flicker(d.seed);
        ctx.globalAlpha = 0.35 * fl;
        place(ctx, m, wick(d), h - 4, 0, 1, 0.35);
        stamp(ctx, pool, 0, 0, 120 * sz * fl);
      }
      resetTransform(ctx, m);

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const b = bowl('');
      for (const d of row) if (b) ctx.drawImage(b, d.x - 24 * sz, h - 20 * sz, 48 * sz, 24 * sz);

      for (const d of row) {
        const fl = flicker(d.seed);
        const x = wick(d);
        const fh = 20 * sz * fl;
        const ln = lean + Math.sin(t * 7 + d.seed) * 1.2;
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = FLAME_OUTER;
        flamePath(ctx, x, wy, 5 * sz, fh, ln);
        ctx.fillStyle = FLAME_MID;
        flamePath(ctx, x, wy - 1, 3.5 * sz, fh * 0.72, ln * 0.8);
        ctx.fillStyle = '#fff8e0';
        flamePath(ctx, x, wy - 1.5, 2 * sz, fh * 0.42, ln * 0.6);
        // Blue base where the flame meets the wick
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#8fc8ff';
        ctx.beginPath();
        ctx.ellipse(x, wy - 1, 1.6 * sz, 2.2 * sz, 0, 0, TAU);
        ctx.fill();
        // Halo
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 * fl;
        stamp(ctx, glow(FLAME_OUTER), x + ln * 0.5, wy - fh * 0.45, 70 * sz * fl);
      }
    },
    burst(x, y) {
      lanterns.push(makeLantern(false, x, y));
      if (lanterns.length > 60) lanterns.shift();
    },
  };
};
