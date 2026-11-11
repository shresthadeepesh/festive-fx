import type { EffectFactory } from '../types';
import { TAU, baseTransform, clamp, countFor, pick, place, rand, resetTransform, shade, sprite, spriteCache } from '../util';

type Species = 'monarch' | 'morpho' | 'swallowtail' | 'cabbage' | 'custom';
const SPECIES: Species[] = ['monarch', 'monarch', 'morpho', 'swallowtail', 'swallowtail', 'cabbage'];

/** Right-side wing sprite: body axis at x = 0, thorax at y = 0 (sprite row 36). */
const WW = 64;
const WH = 72;
/** Body sprite, thorax at (12, 20). */
const BW = 24;
const BH = 56;

interface Fly {
  x: number;
  y: number;
  heading: number;
  turn: number;
  speed: number;
  phase: number;
  rate: number;
  /** Seconds left in a glide (wings held open); 0 = flapping. */
  glide: number;
  /** Startle boost, decays to 0. */
  flee: number;
  z: number;
  species: Species;
  color: string;
}

const forewing = (ctx: CanvasRenderingContext2D) => {
  ctx.beginPath();
  ctx.moveTo(1, -6);
  ctx.bezierCurveTo(14, -30, 44, -38, 58, -30);
  ctx.bezierCurveTo(63, -26, 57, -12, 48, -6);
  ctx.bezierCurveTo(34, 0, 14, 2, 1, 0);
  ctx.closePath();
};

const hindwing = (ctx: CanvasRenderingContext2D, tail: boolean) => {
  ctx.beginPath();
  ctx.moveTo(1, 1);
  ctx.bezierCurveTo(22, 0, 46, 8, 44, 22);
  if (tail) {
    ctx.bezierCurveTo(43, 28, 36, 30, 32, 31);
    ctx.quadraticCurveTo(31, 42, 27, 49);
    ctx.quadraticCurveTo(24, 44, 23, 33);
    ctx.bezierCurveTo(14, 34, 5, 26, 1, 4);
  } else {
    ctx.bezierCurveTo(42, 32, 26, 34, 14, 30);
    ctx.bezierCurveTo(6, 26, 2, 14, 1, 4);
  }
  ctx.closePath();
};

const dots = (ctx: CanvasRenderingContext2D, pts: number[][], color: string, r: number) => {
  ctx.fillStyle = color;
  for (const [x, y, k = 1] of pts) {
    ctx.beginPath();
    ctx.arc(x, y, r * k, 0, TAU);
    ctx.fill();
  }
};

/** Veins radiating from the wing root, clipped to the current wing path. */
const veins = (ctx: CanvasRenderingContext2D, tips: number[][], color: string, width: number) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (const [x, y] of tips) {
    ctx.moveTo(2, -1);
    ctx.quadraticCurveTo(x * 0.45, y * 0.55 - 2, x, y);
  }
  ctx.stroke();
};

const FORE_TIPS = [[58, -30], [56, -20], [50, -10], [42, -4], [30, -1], [44, -34], [30, -33]];
const HIND_TIPS = [[44, 20], [40, 29], [30, 33], [18, 31], [44, 10]];
const FORE_EDGE = [[50, -31], [55, -26], [56, -19], [52, -12], [45, -7], [38, -4], [30, -2]];
const HIND_EDGE = [[42, 16], [41, 24], [36, 30], [28, 32], [20, 30], [12, 26]];

