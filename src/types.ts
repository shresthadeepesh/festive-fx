/** Names of the effects that ship with festive-fx. */
export type BuiltinEffect =
  | 'snow'
  | 'rain'
  | 'storm'
  | 'fireworks'
  | 'confetti'
  | 'leaves'
  | 'sakura'
  | 'diyas'
  | 'stars'
  | 'fireflies'
  | 'marigold'
  | 'holi'
  | 'kites'
  | 'laxmi-paila';

/** A built-in effect name, or the name of one added with `registerEffect`. */
export type EffectName = BuiltinEffect | (string & {});

/** Tuning knobs every effect reads. Changing them at runtime takes effect on the next frame. */
export interface EffectOptions {
  /** Particle amount multiplier. `0` = nothing spawns automatically (bursts still work). Default `1`. */
  density?: number;
  /** Animation speed multiplier. Default `1`. */
  speed?: number;
  /** Horizontal drift, roughly -1 (left) .. 1 (right). Default `0`. */
  wind?: number;
  /** Particle size multiplier. Default `1`. */
  size?: number;
  /** Override the effect's palette with any CSS colors. */
  colors?: string[];
  /** Text an effect draws, e.g. the year for `newyear`. */
  text?: string;
  /** Glyphs for symbol effects such as `emoji`: `['🪔', '🎉']`. */
  symbols?: string[];
  /**
   * Let effects decorate the edges: snow piles up, rain mists, leaves settle,
   * fireworks get ground fountains (anar), diyas sit along the bottom, marigold
   * garlands hang from the top. Default `true`.
   */
  ground?: boolean;
}

export interface FxOptions extends EffectOptions {
  /**
   * Which effect to render. Default `'snow'`. Pass an array to layer several in
   * one canvas, back to front: `['stars', 'diyas', 'fireworks']`.
   */
  effect?: EffectName | EffectName[];
  /**
   * Element (or CSS selector) the overlay covers. Omit to cover the whole viewport.
   * A statically positioned target gets `position: relative` while the overlay is mounted.
   */
  target?: HTMLElement | string | null;
  /** Node the canvas is appended to (e.g. a shadow root). Default: the target. */
  container?: ParentNode | null;
  /** Pin the canvas to the viewport (`position: fixed`). Default: `true` when no target is given. */
  fullscreen?: boolean;
  /** CSS z-index of the canvas. Default `9999`. */
  zIndex?: number;
  /** Start animating as soon as it is created. Default `true`. */
  autoStart?: boolean;
  /** Fade out and stop after this many milliseconds. Default: run forever. */
  duration?: number;
  /** Clicking/tapping the target triggers `burst()` at the pointer. Default `false`. */
  interactive?: boolean;
  /** Skip animation entirely for users with `prefers-reduced-motion: reduce`. Default `true`. */
  respectReducedMotion?: boolean;
  /** Cap on devicePixelRatio used for the canvas backing store. Default `2`. */
  maxDpr?: number;
}

/** Options as an effect sees them: defaults filled in. The object is shared and mutated on `update()`. */
export interface ResolvedEffectOptions {
  density: number;
  speed: number;
  wind: number;
  size: number;
  colors: string[] | undefined;
  ground: boolean;
  text: string | undefined;
  symbols: string[] | undefined;
}

/** One running effect instance. All coordinates are CSS pixels; `dt` is seconds. */
export interface Effect {
  /** Called on mount, on every resize, and after options change. Adjust population here. */
  resize(width: number, height: number): void;
  update(dt: number): void;
  /** Canvas is already cleared and reset to `source-over`, alpha 1. */
  draw(ctx: CanvasRenderingContext2D): void;
  /** Optional one-shot at a point (fireworks launch, confetti pop, ...). */
  burst?(x: number, y: number): void;
  /**
   * Optional: the pointer moved over the target (`inside` true), or left it
   * (`inside` false). Passive, no `interactive` needed: for effects that react
   * to the cursor, like fog parting or a sparkler trail.
   */
  pointer?(x: number, y: number, inside: boolean): void;
}

export type EffectFactory = (options: ResolvedEffectOptions) => Effect;

export interface FxController {
  /** Start or resume animating. */
  start(): void;
  /** Pause animating; the last frame stays on screen. */
  stop(): void;
  /** Wipe the canvas. */
  clear(): void;
  /** Change options live. Switching `effect` swaps the animation in place. */
  update(options: Partial<Omit<FxOptions, 'target' | 'fullscreen' | 'container'>>): void;
  /** Trigger a one-shot at (x, y) in target-relative CSS pixels; random spot if omitted. */
  burst(x?: number, y?: number): void;
  /** Stop, remove the canvas and all listeners. */
  destroy(): void;
  readonly running: boolean;
  readonly canvas: HTMLCanvasElement | null;
}
