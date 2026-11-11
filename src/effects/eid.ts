import type { EffectFactory } from '../types';
import {
  TAU,
  baseTransform,
  clamp,
  countFor,
  fillPool,
  glowSprite,
  paletteOr,
  place,
  rand,
  resetTransform,
  retain,
  shade,
  sprite,
  spriteCache,
  stamp,
} from '../util';

/** Fanoos glass: teal, rose, cobalt, amber, violet. */
const GLASS = ['#26b89a', '#e0457b', '#3d7bff', '#f2a93b', '#9b5de5'];
const BRASS_DARK = '#6b4a14';
const BRASS = '#d9b45a';
const BRASS_LIGHT = '#f6dc8e';

interface Star {
  x: number;
  y: number;
  r: number;
  base: number;
  freq: number;
  phase: number;
  bright: boolean;
}

interface Lantern {
  ax: number;
  /** Chain length as a fraction of the height. */
  lenFrac: number;
  len: number;
  amp: number;
  baseAmp: number;
  jitter: number;
  omega: number;
  phase: number;
  z: number;
  color: string;
  seed: number;
  pulse: number;
  /** Refreshed each frame: hang point and swing angle. */
  x: number;
  y: number;
  angle: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

/** Crescent moon in a 100x100 sprite: shaded disk with the shadow cut away. */
const moonSprite = () =>
  sprite(100, 100, (ctx) => {
    ctx.translate(50, 50);
    const R = 40;
    const g = ctx.createRadialGradient(-14, -8, 3, 0, 0, R);
    g.addColorStop(0, '#fffaf0');
    g.addColorStop(0.55, '#f9e8b8');
    g.addColorStop(1, '#ddb96e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();
    // Maria and craters on the lit limb
    ctx.fillStyle = 'rgba(165,128,62,0.2)';
    for (const [x, y, r] of [[-27, -6, 6], [-22, 13, 4.5], [-31, 9, 3], [-12, -27, 4], [-18, 24, 3.5], [-33, -14, 2.5]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.2, r, 0.4, 0, TAU);
      ctx.fill();
    }
    // Cut the shadowed part away: a correct crescent is a disk minus an offset disk
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000'; // fully opaque, or the cut only removes part of the disk
    ctx.beginPath();
    ctx.arc(R * 0.42, -R * 0.16, R * 0.86, 0, TAU);
    ctx.fill();
    // Earthshine: the unlit side stays faintly visible and hides the halo behind it
    ctx.globalCompositeOperation = 'destination-over';
    const e = ctx.createRadialGradient(-6, -4, 2, 0, 0, R);
    e.addColorStop(0, 'rgba(70,82,120,0.8)');
    e.addColorStop(1, 'rgba(40,48,80,0.85)');
    ctx.fillStyle = e;
    ctx.beginPath();
    ctx.arc(0, 0, R - 0.5, 0, TAU);
    ctx.fill();
  });

/** Pointed (ogee-ish) arch window centred at x, spanning y0..y1. */
const arch = (ctx: CanvasRenderingContext2D, x: number, half: number, y0: number, y1: number) => {
  const shoulder = y0 + (y1 - y0) * 0.38;
  ctx.moveTo(x - half, y1);
  ctx.lineTo(x - half, shoulder);
  ctx.quadraticCurveTo(x - half, y0 + 2, x, y0);
  ctx.quadraticCurveTo(x + half, y0 + 2, x + half, shoulder);
  ctx.lineTo(x + half, y1);
  ctx.closePath();
};

/** Eight-pointed star path (two overlapping squares' outline). */
const star8 = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  for (let i = 0; i < 16; i++) {
    const rr = i % 2 ? r * 0.62 : r;
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
};

/**
 * Fanoos lantern, 56x120 sprite hanging from (28, 0): ring, onion dome,
 * crown, three visible glass panels behind pierced brass, cone and finial.
 */
const lanternSprite = (glass: string) =>
  sprite(56, 120, (ctx) => {
    ctx.translate(28, 0);
    const brass = (x0: number, x1: number) => {
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, BRASS_DARK);
      g.addColorStop(0.35, BRASS_LIGHT);
      g.addColorStop(0.6, BRASS);
      g.addColorStop(1, BRASS_DARK);
      return g;
    };
    const light = (cx: number, cy: number, r: number) => {
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
      g.addColorStop(0, '#fff7dc');
      g.addColorStop(0.3, shade(glass, -0.45));
      g.addColorStop(0.75, glass);
      g.addColorStop(1, shade(glass, 0.45));
      return g;
    };

    // Hanging ring
    ctx.strokeStyle = BRASS;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 4, 3.2, 0, TAU);
    ctx.stroke();

    // Finial spike and onion dome
    ctx.fillStyle = brass(-3, 3);
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.lineTo(2.2, 15);
    ctx.lineTo(-2.2, 15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = brass(-17, 17);
    ctx.beginPath();
    ctx.moveTo(-2.5, 14);
    ctx.bezierCurveTo(-10, 17, -18, 24, -16, 34);
    ctx.lineTo(16, 34);
    ctx.bezierCurveTo(18, 24, 10, 17, 2.5, 14);
    ctx.closePath();
    ctx.fill();
    // Pierced holes in the dome glow with the inner light
    ctx.fillStyle = shade(glass, -0.55);
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(i * 3.6, 29 - Math.abs(i) * 0.6, 1.1, 0, TAU);
      ctx.fill();
    }

    // Crown band with crenellations
    ctx.fillStyle = brass(-18, 18);
    ctx.fillRect(-18, 34, 36, 6);
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const x = -18 + i * 4.5;
      ctx.moveTo(x, 34);
      ctx.lineTo(x + 2.25, 31);
      ctx.lineTo(x + 4.5, 34);
    }
    ctx.fill();

