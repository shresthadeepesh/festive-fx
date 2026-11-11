import type { EffectFactory } from '../types';
import {
  ALPHA_STEPS,
  TAU,
  alphaLevel,
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
  sprite,
  spriteCache,
  stamp,
} from '../util';

/** Alta / sindoor reds used for Laxmi's footprints on Tihar night. */
const ALTA = ['#c8102e', '#d4142a', '#b80f24', '#cf2a25'];
const GLITTER = ['#ffd27a', '#ffe9b0', '#ffffff'];

/** Sprite box for one footprint (CSS units); toes point up (-y). */
const FW = 32;
const FH = 56;

interface Print {
  x: number;
  y: number;
  rot: number;
  left: boolean;
  img: HTMLCanvasElement | null;
  age: number;
  /** Seconds it stays fully visible before fading. */
  hold: number;
}

interface Trail {
  /** Quadratic bezier from start (x0,y0) via (cx,cy) to end (x1,y1). */
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  steps: number;
  next: number;
  timer: number;
  interval: number;
  color: string;
  variant: number;
  auto: boolean;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  color: string;
  glitter: boolean;
}

/**
 * One painted right footprint (left prints are mirrored): heel, narrow arch,
 * broad ball and five toes in alta, with a powdery halo, speckled texture
 * and a rice-paste lotus of white dots on the ball.
 */
const footSprite = (color: string, variant: number) =>
  sprite(FW, FH, (ctx) => {
    const shapes = (grow: number) => {
      const g = grow;
      ctx.beginPath();
      // One sole outline: rounded heel, straight outer edge, broad ball, and
      // the inner arch cut in where a real foot doesn't touch the floor.
      ctx.moveTo(15.5, 54 + g);
      ctx.bezierCurveTo(21.5 + g, 54 + g, 23 + g, 49, 22.8 + g, 44);
      ctx.bezierCurveTo(22.6 + g, 38, 21.6 + g, 33, 22.6 + g, 28);
      ctx.bezierCurveTo(23.6 + g, 23, 25.6 + g, 19, 25.1 + g, 15);
      ctx.bezierCurveTo(24.6 + g, 11.4 - g, 20, 10.6 - g, 16, 11 - g);
      ctx.bezierCurveTo(11, 11.2 - g, 6.6 - g, 11.6, 6.6 - g, 16.5);
      ctx.bezierCurveTo(6.6 - g, 21, 9.6 - g, 24, 10.6 - g, 28);
      ctx.bezierCurveTo(13.6 - g, 32, 13.8 - g, 37.5, 10.6 - g, 42.5);
      ctx.bezierCurveTo(8.4 - g, 46.5, 9.4 - g, 54 + g, 15.5, 54 + g);
      ctx.closePath();
      // Toes: oval pads curving down toward the little toe
      for (const [x, y, rx, ry] of [
        [9.6, 5.9, 3.4, 4.1],
        [14.7, 3.9, 2.35, 2.9],
        [18.7, 4.7, 2.1, 2.6],
        [21.9, 6.7, 1.9, 2.3],
        [24.4, 9.7, 1.6, 1.95],
      ]) {
        ctx.moveTo(x + rx + g, y);
        ctx.ellipse(x, y, rx + g, ry + g, 0.15, 0, TAU);
      }
    };

    // Powder bleeding past the edge of the paint
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.18;
    shapes(1.6);
    ctx.fill();
    ctx.globalAlpha = 1;
    shapes(0);
    ctx.fill();

    // Everything below lands on the painted area only
    ctx.globalCompositeOperation = 'source-atop';
    // Thicker paint at the rim, lighter where the sole pressed
    const g = ctx.createRadialGradient(16, 30, 2, 16, 30, 26);
    g.addColorStop(0, 'rgba(255,190,170,0.22)');
    g.addColorStop(0.7, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(60,0,8,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FW, FH);
    // Speckled powder texture (seeded by variant so prints differ)
    let seed = 17 + variant * 101;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,220,200,0.18)' : 'rgba(70,0,10,0.22)';
      ctx.fillRect(rnd() * FW, rnd() * FH, 0.7, 0.7);
    }
    // Rice-paste lotus on the ball and a dot on the heel
    ctx.fillStyle = 'rgba(255,248,235,0.9)';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.beginPath();
      ctx.arc(16.5 + Math.cos(a) * 3.6, 21 + Math.sin(a) * 3.6, 0.75, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,214,110,0.95)';
    ctx.beginPath();
    ctx.arc(16.5, 21, 1.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,248,235,0.8)';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(16 + Math.cos(a) * 2.6, 45.5 + Math.sin(a) * 2.6, 0.6, 0, TAU);
      ctx.fill();
    }

    // Loose grains scattered just outside the print
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = color;
    for (let i = 0; i < 28; i++) {
      const a = rnd() * TAU;
      const d = 9 + rnd() * 6;
      ctx.globalAlpha = 0.25 + rnd() * 0.35;
      ctx.fillRect(16 + Math.cos(a) * d * 0.7, 32 + Math.sin(a) * d * 1.6, 0.8, 0.8);
    }
  });

