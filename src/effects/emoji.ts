import type { EffectFactory } from '../types';
import { TAU, baseTransform, countFor, drag, pick, place, rand, resetTransform, retain, sprite, spriteCache } from '../util';

const DEFAULT = ['🎉', '✨', '🪔', '🎊', '💛', '🌼'];
const FONT = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
const MAX_EXTRA = 400;

interface Glyph {
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  s: number;
  rot: number;
  vrot: number;
  sway: number;
  phase: number;
  glyph: string;
  img: HTMLCanvasElement | null;
  extra: boolean;
}

/** Each glyph rasterised once, with a soft drop shadow baked in. */
const glyphSprite = (g: string) =>
  sprite(64, 64, (ctx) => {
    ctx.font = `48px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fillText(g, 32, 35);
  });

export const emoji: EffectFactory = (o) => {
  let w = 0;
  let h = 0;
  let recycled = 0;
  let source: string[] | undefined;
  const items: Glyph[] = [];
  const sprites = spriteCache((g: string) => glyphSprite(g));

  const glyphs = () => o.symbols ?? DEFAULT;

  const assign = (it: Glyph) => {
    it.glyph = pick(glyphs());
    it.img = sprites(it.glyph);
  };

  const make = (extra: boolean, x: number, y: number, vx = 0, vy = 0): Glyph => {
    const z = rand(0.55, 1.2);
    const it: Glyph = {
      x,
      y,
      vx,
      vy,
      z,
      s: rand(26, 40) * z * o.size,
      rot: rand(-0.6, 0.6),
      vrot: rand(-1.2, 1.2),
      sway: rand(10, 30) * z,
      phase: rand(0, TAU),
      glyph: '',
      img: null,
      extra,
    };
    assign(it);
    return it;
  };

  const top = (it: Glyph) => {
    it.x = rand(0, w);
    it.y = rand(-80, -20);
    it.vx = 0;
    it.vy = 0;
    assign(it);
  };

  return {
    resize(nw, nh) {
      w = nw;
      h = nh;
      const want = countFor(w, h, 40, o.density);
      for (; recycled < want; recycled++) items.push(make(false, rand(0, w), rand(-h * 0.2, h)));
      if (recycled > want) {
        let drop = recycled - want;
        retain(items, (it) => it.extra || drop-- <= 0);
        recycled = want;
      }
      items.sort((a, b) => a.z - b.z);
    },
    update(dt) {
      const s = dt * o.speed;
      // New symbol list at runtime: re-skin everything already on screen
      if (o.symbols !== source) {
        source = o.symbols;
        for (const it of items) assign(it);
      }
      const k = drag(0.97, s);
      retain(items, (it) => {
        const terminal = 70 * it.z;
        // Thrown glyphs ease into a gentle terminal fall
        it.vy += (terminal - it.vy) * Math.min(1, 1.4 * s);
        it.vx *= k;
        it.phase += 1.2 * s;
        it.rot += it.vrot * s;
        it.x += (it.vx + Math.sin(it.phase) * it.sway + o.wind * 60 * it.z) * s;
        it.y += it.vy * s;
        if (it.y - it.s > h) {
          if (it.extra) return false;
          top(it);
        } else if (!it.extra && w > 0) {
          if (it.x < -40) it.x += w + 80;
          else if (it.x > w + 40) it.x -= w + 80;
        }
        return true;
      });
    },
    draw(ctx) {
      if (!items.length) return;
      const m = baseTransform(ctx);
      for (const it of items) {
        if (!it.img) continue;
        // Gentle tumble: rotation plus a slight squash as it turns
        place(ctx, m, it.x, it.y, it.rot, 1, 0.9 + 0.1 * Math.cos(it.phase * 1.3));
        ctx.globalAlpha = 0.7 + 0.3 * Math.min(1, it.z);
        ctx.drawImage(it.img, -it.s / 2, -it.s / 2, it.s, it.s);
      }
      resetTransform(ctx, m);
    },
    burst(x, y) {
      const n = Math.min(28, MAX_EXTRA - (items.length - recycled));
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + rand(-0.8, 0.8);
        const v = rand(220, 560);
        items.push(make(true, x, y, Math.cos(a) * v, Math.sin(a) * v));
      }
    },
  };
};
