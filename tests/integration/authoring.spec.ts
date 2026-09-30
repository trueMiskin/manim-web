import { expect, test, type Page } from '@playwright/test';
import type { Mobject } from '../../src/core/Mobject';
import type { MathTex } from '../../src/mobjects/text/MathTex';
import type { RichParagraph } from '../../src/mobjects/text/RichParagraph';
import type { Text } from '../../src/mobjects/text/Text';
import type { MeshBasicMaterial } from 'three';
import type { ManimPresentation } from '../../src/reveal/ManimPresentation';

declare global {
  interface Window {
    __MANIM_PRESENTATION__?: ManimPresentation;
    __AUTHORING_OBJECTS__: Record<string, Mobject>;
    __AUTHORING_CHILD_REVEAL__: { axes: boolean; point: boolean; diagram: boolean };
    __AUTHORING_OVERFLOW__: () => Promise<string>;
    __AUTHORING_RELEASE_SCENE__?: () => void;
  }
}

const fixture = '/tests/integration/authoring.html';
const currentLeaf = '.reveal .slides > section.present > section.present';

// MIGRATION: declarative slides preserve their content, column layout, and
// additive builds and formula slots across direct links, partial replay,
// navigation, palette changes, and printing without moving surrounding content.
test('the basic deck mounts, reveals named bullet items, and prepares every handout state', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const failed = new Promise<never>((_, reject) => page.once('pageerror', reject));
  await Promise.race([
    (async () => {
      await page.goto('/examples/presentations/basic/#/lesson--closer--minimum');
      await page.waitForFunction(
        () => window.__MANIM_PRESENTATION__?.ready || window.__MANIM_PRESENTATION__?.error,
      );
    })(),
    failed,
  ]);
  expect(await page.evaluate(() => window.__MANIM_PRESENTATION__?.error)).toBeUndefined();
  const closerState = async (latex: string) => {
    await page.waitForFunction(() => {
      const player = window.__MANIM_PRESENTATION__?.player;
      return player && !player.isPlaying;
    });
    const state = await page.evaluate(() => {
      const player = window.__MANIM_PRESENTATION__!.player!;
      const runs = player.inspectText();
      // Display formulas have a named input part; bullet formulas are single runs.
      const formulas = runs.filter((run) => run.kind === 'math' && /^f\([012]\)$/.test(run.text));
      return {
        formulas: formulas.map(({ mobjectId }) => {
          const parts = runs.filter((run) => run.mobjectId === mobjectId);
          return {
            latex: parts.map((run) => run.text).join(''),
            top: Math.min(...parts.map((run) => run.transform[5])),
          };
        }),
        surrounding: runs
          .filter(
            (run) => run.source.startsWith('Start at two') || run.source.startsWith('Move closer'),
          )
          .map(({ text, width, height, transform }) => ({ text, width, height, transform })),
        image: player.scene.renderer.getCanvas().toDataURL(),
      };
    });
    expect(state.formulas).toHaveLength(1);
    expect(state.formulas[0].latex).toBe(latex);
    return state;
  };
  await expect(page.locator(currentLeaf)).toHaveAttribute('id', 'lesson--closer--minimum');
  await expect(page.locator(`${currentLeaf} .manim-selection`)).toContainText('output falls');
  await expect(page.locator(`${currentLeaf} .manim-selection`)).toContainText('output reaches');
  await expect(page.locator('.manim-handout .manim-page')).toHaveCount(16);
  const minimum = await closerState('f(0)=0');

  await page.keyboard.press('ArrowUp');
  await expect(page.locator(currentLeaf)).toHaveAttribute('id', 'lesson--closer--first-step');
  await expect(page.locator(`${currentLeaf} .manim-selection`)).toContainText('output falls');
  await expect(page.locator(`${currentLeaf} .manim-selection`)).not.toContainText('output reaches');
  const firstStep = await closerState('f(1)=1');
  expect(firstStep.surrounding).toEqual(minimum.surrounding);
  expect(firstStep.formulas[0].top).toBeCloseTo(minimum.formulas[0].top);
  await page.keyboard.press('ArrowUp');
  await expect(page.locator(currentLeaf)).toHaveAttribute('id', 'lesson--closer--content');
  await expect(page.locator(`${currentLeaf} .manim-selection`)).not.toContainText('output falls');
  const initial = await closerState('f(2)=4');
  expect(initial.surrounding).toEqual(minimum.surrounding);
  expect(initial.formulas[0].top).toBeCloseTo(minimum.formulas[0].top);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator(`${currentLeaf} .manim-selection`)).toContainText('output falls');
  expect(await closerState('f(1)=1')).toEqual(firstStep);

  await page.keyboard.press('r');
  await expect
    .poll(() => page.evaluate(() => window.__MANIM_PRESENTATION__!.player!.isPlaying))
    .toBe(true);
  await page.evaluate(() => {
    const player = window.__MANIM_PRESENTATION__!.player!;
    const checkpoint = player.checkpoints.find(({ id }) => id === 'first-step')!;
    player.pause();
    player.seek((checkpoint.startTime + checkpoint.endTime) / 2);
  });
  await page.keyboard.press('ArrowUp');
  await expect(page.locator(currentLeaf)).toHaveAttribute('id', 'lesson--closer--content');
  expect(await closerState('f(2)=4')).toEqual(initial);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator(currentLeaf)).toHaveAttribute('id', 'lesson--closer--first-step');
  expect(await closerState('f(1)=1')).toEqual(firstStep);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator(currentLeaf)).toHaveAttribute('id', 'lesson--closer--minimum');
  expect(await closerState('f(0)=0')).toEqual(minimum);
  await page.keyboard.press('ArrowUp');
  await expect(page.locator(currentLeaf)).toHaveAttribute('id', 'lesson--closer--first-step');

  await page.keyboard.press('Shift+Space');
  await expect(page.locator(currentLeaf)).toHaveAttribute('id', 'lesson--closer--content');
  await page.keyboard.press('Shift+Space');
  await expect(page.locator(currentLeaf)).toHaveAttribute('id', 'lesson--graph--content');
  await expect(page.locator(`${currentLeaf} .manim-selection`)).toContainText('curve is symmetric');
  await expect(page.locator(`${currentLeaf} .manim-selection`)).toContainText('both give a height');
  const canvas = page.locator(`${currentLeaf} canvas`).first();
  await expect(canvas).toBeVisible();
  expect((await canvas.boundingBox())!.height).toBeGreaterThan(300);
  await page.screenshot({ path: testInfo.outputPath('basic-columns.png') });

  await page.getByRole('combobox', { name: 'Color palette' }).selectOption('light');
  await page.waitForFunction(() => window.__MANIM_PRESENTATION__?.ready);
  await expect(page.locator(currentLeaf)).toHaveAttribute('id', 'lesson--graph--content');
  await expect(page.locator(`${currentLeaf} .manim-selection`)).toContainText('curve is symmetric');
  await expect(page.locator('.manim-handout .manim-page')).toHaveCount(16);
  await page.keyboard.press('Shift+Space');
  await expect(page.locator(currentLeaf)).toHaveAttribute('id', 'lesson--quadratic--content');
  await expect(page.locator(`${currentLeaf} .manim-selection`)).toContainText('minimum is at zero');
  expect(errors).toEqual([]);
});

