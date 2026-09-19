# Presentations

The optional `manim-web/reveal` entry provides authored topics, animated checkpoint slides, selectable settled text, and one shared print path. Core `manim-web` does not import Reveal.

Use `defineSlide` for presentation slides, including static pages. The lesson, basic, text, and mixed examples use its automatic layout. The tech demo combines it with manually positioned scientific animations; a small low-level example demonstrates direct scene construction.

Each example directory is a standalone Vite project: its `package.json` declares its dependencies, and its TypeScript imports only public `manim-web` and `manim-web/reveal` APIs. Copy any one of the directories below to start your own project; its source, assets, Vite configuration and TypeScript configuration travel together.

For development in this repository, run `npm ci`, then `npm run dev`, and open:

- `/examples/presentations/lesson/index.html`: start here for ordinary math lessons. Two short scenes build a gradient-descent explanation with wrapping prose, inline math, bullet reveals, named formula parts, a transformation, and a plot in a second column. A static Markdown recap includes display math.
- `/examples/presentations/basic/index.html`: the starter deck, with five topics and eleven pages: static pages with the same title alignment and typography as the animated slides, geometry, varied text animations, a moving 2D point with live coordinates, distance and angle, and matrix–vector multiplication calculated one row at a time. [matrix.ts](basic/matrix.ts) uses ordinary LaTeX matrices with automatic column layout.
- `/examples/presentations/text/index.html`: writing, Unicode graphemes, emphasis, removal, and text selection, with automatic placement for the animated text.
- `/examples/presentations/mixed/index.html`: Markdown, HTML, SVG, video/audio with print replacements, backgrounds, and a rotating 3D torus with automatically laid-out text.
- `/examples/presentations/tech-demo/index.html`: the [tech demo](tech-demo/README.md), with eight topics and 17 checkpoints covering shape and formula morphs, bouncing rays, deforming surfaces, heatmaps and optimization. Seven 2D topics use `defineSlide` for shared titles and checkpoints while keeping geometry and captions in their original coordinates. The 3D topic uses a direct `SceneDefinition`. A matching Python scene is included. Its bundled light/dark palettes demonstrate the standard color selector and custom diagram colors.
- `/examples/presentations/low-level/index.html`: one [small direct scene](low-level/scene.ts) with manual positioning, drawing a circle and moving it. Use this as a reference for the underlying API.

Every presentation example includes a **Colors** selector for light/dark palettes. The basic starter keeps its palette configuration in [basic/palettes.ts](basic/palettes.ts), including custom grid and orbit colors. `slides init` copies this configuration into new presentations. Edit the palette values or add matching named colors to both palettes, then use `s.colors` when constructing custom graphics.

