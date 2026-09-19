#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { parseArgs } from 'node:util';

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

function projectRequire() {
  return createRequire(join(process.cwd(), 'package.json'));
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
  const installedPackage = packageRoot.includes(`${sep}node_modules${sep}`);
  await writeFile(
    join(target, 'package.json'),
    JSON.stringify(
      {
        name: 'my-manim-presentation',
        private: true,
        type: 'module',
        scripts: { dev: 'slides dev', build: 'slides build', pdf: 'slides pdf' },
        dependencies: {
          'manim-web': installedPackage ? `^${metadata.version}` : `file:${packageRoot}`,
          'reveal.js': '^6.0.2',
        },
        devDependencies: { vite: '^8.0.8', typescript: '^5.3.0', '@playwright/test': '^1.58.2' },
      },
      null,
      2,
    ) + '\n',
  );
  await writeFile(
    join(target, 'vite.config.ts'),
    "import { defineConfig } from 'vite';\nexport default defineConfig({ base: './' });\n",
  );
  await writeFile(
    join(target, 'README.md'),
    '# Your presentation\n\nRun `npm install`, then `npm run dev`.\n\nBefore the first build, install Chromium with `npx playwright install chromium`.\n`npm run build` writes a portable `dist/` including all handout states.\n`npm run pdf` builds and exports `presentation.pdf`.\n\nEdit `main.ts` for topics and static content; edit `scene.ts`, `text.ts`, `coordinates.ts` and `matrix.ts` for authored animation steps.\n',
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

async function serve(directory, basePath = '/') {
  const root = resolve(directory);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith(basePath)) throw new Error('Invalid base path');
      const localPath = pathname.slice(basePath.length);
      const file = resolve(
        root,
        localPath.endsWith('/') || !localPath ? localPath + 'index.html' : localPath,
      );
      if (relative(root, file).startsWith('..')) throw new Error('Invalid path');
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

async function withBrowser(directory, action, basePath = '/') {
  const { chromium } = projectRequire()('@playwright/test');
  const server = await serve(directory, basePath);
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
    },
  });
  if (positionals.length > 1) throw new Error('slides build accepts at most one project root.');
  const { build: viteBuild } = await import(pathToFileURL(projectRequire().resolve('vite')).href);
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
  const basePath = resolvedConfig.base.startsWith('.')
    ? '/'
    : new URL(resolvedConfig.base, 'http://localhost').pathname;
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
                if (!font.pathname.startsWith(basePath))
                  throw new Error(`Font is outside the built site's base path: ${font.pathname}`);
                run.font.url = `./${font.pathname.slice(basePath.length)}${font.search}`;
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
          },
          null,
          2,
        ) + '\n',
      );
      process.stdout.write(`Prepared ${checkpoints} animated handout states.\n`);
    },
    basePath,
  );
  return { directory, basePath };
}

async function pdf(filename = 'presentation.pdf', viteArguments = []) {
  const { directory, basePath } = await build(viteArguments);
  await withBrowser(
    directory,
    async (page, url) => {
      await page.goto(`${url}/?manim-print=1`);
      await ready(page);
      await page.pdf({ path: resolve(filename), printBackground: true, preferCSSPageSize: true });
      process.stdout.write(`Wrote ${resolve(filename)}\n`);
    },
    basePath,
  );
}

try {
  if (command === 'init') await init(args[0]);
  else if (command === 'dev') await vite(args);
  else if (command === 'build') await build(args);
  else if (command === 'pdf')
    await pdf(
      args[0]?.startsWith('-') ? undefined : args[0],
      args[0]?.startsWith('-') ? args : args.slice(1),
    );
  else
    process.stdout.write(
      'Usage: slides init [directory] | dev [vite options] | build [root] [--config file] [--mode mode] [--base path] [--outDir directory] | pdf [filename] [build options]\n',
    );
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
