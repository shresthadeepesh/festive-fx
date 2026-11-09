import type { EffectFactory } from '../types';
import { TAU, baseTransform, clamp, countFor, pick, place, rand, resetTransform, sprite, spriteCache } from '../util';

const PAPER = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#fb8c00', '#00acc1', '#f5f5f5', '#d81b60'];
const PATTERNS = ['split', 'band', 'top', 'eye', 'quarter'] as const;
type Pattern = (typeof PATTERNS)[number];

type State = 'launching' | 'flying' | 'cut';

interface Kite {
  state: State;
  /** Where it hovers when flying. */
  bx: number;
  by: number;
  /** Current position and tilt. */
  x: number;
  y: number;
  rot: number;
  z: number;
  /** Off-screen flyer the string runs to. */
  ax: number;
  look: string;
  seeds: number[];
  /** launching: 0..1 progress (negative = waiting to launch). */
  progress: number;
  /** Seconds left in a loop-the-loop dive; 0 = none. */
  dive: number;
  diveDir: number;
  vx: number;
  vy: number;
  spin: number;
}

/** Diamond kite, 40x48 sprite, centred at (20, 22). */
const kiteSprite = (look: string) =>
  sprite(40, 50, (ctx) => {
    const [a, b, pattern] = look.split('|') as [string, string, Pattern];
    ctx.translate(20, 22);
    const diamond = () => {
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(18, 0);
      ctx.lineTo(0, 21);
      ctx.lineTo(-18, 0);
      ctx.closePath();
    };
    // Tail tassels
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.moveTo(0, 20);
    ctx.lineTo(-4, 27);
    ctx.lineTo(0, 25);
    ctx.lineTo(4, 27);
    ctx.closePath();
    ctx.fill();

    diamond();
    ctx.fillStyle = a;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = b;
    switch (pattern) {
      case 'split':
        ctx.fillRect(0, -22, 20, 44);
        break;
      case 'band':
        ctx.fillRect(-20, -4, 40, 8);
        break;
      case 'top':
        ctx.fillRect(-20, -22, 40, 22);
        break;
      case 'eye':
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, TAU);
        ctx.fill();
        ctx.fillStyle = a;
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, TAU);
        ctx.fill();
        break;
      case 'quarter':
        ctx.fillRect(0, -22, 20, 22);
        ctx.fillRect(-20, 0, 20, 22);
        break;
    }
    // Paper sheen
    const g = ctx.createLinearGradient(-18, -20, 18, 20);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = g;
    ctx.fillRect(-20, -22, 40, 44);
    ctx.restore();

    // Bamboo spine and bow
    ctx.strokeStyle = 'rgba(70,40,15,0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(0, 21);
    ctx.moveTo(-18, 0);
    ctx.quadraticCurveTo(0, -9, 18, 0);
    ctx.stroke();
    diamond();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.stroke();
  });

