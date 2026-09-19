import { expect, test, type Page } from '@playwright/test';
import type { ManimPresentation } from '../../src/reveal/ManimPresentation';
import type { Axes } from '../../src/mobjects/graphing/Axes';
import type { Text } from '../../src/mobjects/text/Text';

declare global {
  interface Window {
    __MANIM_PRESENTATION__?: ManimPresentation;
  }
}

const basic = '/examples/presentations/basic/';
const mixed = '/examples/presentations/mixed/';
const currentLeaf = '.reveal .slides > section.present > section.present';

async function ready(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => window.__MANIM_PRESENTATION__?.ready);
  await expect(page.locator('.manim-loading')).toHaveCount(0);
}

async function at(page: Page, id: string): Promise<void> {
  await expect(page.locator(currentLeaf)).toHaveAttribute('id', id);
}

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const player = window.__MANIM_PRESENTATION__?.player;
    return player && !player.isPlaying;
  });
}

// MIGRATION: replacement steps show only their authored content and restore
// earlier geometry after completed or interrupted playback.
test('basic text replaces previous content and restores it through interrupted replay', async ({
  page,
}) => {
  await ready(page, `${basic}index.html#/text--styles--reveal`);
  await at(page, 'text--styles--reveal');
  await settled(page);
  const selection = page.locator(`${currentLeaf} .manim-selection`);
  await expect(selection).toContainText('Give words a little motion');
  await expect(selection).toContainText('One letter. One word. One idea.');
  await expect(selection).not.toContainText('Reveal one idea at a time.');
  const headingBounds = (text = 'Give words a little motion') =>
    page.evaluate((text) => {
      const heading = [...window.__MANIM_PRESENTATION__!.player!.scene.mobjects].find(
        (object): object is Text =>
          object.getThreeObject().visible &&
          typeof (object as Text).getText === 'function' &&
          (object as Text).getText() === text,
      )!;
      return heading.getBounds();
    }, text);
  const expected = await headingBounds();
  expect((expected.min.x + expected.max.x) / 2).toBeCloseTo(0);
  await page.keyboard.press('ArrowDown');
  await at(page, 'text--styles--bullets');
  await page.waitForFunction(() => {
    const player = window.__MANIM_PRESENTATION__!.player!;
    const checkpoint = player.checkpoints.find(({ id }) => id === 'bullets')!;
    return player.isPlaying && player.timeline.getCurrentTime() > checkpoint.startTime + 0.15;
  });
  await page.keyboard.press('ArrowUp');
  await at(page, 'text--styles--reveal');
  await settled(page);
  expect(await headingBounds()).toEqual(expected);
  await page.keyboard.press('ArrowDown');
  await at(page, 'text--styles--bullets');
  await settled(page);
  await expect(selection).toContainText('Build a list, then add emphasis');
  const replacement = await headingBounds('Build a list, then add emphasis');
  expect((replacement.min.x + replacement.max.x) / 2).toBeCloseTo(0);
  await expect(selection).toContainText('Highlight the point to remember.');
  for (const previous of ['Give words a little motion', 'One letter.', 'Write a heading']) {
    await expect(selection).not.toContainText(previous);
    await expect(
      page.locator('.manim-handout [data-manim-id="text/styles/bullets"]'),
    ).not.toContainText(previous);
  }
  await page.keyboard.press('ArrowUp');
  await at(page, 'text--styles--reveal');
  await settled(page);
  expect(await headingBounds()).toEqual(expected);
  await expect(selection).toContainText('One letter. One word. One idea.');
  await expect(selection).toContainText('Write a heading');
  await expect(selection).not.toContainText('Build a list, then add emphasis');
  await expect(selection).not.toContainText('Highlight the point to remember.');
});

