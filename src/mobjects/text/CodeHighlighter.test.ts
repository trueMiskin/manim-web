import { describe, expect, it } from 'vitest';
import { tokenizeCode } from './CodeHighlighter';
import type { Token } from './CodeHighlighting';

const sourceOf = (lines: Token[][]) =>
  lines.map((line) => line.map(({ text }) => text).join('')).join('\n');

describe('code grammar adapter', () => {
  // MIGRATION: every supported/unknown language and alias preserves the source
  // exactly, including tabs, CRLF, blank lines, Unicode and final line separators.
  it('preserves source while resolving aliases and keeping unknown languages plain', async () => {
    const coldSource =
      'return value * 2; // A long line should shrink without wrapping the source.';
    expect(sourceOf(await tokenizeCode(coldSource, 'cpp'))).toBe(coldSource);
    const source = '\t/* žluťoučký */\r\n\nconst value = "😀";\n';
    const languages = ['c', 'cpp', 'python', 'javascript', 'typescript', 'java', 'rust', 'go'];
    const supported = await Promise.all(
      languages.map((language) => tokenizeCode(source, language)),
    );
    for (const tokens of supported) {
      expect(sourceOf(tokens)).toBe(source);
      expect(tokens[1]).toEqual([]);
      expect(tokens.at(-1)).toEqual([]);
    }
    expect(await tokenizeCode(source, ' C++ ')).toEqual(supported[1]);
    expect(await tokenizeCode(source, 'js')).toEqual(supported[3]);
    expect(await tokenizeCode(source, 'ts')).toEqual(supported[4]);
    expect(await tokenizeCode(source, 'py')).toEqual(supported[2]);
    for (const language of ['text', 'unknown-language', 'constructor']) {
      const tokens = await tokenizeCode(source, language);
      expect(sourceOf(tokens)).toBe(source);
      expect(tokens.flat().every(({ type }) => type === 'default')).toBe(true);
    }
    expect(await tokenizeCode('', 'cpp')).toEqual([[]]);
  });

  // MIGRATION: grammar state crosses lines, and a token's most specific scope
  // determines its category independently of enclosing function/string contexts.
  it('carries multiline grammar state without coloring function contents as names', async () => {
    const source = '/* start\n\tcontinued */\nint f() { return call("return fake(42)", 7); }\n';
    const tokens = await tokenizeCode(source, 'cpp');
    expect(tokens[1]).toEqual([{ type: 'comment', text: '\tcontinued */' }]);
    expect(tokens[2]).toContainEqual({ type: 'function', text: 'f' });
    expect(tokens[2]).toContainEqual({ type: 'function', text: 'call' });
    expect(tokens[2]).toContainEqual({ type: 'string', text: '"return fake(42)"' });
    expect(tokens[2]).toContainEqual({ type: 'keyword', text: 'return' });
    expect(tokens[2]).toContainEqual({ type: 'number', text: '7' });
    expect(sourceOf(tokens)).toBe(source);

    const python = await tokenizeCode('def f():\n\treturn """first\nsecond"""\n', 'python');
    expect(python[2]).toEqual([{ type: 'string', text: 'second"""' }]);
  });
});
