import { createFx } from './engine';
import type { FxController, FxOptions } from './types';

const NUMERIC = ['density', 'speed', 'wind', 'size', 'z-index', 'duration'] as const;
const LIVE = ['effect', 'colors', 'interactive', 'ground', ...NUMERIC] as const;
const STRUCTURAL = ['fullscreen', 'autostart', 'respect-reduced-motion'] as const;

const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

// Keep the module importable during SSR, where HTMLElement does not exist.
const Base = (typeof HTMLElement !== 'undefined' ? HTMLElement : class {}) as typeof HTMLElement;

/**
 * `<festive-fx effect="snow" density="1.5">...your content...</festive-fx>`
 *
 * Wraps its children and draws the effect over them. Add `fullscreen` to cover
 * the viewport instead. Works anywhere custom elements do: plain HTML, Angular,
 * Vue, Svelte, Solid, Lit, React 19+.
 */
export class FestiveFxElement extends Base {
  static observedAttributes = [...LIVE, ...STRUCTURAL];

  private fx: FxController | null = null;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>:host{display:block;position:relative}:host([hidden]){display:none}</style><slot></slot>';
  }

  /** The underlying controller, for anything the attributes don't cover. */
  get controller(): FxController | null {
    return this.fx;
  }

  connectedCallback(): void {
    this.mount();
  }

  disconnectedCallback(): void {
    this.fx?.destroy();
    this.fx = null;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (!this.fx || oldValue === newValue) return;
    if ((STRUCTURAL as readonly string[]).includes(name)) {
      this.mount();
    } else {
      this.fx.update(this.read([name]));
    }
  }

  start(): void {
    this.fx?.start();
  }

  stop(): void {
    this.fx?.stop();
  }

  burst(x?: number, y?: number): void {
    this.fx?.burst(x, y);
  }

  private mount(): void {
    this.fx?.destroy();
    const fullscreen = this.hasAttribute('fullscreen');
    this.fx = createFx({
      ...this.read(LIVE),
      target: fullscreen ? null : this,
      container: this.shadowRoot,
      fullscreen,
      autoStart: this.getAttribute('autostart') !== 'false',
      respectReducedMotion: this.getAttribute('respect-reduced-motion') !== 'false',
    });
  }

  private read(names: readonly string[]): Partial<FxOptions> {
    const out: Record<string, unknown> = {};
    for (const name of names) {
      const raw = this.getAttribute(name);
      const key = camel(name);
      if (name === 'interactive') out[key] = raw !== null && raw !== 'false';
      else if (name === 'ground') out[key] = raw !== 'false';
      else if (raw === null) out[key] = undefined;
      else if (name === 'colors') out[key] = raw.split(',').map((c) => c.trim()).filter(Boolean);
      else if ((NUMERIC as readonly string[]).includes(name)) out[key] = parseFloat(raw);
      else out[key] = raw;
    }
    if ('effect' in out && !out.effect) delete out.effect;
    return out as Partial<FxOptions>;
  }
}

/** Register the element. Called automatically on import; call yourself for a custom tag name. */
export function defineFestiveFx(tagName = 'festive-fx'): void {
  if (typeof customElements === 'undefined' || customElements.get(tagName)) return;
  // Each tag needs its own constructor.
  customElements.define(tagName, tagName === 'festive-fx' ? FestiveFxElement : class extends FestiveFxElement {});
}

defineFestiveFx();

declare global {
  interface HTMLElementTagNameMap {
    'festive-fx': FestiveFxElement;
  }
}
