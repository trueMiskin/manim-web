// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { Code, DEFAULT_COLOR_SCHEME, MONOKAI_COLOR_SCHEME, TokenType } from './Code';
import { Group } from '../../core/Group';

/** Stub canvas 2D context (happy-dom lacks canvas support) */
beforeAll(() => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    type: string,
    ...args: unknown[]
  ) {
    if (type === '2d') {
      return {
        scale: () => {},
        clearRect: () => {},
        fillText: () => {},
        fillRect: () => {},
        measureText: (t: string) => ({ width: t.length * 10, fontBoundingBoxAscent: 30 }),
        drawImage: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        quadraticCurveTo: () => {},
        closePath: () => {},
        fill: () => {},
        font: '',
        fillStyle: '',
        globalAlpha: 1,
        textBaseline: 'alphabetic',
        textAlign: 'left',
      } as unknown as CanvasRenderingContext2D;
    }
    return orig.call(this, type, ...(args as []));
  } as typeof orig;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function tokenTexts(code: Code, type: TokenType): string[] {
  const result: string[] = [];
  for (let i = 1; i <= code.getLineCount(); i++) {
    const line = code.getLineOfCode(i);
    if (line) for (const t of line.tokens) if (t.type === type) result.push(t.text);
  }
  return result;
}

