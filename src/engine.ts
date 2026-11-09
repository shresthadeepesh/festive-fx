import { getEffect } from './effects';
import type { Effect, EffectName, FxController, FxOptions, ResolvedEffectOptions } from './types';

const isBrowser = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined';

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function applyEffectOptions(target: ResolvedEffectOptions, o: Partial<FxOptions>): void {
  if ('density' in o) target.density = Math.max(0, num(o.density, 1));
  if ('speed' in o) target.speed = Math.max(0, num(o.speed, 1));
  if ('wind' in o) target.wind = num(o.wind, 0);
  if ('size' in o) target.size = Math.max(0.1, num(o.size, 1));
  if ('ground' in o) target.ground = o.ground ?? true;
  if ('colors' in o) target.colors = o.colors && o.colors.length ? [...o.colors] : undefined;
}

function resolveTarget(t: FxOptions['target']): HTMLElement | null {
  if (!t) return null;
  if (typeof t === 'string') {
    const el = document.querySelector<HTMLElement>(t);
    if (!el) throw new Error(`[festive-fx] target "${t}" not found`);
    return el;
  }
  return t;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function noopController(): FxController {
  const noop = () => {};
  return { start: noop, stop: noop, clear: noop, update: noop, burst: noop, destroy: noop, running: false, canvas: null };
}

type EffectSpec = EffectName | EffectName[];

const specKey = (spec: EffectSpec): string => (Array.isArray(spec) ? spec.join(',') : spec);

function instantiateOne(name: EffectName, opts: ResolvedEffectOptions): Effect {
  const factory = getEffect(name);
  if (!factory) throw new Error(`[festive-fx] unknown effect "${name}". Register it with registerEffect().`);
  return factory(opts);
}

/** One effect, or several layered back to front that share options and bursts. */
function instantiate(spec: EffectSpec, opts: ResolvedEffectOptions): Effect {
  const names = Array.isArray(spec) ? spec : [spec];
  if (names.length === 0) throw new Error('[festive-fx] effect list is empty');
  if (names.length === 1) return instantiateOne(names[0], opts);
  const layers = names.map((n) => instantiateOne(n, opts));
  return {
    resize: (w, h) => layers.forEach((l) => l.resize(w, h)),
    update: (dt) => layers.forEach((l) => l.update(dt)),
    draw(ctx) {
      for (const l of layers) {
        // Each layer gets the same clean state the engine promises a single effect.
        ctx.save();
        l.draw(ctx);
        ctx.restore();
      }
    },
    burst: (x, y) => layers.forEach((l) => l.burst?.(x, y)),
  };
}

/**
 * Mount an effect overlay. Safe to call during SSR (returns an inert controller).
 *
 * @example
 * const fx = createFx({ effect: 'snow' });          // whole viewport
 * const fx = createFx({ effect: 'rain', target: '#hero', wind: 0.4 });
 * fx.update({ effect: 'fireworks' });
 * fx.destroy();
 */
export function createFx(options: FxOptions = {}): FxController {
  if (!isBrowser()) return noopController();

  const host = resolveTarget(options.target) ?? document.body;
  const fullscreen = options.fullscreen ?? !options.target;
  const maxDpr = num(options.maxDpr, 2);
  const respectRM = options.respectReducedMotion ?? true;

  const eff: ResolvedEffectOptions = { density: 1, speed: 1, wind: 0, size: 1, colors: undefined, ground: true };
  applyEffectOptions(eff, options);
  let effectName = specKey(options.effect ?? 'snow');
  let effect = instantiate(options.effect ?? 'snow', eff);

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'festive-fx-canvas';
  Object.assign(canvas.style, {
    position: fullscreen ? 'fixed' : 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    display: 'block',
    zIndex: String(num(options.zIndex, 9999)),
    transition: 'opacity 600ms ease',
  } satisfies Partial<CSSStyleDeclaration>);

  let restorePosition: string | null = null;
  if (!fullscreen && ['', 'static'].includes(getComputedStyle(host).position)) {
    restorePosition = host.style.position;
    host.style.position = 'relative';
  }
  (options.container ?? host).appendChild(canvas);

  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }

  let w = 0;
  let h = 0;
  let dpr = 0;
  let raf = 0;
  let last = 0;
  let running = false;
  let destroyed = false;
  /** False while a wrapped target is scrolled out of view. */
  let onScreen = true;
  let durationTimer: ReturnType<typeof setTimeout> | undefined;

  const measure = () => {
    let nw: number;
    let nh: number;
    if (fullscreen) {
      nw = window.innerWidth;
      nh = window.innerHeight;
    } else {
      const r = host.getBoundingClientRect();
      nw = r.width;
      nh = r.height;
    }
    const ndpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    // Assigning canvas.width reallocates the backing store and wipes context
    // state, so skip it when observers fire without a real size change.
    if (nw === w && nh === h && ndpr === dpr) return;
    w = nw;
    h = nh;
    dpr = ndpr;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    effect.resize(w, h);
  };

  const render = () => {
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    effect.draw(ctx);
  };

  const frame = (t: number) => {
    raf = requestAnimationFrame(frame);
    // Clamp so a long pause (background tab, debugger) doesn't teleport particles.
    const dt = last ? Math.min((t - last) / 1000, 0.05) : 1 / 60;
    last = t;
    effect.update(dt);
    render();
  };

  const loop = (on: boolean) => {
    if (on && !raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    } else if (!on && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const sync = () => loop(running && onScreen && !document.hidden);
  document.addEventListener('visibilitychange', sync);

  // A wrapped target scrolled out of view costs nothing: pause until it's back.
  let io: IntersectionObserver | null = null;
  if (!fullscreen && typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      sync();
    });
    io.observe(host);
  }

  let ro: ResizeObserver | null = null;
  const onWindowResize = () => measure();
  if (!fullscreen && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => measure());
    ro.observe(host);
  } else {
    window.addEventListener('resize', onWindowResize);
  }

  let interactive = !!options.interactive;
  const onPointer = (e: PointerEvent) => {
    if (!interactive) return;
    // Clicking a real control shouldn't also launch a rocket.
    const el = e.target as Element | null;
    if (el?.closest?.('button, a, input, select, textarea, label, [contenteditable], [role="button"]')) return;
    const r = canvas.getBoundingClientRect();
    effect.burst?.(e.clientX - r.left, e.clientY - r.top);
  };
  const pointerTarget: EventTarget = fullscreen ? window : host;
  pointerTarget.addEventListener('pointerdown', onPointer as EventListener);

  const scheduleDuration = (ms: number | undefined) => {
    clearTimeout(durationTimer);
    if (ms && ms > 0) {
      durationTimer = setTimeout(() => {
        canvas.style.opacity = '0';
        durationTimer = setTimeout(() => controller.stop(), 650);
      }, ms);
    }
  };

  const controller: FxController = {
    start() {
      if (destroyed || running) return;
      if (respectRM && prefersReducedMotion()) return;
      running = true;
      canvas.style.opacity = '1';
      sync();
    },
    stop() {
      running = false;
      loop(false);
    },
    clear() {
      ctx?.clearRect(0, 0, w, h);
    },
    update(next) {
      if (destroyed) return;
      applyEffectOptions(eff, next);
      if (next.effect && specKey(next.effect) !== effectName) {
        effect = instantiate(next.effect, eff);
        effectName = specKey(next.effect);
      }
      if ('zIndex' in next) canvas.style.zIndex = String(num(next.zIndex, 9999));
      if ('interactive' in next) interactive = !!next.interactive;
      if ('duration' in next) scheduleDuration(next.duration);
      effect.resize(w, h);
      if (!running) render();
    },
    burst(x, y) {
      if (destroyed || !effect.burst) return;
      effect.burst(x ?? w * (0.2 + Math.random() * 0.6), y ?? h * (0.2 + Math.random() * 0.3));
      // A burst on a paused overlay should still be seen.
      if (!running) controller.start();
    },
    destroy() {
      if (destroyed) return;
      controller.stop();
      destroyed = true;
      clearTimeout(durationTimer);
      document.removeEventListener('visibilitychange', sync);
      io?.disconnect();
      window.removeEventListener('resize', onWindowResize);
      pointerTarget.removeEventListener('pointerdown', onPointer as EventListener);
      ro?.disconnect();
      canvas.remove();
      if (restorePosition !== null) host.style.position = restorePosition;
    },
    get running() {
      return running;
    },
    get canvas() {
      return destroyed ? null : canvas;
    },
  };

  measure();
  if (options.autoStart ?? true) controller.start();
  scheduleDuration(options.duration);
  return controller;
}