// MIGRATION: forward navigation never displays a checkpoint's completed poster
// while its live scene is still loading, regardless of the load's duration.
test('the quadratic lesson does not flash its completed preview before playback', async ({
  page,
}) => {
  await page.goto('/examples/presentations/lesson/#/idea--gradient--repeat');
  await page.waitForFunction(() => window.__MANIM_PRESENTATION__?.player);
  await expect(page.locator(`${currentLeaf} .manim-live`)).toBeVisible();
  await page.evaluate(() => {
    const slide = window.__MANIM_PRESENTATION__!.routes.find(
      (route) => route.id === 'example/quadratic/function',
    )!.slide;
    if (slide.kind !== 'scene') throw new Error('Expected the quadratic scene');
    const load = slide.load;
    const pending = new Promise<void>((resolve) => {
      window.__AUTHORING_RELEASE_SCENE__ = resolve;
    });
    slide.load = async () => {
      await pending;
      return load();
    };
  });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator(currentLeaf)).toHaveAttribute('id', 'example--quadratic--function');
  await expect(page.locator(`${currentLeaf} .manim-poster`)).toBeHidden();
  await expect(page.locator(`${currentLeaf} .manim-live`)).toHaveCount(0);
  await page.evaluate(() => window.__AUTHORING_RELEASE_SCENE__!());
  await expect(page.locator(`${currentLeaf} .manim-live`)).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__MANIM_PRESENTATION__!.player!.isPlaying))
    .toBe(true);
  await page.waitForFunction(() => !window.__MANIM_PRESENTATION__!.player!.isPlaying);
  await expect(page.locator(`${currentLeaf} .manim-selection`)).toContainText('the derivative');
  await expect(page.locator(`${currentLeaf} .manim-selection`)).not.toContainText(
    'each step moves',
  );
});

