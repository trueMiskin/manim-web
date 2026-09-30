import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const runtimeManifestName = 'manim-runtime.json';

const moduleNames = {
  core: 'manim-web',
  reveal: 'manim-web/reveal',
  three: 'three',
  katex: 'katex',
  revealjs: 'reveal.js',
  notes: 'reveal.js/plugin/notes',
};
const virtualPrefix = '\0manim-runtime:';
const setupModule = '\0manim-runtime-setup';

async function filesIn(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory())
      files.push(...(await filesIn(join(directory, entry.name), name + '/')));
    else if (entry.isFile()) files.push(name);
  }
  return files.sort();
}

async function fileHashes(directory, files) {
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file,
        createHash('sha256')
          .update(await readFile(join(directory, file)))
          .digest('hex'),
      ]),
    ),
  );
}

async function libraryIdentity(packageRoot) {
  const metadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  const directory = join(packageRoot, 'dist');
  let files;
  try {
    files = (await filesIn(directory)).filter((file) => !/\.d\.ts(?:\.map)?$|\.map$/.test(file));
    await readFile(join(directory, 'index.js'));
    await readFile(join(directory, 'reveal/index.js'));
  } catch (error) {
    throw new Error('Build or install manim-web before creating a shared runtime.', {
      cause: error,
    });
  }
  const hashes = await fileHashes(directory, files);
  return {
    name: metadata.name,
    version: metadata.version,
    fingerprint: createHash('sha256')
      .update(JSON.stringify({ version: metadata.version, files: hashes }))
      .digest('hex'),
  };
}

async function dependencyPackage(specifier, projectRequire) {
  let directory = dirname(projectRequire.resolve(specifier));
  while (true) {
    try {
      const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      if (metadata.name === specifier) return { directory, metadata };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Cannot locate ${specifier}/package.json.`);
    directory = parent;
  }
}

function importCondition(entry) {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return undefined;
  return importCondition(entry.import ?? entry.browser ?? entry.default);
}

function dependencyEntry(dependency, subpath = '.') {
  const { directory, metadata } = dependency;
  const entry = importCondition(metadata.exports?.[subpath]);
  const fallback = subpath === '.' ? (metadata.module ?? metadata.main) : undefined;
  if (!entry && !fallback)
    throw new Error(`Cannot find ESM entry for ${metadata.name}/${subpath}.`);
  return resolve(directory, entry ?? fallback);
}

async function dependencies(projectRequire) {
  return Object.fromEntries(
    await Promise.all(
      ['three', 'katex', 'reveal.js'].map(async (name) => [
        name,
        await dependencyPackage(name, projectRequire),
      ]),
    ),
  );
}

function dependencyVersions(packages) {
  return Object.fromEntries(
    Object.entries(packages).map(([name, dependency]) => [name, dependency.metadata.version]),
  );
}

function runtimeEntries(packageRoot, packages) {
  return {
    core: join(packageRoot, 'dist/index.js'),
    reveal: join(packageRoot, 'dist/reveal/index.js'),
    three: dependencyEntry(packages.three),
    katex: dependencyEntry(packages.katex),
    revealjs: dependencyEntry(packages['reveal.js']),
    notes: dependencyEntry(packages['reveal.js'], './plugin/notes'),
  };
}

function entryPlugin(entries, modules) {
  return {
    name: 'manim-shared-runtime',
    resolveId(id) {
      if (id === setupModule || id.startsWith(virtualPrefix)) return id;
    },
    load(id) {
      if (id === setupModule) {
        return (
          `import { setKatexStylesheetUrl } from ${JSON.stringify(entries.core)};\n` +
          'setKatexStylesheetUrl(null);'
        );
      }
      if (!id.startsWith(virtualPrefix)) return undefined;
      const name = id.slice(virtualPrefix.length);
      const target = JSON.stringify(entries[name]);
      const lines = [`export * from ${target};`];
      if (['katex', 'revealjs', 'notes'].includes(name))
        lines.push(`export { default } from ${target};`);
      if (name === 'core' || name === 'reveal') {
        lines.push(`import ${JSON.stringify(setupModule)};`);
      }
      return lines.join('\n');
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk' || !output.isEntry) continue;
        const name = output.facadeModuleId?.slice(virtualPrefix.length);
        if (moduleNames[name]) modules[moduleNames[name]] = output.fileName;
      }
    },
  };
}

async function copyStyles(directory, katex) {
  const assets = {};
  const fontsDirectory = join(katex.directory, 'dist/fonts');
  await mkdir(join(directory, 'assets'), { recursive: true });
  await cp(fontsDirectory, join(directory, 'assets/fonts'), { recursive: true });
  await cp(join(katex.directory, 'dist/katex.min.css'), join(directory, 'assets/katex.min.css'));
  for (const font of await filesIn(fontsDirectory)) {
    assets[`katex/dist/fonts/${font}`] = `assets/fonts/${font}`;
  }
  return {
    assets,
    styles: ['assets/katex.min.css'],
    styleImports: ['katex/dist/katex.css', 'katex/dist/katex.min.css'],
  };
}

async function assertEmpty(directory) {
  try {
    if ((await readdir(directory)).length !== 0) {
      throw new Error(
        `Runtime directory is not empty: ${directory}. Use a new versioned directory.`,
      );
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

/**
 * Build a self-contained ESM runtime without replacing an existing published runtime.
 * @post result.schemaVersion === 1
 * @post Object.keys(result.modules).includes('manim-web/reveal')
 */
export async function buildRuntime({ outDir, projectRequire }) {
  const directory = resolve(outDir);
  await assertEmpty(directory);
  const { directory: packageRoot } = await dependencyPackage('manim-web', projectRequire);
  const [library, packages] = await Promise.all([
    libraryIdentity(packageRoot),
    dependencies(projectRequire),
  ]);
  const entries = runtimeEntries(packageRoot, packages);
  const modules = {};
  const { build } = await import(pathToFileURL(projectRequire.resolve('vite')).href);
  await mkdir(dirname(directory), { recursive: true });
  const temporary = await mkdtemp(join(dirname(directory), '.manim-runtime-'));
  try {
    await build({
      configFile: false,
      root: packageRoot,
      base: './',
      publicDir: false,
      plugins: [entryPlugin(entries, modules)],
      resolve: {
        alias: Object.entries(moduleNames)
          .filter(([name]) => !['core', 'reveal'].includes(name))
          .map(([name, specifier]) => ({
            find: new RegExp(`^${specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
            replacement: entries[name],
          })),
      },
      build: {
        outDir: temporary,
        emptyOutDir: false,
        target: 'esnext',
        assetsInlineLimit: 0,
        modulePreload: false,
        rollupOptions: {
          input: Object.fromEntries(
            Object.keys(entries).map((name) => [name, virtualPrefix + name]),
          ),
          preserveEntrySignatures: 'strict',
          output: {
            format: 'es',
            entryFileNames: '[name]-[hash].js',
            chunkFileNames: 'chunks/[name]-[hash].js',
            assetFileNames: 'assets/[name]-[hash][extname]',
          },
        },
      },
    });
    if (Object.keys(modules).length !== Object.keys(moduleNames).length) {
      throw new Error('Shared runtime build did not preserve all public entry points.');
    }
    const styles = await copyStyles(temporary, packages.katex);
    const manifest = {
      schemaVersion: 1,
      library,
      dependencies: dependencyVersions(packages),
      modules,
      ...styles,
      files: await fileHashes(temporary, await filesIn(temporary)),
    };
    await writeFile(join(temporary, runtimeManifestName), JSON.stringify(manifest, null, 2) + '\n');
    await assertEmpty(directory);
    await rename(temporary, directory);
    return manifest;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function safeFile(directory, file) {
  if (typeof file !== 'string' || file.includes('\\') || isAbsolute(file)) {
    throw new Error('Invalid file path in shared runtime manifest.');
  }
  const target = resolve(directory, file);
  const local = relative(directory, target);
  if (!local || local === '..' || local.startsWith('..' + sep)) {
    throw new Error('Invalid file path in shared runtime manifest.');
  }
  return target;
}

