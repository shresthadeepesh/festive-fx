import type { EffectFactory } from '../types';
import {
  TAU,
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
  spriteCache,
  stamp,
} from '../util';

const GOLD = ['#ffd76a', '#ffc23d', '#ffe08f', '#ffb52e', '#fff3c4'];
const CONFETTI = ['#ffd76a', '#ffc23d', '#f5f5f5', '#e8c46a', '#fff3c4'];

/** One show, in seconds at speed 1. */
const CYCLE = 9.5;
const HOLD_END = 5.6;
const GLITTER_AT = 6.2;

/** 5x7 dot-matrix digits: fallback when the browser can't rasterise text. */
const DOTS: Record<string, string[]> = {
  '0': [' ### ', '#   #', '#  ##', '# # #', '##  #', '#   #', ' ### '],
  '1': ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
  '2': [' ### ', '#   #', '    #', '   # ', '  #  ', ' #   ', '#####'],
  '3': ['#####', '   # ', '  #  ', '   # ', '    #', '#   #', ' ### '],
  '4': ['   # ', '  ## ', ' # # ', '#  # ', '#####', '   # ', '   # '],
  '5': ['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### '],
  '6': ['  ## ', ' #   ', '#    ', '#### ', '#   #', '#   #', ' ### '],
  '7': ['#####', '    #', '   # ', '  #  ', ' #   ', ' #   ', ' #   '],
  '8': [' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### '],
  '9': [' ### ', '#   #', '#   #', ' ####', '    #', '   # ', ' ##  '],
};

type Pt = [number, number];

interface Rocket {
  x0: number;
  x: number;
  y: number;
  bx: number;
  by: number;
  delay: number;
  age: number;
  dur: number;
  trail: number[];
  targets: Pt[];
}

interface Dot {
  x: number;
  y: number;
  px: number;
  py: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  u: number;
  dur: number;
  arc: number;
  /** 0 flying to its spot, 1 holding the letter, 2 falling away. */
  mode: 0 | 1 | 2;
  vx: number;
  vy: number;
  life: number;
  color: string;
  seed: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}

interface Glitter {
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
}

