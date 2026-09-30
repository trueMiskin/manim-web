import { resolve } from 'path';
import UnpluginTypia from '@typia/unplugin/vite';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  // Reveal ships standalone ESM. Lazy mounting must survive dependency reoptimization.
  optimizeDeps: { exclude: ['reveal.js', 'reveal.js/plugin/notes'] },
  plugins: [
    UnpluginTypia(),
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'reveal/index': resolve(__dirname, 'src/reveal/index.ts'),
        // Preserve the fallback boundary so shared runtimes can omit embedded fonts.
        'reveal/markdownMathStyles': resolve(__dirname, 'src/reveal/markdownMathStyles.ts'),
        'integrations/react': resolve(__dirname, 'src/integrations/react.tsx'),
        'integrations/vue': resolve(__dirname, 'src/integrations/vue.ts'),
        'integrations/webcomponent': resolve(__dirname, 'src/integrations/webcomponent.ts'),
        'integrations/notebook': resolve(__dirname, 'src/integrations/notebook.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      // NOTE: `@mathjax/src` MUST be bundled (not externalized). Splitting the
      // five submodules it exposes (mathjax, tex, svg, liteAdaptor, html) over
      // separate dynamic-import targets makes downstream re-bundlers (e.g.
      // esm.sh) duplicate the `mathjax` singleton and breaks MathTex (#396).
      // `./mobjects/text/MathJaxBundle.ts` concentrates the imports so Vite
      // emits a single MathJax chunk.
      external: [
        'three',
        'react',
        'react/jsx-runtime',
        'vue',
        // Keep imports pointed at the private entry rather than a merged CSS chunk.
        './markdownMathStyles.js',
      ],
      output: {
        globals: {
          three: 'THREE',
          react: 'React',
          'react/jsx-runtime': 'ReactJSXRuntime',
          vue: 'Vue',
        },
        // Preserve directory structure for integrations
        entryFileNames: '[name].js',
      },
    },
  },
  resolve: {
    alias: [
      { find: /^manim-web\/reveal$/, replacement: resolve(__dirname, 'src/reveal/index.ts') },
      { find: /^manim-web$/, replacement: resolve(__dirname, 'src/index.ts') },
      { find: '@', replacement: resolve(__dirname, 'src') },
    ],
  },
});
