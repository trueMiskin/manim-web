import { expect, test, type Page } from '@playwright/test';
import type { ManimPresentation } from '../../src/reveal/ManimPresentation';

declare global {
  interface Window {
    __MANIM_PRESENTATION__?: ManimPresentation;
  }
}

const source = 'int main() {\n\tconst int n = 2;\n\treturn n;\n}\n';
const currentLeaf = '.reveal .slides > section.present > section.present';
const liveSource = `${currentLeaf} .manim-selection .manim-code-source`;
const liveCopy = `${currentLeaf} .manim-selection .manim-code-copy`;

async function ready(page: Page, route: string): Promise<void> {
  await page.goto(`/tests/integration/code-authoring.html#/${route}`);
  await page.waitForFunction(
    () => window.__MANIM_PRESENTATION__?.ready || window.__MANIM_PRESENTATION__?.error,
  );
  expect(await page.evaluate(() => window.__MANIM_PRESENTATION__?.error)).toBeUndefined();
  await settled(page);
}

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const player = window.__MANIM_PRESENTATION__?.player;
    return player && !player.isPlaying;
  });
}

// MIGRATION: code source is selectable and copyable verbatim regardless of its
// visual gutter, tabs, or navigation state; hidden/playing code has no stale controls.
test('code copies exact source and selection follows visibility and replay', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ready(page, 'lesson--replay--shown');
  const pre = page.locator(liveSource);
  const button = page.locator(liveCopy);
  await expect(pre).toHaveCount(1);
  expect(await pre.textContent()).toBe(source);
  await expect(button).toHaveAccessibleName('Copy code');
  await button.click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(source);

  // Native mouse selection must reach the transparent text above the canvas.
  const word = await pre.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const start = node.textContent?.indexOf('return') ?? -1;
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + 'return'.length);
      const rect = range.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }
    throw new Error('Expected a return statement');
  });
  await page.mouse.dblclick(word.x, word.y);
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('return');

  // Keyboard copy exercises the browser selection, independently of the Copy button.
  await pre.focus();
  await page.keyboard.press('ControlOrMeta+A');
  expect(await page.evaluate(() => window.getSelection()?.getRangeAt(0).toString())).toBe(source);
  await page.evaluate(() => navigator.clipboard.writeText('previous clipboard contents'));
  await page.keyboard.press('ControlOrMeta+C');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(source);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());

  await page.keyboard.press('r');
  await expect
    .poll(() => page.evaluate(() => window.__MANIM_PRESENTATION__!.player!.isPlaying))
    .toBe(true);
  await expect(button).toHaveCount(0);
  await settled(page);
  await expect(button).toHaveCount(1);
  expect(await pre.textContent()).toBe(source);

  await page.keyboard.press('ArrowDown');
  await expect(page.locator(currentLeaf)).toHaveAttribute('id', 'lesson--replay--removed');
  await settled(page);
  await expect(pre).toHaveCount(0);
  await expect(button).toHaveCount(0);
  await page.keyboard.press('ArrowUp');
  await expect(page.locator(currentLeaf)).toHaveAttribute('id', 'lesson--replay--shown');
  await settled(page);
  await expect(button).toHaveCount(1);
  expect(await pre.textContent()).toBe(source);
  await page.keyboard.press('ArrowUp');
  await expect(page.locator(currentLeaf)).toHaveAttribute('id', 'lesson--replay--hidden');
  await settled(page);
  await expect(pre).toHaveCount(0);
  await expect(button).toHaveCount(0);
  expect(errors).toEqual([]);
});

// MIGRATION: code checkpoints await highlighting and retain native ink/background/gutters while
// their semantic layer remains selectable but transparent, including unvisited print states.
test('unvisited code handouts retain their raster appearance and selectable source', async ({
  page,
}) => {
  await ready(page, 'reference--declarative--content');
  await expect(page.locator('.manim-handout > .manim-page')).toHaveCount(4);
  const shown = page.locator('.manim-handout [data-manim-id="lesson/replay/shown"]');
  const hidden = page.locator('.manim-handout [data-manim-id="lesson/replay/hidden"]');
  const removed = page.locator('.manim-handout [data-manim-id="lesson/replay/removed"]');
  expect(await shown.locator('.manim-code-source').textContent()).toBe(source);
  await expect(hidden.locator('.manim-code-overlay')).toHaveCount(0);
  await expect(removed.locator('.manim-code-overlay')).toHaveCount(0);

  for (const pre of [page.locator(liveSource), shown.locator('.manim-code-source')]) {
    expect(
      await pre.evaluate((element) =>
        [element, ...element.querySelectorAll('*')].every((node) => {
          const color = getComputedStyle(node).color;
          return color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
        }),
      ),
    ).toBe(true);
  }

  const pixels = await shown.locator('img').evaluate(async (element) => {
    const image = element as HTMLImageElement;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let background = 0;
    let gutter = 0;
    let keyword = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === 18 && data[i + 1] === 52 && data[i + 2] === 86) background++;
      if (data[i] > 220 && data[i + 1] < 40 && data[i + 2] > 170) gutter++;
      if (data[i] === 86 && data[i + 1] === 156 && data[i + 2] === 214) keyword++;
    }
    return { background, gutter, keyword };
  });
  expect(pixels.background).toBeGreaterThan(100);
  expect(pixels.gutter).toBeGreaterThan(10);
  expect(pixels.keyword).toBeGreaterThan(10);

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.manim-handout')).toBeVisible();
  await expect(shown.locator('.manim-code-source')).toBeVisible();
  await expect(shown.locator('.manim-code-copy')).toBeHidden();
});
