import type { ProjectedTextRun } from './semantic';

function selectSource(source: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(source);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Preserve literal tabs while matching Code's fixed-width tab expansion. */
function appendSource(
  source: HTMLElement,
  text: string,
  tabWidth: number,
  spaceWidth: number,
): void {
  const parts = text.split('\t');
  for (const [index, part] of parts.entries()) {
    if (index > 0) {
      const tab = document.createElement('span');
      tab.textContent = '\t';
      Object.assign(tab.style, { display: 'inline-block', width: `${spaceWidth * tabWidth}px` });
      source.append(tab);
    }
    source.append(document.createTextNode(part));
  }
}

function preserveSelectedSource(source: HTMLElement): void {
  source.addEventListener('copy', (event) => {
    const selection = window.getSelection();
    if (!event.clipboardData || selection?.rangeCount !== 1) return;
    const range = selection.getRangeAt(0);
    if (!source.contains(range.startContainer) || !source.contains(range.endContainer)) return;
    event.clipboardData.setData('text/plain', range.toString());
    event.preventDefault();
  });
  source.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      event.stopPropagation();
      selectSource(source);
    }
  });
}

function copyControl(source: HTMLElement, text: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'manim-code-copy';
  button.textContent = 'Copy';
  button.setAttribute('aria-label', 'Copy code');
  button.setAttribute('aria-live', 'polite');
  button.addEventListener('keydown', (event) => event.stopPropagation());
  button.addEventListener('keyup', (event) => event.stopPropagation());
  button.addEventListener('click', async (event) => {
    event.stopPropagation();
    button.disabled = true;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable.');
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copied';
      button.title = 'Code copied to the clipboard.';
    } catch {
      source.focus({ preventScroll: true });
      selectSource(source);
      button.textContent = 'Select & copy';
      button.title = 'Press Ctrl+C or ⌘C to copy the selected code.';
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

/**
 * Keep the rendered syntax, background and gutter; expose only source as selectable HTML.
 * @post result.querySelector('pre')?.textContent === run.text
 */
export function createCodeOverlay(
  run: ProjectedTextRun,
  context: CanvasRenderingContext2D | null,
): HTMLElement {
  const metadata = run.code;
  const lineCount = metadata?.lineCount ?? run.text.split(/\r\n|\r|\n/).length;
  const tabWidth = metadata?.tabWidth ?? 4;
  const lineHeight = run.height / lineCount;
  const fontSize = lineHeight / run.font.lineHeight;
  const font = `${run.font.style} ${run.font.weight} ${fontSize}px ${run.font.family}`;
  if (context) context.font = font;
  const lines = run.text.replace(/\t/g, ' '.repeat(tabWidth)).split(/\r\n|\r|\n/);
  const naturalWidth = Math.max(
    ...lines.map((line) => context?.measureText(line).width ?? run.width),
  );
  const horizontalScale = naturalWidth > 0 ? run.width / naturalWidth : 1;
  const overlay = document.createElement('div');
  overlay.className = 'manim-code-overlay';
  overlay.dataset.semanticId = run.id;
  overlay.dataset.kind = 'code';
  Object.assign(overlay.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${run.width}px`,
    height: `${run.height}px`,
    transformOrigin: '0 0',
    transform: `matrix(${run.transform.join(',')})`,
    opacity: `${run.opacity}`,
    pointerEvents: 'auto',
  });
  const source = document.createElement('pre');
  source.className = 'manim-code-source';
  source.tabIndex = 0;
  source.setAttribute('aria-label', `${metadata?.language ?? ''} code`.trim());
  Object.assign(source.style, {
    margin: '0',
    padding: '0',
    border: 'none',
    background: 'transparent',
    boxShadow: 'none',
    color: 'transparent',
    font,
    lineHeight: `${lineHeight}px`,
    letterSpacing: '0',
    textAlign: 'left',
    textTransform: 'none',
    whiteSpace: 'pre',
    overflow: 'visible',
    width: `${naturalWidth || run.width}px`,
    maxWidth: 'none',
    height: `${run.height}px`,
    maxHeight: 'none',
    transformOrigin: '0 0',
    transform: `scaleX(${horizontalScale})`,
    userSelect: 'text',
  });
  appendSource(source, run.text, tabWidth, context?.measureText(' ').width ?? fontSize * 0.6);
  preserveSelectedSource(source);
  overlay.append(source);
  if (metadata?.copyButton) overlay.append(copyControl(source, run.source));
  return overlay;
}
