import { marked } from 'marked';
import { appendSemanticText } from '../presentation/semantic';
import type { CheckpointSnapshot, SlideAppearance, StaticSlide } from './types';

export function applyBackground(element: HTMLElement, slide: SlideAppearance): void {
  if (slide.background) {
    element.dataset.backgroundColor = slide.background;
    element.style.backgroundColor = slide.background;
  }
  if (slide.backgroundImage) {
    element.dataset.backgroundImage = slide.backgroundImage;
    element.dataset.backgroundSize = slide.backgroundFit ?? 'cover';
    element.style.backgroundImage = `url(${JSON.stringify(slide.backgroundImage)})`;
    element.style.backgroundSize = slide.backgroundFit ?? 'cover';
    element.style.backgroundPosition = 'center';
    element.style.backgroundRepeat = 'no-repeat';
  }
}

export function addNotes(element: HTMLElement, notes?: string): void {
  if (!notes) return;
  const aside = document.createElement('aside');
  aside.className = 'notes';
  aside.textContent = notes;
  element.append(aside);
}

function addImage(container: HTMLElement, source: string, alt: string, fit = 'contain'): void {
  const image = document.createElement('img');
  image.src = source;
  image.alt = alt;
  image.style.objectFit = fit;
  container.append(image);
}

function printReplacement(element: HTMLElement, slide: StaticSlide): boolean {
  if (slide.printContent !== undefined) {
    element.innerHTML = slide.printContent;
    return true;
  }
  const poster = slide.printPoster ?? (slide.kind === 'video' ? slide.poster : undefined);
  if (!poster) return false;
  addImage(element, poster, slide.title ?? slide.caption ?? '', slide.fit);
  return true;
}

function addMedia(element: HTMLElement, slide: StaticSlide, printing: boolean): void {
  if (printing) {
    const label = document.createElement('p');
    label.textContent = slide.caption ?? slide.title ?? `${slide.kind}: ${slide.content}`;
    element.append(label);
    return;
  }
  const media = document.createElement(slide.kind === 'video' ? 'video' : 'audio');
  media.src = slide.content;
  media.controls = true;
  media.preload = 'metadata';
  media.loop = slide.loop ?? false;
  media.muted = slide.muted ?? false;
  if (slide.autoplay) media.dataset.autoplay = '';
  if (media instanceof HTMLVideoElement) {
    if (slide.poster) media.poster = slide.poster;
    media.playsInline = true;
    media.style.objectFit = slide.fit ?? 'contain';
  }
  element.append(media);
}

function addStaticContent(element: HTMLElement, slide: StaticSlide, printing: boolean): void {
  if (printing && printReplacement(element, slide)) return;
  if (slide.kind === 'html' || slide.kind === 'markdown') {
    element.innerHTML =
      slide.kind === 'html' ? slide.content : marked.parse(slide.content, { async: false });
  } else if (slide.kind === 'image') {
    addImage(element, slide.content, slide.alt ?? '', slide.fit);
  } else if (slide.kind === 'video' || slide.kind === 'audio') {
    addMedia(element, slide, printing);
  }
}

/** Trusted authored HTML/Markdown; never use this helper with unsanitized user input. */
export function renderStatic(slide: StaticSlide, printing = false): HTMLElement {
  const element = document.createElement('div');
  element.className = 'manim-static-content';
  addStaticContent(element, slide, printing);
  if (slide.caption && !(printing && slide.kind === 'audio')) {
    const caption = document.createElement('figcaption');
    caption.textContent = slide.caption;
    element.append(caption);
  }
  return element;
}

export function renderSnapshot(snapshot: CheckpointSnapshot): HTMLElement {
  const element = document.createElement('div');
  element.className = 'manim-snapshot';
  addImage(element, snapshot.image, '');
  appendSemanticText(element, snapshot.text);
  return element;
}

export async function prepareImages(root: HTMLElement): Promise<void> {
  await Promise.all(
    Array.from(root.querySelectorAll('img'), async (image) => {
      try {
        await image.decode();
      } catch {
        throw new Error(`Presentation image failed to decode: ${image.src}`);
      }
    }),
  );
  if (document.fonts) await document.fonts.ready;
}
