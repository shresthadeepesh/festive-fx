import { createFx } from './engine';
import type { FxController } from './types';

export interface CelebrateOptions {
  /** Milliseconds before the overlay removes itself. Default `5000`. */
  duration?: number;
  colors?: string[];
  zIndex?: number;
  /** Default `true`: nothing plays for reduced-motion users. */
  respectReducedMotion?: boolean;
}

/**
 * One-shot party popper for "order placed" moments: confetti cannons fire
 * from both bottom corners in two volleys, then the overlay cleans itself up.
 *
 * @example
 * button.onclick = () => celebrate();
 */
export function celebrate(options: CelebrateOptions = {}): FxController {
  const fx = createFx({
    effect: 'confetti',
    density: 0,
    colors: options.colors,
    zIndex: options.zIndex,
    respectReducedMotion: options.respectReducedMotion ?? true,
  });
  if (!fx.canvas || typeof window === 'undefined') return fx;
  const volley = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    fx.burst(w * 0.04, h * 0.98);
    fx.burst(w * 0.96, h * 0.98);
  };
  volley();
  const second = setTimeout(volley, 280);
  const end = setTimeout(() => fx.destroy(), options.duration ?? 5000);
  const destroy = fx.destroy;
  // Clear pending timers if the caller tears it down early
  fx.destroy = () => {
    clearTimeout(second);
    clearTimeout(end);
    destroy();
  };
  return fx;
}
