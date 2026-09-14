#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { chromium } from '@playwright/test';

// MIGRATION: a previously cached handout must not mask the current deck after a rebuild.
const directory = resolve(
  process.env.BUILD_DIR ??
    fileURLToPath(new URL('../examples/presentations/tech-demo/dist/', import.meta.url)),
);
const actual = JSON.parse(await readFile(resolve(directory, 'manim-handout.json'), 'utf8'));
const stale = { ...actual, title: `${actual.title} (previous build)` };
const checkpoints = Object.values(actual.scenes).reduce(
  (total, scene) => total + scene.checkpoints.length,
  0,
);
assert.ok(checkpoints > 0, 'The built presentation contains checkpoints.');
let manifestRequests = 0;
const failures = [];
const contentTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (pathname === '/prime') {
      response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      response.end('<!doctype html><title>Prime handout HTTP cache</title>');
      return;
    }
    if (pathname === '/manim-handout.json') {
      manifestRequests += 1;
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400',
      });
      response.end(JSON.stringify(manifestRequests === 1 ? stale : actual));
      return;
    }
    const path = resolve(directory, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!path.startsWith(directory + sep)) {
      response.writeHead(403);
      response.end();
      return;
    }
    const bytes = await readFile(path);
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(path)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(bytes);
  } catch (error) {
    failures.push(String(error));
    response.writeHead(404);
    response.end();
  }
});
await new Promise((accept) => server.listen(0, '127.0.0.1', accept));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const bundled = await stat(chromium.executablePath()).then(
    () => true,
    () => false,
  );
  browser = await chromium.launch(
    executablePath ? { executablePath } : bundled ? {} : { channel: 'chrome' },
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${origin}/prime`);
  const cachedTitle = await page.evaluate(
    async () => (await (await fetch('/manim-handout.json')).json()).title,
  );
  assert.equal(cachedTitle, stale.title);
  assert.equal(manifestRequests, 1);
  await page.goto(origin);
  await page.waitForFunction(
    () => globalThis.__MANIM_PRESENTATION__?.ready || globalThis.__MANIM_PRESENTATION__?.error,
    undefined,
    { timeout: 120000 },
  );
  const result = await page.evaluate(() => ({
    ready: globalThis.__MANIM_PRESENTATION__.ready,
    error: globalThis.__MANIM_PRESENTATION__.error,
    routes: globalThis.__MANIM_PRESENTATION__.routes.length,
    pages: document.querySelectorAll('.manim-page').length,
  }));
  assert.equal(result.ready, true);
  assert.equal(result.error, undefined);
  assert.equal(result.routes, checkpoints);
  assert.equal(result.pages, checkpoints);
  assert.ok(manifestRequests >= 2, 'The deck must revalidate the cached handout with the origin.');
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failures, []);
  process.stdout.write(
    `Verified handout HTTP cache revalidation: ${manifestRequests} origin requests, ${checkpoints} ready checkpoints, no browser errors.\n`,
  );
} finally {
  await browser?.close();
  await new Promise((accept) => server.close(accept));
}
