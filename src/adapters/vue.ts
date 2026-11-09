import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type App, type PropType } from 'vue';
import { createFx } from '../engine';
import type { EffectName, FxController, FxOptions } from '../types';

/**
 * ```vue
 * <FestiveFx effect="snow" :density="1.5"><Hero /></FestiveFx>
 * <FestiveFx effect="fireworks" fullscreen interactive />
 * ```
 * Exposes `start()`, `stop()`, `burst(x, y)` and `controller()` via template ref.
 */
export const FestiveFx = defineComponent({
  name: 'FestiveFx',
  props: {
    effect: { type: String as PropType<EffectName>, default: 'snow' },
    density: Number,
    speed: Number,
    wind: Number,
    size: Number,
    colors: Array as PropType<string[]>,
    zIndex: Number,
    duration: Number,
    interactive: { type: Boolean, default: false },
    ground: { type: Boolean, default: true },
    fullscreen: { type: Boolean, default: false },
    autoStart: { type: Boolean, default: true },
    respectReducedMotion: { type: Boolean, default: true },
  },
  setup(props, { slots, expose }) {
    const el = ref<HTMLElement | null>(null);
    let fx: FxController | null = null;

    const live = (): Partial<FxOptions> => ({
      effect: props.effect,
      density: props.density,
      speed: props.speed,
      wind: props.wind,
      size: props.size,
      colors: props.colors,
      zIndex: props.zIndex,
      duration: props.duration,
      interactive: props.interactive,
      ground: props.ground,
    });

    const mount = () => {
      fx?.destroy();
      fx = createFx({
        ...live(),
        target: props.fullscreen ? null : el.value,
        fullscreen: props.fullscreen,
        autoStart: props.autoStart,
        respectReducedMotion: props.respectReducedMotion,
      });
    };

    onMounted(mount);
    onBeforeUnmount(() => {
      fx?.destroy();
      fx = null;
    });
    watch(live, (o) => fx?.update(o), { deep: true });
    watch(() => [props.fullscreen, props.autoStart, props.respectReducedMotion], mount);

    expose({
      start: () => fx?.start(),
      stop: () => fx?.stop(),
      burst: (x?: number, y?: number) => fx?.burst(x, y),
      controller: () => fx,
    });

    return () => h('div', { ref: el, style: { position: 'relative' } }, slots.default?.());
  },
});

/** `app.use(FestiveFxPlugin)` registers `<FestiveFx>` globally. */
export const FestiveFxPlugin = {
  install(app: App) {
    app.component('FestiveFx', FestiveFx);
  },
};

export type { FxController, FxOptions } from '../types';
