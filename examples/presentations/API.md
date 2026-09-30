# Presentation authoring and embedding

`manim-web/reveal` is an optional entry point. The core library does not import Reveal. The starter and examples use Reveal 6's public stylesheet and notes-plugin exports.

## Content slides

Start with `slide` for prose, formulas, code, lists, images, and columns. Content appears immediately by default, with shared typography and automatic layout. Run `slides init my-presentation` to copy the [basic starter](basic/deck.ts), which combines declarative content and custom animation in grouped topics. A small deck can also use a flat `slides` array:

```ts
import { bullets, math, paragraph, presentation, slide } from 'manim-web/reveal';

export const deck = presentation({
  title: 'A small math lesson',
  theme: { preset: 'dark', titleAlign: 'left', bodySize: 28 },
  slides: [
    slide('quadratic', {
      title: 'Meet a quadratic function',
      content: [
        paragraph('Squaring a number gives a simple function to explore.'),
        math('f(x)=x^2'),
        bullets(['Opposite inputs give the same result.', 'The minimum is at zero.']),
      ],
      notes: 'Ask what happens when the input changes sign.',
    }),
  ],
});
```

Mount the deck in an HTML element such as `<div id="presentation"></div>`:

```ts
import { mountPresentation } from 'manim-web/reveal';
import { deck } from './deck';

const mounted = await mountPresentation('#presentation', deck, {
  assets: import.meta.env.PROD ? './manim-handout.json' : undefined,
});
// When removing an embedded presentation:
// mounted.destroy();
```

`mountPresentation` creates the Reveal structure, loads its styles and notes plugin, and initializes navigation. Supplying `assets` loads the handout manifest produced by `slides build`; omitting it prepares the presentation in the browser. Keep the existing `manimPresentation` plugin API when your application initializes Reveal itself.

`paragraph` and `bullets` support `$inline math$`; `math` accepts LaTeX without dollar delimiters. Use `String.raw` for strings containing LaTeX backslashes. Block options accept local font sizes and palette color roles such as `'accent'`. The presentation's `theme` supplies defaults to content slides and custom `defineSlide` scenes. Set `preset` to `'dark'` or `'light'` for the initial palette; without custom palettes, both presets are available in the color selector.

### Code blocks

Use `code` for a literal code sample, with selectable text, line numbers, and a Copy button:

```ts
import { code, columns, paragraph, slide } from 'manim-web/reveal';

slide('function', {
  title: 'Double the input',
  content: columns([
    code(
      `int twice(int value) {
    return value * 2;
}`,
      { language: 'cpp', lineNumbers: true, copyButton: true },
    ),
    paragraph('Calling twice(3) returns 6.'),
  ]),
});
```

Line numbers and the Copy button default to `true`; either can be disabled independently. At a paused presentation checkpoint, select code with the mouse or copy the whole sample with the button. Copying preserves the original source, including indentation and tabs, and excludes the line-number gutter. Code is literal: dollar signs and angle brackets do not introduce math or HTML. An empty string represents a blank code line.

Code uses a monospace font and the slide's `bodySize`, independently of the prose font. Set `fontFamily` and optional `fontUrl` to supply a specific code font; imported font URLs travel with portable builds. Syntax colors inherit the selected slide palette unless `colorScheme` supplies a complete `CodeColorScheme`.

Highlighting uses Shiki's TextMate grammars, which retain context across source lines, including multiline comments and strings. Grammar highlighting does not resolve symbol identities like a compiler or language server.

Supported `language` values and aliases are:

| Language   | Value        | Aliases            |
| ---------- | ------------ | ------------------ |
| C          | `c`          |                    |
| C++        | `cpp`        | `c++`, `cxx`, `cc` |
| Python     | `python`     | `py`, `python3`    |
| JavaScript | `javascript` | `js`               |
| TypeScript | `typescript` | `ts`               |
| Java       | `java`       |                    |
| Rust       | `rust`       | `rs`               |
| Go         | `go`         | `golang`           |

