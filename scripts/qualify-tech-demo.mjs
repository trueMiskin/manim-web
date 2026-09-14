#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

const root = new URL('../examples/presentations/tech-demo/', import.meta.url);
const output = new URL('../qualification-results/tech-demo/', import.meta.url);
await mkdir(output, { recursive: true });
const assets = JSON.parse(await readFile(new URL('dist/manim-handout.json', root), 'utf8'));
const snapshots = new Map(
  Object.values(assets.scenes).flatMap((scene) => Object.entries(scene.snapshots)),
);
const expectedTopics = [
  'text',
  'optics',
  'formulas',
  'reflections',
  'dynamic',
  '3d',
  'fields',
  'optimization',
];
assert.deepEqual(
  Object.keys(assets.scenes),
  expectedTopics.map((id) => `${id}/${id}`),
);
const topicCheckpoints = new Map(
  expectedTopics.map((id) => [id, assets.scenes[`${id}/${id}`].checkpoints]),
);
assert.ok([...topicCheckpoints.values()].every((checkpoints) => checkpoints.length === 2));
const expected = [...topicCheckpoints.values()].flat();
assert.equal(new Set(expected.map(({ id }) => id)).size, expected.length);
const server = await preview({
  root: fileURLToPath(root),
  configFile: false,
  preview: { host: '127.0.0.1', port: 4185, strictPort: true },
});
const origin = 'http://127.0.0.1:4185';
let browser;
let page;
const report = {
  title: assets.title,
  checkpoints: expected.length,
  browser: '',
  errors: [],
  externalRequests: [],
  failedRequests: [],
  httpErrors: [],
  startup: {},
  chapters: [],
  pdf: {},
  resources: [],
};
const files = await readdir(new URL('dist/', root), { recursive: true, withFileTypes: true });
report.build = {
  ...JSON.parse(await readFile(new URL('dist/manim-build-report.json', root), 'utf8')),
  files: files.filter((file) => file.isFile()).length,
  bytes: (
    await Promise.all(
      files
        .filter((file) => file.isFile())
        .map(async (file) => (await stat(`${file.parentPath}/${file.name}`)).size),
    )
  ).reduce((sum, bytes) => sum + bytes, 0),
};
async function openPage() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const bundledAvailable = await stat(chromium.executablePath()).then(
    () => true,
    () => false,
  );
  browser = await chromium.launch(
    executablePath ? { executablePath } : bundledAvailable ? {} : { channel: 'chrome' },
  );
  report.browser = browser.version();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ['data:', 'blob:', 'about:'].includes(url.protocol))
      return route.continue();
    report.externalRequests.push(url.href);
    return route.abort();
  });
  page = await context.newPage();
  await page.addInitScript(() => performance.setResourceTimingBufferSize(5000));
  page.on('pageerror', (error) => report.errors.push(String(error)));
  page.on('requestfailed', (request) => report.failedRequests.push(request.url()));
  page.on('response', (response) => {
    if (response.status() >= 400)
      report.httpErrors.push({ url: response.url(), status: response.status() });
  });
}
const ready = () =>
  page.waitForFunction(
    () => globalThis.__MANIM_PRESENTATION__?.ready || globalThis.__MANIM_PRESENTATION__?.error,
    undefined,
    { timeout: 300000 },
  );