function validateManifest(manifest) {
  if (
    manifest.schemaVersion !== 1 ||
    manifest.library?.name !== 'manim-web' ||
    typeof manifest.library.fingerprint !== 'string' ||
    !manifest.modules?.['manim-web'] ||
    !manifest.modules?.['manim-web/reveal'] ||
    !Array.isArray(manifest.styles) ||
    !Array.isArray(manifest.styleImports) ||
    !manifest.assets ||
    !manifest.files
  ) {
    throw new Error('Unsupported or incomplete shared runtime manifest.');
  }
  const referenced = [
    ...Object.values(manifest.modules),
    ...manifest.styles,
    ...Object.values(manifest.assets),
  ];
  if (referenced.some((file) => !Object.hasOwn(manifest.files, file))) {
    throw new Error('Shared runtime manifest references an unverified file.');
  }
}

/**
 * Verify runtime files and the exact installed library build before exporting a deck.
 * @post result.library.fingerprint === (await libraryIdentity(packageRoot)).fingerprint
 */
export async function loadRuntime(directory, { projectRequire }) {
  const root = resolve(directory);
  const manifest = JSON.parse(await readFile(join(root, runtimeManifestName), 'utf8'));
  validateManifest(manifest);
  const { directory: packageRoot } = await dependencyPackage('manim-web', projectRequire);
  const [library, packages] = await Promise.all([
    libraryIdentity(packageRoot),
    dependencies(projectRequire),
  ]);
  if (manifest.library.fingerprint !== library.fingerprint) {
    throw new Error(
      `Shared runtime uses a different manim-web build (${manifest.library.version}). ` +
        'Install the matching library package, or create a new versioned runtime directory.',
    );
  }
  for (const [name, version] of Object.entries(dependencyVersions(packages))) {
    if (manifest.dependencies?.[name] !== version) {
      throw new Error(
        `Shared runtime requires ${name}@${manifest.dependencies?.[name]}, found ${version}.`,
      );
    }
  }
  await Promise.all(
    Object.entries(manifest.files).map(async ([file, expected]) => {
      const actual = createHash('sha256')
        .update(await readFile(safeFile(root, file)))
        .digest('hex');
      if (actual !== expected) throw new Error(`Shared runtime file has changed: ${file}.`);
    }),
  );
  return manifest;
}
