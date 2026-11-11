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
  placeFlat,
  rand,
  resetTransform,
  retain,
  shade,
  sprite,
  spriteCache,
  stamp,
} from '../util';

/** Gold (most) and silver. Any CSS colours work: shading is derived from each base. */
const METALS = ['#e8b923', '#e8b923', '#e8b923', '#c9ced6'];
const GRAVITY = 900;
const MAX_EXTRA = 150;
const MAX_REST = 70;
const LIGHT_LEVELS = 5;

interface Coin {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  z: number;
  /** Rotation about the coin's vertical axis: face width follows |cos(spin)|. */
  spin: number;
  vspin: number;
  /** In-plane tilt. */
  rot: number;
  vrot: number;
  color: string;
  bounces: number;
  /** Thrown by a burst: dropped when done instead of respawning at the top. */
  extra: boolean;
}

interface Resting {
  /** Pile columns this coin raised, and by how much. */
  c0: number;
  c1: number;
  dh: number;
  x: number;
  y: number;
  r: number;
  color: string;
  rot: number;
  life: number;
  max: number;
  /** Seconds until the next glint flash. */
  glint: number;
}

interface Sparkle {
  x: number;
  y: number;
  life: number;
  max: number;
  size: number;
}

/**
 * Coin face, 64px for a radius of 30: milled rim with a bevel, a ring of
 * beads, and a raised motif (lotus on the front, eight-point star on the
 * back). `light` darkens faces turned away from the viewer.
 */
