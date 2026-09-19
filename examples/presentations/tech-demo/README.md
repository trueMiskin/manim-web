# manim-web tech demo

A short feature tour: **8 topics, 17 checkpoints**, with text and formulas demonstrated in just two slides. The TypeScript deck and the [Python presentation](reference/main.py) follow the same sequence.

The 2D topics use `defineSlide` for shared title styling and checkpoints, with ordinary Manim objects and animations for their scientific content. Diagrams and captions keep one fixed coordinate system, so later transforms and updaters need no layout offsets. The 3D topic uses a direct `SceneDefinition` for its camera and fixed screen labels. Captions stay beneath their graphics, the introductory text clears before the equation sequence, and reflection changes to refraction in the same area. Scientific constructions and numerical data follow the Python source. Start with the [lesson](../lesson/main.ts) to see automatic paragraphs, columns, and diagram placement, or see the separate [low-level example](../low-level/scene.ts) for direct scene construction.

| Topic                  | First checkpoint             | Following checkpoints                            |
| ---------------------- | ---------------------------- | ------------------------------------------------ |
| Text and formulas      | Write text                   | Match words and render LaTeX                     |
| Shape morphing         | Draw a lens and rays         | Change to a concave lens, then morph into a room |
| Formula morphing       | Show the law of reflection   | Transform it into Snell’s law and bend the ray   |
| Paths and motion       | Construct a reflected path   | Animate a ball along the path                    |
| Live geometry          | Show the initial reflection  | Recompute the bounce as RX moves                 |
| Deforming surfaces     | Reveal a shaded grid         | Animate a travelling wave, rotation and a saddle |
| Heatmaps and gradients | Show a coverage field        | Animate smoothing                                |
| Optimization           | Show the initial transmitter | Follow the optimization trajectory               |

For plain bullet slides, varied text animations and a moving point with live coordinates, distance and angle, see the [basic presentation](../basic/main.ts).

## TypeScript presentation

From the repository root:

```sh
npm run dev
# Open http://localhost:5173/examples/presentations/tech-demo/
```

Left/right changes topic, up/down changes checkpoint, Space advances, P pauses, and R replays. Text is selectable while paused. The optics topic has three stops: convex lens, concave lens, then the room morph. Other topics have two stops.

Use the **Color palette** selector beside the playback and print controls to switch between **dark** and **light**. Dark preserves the original pure-black background; light uses a white background and darker diagram colors. Both palettes are bundled locally and work offline. Switching rebuilds the scenes, previews, and print snapshots, then returns to the current checkpoint, paused. Press **R** to replay it. Fonts and layout stay the same.

Edit [palettes.ts](palettes.ts) to change the standard text and background roles or custom colors such as `cyan`, `amber`, and `tableSurface`. The same named color can be cyan in the dark palette and dark blue in the light palette. `defineSlide` builders read `s.colors`; the direct 3D builder receives `{ colors }` as its second argument. The heatmaps, numerical vector colors, and their table labels keep their scientific color scale. Set `palette: 'light'` in [deck.ts](deck.ts) to start and export in light colors. See the [palette API](../API.md#switch-color-palettes) for configuration and `setPalette(...)`.

Build a portable site from the repository root:

```sh
cd examples/presentations/tech-demo
node ../../../scripts/slides.mjs build
```

The CLI uses installed Chromium or Chrome; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an executable. Serve `dist/` with a static HTTP server. Fonts, geometry, heatmaps, gradients and print snapshots are bundled locally.

To start a server, run this from `examples/presentations/tech-demo`:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open <http://localhost:8000/#/>. If a server already serves this `dist/` on port 8000, keep it running and reload the page after rebuilding.

To export the 17-page PDF, run from the same example directory:

```sh
node ../../../scripts/slides.mjs pdf tech-demo.pdf
```

The PDF command rebuilds the site before exporting.

## Troubleshooting handout assets

If the page displays:

> Presentation assets do not match this deck. Rebuild the handout assets.

The loaded deck and `manim-handout.json` disagree on their title, dimensions, selected palette, palette colors, or asset format version. This can happen after changing the deck or when a browser caches an older handout. The loader now revalidates the handout with the server on each load to prevent stale cached metadata from causing this error.

From the repository root, rebuild the example and its handout together:

```sh
cd examples/presentations/tech-demo
node ../../../scripts/slides.mjs build
```

Wait for `Prepared 17 animated handout states.`, then reload <http://localhost:8000/#/>. If the old page remains, use a hard reload (Cmd+Shift+R on macOS or Ctrl+Shift+R on Windows/Linux). Confirm the server serves this example's `dist/` and that any deployed copy includes the entire rebuilt directory: HTML, JavaScript, fonts, images and `manim-handout.json`.

Use the `slides.mjs build` command above for this repair. The repository-root `npm run build` builds the library; it does not regenerate this example's handout.

To run the focused cache regression check, use the repository root:

```sh
node scripts/test-presentation-cache.mjs
```

This test first caches an old handout, then checks that the current deck fetches the updated metadata and opens all 17 checkpoints. It also runs as part of `npm run test:tech-demo`.

## Python presentation

[reference/main.py](reference/main.py) provides the same eight topics as a compact `TechDemo` Manim Slides scene. It uses the bundled animation data without running scientific calculations or downloading assets.

With Manim's system requirements and LaTeX installed, run from the repository root:

```sh
cd examples/presentations/tech-demo/reference
uv run manim --renderer=cairo -ql main.py TechDemo
uv run manim-slides present TechDemo
```

Use `-qh` for a full-resolution render.

## Editing and checks

[deck.ts](deck.ts) lists the eight topics; `scenes/` contains their animations. `data/` contains the heatmaps, gradient arrows and transmitter trajectory used by both versions. The build generates `dist/manim-handout.json` and its snapshots for browser navigation and printing.

After building, run from the repository root:

```sh
npm run typecheck:presentations
npm run test:tech-demo
```

The browser checks cover the original text-replacement sequence and caption placement, all 17 PDF pages, selectable text, backward navigation, palette switching, offline assets and handout cache revalidation. Reports and PDF previews are written to `qualification-results/tech-demo/`. Formula source is selectable in the browser; PDF text extraction depends on Chromium.

## Attribution

Geometry and animation data are adapted from [Jérome Eertmans's presentation](https://github.com/jeertmans/jeertmans.github.io/blob/f5a6bf538bf86d41aba10f7cc3a907c098e77364/_slides/2026-07-06-public-defense/main.py) under the [MIT license](SOURCE-LICENSE.txt). Bundled Droid Sans fonts come from [Android 2.2](https://android.googlesource.com/platform/frameworks/base/+/android-2.2_r1/data/fonts/) under [Apache 2.0](assets/fonts/DROID-NOTICE.txt).
