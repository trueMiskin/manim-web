// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { marked } from 'marked';
import { markdownSlide } from './authoring';
import { renderStatic } from './content';

describe('Markdown slide math', () => {
  // MIGRATION: math has identical semantic markup in screen and print output;
  // math extensions never interpret escaped dollars, code or HTML attributes.
  it('renders inline and display math alongside Markdown without altering literal content', () => {
    const slide = markdownSlide(
      'math',
      String.raw`# A useful rule

Choose **a step** $\eta > 0$ and compare $x_i$ with $x_{i+1}$.

$$
\sum_{i=1}^{n} x_i = \frac{n(n+1)}{2}
$$

- The price is \$5 and \$10.
- Literal syntax: \`$x$\`.

<span data-note="$unchanged$">Trusted HTML</span>

Use <code>$htmlCode$</code> verbatim.

\`\`\`tex
$literal$ and $$literal$$
\`\`\`
`.replaceAll('\\`', '`'),
    );
    const screen = renderStatic(slide);
    const print = renderStatic(slide, true);
    expect(print.innerHTML).toBe(screen.innerHTML);
    expect(screen.querySelectorAll('.katex')).toHaveLength(4);
    expect(screen.querySelectorAll('.katex-display')).toHaveLength(1);
    expect(screen.querySelectorAll('math')).toHaveLength(4);
    expect(screen.querySelector('annotation')?.textContent).toBe('\\eta > 0');
    expect(screen.querySelector('strong')?.textContent).toBe('a step');
    expect(screen.querySelector('li')?.textContent).toBe('The price is $5 and $10.');
    expect(screen.querySelector('li code')?.textContent).toBe('$x$');
    expect(screen.querySelector('pre code')?.textContent).toContain('$literal$ and $$literal$$');
    expect(screen.querySelector('[data-note]')?.getAttribute('data-note')).toBe('$unchanged$');
    expect(screen.querySelector('p code')?.textContent).toBe('$htmlCode$');
    expect(document.querySelectorAll('#manim-markdown-math-styles')).toHaveLength(1);
    expect(marked.parse('$x$', { async: false })).toBe('<p>$x$</p>\n');
  });

  // MIGRATION: unmatched/currency delimiters stay literal, escaped delimiters
  // belong to the equation, and malformed recognized math reports an author error.
  it('preserves nonmath dollars and rejects invalid recognized math', () => {
    const literal = renderStatic(
      markdownSlide('literal', 'A $5 price and $10 price; unfinished $x.'),
    );
    expect(literal.querySelector('.katex')).toBeNull();
    expect(literal.textContent).toContain('A $5 price and $10 price; unfinished $x.');
    const escaped = renderStatic(markdownSlide('escaped', String.raw`The amount is $\$5 + x$.`));
    expect(escaped.querySelector('annotation')?.textContent).toBe('\\$5 + x');
    expect(() => renderStatic(markdownSlide('invalid', String.raw`$\unknowncommand{x}$`))).toThrow(
      /Undefined control sequence/,
    );
  });
});