const faceSprite = (color: string, back: boolean, light: number) =>
  sprite(48, 48, (ctx) => {
    ctx.scale(0.75, 0.75);
    ctx.translate(32, 32);
    const hi = shade(color, -0.65);
    const lite = shade(color, -0.3);
    const dark = shade(color, 0.42);
    const deep = shade(color, 0.6);

    // Disc with a soft dome highlight up-left
    const g = ctx.createRadialGradient(-10, -12, 2, 0, 0, 31);
    g.addColorStop(0, hi);
    g.addColorStop(0.45, color);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, TAU);
    ctx.fill();

    // Raised rim: light on the upper-left, shadowed lower-right
    const rim = ctx.createLinearGradient(-30, -30, 30, 30);
    rim.addColorStop(0, hi);
    rim.addColorStop(0.5, color);
    rim.addColorStop(1, deep);
    ctx.lineWidth = 4;
    ctx.strokeStyle = rim;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, TAU);
    ctx.stroke();
    // Bevel lines inside the rim
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = deep;
    ctx.beginPath();
    ctx.arc(0, 0, 25.6, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = hi;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(0.5, 0.5, 24.8, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Bead ring
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU;
      const x = Math.cos(a) * 22.5;
      const y = Math.sin(a) * 22.5;
      ctx.fillStyle = deep;
      ctx.beginPath();
      ctx.arc(x + 0.4, y + 0.4, 1.05, 0, TAU);
      ctx.fill();
      ctx.fillStyle = lite;
      ctx.beginPath();
      ctx.arc(x - 0.2, y - 0.2, 0.85, 0, TAU);
      ctx.fill();
    }

    // Raised motif: drop shadow down-right, body, then a top-left highlight
    const motif = () => {
      ctx.beginPath();
      if (back) {
        for (let i = 0; i < 16; i++) {
          const rr = i % 2 ? 6.5 : 16;
          const a = (i * Math.PI) / 8 - Math.PI / 2;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
      } else {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          const cx = Math.cos(a) * 9.5;
          const cy = Math.sin(a) * 9.5;
          ctx.moveTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7);
          ctx.ellipse(cx, cy, 7, 3.6, a, 0, TAU);
        }
      }
    };
    ctx.save();
    ctx.translate(0.9, 1.1);
    ctx.fillStyle = deep;
    ctx.globalAlpha = 0.75;
    motif();
    ctx.fill();
    ctx.restore();
    const mg = ctx.createLinearGradient(-14, -14, 14, 14);
    mg.addColorStop(0, hi);
    mg.addColorStop(1, color);
    ctx.fillStyle = mg;
    motif();
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    // Centre boss
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(0.5, 0.6, back ? 4.2 : 5.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = back ? hi : lite;
    ctx.beginPath();
    ctx.arc(0, 0, back ? 3.6 : 4.6, 0, TAU);
    ctx.fill();
    if (!back) {
      ctx.fillStyle = dark;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 2.4, Math.sin(a) * 2.4, 0.6, 0, TAU);
        ctx.fill();
      }
    }

    // Faces turned away catch less light
    if (light < 1) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(0,0,0,${(1 - light) * 0.55})`;
      ctx.fillRect(-32, -32, 64, 64);
    }
  });

/** Back rim disc: the far side of the coin seen through the edge. */
const backSprite = (color: string) =>
  sprite(48, 48, (ctx) => {
    ctx.scale(0.75, 0.75);
    ctx.translate(32, 32);
    const g = ctx.createLinearGradient(0, -30, 0, 30);
    g.addColorStop(0, shade(color, 0.25));
    g.addColorStop(1, shade(color, 0.65));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, TAU);
    ctx.fill();
  });

/** The milled edge as a strip, 16x64: cylinder shading plus fine grooves. */
const edgeSprite = (color: string) =>
  sprite(12, 48, (ctx) => {
    ctx.scale(0.75, 0.75);
    const g = ctx.createLinearGradient(0, 0, 16, 0);
    g.addColorStop(0, shade(color, 0.55));
    g.addColorStop(0.35, shade(color, -0.35));
    g.addColorStop(0.6, color);
    g.addColorStop(1, shade(color, 0.5));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(8, 32, 8, 30, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = shade(color, 0.6);
    for (let y = 3; y < 61; y += 2.2) ctx.fillRect(0, y, 16, 0.8);
  });

/** Four-point star twinkle. */
const starSprite = () =>
  sprite(32, 32, (ctx) => {
    ctx.translate(16, 16);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,240,200,0.7)');
    g.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 ? 2.2 : 16;
      const a = (i * Math.PI) / 4;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  });

export const coins: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  const falling: Coin[] = [];
  const resting: Resting[] = [];
  const sparkles: Sparkle[] = [];
  let recycled = 0;
  /** Pile height per column, so settled coins stack into a mound. */
  const COL = 5;
  let pile = new Float32Array(0);

  const faces = spriteCache((key: string) => {
    const [color, side, level] = key.split('|');
    return faceSprite(color, side === 'b', 0.45 + (0.55 * Number(level)) / (LIGHT_LEVELS - 1));
  });
  const backs = spriteCache((c: string) => backSprite(c));
  const edges = spriteCache((c: string) => edgeSprite(c));
  const star = spriteCache(() => starSprite());
  const halo = spriteCache((c: string) => glowSprite(c, false, 0.25));

  const palette = () => paletteOr(o.colors, METALS);

  const make = (extra: boolean, x = rand(0, w), y = rand(-120, -20), vx = 0, vy = rand(60, 160)): Coin => {
    const z = rand(0.6, 1.2);
    return {
      x,
      y,
      vx,
      vy,
      r: rand(10, 15) * o.size * z,
      z,
      spin: rand(0, TAU),
      vspin: rand(4, 9) * (Math.random() < 0.5 ? -1 : 1),
      rot: rand(-0.4, 0.4),
      vrot: rand(-0.6, 0.6),
      color: pick(palette()),
      bounces: 0,
      extra,
    };
  };

  const sparkle = (x: number, y: number, size: number) => {
    if (sparkles.length > 200) return;
    const max = rand(0.35, 0.7);
    sparkles.push({ x, y, life: max, max, size });
  };

  const unpile = (p: Resting) => {
    for (let i = p.c0; i <= p.c1; i++) pile[i] = Math.max(0, pile[i] - p.dh);
  };

  const settle = (c: Coin) => {
    if (resting.length >= MAX_REST) unpile(resting.shift()!);
    const c0 = clamp(Math.floor((c.x - c.r) / COL), 0, pile.length - 1);
    const c1 = clamp(Math.floor((c.x + c.r) / COL), 0, pile.length - 1);
    let top = 0;
    for (let i = c0; i <= c1; i++) top = Math.max(top, pile[i] ?? 0);
    const dh = c.r * 0.32;
    for (let i = c0; i <= c1; i++) pile[i] = top + dh;
    const max = rand(6, 9);
    resting.push({ c0, c1, dh, x: c.x, y: h - top - c.r * 0.3, r: c.r, color: c.color, rot: rand(-0.3, 0.3), life: max, max, glint: rand(0.5, 3) });
  };

  /** Ground height under x: the floor plus whatever coins have piled there. */
  const floorAt = (x: number) => h - (pile[clamp(Math.floor(x / COL), 0, pile.length - 1)] ?? 0);

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      const cols = Math.max(1, Math.ceil(w / COL) + 1);
      if (cols !== pile.length) {
        pile = new Float32Array(cols);
        resting.length = 0;
      }
      const want = countFor(w, h, 40, o.density);
      for (; recycled < want; recycled++) falling.push(make(false, rand(0, w), rand(-h, h)));
      if (recycled > want) {
        let drop = recycled - want;
        retain(falling, (c) => c.extra || drop-- <= 0);
        recycled = want;
      }
    },
    update(dt) {
      const s = dt * o.speed;
      const k = drag(0.99, s);
      retain(falling, (c) => {
        const terminal = 520 * c.z;
        c.vy = Math.min(terminal, c.vy + GRAVITY * 0.55 * s);
        c.vx = c.vx * k + o.wind * 40 * s;
        c.x += c.vx * s;
        c.y += c.vy * s;
        c.spin += c.vspin * s;
        c.rot += c.vrot * s;

        const floor = floorAt(c.x) - c.r * 0.3;
        if (o.ground && c.y >= floor && c.vy > 0) {
          c.y = floor;
          const impact = c.vy;
          if (impact > 160) sparkle(c.x + rand(-c.r, c.r), floor - rand(0, c.r), c.r * 1.6);
          c.bounces++;
          if (c.bounces >= 3 || impact < 90) {
            settle(c);
            if (c.extra) return false;
            Object.assign(c, make(false));
            return true;
          }
          // Damped bounce: loses height, spin and drift
          c.vy = -impact * 0.38;
          c.vx *= 0.65;
          c.vspin *= 0.6;
          return true;
        }
        if (c.y - c.r > h + 20) {
          if (c.extra) return false;
          Object.assign(c, make(false));
          return true;
        }
        if (!c.extra) {
          if (c.x < -30) c.x += w + 60;
          else if (c.x > w + 30) c.x -= w + 60;
        }
        return true;
      });

      retain(resting, (p) => {
        p.glint -= s;
        if (p.glint <= 0) {
          sparkle(p.x + rand(-p.r * 0.6, p.r * 0.6), p.y - rand(0, p.r * 0.3), p.r * 1.3);
          p.glint = rand(1.5, 4);
        }
        if ((p.life -= s) > 0 && o.ground) return true;
        unpile(p);
        return false;
      });
      retain(sparkles, (p) => (p.life -= s) > 0);
    },
    draw(ctx) {
      const m = baseTransform(ctx);

      // The pile: coins lying flat, seen at an angle
      for (const p of resting) {
        const a = Math.min(1, p.life / 1.5);
        if (a <= 0) continue;
        ctx.globalAlpha = a;
        placeFlat(ctx, m, p.x, p.y, p.rot, 1, 0.34);
        stamp(ctx, faces(`${p.color}|f|${LIGHT_LEVELS - 1}`), 0, 0, p.r * 2);
      }

      for (const c of falling) {
        const cos = Math.cos(c.spin);
        const sin = Math.sin(c.spin);
        const face = Math.abs(cos);
        const d = c.r * 2;
        const thick = c.r * 0.2 * Math.abs(sin); // visible edge thickness
        const side = Math.sign(sin * cos) || 1; // which way the face is offset
        ctx.globalAlpha = clamp(0.7 + 0.3 * c.z, 0, 1);

        // Far face (rim), the milled edge band, then the near face
        if (thick > 1) {
          place(ctx, m, c.x - (side * thick) / 2, c.y, c.rot, Math.max(0.04, face), 1);
          stamp(ctx, backs(c.color), 0, 0, d);
          place(ctx, m, c.x, c.y, c.rot, 1, 1);
          const img = edges(c.color);
          if (img) ctx.drawImage(img, -thick / 2 - face * c.r * 0.02, -c.r, thick, d);
        }
        const level = Math.round(face * (LIGHT_LEVELS - 1));
        place(ctx, m, c.x + (side * thick) / 2, c.y, c.rot, Math.max(0.04, face), 1);
        stamp(ctx, faces(`${c.color}|${cos >= 0 ? 'f' : 'b'}|${level}`), 0, 0, d);
      }
      resetTransform(ctx, m);

      // Specular glints sweep across faces as they turn; impact sparkles
      ctx.globalCompositeOperation = 'lighter';
      const st = star('');
      for (const c of falling) {
        const flash = Math.pow(Math.max(0, Math.sin(c.spin * 2 + 0.6)), 6);
        if (flash < 0.05) continue;
        const face = Math.abs(Math.cos(c.spin));
        ctx.globalAlpha = flash * 0.55;
        stamp(ctx, halo('#fff4c8'), c.x - c.r * 0.25 * face, c.y - c.r * 0.3, c.r * 1.8);
        ctx.globalAlpha = flash * 0.9;
        stamp(ctx, st, c.x - c.r * 0.25 * face, c.y - c.r * 0.3, c.r * 1.6);
      }
      for (const p of sparkles) {
        const k = p.life / p.max;
        ctx.globalAlpha = Math.sin(Math.PI * k);
        stamp(ctx, st, p.x, p.y, p.size * (0.6 + 0.6 * Math.sin(Math.PI * k)));
      }
    },
    burst(x, y) {
      const n = Math.min(22, MAX_EXTRA - (falling.length - recycled));
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + rand(-0.7, 0.7);
        const v = rand(320, 680) * clamp(h / 700, 0.6, 1.3);
        const c = make(true, x, y, Math.cos(a) * v, Math.sin(a) * v);
        c.vspin *= 1.4;
        falling.push(c);
      }
      for (let i = 0; i < 5; i++) sparkle(x + rand(-15, 15), y + rand(-15, 15), rand(14, 24) * o.size);
    },
  };
};
