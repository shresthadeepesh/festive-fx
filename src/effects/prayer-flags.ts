import type { EffectFactory } from '../types';
import { TAU, clamp, countFor, gust, paletteOr, rand, retain, shade } from '../util';

/** Lungta order: blue (sky), white (air), red (fire), green (water), yellow (earth). */
const LUNGTA = ['#1f5fbf', '#f4f1e8', '#c8102e', '#1f8a3b', '#f2c200'];
const THREAD = 'rgba(232,222,200,0.75)';
const INK = 'rgba(25,12,4,0.28)';

/** Vertical cloth strips per flag; more = smoother ripples. */
const STRIPS = 6;
/** Numbers stored per strip polygon: 6 points (x, y). */
const STRIP_LEN = 12;
/** Depths (0 top .. 1 free edge) of the printed script lines. */
const PRINT_ROWS = [0.3, 0.68, 0.79, 0.9];

interface Flag {
  /** Left edge position along the string, 0..1. */
  u0: number;
  u1: number;
  color: string;
  seed: number;
  /** Sun-faded (negative, lighter) or deeper tone, per flag. */
  fade: number;
}

interface Ripple {
  u: number;
  dir: number;
  life: number;
}

interface Line {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  sag: number;
  seed: number;
  flags: Flag[];
  ripples: Ripple[];
}

