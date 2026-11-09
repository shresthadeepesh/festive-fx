import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      element: 'src/element.ts',
      react: 'src/adapters/react.ts',
      vue: 'src/adapters/vue.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    treeshake: true,
    splitting: true, // CJS too: one shared effect registry across entry points
    external: ['react', 'vue'],
  },
  {
    // Drop-in <script> build: exposes window.FestiveFx and registers <festive-fx>.
    entry: { 'festive-fx': 'src/cdn.ts' },
    format: ['iife'],
    globalName: 'FestiveFx',
    minify: true,
    sourcemap: true,
    outExtension: () => ({ js: '.iife.js' }),
  },
]);