/** Rasterise `text` and sample lit pixels; null when the canvas can't do it. */
const sampleText = (text: string, w: number, cy: number, maxH: number, step0: number): Pt[] | null => {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const font = (px: number) => `900 ${px}px "Arial Black", "Helvetica Neue", Impact, system-ui, sans-serif`;
    let fs = maxH;
    ctx.font = font(fs);
    const mw0 = ctx.measureText(text).width;
    if (!(mw0 > 0)) return null;
    fs = Math.min(fs, (fs * w * 0.84) / mw0);
    ctx.font = font(fs);
    const mw = ctx.measureText(text).width;
    if (!(mw > 0) || !(fs > 4)) return null;
    const cw = Math.ceil(mw + fs * 0.3);
    const ch = Math.ceil(fs * 1.3);
    c.width = cw;
    c.height = ch;
    ctx.font = font(fs);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(text, cw / 2, ch / 2);
    const data = ctx.getImageData(0, 0, cw, ch)?.data;
    if (!data || !data.length) return null;
    const step = Math.max(step0, fs / 20);
    const out: Pt[] = [];
    for (let y = step / 2; y < ch; y += step) {
      for (let x = step / 2; x < cw; x += step) {
        const jx = x + rand(-step * 0.25, step * 0.25);
        const jy = y + rand(-step * 0.25, step * 0.25);
        const i = ((jy | 0) * cw + (jx | 0)) * 4 + 3;
        if (data[i] > 140) out.push([w / 2 - cw / 2 + jx, cy - ch / 2 + jy]);
      }
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
};

/** Dot-matrix fallback: only digits render, other characters leave a gap. */
const dotText = (text: string, w: number, cy: number, maxH: number): Pt[] => {
  const cols = Math.max(1, text.length * 6 - 1);
  const cell = Math.min((w * 0.84) / cols, maxH / 7);
  if (!(cell > 0)) return [];
  const left = w / 2 - (cols * cell) / 2;
  const top = cy - (7 * cell) / 2;
  const out: Pt[] = [];
  [...text].forEach((ch, i) => {
    const rows = DOTS[ch];
    if (!rows) return;
    rows.forEach((row, r) => {
      for (let c = 0; c < 5; c++) {
        if (row[c] !== '#') continue;
        // Four sub-dots per cell keep the strokes solid
        for (const [ox, oy] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) {
          out.push([left + (i * 6 + c + ox) * cell, top + (r + oy) * cell]);
        }
      }
    });
  });
  return out;
};

export const newyear: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = 0;
  /** Seconds into the current show; starts so the first rockets go up quickly. */
  let clock = CYCLE - 0.4;
  // Start "done" so the pre-roll before the first show doesn't fire them
  let glitterDone = true;
  let fallDone = true;
  let targets: Pt[] = [];
  let targetKey = '';
  const rockets: Rocket[] = [];
  const dots: Dot[] = [];
  const sparks: Spark[] = [];
  const glitter: Glitter[] = [];

  const glow = spriteCache((c: string) => glowSprite(c, true, 0.25));
  const halo = spriteCache((c: string) => glowSprite(c, false, 0.2));

  const palette = () => paletteOr(o.colors, GOLD);
  const text = () => o.text ?? String(new Date().getFullYear());
  const textY = () => h * 0.42;

  const refreshTargets = () => {
    const s = text();
    const key = `${s}|${w}|${h}|${o.size}|${o.density}`;
    if (key === targetKey) return;
    targetKey = key;
    if (w < 40 || h < 40) {
      targets = [];
      return;
    }
    const maxH = Math.min(h * 0.4, w * 0.5);
    const step = clamp(4 / Math.sqrt(Math.max(0.25, o.density)), 3, 9);
    let pts = sampleText(s, w, textY(), maxH, step) ?? dotText(s, w, textY(), maxH);
    const cap = Math.round(750 * clamp(o.density, 0.5, 2));
    if (pts.length > cap) {
      // Even thinning keeps the letter shapes readable
      const keep = cap / pts.length;
      pts = pts.filter((_, i) => Math.floor(i * keep) !== Math.floor((i - 1) * keep));
    }
    targets = pts;
  };

  const spark = (x: number, y: number, power: number, n: number, colors: readonly string[]) => {
    for (let i = 0; i < n && sparks.length < 1500; i++) {
      const a = rand(0, TAU);
      const v = Math.sqrt(Math.random()) * power;
      const max = rand(0.7, 1.4);
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, color: pick(colors) });
    }
  };

  const confetti = (x: number, y: number, n: number) => {
    const k = clamp(h / 700, 0.6, 1.4);
    for (let i = 0; i < n && glitter.length < 900; i++) {
      const a = -Math.PI / 2 + rand(-1.3, 1.3);
      const v = rand(160, 520) * k;
      const size = rand(4, 8) * o.size;
      glitter.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        rot: rand(0, TAU),
        vrot: rand(-6, 6),
        tilt: rand(0, TAU),
        vtilt: rand(4, 10),
        w: size,
        h: size * rand(0.4, 0.7),
        color: pick(paletteOr(o.colors, CONFETTI)),
        life: rand(3, 4.5),
      });
    }
  };

  const startShow = () => {
    refreshTargets();
    glitterDone = false;
    fallDone = false;
    if (!targets.length) {
      // Too small for text: a couple of plain rockets still make a show
      for (let i = 0; i < 2; i++) {
        rockets.push({ x0: w * (0.3 + 0.4 * i), x: 0, y: h, bx: w * (0.3 + 0.4 * i), by: h * 0.35, delay: i * 0.3, age: 0, dur: 1.1, trail: [], targets: [] });
      }
      return;
    }
    const sorted = [...targets].sort((a, b) => a[0] - b[0]);
    const n = clamp(Math.round(sorted.length / 80), 4, 9);
    const chunk = Math.ceil(sorted.length / n);
    for (let i = 0; i < n; i++) {
      const group = sorted.slice(i * chunk, (i + 1) * chunk);
      if (!group.length) continue;
      const gx = group.reduce((s, p) => s + p[0], 0) / group.length;
      rockets.push({
        x0: gx + rand(-30, 30),
        x: gx,
        y: h + 6,
        bx: gx + rand(-20, 20),
        by: textY() + rand(-h * 0.07, h * 0.07),
        delay: rand(0, 0.45),
        age: 0,
        dur: rand(1, 1.25),
        trail: [],
        targets: group,
      });
    }
  };

  const explode = (r: Rocket) => {
    const pal = palette();
    spark(r.x, r.y, 140 * o.size, 26, pal);
    for (const [tx, ty] of r.targets) {
      dots.push({
        x: r.x,
        y: r.y,
        px: r.x,
        py: r.y,
        sx: r.x,
        sy: r.y,
        tx,
        ty,
        u: 0,
        dur: rand(0.8, 1.25),
        arc: rand(-45, 45) * o.size,
        mode: 0,
        vx: 0,
        vy: 0,
        life: rand(1.4, 2.2),
        color: Math.random() < 0.12 ? '#ffffff' : pick(pal),
        seed: rand(0, TAU),
      });
    }
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      targetKey = '';
    },
    update(dt) {
      const s = dt * o.speed;
      t += s;

      if (o.density > 0 && w > 0 && h > 0) {
        clock += s;
        if (clock >= CYCLE) {
          clock = 0;
          startShow();
        }
        if (!fallDone && clock >= HOLD_END) {
          fallDone = true;
          for (const d of dots) {
            if (d.mode === 2) continue;
            d.mode = 2;
            d.vx = rand(-35, 35);
            d.vy = rand(-50, 10);
          }
        }
        if (!glitterDone && clock >= GLITTER_AT) {
          glitterDone = true;
          confetti(w / 2, textY() + h * 0.05, Math.round(170 * clamp(o.density, 0.5, 2)));
          spark(w / 2, textY(), 260 * o.size, 70, palette());
        }
      }

      retain(rockets, (r) => {
        if (r.delay > 0) {
          r.delay -= s;
          return true;
        }
        r.age += s;
        const p = Math.min(1, r.age / r.dur);
        const e = 1 - (1 - p) * (1 - p);
        r.x = r.x0 + (r.bx - r.x0) * e + Math.sin(r.age * 20) * 1.5;
        r.y = h + 6 + (r.by - h - 6) * e;
        r.trail.push(r.x, r.y);
        if (r.trail.length > 28) r.trail.splice(0, 2);
        if (p < 1) return true;
        explode(r);
        return false;
      });

      const k = drag(0.97, s);
      retain(dots, (d) => {
        d.px = d.x;
        d.py = d.y;
        if (d.mode === 0) {
          d.u = Math.min(1, d.u + s / d.dur);
          const e = 1 - Math.pow(1 - d.u, 3);
          const nx = -(d.ty - d.sy);
          const ny = d.tx - d.sx;
          const len = Math.hypot(nx, ny) || 1;
          const bend = Math.sin(Math.PI * e) * d.arc;
          d.x = d.sx + (d.tx - d.sx) * e + (nx / len) * bend;
          d.y = d.sy + (d.ty - d.sy) * e + (ny / len) * bend;
          if (d.u >= 1) d.mode = 1;
          return true;
        }
        if (d.mode === 1) {
          // Gentle shimmer while holding the letter
          d.x = d.tx + Math.sin(t * 3 + d.seed) * 0.6;
          d.y = d.ty + Math.cos(t * 2.6 + d.seed) * 0.6;
          return true;
        }
        d.vx = d.vx * k + o.wind * 30 * s;
        d.vy = d.vy * k + 160 * s;
        d.x += d.vx * s;
        d.y += d.vy * s;
        return (d.life -= s) > 0;
      });

      const ks = drag(0.965, s);
      retain(sparks, (p) => {
        p.vx = p.vx * ks + o.wind * 20 * s;
        p.vy = p.vy * ks + 110 * s;
        p.x += p.vx * s;
        p.y += p.vy * s;
        return (p.life -= s) > 0;
      });

      const kg = drag(0.985, s);
      retain(glitter, (g) => {
        g.tilt += g.vtilt * s;
        g.rot += g.vrot * s;
        g.vx = g.vx * kg + o.wind * 60 * s;
        g.vy = Math.min(g.vy * kg + 480 * s, 130);
        g.x += (g.vx + Math.sin(g.tilt) * 20) * s;
        g.y += g.vy * s;
        return (g.life -= s) > 0 && g.y < h + 30;
      });
    },
    draw(ctx) {
      const k = o.size;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';

      // Rockets: gold trail and a hot head
      for (const r of rockets) {
        if (r.delay > 0 || r.trail.length < 4) continue;
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#ffc23d';
        ctx.lineWidth = 1.6 * k;
        ctx.beginPath();
        ctx.moveTo(r.trail[0], r.trail[1]);
        for (let i = 2; i < r.trail.length; i += 2) ctx.lineTo(r.trail[i], r.trail[i + 1]);
        ctx.stroke();
        ctx.globalAlpha = 1;
        stamp(ctx, glow('#ffd76a'), r.x, r.y, 14 * k);
      }

      // Streaks behind dots still flying to their letter
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = '#ffd76a';
      ctx.lineWidth = 1.4 * k;
      ctx.beginPath();
      let flying = false;
      for (const d of dots) {
        if (d.mode !== 0) continue;
        flying = true;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - (d.x - d.px) * 3, d.y - (d.y - d.py) * 3);
      }
      if (flying) ctx.stroke();

      for (const d of dots) {
        let a = 0.75 + 0.25 * Math.sin(t * 7 + d.seed * 3);
        let size = 6 * k;
        if (d.mode === 1 && Math.sin(t * 2.1 + d.seed * 11) > 0.985) {
          a = 1;
          size *= 2.2; // occasional sparkle
        }
        if (d.mode === 2) a *= Math.min(1, d.life / 0.8);
        ctx.globalAlpha = a * 0.5;
        stamp(ctx, halo(d.color), d.x, d.y, size * 2.2);
        ctx.globalAlpha = a;
        stamp(ctx, glow(d.color), d.x, d.y, size);
      }

      for (const p of sparks) {
        const l = p.life / p.max;
        ctx.globalAlpha = (l < 0.3 ? l / 0.3 : 1) * (Math.random() < 0.15 ? 0.3 : 1);
        stamp(ctx, glow(p.color), p.x, p.y, 7 * k);
      }

      // Foil confetti: one transform per piece, pre-shaded flip
      if (glitter.length) {
        ctx.globalCompositeOperation = 'source-over';
        const m = baseTransform(ctx);
        for (const g of glitter) {
          const f = Math.cos(g.tilt);
          const af = Math.abs(f);
          ctx.globalAlpha = Math.min(1, g.life / 0.6);
          ctx.fillStyle = shade(g.color, af > 0.9 ? -(af - 0.9) * 6 : f < 0 ? 0.35 : 0.25 * (1 - af));
          place(ctx, m, g.x, g.y, g.rot, 1, f);
          ctx.fillRect(-g.w / 2, -g.h / 2, g.w, g.h);
        }
        resetTransform(ctx, m);
      }
    },
    burst(x, y) {
      spark(x, y, 220 * o.size, 80, palette());
      confetti(x, y, 40);
    },
  };
};
