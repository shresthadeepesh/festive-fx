// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { celebrate, createFx, getEffect, listEffects, registerEffect } from '../src';
import type { ResolvedEffectOptions } from '../src';
import '../src/element';

/** Records every numeric argument so we can assert nothing went NaN. */
function fakeCtx() {
  const nums: number[] = [];
  const calls: string[] = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push(String(prop));
        for (const a of args) if (typeof a === 'number') nums.push(a);
        return gradient;
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, nums, calls };
}

const opts = (o: Partial<ResolvedEffectOptions> = {}): ResolvedEffectOptions => ({
  density: 1,
  speed: 1,
  wind: 0,
  size: 1,
  colors: undefined,
  ground: true,
  text: undefined,
  symbols: undefined,
  ...o,
});

// Sprites are pre-rendered on offscreen canvases; give them a recording context too.
HTMLCanvasElement.prototype.getContext = (() => fakeCtx().ctx) as never;

describe('built-in effects', () => {
  const names = [
    'snow', 'rain', 'storm', 'fireworks', 'confetti', 'leaves', 'sakura', 'diyas',
    'stars', 'fireflies', 'marigold', 'holi', 'kites',
    'laxmi-paila', 'rangoli', 'prayer-flags', 'lali-gurans', 'coins', 'teej', 'chhath',
    'christmas', 'newyear', 'eid', 'lunar-new-year', 'hearts',
    'aurora', 'fog', 'bubbles', 'butterflies', 'hail', 'sunbeams',
    'balloons', 'sparkler', 'emoji',
  ];

  it('are registered, plus festival aliases', () => {
    for (const n of [...names, 'rockets', 'diwali', 'tihar', 'deepawali', 'lanterns', 'petals', 'dashain', 'gulal']) {
      expect(listEffects()).toContain(n);
    }
  });

  for (const name of names) {
    for (const wind of [-1, 0, 1]) {
      it(`${name} (wind ${wind}) runs 20s of frames and draws finite numbers`, () => {
        const effect = getEffect(name)!(opts({ wind, density: 2 }));
        effect.resize(800, 600);
        const { ctx, nums, calls } = fakeCtx();
        for (let i = 0; i < 1200; i++) {
          effect.update(1 / 60);
          if (i % 100 === 0) effect.burst?.(400, 300);
        }
        effect.draw(ctx);
        expect(calls.length).toBeGreaterThan(0);
        expect(nums.every(Number.isFinite)).toBe(true);
      });
    }
  }

  it('survives tiny and zero-size surfaces', () => {
    for (const name of names) {
      for (const [w, h] of [[0, 0], [1, 1], [120, 80]]) {
        const effect = getEffect(name)!(opts());
        effect.resize(w, h);
        for (let i = 0; i < 120; i++) effect.update(1 / 60);
        effect.burst?.(w / 2, h / 2);
        effect.pointer?.(w / 2, h / 2, true);
        const { ctx, nums } = fakeCtx();
        effect.draw(ctx);
        expect([name, w, nums.every(Number.isFinite)]).toEqual([name, w, true]);
      }
    }
  });

  it('density 0 with no ground spawns nothing on its own', () => {
    for (const name of names) {
      const effect = getEffect(name)!(opts({ density: 0, ground: false }));
      effect.resize(800, 600);
      for (let i = 0; i < 300; i++) effect.update(1 / 60);
      const { ctx, calls } = fakeCtx();
      effect.draw(ctx);
      const marks = ['arc', 'fillRect', 'stroke', 'fill', 'drawImage'];
      expect([name, calls.filter((c) => marks.includes(c))]).toEqual([name, []]);
    }
  });

  it('density scales population', () => {
    const count = (density: number) => {
      const effect = getEffect('snow')!(opts({ density }));
      effect.resize(1280, 720);
      const { ctx, calls } = fakeCtx();
      effect.draw(ctx);
      return calls.filter((c) => c === 'drawImage').length;
    };
    const ratio = count(2) / count(1);
    expect(ratio).toBeGreaterThan(1.9);
    expect(ratio).toBeLessThan(2.1);
  });

  it('fireworks survive a long dense show (every shell type, particle cap)', () => {
    const effect = getEffect('fireworks')!(opts({ density: 3 }));
    effect.resize(1280, 720);
    const { ctx, nums } = fakeCtx();
    for (let i = 0; i < 60 * 60; i++) {
      effect.update(1 / 60);
      if (i % 30 === 0) effect.burst!(640, 200);
    }
    effect.draw(ctx);
    expect(nums.every(Number.isFinite)).toBe(true);
  });

  it('snow piles up on the ground only when ground is on', () => {
    const run = (ground: boolean) => {
      const effect = getEffect('snow')!(opts({ density: 2, ground }));
      effect.resize(400, 300);
      for (let i = 0; i < 60 * 20; i++) effect.update(1 / 60);
      const { ctx, calls } = fakeCtx();
      effect.draw(ctx);
      return calls.includes('closePath');
    };
    expect(run(true)).toBe(true);
    expect(run(false)).toBe(false);
  });
});

