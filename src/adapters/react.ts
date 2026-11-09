import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createFx } from '../engine';
import type { FxController, FxOptions } from '../types';

export type FestiveFxOptions = Omit<FxOptions, 'target' | 'container'>;

const liveOptions = ({ fullscreen: _f, autoStart: _a, respectReducedMotion: _r, maxDpr: _m, ...rest }: FestiveFxOptions) =>
  rest;

/**
 * Attach an effect to an element ref (or the viewport if `ref` is omitted).
 * Returns a ref to the controller for `burst()`, `stop()` etc.
 */
export function useFestiveFx(
  options: FestiveFxOptions,
  ref?: RefObject<HTMLElement | null>,
): RefObject<FxController | null> {
  const fx = useRef<FxController | null>(null);
  const fullscreen = options.fullscreen ?? !ref;

  // Structural options recreate the overlay; everything else is patched live below.
  useEffect(() => {
    const target = fullscreen ? null : ref?.current ?? null;
    if (!fullscreen && !target) return;
    fx.current = createFx({ ...options, target, fullscreen });
    return () => {
      fx.current?.destroy();
      fx.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen, options.autoStart, options.respectReducedMotion, options.maxDpr]);

  const live = JSON.stringify(liveOptions(options));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    fx.current?.update(JSON.parse(live));
  }, [live]);

  return fx;
}

export interface FestiveFxProps extends FestiveFxOptions {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Wraps children and draws the effect over them.
 *
 * ```tsx
 * <FestiveFx effect="fireworks" interactive><Hero /></FestiveFx>
 * <FestiveFx effect="snow" fullscreen />
 * ```
 *
 * The forwarded ref is the controller (`ref.current.burst()`).
 */
export const FestiveFx = forwardRef<FxController, FestiveFxProps>(function FestiveFx(
  { children, className, style, ...options },
  ref,
) {
  const el = useRef<HTMLDivElement | null>(null);
  const fx = useFestiveFx(options, options.fullscreen ? undefined : el);
  // Stable handle that forwards to whichever controller is currently mounted.
  useImperativeHandle(
    ref,
    (): FxController => ({
      start: () => fx.current?.start(),
      stop: () => fx.current?.stop(),
      clear: () => fx.current?.clear(),
      update: (o) => fx.current?.update(o),
      burst: (x, y) => fx.current?.burst(x, y),
      destroy: () => fx.current?.destroy(),
      get running() {
        return fx.current?.running ?? false;
      },
      get canvas() {
        return fx.current?.canvas ?? null;
      },
    }),
    [],
  );
  return createElement('div', { ref: el, className, style: { position: 'relative', ...style } }, children);
});

export type { FxController, FxOptions } from '../types';
