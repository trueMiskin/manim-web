#!/usr/bin/env node
// Run against `npm run dev`. CDP GC separates a retained disposed Player from
// browser/font/module caches; results describe this machine, not a frame-rate SLA.
import { chromium } from '@playwright/test';
import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { arch, cpus, platform, release, totalmem } from 'node:os';

const origin = process.env.MANIM_BENCH_URL ?? 'http://localhost:5173';
const sampleMs = Number(process.env.MANIM_BENCH_SAMPLE_MS ?? 3500);
if (!Number.isFinite(sampleMs) || sampleMs <= 0)
  throw new Error('Sample duration must be positive.');
const maximumP95 = process.env.MANIM_BENCH_MAX_FRAME_P95_MS
  ? Number(process.env.MANIM_BENCH_MAX_FRAME_P95_MS)
  : undefined;
if (maximumP95 !== undefined && (!Number.isFinite(maximumP95) || maximumP95 <= 0))
  throw new Error('Maximum p95 frame time must be positive.');
const destination = resolve(
  process.env.MANIM_BENCH_OUTPUT ?? 'qualification-results/recording.json',
);
const scenarios = [
  ['3d', ['3d-rotation']],
  ['dynamic', ['dynamic-motion']],
  ['fields', ['fields-smoothing']],
  ['optimization', ['optimization-motion']],
].filter(([name]) => !process.env.MANIM_BENCH_CASE || name === process.env.MANIM_BENCH_CASE);
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : { channel: 'chrome' },
);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const cdp = await page.context().newCDPSession(page);
const report = {
  recordedAt: new Date().toISOString(),
  browser: browser.version(),
  machine: {
    cpu: cpus()[0]?.model,
    memoryBytes: totalmem(),
    platform: platform(),
    architecture: arch(),
    osRelease: release(),
  },
  origin,
  viewport: [1280, 720],
  sampleMs,
  maximumFrameP95Ms: maximumP95,
  scenarios: [],
};
await page.route(`${origin}/__recording_benchmark__`, (route) =>
  route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#000}#scene{width:1280px;height:720px}</style></head><body><div id="scene"></div></body></html>',
  }),
);
try {
  await page.goto(`${origin}/__recording_benchmark__`);
  await page.evaluate(async (sampleMs) => {
    const { Player } = await import('/src/index.ts');
    const { prepareSourceFonts } =
      await import('/examples/presentations/tech-demo/scenes/source-font.ts');
    await prepareSourceFonts();
    globalThis.retained = [];
    globalThis.rendererCounts = (player) => {
      const info = player.scene.renderer.getThreeRenderer().info;
      return {
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
      };
    };
    globalThis.loadRecording = async (name) => {
      const definition = (await import(`/examples/presentations/tech-demo/scenes/demo-${name}.ts`))
        .default;
      const player = new Player(globalThis.document.querySelector('#scene'), {
        width: 1280,
        height: 720,
        frameWidth: (1280 / 720) * 8,
        frameHeight: 8,
        ui: false,
        keyboard: false,
        pointer: false,
        autoPlay: false,
        ...definition.options,
        scene: definition.createScene,
        ownsScene: true,
      });
      const start = globalThis.performance.now();
      await player.sequence(definition.build);
      await player.prepare();
      globalThis.player = player;
      const compileMs = globalThis.performance.now() - start;
      // Diagnostic accounting only; no application or renderer behavior changes.
      const compiled = player._recorder._compiled;
      const states = compiled.flatMap(({ start, end }) => [...start.objects, ...end.objects]);
      const distinct = new Set(states.map(({ state }) => state));
      return {
        name,
        compileMs,
        segments: compiled.length,
        checkpoints: player.checkpoints.length,
        objectRecords: states.length,
        distinctObjectStates: distinct.size,
        expandedStateBytes: states.reduce(
          (sum, { state }) => sum + JSON.stringify(state).length,
          0,
        ),
      };
    };
    globalThis.sampleFrames = async (id) => {
      const player = globalThis.player;
      const intervals = [];
      const stages = {};
      const hooks = [
        [player._recorder, '_advance', 'fixedClockReplay'],
        [player._recorder, '_begin', 'animationBegin'],
        [player.scene, 'batch', 'restoreBatch'],
        [player.scene, '_render', 'renderIncludingSync'],
      ].map(([owner, method, label]) => {
        const original = owner[method];
        stages[label] = [];
        owner[method] = function (...args) {
          const start = globalThis.performance.now();
          try {
            return Reflect.apply(original, this, args);
          } finally {
            stages[label].push(globalThis.performance.now() - start);
          }
        };
        return () => (owner[method] = original);
      });
      let previous = globalThis.performance.now();
      const unsubscribe = player.on('frame', () => {
        const now = globalThis.performance.now();
        intervals.push(now - previous);
        previous = now;
      });
      try {
        player.playCheckpoint(id);
        await new Promise((resolve) => globalThis.setTimeout(resolve, sampleMs));
      } finally {
        player.stop();
        unsubscribe();
        hooks.forEach((restore) => restore());
      }
      intervals.shift();
      intervals.sort((a, b) => a - b);
      return {
        id,
        frames: intervals.length,
        p50Ms: intervals[Math.floor(intervals.length * 0.5)],
        p95Ms: intervals[Math.floor(intervals.length * 0.95)],
        maxMs: intervals.at(-1),
        // Stages can overlap: restoreBatch includes any eager render, while replay
        // includes updater work. These diagnostic timings must not be summed.
        stages: Object.fromEntries(
          Object.entries(stages).map(([label, samples]) => {
            samples.sort((a, b) => a - b);
            return [
              label,
              {
                calls: samples.length,
                totalMs: samples.reduce((sum, value) => sum + value, 0),
                p50Ms: samples[Math.floor(samples.length * 0.5)],
                p95Ms: samples[Math.floor(samples.length * 0.95)],
              },
            ];
          }),
        ),
      };
    };
  }, sampleMs);
  await cdp.send('HeapProfiler.collectGarbage');
  report.baseline = await cdp.send('Runtime.getHeapUsage');
  for (const [name, checkpoints] of scenarios) {
    const result = await page.evaluate((name) => globalThis.loadRecording(name), name);
    await cdp.send('HeapProfiler.collectGarbage');
    result.liveHeap = await cdp.send('Runtime.getHeapUsage');
    result.frameIntervals = [];
    for (const id of checkpoints)
      result.frameIntervals.push(await page.evaluate((id) => globalThis.sampleFrames(id), id));
    result.liveRenderer = await page.evaluate(() => globalThis.rendererCounts(globalThis.player));
    await page.evaluate(() => {
      globalThis.player.dispose();
      globalThis.retained.push(globalThis.player);
      globalThis.player = null;
    });
    result.disposedRenderer = await page.evaluate(() =>
      globalThis.rendererCounts(globalThis.retained.at(-1)),
    );
    await cdp.send('HeapProfiler.collectGarbage');
    result.disposedRetainedHeap = await cdp.send('Runtime.getHeapUsage');
    await page.evaluate(() => {
      globalThis.retained = [];
    });
    await cdp.send('HeapProfiler.collectGarbage');
    result.releasedHeap = await cdp.send('Runtime.getHeapUsage');
    report.scenarios.push(result);
    process.stdout.write(
      `${name}: compile ${Math.round(result.compileMs)} ms, heap ${(result.liveHeap.usedSize / 1e6).toFixed(1)} MB, retained after dispose ${(result.disposedRetainedHeap.usedSize / 1e6).toFixed(1)} MB\n`,
    );
  }
} finally {
  await mkdir(resolve(destination, '..'), { recursive: true });
  await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}

if (maximumP95 !== undefined) {
  const failures = report.scenarios.flatMap(({ name, frameIntervals }) =>
    frameIntervals
      .filter(({ p95Ms }) => !Number.isFinite(p95Ms) || p95Ms > maximumP95)
      .map(({ id, p95Ms }) => `${name}/${id}: ${p95Ms ?? 'no frames'} ms`),
  );
  if (failures.length)
    throw new Error(`Frame p95 exceeds ${maximumP95} ms: ${failures.join(', ')}`);
}
