import { realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { URL } from 'node:url';
import { loadRuntime } from './runtime.mjs';

const assetPrefix = '\0manim-runtime-asset:';
const stylePrefix = '\0manim-runtime-style:';

function contains(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

async function canonical(path) {
  try {
    return await realpath(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return resolve(await canonical(dirname(path)), relative(dirname(path), path));
  }
}

function matchesExternal(external, id, ...args) {
  if (typeof external === 'function') return external(id, ...args);
  if (external === true) return true;
  return (Array.isArray(external) ? external : [external]).some((entry) =>
    entry instanceof RegExp ? entry.test(id) : entry === id,
  );
}

function encodePath(path) {
  return path.split(sep).map(encodeURIComponent).join('/');
}

/**
 * Link a verified runtime; output paths become available after Vite resolves its config.
 * @post result.context() === undefined
 */
export async function sharedRuntime(directory, options) {
  const runtimeDirectory = await realpath(resolve(directory));
  const manifest = await loadRuntime(runtimeDirectory, options);
  let context;
  const moduleNames = new Set(Object.keys(manifest.modules));
  const styles = new Set(manifest.styleImports ?? ['katex/dist/katex.min.css']);
  const assetNames = new Map(Object.entries(manifest.assets ?? {}));

  const plugin = {
    name: 'manim-shared-runtime',
    enforce: 'pre',
    config(config) {
      return { base: config.base ?? './' };
    },
    async configResolved(config) {
      const outputs = [
        config.build.rollupOptions?.output,
        config.build.rolldownOptions?.output,
      ].flat();
      if (outputs.some((output) => output?.dir !== undefined || output?.file !== undefined)) {
        throw new Error(
          'Shared presentations must set build.outDir instead of output.dir or output.file.',
        );
      }
      const output = await canonical(resolve(config.root, config.build.outDir));
      if (contains(output, runtimeDirectory) || contains(runtimeDirectory, output)) {
        throw new Error('Presentation output and shared runtime directories must not overlap.');
      }
      if (config.build.lib) throw new Error('Shared presentations require an HTML entry point.');
      const runtimeUrl = `./${encodePath(relative(output, runtimeDirectory))}/`;
      const depth = relative(output, runtimeDirectory)
        .split(sep)
        .filter((part) => part === '..').length;
      // Give relative URLs enough parent segments during capture to reproduce deployment.
      const basePath = config.base.startsWith('.')
        ? `/${Array(depth + 1)
            .fill('deck')
            .join('/')}/`
        : new URL(config.base, 'http://localhost').pathname;
      const runtimePath = new URL(runtimeUrl, `http://localhost${basePath}`).pathname;
      if (runtimePath.startsWith(basePath) || basePath.startsWith(runtimePath)) {
        throw new Error('The presentation base and shared runtime URL must not overlap.');
      }
      context = {
        directory: output,
        runtimeDirectory,
        runtimeUrl,
        basePath,
        mounts: [{ directory: runtimeDirectory, basePath: runtimePath }],
        manifest,
      };
    },
    options(options) {
      const external = options.external;
      return {
        ...options,
        external: (id, ...args) => moduleNames.has(id) || matchesExternal(external, id, ...args),
      };
    },
    resolveId(id) {
      if (moduleNames.has(id)) return { id, external: true };
      if (styles.has(id)) return stylePrefix + id;
      const asset = id.replace(/\?url$/, '');
      if (assetNames.has(asset)) return assetPrefix + asset;
      if (/^manim-web(?:\/|$)/.test(id)) {
        throw new Error(
          `The shared runtime does not provide ${id}. Use manim-web or manim-web/reveal.`,
        );
      }
    },
    load(id) {
      if (id.startsWith(stylePrefix)) return '';
      if (id.startsWith(assetPrefix)) {
        const asset = assetNames.get(id.slice(assetPrefix.length));
        return `export default new URL(${JSON.stringify(context.runtimeUrl + asset)}, document.baseURI).href;`;
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler() {
        const imports = Object.fromEntries(
          Object.entries(manifest.modules).map(([id, file]) => [id, context.runtimeUrl + file]),
        );
        return [
          {
            tag: 'script',
            attrs: { type: 'importmap' },
            children: JSON.stringify({ imports }).replaceAll('<', '\\u003c'),
            injectTo: 'head-prepend',
          },
          ...manifest.styles.map((file) => ({
            tag: 'link',
            attrs: { rel: 'stylesheet', href: context.runtimeUrl + file },
            injectTo: 'head-prepend',
          })),
        ];
      },
    },
  };
  return { plugin, context: () => context };
}
