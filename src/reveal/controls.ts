import type { PresentationDefinition } from './types';
import { resolvePresentationPalette } from './palettes';

/** Shared playback actions and the deck's author-defined color palettes. */
export function presentationControls(
  definition: PresentationDefinition,
  actions: ReadonlyArray<readonly [string, () => void]>,
  changePalette: (name: string) => void,
): { element: HTMLElement; palette?: HTMLSelectElement } {
  const element = document.createElement('nav');
  element.className = 'manim-controls';
  element.setAttribute('aria-label', 'Presentation controls');
  for (const [label, action] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', action);
    element.append(button);
  }
  const names = Object.keys(definition.palettes ?? {});
  if (names.length < 2) return { element };
  const label = document.createElement('label');
  label.textContent = 'Colors ';
  const palette = document.createElement('select');
  palette.setAttribute('aria-label', 'Color palette');
  for (const name of names) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    palette.append(option);
  }
  palette.value = resolvePresentationPalette(definition)!.name;
  palette.addEventListener('change', () => changePalette(palette.value));
  label.append(palette);
  element.append(label);
  return { element, palette };
}