// MIGRATION: real browser representatives for native Reveal navigation and the
// invariant that any leaf can be reached/restored without replaying earlier ones.
test('native horizontal/vertical keys, deep links, replay and overview share checkpoint state', async ({
  page,
}) => {
  await ready(page, basic);
  await settled(page);
  const titleBounds = () =>
    page.evaluate(() => {
      const title = [...window.__MANIM_PRESENTATION__!.player!.scene.mobjects][0];
      return { center: title.getCenter()[0], top: title.getBounds().max.y };
    });
  const staticTitleBounds = await titleBounds();
  expect(staticTitleBounds.center).toBeCloseTo(0);
  await expect(page.locator('.manim-handout > .manim-page')).toHaveCount(11);
  await expect(page.locator('.reveal .slides > section')).toHaveCount(5);
  await page.keyboard.press('ArrowRight');
  await at(page, 'geometry--circle--draw');
  await settled(page);
  // Static and animated titles share the same center and top edge.
  const animatedTitleBounds = await titleBounds();
  expect(animatedTitleBounds.center).toBeCloseTo(staticTitleBounds.center);
  expect(animatedTitleBounds.top).toBeCloseTo(staticTitleBounds.top);
  await expect(page.locator(`${currentLeaf} .notes`)).toContainText(
    'Start with one geometric object',
  );
  await page.keyboard.press('ArrowDown');
  await at(page, 'geometry--circle--move');
  await settled(page);
  const moved = await page.evaluate(() =>
    window.__MANIM_PRESENTATION__!.player!.scene.renderer.getCanvas().toDataURL(),
  );
  await page.keyboard.press('ArrowUp');
  await at(page, 'geometry--circle--draw');
  await settled(page);
  expect(
    await page.evaluate(() => {
      const player = window.__MANIM_PRESENTATION__!.player!;
      return player.timeline.getCurrentTime() === player.checkpoints[0].endTime;
    }),
  ).toBe(true);
  await page.keyboard.press('r');
  await expect
    .poll(() => page.evaluate(() => window.__MANIM_PRESENTATION__!.player!.isPlaying))
    .toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.reveal')).toHaveClass(/overview/);
  await expect
    .poll(() => page.evaluate(() => window.__MANIM_PRESENTATION__!.player!.isPlaying))
    .toBe(false);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await at(page, 'geometry--circle--move');
  await settled(page);
  expect(
    await page.evaluate(() =>
      window.__MANIM_PRESENTATION__!.player!.scene.renderer.getCanvas().toDataURL(),
    ),
  ).toBe(moved);
  await ready(page, `${basic}#/geometry--circle--move`);
  await at(page, 'geometry--circle--move');
  await settled(page);
  expect(
    await page.evaluate(() => {
      const player = window.__MANIM_PRESENTATION__!.player!;
      return player.timeline.getCurrentTime() === player.checkpoints[1].endTime;
    }),
  ).toBe(true);
  await expect(page.locator(`${currentLeaf} .manim-selection`)).toContainText(
    'A circle, then a shift',
  );
});

