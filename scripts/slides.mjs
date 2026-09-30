#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { parseArgs } from 'node:util';
import { buildRuntime } from './slides/runtime.mjs';
import { sharedRuntime } from './slides/shared.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...args] = process.argv.slice(2);

function run(program, arguments_, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(program, arguments_, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolveRun() : reject(new Error(`${program} exited with status ${code}`)),
    );
  });
}

function projectRequire(root = process.cwd()) {
  return createRequire(join(root, 'package.json'));
}

async function vite(arguments_) {
  const entry = projectRequire().resolve('vite/package.json');
  await run(process.execPath, [join(dirname(entry), 'bin/vite.js'), ...arguments_]);
}

async function init(directory = 'my-presentation') {
  const target = resolve(directory);
  try {
    if ((await readdir(target)).length > 0) throw new Error(`Directory is not empty: ${target}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(target, { recursive: true });
  await cp(join(packageRoot, 'examples/presentations/basic'), target, {
    recursive: true,
    filter: (source) => !['dist', 'node_modules'].includes(source.split(sep).pop()),
  });
  const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  const template = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
  await writeFile(
    join(target, 'package.json'),
    JSON.stringify(
      {
        ...template,
        name: 'my-manim-presentation',
        dependencies: {
          ...template.dependencies,
          'manim-web': `^${metadata.version}`,
        },
      },
      null,
      2,
    ) + '\n',
  );
  await writeFile(
    join(target, 'README.md'),
    [
      '# Your presentation',
      'Run `npm install`, then `npm run dev`.',
      'Edit `deck.ts` to organize your presentation into topics and add content. The starter combines declarative prose, formulas, lists, columns with an image, named builds, and custom animated scenes. `intro.ts` and `bullets.ts` are short content-slide examples; the lesson topic in `deck.ts` adds formula transforms, columns, and individual bullet reveals.',
      'Use `slide` with `paragraph`, `math`, `bullets`, `columns`, and `image` to declare content. Blocks appear immediately and use automatic layout. Paragraphs and bullets accept `$inline math$`; display formulas use `math` without dollar delimiters. Import images as URLs, as shown by `parabola.svg?url`, so they travel with the build.',
      "Add named `builds` to reveal content on advance. Give a block or individual bullet item an `id`, then reference it in a build's `show` array. Use `slot([math(...), math(...)])` for named formula alternatives and `effects: [transformMath('from', 'to')]` to morph between them. Show targets and transform destinations start hidden; a slot initially shows its first alternative. Each build creates a navigation pause with notes and a printable state.",
      'Set `theme` in `deck.ts` for shared typography and spacing. Choose the initial `palette` in `deck.ts`, or use the Colors selector during the presentation. Edit `palettes.ts` to customize the light and dark colors, including named colors for diagrams. Custom scenes inherit the theme and read colors through `s.colors`.',
      '`main.ts` calls `mountPresentation` to create the Reveal deck, load its styles and notes plugin, and initialize playback. It also loads the generated handout assets in production.',
      'Start with `scene.ts` for custom animation, then explore `text.ts`, `coordinates.ts`, and `matrix.ts`. These modules use `defineSlide` and are included through `sceneSlides` in the same deck. Declare layout blocks before the first `s.step`, then use `s.reveal`, `s.write`, or ordinary animations through `s.play`. Each step creates a navigation pause and a printable state.',
      'Before the first build, install Chromium with `npx playwright install chromium`.\n`npm run build` writes a portable `dist/` including all handout states.\n`npm run pdf` builds and exports `presentation.pdf`.',
    ].join('\n\n') + '\n',
  );
  process.stdout.write(`Created ${target}\nRun npm install in that directory, then npm run dev.\n`);
}

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
};

async function serve(directory, basePath = '/', additionalMounts = []) {
  const mounts = [{ directory, basePath }, ...additionalMounts];
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const mount = mounts.find((entry) => pathname.startsWith(decodeURIComponent(entry.basePath)));
      if (!mount) throw new Error('Invalid base path');
      const root = resolve(mount.directory);
      const localPath = pathname.slice(decodeURIComponent(mount.basePath).length);
      const file = resolve(
        root,
        localPath.endsWith('/') || !localPath ? localPath + 'index.html' : localPath,
      );
      const local = relative(root, file);
      if (isAbsolute(local) || local === '..' || local.startsWith(`..${sep}`)) {
        throw new Error('Invalid path');
      }
      const body = await readFile(file);
      response.writeHead(200, {
        'Content-Type': mimeTypes[extname(file)] ?? 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  await new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveServer);
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}${basePath.slice(0, -1)}`,
    close: () => new Promise((done) => server.close(done)),
  };
}

async function withBrowser(
  directory,
  action,
  basePath = '/',
  mounts = [],
  require = projectRequire(),
) {
  const { chromium } = require('@playwright/test');
  const server = await serve(directory, basePath, mounts);
  let browser;
  try {
    const explicitBrowser = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    const bundledAvailable = await stat(chromium.executablePath()).then(
      () => true,
      () => false,
    );
    browser = await chromium.launch(
      explicitBrowser
        ? { executablePath: explicitBrowser }
        : bundledAvailable
          ? {}
          : { channel: 'chrome' },
    );
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    return await action(page, server.url);
  } finally {
    await browser?.close();
    await server.close();
  }
}

async function ready(page) {
  await page.waitForFunction(
    () => globalThis.__MANIM_PRESENTATION__?.ready || globalThis.__MANIM_PRESENTATION__?.error,
    undefined,
    { timeout: 300000 },
  );
  const error = await page.evaluate(() => globalThis.__MANIM_PRESENTATION__.error);
  if (error) throw new Error(error);
}

async function build(viteArguments = []) {
  const started = performance.now();
  const { values, positionals } = parseArgs({
    args: viteArguments,
    allowPositionals: true,
    options: {
      config: { type: 'string', short: 'c' },
      mode: { type: 'string', short: 'm' },
      base: { type: 'string' },
      outDir: { type: 'string' },
      target: { type: 'string' },
      emptyOutDir: { type: 'boolean' },
      runtime: { type: 'string' },
    },
  });
  if (positionals.length > 1) throw new Error('slides build accepts at most one project root.');
  const require = projectRequire(resolve(positionals[0] ?? '.'));
  const shared = values.runtime
    ? await sharedRuntime(values.runtime, { projectRequire: require })
    : undefined;
  const { build: viteBuild } = await import(pathToFileURL(require.resolve('vite')).href);
  let resolvedConfig;
  await viteBuild({
    ...(positionals[0] ? { root: resolve(positionals[0]) } : {}),
    ...(values.config ? { configFile: resolve(values.config) } : {}),
    ...(values.mode ? { mode: values.mode } : {}),
    ...(values.base ? { base: values.base } : {}),
    build: Object.fromEntries(
      ['outDir', 'target', 'emptyOutDir']
        .filter((key) => values[key] !== undefined)
        .map((key) => [key, values[key]]),
    ),
    plugins: [
      ...(shared ? [shared.plugin] : []),
      {
        name: 'manim-presentation-output',
        configResolved(config) {
          resolvedConfig = config;
        },
      },
    ],
  });
  const bundled = performance.now();
  const directory = resolve(resolvedConfig.root, resolvedConfig.build.outDir);
  const basePath =
    shared?.context().basePath ??
    (resolvedConfig.base.startsWith('.')
      ? '/'
      : new URL(resolvedConfig.base, 'http://localhost').pathname);
  const mounts = shared?.context().mounts ?? [];
  await stat(join(directory, 'index.html'));
  await withBrowser(
    directory,
    async (page, url) => {
      await page.goto(`${url}/?manim-capture=1`);
      await ready(page);
      const assets = await page.evaluate(() => globalThis.__MANIM_PRESENTATION__.exportAssets());
      const imageDirectory = join(directory, 'assets/manim');
      await mkdir(imageDirectory, { recursive: true });
      for (const scene of Object.values(assets.scenes)) {
        for (const snapshot of Object.values(scene.snapshots)) {
          for (const run of snapshot.text) {
            if (run.font.url) {
              const font = new URL(run.font.url, `${url}/`);
              if (font.origin === new URL(url).origin) {
                if (
                  ![basePath, ...mounts.map((mount) => mount.basePath)].some((path) =>
                    font.pathname.startsWith(path),
                  )
                )
                  throw new Error(`Font is outside the built site's base path: ${font.pathname}`);
                run.font.url = `./${posix.relative(basePath, font.pathname)}${font.search}${font.hash}`;
              }
            }
          }
          const data = /^data:image\/(png|webp|jpeg);base64,(.+)$/s.exec(snapshot.image);
          if (!data) continue;
          const bytes = Buffer.from(data[2], 'base64');
          const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 20)}.${data[1]}`;
          await writeFile(join(imageDirectory, name), bytes);
          snapshot.image = `./assets/manim/${name}`;
        }
      }
      await writeFile(join(directory, 'manim-handout.json'), JSON.stringify(assets));
      const checkpoints = Object.values(assets.scenes).reduce(
        (sum, scene) => sum + scene.checkpoints.length,
        0,
      );
      await writeFile(
        join(directory, 'manim-build-report.json'),
        JSON.stringify(
          {
            scenes: Object.keys(assets.scenes).length,
            checkpoints,
            bundleMs: bundled - started,
            preparationMs: performance.now() - bundled,
            totalMs: performance.now() - started,
            ...(shared
              ? {
                  runtime: {
                    url: shared.context().runtimeUrl,
                    library: shared.context().manifest.library,
                  },
                }
              : {}),
          },
          null,
          2,
        ) + '\n',
      );
      process.stdout.write(`Prepared ${checkpoints} animated handout states.\n`);
    },
    basePath,
    mounts,
    require,
  );
  return { directory, basePath, mounts, require };
}

async function pdf(filename = 'presentation.pdf', viteArguments = []) {
  const { directory, basePath, mounts, require } = await build(viteArguments);
  await withBrowser(
    directory,
    async (page, url) => {
      await page.goto(`${url}/?manim-print=1`);
      await ready(page);
      await page.pdf({ path: resolve(filename), printBackground: true, preferCSSPageSize: true });
      process.stdout.write(`Wrote ${resolve(filename)}\n`);
    },
    basePath,
    mounts,
    require,
  );
}

async function runtime(arguments_) {
  const { values } = parseArgs({ args: arguments_, options: { outDir: { type: 'string' } } });
  if (!values.outDir)
    throw new Error('slides runtime requires --outDir (for example ../site/runtime/v1).');
  await buildRuntime({ outDir: values.outDir, projectRequire: projectRequire() });
  process.stdout.write(`Created shared runtime in ${resolve(values.outDir)}\n`);
}

try {
  if (command === 'init') await init(args[0]);
  else if (command === 'dev') await vite(args);
  else if (command === 'build') await build(args);
  else if (command === 'runtime') await runtime(args);
  else if (command === 'pdf')
    await pdf(
      args[0]?.startsWith('-') ? undefined : args[0],
      args[0]?.startsWith('-') ? args : args.slice(1),
    );
  else
    process.stdout.write(
      'Usage: slides init [directory] | dev [vite options] | runtime --outDir directory | build [root] [--config file] [--mode mode] [--base path] [--outDir directory] [--runtime directory] | pdf [filename] [build options]\n',
    );
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
