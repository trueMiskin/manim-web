import katexCss from 'katex/dist/katex.min.css?inline';

/**
 * Keep standalone math styles behind a private library entry so shared runtimes
 * can use their external stylesheet without bundling these fonts again.
 * @post result === katexCss
 */
export function getMarkdownMathStyles(): string {
  return katexCss;
}