describe('createFx', () => {
  beforeAll(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts a fixed, click-through canvas over the viewport by default', () => {
    const fx = createFx({ effect: 'snow' });
    const c = fx.canvas!;
    expect(c.parentElement).toBe(document.body);
    expect(c.style.position).toBe('fixed');
    expect(c.style.pointerEvents).toBe('none');
    expect(c.getAttribute('aria-hidden')).toBe('true');
    expect(fx.running).toBe(true);
    fx.destroy();
    expect(document.querySelector('canvas')).toBeNull();
    expect(fx.canvas).toBeNull();
  });

  it('covers a target element and restores its position on destroy', () => {
    document.body.innerHTML = '<div id="hero"></div>';
    const hero = document.getElementById('hero')!;
    const fx = createFx({ effect: 'rain', target: '#hero' });
    expect(hero.style.position).toBe('relative');
    expect(fx.canvas!.style.position).toBe('absolute');
    fx.destroy();
    expect(hero.style.position).toBe('');
  });

  it('switches effects live and rejects unknown ones', () => {
    const fx = createFx({ effect: 'snow' });
    expect(() => fx.update({ effect: 'fireworks', density: 2 })).not.toThrow();
    expect(() => fx.update({ effect: 'nope' })).toThrow(/unknown effect/);
    fx.destroy();
  });

  it('layers several effects in one canvas', () => {
    const fx = createFx({ effect: ['stars', 'diyas', 'fireworks'] });
    expect(document.querySelectorAll('canvas').length).toBe(1);
    expect(() => fx.burst(100, 100)).not.toThrow();
    expect(() => fx.update({ effect: ['kites', 'marigold'] })).not.toThrow();
    expect(() => fx.update({ effect: ['snow', 'nope'] })).toThrow(/unknown effect/);
    fx.destroy();
  });

  it('throws a clear error for a missing target selector', () => {
    expect(() => createFx({ target: '#missing' })).toThrow(/not found/);
  });

  it('honours prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const fx = createFx({ effect: 'snow' });
    expect(fx.running).toBe(false);
    fx.destroy();
    const forced = createFx({ effect: 'snow', respectReducedMotion: false });
    expect(forced.running).toBe(true);
    forced.destroy();
    vi.unstubAllGlobals();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  });

  it('accepts custom effects', () => {
    const draw = vi.fn();
    registerEffect('custom', () => ({ resize() {}, update() {}, draw }));
    const fx = createFx({ effect: 'custom', autoStart: false });
    fx.update({ speed: 2 }); // renders once while paused
    expect(draw).toHaveBeenCalled();
    fx.destroy();
  });

  it('forwards pointer moves and leaves to effects that want them, through layers', () => {
    const pointer = vi.fn();
    registerEffect('cursor', () => ({ resize() {}, update() {}, draw() {}, pointer }));
    document.body.innerHTML = '<div id="t"></div>';
    const host = document.getElementById('t')!;
    const fx = createFx({ effect: ['snow', 'cursor'], target: host });
    host.dispatchEvent(new MouseEvent('pointermove', { clientX: 12, clientY: 34 }));
    expect(pointer).toHaveBeenLastCalledWith(12, 34, true);
    host.dispatchEvent(new MouseEvent('pointerleave'));
    expect(pointer).toHaveBeenLastCalledWith(-1, -1, false);
    fx.destroy();
    host.dispatchEvent(new MouseEvent('pointermove', { clientX: 1, clientY: 1 }));
    expect(pointer).toHaveBeenCalledTimes(2); // listeners removed on destroy
  });

  it('passes text and symbols through to effects, live', () => {
    let seen: ResolvedEffectOptions | null = null;
    registerEffect('spy', (o) => ((seen = o), { resize() {}, update() {}, draw() {} }));
    const fx = createFx({ effect: 'spy', text: '2083', symbols: ['🪔', '🎉'] });
    expect(seen!.text).toBe('2083');
    expect(seen!.symbols).toEqual(['🪔', '🎉']);
    fx.update({ text: '', symbols: [] });
    expect(seen!.text).toBeUndefined();
    expect(seen!.symbols).toBeUndefined();
    fx.destroy();
  });

  it('celebrate() fires a confetti overlay that removes itself', () => {
    vi.useFakeTimers();
    try {
      const fx = celebrate({ duration: 1000 });
      expect(fx.canvas).not.toBeNull();
      expect(document.querySelectorAll('canvas').length).toBe(1);
      vi.advanceTimersByTime(1100);
      expect(fx.canvas).toBeNull();
      expect(document.querySelectorAll('canvas').length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('<festive-fx>', () => {
  it('wraps children, draws in its shadow root, reacts to attributes', () => {
    document.body.innerHTML = '<festive-fx effect="confetti" density="0.5"><p>hi</p></festive-fx>';
    const el = document.querySelector('festive-fx')!;
    const canvas = el.shadowRoot!.querySelector('canvas')!;
    expect(canvas.style.position).toBe('absolute');
    expect(el.querySelector('p')!.textContent).toBe('hi');
    expect(el.controller!.running).toBe(true);

    el.setAttribute('symbols', '🪔, 🎉');
    el.setAttribute('effect', 'stars, fireflies');
    expect(el.controller!.running).toBe(true);
    el.setAttribute('effect', 'leaves');
    el.setAttribute('fullscreen', '');
    expect(el.shadowRoot!.querySelector('canvas')!.style.position).toBe('fixed');

    el.remove();
    expect(el.controller).toBeNull();
  });
});
