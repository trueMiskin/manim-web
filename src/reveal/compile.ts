import { Player } from '../player/Player';
import type {
  PresentationAssets,
  PresentationDefinition,
  SceneDefinition,
  SceneSlides,
} from './types';

export function sceneKey(topicId: string, sceneId: string): string {
  return `${topicId}/${sceneId}`;
}

export function presentationSize(definition: PresentationDefinition): {
  width: number;
  height: number;
} {
  return { width: definition.width ?? 1280, height: definition.height ?? 720 };
}

export async function loadScene(slides: SceneSlides): Promise<SceneDefinition> {
  const loaded = await slides.load();
  return 'default' in loaded ? loaded.default : loaded;
}

export function createScenePlayer(
  container: HTMLElement,
  scene: SceneDefinition,
  definition: PresentationDefinition,
  slide: SceneSlides,
): Player {
  const { width, height } = presentationSize(definition);
  return new Player(container, {
    width,
    height,
    frameWidth: (width / height) * 8,
    frameHeight: 8,
    backgroundOpacity: slide.background || slide.backgroundImage ? 0 : 1,
    ...scene.options,
    scene: scene.createScene,
    ownsScene: true,
    ui: false,
    keyboard: false,
    pointer: false,
    autoPlay: false,
  });
}

/** Prepare every required print state, releasing each scene before loading the next. */
export async function compilePresentation(
  definition: PresentationDefinition,
): Promise<PresentationAssets> {
  const assets: PresentationAssets = {
    version: 1,
    title: definition.title,
    ...presentationSize(definition),
    scenes: {},
  };
  const staging = document.createElement('div');
  staging.className = 'manim-staging';
  staging.style.cssText = 'position:absolute;left:-100000px;top:0;pointer-events:none';
  staging.setAttribute('aria-hidden', 'true');
  document.body.append(staging);
  try {
    for (const topic of definition.topics) {
      for (const slide of topic.slides) {
        if (slide.kind !== 'scene') continue;
        const scene = await loadScene(slide);
        const player = createScenePlayer(staging, scene, definition, slide);
        try {
          await player.sequence(scene.build);
          await player.prepare();
          if (player.checkpoints.length === 0)
            throw new Error(`Scene has no checkpoints: ${topic.id}/${slide.id}`);
          const snapshots: PresentationAssets['scenes'][string]['snapshots'] = {};
          for (const checkpoint of player.checkpoints) {
            snapshots[checkpoint.id] = await player.captureCheckpoint(checkpoint.id);
          }
          assets.scenes[sceneKey(topic.id, slide.id)] = {
            checkpoints: player.checkpoints,
            snapshots,
          };
        } finally {
          player.dispose();
          staging.replaceChildren();
        }
      }
    }
    return assets;
  } finally {
    staging.remove();
  }
}

export async function loadPresentationAssets(
  source: string | PresentationAssets | undefined,
  definition: PresentationDefinition,
): Promise<PresentationAssets> {
  if (!source || new URLSearchParams(location.search).has('manim-capture')) {
    return compilePresentation(definition);
  }
  const assets: PresentationAssets =
    typeof source === 'string'
      ? await fetch(source).then(async (response) => {
          if (!response.ok)
            throw new Error(`Could not load presentation assets: ${source} (${response.status})`);
          return response.json();
        })
      : source;
  const { width, height } = presentationSize(definition);
  if (
    assets.version !== 1 ||
    assets.width !== width ||
    assets.height !== height ||
    assets.title !== definition.title
  ) {
    throw new Error('Presentation assets do not match this deck. Rebuild the handout assets.');
  }
  return assets;
}
