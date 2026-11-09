import type { EffectFactory } from '../types';
import { TAU, clamp, countFor, drag, fillPool, glowSprite, rand, spriteCache, stamp } from '../util';

interface Fly {
  x: number;
  y: number;
  heading: number;
  turn: number;
  speed: number;
  /** Seconds into the current blink cycle. */
  clock: number;
  period: number;
  /** Extra glow from being startled by a burst, decays to 0. */
  startle: number;
  pushX: number;
  pushY: number;
  z: number;
}

export const fireflies: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  const swarm: Fly[] = [];

  const color = () => o.colors?.[0] ?? '#d8ff6a';
  const glow = spriteCache((c: string) => glowSprite(c, true, 0.2));

  // With ground on they hover low, like over grass; otherwise anywhere.
  const top = () => (o.ground ? h * 0.3 : 0);

  const make = (): Fly => ({
    x: rand(0, w),
    y: rand(top(), h),
    heading: rand(0, TAU),
    turn: 0,
    speed: rand(12, 32),
    clock: rand(0, 5),
    period: rand(2.5, 5.5),
    startle: 0,
    pushX: 0,
    pushY: 0,
    z: rand(0.6, 1.2),
  });

  /** Firefly blink: quick rise, held glow, slow fade, then dark. */
  const brightness = (f: Fly): number => {
    const p = f.clock / f.period;
    let b = 0;
    if (p < 0.08) b = p / 0.08;
    else if (p < 0.22) b = 1;
    else if (p < 0.45) b = 1 - (p - 0.22) / 0.23;
    return clamp(b + f.startle, 0, 1);
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      fillPool(swarm, countFor(w, h, 45, o.density), make);
    },
    update(dt) {
      const s = dt * o.speed;
      const lo = top();
      for (const f of swarm) {
        // Wander: heading drifts with a smoothed random turn rate
        f.turn += rand(-3, 3) * s;
        f.turn *= 0.96;
        f.heading += f.turn * s;
        // Near an edge: turn smoothly toward the middle of the area
        const margin = 30;
        if (f.x < margin || f.x > w - margin || f.y < lo + margin || f.y > h - margin) {
          const want = Math.atan2((lo + h) / 2 - f.y, w / 2 - f.x);
          const diff = Math.atan2(Math.sin(want - f.heading), Math.cos(want - f.heading));
          f.heading += diff * Math.min(1, 2 * s);
        }

        const k = drag(0.94, s);
        f.pushX *= k;
        f.pushY *= k;
        f.x += (Math.cos(f.heading) * f.speed + o.wind * 20 + f.pushX) * s;
        f.y += (Math.sin(f.heading) * f.speed * 0.7 + f.pushY) * s;
        f.x = clamp(f.x, -10, w + 10);
        f.y = clamp(f.y, lo - 10, h + 10);

        f.clock += s;
        if (f.clock >= f.period) {
          f.clock -= f.period;
          f.period = rand(2.5, 5.5);
        }
        f.startle = Math.max(0, f.startle - s * 0.8);
      }
    },
    draw(ctx) {
      const c = color();
      const g = glow(c);
      ctx.globalCompositeOperation = 'lighter';
      for (const f of swarm) {
        const b = brightness(f);
        // Faint body even when dark, so they don't vanish completely
        ctx.globalAlpha = 0.18 + b * 0.82;
        stamp(ctx, g, f.x, f.y, 4 * f.z * o.size);
        if (b > 0.02) {
          ctx.globalAlpha = b * 0.55;
          stamp(ctx, g, f.x, f.y, 34 * f.z * o.size * (0.7 + b * 0.3));
        }
      }
    },
    burst(x, y) {
      // Startled: nearby fireflies flash and scatter
      for (const f of swarm) {
        const dx = f.x - x;
        const dy = f.y - y;
        const d = Math.hypot(dx, dy);
        if (d < 220 && d > 0) {
          const k = 1 - d / 220;
          f.startle = Math.max(f.startle, k);
          f.pushX += (dx / d) * 160 * k;
          f.pushY += (dy / d) * 160 * k;
        }
      }
    },
  };
};
