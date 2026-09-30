#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { chromium } from '@playwright/test';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(packageRoot, 'scripts/slides.mjs');
await stat(join(packageRoot, 'dist/reveal/index.js')).catch(() => {
  throw new Error('Build the library with npm run build before running this test.');
});

const temporary = await mkdtemp(join(packageRoot, '.shared-runtime-test-'));
const project = join(temporary, 'presentation');
const site = join(temporary, 'site');
const runtime = join(site, 'runtime/v1');
const first = join(site, 'first');
const second = join(site, 'second');
const standalone = join(site, 'standalone');

async function run(args, expectedFailure) {
  const result = await new Promise((accept, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: project,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.once('error', reject);
    child.once('exit', (code) => accept({ code, output }));
  });
  if (expectedFailure) {
    assert.notEqual(result.code, 0, `Command must reject: ${args.join(' ')}`);
    assert.match(result.output, expectedFailure);
  } else {
    assert.equal(result.code, 0, result.output);
  }
}

async function fingerprint(directory) {
  const files = await readdir(directory, { recursive: true, withFileTypes: true });
  const entries = await Promise.all(
    files
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const filename = join(entry.parentPath, entry.name);
        return [
          relative(directory, filename),
          createHash('sha256')
            .update(await readFile(filename))
            .digest('hex'),
        ];
      }),
  );
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
}

async function scriptBytes(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const sizes = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
      .map(async (entry) => (await stat(join(entry.parentPath, entry.name))).size),
  );
  return sizes.reduce((total, size) => total + size, 0);
}

// MIGRATION: the selected project's installed library must match the pinned
// runtime byte-for-byte, even when both packages report the same version.
async function rejectDifferentInstallation() {
  const incompatibleProject = join(temporary, 'different-installation');
  const installedLibrary = join(incompatibleProject, 'node_modules/manim-web');
  const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  await mkdir(join(installedLibrary, 'dist/reveal'), { recursive: true });
  await writeFile(
    join(incompatibleProject, 'package.json'),
    JSON.stringify({ name: 'different-installation', private: true, type: 'module' }),
  );
  await writeFile(
    join(installedLibrary, 'package.json'),
    JSON.stringify({
      name: 'manim-web',
      version: metadata.version,
      type: 'module',
      exports: { '.': './dist/index.js', './reveal': './dist/reveal/index.js' },
    }),
  );
  await writeFile(join(installedLibrary, 'dist/index.js'), 'export const differentBuild = true;\n');
  await writeFile(join(installedLibrary, 'dist/reveal/index.js'), 'export {};\n');
  await run(
    ['build', incompatibleProject, '--runtime', runtime, '--outDir', first],
    /different manim-web build/,
  );
}

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function startServer(failures) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname === '/favicon.ico') {
        response.writeHead(204).end();
        return;
      }
      assert.ok(pathname.startsWith('/course/'), `Unexpected deployment path: ${pathname}`);
      const filename = resolve(
        site,
        pathname.slice('/course/'.length) + (pathname.endsWith('/') ? 'index.html' : ''),
      );
      assert.ok(filename.startsWith(site + sep));
      const content = await readFile(filename);
      response.writeHead(200, { 'Content-Type': mimeTypes[extname(filename)] ?? 'text/plain' });
      response.end(content);
    } catch (error) {
      failures.push(String(error));
      response.writeHead(404).end();
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  return server;
}

async function inspectDeck(browser, url, title, shared) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => errors.push(request.url()));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    requests.push(response.url());
  });
  await page.route('**/*', (route) => {
    const requested = new URL(route.request().url());
    if (requested.origin === new URL(url).origin) return route.continue();
    errors.push(`External resource: ${requested.href}`);
    return route.abort();
  });
  try {
    await page.goto(url);
    await page.waitForFunction(
      () => globalThis.__MANIM_PRESENTATION__?.ready || globalThis.__MANIM_PRESENTATION__?.error,
      undefined,
      { timeout: 120000 },
    );
    const state = await page.evaluate(async () => {
      const presentation = globalThis.__MANIM_PRESENTATION__;
      const assets = await (await globalThis.fetch('./manim-handout.json')).json();
      const snapshots = Object.values(assets.scenes).flatMap((scene) =>
        Object.values(scene.snapshots),
      );
      const urls = snapshots.flatMap((snapshot) => [
        snapshot.image,
        ...snapshot.text.map((run) => run.font.url).filter(Boolean),
      ]);
      const resources = await Promise.all(
        [...new Set(urls)].map(async (resource) => {
          const response = await globalThis.fetch(resource);
          return { resource, ok: response.ok };
        }),
      );
      await globalThis.document.fonts.ready;
      return {
        ready: presentation.ready,
        error: presentation.error,
        title: assets.title,
        routes: presentation.routes.length,
        pages: globalThis.document.querySelectorAll('.manim-page').length,
        text: globalThis.document.querySelector('.manim-handout').textContent,
        resources,
      };
    });
    assert.equal(state.ready, true);
    assert.equal(state.error, undefined);
    assert.equal(state.title, title);
    assert.equal(state.routes, 3);
    assert.equal(state.pages, state.routes);
    assert.ok(state.text.includes(title));
    assert.ok(state.resources.length > 0);
    assert.ok(
      state.resources.every(({ ok }) => ok),
      JSON.stringify(state.resources),
    );

    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => globalThis.location.hash.includes('geometry--circle--draw'));
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => globalThis.location.hash.includes('geometry--circle--move'));
    await page.waitForFunction(() => !globalThis.__MANIM_PRESENTATION__.player.isPlaying);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.manim-handout').isVisible(), true);
    const sharedRequests = requests.filter((request) => request.includes('/course/runtime/v1/'));
    assert.equal(sharedRequests.length > 0, shared);
    if (shared) {
      assert.ok(sharedRequests.some((request) => request.endsWith('.woff2')));
      assert.ok(sharedRequests.some((request) => request.endsWith('.css')));
      assert.ok(sharedRequests.some((request) => request.endsWith('.js')));
    }
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