export const kites: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = 0;
  const flock: Kite[] = [];
  const sprites = spriteCache((look: string) => kiteSprite(look));

  const palette = () => (o.colors && o.colors.length >= 2 ? o.colors : PAPER);

  const make = (slot: number, of: number, state: State, delay = 0): Kite => {
    const by = rand(h * 0.12, h * 0.5);
    // Higher kites are farther away, so smaller
    const z = clamp(0.6 + (by / h) * 1.1, 0.6, 1.15);
    const bx = (w * (slot + 0.5)) / Math.max(1, of) + rand(-40, 40);
    const pal = palette();
    const a = pick(pal);
    let b = pick(pal);
    while (b === a && pal.length > 1) b = pick(pal);
    return {
      state,
      bx,
      by,
      x: bx,
      y: state === 'launching' ? h + 60 : by,
      rot: 0,
      z,
      ax: clamp(bx + rand(-w * 0.25, w * 0.25) - o.wind * w * 0.2, -w * 0.2, w * 1.2),
      look: `${a}|${b}|${pick(PATTERNS)}`,
      seeds: Array.from({ length: 8 }, () => rand(0, TAU)),
      progress: -delay,
      dive: 0,
      diveDir: 1,
      vx: 0,
      vy: 0,
      spin: 0,
    };
  };

  const cut = (k: Kite) => {
    k.state = 'cut';
    k.vx = o.wind * 40 + rand(20, 45) * (Math.random() < 0.5 ? -1 : 1);
    k.vy = rand(4, 16);
    k.spin = rand(-0.8, 0.8);
  };

  const target = () => countFor(w, h, 5, o.density);

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      const n = target();
      while (flock.length < n) flock.push(make(flock.length, n, 'flying'));
      flock.length = n;
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;
      const n = flock.length;

      flock.forEach((k, i) => {
        const [p1, p2, p3, p4, f1, f2, f3, f4] = k.seeds;
        if (k.state === 'cut') {
          // Free kite: drifts downwind, sinking and fluttering
          k.vx += (o.wind * 50 - k.vx * 0.2) * s;
          k.x += k.vx * s;
          k.y += k.vy * s;
          k.rot = Math.sin(t * 3 + p1) * 0.6 + k.spin * t;
          if (k.y > h + 80 || k.x < -120 || k.x > w + 120) flock[i] = make(i, n, 'launching', rand(1.5, 4));
          return;
        }

        // Hover pattern: two horizontal sines and one vertical, per-kite tempo
        let hx = k.bx + (Math.sin(t * (0.3 + f1 * 0.05) + p1) * 30 + Math.sin(t * (0.9 + f2 * 0.05) + p2) * 10) * k.z;
        let hy = k.by + Math.sin(t * (0.5 + f3 * 0.05) + p3) * 16 * k.z;
        let rot = Math.sin(t * (1.3 + f4 * 0.1) + p4) * 0.22 + o.wind * 0.3;

        if (k.dive > 0) {
          // Loop-the-loop, like a fighter kite in a manja duel
          k.dive -= s;
          const theta = k.diveDir * TAU * (1 - k.dive / 1.6);
          const R = 45 * k.z;
          hx += Math.sin(theta) * R;
          hy += (1 - Math.cos(theta)) * R;
          rot += theta;
        } else if (k.state === 'flying' && Math.random() < 0.035 * s) {
          k.dive = 1.6;
          k.diveDir = Math.random() < 0.5 ? -1 : 1;
        }

        if (k.state === 'launching') {
          k.progress += s / 3.5;
          if (k.progress < 0) {
            k.y = h + 60;
            return;
          }
          const e = 1 - Math.pow(1 - Math.min(1, k.progress), 3);
          k.x = k.ax + (hx - k.ax) * e;
          k.y = h + 60 + (hy - h - 60) * e;
          k.rot = rot * e + Math.sin(t * 8) * 0.3 * (1 - e);
          if (k.progress >= 1) k.state = 'flying';
          return;
        }

        k.x = hx;
        k.y = hy;
        k.rot = rot;
        // Now and then someone wins a duel: "chet!"
        if (o.density > 0 && Math.random() < 0.012 * o.density * s) cut(k);
      });
    },
    draw(ctx) {
      const m = baseTransform(ctx);
      const size = 46 * o.size;
      ctx.lineCap = 'round';
      for (const k of flock) {
        if (k.state === 'launching' && k.progress < 0) continue;
        const d = size * k.z;
        // Bridle point, a little below centre
        const bx = k.x - Math.sin(k.rot) * d * 0.1;
        const by = k.y + Math.cos(k.rot) * d * 0.1;
        // Mid-tone so the string reads on both day and night skies
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#8f8576';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        if (k.state === 'cut') {
          // Loose string trailing below
          ctx.moveTo(bx, by);
          for (let i = 1; i <= 8; i++) {
            ctx.lineTo(bx + Math.sin(t * 4 + i * 0.8) * 4 * (i / 8) - k.vx * 0.04 * i, by + i * 9);
          }
        } else {
          const ay = h + 60;
          const cx = (bx + k.ax) / 2 + o.wind * 40;
          const cy = (by + ay) / 2 + 50 * k.z; // catenary-ish sag
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(cx, cy, k.ax, ay);
        }
        ctx.stroke();

        place(ctx, m, k.x, k.y, k.rot);
        ctx.globalAlpha = 1;
        const img = sprites(k.look);
        if (img) ctx.drawImage(img, -d * 0.5, -d * 0.55, d, d * 1.25);
        resetTransform(ctx, m);
      }
    },
    burst(x, y) {
      let best: Kite | null = null;
      let bd = 140 * o.size;
      for (const k of flock) {
        if (k.state === 'cut') continue;
        const d = Math.hypot(k.x - x, k.y - y);
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      if (best) cut(best);
      else if (flock.length < Math.max(2, target() * 2)) {
        const k = make(flock.length, Math.max(1, flock.length), 'launching');
        k.bx = x;
        k.by = clamp(y, h * 0.1, h * 0.6);
        k.ax = x + rand(-60, 60);
        flock.push(k);
      }
    },
  };
};