Names are case-insensitive. Omitted, plain-text, and unknown language names display literal code without syntax coloring. The browser loads Shiki and each supported grammar lazily, then caches them for reuse. Its JavaScript regex engine and grammar assets are bundled with the presentation; highlighting needs neither a remote service nor WebAssembly. The existing `CodeColorScheme` determines token colors; there is no separate named-theme option.

Code blocks fit their column without wrapping source lines. Use `fit: 'none'` to keep the authored font size and report overflow, or `height` to reserve an area in scene units. Other options include `fontSize`, `lineHeight`, `tabWidth`, `align`, `showBackground`, `backgroundPadding`, and `backgroundRadius`. Give a code block an `id` to reveal it in a named build like any other content block. The [basic code example](basic/code.ts) pairs code with a progressive explanation.

For custom animation, `s.code(source, options)` and `region.code(source, options)` return ordinary `Code` objects. Declare them before the first step, then use `s.show`, `s.reveal`, or `s.play` as usual. The Copy button belongs to interactive playback and is omitted from printed handouts.

Presentation preparation automatically waits for highlighting and fonts before laying out or capturing code. When using `Code` directly, await `waitForRender()` before inspecting highlighted tokens or capturing the rendered result:

```ts
import { Code } from 'manim-web';

const sample = new Code({ code: 'auto result = school::twice(3);', language: 'cpp' });
await sample.waitForRender();
const tokens = sample.getLineOfCode(1)?.tokens;
```

Construction and setters remain synchronous. After `setCode` or `setLanguage`, await `waitForRender()` again when the next operation requires completed highlighting. The original source remains available immediately through `getCode()`.

### Columns and images

Each inner array supplies the content of one column. Widths are relative proportions, and images can have captions:

```ts
import { columns, image, math, paragraph, slide } from 'manim-web/reveal';
import parabola from './parabola.svg?url';

const graph = slide('graph', {
  title: 'One idea, two representations',
  content: columns(
    [
      [paragraph('Opposite inputs give the same result.'), math('f(-2)=f(2)=4')],
      [
        image(parabola, {
          height: 3,
          caption: 'The parabola is symmetric about the vertical axis.',
        }),
      ],
    ],
    { widths: [3, 2] },
  ),
});
```

Import image URLs so Vite includes them in portable builds. `height` reserves space in scene units; the image fits inside its column and the caption flows below it. Text retains its authored font size, and overflow reports an error rather than silently shrinking the content.

### Reveal content at a named pause

Give a block an `id` and refer to it from a build's `show` array:

```ts
slide('closer', {
  title: 'Move closer to the minimum',
  content: [math('f(2)=4'), math('f(1)=1<4', { id: 'details', color: 'accent' })],
  notes: 'Ask what the output will be when the input is one.',
  builds: [{ id: 'answer', show: ['details'], notes: 'The new output is closer to zero.' }],
});
```

Blocks referenced by `show` start hidden but reserve their space. Other ordinary blocks are visible in the initial `content` checkpoint; formula slots select their initial alternative as described below. A build's `show` adds its blocks immediately and keeps earlier content visible. Each build creates one navigation pause with its own notes and printable state. Block IDs belong to `paragraph`, `math`, `code`, `bullets`, or `image`. Build IDs must be distinct from the reserved initial ID `content`.

To reveal a list one item at a time, use `{ id, text }` items and refer to their IDs in separate builds:

```ts
slide('observations', {
  title: 'Two observations',
  content: bullets([
    { id: 'symmetry', text: 'Opposite inputs give the same result.' },
    { id: 'minimum', text: 'The minimum is at zero.' },
  ]),
  builds: [
    { id: 'first', show: ['symmetry'] },
    { id: 'second', show: ['minimum'] },
  ],
});
```