const fingerprint = async (id) =>
  page.evaluate(async (id) => {
    const p = globalThis.__MANIM_PRESENTATION__.player;
    p.seekCheckpoint(id);
    const snapshot = await p.captureCheckpoint(id);
    return { image: snapshot.image, text: snapshot.text };
  }, id);
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalizeText = (text) =>
  text
    .normalize('NFKC')
    .replace(/[\u200b\u00ad]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();

function verifyProse(id, extractedText, snapshot) {
  const runs = snapshot.text
    .filter(({ kind }) => kind === 'text')
    .map(({ text }) => normalizeText(text))
    .filter(Boolean);
  // Longest first prevents short labels from consuming a substring of a longer
  // prose run. Repeated runs must have repeated counterparts in the PDF.
  let available = normalizeText(extractedText);
  for (const run of [...runs].sort((a, b) => b.length - a.length)) {
    const position = available.indexOf(run);
    assert.ok(position !== -1, `${id}: PDF omits selectable prose ${JSON.stringify(run)}`);
    available = available.slice(0, position) + '\0' + available.slice(position + run.length);
  }
  return runs.length;
}

try {
  await openPage();
  const start = performance.now();
  await page.goto(origin);
  await ready();
  assert.equal(await page.evaluate(() => globalThis.__MANIM_PRESENTATION__.error), undefined);
  report.startup.printReadyMs = performance.now() - start;
  const ids = await page.evaluate(() =>
    globalThis.__MANIM_PRESENTATION__.routes.map((route) => route.checkpoint.id),
  );
  assert.deepEqual(
    ids,
    expected.map(({ id }) => id),
  );
  assert.equal(await page.locator('.manim-page').count(), expected.length);
  report.startup.resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => ({
      url: entry.name,
      transferBytes: entry.transferSize,
      decodedBytes: entry.decodedBodySize,
    })),
  );

  // MIGRATION: printing an unvisited deck contains each authored demo checkpoint exactly once.
  await page.pdf({
    path: fileURLToPath(new URL('tech-demo.pdf', output)),
    printBackground: true,
    preferCSSPageSize: true,
  });
  const pdfTask = getDocument({
    data: new Uint8Array(await readFile(new URL('tech-demo.pdf', output))),
    useSystemFonts: true,
  });
  const pdf = await pdfTask.promise;
  assert.equal(pdf.numPages, expected.length);
  const extracted = [];
  let verifiedProseRuns = 0;
  let formulaRuns = 0;
  let selectableFormulaRuns = 0;
  for (let number = 1; number <= pdf.numPages; number++) {
    const pdfPage = await pdf.getPage(number);
    const text = (await pdfPage.getTextContent()).items
      .filter((item) => 'str' in item)
      // Font changes can split one word into adjacent PDF items. Preserve the
      // extractor's actual spaces and line breaks instead of inserting spaces.
      .map(({ str, hasEOL }) => str + (hasEOL ? '\n' : ''))
      .join('');
    const id = ids[number - 1];
    const snapshot = snapshots.get(id);
    assert.ok(snapshot, `${id}: prepared snapshot exists`);
    const proseRuns = verifyProse(id, text, snapshot);
    verifiedProseRuns += proseRuns;
    const formulas = snapshot.text.filter(({ kind }) => kind === 'math');
    const selectableFormulas = formulas.filter((run) =>
      normalizeText(text).includes(normalizeText(run.text)),
    ).length;
    formulaRuns += formulas.length;
    selectableFormulaRuns += selectableFormulas;
    if (formulas.length) {
      const operators = await pdfPage.getOperatorList();
      assert.ok(
        operators.fnArray.includes(OPS.paintImageXObject),
        `${id}: mathematical graphics remain in PDF`,
      );
    }
    extracted.push({
      page: number,
      checkpoint: id,
      text,
      proseRuns,
      formulaRuns: formulas.length,
      selectableFormulaRuns: selectableFormulas,
    });
  }
  assert.ok(verifiedProseRuns > 0, 'The demo exports native selectable prose.');
  assert.ok(formulaRuns > 0, 'The demo includes rendered mathematical notation.');
  for (const id of expectedTopics.map((topic) => topicCheckpoints.get(topic).at(-1).id)) {
    const number = ids.indexOf(id) + 1;
    const pdfPage = await pdf.getPage(number);
    const viewport = pdfPage.getViewport({ scale: 1 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    await writeFile(new URL(`page-${number}-${id}.png`, output), canvas.toBuffer('image/png'));
    const operators = await pdfPage.getOperatorList();
    assert.ok(operators.fnArray.includes(OPS.paintImageXObject), `${id}: graphics remain in PDF`);
  }
  report.pdf = {
    pages: pdf.numPages,
    bytes: (await stat(new URL('tech-demo.pdf', output))).size,
    selectablePages: extracted.filter(({ text }) => text.length > 0).length,
    verifiedProseRuns,
    formulaRuns,
    selectableFormulaRuns,
    text: extracted,
  };
  await pdfTask.destroy();
  process.stdout.write(
    `Verified all ${expected.length} unvisited PDF pages and extracted selectable text.\n`,
  );

  // MIGRATION: every demo topic reconstructs the same image and semantic state after reverse seeking.
  const topics = await page.evaluate(() => [
    ...new Set(globalThis.__MANIM_PRESENTATION__.routes.map(({ topic }) => topic.id)),
  ]);
  assert.deepEqual(topics, expectedTopics);
  for (const topic of topics) {
    const route = await page.evaluate(
      (id) =>
        globalThis.__MANIM_PRESENTATION__.routes.filter(({ topic }) => topic.id === id).at(-1)
          .element.id,
      topic,
    );
    const switchStart = performance.now();
    await page.evaluate((id) => {
      globalThis.location.hash = `#/${id}`;
    }, route);
    await page.waitForFunction(
      (id) => {
        const plugin = globalThis.__MANIM_PRESENTATION__;
        return (
          plugin.error ||
          (plugin.player && globalThis.document.getElementById(id)?.dataset.live === 'true')
        );
      },
      route,
      { timeout: 120000 },
    );
    assert.equal(await page.evaluate(() => globalThis.__MANIM_PRESENTATION__.error), undefined);
    const checkpointIds = await page.evaluate(() => {
      const p = globalThis.__MANIM_PRESENTATION__.player;
      p.pause();
      return p.checkpoints.map(({ id }) => id);
    });
    assert.deepEqual(
      checkpointIds,
      topicCheckpoints.get(topic).map(({ id }) => id),
    );
    const switchMs = performance.now() - switchStart;
    const fingerprints = new Map();
    for (const id of checkpointIds) fingerprints.set(id, digest(await fingerprint(id)));
    for (const id of [...checkpointIds].reverse())
      assert.equal(
        digest(await fingerprint(id)),
        fingerprints.get(id),
        `${topic}/${id}: reverse seek`,
      );
    const metrics = await page.evaluate(() => ({
      heapBytes: performance.memory?.usedJSHeapSize,
      canvases: globalThis.document.querySelectorAll('.manim-live canvas').length,
    }));
    assert.equal(metrics.canvases, 1);
    report.chapters.push({ topic, checkpoints: checkpointIds.length, switchMs, ...metrics });
    process.stdout.write(
      `Verified ${topic}: all ${checkpointIds.length} checkpoints deterministic.\n`,
    );
  }
  report.resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => ({
      url: entry.name,
      transferBytes: entry.transferSize,
      decodedBytes: entry.decodedBodySize,
    })),
  );
  await page.goto(`${origin}/?manim-print=1`);
  await ready();
  assert.equal(await page.evaluate(() => globalThis.__MANIM_PRESENTATION__.error), undefined);
  assert.equal(await page.locator('.manim-page').count(), expected.length);
  assert.equal(await page.locator('.manim-live canvas').count(), 0);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.failedRequests, []);
  assert.deepEqual(report.httpErrors, []);
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