async function ready(page: Page, hash = ''): Promise<void> {
  await page.goto('about:blank');
  await page.goto(`${fixture}${hash}`);
  await page.waitForFunction(
    () => window.__MANIM_PRESENTATION__?.ready || window.__MANIM_PRESENTATION__?.error,
  );
  expect(await page.evaluate(() => window.__MANIM_PRESENTATION__?.error)).toBeUndefined();
  await expect(page.locator('.manim-loading')).toHaveCount(0);
}

async function settledAt(page: Page, checkpoint: string): Promise<void> {
  await expect(page.locator(currentLeaf)).toHaveAttribute('id', `lesson--gradient--${checkpoint}`);
  await page.waitForFunction(() => {
    const player = window.__MANIM_PRESENTATION__?.player;
    return player && !player.isPlaying;
  });
}

async function visibility(page: Page): Promise<Record<string, boolean>> {
  return page.evaluate(() =>
    Object.fromEntries(
      Object.entries(window.__AUTHORING_OBJECTS__).map(([name, object]) => [
        name,
        object.getThreeObject().visible,
      ]),
    ),
  );
}

// MIGRATION: every authored checkpoint restores the same visible content and
// geometry independently of navigation history, including partial animation seeks.
test('flow layout, inline math and whole bullet rows survive navigation and replay', async ({
  page,
}, testInfo) => {
  await ready(page);
  await settledAt(page, 'title');
  await expect(page.locator(`${currentLeaf} .manim-selection`)).toContainText('Gradient descent');
  await expect(page.locator(`${currentLeaf} .manim-selection`)).not.toContainText('Choose');
  expect(await visibility(page)).toEqual({
    intro: false,
    rule: false,
    first: false,
    second: false,
    diagram: false,
  });

  await page.keyboard.press('ArrowDown');
  await settledAt(page, 'rule');
  await expect(page.locator(`${currentLeaf} .manim-selection`)).toContainText('Choose a step size');
  await expect(page.locator(`${currentLeaf} .manim-selection [data-latex]`)).toHaveCount(4);
  expect(await visibility(page)).toEqual({
    intro: true,
    rule: true,
    first: false,
    second: false,
    diagram: false,
  });

  await page.keyboard.press('ArrowDown');
  await settledAt(page, 'first');
  await expect(page.locator(`${currentLeaf} .manim-selection`)).toContainText('First, follow');
  await expect(page.locator(`${currentLeaf} .manim-selection`)).not.toContainText('Second, repeat');
  expect((await visibility(page)).second).toBe(false);
  await page.keyboard.press('ArrowDown');
  await settledAt(page, 'second');
  await page.keyboard.press('ArrowDown');
  await settledAt(page, 'diagram');
  expect(await page.evaluate(() => window.__AUTHORING_CHILD_REVEAL__)).toEqual({
    axes: true,
    point: false,
    diagram: true,
  });
  await page.screenshot({ path: testInfo.outputPath('authoring.png') });
  const finalFrame = await page.evaluate(() =>
    window.__MANIM_PRESENTATION__!.player!.scene.renderer.getCanvas().toDataURL(),
  );
  await page.keyboard.press('ArrowUp');
  await settledAt(page, 'second');
  expect((await visibility(page)).diagram).toBe(false);
  await page.keyboard.press('ArrowDown');
  await settledAt(page, 'diagram');
  expect(
    await page.evaluate(() =>
      window.__MANIM_PRESENTATION__!.player!.scene.renderer.getCanvas().toDataURL(),
    ),
  ).toBe(finalFrame);

  const samples = await page.evaluate(() => {
    const player = window.__MANIM_PRESENTATION__!.player!;
    const checkpoint = player.checkpoints.find(({ id }) => id === 'first')!;
    const midpoint = (checkpoint.startTime + checkpoint.endTime) / 2;
    const sample = () => {
      player.seek(midpoint);
      return {
        image: player.scene.renderer.getCanvas().toDataURL(),
        text: player.inspectText(),
      };
    };
    const initial = sample();
    player.seekCheckpoint('title');
    const repeated = sample();
    player.seekCheckpoint('diagram');
    const bounds = Object.fromEntries(
      Object.entries(window.__AUTHORING_OBJECTS__).map(([name, object]) => {
        const { min, max } = object.getBounds();
        return [name, { left: min.x, right: max.x, bottom: min.y, top: max.y }];
      }),
    );
    const paragraph = window.__AUTHORING_OBJECTS__.intro as RichParagraph;
    const inline = paragraph.children.find(
      (object): object is MathTex =>
        typeof (object as MathTex).getLatex === 'function' &&
        (object as MathTex).getLatex() === '\\eta < 1',
    )!;
    const formulaBounds = inline.getBounds();
    const etaBounds = inline.children[0].getBounds();
    const descender = paragraph.children.find(
      (object): object is Text =>
        typeof (object as Text).getText === 'function' &&
        (object as Text).getText() === 'preserving',
    )!;
    const material = descender.getDisplayMeshes()[0].material as MeshBasicMaterial;
    const texture = material.map!.image as HTMLCanvasElement;
    const bottomPixels = texture
      .getContext('2d')!
      .getImageData(0, texture.height - 1, texture.width, 1).data;
    const rowTextBounds = (row: Mobject) => {
      const ids = new Set<string>();
      const visit = (object: Mobject) => {
        ids.add(object.id);
        object.children.forEach(visit);
      };
      visit(row);
      const runs = player.inspectText().filter((run) => ids.has(run.mobjectId) && run.text.trim());
      return {
        top: Math.min(...runs.map((run) => run.transform[5])),
        bottom: Math.max(...runs.map((run) => run.transform[5] + run.height)),
      };
    };
    return {
      initial,
      repeated,
      bounds,
      lineCount: paragraph.getLineCount(),
      descenderBottomAlpha: Math.max(
        ...Array.from(bottomPixels).filter((_, index) => index % 4 === 3),
      ),
      firstRowText: rowTextBounds(window.__AUTHORING_OBJECTS__.first),
      secondRowText: rowTextBounds(window.__AUTHORING_OBJECTS__.second),
      inline: {
        glyphs: inline.children.filter(
          (object) => !object.isEmpty() && object.opacity > 0 && object.getThreeObject().visible,
        ).length,
        width: formulaBounds.max.x - formulaBounds.min.x,
        firstGlyphWidth: etaBounds.max.x - etaBounds.min.x,
      },
    };
  });
  expect(samples.repeated).toEqual(samples.initial);
  expect(samples.lineCount).toBeGreaterThan(1);
  // MIGRATION: every glyph's ink fits inside its texture with transparent padding,
  // even when rich prose uses tight line boxes and letters extend below the baseline.
  expect(samples.descenderBottomAlpha).toBe(0);
  // Relational ink survives MathJax line breaks and XML parsing of the '<' operator.
  expect(samples.inline.glyphs).toBe(3);
  expect(samples.inline.width).toBeGreaterThan(samples.inline.firstGlyphWidth * 2);
  expect(samples.firstRowText.bottom).toBeLessThan(samples.secondRowText.top);
  expect(samples.initial.text.map(({ text }) => text).join('')).not.toContain('Second, repeat');
  expect(samples.bounds.intro.bottom).toBeGreaterThan(samples.bounds.rule.top);
  expect(samples.bounds.rule.bottom).toBeGreaterThan(samples.bounds.first.top);
  expect(samples.bounds.first.bottom).toBeGreaterThan(samples.bounds.second.top);
  expect(samples.bounds.intro.right).toBeLessThan(samples.bounds.diagram.left);
  expect(Object.values(samples.bounds).every(({ top, bottom }) => top < 4 && bottom > -4)).toBe(
    true,
  );

  await ready(page, '#/lesson--gradient--second');
  await settledAt(page, 'second');
  expect(await visibility(page)).toEqual({
    intro: true,
    rule: true,
    first: true,
    second: true,
    diagram: false,
  });
  await page.keyboard.press('r');
  await expect
    .poll(() => page.evaluate(() => window.__MANIM_PRESENTATION__!.player!.isPlaying))
    .toBe(true);
  await settledAt(page, 'second');
  expect((await visibility(page)).diagram).toBe(false);
});