/** One right-side wing pair for a species, optionally brightened for the downstroke. */
const wingSprite = (species: Species, color: string, bright: boolean) =>
  sprite(WW, WH, (ctx) => {
    ctx.translate(0, 36);

    const paint = (path: () => void, fill: string | CanvasGradient, extra: () => void) => {
      path();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.save();
      path();
      ctx.clip();
      extra();
      ctx.restore();
    };

    // Hindwing first so the forewing overlaps it
    const radial = (c0: string, c1: string, c2: string) => {
      const g = ctx.createRadialGradient(4, 0, 2, 10, -2, 58);
      g.addColorStop(0, c0);
      g.addColorStop(0.55, c1);
      g.addColorStop(1, c2);
      return g;
    };

    switch (species) {
      case 'monarch': {
        const fill = radial('#c9561a', '#f5901e', '#f7a43a');
        const border = () => {
          ctx.lineWidth = 7;
          ctx.strokeStyle = '#151010';
          ctx.stroke();
        };
        paint(() => hindwing(ctx, false), fill, () => {
          veins(ctx, HIND_TIPS, '#151010', 1.5);
          hindwing(ctx, false);
          border();
          dots(ctx, HIND_EDGE, '#fff', 1.1);
        });
        paint(() => forewing(ctx), fill, () => {
          veins(ctx, FORE_TIPS, '#151010', 1.5);
          // Black apex with white and orange spots
          ctx.fillStyle = '#151010';
          ctx.beginPath();
          ctx.ellipse(56, -27, 15, 11, -0.4, 0, TAU);
          ctx.fill();
          dots(ctx, [[50, -28], [54, -24], [47, -24]], '#f7a43a', 1.5);
          forewing(ctx);
          border();
          dots(ctx, FORE_EDGE, '#fff', 1.2);
          dots(ctx, [[57, -30], [58, -22], [53, -33]], '#fff', 1.3);
        });
        break;
      }
      case 'morpho': {
        const fill = radial('#7fe6ff', '#2c86ff', '#0b2c8a');
        const border = () => {
          ctx.lineWidth = 10;
          ctx.strokeStyle = '#120d08';
          ctx.stroke();
        };
        paint(() => hindwing(ctx, false), fill, () => {
          veins(ctx, HIND_TIPS, 'rgba(5,20,70,0.45)', 1);
          hindwing(ctx, false);
          border();
          dots(ctx, HIND_EDGE.slice(1, 4), '#e8f4ff', 0.9);
        });
        paint(() => forewing(ctx), fill, () => {
          veins(ctx, FORE_TIPS, 'rgba(5,20,70,0.45)', 1);
          // Metallic sheen band
          const g = ctx.createLinearGradient(8, -28, 40, 0);
          g.addColorStop(0, 'rgba(255,255,255,0)');
          g.addColorStop(0.5, 'rgba(200,245,255,0.35)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, -40, 64, 44);
          forewing(ctx);
          border();
          dots(ctx, [[52, -30], [56, -24], [48, -33]], '#e8f4ff', 1.1);
        });
        break;
      }
      case 'swallowtail': {
        const fill = '#ffd84a';
        const border = () => {
          ctx.lineWidth = 9;
          ctx.strokeStyle = '#141008';
          ctx.stroke();
        };
        paint(() => hindwing(ctx, true), fill, () => {
          veins(ctx, HIND_TIPS, '#141008', 1.3);
          hindwing(ctx, true);
          border();
          dots(ctx, [[38, 22], [33, 27], [26, 29]], '#3d7bff', 1.6);
          dots(ctx, [[18, 28]], '#ff6a1f', 2.2);
          dots(ctx, HIND_EDGE.slice(0, 3), '#ffd84a', 1.2);
        });
        paint(() => forewing(ctx), fill, () => {
          // Tiger stripes across the forewing
          ctx.strokeStyle = '#141008';
          ctx.lineCap = 'round';
          for (const [x, wd] of [[8, 4], [17, 3.5], [27, 3], [37, 2.5]]) {
            ctx.lineWidth = wd;
            ctx.beginPath();
            ctx.moveTo(x + 6, -34);
            ctx.lineTo(x - 2, 2);
            ctx.stroke();
          }
          forewing(ctx);
          border();
          dots(ctx, FORE_EDGE, '#ffd84a', 1.2);
        });
        break;
      }
      case 'cabbage': {
        const fill = radial('#d9d6c8', '#f6f4ea', '#fbfaf3');
        paint(() => hindwing(ctx, false), fill, () => {
          ctx.fillStyle = 'rgba(210,225,120,0.22)';
          ctx.fillRect(0, 0, 30, 30);
          veins(ctx, HIND_TIPS, 'rgba(90,90,80,0.25)', 0.8);
        });
        paint(() => forewing(ctx), fill, () => {
          veins(ctx, FORE_TIPS, 'rgba(90,90,80,0.25)', 0.8);
          ctx.fillStyle = '#3a3a38';
          ctx.beginPath();
          ctx.ellipse(57, -28, 11, 8, -0.4, 0, TAU);
          ctx.fill();
          dots(ctx, [[33, -15], [38, -8, 0.8]], '#2e2e2c', 3.2);
        });
        break;
      }
      default: {
        const edge = shade(color, 0.65);
        const fill = radial(shade(color, 0.3), color, shade(color, -0.2));
        const border = () => {
          ctx.lineWidth = 7;
          ctx.strokeStyle = edge;
          ctx.stroke();
        };
        paint(() => hindwing(ctx, false), fill, () => {
          veins(ctx, HIND_TIPS, edge, 1.2);
          hindwing(ctx, false);
          border();
          dots(ctx, HIND_EDGE, '#fff', 1);
        });
        paint(() => forewing(ctx), fill, () => {
          veins(ctx, FORE_TIPS, edge, 1.2);
          forewing(ctx);
          border();
          dots(ctx, FORE_EDGE, '#fff', 1.1);
        });
      }
    }

    if (bright) {
      // Downstroke: the wing catches the light
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(0, -36, WW, WH);
    }
  });

/** Head, furry thorax, segmented abdomen and clubbed antennae. */
const bodySprite = () =>
  sprite(BW, BH, (ctx) => {
    ctx.translate(12, 20);
    ctx.strokeStyle = '#1c1410';
    ctx.lineWidth = 0.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-0.8, -9);
    ctx.quadraticCurveTo(-3, -15, -6.5, -19);
    ctx.moveTo(0.8, -9);
    ctx.quadraticCurveTo(3, -15, 6.5, -19);
    ctx.stroke();
    ctx.fillStyle = '#1c1410';
    for (const x of [-6.5, 6.5]) {
      ctx.beginPath();
      ctx.arc(x, -19, 1.1, 0, TAU);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, -8, 2.4, 0, TAU);
    ctx.fill();
    const g = ctx.createLinearGradient(-3, 0, 3, 0);
    g.addColorStop(0, '#1a120c');
    g.addColorStop(0.5, '#4a3626');
    g.addColorStop(1, '#1a120c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -1, 2.8, 5, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 13, 2, 10, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,220,0.18)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      ctx.moveTo(-1.7, 7 + i * 3);
      ctx.lineTo(1.7, 7 + i * 3);
    }
    ctx.stroke();
  });

