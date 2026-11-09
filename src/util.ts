export const TAU = Math.PI * 2;

export const rand = (min: number, max: number): number => min + Math.random() * (max - min);

export const pick = <T>(items: readonly T[]): T => items[(Math.random() * items.length) | 0];

/** Frame-rate independent drag: `factor` is the per-frame multiplier at 60fps. */
export const drag = (factor: number, dt: number): number => Math.pow(factor, dt * 60);

/**
 * Population for an area: `base` particles on a 1280x720 surface at density 1,
 * scaled by area and density, capped so huge screens don't melt.
 */
export const countFor = (w: number, h: number, base: number, density: number): number => {
  const scaled = base * ((w * h) / (1280 * 720)) * Math.max(0, density);
  return Math.max(0, Math.min(Math.round(scaled), base * 4));
};

/** Resize a pool in place: grow with `make`, shrink by truncating. */
export const fillPool = <T>(pool: T[], n: number, make: () => T): void => {
  while (pool.length < n) pool.push(make());
  pool.length = n;
};

/** Sprites are rasterised at this scale so they stay crisp on HiDPI screens. */
export const SPRITE_SCALE = 2;

/**
 * Pre-render something once to an offscreen canvas so it can be stamped with
 * `drawImage` every frame. `size` is in CSS pixels; the callback draws in that
 * coordinate space.
 */
export const sprite = (
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): HTMLCanvasElement | null => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(width * SPRITE_SCALE));
  c.height = Math.max(1, Math.ceil(height * SPRITE_SCALE));
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = c.getContext('2d');
  } catch {
    ctx = null;
  }
  if (ctx) {
    ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
    paint(ctx);
  }
  return c;
};

/** Memoise sprites by key (usually a color) so palette changes just add entries. */
export const spriteCache = <K>(make: (key: K) => HTMLCanvasElement | null) => {
  const cache = new Map<K, HTMLCanvasElement | null>();
  return (key: K): HTMLCanvasElement | null => {
    let s = cache.get(key);
    if (s === undefined) {
      s = make(key);
      cache.set(key, s);
    }
    return s;
  };
};

/**
 * Soft round glow tinted with any CSS color: an alpha-mask gradient tinted via
 * `source-in`, so there is no dark fringe in normal blending. `hot` adds a
 * white-hot centre (fireworks, flames).
 */
export const glowSprite = (color: string, hot = true, falloff = 0.45) =>
  sprite(32, 32, (ctx) => {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(falloff, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 32, 32);
    if (hot) {
      ctx.globalCompositeOperation = 'source-over';
      const c = ctx.createRadialGradient(16, 16, 0, 16, 16, 5);
      c.addColorStop(0, 'rgba(255,255,255,1)');
      c.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 32, 32);
    }
  });

/** Stamp a square sprite centred on (x, y) with the given CSS-pixel diameter. */
export const stamp = (
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement | null,
  x: number,
  y: number,
  d: number,
): void => {
  if (img) ctx.drawImage(img, x - d / 2, y - d / 2, d, d);
};

/**
 * Smooth, non-repeating-looking wind variation in roughly -1..1.
 * Sum of incommensurate sines: cheap stand-in for Perlin noise.
 */
export const gust = (t: number, seed = 0): number =>
  Math.sin(t * 0.21 + seed) * 0.55 + Math.sin(t * 0.57 + seed * 2.3) * 0.3 + Math.sin(t * 1.43 + seed * 4.1) * 0.15;

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

/** The effect's own palette unless the user passed `colors`. */
export const paletteOr = (colors: string[] | undefined, fallback: readonly string[]): readonly string[] =>
  colors && colors.length ? colors : fallback;

/**
 * Stable in-place filter. Replaces `splice` inside loops, which is O(n) per
 * removal and turns into O(n^2) when many particles die in the same frame.
 * Items appended by `keep` (e.g. child sparks) are visited in the same pass.
 */
export const retain = <T>(items: T[], keep: (item: T) => boolean): void => {
  let j = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (keep(it)) items[j++] = it;
  }
  items.length = j;
};

