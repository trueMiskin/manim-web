import { Marked, type TokenizerAndRendererExtension } from 'marked';
import katex from 'katex';
import katexCss from 'katex/dist/katex.min.css?inline';

interface MathToken {
  type: string;
  raw: string;
  text: string;
  displayMode: boolean;
}

/** Find a delimiter without treating escaped dollar signs as the end of a formula. */
function closingDelimiter(source: string, delimiter: string, start: number): number {
  for (let index = start; index < source.length; index++) {
    if (source[index] === '\\') {
      index++;
    } else if (source.startsWith(delimiter, index)) {
      return index;
    }
  }
  return -1;
}

function inlineMath(source: string): MathToken | undefined {
  if (!source.startsWith('$')) return;
  const delimiter = source.startsWith('$$') ? '$$' : '$';
  const end = closingDelimiter(source, delimiter, delimiter.length);
  if (end < 0) return;
  const text = source.slice(delimiter.length, end);
  if (!text.trim() || text.includes('\n')) return;
  // Whitespace and adjacent digits keep ordinary currency expressions literal.
  if (delimiter === '$' && (/^\s|\s$/.test(text) || /^\d/.test(source.slice(end + 1)))) return;
  return {
    type: 'inlineMath',
    raw: source.slice(0, end + delimiter.length),
    text: text.trim(),
    displayMode: delimiter === '$$',
  };
}

function blockMath(source: string): MathToken | undefined {
  const opening = /^ {0,3}\$\$/.exec(source);
  if (!opening) return;
  const end = closingDelimiter(source, '$$', opening[0].length);
  if (end < 0) return;
  const trailing = /^[ \t]*(?:\n|$)/.exec(source.slice(end + 2));
  const text = source.slice(opening[0].length, end).trim();
  if (!trailing || !text) return;
  return {
    type: 'blockMath',
    raw: source.slice(0, end + 2 + trailing[0].length),
    text,
    displayMode: true,
  };
}

function mathExtension(level: 'block' | 'inline'): TokenizerAndRendererExtension {
  return {
    name: `${level}Math`,
    level,
    start: (source) => (level === 'block' ? source.search(/^ {0,3}\$\$/m) : source.indexOf('$')),
    tokenizer(source) {
      if (this.lexer.state.inRawBlock) return;
      return level === 'block' ? blockMath(source) : inlineMath(source);
    },
    renderer: (token) =>
      katex.renderToString(String(token.text), {
        displayMode: token.displayMode === true,
        output: 'htmlAndMathml',
        throwOnError: true,
        trust: false,
      }),
  };
}

// A dedicated instance leaves applications' global marked configuration intact.
const markdown = new Marked({ extensions: [mathExtension('block'), mathExtension('inline')] });

/** Render trusted slide Markdown, including inline and display math, synchronously. */
export function renderMarkdown(source: string): string {
  const html = markdown.parse(source, { async: false });
  if (html.includes('class="katex')) ensureMarkdownMathStyles();
  return html;
}

/** The bundled stylesheet contains local font assets; no CDN request is required. */
function ensureMarkdownMathStyles(): void {
  if (document.getElementById('manim-markdown-math-styles')) return;
  const style = document.createElement('style');
  style.id = 'manim-markdown-math-styles';
  style.textContent = katexCss;
  document.head.append(style);
}