Use a list-level `id` to reveal the whole list, or item IDs for individual reveals; do not combine the two in one list. In a list with item IDs, string items appear immediately. The lesson topic in the [basic deck](basic/deck.ts) combines two formula transformations with their corresponding bullet reveals.

### Transform formulas in place

Place named `math` alternatives in a `slot`, then use `transformMath` in a build's `effects`:

```ts
import { math, slide, slot, transformMath } from 'manim-web/reveal';

slide('squares', {
  title: 'Move closer to the minimum',
  content: slot([
    math([{ key: 'input', latex: 'f(2)' }, '=', { key: 'output', latex: '4', color: 'accent' }], {
      id: 'at-two',
    }),
    math([{ key: 'input', latex: 'f(1)' }, '=', { key: 'output', latex: '1', color: 'accent' }], {
      id: 'at-one',
    }),
  ]),
  builds: [{ id: 'first-step', effects: [transformMath('at-two', 'at-one', { duration: 0.8 })] }],
});
```

The slot reserves space for its largest alternative, so neighboring content stays fixed. Its first formula is initially visible unless deferred by `show`; later alternatives stay hidden until targeted by a build. All alternatives are prepared before playback. Shared part `key` values match the same mathematical role across formulas even when its LaTeX changes. The transform uses the existing `TransformMatchingTex` animation; `duration` is in seconds.

A build can contain `show`, `effects`, or both. `show` takes effect at the start, then all effects in that build run concurrently before the navigation pause. Use separate builds for consecutive transformations. The source formula must be visible and the destination must be fresh and hidden. A transform consumes its source: showing or targeting that source again is rejected. To return to an earlier expression, declare another `math` block with a fresh ID.

For other custom entrances, movement, or animation sequencing, add `sceneSlides('circle', () => import('./scene'))` to the same `slides` array or topic and author that module with `defineSlide`. See [basic/scene.ts](basic/scene.ts).

Choose either `slides` or `topics` when defining a presentation. Each flat slide occupies one horizontal position; builds and animation checkpoints are vertical pauses within it. Use explicit `topics` to group several scenes into the same horizontal stack. Existing topic decks retain their routes.

## Text and formulas with automatic layout

Use `defineSlide` when a slide needs custom animation. It returns a `SceneDefinition`, so it works with the existing `sceneSlides(id, loader)` helper. The [lesson](lesson/main.ts), [basic](basic/main.ts), [text](text/main.ts), and [mixed](mixed/main.ts) examples use automatic layout. The [tech demo](tech-demo/deck.ts) combines the same authoring entry point with manually positioned geometry. For flowing content, paragraphs and formulas fit below the title without positioning individual lines:

```ts
import { defineSlide } from 'manim-web/reveal';

export default defineSlide({ title: 'Gradient descent' }, async (s) => {
  const intro = s.paragraph('To reduce a function $f$, move against its slope.');
  const rule = s.math(String.raw`x_{k+1}=x_k-\eta f'(x_k)`);
  const points = s.bullets([
    String.raw`Choose a step size $\eta > 0$.`,
    'Repeat until the changes become small.',
  ]);

  await s.step({ id: 'rule' }, async () => {
    await s.reveal(intro);
    await s.write(rule);
  });
  await s.step({ id: 'step-size' }, () => s.reveal(points.item(0)));
  await s.step({ id: 'repeat' }, () => s.reveal(points.item(1)));
});
```

Declare every layout block before the first step or animation. Preparation waits for text and formulas, wraps paragraphs to their region's width, and fixes the layout once. Hidden blocks reserve their eventual space, so revealing a bullet does not move earlier content. The title appears immediately by default; body blocks appear when animated. Set `titleVisible: false` to introduce the title with `s.write(s.title)` or an ordinary animation. Use a replacement slot for alternative content in the same area, or another `defineSlide` module for a different overall layout.

`paragraph` accepts prose with `$inline math$`, and `math` accepts a complete formula without dollar delimiters. Bullet items use the same wrapping and inline math as paragraphs. `points.item(index)` returns the whole bullet and its content as one animation target. `s.reveal(points)` reveals the full list together. Use `String.raw` when a JavaScript string contains LaTeX backslashes; `\$` represents a literal dollar sign in prose.

`s.reveal(...)` uses `FadeIn`; `s.write(object)` uses `Write`; `s.play(...)` accepts ordinary animations. Use `await s.show(...)` inside a step to display content immediately without an entrance animation. Two awaited calls run sequentially, and several animations passed to one `s.play(...)` run together. One `s.step(...)` creates one pause after all of its animations. Use separate steps when the presenter should advance between reveals.

### Typography and colors

The default theme centers slide titles and left-aligns paragraphs and bullets. Set `theme: { titleAlign: 'left' }` for a title aligned with the body, as in the lesson example. Override only the sizes, spacing, and colors the presentation needs:

```ts
defineSlide(
  {
    title: 'A shared visual style',
    theme: {
      bodySize: 30,
      mathSize: 42,
      colors: { accent: '#58c4dd', secondary: '#f4cf6b' },
    },
  },
  async (s) => {
    const text = s.paragraph('A useful observation.', { color: 'accent' });
    await s.step({ id: 'observation' }, () => s.reveal(text));
  },
);
```

Available color roles are `text`, `muted`, `accent`, `secondary`, and `background`. Content also accepts CSS colors. Themes include `fontFamily`, optional `fontUrl`, `titleSize`, `titleAlign`, optional `titleFontFamily`/`titleFontUrl`, `bodySize`, `mathSize`, `captionSize`, `captionGap`, `lineHeight`, `margin`, `gap`, `itemGap`, `columnGap`, and animation `duration`. Title fonts otherwise inherit the body font settings. Set `theme` on the presentation to share defaults across modules; a slide's own theme overrides them. Paragraph and formula options accept `fontSize` for a local override.

Text and formulas keep their authored font size. Layout overflow throws an explanatory error: split the content, shorten it, or choose a smaller size or spacing. This makes an accidentally crowded slide visible during preparation.

### Switch color palettes

Configure named palettes on the presentation. `darkColors` and `lightColors` provide the standard `background`, `text`, `muted`, `accent`, and `secondary` roles. Override them and add any colors your diagrams need:

```ts
import {
  darkColors,
  definePalettes,
  lightColors,
  manimPresentation,
  presentation,
  sceneSlides,
  topic,
} from 'manim-web/reveal';

const palettes = definePalettes({
  dark: { ...darkColors, ray: '#00ffff', obstacle: '#30363d' },
  light: { ...lightColors, ray: '#003b8e', obstacle: '#d5dbe3' },
});

const content = presentation({
  title: 'Light paths',
  palettes,
  palette: 'dark',
  topics: [topic('optics', [sceneSlides('rays', () => import('./rays'))])],
});
const slides = manimPresentation(content);
// Add slides to Reveal's plugins and initialize Reveal as usual.
// Later, including during the presentation:
await slides.setPalette('light');
```

`definePalettes` checks that each palette exposes the same keys. The first configured palette is the default if `palette` is omitted. Presentations with multiple palettes get a **Color palette** selector beside the playback and print controls. Switching rebuilds the scenes, overview previews, and print snapshots, then restores the current checkpoint at its end, paused. Replay the checkpoint to see its animation again. Fonts, font sizes, and layout settings stay the same; the palettes are bundled with the presentation and work offline.

Standard titles, paragraphs, formulas, captions, and slide backgrounds inherit the selected colors. Use `s.colors` for custom objects and pass colors into helpers when constructing them:

```ts
import { Arrow, Create } from 'manim-web';
import { defineSlide } from 'manim-web/reveal';