/** Stroke an [x0, y0, x1, y1, ...] polyline as its own path. */
export const polyline = (ctx: CanvasRenderingContext2D, pts: ArrayLike<number>): void => {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
};

/** Affine 2D matrix in canvas order (a, b, c, d, e, f). */
export interface Mat {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * Set `base * translate(x, y) * rotate(rot) * scale(sx, sy)` in one call.
 * Far cheaper than save/translate/rotate/scale/restore per particle: save and
 * restore copy the whole context state every time.
 */
export const place = (ctx: CanvasRenderingContext2D, m: Mat, x: number, y: number, rot: number, sx = 1, sy = 1): void => {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const la = cos * sx;
  const lb = sin * sx;
  const lc = -sin * sy;
  const ld = cos * sy;
  ctx.setTransform(
    m.a * la + m.c * lb,
    m.b * la + m.d * lb,
    m.a * lc + m.c * ld,
    m.b * lc + m.d * ld,
    m.a * x + m.c * y + m.e,
    m.b * x + m.d * y + m.f,
  );
};

/** Like `place` but scales before rotating: `base * translate * scale * rotate` (things lying flat). */
export const placeFlat = (ctx: CanvasRenderingContext2D, m: Mat, x: number, y: number, rot: number, sx: number, sy: number): void => {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const la = sx * cos;
  const lb = sy * sin;
  const lc = -sx * sin;
  const ld = sy * cos;
  ctx.setTransform(
    m.a * la + m.c * lb,
    m.b * la + m.d * lb,
    m.a * lc + m.c * ld,
    m.b * lc + m.d * ld,
    m.a * x + m.c * y + m.e,
    m.b * x + m.d * y + m.f,
  );
};

/** The current transform, read once per draw so `place` can compose onto it. */
export const baseTransform = (ctx: CanvasRenderingContext2D): Mat => {
  const t = ctx.getTransform?.();
  return t && Number.isFinite(t.a) ? t : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
};

export const resetTransform = (ctx: CanvasRenderingContext2D, m: Mat): void => {
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
};

/** Quantise alpha so particles can share one path per (style, alpha) group. */
export const ALPHA_STEPS = 6;
export const alphaLevel = (a: number): number => clamp(Math.ceil(a * ALPHA_STEPS), 0, ALPHA_STEPS);

let parser: CanvasRenderingContext2D | null | undefined;
const rgbCache = new Map<string, [number, number, number] | null>();

/** Any CSS color to [r, g, b] via the browser's own parser; null if unparseable. */
const toRgb = (color: string): [number, number, number] | null => {
  let rgb = rgbCache.get(color);
  if (rgb !== undefined) return rgb;
  if (parser === undefined) {
    try {
      parser = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    } catch {
      parser = null;
    }
  }
  rgb = null;
  let s = color;
  if (parser) {
    parser.fillStyle = '#000';
    parser.fillStyle = color;
    if (typeof parser.fillStyle === 'string') s = parser.fillStyle;
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const n = parseInt(hex[1], 16);
    rgb = [n >> 16, (n >> 8) & 255, n & 255];
  } else {
    const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
    if (m) rgb = [+m[1], +m[2], +m[3]];
  }
  rgbCache.set(color, rgb);
  return rgb;
};

const shadeCache = new Map<string, string>();

/**
 * `color` mixed toward black (t > 0) or white (t < 0), |t| <= 1, quantised to
 * tenths and cached. Lets a shaded surface be one fill instead of base + overlay.
 */
export const shade = (color: string, t: number): string => {
  const q = Math.round(clamp(t, -1, 1) * 10);
  if (q === 0) return color;
  const key = `${color}|${q}`;
  let out = shadeCache.get(key);
  if (out === undefined) {
    const rgb = toRgb(color);
    if (!rgb) out = color;
    else {
      const k = Math.abs(q) / 10;
      const to = q > 0 ? 0 : 255;
      out = `rgb(${rgb.map((c) => Math.round(c + (to - c) * k)).join(',')})`;
    }
    shadeCache.set(key, out);
  }
  return out;
};