export const prayerFlags: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = rand(0, 100);
  let lines: Line[] = [];
  let built = '';

  // Per-frame strip geometry and colour groups, reused between frames
  let geo = new Float32Array(0);
  let inkLines = new Float32Array(0);
  let inkRings = new Float32Array(0);
  /** Column points for the current flag: (STRIPS + 1) columns x 3 rows x (x, y). */
  const cols = new Float32Array((STRIPS + 1) * 6);
  const groups = new Map<string, number[]>();

  const palette = () => paletteOr(o.colors, LUNGTA);
  const fw = () => 22 * o.size;
  const fh = () => 30 * o.size;

  const build = () => {
    const n = o.density > 0 && w >= 60 && h >= 60 ? Math.max(1, countFor(w, h, 1.8, o.density)) : 0;
    const key = `${w}x${h}x${n}x${o.size}x${palette().join()}`;
    if (key === built) return;
    built = key;
    const pal = palette();
    lines = [];
    for (let i = 0; i < n; i++) {
      // Spread strings down the top third, alternating which side hangs lower
      const band = (i + 0.5) / n;
      const x0 = i % 2 ? rand(-20, w * 0.18) : -20;
      const x1 = i % 2 ? w + 20 : rand(w * 0.82, w + 20);
      const span = x1 - x0;
      const yBase = h * (0.03 + band * 0.24);
      const line: Line = {
        x0,
        y0: yBase + rand(-0.04, 0.04) * h,
        x1,
        y1: yBase + rand(-0.04, 0.04) * h,
        sag: Math.min(span * rand(0.05, 0.09), h * 0.2),
        seed: rand(0, TAU),
        flags: [],
        ripples: [],
      };
      const step = (fw() + 4 * o.size) / span;
      const width = fw() / span;
      let c = (Math.random() * pal.length) | 0;
      for (let u = step * 0.5; u + width < 1 - step * 0.3; u += step) {
        line.flags.push({ u0: u, u1: u + width, color: pal[c++ % pal.length], seed: rand(0, TAU), fade: rand(-0.22, 0.06) });
      }
      lines.push(line);
    }
  };

  /** Point on the swagged string at u (0..1). */
  const at = (l: Line, u: number, sagNow: number) => [
    l.x0 + (l.x1 - l.x0) * u,
    l.y0 + (l.y1 - l.y0) * u + sagNow * 4 * u * (1 - u),
  ];

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      build();
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;
      for (const l of lines) {
        retain(l.ripples, (r) => {
          r.u += r.dir * 0.55 * s;
          return (r.life -= s) > 0 && r.u > -0.1 && r.u < 1.1;
        });
      }
    },
    draw(ctx) {
      if (!lines.length) return;
      const g = gust(t, 3.1);
      // Breeze sets the lean; gusts add flutter energy
      const energy = clamp(0.45 + Math.abs(o.wind) * 0.55 + Math.max(0, g) * 0.7, 0, 1.4);
      const lean = clamp((o.wind + g * 0.35) * 1.15, -1.25, 1.25);
      const FW = fw();
      const FH = fh();

      let strips = 0;
      for (const l of lines) strips += l.flags.length * STRIPS;
      if (geo.length < strips * STRIP_LEN) geo = new Float32Array(strips * STRIP_LEN);

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Pass 1: cloth geometry, bucketed by shaded colour. Hot loop: no
      // allocations, each column computed once and shared by two strips.
      const flags = strips / STRIPS;
      if (inkLines.length < flags * 24) inkLines = new Float32Array(flags * 24);
      if (inkRings.length < flags * 3) inkRings = new Float32Array(flags * 3);
      let nLines = 0;
      let nRings = 0;
      let k = 0;

      // Current flag's frame, read by pt()
      let L: Line = lines[0];
      let F: Flag = L.flags[0];
      let sagNow = 0;
      let e = 0;
      let dx = 0;
      let dy = 1;
      let omega = 0;
      let amp = 0;
      let pX = 0;
      let pY = 0;
      /** Cloth point at column c (0..1) and depth v (0 top .. 1 free edge) into pX, pY. */
      const pt = (c: number, v: number) => {
        const u = F.u0 + (F.u1 - F.u0) * c;
        const tx = L.x0 + (L.x1 - L.x0) * u;
        const ty = L.y0 + (L.y1 - L.y0) * u + sagNow * 4 * u * (1 - u);
        const wave = Math.sin(t * omega - v * 4.2 - c * 2.4 + F.seed);
        const len = FH * v * (1 - 0.08 * e * Math.abs(wave));
        const off = amp * v * wave;
        // Normal to the hang direction is (dy, -dx)
        pX = tx + dx * len + dy * off;
        pY = ty + dy * len - dx * off;
      };

      for (const l of lines) {
        L = l;
        sagNow = l.sag * (1 + 0.05 * Math.sin(t * 0.7 + l.seed));
        for (const f of l.flags) {
          F = f;
          // Burst ripple running along the string boosts nearby flags
          let boost = 0;
          for (const r of l.ripples) {
            const d = (f.u0 - r.u) / 0.05;
            boost += Math.exp(-d * d) * Math.min(1, r.life) * 1.6;
          }
          e = energy + boost;
          const theta = lean * (0.55 + 0.45 * Math.min(1, e)) + Math.sin(t * 1.9 + f.seed) * 0.1 * e;
          dx = Math.sin(theta);
          dy = Math.cos(theta);
          omega = 5 + 6 * Math.min(1.5, e);
          amp = FW * 0.22 * e;

          for (let c = 0; c <= STRIPS; c++) {
            for (let r = 0; r < 3; r++) {
              pt(c / STRIPS, r * 0.5);
              cols[c * 6 + r * 2] = pX;
              cols[c * 6 + r * 2 + 1] = pY;
            }
          }
          const ec = Math.min(1, e);
          for (let j = 0; j < STRIPS; j++) {
            const b = k * STRIP_LEN;
            const a = j * 6;
            const n = a + 6;
            // Down the left column, back up the right one
            geo[b] = cols[a];
            geo[b + 1] = cols[a + 1];
            geo[b + 2] = cols[a + 2];
            geo[b + 3] = cols[a + 3];
            geo[b + 4] = cols[a + 4];
            geo[b + 5] = cols[a + 5];
            geo[b + 6] = cols[n + 4];
            geo[b + 7] = cols[n + 5];
            geo[b + 8] = cols[n + 2];
            geo[b + 9] = cols[n + 3];
            geo[b + 10] = cols[n];
            geo[b + 11] = cols[n + 1];
            // Shade by the wave's slope: folds turning away go darker
            const slope = Math.cos(t * omega - 2.52 - ((2 * j + 1) / STRIPS) * 1.2 + f.seed);
            const color = shade(f.color, f.fade + slope * 0.4 * ec + (j === 0 ? 0.06 : 0));
            let list = groups.get(color);
            if (!list) groups.set(color, (list = []));
            list.push(k);
            k++;
          }

          // Printed prayers: faded lines of script and a wind-horse roundel
          if (FW > 9) {
            for (const v of PRINT_ROWS) {
              const o6 = nLines * 6;
              pt(0.18, v);
              inkLines[o6] = pX;
              inkLines[o6 + 1] = pY;
              pt(0.5, v);
              inkLines[o6 + 2] = pX;
              inkLines[o6 + 3] = pY;
              pt(0.82, v);
              inkLines[o6 + 4] = pX;
              inkLines[o6 + 5] = pY;
              nLines++;
            }
            pt(0.5, 0.47);
            inkRings[nRings * 3] = pX;
            inkRings[nRings * 3 + 1] = pY;
            inkRings[nRings * 3 + 2] = FW * 0.15;
            nRings++;
          }
        }
      }

      groups.forEach((list, color) => {
        if (!list.length) return;
        ctx.fillStyle = color;
        ctx.beginPath();
        for (const idx of list) {
          const b = idx * STRIP_LEN;
          ctx.moveTo(geo[b], geo[b + 1]);
          for (let q = 1; q < 6; q++) ctx.lineTo(geo[b + q * 2], geo[b + q * 2 + 1]);
          ctx.closePath();
        }
        ctx.fill();
        list.length = 0;
      });

      if (nLines || nRings) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(0.6, 0.9 * o.size);
        ctx.beginPath();
        for (let i = 0; i < nLines; i++) {
          const b = i * 6;
          ctx.moveTo(inkLines[b], inkLines[b + 1]);
          ctx.lineTo(inkLines[b + 2], inkLines[b + 3]);
          ctx.lineTo(inkLines[b + 4], inkLines[b + 5]);
        }
        for (let i = 0; i < nRings; i++) {
          const b = i * 3;
          ctx.moveTo(inkRings[b] + inkRings[b + 2], inkRings[b + 1]);
          ctx.arc(inkRings[b], inkRings[b + 1], inkRings[b + 2], 0, TAU);
        }
        ctx.stroke();
      }

      // Threads over the top hems
      ctx.strokeStyle = THREAD;
      ctx.lineWidth = Math.max(0.8, 1.1 * o.size);
      ctx.beginPath();
      for (const l of lines) {
        const sagNow = l.sag * (1 + 0.05 * Math.sin(t * 0.7 + l.seed));
        for (let i = 0; i <= 32; i++) {
          const [x, y] = at(l, i / 32, sagNow);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    },
    burst(x, y) {
      // A gust ripple that runs both ways along the nearest string
      let best: Line | null = null;
      let bd = 160 * o.size;
      for (const l of lines) {
        const u = clamp((x - l.x0) / (l.x1 - l.x0 || 1), 0, 1);
        const sagNow = l.sag * (1 + 0.05 * Math.sin(t * 0.7 + l.seed));
        const d = Math.abs(at(l, u, sagNow)[1] + fh() * 0.5 - y);
        if (d < bd) {
          bd = d;
          best = l;
        }
      }
      if (!best) return;
      const u = clamp((x - best.x0) / (best.x1 - best.x0 || 1), 0, 1);
      best.ripples.push({ u, dir: 1, life: 2.2 }, { u, dir: -1, life: 2.2 });
    },
  };
};
