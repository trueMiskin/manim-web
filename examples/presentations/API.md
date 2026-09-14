# Presentation authoring and embedding

`manim-web/reveal` is an optional entry point. The core library does not import Reveal. The starter and examples use Reveal 6's public stylesheet and notes-plugin exports.

```ts
import { Circle, Create } from 'manim-web';
import type { SceneDefinition } from 'manim-web/reveal';

export default {
  async build(scene) {
    const circle = new Circle({ radius: 1.3 });
    await scene.step({ id: 'draw', notes: 'Introduce the circle.' }, () =>
      scene.play(new Create(circle)),
    );
    await scene.step({ id: 'move', title: 'Move right' }, () =>
      scene.play(circle.animate.shift([2, 0, 0])),
    );
  },
} satisfies SceneDefinition;
```

Each `step` creates one navigation checkpoint and print state. IDs must be unique within the scene. Metadata also accepts `loop`, `autoNext`, `playbackRate`, `source`, and `printTime` (an absolute time on that scene's timeline). A static step may add/remove objects without calling `play`. The default handout includes every step; presentation `handout` can be `'final'` or a list of complete `topic/scene/checkpoint` IDs.

`presentation({ title, topics })` and `topic(id, slides)` compose the deck. `sceneSlides(id, loader)` loads a scene definition. `htmlSlide`, `markdownSlide`, `imageSlide`, `videoSlide`, `audioSlide` and `blankSlide` share background, notes and print options. HTML and Markdown are trusted authored content. Import assets through Vite or place them in its public directory so the production build can package them.

## Deterministic construction

`Player.sequence` is a sequential compiler: every awaited `scene.play(...)` evaluates to its final authored state before the next author calculation runs. This changes the old behavior that merely accumulated animations. Move calculations that depend on an animation's result after its awaited call.

Animation time and updater `dt` use a fixed 60 Hz clock during compilation and seeking. Keep mutable updater state on mobjects, `ValueTracker`, or subclasses implementing `captureState()` and `restoreCapturedState()`. Include `super.captureState()`/`super.restoreCapturedState(state)` in those overrides. External mutable variables, unseeded randomness and wall-clock side effects cannot be rewound automatically. Precompute random coefficients or use a recorded tracker. Asynchronous asset changes belong in awaited construction, not inside a synchronous frame updater.

Fonts, image textures and formulas are prepared before compilation advances. Missing assets reject preparation. A scene factory must create fresh objects; the adapter owns and disposes that scene when leaving its module. A module's checkpoints share one active Player. Pending preparation is serialized and stale navigation generations cannot replace the selected scene.

Use `ReplacementTransform` when exchanging text/image objects and geometry so the target becomes a scene member. The legacy mixed-class fallback `Transform(text, circle)` leaves its completed circle attached only to the renderer: after a later `scene.clear()`, seeking or capturing that earlier endpoint can be empty. This fallback is outside the qualified recorded-transform paths; the equivalent `ReplacementTransform` restores and captures the circle correctly.

## Embedded Player

```ts
const player = new Player(container, {
  ui: false,
  keyboard: false,
  pointer: false,
  scene: suppliedScene,
  ownsScene: false,
});
await player.sequence(sceneDefinition.build);
await player.prepare();
player.seekCheckpoint('move', 'end');
player.playCheckpoint('draw');
const unsubscribe = player.on('complete', () => {
  /* update application state */
});
const snapshot = await player.captureCheckpoint('move');
unsubscribe();
player.dispose();
```

An instance supplied as `scene` is borrowed by default; a factory transfers ownership by default. `ownsScene` overrides that choice. UI, keyboard and pointer handlers are independently optional. `stop()` leaves a loop immediately; `pause()` preserves its current time. Events include `ready`, `frame`, `play`, `pause`, `complete` and `error`. Disposal is terminal and releases recorded state and owned resources.

`Animation.dispose()` releases animation-owned snapshots and temporary copies; it never disposes the caller's source mobject or a supplied `Transform` target. Animation groups dispose their child animations recursively, and `Timeline.clear()` invokes this cleanup. Custom animations that own resources can override `dispose()` and call `super.dispose()`. An animation can be reused after removal by adding it to a timeline again and calling `reset()` before playback; its next `begin()` rebuilds released state.

`captureCheckpoint` returns PNG graphics plus projected semantic text. It restores the prior scene, camera, viewport, loop target and playback state after success or failure. `withFrozenState` exposes that restoration boundary to custom capture code. `inspectText` returns visible text runs projected through the active 2D, 3D or fixed-overlay camera.

## Text and printing

`Text.getText()` returns its logical source during letter/word reveals; `getVisibleText()` returns the currently displayed content. Grapheme ranges preserve combining accents and emoji sequences. Actual glyph outline drawing requires a supported TTF/OTF `fontUrl`; texture text uses its documented reveal treatment. Source-font readiness precedes measurement. Semantic font URLs travel with snapshots and are packaged relative to the built site.

`Tex({ latex: '{{Ray Tracing}} {{for}} {{Radio}}', fontUrl, fontWeight: 'bold' })` uses the supplied TTF/OTF outlines for literal Latin titles. The supported subset is single-line Latin letters, numbers, ordinary spaces and punctuation, with `{{...}}` matching boundaries or an explicit array of parts. TeX commands, control characters, scripts requiring shaping and unavailable glyphs fail explicitly. `matchingKeys` distinguishes repeated parts. Copies and interrupted `Write`/`TransformMatchingTex` preserve font and part identity. These titles expose literal selectable prose, original TeX source ranges and the font asset for native printing; omit `fontUrl` for normal MathJax text-mode rendering. Mathematical `MathTex` uses the bundled MathJax fonts, including calligraphic and double-struck alphabets.

Paused selection and printed prose come from the same semantic runs. Hidden/replaced and fully offscreen text is excluded. Mathematical formulas retain LaTeX source for accessibility and copying while their SVG-derived glyphs remain in graphics captures. This differs from selectable native prose. Latin text and the examples' formula macros are qualified; arbitrary script shaping and arbitrary Python LaTeX preambles are not promised.

LaTeX copying applies to the browser overlay. Chromium may omit its transparent formula text when creating a PDF; PDF formula graphics remain visible, but selectable LaTeX is not guaranteed. Qualification records the formula source runs actually extracted from each PDF instead of treating them as native prose.

Production builds prepare all handout graphics and text before the deck reports ready. Native `beforeprint` pauses existing playback synchronously; it never starts scene imports. `afterprint` restores playback and media time/rate. Overview and hidden tabs pause playback and remain paused on return by default. All print entry points share the same flat document, so topic wrappers do not add pages.

## Building and exporting

`slides build` uses the project's Vite configuration and its actual `build.outDir`. It also accepts a project root and `--config`, `--mode`, `--base`, `--outDir`, `--target` and `--emptyOutDir`. `slides pdf [filename]` accepts the same build options and exports from that build directory. For example, `slides pdf talk.pdf --outDir site --base /talk/` builds and captures a site intended for `/talk/`; `base: './'` keeps the default starter relocatable to any directory. Imported local fonts are rebased relative to the built site in the handout manifest.