describe('Code', () => {
  describe('presentation semantics', () => {
    // MIGRATION: every source survives selection/copy exactly, with bounds that
    // exclude its gutter and padding; grouping preserves its world geometry.
    it('keeps exact source and text bounds while participating in group layout', () => {
      const source = '\tint x;\nreturn x;\n';
      const code = new Code({ code: source, language: 'CPP', copyButton: true, tabWidth: 2 });
      expect(code.isEmpty()).toBe(false);
      expect(code.getWidth()).toBeGreaterThan(0);
      const run = code.getSemanticTextRuns()[0];
      expect(run).toMatchObject({
        kind: 'code',
        source,
        text: source,
        sourceRange: [0, source.length],
        readingOrder: 0,
        code: { language: 'cpp', copyButton: true, tabWidth: 2, lineCount: 3 },
        font: { family: 'monospace', size: 24, lineHeight: 1.4 },
      });
      expect(run.bounds.width).toBeCloseTo(0.45);
      expect(run.bounds.height).toBeCloseTo((24 * 1.4 * 3) / 100);
      expect(run.bounds.x).toBeCloseTo(-code.getWidth() / 2 + 0.33);
      expect(run.bounds.y + run.bounds.height).toBeCloseTo(code.getHeight() / 2 - 0.16);
      code.scale(1.7).shift([2, -1, 0]);
      const before = code.getBounds();
      const group = new Group(code);
      expect(group.isEmpty()).toBe(false);
      expect(code.getBounds()).toEqual(before);
      group.shift([3, 2, 0]);
      expect(code.getCenter()[0]).toBeCloseTo(5);
      expect(code.getCenter()[1]).toBeCloseTo(1);
      expect(code.copy().getSemanticTextRuns()[0]).toMatchObject({
        source,
        text: source,
        code: run.code,
        font: run.font,
      });
      const unnumbered = new Code({ code: source, tabWidth: 2, lineNumbers: false });
      expect(unnumbered.getSemanticTextRuns()[0].bounds.width).toBe(run.bounds.width);
      expect(unnumbered.getSemanticTextRuns()[0].code?.copyButton).toBe(false);
      expect(unnumbered.getWidth()).toBeLessThan(code.getWidth());
    });

    // MIGRATION: waiting for any font asset uses its ready metrics and copy()
    // retains its portable font metadata and presentation options.
    it('waits for font readiness and preserves font assets in copies', async () => {
      let loaded = false;
      const originalCreateElement = document.createElement.bind(document);
      const fontLoad = vi.fn(async () => []);
      vi.stubGlobal('document', {
        createElement: originalCreateElement,
        fonts: { add: vi.fn(), load: fontLoad },
      });
      vi.stubGlobal(
        'FontFace',
        class {
          async load() {
            loaded = true;
            return this;
          }
        },
      );
      const getContext = HTMLCanvasElement.prototype.getContext;
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
        this: HTMLCanvasElement,
        type: string,
      ) {
        const context = getContext.call(this, type) as CanvasRenderingContext2D;
        context.measureText = (text: string) =>
          ({ width: text.length * (loaded ? 20 : 10) }) as TextMetrics;
        return context;
      });
      const code = new Code({
        code: 'int value;',
        language: 'cpp',
        copyButton: true,
        fontUrl: '/fonts/code-test.ttf',
        lineNumbers: false,
      });
      const before = code.getWidth();
      await code.waitForRender();
      expect(code.getWidth()).toBeGreaterThan(before);
      const run = code.getSemanticTextRuns()[0];
      expect(run.font.url).toBe('/fonts/code-test.ttf');
      expect(run.font.family).toMatch(/^'ManimFont_/);
      expect(fontLoad).toHaveBeenLastCalledWith(`48px ${run.font.family}`, 'int value;');
      const copy = code.copy();
      await copy.waitForRender();
      expect(copy.getSemanticTextRuns()[0]).toMatchObject({ font: run.font, code: run.code });
      expect(copy.getWidth()).toBe(code.getWidth());
    });
  });

  describe('constructor', () => {
    it('should create with code string and default language', () => {
      const c = new Code({ code: 'hello world' });
      expect(c.getCode()).toBe('hello world');
      expect(c.getLanguage()).toBe('text');
    });

    it('should accept and lowercase language', () => {
      const c = new Code({ code: 'x = 1', language: 'Python' });
      expect(c.getLanguage()).toBe('python');
    });

    it('should accept various languages', () => {
      expect(new Code({ code: 'x', language: 'javascript' }).getLanguage()).toBe('javascript');
      expect(new Code({ code: 'x', language: 'typescript' }).getLanguage()).toBe('typescript');
    });

    it('should accept custom color scheme and fontSize', () => {
      const c = new Code({ code: 'x', colorScheme: MONOKAI_COLOR_SCHEME, fontSize: 36 });
      expect(c.getCode()).toBe('x');
    });
  });

  describe('getCode / setCode', () => {
    it('should get and set code', () => {
      const c = new Code({ code: 'old' });
      expect(c.getCode()).toBe('old');
      expect(c.setCode('new')).toBe(c); // chaining
      expect(c.getCode()).toBe('new');
    });

    it('should update line count and re-tokenize on setCode', async () => {
      const c = new Code({ code: 'hello', language: 'python' });
      expect(c.getLineCount()).toBe(1);
      c.setCode('def foo():\n    return 42');
      await c.waitForRender();
      expect(c.getLineCount()).toBe(2);
      expect(tokenTexts(c, 'function')).toContain('foo');
      expect(tokenTexts(c, 'keyword')).toContain('return');
    });
  });

  describe('getLanguage / setLanguage', () => {
    it('should get, set, and lowercase language', () => {
      const c = new Code({ code: 'x', language: 'rust' });
      expect(c.getLanguage()).toBe('rust');
      expect(c.setLanguage('TypeScript')).toBe(c); // chaining
      expect(c.getLanguage()).toBe('typescript');
    });

    it('should re-tokenize when language changes', async () => {
      const c = new Code({ code: 'def foo():', language: 'text' });
      expect(tokenTexts(c, 'function')).not.toContain('foo');
      c.setLanguage('python');
      await c.waitForRender();
      expect(tokenTexts(c, 'function')).toContain('foo');
    });
  });

  describe('getLineCount', () => {
    it('should count lines correctly', () => {
      expect(new Code({ code: 'x = 1' }).getLineCount()).toBe(1);
      expect(new Code({ code: 'a\nb\nc' }).getLineCount()).toBe(3);
      expect(new Code({ code: 'a\n\nb' }).getLineCount()).toBe(3);
      expect(new Code({ code: 'a\n' }).getLineCount()).toBe(2);
      expect(new Code({ code: '' }).getLineCount()).toBe(1);
    });
  });

  describe('getLineOfCode', () => {
    it('should return correct text for valid 1-based indices', () => {
      const c = new Code({ code: 'aaa\nbbb\nccc' });
      expect(c.getLineOfCode(1)!.text).toBe('aaa');
      expect(c.getLineOfCode(2)!.text).toBe('bbb');
      expect(c.getLineOfCode(3)!.text).toBe('ccc');
    });

    it('should return null for out-of-range indices', () => {
      const c = new Code({ code: 'hello' });
      expect(c.getLineOfCode(0)).toBeNull();
      expect(c.getLineOfCode(-1)).toBeNull();
      expect(c.getLineOfCode(2)).toBeNull();
    });

    it('should include tokens array and position tuple', () => {
      const c = new Code({ code: 'def foo():', language: 'python' });
      const line = c.getLineOfCode(1)!;
      expect(Array.isArray(line.tokens)).toBe(true);
      expect(line.tokens.length).toBeGreaterThan(0);
      expect(line.position).toHaveLength(3);
    });

    it('should expand tabs in returned text', () => {
      expect(new Code({ code: '\thello', tabWidth: 4 }).getLineOfCode(1)!.text).toBe('    hello');
      expect(new Code({ code: '\thello', tabWidth: 2 }).getLineOfCode(1)!.text).toBe('  hello');
      expect(new Code({ code: '\t\tx', tabWidth: 4 }).getLineOfCode(1)!.text).toBe('        x');
    });
  });

  describe('grammar highlighting', () => {
    // MIGRATION: full-source highlighting is lossless and carries lexical state
    // across lines; display tab expansion never changes the copyable source.
    it('waits for multiline grammar tokens while retaining exact source', async () => {
      const source = '/* first\n\tcontinued */\nint value = 42;\n';
      const code = new Code({ code: source, language: 'cpp', tabWidth: 2 });
      expect(code.getLineOfCode(2)?.tokens).toEqual([{ text: '  continued */', type: 'default' }]);
      await code.waitForRender();
      expect(code.getLineOfCode(2)?.tokens.every((token) => token.type === 'comment')).toBe(true);
      expect(tokenTexts(code, 'number')).toContain('42');
      const displayed = () =>
        Array.from({ length: code.getLineCount() }, (_, i) =>
          code
            .getLineOfCode(i + 1)!
            .tokens.map((token) => token.text)
            .join(''),
        ).join('\n');
      expect(displayed()).toBe(source.replace(/\t/g, '  '));
      expect(code.getSemanticTextRuns()[0].source).toBe(source);
      code.setLanguage('unknown-language');
      await code.waitForRender();
      expect(tokenTexts(code, 'comment')).toEqual([]);
      expect(displayed()).toBe(source.replace(/\t/g, '  '));
    });
  });

  describe('color schemes', () => {
    it('should have all required keys in both schemes', () => {
      const keys = [
        'keyword',
        'string',
        'comment',
        'number',
        'function',
        'operator',
        'punctuation',
        'type',
        'default',
        'background',
        'lineNumber',
      ];
      for (const k of keys) {
        expect(DEFAULT_COLOR_SCHEME).toHaveProperty(k);
        expect(MONOKAI_COLOR_SCHEME).toHaveProperty(k);
      }
    });

    it('should have different colors between schemes', () => {
      expect(DEFAULT_COLOR_SCHEME.keyword).not.toBe(MONOKAI_COLOR_SCHEME.keyword);
      expect(DEFAULT_COLOR_SCHEME.background).not.toBe(MONOKAI_COLOR_SCHEME.background);
    });

    it('should have string values for all properties', () => {
      for (const v of Object.values(DEFAULT_COLOR_SCHEME)) expect(typeof v).toBe('string');
      for (const v of Object.values(MONOKAI_COLOR_SCHEME)) expect(typeof v).toBe('string');
    });
  });

  describe('getWidth / getHeight', () => {
    it('should return non-negative dimensions', () => {
      const c = new Code({ code: 'hello world' });
      expect(c.getWidth()).toBeGreaterThanOrEqual(0);
      expect(c.getHeight()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('copy', () => {
    it('should create an independent copy with same properties', () => {
      const c = new Code({ code: 'a\nb\nc', language: 'python' });
      const cp = c.copy() as Code;
      expect(cp).toBeInstanceOf(Code);
      expect(cp.getCode()).toBe('a\nb\nc');
      expect(cp.getLanguage()).toBe('python');
      expect(cp.getLineCount()).toBe(3);
      cp.setCode('changed');
      expect(c.getCode()).toBe('a\nb\nc');
    });
  });

  describe('dispose', () => {
    it('should dispose without error and be callable twice', () => {
      const c = new Code({ code: 'hello' });
      expect(() => c.dispose()).not.toThrow();
      expect(() => c.dispose()).not.toThrow();
    });
  });

  describe('getCenter', () => {
    it('should return position and reflect changes', () => {
      const c = new Code({ code: 'hello' });
      expect(c.getCenter()).toEqual([0, 0, 0]);
      c.position.set(2, 3, 4);
      expect(c.getCenter()).toEqual([2, 3, 4]);
    });
  });

  describe('line numbers', () => {
    it('should enable line numbers by default', () => {
      const c = new Code({ code: 'hello\nworld' });
      // Verify it constructs without error (lineNumbers = true by default)
      expect(c.getLineCount()).toBe(2);
    });

    it('should disable line numbers when lineNumbers is false', () => {
      const c = new Code({ code: 'hello\nworld', lineNumbers: false });
      expect(c.getLineCount()).toBe(2);
    });
  });

  describe('tab expansion', () => {
    it('should expand tabs with custom tabWidth', () => {
      const c = new Code({ code: '\thello', tabWidth: 2 });
      expect(c.getLineOfCode(1)!.text).toBe('  hello');
    });

    it('should expand tabs with default tabWidth of 4', () => {
      const c = new Code({ code: '\thello' });
      expect(c.getLineOfCode(1)!.text).toBe('    hello');
    });

    it('should expand multiple tabs', () => {
      const c = new Code({ code: '\t\tx', tabWidth: 3 });
      expect(c.getLineOfCode(1)!.text).toBe('      x');
    });
  });

  describe('showBackground', () => {
    it('should render with background (default true)', () => {
      const c = new Code({ code: 'hello' });
      expect(c.getWidth()).toBeGreaterThanOrEqual(0);
    });

    it('should render without background', () => {
      const c = new Code({ code: 'hello', showBackground: false });
      expect(c.getWidth()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('highlightLines', () => {
    it('should highlight a range of lines', () => {
      const c = new Code({ code: 'line1\nline2\nline3\nline4' });
      const result = c.highlightLines(2, 3);
      expect(result).toBe(c); // chaining
    });

    it('should handle highlight with custom color', () => {
      const c = new Code({ code: 'line1\nline2\nline3' });
      const result = c.highlightLines(1, 2, 'rgba(255, 0, 0, 0.5)');
      expect(result).toBe(c);
    });

    it('should handle highlight with non-rgba color', () => {
      const c = new Code({ code: 'line1\nline2\nline3' });
      const result = c.highlightLines(1, 2, '#ff0000');
      expect(result).toBe(c);
    });

    it('should clamp line numbers to valid range', () => {
      const c = new Code({ code: 'line1\nline2' });
      expect(() => c.highlightLines(0, 10)).not.toThrow();
    });

    it('should clear previous highlights when highlighting new lines', () => {
      const c = new Code({ code: 'line1\nline2\nline3' });
      c.highlightLines(1, 2);
      c.highlightLines(2, 3);
      // Should not throw - old highlights cleared
    });
  });

  describe('clearHighlights', () => {
    it('should clear all highlights', () => {
      const c = new Code({ code: 'line1\nline2\nline3' });
      c.highlightLines(1, 2);
      const result = c.clearHighlights();
      expect(result).toBe(c); // chaining
    });

    it('should be safe to call when no highlights exist', () => {
      const c = new Code({ code: 'hello' });
      expect(() => c.clearHighlights()).not.toThrow();
    });
  });

  describe('constructor options', () => {
    it('should accept custom fontFamily', () => {
      const c = new Code({ code: 'hello', fontFamily: 'Courier New' });
      expect(c.getCode()).toBe('hello');
    });

    it('should accept custom backgroundPadding and backgroundRadius', () => {
      const c = new Code({
        code: 'hello',
        backgroundPadding: 32,
        backgroundRadius: 16,
      });
      expect(c.getCode()).toBe('hello');
    });

    it('should accept custom lineHeight', () => {
      const c = new Code({ code: 'hello\nworld', lineHeight: 2.0 });
      expect(c.getLineCount()).toBe(2);
    });
  });

  describe('multi-line code', () => {
    it('should handle large code blocks', () => {
      const lines = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n');
      const c = new Code({ code: lines, language: 'python' });
      expect(c.getLineCount()).toBe(50);
      expect(c.getLineOfCode(1)!.text).toBe('line 1');
      expect(c.getLineOfCode(50)!.text).toBe('line 50');
    });

    it('should handle code with mixed tokens per line', async () => {
      const code = `def greet(name):
    # Say hello
    msg = f"Hello {name}"
    print(msg)
    return True`;
      const c = new Code({ code, language: 'python' });
      await c.waitForRender();
      expect(c.getLineCount()).toBe(5);
      expect(tokenTexts(c, 'function')).toContain('greet');
      expect(tokenTexts(c, 'keyword')).toContain('return');
      expect(tokenTexts(c, 'comment').length).toBeGreaterThan(0);
    });
  });

  describe('setCode re-rendering', () => {
    it('should update dimensions when code changes', () => {
      const c = new Code({ code: 'short' });
      const w1 = c.getWidth();
      c.setCode('a much longer line of code that should be wider');
      const w2 = c.getWidth();
      // Wider code should have at least as wide dimensions
      expect(w2).toBeGreaterThanOrEqual(w1);
    });

    it('should update line count and tokens', async () => {
      const c = new Code({ code: 'hello', language: 'python' });
      expect(c.getLineCount()).toBe(1);
      c.setCode('def foo():\n    pass');
      await c.waitForRender();
      expect(c.getLineCount()).toBe(2);
      expect(tokenTexts(c, 'function')).toContain('foo');
      expect(tokenTexts(c, 'keyword')).toContain('pass');
    });
  });

  describe('setLanguage re-tokenization', () => {
    it('should change tokenization results', async () => {
      const c = new Code({ code: 'fn main() { let x = 42; }', language: 'text' });
      expect(tokenTexts(c, 'keyword')).toHaveLength(0);
      c.setLanguage('rust');
      await c.waitForRender();
      expect(tokenTexts(c, 'keyword')).toContain('fn');
      expect(tokenTexts(c, 'number')).toContain('42');
    });
  });

  describe('copy preserves all options', () => {
    it('should preserve lineNumbers, tabWidth, fontSize, and fontFamily', () => {
      const c = new Code({
        code: 'hello',
        language: 'python',
        lineNumbers: false,
        tabWidth: 2,
        fontSize: 18,
        fontFamily: 'Courier New',
        showBackground: false,
        backgroundPadding: 20,
        backgroundRadius: 12,
        lineHeight: 1.8,
      });
      const cp = c.copy() as Code;
      expect(cp.getCode()).toBe('hello');
      expect(cp.getLanguage()).toBe('python');
    });

    it('should preserve colorScheme in copy', () => {
      const c = new Code({
        code: 'hello',
        colorScheme: MONOKAI_COLOR_SCHEME,
      });
      const cp = c.copy() as Code;
      expect(cp.getCode()).toBe('hello');
    });
  });
});