// MIGRATION: a representative for the property that a moving point and all
// derived readouts agree at any sought time, including after rewinding.
test('basic static bullets and live coordinates remain readable through replay', async ({
  page,
}) => {
  await ready(page, `${basic}#/welcome--bullets--content`);
  await at(page, 'welcome--bullets--content');
  await settled(page);
  for (const text of [
    'Start with one clear idea.',
    'Use a short list to make it easy to follow.',
    'Add motion when a change is worth seeing.',
  ]) {
    await expect(page.locator(`${currentLeaf} .manim-selection`)).toContainText(text);
    await expect(
      page.locator('.manim-handout [data-manim-id="welcome/bullets/content"]'),
    ).toContainText(text);
  }
  expect(
    await page.evaluate(() => {
      const player = window.__MANIM_PRESENTATION__!.player!;
      player.seekCheckpoint('content', 'start');
      const start = player.scene.renderer.getCanvas().toDataURL();
      player.seekCheckpoint('content', 'end');
      return player.scene.renderer.getCanvas().toDataURL() === start;
    }),
  ).toBe(true);

  await page.evaluate(() => {
    location.hash = '#/text--styles--bullets';
  });
  await at(page, 'text--styles--bullets');
  await settled(page);
  await expect(page.locator(`${currentLeaf} .manim-selection`)).toContainText(
    'Highlight the point to remember.',
  );

  await page.evaluate(() => {
    location.hash = '#/coordinates--point--move';
  });
  await at(page, 'coordinates--point--move');
  await settled(page);
  const expectedReadouts = ['x = -1.03', 'y = -1.18', 'distance = 1.56', 'angle = -131.2°'];
  for (const text of expectedReadouts) {
    await expect(page.locator(`${currentLeaf} .manim-selection`)).toContainText(text);
    await expect(
      page.locator('.manim-handout [data-manim-id="coordinates/point/move"]'),
    ).toContainText(text);
  }
  const samples = await page.evaluate(() => {
    const player = window.__MANIM_PRESENTATION__!.player!;
    const checkpoint = player.checkpoints.find((item) => item.id === 'move')!;
    const sample = (fraction: number) => {
      player.seek(checkpoint.startTime + fraction * (checkpoint.endTime - checkpoint.startTime));
      const objects = [...player.scene.mobjects];
      const point = objects.find((object) => object.constructor.name === 'Dot')!;
      const axes = objects.find((object) => object.constructor.name === 'Axes') as Axes;
      const labels = objects
        .filter((object): object is typeof object & { getText(): string } => 'getText' in object)
        .map((object) => object.getText())
        .filter((text) => /^(x|y|distance|angle) = /.test(text));
      const x = Number.parseFloat(labels.find((text) => text.startsWith('x = '))!.split(' = ')[1]);
      const y = Number.parseFloat(labels.find((text) => text.startsWith('y = '))!.split(' = ')[1]);
      return { point: point.getCenter(), projected: axes.c2p(x, y), labels };
    };
    const start = sample(0);
    const middle = sample(0.5);
    const end = sample(1);
    const restored = sample(0.5);
    return { start, middle, end, restored };
  });
  expect(samples.middle).toEqual(samples.restored);
  expect(samples.start.point).not.toEqual(samples.middle.point);
  expect(samples.middle.point).not.toEqual(samples.end.point);
  expect(samples.start.labels).not.toEqual(samples.middle.labels);
  for (const sample of [samples.start, samples.middle, samples.end]) {
    const values = Object.fromEntries(
      sample.labels.map((text) => {
        const [name, value] = text.split(' = ');
        return [name, Number.parseFloat(value)];
      }),
    );
    expect(Object.keys(values)).toHaveLength(4);
    expect(sample.point[0]).toBeCloseTo(sample.projected[0], 2);
    expect(sample.point[1]).toBeCloseTo(sample.projected[1], 2);
    expect(values.distance).toBeCloseTo(Math.hypot(values.x, values.y), 1);
    expect(values.angle).toBeCloseTo((Math.atan2(values.y, values.x) * 180) / Math.PI, 0);
    expect(sample.point.every(Number.isFinite)).toBe(true);
  }
  await page.evaluate(() => window.__MANIM_PRESENTATION__!.player!.seekCheckpoint('start'));
  await expect(page.locator(`${currentLeaf} .manim-selection`)).toContainText('x = +1.89');
});