export default defineSlide({ title: 'A light path' }, async (s) => {
  const ray = new Arrow({ start: [-2, 0, 0], end: [2, 1, 0], color: s.colors.ray });
  const caption = s.paragraph('The ray follows the selected palette.', { color: 'muted' });
  await s.step({ id: 'ray' }, () => s.play(new Create(ray)));
  await s.step({ id: 'caption' }, () => s.reveal(caption));
});
```

A direct `SceneDefinition` receives the same palette as its optional second build argument. Provide a fallback for standalone playback: `async build(scene, { colors } = { colors: darkColors }) { ... }`. Import `darkColors` from `manim-web/reveal`, or use your own default palette. Read colors inside the build callback so a later rebuild picks up the selected palette. Colors written as literals remain fixed. A slide's explicit `theme.colors` or `background` overrides the inherited setting; use those overrides for content that should keep a particular appearance. Decks without palettes retain their existing behavior.

Choose each palette's colors for contrast in your diagrams. Heatmaps, images, and other authored color scales can keep their own colors. The [tech demo palettes](tech-demo/palettes.ts) show shared typography with custom diagram colors, while its numerical heatmaps retain their original color scale.

### Add a visualization

Regions use the same content helpers. Column weights describe proportions of the available width:

```ts
const [content, figure] = s.columns([3, 2]);
const explanation = content.paragraph('A parabola has its minimum at $x=0$.');
const axes = new Axes({
  xRange: [-2, 2, 1],
  yRange: [0, 4, 1],
  xLength: 4,
  yLength: 3,
});
const curve = axes.plot((x) => x * x);
const diagram = figure.place(new VGroup(axes, curve), { height: 3.5 });

await s.step({ id: 'graph' }, () => s.reveal(explanation, diagram));
```

Import `Axes` and `VGroup` from `manim-web`. Group objects that must keep their relative positions before passing them to `place`. Placement aligns the group within the region and, by default, shrinks it if necessary to fit its width and optional reserved `height`. `fit: 'none'` preserves its size; `align` accepts `'left'`, `'center'`, or `'right'`. Ordinary mathematical geometry and animations retain their usual APIs. `s.scene` exposes the underlying `RecordingScene` for manual scene operations.

### Figures and captions

Use `figure` to keep a caption beneath its graphic, with its own typography and spacing:

```ts
const { diagram, caption } = s.figure(new VGroup(axes, curve), {
  height: 3.5,
  caption: 'The curve reaches its minimum at the origin.',
  captionOptions: { color: 'muted' },
});

await s.step({ id: 'curve' }, async () => {
  await s.play(new Create(diagram));
  await s.reveal(caption);
});
```

`figure` accepts the same placement options as `place`. Its `height` reserves the graphic area; caption height and `captionGap` are additional. Graphics may shrink to fit; captions wrap at their authored font size. The returned `diagram` and `caption` are separate ordinary Manim objects, so they can appear, change, and disappear independently. Caption text remains selectable. Keep scientific labels and annotations inside the diagram when their positions describe its geometry.

### Replace content in one area

A slot reserves the largest of its alternatives once, instead of stacking them:

```ts
const description = s.slot();
const reflection = description.paragraph('Reflection');
const refraction = description.paragraph('Refraction');

