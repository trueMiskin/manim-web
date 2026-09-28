import type Reveal from 'reveal.js';
import { manimPresentation, type ManimPresentation } from './ManimPresentation';
import type { PresentationDefinition, PresentationPluginOptions } from './types';

type RevealOptions = NonNullable<ConstructorParameters<typeof Reveal>[1]>;

export interface MountPresentationOptions extends PresentationPluginOptions {
  /** Additional Reveal configuration and plugins. */
  reveal?: RevealOptions;
  /** Load Reveal's speaker notes plugin. Default true. */
  notes?: boolean;
  /** Install Reveal's base CSS and black theme. Set false to supply your own CSS. */
  styles?: boolean;
}

export interface MountedPresentation {
  readonly deck: InstanceType<typeof Reveal>;
  readonly plugin: ManimPresentation;
  /** Destroy playback and Reveal, remove owned styles, and restore the container. */
  destroy(): void;
}

const mountedContainers = new WeakSet<HTMLElement>();

function resolveContainer(container: HTMLElement | string): HTMLElement {
  const element = typeof container === 'string' ? document.querySelector(container) : container;
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Presentation container was not found: ${String(container)}`);
  }
  return element;
}

function scaffold(
  container: HTMLElement,
  embedded: boolean,
): { root: HTMLElement; restore(): void } {
  const ownsRoot = !container.classList.contains('reveal');
  const root = ownsRoot ? document.createElement('div') : container;
  if (ownsRoot) {
    root.className = 'reveal';
    root.style.height = embedded ? '100%' : '100vh';
    container.append(root);
  }
  const existingSlides = root.querySelector<HTMLElement>(':scope > .slides');
  const slides = existingSlides ?? document.createElement('div');
  const originalChildren = Array.from(slides.childNodes);
  if (!existingSlides) {
    slides.className = 'slides';
    root.append(slides);
  }
  return {
    root,
    restore() {
      if (ownsRoot) root.remove();
      else if (!existingSlides) slides.remove();
      else slides.replaceChildren(...originalChildren);
    },
  };
}

async function loadStyles(enabled: boolean): Promise<HTMLStyleElement | undefined> {
  if (!enabled) return undefined;
  const [base, theme] = await Promise.all([
    import('reveal.js/reveal.css?inline'),
    import('reveal.js/theme/black.css?inline'),
  ]);
  const style = document.createElement('style');
  style.dataset.manimReveal = '';
  style.textContent = `${base.default}\n${theme.default}`;
  return style;
}

async function initializeDeck(
  deck: InstanceType<typeof Reveal>,
  plugin: ManimPresentation,
): Promise<void> {
  const originalInit = plugin.init;
  let failure: { error: unknown } | undefined;
  // Reveal does not propagate rejected plugin initialization promises. Let its
  // startup settle, then reject mount so the complete deck can be cleaned up.
  plugin.init = async (revealDeck) => {
    try {
      await originalInit.call(plugin, revealDeck);
    } catch (error) {
      failure = { error };
    }
  };
  try {
    await deck.initialize();
    if (failure) throw failure.error;
  } finally {
    plugin.init = originalInit;
  }
}

/**
 * Mount a presentation into an existing element or CSS selector.
 * Missing assets compile in the browser, matching manimPresentation(). Supply
 * build-generated assets explicitly for production, for example
 * `{ assets: './manim-handout.json' }`.
 *
 * @pre !mountedContainers.has(resolveContainer(container))
 * @post result.plugin.ready === true
 * @note Reveal and its styles load only when this function is called.
 */
export async function mountPresentation(
  container: HTMLElement | string,
  definition: PresentationDefinition,
  options: MountPresentationOptions = {},
): Promise<MountedPresentation> {
  const element = resolveContainer(container);
  if (mountedContainers.has(element)) {
    throw new Error('This container already has a mounted presentation. Destroy it first.');
  }
  const { reveal = {}, notes = true, styles = true, ...pluginOptions } = options;
  const plugin = manimPresentation(definition, pluginOptions);
  mountedContainers.add(element);
  let deck: InstanceType<typeof Reveal> | undefined;
  let host: ReturnType<typeof scaffold> | undefined;
  let style: HTMLStyleElement | undefined;
  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    try {
      deck?.destroy();
    } finally {
      // Initialization can fail before Reveal registers the plugin for cleanup.
      plugin.destroy();
      style?.remove();
      host?.restore();
      mountedContainers.delete(element);
    }
  };
  try {
    const [revealModule, notesModule, loadedStyle] = await Promise.all([
      import('reveal.js'),
      notes ? import('reveal.js/plugin/notes') : undefined,
      loadStyles(styles),
    ]);
    style = loadedStyle;
    if (style) document.head.append(style);
    host = scaffold(element, reveal.embedded === true);
    deck = new revealModule.default(host.root, {
      hash: true,
      transition: 'none',
      backgroundTransition: 'none',
      ...reveal,
      plugins: [plugin, ...(notesModule ? [notesModule.default] : []), ...(reveal.plugins ?? [])],
    });
    await initializeDeck(deck, plugin);
    return { deck, plugin, destroy };
  } catch (error) {
    destroy();
    throw error;
  }
}
