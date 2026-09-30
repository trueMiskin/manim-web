#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { lstat, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false } } });

const outputs = [
  'dist',
  'docs-src',
  'coverage',
  '.vite',
  'node_modules/.vite',
  'playwright-report',
  'test-results',
  'qualification-results',
  'docs/docs/api',
  'docs/build',
  'docs/.docusaurus',
  'docs/.cache-loader',
  'examples/presentations/tech-demo/reference/media',
  'examples/presentations/tech-demo/reference/slides',
  'examples/presentations/tech-demo/reference/__pycache__',
];

/** @post result === true => (await lstat(resolve(root, path))).isSymbolicLink() === false */
async function isLocal(path) {
  let current = root;
  for (const part of path.split('/')) {
    current = resolve(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) return false;
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
      throw error;
    }
  }
  return true;
}

async function presentationOutputs() {
  const directory = 'examples/presentations';
  if (!(await isLocal(directory))) return [];
  const paths = [];
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const example = `${directory}/${entry.name}`;
    paths.push(`${example}/dist`, `${example}/.vite`, `${example}/node_modules/.vite`);
    for (const file of await readdir(resolve(root, example), { withFileTypes: true })) {
      if (file.isFile() && file.name.endsWith('.pdf')) paths.push(`${example}/${file.name}`);
    }
  }
  return paths;
}

function gitPaths(args, input) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', input });
  if (result.error) throw result.error;
  if (result.status !== 0 && !(args[0] === 'check-ignore' && result.status === 1)) {
    throw new Error(result.stderr.trim() || 'Cannot determine generated files using Git.');
  }
  return result.stdout.split('\0').filter(Boolean);
}

async function clean() {
  const tracked = gitPaths(['ls-files', '--cached', '-z']);
  const candidates = [];
  for (const path of [...outputs, ...(await presentationOutputs())]) {
    if (await isLocal(path)) candidates.push(path);
  }
  if (!candidates.length) return;
  const ignored = new Set(
    gitPaths(['check-ignore', '--stdin', '-z'], candidates.join('\0') + '\0'),
  );
  for (const path of candidates) {
    if (!ignored.has(path)) continue;
    if (tracked.some((file) => file === path || file.startsWith(`${path}/`))) {
      process.stdout.write(`Keeping ${path}: contains tracked files.\n`);
      continue;
    }
    if (values['dry-run']) process.stdout.write(`Would remove ${path}\n`);
    else {
      // Remove the exact candidate: git clean can expand an ignored parent directory.
      await rm(resolve(root, path), { recursive: true, force: true });
      process.stdout.write(`Removed ${path}\n`);
    }
  }
}

try {
  await clean();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