export const butterflies: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  const flock: Fly[] = [];
  const wings = spriteCache((key: string) => {
    const [species, color, bright] = key.split('|');
    return wingSprite(species as Species, color, bright === '1');
  });
  const body = spriteCache(() => bodySprite());
  /** Wing silhouette for the shadow, blurred by drawing it soft-edged. */
  const shadows = spriteCache((key: string) => {
    const [species, color] = key.split('|');
    const wing = wings(`${species}|${color ?? ''}|0`);
    return sprite(WW, WH, (ctx) => {
      if (!wing) return;
      ctx.filter = 'blur(2px)';
      ctx.drawImage(wing, 0, 0, WW, WH);
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, WW, WH);
    });
  });

  const make = (): Fly => {
    const custom = !!(o.colors && o.colors.length);
    const species: Species = custom ? 'custom' : pick(SPECIES);
    return {
      x: rand(0, w),
      y: rand(0, h),
      heading: rand(0, TAU),
      turn: 0,
      speed: rand(45, 85),
      phase: rand(0, TAU),
      rate: rand(8, 12),
      glide: 0,
      flee: 0,
      z: rand(0.65, 1.15),
      species,
      color: custom ? pick(o.colors as string[]) : '',
    };
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      const n = countFor(w, h, 9, o.density);
      while (flock.length < n) flock.push(make());
      flock.length = n;
    },
    update(dt) {
      const s = dt * o.speed;
      const margin = Math.min(60, Math.min(w, h) * 0.2);
      for (const f of flock) {
        // Wander: smoothed random turning, stronger while fleeing
        f.turn += rand(-4, 4) * s * (1 + f.flee);
        f.turn *= Math.pow(0.9, s * 60);
        f.heading += f.turn * s;
        if (f.x < margin || f.x > w - margin || f.y < margin || f.y > h - margin) {
          const want = Math.atan2(h / 2 - f.y, w / 2 - f.x);
          const diff = Math.atan2(Math.sin(want - f.heading), Math.cos(want - f.heading));
          f.heading += diff * Math.min(1, 2.5 * s);
        }
        f.flee = Math.max(0, f.flee - s * 0.9);

        if (f.glide > 0) {
          f.glide -= s;
          // Wings held nearly open with a slight tremble
          f.phase = Math.PI * 2 * Math.round(f.phase / (Math.PI * 2)) + Math.sin(f.glide * 20) * 0.15;
        } else {
          f.phase += f.rate * (1 + f.flee * 1.4) * TAU * s;
          if (f.flee < 0.05 && Math.random() < 0.18 * s) f.glide = rand(0.5, 1.3);
        }
        const v = f.speed * (1 + f.flee * 1.8) * (f.glide > 0 ? 0.85 : 1);
        // Each flap lifts the body a touch: a subtle bob across the heading
        const bob = f.glide > 0 ? 0 : Math.sin(f.phase) * 14;
        f.x += (Math.cos(f.heading) * v - Math.sin(f.heading) * bob + o.wind * 30) * s;
        f.y += (Math.sin(f.heading) * v + Math.cos(f.heading) * bob) * s;
        f.x = clamp(f.x, -40, w + 40);
        f.y = clamp(f.y, -40, h + 40);
      }
    },
    draw(ctx) {
      if (!flock.length) return;
      const m = baseTransform(ctx);
      const b = body('');
      for (const f of flock) {
        // Wingspan ~44-70 px at size 1
        const k = (f.z * o.size * 44) / WW;
        // Seen from above: flat wings are widest, raised wings foreshorten
        // Wings spend longer near flat than raised, and never vanish to a line
        const open = 0.24 + 0.76 * Math.pow(0.5 + 0.5 * Math.cos(f.phase), 0.6);
        const down = Math.sin(f.phase) < 0;
        const img = wings(`${f.species}|${f.color}|${down ? 1 : 0}`);
        const rot = f.heading + Math.PI / 2;
        const sh = shadows(f.species === 'custom' ? `custom|${f.color}` : f.species);
        if (sh) {
          // Soft shadow on the "ground" below: offset, darker the lower it flies
          ctx.globalAlpha = 0.14 * f.z;
          const ox = f.x + 10 * f.z;
          const oy = f.y + 16 * f.z;
          place(ctx, m, ox, oy, rot, -open * k, k);
          ctx.drawImage(sh, 0, -36, WW, WH);
          place(ctx, m, ox, oy, rot, open * k, k);
          ctx.drawImage(sh, 0, -36, WW, WH);
        }
        ctx.globalAlpha = 0.85 + 0.15 * Math.min(1, f.z);
        if (img) {
          place(ctx, m, f.x, f.y, rot, -open * k, k);
          ctx.drawImage(img, 0, -36, WW, WH);
          place(ctx, m, f.x, f.y, rot, open * k, k);
          ctx.drawImage(img, 0, -36, WW, WH);
        }
        if (b) {
          place(ctx, m, f.x, f.y, rot, k, k);
          ctx.drawImage(b, -12, -20, BW, BH);
        }
      }
      resetTransform(ctx, m);
    },
    burst(x, y) {
      for (const f of flock) {
        const dx = f.x - x;
        const dy = f.y - y;
        const d = Math.hypot(dx, dy);
        if (d < 240 * o.size) {
          f.heading = Math.atan2(dy, dx) + rand(-0.4, 0.4);
          f.flee = Math.min(2.4, f.flee + 1.6 * (1 - d / (240 * o.size)) + 0.5);
          f.glide = 0;
        }
      }
    },
  };
};