    // Body: glass panels lit from inside (side panels darker for depth)
    const top = 40;
    const bot = 90;
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(-16, top);
      ctx.lineTo(16, top);
      ctx.lineTo(12, bot);
      ctx.lineTo(-12, bot);
      ctx.closePath();
    };
    body();
    ctx.fillStyle = light(0, 64, 26);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sgn * 16, top);
      ctx.lineTo(sgn * 7.5, top);
      ctx.lineTo(sgn * 5.5, bot);
      ctx.lineTo(sgn * 12, bot);
      ctx.closePath();
      ctx.fill();
    }

    // Pierced brass screen: the panel area minus arch windows and star holes
    ctx.save();
    body();
    ctx.clip();
    ctx.beginPath();
    ctx.rect(-18, top, 36, bot - top);
    arch(ctx, 0, 5.2, top + 9, bot - 9);
    arch(ctx, -11, 2.4, top + 12, bot - 10);
    arch(ctx, 11, 2.4, top + 12, bot - 10);
    star8(ctx, 0, top + 4.5, 3);
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(i * 4.6 + 1, bot - 4);
      ctx.arc(i * 4.6, bot - 4, 1, 0, TAU);
    }
    ctx.fillStyle = brass(-16, 16);
    ctx.fill('evenodd');
    // Filigree lattice inside the windows
    ctx.strokeStyle = 'rgba(110,78,24,0.75)';
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    for (let d = -40; d < 40; d += 3.4) {
      ctx.moveTo(d, top);
      ctx.lineTo(d + 50, top + 50);
      ctx.moveTo(d, top);
      ctx.lineTo(d - 50, top + 50);
    }
    ctx.stroke();
    ctx.restore();
    // Re-draw the window rims so the lattice reads as set into the frame
    ctx.strokeStyle = BRASS_LIGHT;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    arch(ctx, 0, 5.2, top + 9, bot - 9);
    ctx.stroke();
    ctx.strokeStyle = BRASS_DARK;
    ctx.lineWidth = 1.2;
    body();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-7.5, top);
    ctx.lineTo(-5.5, bot);
    ctx.moveTo(7.5, top);
    ctx.lineTo(5.5, bot);
    ctx.stroke();

    // Base band, cone and drop finial
    ctx.fillStyle = brass(-14, 14);
    ctx.fillRect(-14, bot, 28, 5);
    ctx.beginPath();
    ctx.moveTo(-12, bot + 5);
    ctx.lineTo(12, bot + 5);
    ctx.lineTo(0, bot + 20);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, bot + 22, 2.6, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-1, bot + 24);
    ctx.lineTo(0, bot + 29);
    ctx.lineTo(1, bot + 24);
    ctx.fill();
  });