export const laxmiPaila: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let spawnTimer = 0.2;
  const trails: Trail[] = [];
  const prints: Print[] = [];
  const motes: Mote[] = [];
  // Reused per-frame buckets: one path per (colour, alpha level) for dust.
  const moteGroups = new Map<string, Mote[][]>();

  const feet = spriteCache((key: string) => {
    const [c, v] = key.split('|');
    return footSprite(c, Number(v));
  });
  const twinkle = spriteCache((c: string) => glowSprite(c, true, 0.3));
  const palette = () => paletteOr(o.colors, ALTA);
  const stepLen = () => 34 * o.size;

  /** Start a trail toward (tx, ty), entering from a nearby edge. */
  const walk = (tx: number, ty: number, auto: boolean) => {
    if (w < 40 || h < 40) return;
    // Enter from the bottom, or from the side the target is closer to
    const side = Math.random() < 0.55 ? 'bottom' : tx < w / 2 ? 'left' : 'right';
    let x0: number;
    let y0: number;
    if (side === 'bottom') {
      x0 = clamp(tx + rand(-0.35, 0.35) * w, w * 0.05, w * 0.95);
      y0 = h + 30;
    } else {
      x0 = side === 'left' ? -30 : w + 30;
      y0 = clamp(ty + rand(0.1, 0.45) * h, h * 0.35, h * 0.95);
    }
    const dx = tx - x0;
    const dy = ty - y0;
    const dist = Math.hypot(dx, dy);
    // Bend the path a little to one side
    const bend = rand(-0.28, 0.28) * dist;
    trails.push({
      x0,
      y0,
      cx: (x0 + tx) / 2 - (dy / (dist || 1)) * bend,
      cy: (y0 + ty) / 2 + (dx / (dist || 1)) * bend,
      x1: tx,
      y1: ty,
      steps: Math.max(2, Math.round(dist / stepLen())),
      next: 0,
      timer: 0,
      interval: rand(0.42, 0.55),
      color: pick(palette()),
      variant: (Math.random() * 3) | 0,
      auto,
    });
  };

  const autoTarget = () => {
    // "Into the home": somewhere around the middle
    walk(w * rand(0.3, 0.7), h * rand(0.35, 0.65), true);
  };

  const at = (tr: Trail, u: number) => {
    const a = (1 - u) * (1 - u);
    const b = 2 * (1 - u) * u;
    const c = u * u;
    const x = a * tr.x0 + b * tr.cx + c * tr.x1;
    const y = a * tr.y0 + b * tr.cy + c * tr.y1;
    // Tangent for the heading
    const tx = 2 * (1 - u) * (tr.cx - tr.x0) + 2 * u * (tr.x1 - tr.cx);
    const ty = 2 * (1 - u) * (tr.cy - tr.y0) + 2 * u * (tr.y1 - tr.cy);
    return { x, y, heading: Math.atan2(ty, tx) };
  };

  const land = (x: number, y: number, color: string) => {
    for (let i = 0; i < 9 && motes.length < 600; i++) {
      const glitter = i < 3;
      const a = rand(0, TAU);
      const v = rand(8, glitter ? 40 : 26) * o.size;
      const max = rand(0.6, glitter ? 1.4 : 1.1);
      motes.push({
        x: x + rand(-4, 4),
        y: y + rand(-4, 4),
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - (glitter ? 12 : 4),
        life: max,
        max,
        r: rand(0.6, 1.4) * o.size,
        color: glitter ? pick(GLITTER) : color,
        glitter,
      });
    }
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
    },
    update(dt) {
      const s = dt * o.speed;
      const want = o.density > 0 ? Math.max(1, countFor(w, h, 3, o.density)) : 0;
      let active = 0;
      for (const tr of trails) if (tr.auto) active++;
      spawnTimer -= s;
      if (active < want && spawnTimer <= 0) {
        autoTarget();
        spawnTimer = rand(0.8, 2.2);
      }

      retain(trails, (tr) => {
        tr.timer -= s;
        while (tr.timer <= 0 && tr.next <= tr.steps) {
          tr.timer += tr.interval;
          const u = tr.next / tr.steps;
          const p = at(tr, u);
          const left = tr.next % 2 === 0;
          // Feet sit either side of the walking line
          const side = (left ? -1 : 1) * 6.5 * o.size;
          const nx = -Math.sin(p.heading);
          const ny = Math.cos(p.heading);
          const x = p.x + nx * side;
          const y = p.y + ny * side;
          tr.next++;
          if (x < -40 || x > w + 40 || y < -40 || y > h + 40) continue; // still off-screen
          prints.push({
            x,
            y,
            rot: p.heading + Math.PI / 2 + (left ? -0.08 : 0.08),
            left,
            img: feet(`${tr.color}|${(tr.variant + tr.next) % 3}`),
            age: 0,
            hold: rand(4, 6),
          });
          land(x, y, tr.color);
        }
        return tr.next <= tr.steps;
      });

      retain(prints, (p) => (p.age += s) < p.hold + 1.6);

      const k = drag(0.94, s);
      retain(motes, (m) => {
        m.vx *= k;
        m.vy = m.vy * k + (m.glitter ? 6 : 14) * s;
        m.x += m.vx * s;
        m.y += m.vy * s;
        return (m.life -= s) > 0;
      });
    },
    draw(ctx) {
      if (prints.length) {
        const m = baseTransform(ctx);
        const fw = FW * 0.7 * o.size;
        const fh = FH * 0.7 * o.size;
        for (const p of prints) {
          // Pressed in: quick fade-in with a slight settle, long linger, soft fade
          const k = Math.min(1, p.age / 0.22);
          const a = k * clamp(1 - (p.age - p.hold) / 1.6, 0, 1);
          if (a <= 0.01 || !p.img) continue;
          const sc = 1 + (1 - k) * 0.12;
          ctx.globalAlpha = a * 0.92;
          place(ctx, m, p.x, p.y, p.rot, (p.left ? -1 : 1) * sc, sc);
          ctx.drawImage(p.img, -fw / 2, -fh / 2, fw, fh);
        }
        resetTransform(ctx, m);
      }

      if (!motes.length) return;
      // Sindoor dust: batched squares per colour and alpha level
      for (const mt of motes) {
        if (mt.glitter) continue;
        let groups = moteGroups.get(mt.color);
        if (!groups) {
          groups = Array.from({ length: ALPHA_STEPS + 1 }, () => []);
          moteGroups.set(mt.color, groups);
        }
        groups[alphaLevel((mt.life / mt.max) * 0.8)].push(mt);
      }
      moteGroups.forEach((groups, color) => {
        ctx.fillStyle = color;
        for (let lv = 1; lv <= ALPHA_STEPS; lv++) {
          const g = groups[lv];
          if (!g.length) continue;
          ctx.globalAlpha = lv / ALPHA_STEPS;
          ctx.beginPath();
          for (const mt of g) ctx.rect(mt.x - mt.r / 2, mt.y - mt.r / 2, mt.r, mt.r);
          ctx.fill();
          g.length = 0;
        }
      });
      // Gold glitter twinkles
      ctx.globalCompositeOperation = 'lighter';
      for (const mt of motes) {
        if (!mt.glitter) continue;
        const a = (mt.life / mt.max) * (Math.random() < 0.3 ? 0.35 : 1);
        ctx.globalAlpha = a;
        stamp(ctx, twinkle(mt.color), mt.x, mt.y, mt.r * 6);
      }
    },
    burst(x, y) {
      walk(x, y, false);
    },
  };
};
