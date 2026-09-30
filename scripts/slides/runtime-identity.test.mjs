import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildRuntime, loadRuntime } from './runtime.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function installedLibrary(project, identity) {
  const library = join(project, 'node_modules/manim-web');
  await mkdir(join(library, 'dist/reveal'), { recursive: true });
  await writeFile(
    join(project, 'package.json'),
    JSON.stringify({ name: 'runtime-identity-fixture' }),
  );
  await writeFile(
    join(library, 'package.json'),
    JSON.stringify({
      name: 'manim-web',
      version: '1.0.0',
      type: 'module',
      exports: { '.': './dist/index.js', './reveal': './dist/reveal/index.js' },
    }),
  );
  await writeFile(
    join(library, 'dist/index.js'),
    [
      'let configurationCount = 0;',
      'export function setKatexStylesheetUrl() {',
      '  if (++configurationCount > 1) throw new Error("KaTeX configured more than once");',
      '}',
      'export function getConfigurationCount() { return configurationCount; }',
      `export const identity = ${JSON.stringify(identity)};`,
    ].join('\n'),
  );
  await writeFile(join(library, 'dist/reveal/index.js'), 'export const revealIdentity = "reveal";');
  return createRequire(join(project, 'package.json'));
}

// MIGRATION: any distinct installed library builds have incompatible fingerprints
// even when their package versions match; each runtime configures KaTeX once
// regardless of the order or timing of core and Reveal entry imports.
test('pin the project library build and initialize shared styles only once', async () => {
  const temporary = await mkdtemp(join(repository, '.runtime-identity-test-'));
  try {
    const first = await installedLibrary(join(temporary, 'first'), 'first');
    const second = await installedLibrary(join(temporary, 'second'), 'second');
    const directory = join(temporary, 'runtime');
    const manifest = await buildRuntime({
      outDir: directory,
      projectRequire: first,
      packageRoot: repository,
    });
    assert.equal(manifest.library.version, '1.0.0');
    await loadRuntime(directory, { projectRequire: first, packageRoot: repository });
    await assert.rejects(
      loadRuntime(directory, { projectRequire: second, packageRoot: repository }),
      /different manim-web build/,
    );
    const core = await import(pathToFileURL(join(directory, manifest.modules['manim-web'])).href);
    assert.equal(core.identity, 'first');
    assert.equal(core.getConfigurationCount(), 1);
    await import(pathToFileURL(join(directory, manifest.modules['manim-web/reveal'])).href);
    assert.equal(core.getConfigurationCount(), 1);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
