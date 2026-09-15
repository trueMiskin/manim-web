import { sceneKey, presentationSize } from './compile';
import { addNotes, applyBackground, renderSnapshot, renderStatic } from './content';
import type { PresentationAssets, PresentationDefinition, PresentationRoute } from './types';

function routeContent(
  route: PresentationRoute,
  assets: PresentationAssets,
  printing = false,
): HTMLElement {
  if (route.slide.kind !== 'scene') return renderStatic(route.slide, printing);
  const snapshot =
    route.checkpoint &&
    assets.scenes[sceneKey(route.topic.id, route.slide.id)]?.snapshots[route.checkpoint.id];
  if (!snapshot) throw new Error(`Missing checkpoint snapshot: ${route.id}`);
  return renderSnapshot(snapshot);
}

function createRoute(
  metadata: Omit<PresentationRoute, 'id' | 'element'>,
  assets: PresentationAssets,
): PresentationRoute {
  const { topic, slide, checkpoint } = metadata;
  const id = [topic.id, slide.id, checkpoint?.id].filter(Boolean).join('/');
  const leaf = document.createElement('section');
  leaf.id = id.split('/').join('--');
  leaf.className = 'manim-slide';
  leaf.dataset.manimId = id;
  leaf.dataset.slideId = slide.id;
  if (checkpoint) leaf.dataset.checkpointId = checkpoint.id;
  applyBackground(leaf, slide);
  const route = { ...metadata, id, element: leaf };
  const content = routeContent(route, assets);
  content.classList.add('manim-poster');
  leaf.append(content);
  addNotes(leaf, checkpoint?.notes ?? slide.notes);
  return route;
}

function includeHandout(
  route: PresentationRoute,
  definition: PresentationDefinition,
  assets: PresentationAssets,
): boolean {
  const selection = definition.handout ?? 'all';
  if (selection === 'all') return true;
  if (selection !== 'final') return selection.includes(route.id);
  if (!route.checkpoint) return true;
  const checkpoints = assets.scenes[sceneKey(route.topic.id, route.slide.id)].checkpoints;
  return route.checkpoint.id === checkpoints[checkpoints.length - 1].id;
}

export function buildPresentationDocument(
  definition: PresentationDefinition,
  assets: PresentationAssets,
  slidesElement: HTMLElement,
): { routes: PresentationRoute[]; handout: HTMLElement } {
  const routes: PresentationRoute[] = [];
  const handout = document.createElement('main');
  handout.className = 'manim-handout';
  handout.setAttribute('aria-label', `${definition.title} handout`);
  const topics = document.createDocumentFragment();
  definition.topics.forEach((topic, h) => {
    const stack = document.createElement('section');
    stack.id = topic.id;
    stack.dataset.topicId = topic.id;
    if (topic.chapter) stack.dataset.chapter = topic.chapter;
    let v = 0;
    for (const slide of topic.slides) {
      const compiled =
        slide.kind === 'scene' ? assets.scenes[sceneKey(topic.id, slide.id)] : undefined;
      if (slide.kind === 'scene' && !compiled)
        throw new Error(`Missing compiled scene: ${topic.id}/${slide.id}`);
      for (const checkpoint of compiled?.checkpoints ?? [undefined]) {
        const route = createRoute(
          { h, v: v++, ordinal: routes.length, topic, slide, checkpoint },
          assets,
        );
        stack.append(route.element);
        routes.push(route);
        if (includeHandout(route, definition, assets)) {
          const page = document.createElement('article');
          page.className = 'manim-page';
          page.dataset.manimId = route.id;
          applyBackground(page, slide);
          page.append(routeContent(route, assets, true));
          handout.append(page);
        }
      }
    }
    topics.append(stack);
  });
  if (Array.isArray(definition.handout)) {
    for (const id of definition.handout) {
      if (!routes.some((route) => route.id === id))
        throw new Error(`Unknown handout checkpoint: ${id}`);
    }
  }
  slidesElement.replaceChildren(topics);
  return { routes, handout };
}

export function presentationStyles(definition: PresentationDefinition): HTMLStyleElement {
  const { width, height } = presentationSize(definition);
  const style = document.createElement('style');
  style.textContent = `
    .manim-slide { width: ${width}px !important; height: ${height}px !important; padding: 0 !important; }
    .manim-slide > .notes { display: none; }
    .manim-snapshot, .manim-live, .manim-selection, .manim-poster { position:absolute; inset:0; width:100%; height:100%; }
    .manim-snapshot > img { position:absolute; inset:0; width:100%; height:100%; margin:0 !important; max-width:none !important; max-height:none !important; }
    .manim-live { z-index:1; }
    .manim-live canvas { position:absolute; inset:0; width:100%; height:100%; }
    .manim-selection { z-index:2; pointer-events:none; }
    .manim-selection > * { pointer-events:auto; }
    .manim-live + .manim-poster, .manim-slide[data-live="true"] > .manim-poster,
    .manim-slide[data-preparing="true"] > .manim-poster { visibility:hidden; }
    .manim-static-content { box-sizing:border-box; width:100%; height:100%; padding:5%; display:flex; flex-direction:column; justify-content:center; align-items:center; }
    .manim-static-content > img, .manim-static-content > video { max-width:100%; max-height:90%; min-height:0; }
    .manim-static-content figcaption { margin-top:1em; font-size:0.6em; }
    .manim-handout { display:none; }
    .manim-handout[data-view="screen"] { display:block; }
    .reveal[hidden], html.print-pdf .reveal[hidden], html.reveal-print .reveal[hidden] { display:none !important; }
    .manim-page { width:${width}px; height:${height}px; position:relative; overflow:hidden; color:#fff; background:#1c1c1c; font:32px/1.4 sans-serif; }
    .manim-loading { position:fixed; inset:0; display:grid; place-items:center; background:#111; color:#fff; z-index:100; font:20px sans-serif; }
    .manim-controls { position:fixed; top:12px; right:12px; display:flex; gap:8px; z-index:50; }
    .manim-controls button { border:1px solid #666; border-radius:4px; background:#202020; color:#fff; padding:6px 10px; cursor:pointer; }
    @page { size:${width}px ${height}px; margin:0; }
    @media print {
      .reveal, .manim-staging, .manim-loading, .manim-controls { display:none !important; }
      .manim-handout { display:block !important; }
      .manim-page { break-after:page; page-break-after:always; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
      .manim-page:last-child { break-after:auto; page-break-after:auto; }
      html, body { margin:0 !important; padding:0 !important; width:auto !important; height:auto !important; overflow:visible !important; background:#fff !important; }
    }
  `;
  return style;
}