await s.step({ id: 'reflection' }, () => s.reveal(reflection));
await s.step({ id: 'refraction' }, () => s.replace(reflection, refraction));
```

Declare all alternatives before the first step. They share a top anchor and their chosen horizontal alignment; hidden alternatives reserve space without appearing. Neighboring content stays fixed. `slot()` returns a region with the usual `paragraph`, `math`, `code`, `bullets`, `place`, `figure`, and `columns` helpers. A figure or bullet list remains a complete arrangement inside its alternative.

`s.replace(previous, next, options?)` crossfades two objects in their existing positions, using the theme duration by default. Its options accept `duration` and `rateFunc`; use ordinary animations for movement. It does not choose or reposition an alternative automatically. For formula matching or simultaneous changes to a diagram and its description, use ordinary animations in one `s.play(...)` call:

```ts
await s.play(
  new TransformMatchingTex(oldFormula, newFormula),
  new FadeOut(reflection),
  new FadeIn(refraction),
);
```

Import the animations from `manim-web`. `s.play` handles the visibility of declared blocks; use it for their animations rather than bypassing that handling with `s.scene.play`. Manual geometry, updaters, `s.scene.add/remove`, and camera operations can coexist with these layout helpers. The [tech demo](tech-demo/README.md) uses `defineSlide` for shared 2D titles and checkpoints while keeping its scientific geometry and captions manually positioned.

### Combine automatic layout with manual animation

Use automatic layout for content that flows: paragraphs, bullets, columns, and independent illustrations. Geometry that changes through several states can stay in one manually authored coordinate system inside `defineSlide`. Such objects do not need `place`, `figure`, or `slot` to participate in `s.play` and `s.step`.

The [optics example](tech-demo/scenes/demo-optics.ts) creates lenses, rays, and a room in the same coordinates, then animates their transitions with ordinary `ReplacementTransform` and `FadeOut`. Its caption is a positioned text object beneath the drawing. This preserves the visual sequence without moving the drawing into a layout region and compensating for that move afterward.

Keep construction separate from the animation steps when possible: create the objects first, then let each step describe what appears, changes, or disappears. Use a direct `SceneDefinition` where it remains clearer, as in the [3D example](tech-demo/scenes/demo-3d.ts) with its fixed screen labels and camera configuration.

### Name formula parts

Keep each formula part's identity, LaTeX, and color together:

```ts
const equation = s.math([
  { key: 'incident', latex: String.raw`\theta_i`, color: 'accent' },
  '=',
  { key: 'outgoing', latex: String.raw`\theta_r`, color: 'secondary' },
]);