export const eid: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let t = 0;
  let nextMeteor = rand(2, 5);
  const stars: Star[] = [];
  const lanterns: Lantern[] = [];
  const meteors: Meteor[] = [];

  const moon = spriteCache(() => moonSprite());
  const lamp = spriteCache((c: string) => lanternSprite(c));
  const glow = spriteCache((c: string) => glowSprite(c, false, 0.3));
  const twinkle = spriteCache((c: string) => glowSprite(c, true, 0.25));

  const palette = () => paletteOr(o.colors, GLASS);
  const moonR = () => clamp(Math.min(w, h) * 0.085, 12, 64) * o.size;
  const moonX = () => w * 0.8;
  /** Lantern scale for this surface. */
  const lz = (l: Lantern) => l.z * o.size * clamp(h / 540, 0.55, 1.2);
  const moonY = () => Math.max(moonR() * 1.4, h * 0.2);

  const makeStar = (): Star => {
    const bright = Math.random() < 0.08;
    return {
      x: rand(0, w),
      y: h * Math.pow(Math.random(), 1.5) * 0.85,
      r: (bright ? rand(1.3, 2) : rand(0.4, 1.1)) * o.size,
      base: bright ? rand(0.8, 1) : rand(0.25, 0.7),
      freq: rand(0.6, 2.4),
      phase: rand(0, TAU),
      bright,
    };
  };

  const layout = () => {
    fillPool(stars, countFor(w, h, 65, o.density), makeStar);
    const n = o.ground && o.density > 0 && w > 0 ? clamp(Math.round((w / (170 * o.size)) * 0.6 * o.density), 1, 14) : 0;
    const pal = palette();
    while (lanterns.length < n) {
      const i = lanterns.length;
      const amp = rand(0.05, 0.11);
      lanterns.push({
        ax: 0,
        // Alternate long and short chains so the lanterns stagger
        lenFrac: i % 2 === 0 ? rand(0.2, 0.3) : rand(0.07, 0.13),
        len: 0,
        amp,
        baseAmp: amp,
        jitter: rand(-12, 12),
        omega: 0,
        phase: rand(0, TAU),
        z: rand(0.78, 1.08),
        color: '',
        seed: rand(0, 100),
        pulse: 0,
        x: 0,
        y: 0,
        angle: 0,
      });
    }
    lanterns.length = n;
    // Spread lanterns across the width but leave the moon's band clear
    const band = moonR() * 3.2;
    const bandStart = moonX() - band / 2;
    const avail = w * 0.9 - band;
    lanterns.forEach((l, i) => {
      let x = w * 0.05 + (avail * (i + 0.5)) / n + l.jitter;
      if (x > bandStart) x += band;
      l.ax = x;
      l.len = l.lenFrac * h + 6;
      l.omega = 2.4 / Math.sqrt(Math.max(0.4, l.len / 100));
      l.color = pal[i % pal.length];
    });
  };

  const meteor = (x = rand(w * 0.1, w * 0.7), y = rand(0, h * 0.3)) => {
    const a = rand(0.35, 0.6);
    const v = rand(650, 900);
    const max = rand(0.6, 1);
    meteors.push({ x, y, vx: -Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max });
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
        // Pendulum swing plus a lean into the wind
        l.angle = l.amp * Math.sin(t * l.omega + l.phase) + o.wind * 0.15;
        const len = l.len;
        l.x = l.ax - Math.sin(l.angle) * len;
        l.y = Math.cos(l.angle) * len;
        l.pulse = Math.max(0, l.pulse - s * 0.9);
        l.amp = Math.max(l.baseAmp, l.amp - s * 0.02);
      }
      if (o.density > 0 && w > 0) {
        nextMeteor -= s;
        if (nextMeteor <= 0) {
          meteor();
          nextMeteor = rand(5, 11) / o.density;
        }
      }
      retain(meteors, (m) => {
        m.x += m.vx * s;
        m.y += m.vy * s;
        return (m.life -= s) > 0;
      });
    },
    draw(ctx) {
      const k = o.size;
      const tw = twinkle('#fffbe8');

      // Stars
      ctx.globalCompositeOperation = 'lighter';
      for (const st of stars) {
        const a = st.base * (0.65 + 0.35 * Math.sin(t * st.freq + st.phase));
        ctx.globalAlpha = a;
        stamp(ctx, tw, st.x, st.y, st.r * 4);
      }
      ctx.strokeStyle = '#fffbe8';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      let spikes = false;
      for (const st of stars) {
        if (!st.bright) continue;
        spikes = true;
        const L = st.r * 5 * (0.75 + 0.25 * Math.sin(t * st.freq + st.phase));
        ctx.moveTo(st.x - L, st.y);
        ctx.lineTo(st.x + L, st.y);
        ctx.moveTo(st.x, st.y - L);
        ctx.lineTo(st.x, st.y + L);
      }
      if (spikes) {
        ctx.globalAlpha = 0.5;
        ctx.stroke();
      }

      // Crescent moon with its halo and the traditional star beside it
      if (o.density > 0 && w > 0) {
        const R = moonR();
        const mx = moonX();
        const my = moonY();
        ctx.globalAlpha = 0.32 + 0.04 * Math.sin(t * 0.7);
        stamp(ctx, glow('#ffe7a8'), mx, my, R * 5.5);
        ctx.globalCompositeOperation = 'source-over';
        const m = baseTransform(ctx);
        place(ctx, m, mx, my, -0.4);
        ctx.globalAlpha = 1;
        const img = moon(0);
        if (img) ctx.drawImage(img, -R * 1.25, -R * 1.25, R * 2.5, R * 2.5);
        resetTransform(ctx, m);
        ctx.globalCompositeOperation = 'lighter';
        // The star sits in the crescent's opening, just outside the rim
        const sx = mx + R * 0.86;
        const sy = my - R * 0.62;
        ctx.globalAlpha = 0.7 + 0.2 * Math.sin(t * 2.2);
        stamp(ctx, tw, sx, sy, R * 0.55);
        ctx.fillStyle = '#fff6d8';
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? R * 0.07 : R * 0.17;
          const a = (i * Math.PI) / 5 - Math.PI / 2;
          if (i === 0) ctx.moveTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
          else ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
      }

      // Shooting stars
      ctx.lineCap = 'round';
      for (const mt of meteors) {
        const l = mt.life / mt.max;
        const a = Math.min(1, (1 - l) * 6) * Math.min(1, l * 2.5);
        const sp = Math.hypot(mt.vx, mt.vy);
        const len = 150 * k;
        const tx = mt.x - (mt.vx / sp) * len;
        const ty = mt.y - (mt.vy / sp) * len;
        const g = ctx.createLinearGradient(tx, ty, mt.x, mt.y);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(1, 'rgba(255,250,230,1)');
        ctx.globalAlpha = a;
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.6 * k;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(mt.x, mt.y);
        ctx.stroke();
        stamp(ctx, tw, mt.x, mt.y, 10 * k);
      }

      if (!lanterns.length) return;

      // Warm halos behind the lanterns
      for (const l of lanterns) {
        const fl = 0.85 + 0.1 * Math.sin(t * 11 + l.seed) + 0.05 * Math.sin(t * 23 + l.seed * 2);
        const cx = l.x - Math.sin(l.angle) * 64 * lz(l);
        const cy = l.y + Math.cos(l.angle) * 64 * lz(l);
        ctx.globalAlpha = (0.42 + l.pulse * 0.5) * fl;
        stamp(ctx, glow(l.color), cx, cy, 170 * lz(l) * (1 + l.pulse * 0.4));
        ctx.globalAlpha = (0.45 + l.pulse * 0.4) * fl;
        stamp(ctx, glow('#ffd27a'), cx, cy, 70 * lz(l));
      }

      // Chains: two dashed passes read as interlocking links
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      for (const l of lanterns) {
        ctx.moveTo(l.ax, 0);
        ctx.lineTo(l.x, l.y);
      }
      ctx.globalAlpha = 1;
      ctx.setLineDash([3.2 * k, 2.2 * k]);
      ctx.strokeStyle = BRASS;
      ctx.lineWidth = 2.2 * k;
      ctx.stroke();
      ctx.lineDashOffset = 2.7 * k;
      ctx.strokeStyle = BRASS_DARK;
      ctx.lineWidth = 1.1 * k;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;

      const m = baseTransform(ctx);
      for (const l of lanterns) {
        place(ctx, m, l.x, l.y, l.angle);
        const img = lamp(l.color);
        if (img) ctx.drawImage(img, -28 * lz(l), -2 * lz(l), 56 * lz(l), 120 * lz(l));
      }
      resetTransform(ctx, m);

      // Flame glow showing through the glass, flickering
      ctx.globalCompositeOperation = 'lighter';
      for (const l of lanterns) {
        const fl = 0.8 + 0.12 * Math.sin(t * 13 + l.seed) + 0.08 * Math.sin(t * 29 + l.seed * 3);
        ctx.globalAlpha = (0.5 + l.pulse * 0.5) * fl;
        stamp(ctx, twinkle('#ffe2a0'), l.x - Math.sin(l.angle) * 64 * lz(l), l.y + Math.cos(l.angle) * 64 * lz(l), 26 * lz(l));
      }
    },
    burst(x, y) {
      for (const l of lanterns) {
        const cx = l.x - Math.sin(l.angle) * 64 * lz(l);
        const cy = l.y + Math.cos(l.angle) * 64 * lz(l);
        if (Math.hypot(cx - x, cy - y) < 90 * lz(l)) {
          l.pulse = 1;
          l.amp = Math.min(0.3, l.amp + 0.08); // a nudge sets it swinging
          return;
        }
      }
      meteor(x, y);
    },
  };
};
