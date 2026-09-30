// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCodeOverlay } from './codeSemantic';
import type { ProjectedTextRun } from './semantic';

const source = 'if (x < 3) {\n\tprint("<b>&</b>");\n\n}\n';

function run(): ProjectedTextRun {
  return {
    id: 'code:source',
    mobjectId: 'code',
    kind: 'code',
    code: { language: 'cpp', copyButton: true, tabWidth: 4, lineCount: 5 },
    source,
    text: source,
    sourceRange: [0, source.length],
    graphemeRange: [0, source.length],
    readingOrder: 0,
    font: {
      family: 'monospace',
      size: 24,
      weight: 'normal',
      style: 'normal',
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    color: '#ffffff',
    opacity: 1,
    visible: true,
    bounds: { x: 0, y: 0, width: 4, height: 2 },
    matrixWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    width: 400,
    height: 200,
    transform: [1, 0, 0, 1, 20, 30],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

describe('code selection and copying', () => {
  // MIGRATION: ∀ source, code overlays render it as inert text and Copy writes exactly source.
  it('preserves source characters without interpreting markup or copying controls', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const overlay = createCodeOverlay(run(), null);
    document.body.append(overlay);
    expect(overlay.querySelector('pre')?.textContent).toBe(source);
    expect(overlay.querySelector('b')).toBeNull();
    const button = overlay.querySelector('button')!;
    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe('Copied'));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(source);
  });

  // MIGRATION: ∀ clipboard failures, expose selectable source without claiming success.
  it('selects the source for manual copying when clipboard access fails', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Permission denied')) },
    });
    const overlay = createCodeOverlay(run(), null);
    document.body.append(overlay);
    const button = overlay.querySelector('button')!;
    button.click();
    await vi.waitFor(() => expect(button.textContent).toBe('Select & copy'));
    expect(window.getSelection()?.getRangeAt(0).toString()).toBe(source);
    expect(button.disabled).toBe(false);
    const clipboard = new DataTransfer();
    overlay
      .querySelector('pre')!
      .dispatchEvent(new ClipboardEvent('copy', { clipboardData: clipboard, cancelable: true }));
    expect(clipboard.getData('text/plain')).toBe(source);
  });
});
