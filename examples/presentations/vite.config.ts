import { fileURLToPath } from 'node:url';
import UnpluginTypia from '@typia/unplugin/vite';
import { defineConfig } from 'vite';

/** Build repository examples against the source being qualified. */
export default defineConfig({
  base: './',
  plugins: [UnpluginTypia()],
  resolve: {
    alias: [
      {
        find: /^manim-web\/reveal$/,
        replacement: fileURLToPath(new URL('../../src/reveal/index.ts', import.meta.url)),
      },
      {
        find: /^manim-web$/,
        replacement: fileURLToPath(new URL('../../src/index.ts', import.meta.url)),
      },
    ],
  },
  build: { target: 'esnext' },
});