await s.step({ id: 'angles' }, async () => {
  await s.write(equation);
  await s.play(new Indicate(equation.part('incident')));
});
```

Import `Indicate` from `manim-web`. Named keys must be nonempty and unique. Each part should be a complete LaTeX fragment. `part(key)` becomes available after preparation, so use it inside a step callback. It also selects unique existing `matchingKeys`; repeated unnamed strings require explicit names to avoid ambiguity. `getPart(index)` remains available.

Core `new MathTex({ latex: [...] })` supports the same descriptors, typed as `MathTexNamedPart`, using CSS colors. `s.math` additionally resolves theme color roles. `TransformMatchingTex` matches the named identities automatically. For a replacement formula created during a step, await `target.waitForRender()`, position it at `source.getCenter()`, then play `new TransformMatchingTex(source, target)`. Such a replacement uses the existing formula's space rather than declaring another layout block. The [quadratic lesson](lesson/quadratic.ts) shows this sequence.

### Static Markdown math

`markdownSlide` supports `$inline math$` and `$$display math$$` alongside ordinary Markdown:

```ts
markdownSlide(
  'summary',
  String.raw`## The update rule

For a step size $\eta > 0$:

$$x_{k+1}=x_k-\eta f'(x_k).$$
`,
);
```

Code spans and code blocks remain literal. Escape currency dollar signs as `\$`. Static math uses bundled KaTeX and its fonts; animated `MathTex` uses MathJax. Use notation supported by the relevant renderer.

## Direct scene authoring

Use a `SceneDefinition` directly when a custom animation needs complete control over scene construction. The [low-level example](low-level/scene.ts) keeps one small manually positioned scene for reference. The [tech demo](tech-demo/README.md) combines `defineSlide` with manually positioned 2D scientific diagrams, and uses a direct definition for its 3D topic. For a diagram inside an ordinary slide, use `defineSlide` with `place` as shown above.

A minimal direct scene looks like this:

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

Standalone playback uses the scene's default colors. To supply a palette explicitly, wrap the build callback: `await player.sequence((scene) => sceneDefinition.build(scene, { colors: palettes.light }));`.

An instance supplied as `scene` is borrowed by default; a factory transfers ownership by default. `ownsScene` overrides that choice. UI, keyboard and pointer handlers are independently optional. `stop()` leaves a loop immediately; `pause()` preserves its current time. Events include `ready`, `frame`, `play`, `pause`, `complete` and `error`. Disposal is terminal and releases recorded state and owned resources.

`Animation.dispose()` releases animation-owned snapshots and temporary copies; it never disposes the caller's source mobject or a supplied `Transform` target. Animation groups dispose their child animations recursively, and `Timeline.clear()` invokes this cleanup. Custom animations that own resources can override `dispose()` and call `super.dispose()`. An animation can be reused after removal by adding it to a timeline again and calling `reset()` before playback; its next `begin()` rebuilds released state.

`captureCheckpoint` returns PNG graphics plus projected semantic text. It restores the prior scene, camera, viewport, loop target and playback state after success or failure. `withFrozenState` exposes that restoration boundary to custom capture code. `inspectText` returns visible text runs projected through the active 2D, 3D or fixed-overlay camera.

## Text and printing

`Text.getText()` returns its logical source during letter/word reveals; `getVisibleText()` returns the currently displayed content. Grapheme ranges preserve combining accents and emoji sequences. Actual glyph outline drawing requires a supported TTF/OTF `fontUrl`; texture text uses its documented reveal treatment. Source-font readiness precedes measurement. Semantic font URLs travel with snapshots and are packaged relative to the built site.

`Tex({ latex: '{{Ray Tracing}} {{for}} {{Radio}}', fontUrl, fontWeight: 'bold' })` uses the supplied TTF/OTF outlines for literal Latin titles. The supported subset is single-line Latin letters, numbers, ordinary spaces and punctuation, with `{{...}}` matching boundaries or an explicit array of parts. TeX commands, control characters, scripts requiring shaping and unavailable glyphs fail explicitly. `matchingKeys` distinguishes repeated parts. Copies and interrupted `Write`/`TransformMatchingTex` preserve font and part identity. These titles expose literal selectable prose, original TeX source ranges and the font asset for native printing; omit `fontUrl` for normal MathJax text-mode rendering. Mathematical `MathTex` uses the bundled MathJax fonts, including calligraphic and double-struck alphabets.

Paused selection and printed prose come from the same semantic runs. Hidden/replaced and fully offscreen text is excluded. Mathematical formulas retain LaTeX source for accessibility and copying while their SVG-derived glyphs remain in graphics captures. This differs from selectable native prose. Latin text and the examples' formula macros are qualified; arbitrary script shaping and arbitrary Python LaTeX preambles are not promised.

Automatically laid-out paragraphs and bullets keep these semantics: settled prose is selectable, and inline formulas retain their LaTeX source. Wrapping and grouping a bullet do not turn its text into a single image. Vector formulas use their authored named parts for matching, independently of the prose selection model.

LaTeX copying applies to the browser overlay. Chromium may omit its transparent formula text when creating a PDF; PDF formula graphics remain visible, but selectable LaTeX is not guaranteed. Qualification records the formula source runs actually extracted from each PDF instead of treating them as native prose.

Production builds prepare all handout graphics and text before the deck reports ready. Native `beforeprint` pauses existing playback synchronously; it never starts scene imports. `afterprint` restores playback and media time/rate. Overview and hidden tabs pause playback and remain paused on return by default. All print entry points share the same flat document, so topic wrappers do not add pages.

## Building and exporting

`slides build` uses the project's Vite configuration and its actual `build.outDir`. It also accepts a project root and `--config`, `--mode`, `--base`, `--outDir`, `--target` and `--emptyOutDir`. `slides pdf [filename]` accepts the same build options and exports from that build directory. For example, `slides pdf talk.pdf --outDir site --base /talk/` builds and captures a site intended for `/talk/`; `base: './'` keeps the default starter relocatable to any directory. Imported local fonts are rebased relative to the built site in the handout manifest.