See the [authoring API](API.md) for scene steps, embedded playback, text contracts and capture options, including [named color palettes](API.md#switch-color-palettes). Switching rebuilds the slides and print snapshots without changing typography.

`defineSlide({ title }, async s => { ... })` handles layout and preparation. Declare `s.paragraph(...)`, `s.math(...)`, and `s.bullets(...)` before the first `s.step(...)`, then reveal them at the desired pauses. For a static page, call `s.show(...)` inside its step, as in [bullets.ts](basic/bullets.ts). Hidden content reserves space; paragraphs wrap, and overflow produces an error. Use `s.columns(...)` and `region.place(...)` when an explanation needs a diagram. Ordinary Manim animations work through `s.play(...)`.

Read [gradient.ts](lesson/gradient.ts) for the everyday pattern, then [quadratic.ts](lesson/quadratic.ts) for columns and a formula transformation.

Use Node 20.x (20.19 or later), or Node 22.12 and later, as required by Vite 8. For this unreleased checkout, install the packed library as described below first. In a copied example directory, install the package dependencies and run its scripts:

```sh
npm install
npm run typecheck
npm run dev
```

Install Chromium before building a portable site or exporting a PDF:

```sh
npx playwright install chromium
npm run build
npm run pdf
```

The examples declare the npm package as their dependency. These presentation APIs include changes that are not published yet (including the tech demo’s curve-resampling export), so use a packed build of this checkout until a release includes them. Build and pack the library, then install that tarball in the copied example before running its scripts:

```sh
# In the library repository:
npm ci
npm run build
npm pack --pack-destination /tmp

# In the copied example (use the filename printed by npm pack):
npm install /tmp/manim-web-0.3.24.tgz
```

This tests the same public package entry points and bundled code a published consumer uses. Do not copy the repository's shared `examples/presentations/vite.config.ts` or `tsconfig.json` into a standalone project: the individual examples already contain independent versions.

Repository development can resolve the public package imports to live source. The root `npm run dev` does this automatically; pass the shared Vite configuration explicitly when building or exporting a repository example:

```sh
node scripts/slides.mjs build examples/presentations/lesson --config examples/presentations/vite.config.ts
node scripts/slides.mjs pdf lesson.pdf examples/presentations/lesson --config examples/presentations/vite.config.ts
```

The shared configuration supplies source aliases and the Typia build plugin, so these commands test changes before publishing. A standalone example uses the compiled npm package and does not need that plugin. `slides init my-presentation` remains available from an installed `manim-web` package to generate a new basic presentation.

`slides build` runs Vite, visits the built deck in Chromium, captures all authored checkpoint states, and packages content-addressed images plus `manim-handout.json` in `dist/`. Serve that directory as a static site. The browser eagerly prepares those print assets, while live scene modules load on navigation. `slides pdf` exports the same flat handout through Chromium. Ordinary viewing and authoring need JavaScript only; Python and a rendering server are not required.

Topic sections are horizontal Reveal stacks. Their direct children are real vertical slides, one for each scene `step`. Left/right changes topic, up/down changes checkpoint, and Space/Shift+Space traverses the deck. Forward navigation plays an interval; backward navigation, an initial deep link, and overview selection restore its completed state. P pauses/resumes and R replays the active interval without changing the route. Reveal owns keyboard handling, including editable content and browser shortcuts.

Every meaningful pause prints by default. Set `handout: 'final'` for the last checkpoint in each scene, or an array of `topic/scene/checkpoint` IDs. Static slides print once; video uses its poster; audio/custom HTML can provide `printContent`. Backgrounds remain visible in the flat handout. Cmd/Ctrl+P, browser-menu Print, and the shared Print button use the same prepared pages. `?manim-print=1` and Reveal's `?print-pdf` workflow open that same handout directly. All captured fonts load before readiness, including those on unvisited slides. Wait until the preparing screen disappears before printing; native browser print cannot wait for an unfinished initial load.

Printing pauses the active animation and media synchronously and restores their prior playback state afterwards. Opening overview or hiding the tab pauses playback and leaves it paused on return by default. A late scene load cannot replace a newer navigation target. Scene preparation is serialized so rapid navigation allocates at most one pending scene. Each scene factory returns a fresh Scene or ThreeDScene, and the integration disposes its scene when changing modules.

HTML and Markdown helpers accept trusted authored content. Use imported asset URLs (`import poster from './poster.svg?url'`) or files in Vite's public directory so portable builds include them. The starter targets Reveal 6 and imports its public CSS exports; applications supplying Reveal 5 can use that version's own CSS paths with the same adapter API.

Actual glyph outline drawing requires a vector font (`fontUrl`). Texture-backed Text uses a documented reveal treatment. Settled prose uses selectable HTML; browser formula overlays preserve LaTeX source for accessibility and copying. PDF formulas remain visible graphics, but Chromium may omit the transparent LaTeX overlay from PDF text extraction. The API does not promise arbitrary script shaping or full-document Python LaTeX compatibility.

The integration uses Reveal's documented [plugin lifecycle](https://revealjs.com/creating-plugins/), [two-axis navigation](https://revealjs.com/vertical-slides/), [keyboard bindings](https://revealjs.com/keyboard/), and [native media handling](https://revealjs.com/media/).

Browser regression checks use `npm run test:presentations` after `npx playwright install chromium firefox webkit`. The suite starts a Vite server with live reload disabled, or accepts an existing server through `MANIM_PRESENTATION_TEST_URL`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an installed Chrome executable. Chromium and WebKit cover native keys, deep links, overview/replay, media and print restoration, flat unvisited handouts, and repeated scene disposal. Chromium additionally verifies the actual PDF page count for both print entry points. Firefox is included in the suite; the downloaded Firefox process on the current macOS validation host terminated with SIGKILL before opening a page, so its parity remains unverified.