// MIGRATION: print output preserves visible prose and math for every checkpoint
// before navigation; overflowing authored content fails with an actionable error.
test('unvisited handouts retain mixed math and static Markdown uses local KaTeX', async ({
  page,
}) => {
  await ready(page, '#/reference--math');
  await expect(page.locator('.manim-handout > .manim-page')).toHaveCount(6);
  await expect(page.locator(`${currentLeaf} .katex`)).toHaveCount(2);
  await expect(page.locator(`${currentLeaf} math`)).toHaveCount(2);
  await expect(page.locator(`${currentLeaf} code`)).toHaveText('$x$');
  await expect(page.locator('#manim-markdown-math-styles')).toHaveCount(1);
  expect(
    await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        loaded: document.fonts.check('16px KaTeX_Math'),
        local: performance
          .getEntriesByType('resource')
          .filter(({ name }) => /KaTeX.*\.(woff2?|ttf)/.test(name))
          .every(({ name }) => new URL(name).origin === location.origin),
      };
    }),
  ).toEqual({ loaded: true, local: true });
  const first = page.locator('.manim-handout [data-manim-id="lesson/gradient/first"]');
  await expect(first).toContainText('First, follow');
  await expect(first).not.toContainText('Second, repeat');
  await expect(first.locator('[data-latex]')).toHaveCount(5);
  const final = page.locator('.manim-handout [data-manim-id="lesson/gradient/diagram"]');
  await expect(final).toContainText('Second, repeat');
  const inlineMathImage = await final.locator('img').evaluate((node) => {
    const image = node as HTMLImageElement;
    return image.complete && image.naturalWidth > 0;
  });
  expect(inlineMathImage).toBe(true);
  expect(await page.evaluate(() => window.__AUTHORING_OVERFLOW__())).toMatch(
    /overflow|exceed|fit/i,
  );

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.reveal')).toBeHidden();
  await expect(page.locator('.manim-handout')).toBeVisible();
  await expect(page.locator('.manim-handout [data-manim-id="reference/math"] .katex')).toHaveCount(
    2,
  );
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(6);
});