// MIGRATION: adding any independent presentation preserves every existing deck
// and pinned runtime byte, and all decks retain working navigation and handouts
// when the complete site is moved to a different URL prefix.
let server;
let browser;
try {
  await cp(join(packageRoot, 'tests/fixtures/shared-runtime'), project, { recursive: true });
  await mkdir(join(project, 'node_modules'), { recursive: true });
  await symlink(packageRoot, join(project, 'node_modules/manim-web'), 'dir');
  await mkdir(site, { recursive: true });
  process.stdout.write('Building one shared runtime and the first presentation.\n');
  await run(['runtime', '--outDir', runtime]);
  await run([
    'build',
    '--runtime',
    runtime,
    '--outDir',
    first,
    '--base',
    './',
    '--target',
    'esnext',
  ]);
  const runtimeBefore = await fingerprint(runtime);
  const firstBefore = await fingerprint(first);
  assert.ok(Object.keys(runtimeBefore).includes('manim-runtime.json'));

  await run(['runtime', '--outDir', runtime], /Runtime directory is not empty/);
  await run(
    ['build', '--runtime', runtime, '--outDir', site],
    /overlap|contain|outside|runtime|directory/i,
  );
  const unsafeConfig = join(project, 'unsafe-output.config.mjs');
  await writeFile(
    unsafeConfig,
    `export default ${JSON.stringify({ build: { rollupOptions: { output: { dir: runtime } } } })};\n`,
  );
  await run(
    ['build', '--config', unsafeConfig, '--runtime', runtime, '--outDir', first],
    /build.outDir/,
  );
  await rejectDifferentInstallation();
  assert.deepEqual(await fingerprint(runtime), runtimeBefore);
  assert.deepEqual(await fingerprint(first), firstBefore);

  const source = await readFile(join(project, 'main.ts'), 'utf8');
  await writeFile(
    join(project, 'main.ts'),
    source.replaceAll('First independent', 'Second independent'),
  );
  process.stdout.write('Adding a second presentation and exporting its PDF.\n');
  const pdf = join(temporary, 'second.pdf');
  await run([
    'pdf',
    pdf,
    '--runtime',
    runtime,
    '--outDir',
    second,
    '--base',
    './',
    '--target',
    'esnext',
  ]);
  assert.equal((await readFile(pdf)).subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual(await fingerprint(runtime), runtimeBefore);
  assert.deepEqual(await fingerprint(first), firstBefore);
  const sharedBytes = await scriptBytes(second);
  assert.ok(
    sharedBytes < 100000,
    `Shared deck must not rebundle the library: ${sharedBytes} bytes`,
  );

  process.stdout.write(
    'Checking standalone export and both independently built decks in Chromium.\n',
  );
  await run(['build', '--outDir', standalone, '--base', './', '--target', 'esnext']);
  assert.ok((await scriptBytes(standalone)) > sharedBytes * 10);
  const failures = [];
  server = await startServer(failures);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const bundled = await stat(chromium.executablePath()).then(
    () => true,
    () => false,
  );
  browser = await chromium.launch(
    executablePath ? { executablePath } : bundled ? {} : { channel: 'chrome' },
  );
  await inspectDeck(browser, `${origin}/course/first/`, 'First independent deck', true);
  await inspectDeck(browser, `${origin}/course/second/`, 'Second independent deck', true);
  await inspectDeck(browser, `${origin}/course/standalone/`, 'Second independent deck', false);
  assert.deepEqual(failures, []);
  process.stdout.write(
    'Verified immutable runtime and existing deck, independent exports, shared fonts, handouts, navigation, PDF, and standalone builds.\n',
  );
} finally {
  await browser?.close();
  if (server) await new Promise((accept) => server.close(accept));
  await rm(temporary, { recursive: true, force: true });
}
