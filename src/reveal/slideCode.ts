import { Code, type CodeOptions } from '../mobjects/text/Code';
import type { SlidePlacement } from './slideLayout';
import type { SlideTheme } from './slideTheme';

/** Code typography and colors are independent of the slide's prose font. */
export type SlideCodeOptions = Omit<CodeOptions, 'code'> & SlidePlacement;

function validateNumber(key: string, value: number | undefined, allowZero = false): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0))
    throw new Error(
      `Code ${key} must be a ${allowZero ? 'nonnegative' : 'positive'} finite number.`,
    );
}

/** Validate authored code before preparing fonts, canvas resources, or layout. */
export function validateSlideCode(source: string, options: SlideCodeOptions): void {
  if (typeof source !== 'string') throw new Error('A code block needs a source string.');
  for (const key of ['fontSize', 'lineHeight', 'height'] as const)
    validateNumber(key, options[key]);
  for (const key of ['backgroundPadding', 'backgroundRadius'] as const)
    validateNumber(key, options[key], true);
  if (
    options.tabWidth !== undefined &&
    (!Number.isInteger(options.tabWidth) || options.tabWidth <= 0)
  )
    throw new Error('Code tabWidth must be a positive integer.');
  for (const key of ['language', 'fontFamily', 'fontUrl'] as const) {
    const value = options[key];
    if (value !== undefined && (typeof value !== 'string' || !value.trim()))
      throw new Error(`Code ${key} must be a nonempty string.`);
  }
}

/** @post result.getCode() === source */
export function createSlideCode(
  source: string,
  theme: SlideTheme,
  options: Omit<SlideCodeOptions, keyof SlidePlacement>,
): Code {
  const { text, muted, accent, secondary, background } = theme.colors;
  return new Code({
    ...options,
    code: source,
    fontSize: options.fontSize ?? theme.bodySize,
    lineNumbers: options.lineNumbers ?? true,
    copyButton: options.copyButton ?? true,
    colorScheme: options.colorScheme ?? {
      keyword: accent,
      string: secondary,
      comment: muted,
      number: secondary,
      function: accent,
      operator: text,
      punctuation: text,
      type: secondary,
      default: text,
      background,
      lineNumber: muted,
    },
  });
}