test('all unvisited static/media/3D leaves are printable before navigation', async ({
  page,
  browserName,
}) => {
  await ready(page, mixed);
  await expect(page.locator('.manim-handout > .manim-page')).toHaveCount(8);
  await expect(page.locator('.manim-handout .manim-page .manim-page')).toHaveCount(0);
  await expect(page.locator('.manim-handout video, .manim-handout audio')).toHaveCount(0);
  await expect(page.locator('.manim-handout [data-manim-id="media/tone"]')).toContainText(
    '440 Hz tone',
  );
  expect(
    await page
      .locator('.manim-handout [data-manim-id="static/diagram"]')
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  ).toBe('rgb(16, 32, 48)');
  expect(
    await page
      .locator('.manim-handout img')
      .evaluateAll((images) =>
        images.every(
          (image) =>
            (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
        ),
      ),
  ).toBe(true);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.reveal')).toBeHidden();
  await expect(page.locator('.manim-handout')).toBeVisible();
  const sizes = await page.locator('.manim-page').evaluateAll((pages) =>
    pages.map((node) => ({
      width: node.getBoundingClientRect().width,
      height: node.getBoundingClientRect().height,
      breakAfter: getComputedStyle(node).breakAfter,
    })),
  );
  expect(sizes.every((size) => size.width === 1280 && size.height === 720)).toBe(true);
  expect(sizes.slice(0, -1).every((size) => size.breakAfter === 'page')).toBe(true);
  if (browserName === 'chromium') {
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(8);
  }
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('.reveal')).toBeVisible();
  await ready(page, `${mixed}?print-pdf`);
  await expect(page.locator('.reveal')).toBeHidden();
  await expect(page.locator('.manim-handout')).toBeVisible();
  expect(await page.evaluate(() => window.__MANIM_PRESENTATION__!.player)).toBeUndefined();
  if (browserName === 'chromium') {
    const revealPdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    expect(revealPdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(8);
  }
});

test('native printing restores live time and media, and leaving a loop disposes its player', async ({
  page,
}) => {
  await ready(page, `${mixed}#/three-d--torus--rotate`);
  await at(page, 'three-d--torus--rotate');
  await settled(page);
  await page.keyboard.press('r');
  await expect
    .poll(() => page.evaluate(() => window.__MANIM_PRESENTATION__!.player!.isPlaying))
    .toBe(true);
  const frozen = await page.evaluate(() => {
    window.dispatchEvent(new Event('beforeprint'));
    const player = window.__MANIM_PRESENTATION__!.player!;
    return {
      time: player.timeline.getCurrentTime(),
      paused: !player.isPlaying,
      hash: location.hash,
      image: player.scene.renderer.getCanvas().toDataURL(),
    };
  });
  expect(frozen.paused).toBe(true);
  await page.waitForTimeout(100);
  expect(
    await page.evaluate(() => window.__MANIM_PRESENTATION__!.player!.timeline.getCurrentTime()),
  ).toBe(frozen.time);
  expect(
    await page.evaluate(() =>
      window.__MANIM_PRESENTATION__!.player!.scene.renderer.getCanvas().toDataURL(),
    ),
  ).toBe(frozen.image);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect
    .poll(() => page.evaluate(() => window.__MANIM_PRESENTATION__!.player!.isPlaying))
    .toBe(true);
  expect(await page.evaluate(() => location.hash)).toBe(frozen.hash);
  const retainedPlayer = await page.evaluateHandle(() => window.__MANIM_PRESENTATION__!.player!);
  // Moving left stops an active looping interval immediately and tears down its canvas.
  await page.keyboard.press('ArrowLeft');
  await at(page, 'media--motion');
  await expect(page.locator('.manim-live')).toHaveCount(0);
  expect(await page.evaluate(() => window.__MANIM_PRESENTATION__!.player)).toBeUndefined();
  expect(
    await retainedPlayer.evaluate((player) => ({
      playing: player.isPlaying,
      compiled: player.timeline.isCompiled,
      animations: player.timeline.length,
      objects: player.scene.mobjects.size,
    })),
  ).toEqual({ playing: false, compiled: false, animations: 0, objects: 0 });
  await retainedPlayer.dispose();
  const video = page.locator('#media--motion video');
  await video.evaluate(async (node: HTMLVideoElement) => {
    node.currentTime = 0.2;
    node.playbackRate = 0.5;
    await node.play();
  });
  const mediaTime = await video.evaluate((node: HTMLVideoElement) => {
    window.dispatchEvent(new Event('beforeprint'));
    return node.currentTime;
  });
  expect(await video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  expect(await video.evaluate((node: HTMLVideoElement) => node.playbackRate)).toBe(0.5);
  expect(
    Math.abs((await video.evaluate((node: HTMLVideoElement) => node.currentTime)) - mediaTime),
  ).toBeLessThan(0.15);
  await page.keyboard.press('ArrowLeft');
  expect(await video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
  await expect(page).toHaveURL(/#\/static--intro$/);
  // Return repeatedly without accumulating live canvases, print documents or controls.
  for (let visit = 0; visit < 3; visit++) {
    await page.evaluate(() => {
      location.hash = '#/three-d--torus--rotate';
    });
    await at(page, 'three-d--torus--rotate');
    await settled(page);
    await expect(page.locator('.manim-live canvas')).toHaveCount(1);
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.manim-live')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/media--motion$/);
  }
  await expect(page.locator('.manim-handout')).toHaveCount(1);
  await expect(page.locator('.manim-controls')).toHaveCount(1);
  await page.evaluate(() => window.__MANIM_PRESENTATION__!.destroy());
  await expect(
    page.locator('.manim-handout, .manim-controls, .manim-live, .manim-loading'),
  ).toHaveCount(0);
});
