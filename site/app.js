/* festive-fx demo site. Plain browser JS on top of the IIFE build (window.FestiveFx). */
(() => {
  const { createFx } = window.FestiveFx;

  /** Gallery metadata, grouped. cardDensity compensates for small cards (populations scale with area). */
  const GROUPS = [
    { name: 'Nepal & South Asia', effects: [
      { id: 'fireworks', name: 'Fireworks', tag: 'Tihar · Deepawali', bg: 'night', cardDensity: 1.4, desc: 'Rockets, ten shell types, smoke and anar fountains from the ground.', aliases: ['rockets', 'diwali', 'tihar'] },
      { id: 'diyas', name: 'Diyas & lanterns', tag: 'Tihar', bg: 'night', cardDensity: 3, desc: 'Painted clay lamps with flickering flames, embers and rising sky lanterns.', aliases: ['lanterns', 'lights'] },
      { id: 'laxmi-paila', name: 'Laxmi paila', tag: 'Tihar', bg: 'light', cardDensity: 1, desc: "Laxmi's alta-red footprints walk in from the edge, with sindoor glitter where each lands.", aliases: ['paila', 'footprints'] },
      { id: 'rangoli', name: 'Rangoli', tag: 'Tihar · Deepawali', bg: 'dusk', cardDensity: 1, desc: 'A symmetric rangoli poured ring by ring in grainy powder colours, then lit by tiny diyas.', aliases: ['mandala', 'kolam'] },
      { id: 'marigold', name: 'Marigold', tag: 'Tihar · Dashain', bg: 'dusk', cardDensity: 3, desc: 'Sayapatri garlands along the top, falling petals and flowers.', aliases: ['sayapatri', 'garland'] },
      { id: 'coins', name: 'Coins', tag: 'Dhanteras', bg: 'dusk', cardDensity: 3, desc: 'Gold and silver coins spin in 3D, bounce and pile up with glints.', aliases: ['dhanteras'] },
      { id: 'kites', name: 'Kites', tag: 'Dashain', bg: 'day', cardDensity: 6, desc: 'Changa that bob, loop the loop and get cut loose. Click one to cut it.', aliases: ['changa', 'dashain'] },
      { id: 'prayer-flags', name: 'Prayer flags', tag: 'Losar', bg: 'day', cardDensity: 1, desc: 'Lungta strings ripple and shade in the gusts, printed with script and a wind horse.', aliases: ['lungta', 'losar'] },
      { id: 'lali-gurans', name: 'Lali gurans', tag: 'Spring · Nepal', bg: 'plum', cardDensity: 4, desc: "Crimson rhododendron petals, Nepal's national flower, with the odd whole bloom.", aliases: ['rhododendron'] },
      { id: 'holi', name: 'Holi', tag: 'Holi', bg: 'light', cardDensity: 1.4, desc: 'Gulal thrown as mixing colour clouds, grains and dripping splats.', aliases: ['gulal'] },
      { id: 'teej', name: 'Teej', tag: 'Teej', bg: 'forest', cardDensity: 5, desc: 'Glass bangles tumble in 3D among bindis and mehendi swirls.', aliases: ['bangles'] },
      { id: 'chhath', name: 'Chhath', tag: 'Chhath', bg: 'dusk', cardDensity: 4, desc: 'Diyas on banana-leaf boats float on sunrise water with reflections.', aliases: ['chhath-puja'] },
    ] },
    { name: 'Festivals worldwide', effects: [
      { id: 'newyear', name: 'New Year', tag: 'New Year', bg: 'night', cardDensity: 1, desc: 'Rockets write the year in sparks, hold it twinkling, then drop it in gold glitter.', aliases: ['new-year', 'countdown'] },
      { id: 'christmas', name: 'Christmas lights', tag: 'Christmas', bg: 'night', cardDensity: 1, desc: 'C9 string lights with chase, twinkle, fade and sparkle modes. Layer with snow.', aliases: ['xmas', 'fairy-lights'] },
      { id: 'eid', name: 'Eid', tag: 'Eid · Ramadan', bg: 'night', cardDensity: 2, desc: 'Crescent moon and star, twinkling sky, and fanoos lanterns swinging on brass chains.', aliases: ['ramadan', 'fanoos'] },
      { id: 'lunar-new-year', name: 'Lunar New Year', tag: 'Lunar New Year', bg: 'red', cardDensity: 2, desc: 'Glowing red lanterns and firecracker strings that pop from the bottom up.', aliases: ['chinese-new-year'] },
      { id: 'hearts', name: 'Hearts', tag: 'Valentine · weddings', bg: 'plum', cardDensity: 3, desc: 'Glossy and line-art hearts rise and wobble, with heartbeat twinkles.', aliases: ['valentine'] },
      { id: 'confetti', name: 'Confetti', tag: 'Any party', bg: 'plum', cardDensity: 3, desc: 'Stars, streamers and foil that flip in 3D. Click for a cannon.', aliases: [] },
    ] },
    { name: 'Weather & nature', effects: [
      { id: 'snow', name: 'Snow', tag: 'Winter', bg: 'night', cardDensity: 2.5, desc: 'Three depth layers, rotating crystals and a drift that piles up.', aliases: [] },
      { id: 'rain', name: 'Rain', tag: 'Monsoon', bg: 'night', cardDensity: 2.5, desc: 'Bright-headed drops, crown splashes, ripples and ground mist.', aliases: [] },
      { id: 'storm', name: 'Thunderstorm', tag: 'Monsoon', bg: 'night', cardDensity: 2.5, desc: 'Slanted rain with branching lightning. Click to strike.', aliases: ['thunderstorm'] },
      { id: 'hail', name: 'Hail', tag: 'Storm', bg: 'night', cardDensity: 3, desc: 'Icy pellets that streak, bounce, shatter and melt on the ground.', aliases: ['hailstorm'] },
      { id: 'fog', name: 'Fog', tag: 'Mist', bg: 'dusk', cardDensity: 3, desc: 'Layered drifting mist that parts around your cursor and heals behind it.', aliases: ['mist'] },
      { id: 'aurora', name: 'Aurora', tag: 'Night', bg: 'night', cardDensity: 1.5, desc: 'Northern-light curtains with sliding rays. Layer with stars.', aliases: ['northern-lights'] },
      { id: 'stars', name: 'Stars', tag: 'Night', bg: 'night', cardDensity: 3, desc: 'A twinkling field with shooting stars. Click to send one.', aliases: ['night'] },
      { id: 'sunbeams', name: 'Sunbeams', tag: 'Day', bg: 'forest', cardDensity: 2, desc: 'God rays and lens flare from a corner sun, with dust glinting in the beams.', aliases: ['godrays'] },
      { id: 'fireflies', name: 'Fireflies', tag: 'Summer', bg: 'forest', cardDensity: 4, desc: 'Wandering glows with a real firefly blink. Click to startle them.', aliases: [] },
      { id: 'butterflies', name: 'Butterflies', tag: 'Spring', bg: 'forest', cardDensity: 5, desc: 'Monarchs, morphos, swallowtails and whites wandering, gliding and flapping.', aliases: ['butterfly'] },
      { id: 'leaves', name: 'Autumn leaves', tag: 'Autumn', bg: 'dusk', cardDensity: 3, desc: 'Maple, oak and beech leaves that tumble, gust and settle.', aliases: ['autumn'] },
      { id: 'sakura', name: 'Sakura', tag: 'Spring', bg: 'plum', cardDensity: 3, desc: 'Cherry-blossom petals drifting down. Click to blow them away.', aliases: ['petals'] },
    ] },
    { name: 'Celebrations & UI moments', effects: [
      { id: 'balloons', name: 'Balloons', tag: 'Birthdays', bg: 'day', cardDensity: 7, desc: 'Glossy latex and foil balloons on curly strings. Click to pop.', aliases: ['balloon'] },
      { id: 'bubbles', name: 'Bubbles', tag: 'Playful', bg: 'day', cardDensity: 4, desc: 'Iridescent soap bubbles that wobble, drift and pop with a spray.', aliases: ['soap-bubbles'] },
      { id: 'sparkler', name: 'Sparkler', tag: 'Cursor', bg: 'night', cardDensity: 1.5, desc: 'A sparkler that follows your cursor, crackling with branching sparks.', aliases: ['phuljhadi'] },
      { id: 'emoji', name: 'Emoji rain', tag: 'Any moment', bg: 'plum', cardDensity: 3, desc: "Any emoji falling and tumbling: set symbols: ['🪔', '🎉'].", aliases: ['emojis'] },
    ] },
  ];
  const EFFECTS = GROUPS.flatMap((g) => g.effects);

  const PALETTES = [
    { id: 'default', name: 'Effect default', colors: [] },
    { id: 'tihar', name: 'Tihar', colors: ['#ffd700', '#ff9933', '#ff5e1a', '#fff6d5'] },
    { id: 'holi', name: 'Holi', colors: ['#ff1f8e', '#ffd400', '#00c853', '#2979ff', '#aa00ff'] },
    { id: 'nepal', name: 'Crimson & blue', colors: ['#dc143c', '#003893', '#ffffff'] },
    { id: 'ice', name: 'Ice', colors: ['#e0f7ff', '#9ad8ff', '#ffffff'] },
  ];

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let motionAllowed = !reduceMotion;

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    for (const c of [].concat(children)) node.append(c);
    return node;
  };

  /* ------------------------------------------------------------ copy helper */
  async function copy(text, button) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = el('textarea', { value: text });
      document.body.append(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    const label = button.querySelector('.copy-hint') ?? button;
    const before = label.textContent;
    label.textContent = 'copied';
    setTimeout(() => (label.textContent = before), 1400);
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (b) copy(b.dataset.copy, b);
  });

  /* -------------------------------------------------------------------- hero */
  let hero = null;
  const mountHero = () => {
    hero?.destroy();
    hero = createFx({
      target: '#hero',
      effect: ['stars', 'diyas', 'fireworks'],
      interactive: true,
      zIndex: 0,
      respectReducedMotion: !motionAllowed,
    });
  };

  /* ----------------------------------------------------------------- gallery */
  const grid = $('#grid');
  $('#gallery-title').textContent = `${EFFECTS.length} effects, all live`;
  const card = (fx) => {
    const stage = el('festive-fx', { className: `bg-${fx.bg}` });
    stage.setAttribute('effect', fx.id);
    stage.setAttribute('density', String(fx.cardDensity));
    stage.setAttribute('interactive', '');
    stage.setAttribute('aria-label', `${fx.name} preview, click to trigger`);
    const aliases = fx.aliases.length ? el('p', { className: 'aliases', textContent: `also: ${fx.aliases.join(', ')}` }) : '';
    const tryBtn = el('button', { type: 'button', className: 'try', textContent: 'Open in playground →' });
    tryBtn.addEventListener('click', () => {
      setEffects([fx.id]);
      setBackground(['forest', 'plum', 'red'].includes(fx.bg) ? 'night' : fx.bg);
      $('#playground').scrollIntoView();
    });
    return (
      el('article', { className: 'card' }, [
        stage,
        el('div', { className: 'card-body' }, [
          el('div', { className: 'card-title' }, [
            el('h3', { textContent: fx.name }),
            el('span', { className: 'tag', textContent: fx.tag }),
          ]),
          el('p', { textContent: fx.desc }),
          aliases,
          tryBtn,
        ]),
      ])
    );
  };
  for (const g of GROUPS) {
    grid.append(
      el('section', { className: 'group' }, [
        el('h3', { className: 'group-title', textContent: g.name }),
        el('div', { className: 'grid' }, g.effects.map(card)),
      ]),
    );
  }
  const syncGalleryMotion = () => {
    for (const card of grid.querySelectorAll('festive-fx')) {
      if (motionAllowed) card.setAttribute('respect-reduced-motion', 'false');
      else card.removeAttribute('respect-reduced-motion');
    }
  };

  /* -------------------------------------------------------------- playground */
  const state = {
    effects: ['fireworks'],
    layer: false,
    density: 1,
    speed: 1,
    wind: 0,
    size: 1,
    palette: 'default',
    colorsText: '',
    ground: true,
    interactive: true,
    bg: 'night',
    text: '',
    symbolsText: '',
  };

  const colors = () =>
    state.colorsText
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

  const symbols = () =>
    state.symbolsText
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

  const liveOptions = () => ({
    effect: state.effects.length === 1 ? state.effects[0] : [...state.effects],
    density: state.density,
    speed: state.speed,
    wind: state.wind,
    size: state.size,
    ground: state.ground,
    interactive: state.interactive,
    colors: colors(),
    text: state.text.trim(),
    symbols: symbols(),
  });

  let stageFx = null;
  let pageFx = null;

  const mountStage = () => {
    stageFx?.destroy();
    stageFx = createFx({ ...liveOptions(), target: '#stage', respectReducedMotion: !motionAllowed });
  };

  const apply = () => {
    const opts = liveOptions();
    stageFx?.update(opts);
    pageFx?.update(opts);
    renderChips();
    renderContentFields();
    renderCode();
  };

  // Text / symbols inputs only show for effects that use them
  const renderContentFields = () => {
    const text = state.effects.includes('newyear');
    const sym = state.effects.includes('emoji');
    $('#text-field').hidden = !text;
    $('#symbols-field').hidden = !sym;
    $('#content-fields').hidden = !text && !sym;
  };
  $('#text').addEventListener('input', (e) => {
    state.text = e.target.value;
    apply();
  });
  $('#symbols').addEventListener('input', (e) => {
    state.symbolsText = e.target.value;
    apply();
  });

  // Effect chips
  const chips = $('#chips');
  const renderChips = () => {
    chips.replaceChildren(
      ...EFFECTS.map((fx) => {
        const i = state.effects.indexOf(fx.id);
        const b = el('button', { type: 'button', className: 'chip', textContent: fx.id });
        b.setAttribute('aria-pressed', String(i >= 0));
        if (state.layer && i >= 0 && state.effects.length > 1) b.append(el('span', { className: 'order', textContent: i + 1 }));
        b.addEventListener('click', () => toggleEffect(fx.id));
        return b;
      }),
    );
    $('#layer-note').hidden = !state.layer;
  };
  const toggleEffect = (id) => {
    if (!state.layer) return setEffects([id]);
    const i = state.effects.indexOf(id);
    if (i < 0) state.effects.push(id);
    else if (state.effects.length > 1) state.effects.splice(i, 1); // always keep one
    apply();
  };
  const setEffects = (ids) => {
    state.effects = ids;
    apply();
  };
  $('#layer').addEventListener('change', (e) => {
    state.layer = e.target.checked;
    if (!state.layer && state.effects.length > 1) state.effects = [state.effects[state.effects.length - 1]];
    apply();
  });

  // Sliders
  for (const key of ['density', 'speed', 'wind', 'size']) {
    const input = $(`#${key}`);
    const out = $(`#${key}-out`);
    input.addEventListener('input', () => {
      state[key] = Number(Number(input.value).toFixed(2));
      out.textContent = String(state[key]);
      apply();
    });
  }

  // Colours
  const palettes = $('#palettes');
  const renderPalettes = () => {
    palettes.replaceChildren(
      ...PALETTES.map((p) => {
        const b = el('button', { type: 'button', className: 'chip' });
        if (p.colors.length) {
          b.append(el('span', { className: 'swatches' }, p.colors.map((c) => el('i', { style: `background:${c}` }))));
        }
        b.append(p.name);
        b.setAttribute('aria-pressed', String(state.palette === p.id));
        b.addEventListener('click', () => {
          state.palette = p.id;
          state.colorsText = p.colors.join(', ');
          $('#colors').value = state.colorsText;
          renderPalettes();
          apply();
        });
        return b;
      }),
    );
  };
  $('#colors').addEventListener('input', (e) => {
    state.colorsText = e.target.value;
    state.palette = 'custom';
    renderPalettes();
    apply();
  });

  // Toggles
  for (const key of ['ground', 'interactive']) {
    $(`#${key}`).addEventListener('change', (e) => {
      state[key] = e.target.checked;
      apply();
    });
  }

  // Stage background
  const stage = $('#stage');
  const setBackground = (bg) => {
    state.bg = bg;
    stage.className = `pg-stage bg-${bg}`;
    for (const b of document.querySelectorAll('#bg-picker button')) b.setAttribute('aria-pressed', String(b.dataset.bg === bg));
  };
  $('#bg-picker').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-bg]');
    if (b) setBackground(b.dataset.bg);
  });

  // "Your app" button proves the overlay is click-through
  let clicks = 0;
  $('#mock-btn').addEventListener('click', (e) => {
    clicks++;
    e.currentTarget.textContent = `Clicked ${clicks} time${clicks === 1 ? '' : 's'}`;
  });

  // Whole-page preview
  const fsBtn = $('#fullscreen-btn');
  fsBtn.addEventListener('click', () => {
    if (pageFx) {
      pageFx.destroy();
      pageFx = null;
    } else {
      pageFx = createFx({ ...liveOptions(), respectReducedMotion: !motionAllowed });
    }
    fsBtn.setAttribute('aria-pressed', String(!!pageFx));
    fsBtn.textContent = pageFx ? 'Stop whole-page preview' : 'Preview on whole page';
    renderCode();
  });

  /* -------------------------------------------------------------- code view */
  const js = (v) =>
    typeof v === 'string' ? `'${v}'` : Array.isArray(v) ? `[${v.map(js).join(', ')}]` : String(v);

  /** Options that differ from the library defaults, in a stable order. */
  const changed = () => {
    const o = liveOptions();
    const out = [['effect', o.effect]];
    for (const k of ['density', 'speed', 'wind', 'size']) if (o[k] !== (k === 'wind' ? 0 : 1)) out.push([k, o[k]]);
    if (!o.ground) out.push(['ground', false]);
    if (o.interactive) out.push(['interactive', true]);
    if (o.colors.length) out.push(['colors', o.colors]);
    if (o.text && state.effects.includes('newyear')) out.push(['text', o.text]);
    if (o.symbols.length && state.effects.includes('emoji')) out.push(['symbols', o.symbols]);
    return out;
  };

  const attr = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const htmlAttrs = (opts) =>
    opts
      .map(([k, v]) => {
        if (v === true) return attr(k);
        if (Array.isArray(v)) return `${attr(k)}="${v.join(', ')}"`;
        return `${attr(k)}="${v}"`;
      })
      .join(' ');

  const wrapAttrs = (indent, parts) => {
    const line = parts.join(' ');
    return line.length <= 60 ? ` ${line}` : `\n${parts.map((p) => indent + p).join('\n')}\n${indent.slice(2)}`;
  };

  const SNIPPETS = {
    HTML: (opts) =>
      `<script src="https://unpkg.com/festive-fx"></script>\n\n` +
      `<!-- covers the page -->\n<festive-fx ${htmlAttrs(opts)} fullscreen></festive-fx>\n\n` +
      `<!-- or wrap a section -->\n<festive-fx ${htmlAttrs(opts)}>\n  <section class="hero">...</section>\n</festive-fx>`,
    JavaScript: (opts) => {
      const body = opts.map(([k, v]) => `${k}: ${js(v)}`);
      const one = `{ ${body.join(', ')} }`;
      const obj = one.length <= 64 ? one : `{\n${body.map((b) => `  ${b},`).join('\n')}\n}`;
      return (
        `import { createFx } from 'festive-fx';\n\n` +
        `const fx = createFx(${obj});\n\n` +
        `// later: fx.update({ density: 2 }), fx.burst(), fx.destroy()`
      );
    },
    React: (opts) => {
      const props = opts.map(([k, v]) =>
        v === true ? k : typeof v === 'string' ? `${k}="${v}"` : `${k}={${js(v)}}`,
      );
      return (
        `import { FestiveFx } from 'festive-fx/react';\n\n` +
        `export function Celebration() {\n` +
        `  return <FestiveFx${wrapAttrs('      ', [...props, 'fullscreen'])} />;\n}`
      );
    },
    Vue: (opts) => {
      const props = opts.map(([k, v]) =>
        v === true ? attr(k) : typeof v === 'string' ? `${attr(k)}="${v}"` : `:${attr(k)}="${js(v)}"`,
      );
      return (
        `<script setup>\nimport { FestiveFx } from 'festive-fx/vue';\n</script>\n\n` +
        `<template>\n  <FestiveFx${wrapAttrs('    ', [...props, 'fullscreen'])} />\n</template>`
      );
    },
    Angular: (opts) =>
      `// main.ts: registers <festive-fx>\nimport 'festive-fx/element';\n\n` +
      `@Component({\n  selector: 'app-root',\n  standalone: true,\n  schemas: [CUSTOM_ELEMENTS_SCHEMA],\n` +
      `  template: \`<festive-fx ${htmlAttrs(opts)} fullscreen></festive-fx>\`,\n})\nexport class AppComponent {}`,
  };

  let tab = 'HTML';
  const tabs = $('#tabs');
  const renderTabs = () => {
    tabs.replaceChildren(
      ...Object.keys(SNIPPETS).map((name) => {
        const b = el('button', { type: 'button', role: 'tab', textContent: name });
        b.setAttribute('aria-selected', String(name === tab));
        b.addEventListener('click', () => {
          tab = name;
          renderTabs();
          renderCode();
        });
        return b;
      }),
    );
  };
  const renderCode = () => {
    $('#code').textContent = SNIPPETS[tab](changed());
  };
  $('#copy-code').addEventListener('click', (e) => copy($('#code').textContent, e.currentTarget));

  /* ---------------------------------------------------------- reduced motion */
  const banner = $('#rm-banner');
  banner.hidden = !reduceMotion;
  $('#rm-play').addEventListener('click', () => {
    motionAllowed = true;
    banner.hidden = true;
    mountHero();
    mountStage();
    syncGalleryMotion();
  });

  /* ------------------------------------------------------------------- boot */
  mountHero();
  syncGalleryMotion();
  renderPalettes();
  renderTabs();
  mountStage();
  apply();
})();
