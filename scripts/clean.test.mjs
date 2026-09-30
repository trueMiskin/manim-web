import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(program, args, cwd) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

function success(result) {
  assert.equal(result.status, 0, result.stderr);
}

// MIGRATION: cleanup removes only ignored outputs at selected locations;
// previews and invalid arguments preserve all files, and real cleanup preserves
// tracked files, dependency siblings, local settings, and symlink targets.
test('clean preserves local work while removing generated output', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'manim-clean-'));
  const root = join(temporary, 'repo');
  const outside = join(temporary, 'outside');
  const removed = [
    'dist/index.js',
    'node_modules/.vite/cache.json',
    'test-results/report.json',
    'examples/presentations/basic/dist/index.html',
    'examples/presentations/basic/presentation.pdf',
  ];
  const kept = [
    '.env.local',
    'node_modules/three/package.json',
    'thoughts/notes.md',
    'manim-web-0.3.24.tgz',
    'docs/docs/api/tracked.md',
    'examples/presentations/tech-demo/reference/.venv/lib/dependency.py',
  ];
  try {
    await mkdir(join(root, 'scripts'), { recursive: true });
    await copyFile(join(repository, 'scripts/clean.mjs'), join(root, 'scripts/clean.mjs'));
    await copyFile(join(repository, '.gitignore'), join(root, '.gitignore'));
    for (const file of [...removed, ...kept]) {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await writeFile(join(root, file), `Keep the contents of ${file}`);
    }
    await mkdir(join(outside, 'dist'), { recursive: true });
    await writeFile(join(outside, 'dist/source.txt'), 'external source');
    await symlink(outside, join(root, 'qualification-results'), 'junction');
    await symlink(outside, join(root, 'examples/presentations/linked'), 'junction');
    success(run('git', ['init', '--quiet'], root));
    success(run('git', ['add', '--force', 'docs/docs/api/tracked.md'], root));

    const args = [join(root, 'scripts/clean.mjs')];
    const preview = run(process.execPath, [...args, '--dry-run'], root);
    success(preview);
    assert.match(preview.stdout, /Would remove dist\b/);
    assert.doesNotMatch(preview.stdout, /Would remove node_modules\s*$/m);
    assert.notEqual(run(process.execPath, [...args, '--unknown'], root).status, 0);
    for (const file of removed) assert.ok((await stat(join(root, file))).isFile());

    // Run from another directory to verify the script anchors paths to its own checkout.
    success(run(process.execPath, args, outside));
    for (const file of removed) await assert.rejects(stat(join(root, file)), { code: 'ENOENT' });
    for (const file of kept) {
      assert.equal(await readFile(join(root, file), 'utf8'), `Keep the contents of ${file}`);
    }
    assert.equal(await readFile(join(outside, 'dist/source.txt'), 'utf8'), 'external source');
    success(run(process.execPath, args, root));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
