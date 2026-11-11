# festive-fx

[![festive-fx landing page: Tihar rockets, an anar fountain, sky lanterns and a row of diyas over a night sky](https://raw.githubusercontent.com/shresthadeepesh/festive-fx/main/docs/screenshots/hero.webp)](https://shresthadeepesh.github.io/festive-fx/)

**[Live demo and playground →](https://shresthadeepesh.github.io/festive-fx/)**

Lightweight, dependency-free festive overlays for any frontend: **Tihar / Deepawali rockets**, **diyas and sky lanterns**, **marigold garlands**, **Dashain kites**, **Holi colours**, **snow**, **rain**, **thunderstorms**, **stars**, **fireflies**, **confetti**, **falling leaves** and **sakura petals**. Layer several in one canvas.

- One canvas, `pointer-events: none`, never blocks your UI
- Works in React, Vue, Angular, Svelte, Solid, plain HTML. The core is vanilla TS, plus a Web Component and thin React and Vue wrappers
- ~45 KB minified for the drop-in script build, with zero runtime dependencies
- HiDPI aware, respects `prefers-reduced-motion`, safe to import during SSR
- Pauses in background tabs and while a wrapped target is scrolled off-screen
- Batched drawing: thousands of firework sparks render in a few dozen canvas calls
- Add your own effects with `registerEffect()`

```sh
npm i festive-fx
```

## Demo

Every effect runs live in the [gallery](https://shresthadeepesh.github.io/festive-fx/#gallery). Click a card to trigger its burst:

[![Gallery of live effect cards: fireworks, diyas, marigold garlands, kites, Holi colours, confetti, snow and rain](https://raw.githubusercontent.com/shresthadeepesh/festive-fx/main/docs/screenshots/gallery.webp)](https://shresthadeepesh.github.io/festive-fx/#gallery)

The [playground](https://shresthadeepesh.github.io/festive-fx/#playground) layers effects, tunes density, speed, wind, size and colours, and writes the code for HTML, JavaScript, React, Vue or Angular:

[![Playground with fireworks, stars and diyas layered over a mock app, tuning controls, and generated HTML code](https://raw.githubusercontent.com/shresthadeepesh/festive-fx/main/docs/screenshots/playground.webp)](https://shresthadeepesh.github.io/festive-fx/#playground)

## Effects

| name | aliases | `burst(x, y)` |
| --- | --- | --- |
| `snow` | | none |
| `rain` | | splash at point |
| `storm` | `thunderstorm` | lightning strike at x |
| `fireworks` | `rockets`, `diwali`, `deepawali`, `tihar` | launches a rocket that bursts at (x, y) |
| `diyas` | `lanterns`, `lights` | releases a sky lantern |
| `confetti` | | confetti cannon pop |
| `leaves` | `autumn` | puff of air blows nearby leaves away |
| `sakura` | `petals` | puff of air blows nearby petals away |
| `marigold` | `sayapatri`, `garland` | throws a handful of petals |
| `kites` | `changa`, `dashain` | cuts the nearest kite loose, or launches a new one |
| `holi` | `gulal` | throws a fistful of colour |
| `stars` | `night` | shooting star from that point |
| `fireflies` | | nearby fireflies flash and scatter |

### What's in each

- **snow**: three depth layers (far haze, soft flakes, rotating six-armed crystals), parallax, natural gusts, and a drift that piles up along the bottom edge.
- **rain / storm**: near and far drops with bright leading heads, crown splashes with double ripples, and low ground mist. `storm` adds heavier slanted rain and branching lightning that lights up the whole sky.
- **fireworks**: rockets with wobble and spark trails, then ten shell types: peony, chrysanthemum (glitter), ring, double ring, gold willow, palm, crossette (stars split into crosses), strobe, colour-change and multi-break. Bursts light up the sky and leave drifting smoke, and anar (flower-pot) fountains erupt from the ground.
- **diyas**: a row of painted clay oil lamps with layered, flickering flames and warm light pools, rising embers, and paper sky lanterns that drift upward and shrink into the distance.
- **confetti**: rectangles, squares, circles, triangles, stars and curling streamers. Pieces flip in 3D with a darker back face, and gold/silver foil pieces glint.
- **marigold**: falling petals and whole ruffled flowers, garlands (toran) swagged along the top edge with hanging strands and mango leaves, petals that settle on the ground.
- **kites**: Dashain-style paper kites in two-tone patterns with bamboo frames and tassels, strings running down to unseen flyers, loop-the-loop dives, and kites cut loose ("chet!") that drift away trailing string before a new one launches.
- **holi**: fistfuls of gulal thrown as expanding powder clouds that mix colours, flying grains, and colour splats with satellite drops and drips.
- **stars**: twinkling field (denser toward the top, a few tinted blue or warm, the brightest with spikes) and shooting stars.
- **fireflies**: wandering glow-worms with a real firefly blink rhythm; with `ground` on they hover low.
- **leaves / sakura**: maple, oak and beech leaves, or cherry-blossom petals, with veins, a paler underside, depth layers and gusts that lift them. They settle on the ground and fade.

## Layering

Pass an array to draw several effects in one canvas, back to front. They share options and every layer gets the burst:

```js
createFx({ effect: ['stars', 'diyas', 'fireworks'], interactive: true }); // Tihar night
createFx({ effect: ['kites', 'marigold'] });                               // Dashain afternoon
```

```html
<festive-fx effect="stars, fireflies" fullscreen></festive-fx>
```

## Options

| option | default | |
| --- | --- | --- |
| `effect` | `'snow'` | effect name, or an array to layer several |
| `target` | viewport | element or CSS selector to cover |
| `fullscreen` | `true` when no target | `position: fixed` over the viewport |
| `density` | `1` | particle amount; `0` means only manual bursts |
| `speed` | `1` | animation speed |
| `wind` | `0` | `-1` (left) to `1` (right) |
| `size` | `1` | particle size |
| `colors` | per effect | array of CSS colors |
| `ground` | `true` | edge decorations: snow drifts, rain mist, settled leaves/petals, anar fountains, the diya row, marigold garlands along the top |
| `zIndex` | `9999` | canvas z-index |
| `interactive` | `false` | click/tap triggers `burst()` at pointer |
| `duration` | forever | ms, then fades out and stops |
| `autoStart` | `true` | |
| `respectReducedMotion` | `true` | don't animate for reduced-motion users |
| `maxDpr` | `2` | devicePixelRatio cap |

The controller exposes `start()`, `stop()`, `clear()`, `update(opts)`, `burst(x?, y?)`, `destroy()`, plus `running` and `canvas`.

## Vanilla JS / any framework

```js
import { createFx } from 'festive-fx';

const fx = createFx({ effect: 'snow' });               // whole page
const hero = createFx({ effect: 'rain', target: '#hero', wind: 0.4 });

fx.update({ effect: 'fireworks', interactive: true });  // swap live
fx.burst();                                              // one rocket
fx.destroy();
```

## Web Component (Angular, Vue, Svelte, plain HTML, ...)

```js
import 'festive-fx/element'; // registers <festive-fx>
```

```html
<!-- wraps its content -->
<festive-fx effect="snow" density="1.5" wind="0.3">
  <section class="hero">...</section>
</festive-fx>

<!-- covers the viewport -->
<festive-fx effect="tihar" fullscreen interactive colors="#ffd700,#ff9933,#ff3d7f"></festive-fx>
```

Attributes: `effect density speed wind size colors ground="false" z-index duration interactive fullscreen autostart="false" respect-reduced-motion="false"`.
Methods: `el.start()`, `el.stop()`, `el.burst(x, y)`, `el.controller`.

### Angular

```ts
// main.ts (or any file loaded once)
import 'festive-fx/element';

@Component({
  selector: 'app-root',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<festive-fx [attr.effect]="effect" fullscreen></festive-fx>`,
})
export class AppComponent { effect = 'snow'; }
```

Or use `createFx({ target: this.el.nativeElement })` in `ngAfterViewInit` and `destroy()` in `ngOnDestroy`.

## React

```tsx
import { FestiveFx, useFestiveFx } from 'festive-fx/react';

<FestiveFx effect="fireworks" interactive>
  <Hero />
</FestiveFx>

<FestiveFx effect="snow" fullscreen density={1.5} />

// imperative
const ref = useRef<FxController>(null);
<FestiveFx ref={ref} effect="confetti" density={0} fullscreen />
<button onClick={() => ref.current?.burst()}>🎉</button>

// hook
const fx = useFestiveFx({ effect: 'rain' }, sectionRef);
```

## Vue 3

```vue
<script setup>
import { FestiveFx } from 'festive-fx/vue';
</script>

<template>
  <FestiveFx effect="leaves" :wind="0.5"><Hero /></FestiveFx>
  <FestiveFx effect="diwali" fullscreen interactive />
</template>
```

Or register it globally with `app.use(FestiveFxPlugin)`.

## CDN

```html
<script src="https://unpkg.com/festive-fx"></script>
<script>FestiveFx.createFx({ effect: 'snow' });</script>
<!-- <festive-fx> is registered too -->
```

## Custom effects

```ts
import { registerEffect, type EffectFactory } from 'festive-fx';

const bubbles: EffectFactory = (opts) => {
  let w = 0, h = 0;
  const items: { x: number; y: number; r: number }[] = [];
  return {
    resize(nw, nh) { w = nw; h = nh; /* size your pool from opts.density */ },
    update(dt) { /* move by dt seconds * opts.speed */ },
    draw(ctx) { /* canvas is already cleared */ },
    burst(x, y) { /* optional */ },
  };
};

registerEffect('bubbles', bubbles);
// createFx({ effect: 'bubbles' }) and <festive-fx effect="bubbles"> both work now
```

## Development

```sh
npm install
npm test          # vitest + jsdom
npm run build     # dist/: ESM + CJS + d.ts + IIFE
open examples/index.html
open bench/index.html   # ms/frame and canvas calls/frame per effect at 1920x1080
npm run site && open _site/index.html   # the demo site, deployed to GitHub Pages on push to main
```

Performance notes for effect authors: draw with `place()` (one `setTransform`)
rather than `save/translate/rotate/restore` per particle, remove dead particles
with `retain()` rather than `splice` in a loop, and group particles that share a
style (colour, `alphaLevel()`, width) into one path per group. All of these
are exported for custom effects:

```ts
import { place, retain, alphaLevel, sprite, glowSprite, stamp } from 'festive-fx';
```

## License

MIT
