/**
 * Tex - Alias for MathTex for Manim compatibility
 *
 * In the original Manim library, Tex is used for LaTeX rendering.
 * This alias provides the same interface for users familiar with Manim.
 *
 * Uses SVG path-based rendering (MathTex), matching Python Manim's behavior.
 */

import { MathTex, MathTexOptions, isMathTexPart } from './MathTex';
import { splitTexGroups } from './TextSemantics';

/**
 * Options for creating a Tex object
 * (Same as MathTexOptions)
 */
export type TexOptions = MathTexOptions;

/**
 * Tex - LaTeX rendering for manimweb
 *
 * This is an alias for MathTex to provide Manim API compatibility.
 * Use this class when porting code from the original Manim library.
 *
 * @example
 * ```typescript
 * // Create a formula (Manim-style API)
 * const formula = new Tex({ latex: 'x^2 + y^2 = r^2' });
 *
 * // Create with options
 * const colored = new Tex({
 *   latex: '\\frac{d}{dx}\\sin(x) = \\cos(x)',
 *   color: '#ffff00',
 * });
 * ```
 */
export class Tex extends MathTex {
  /** Original unwrapped latex, used by _copy to avoid double-wrapping */
  private _originalLatex: string | string[];

  constructor(options: TexOptions, render = true) {
    // Wrap in \text{...} for text-mode rendering (upright serif, proper word spacing)
    // Split on \\ to handle line breaks, wrap each segment separately
    const wrap = (part: string) => {
      const lines = part.split('\\\\');
      return lines.map((line) => `\\text{${lines.length > 1 ? line.trim() : line}}`).join(' \\\\ ');
    };
    const parts = Array.isArray(options.latex) ? options.latex : splitTexGroups(options.latex);
    const wrapped = parts.map(wrap);
    super(
      {
        ...options,
        latex: wrapped.length > 1 ? wrapped : wrapped[0],
        matchingKeys: options.matchingKeys ?? parts,
      },
      render,
    );
    this._originalLatex = options.latex;
    this._sourceLatex = Array.isArray(options.latex) ? options.latex.join('') : options.latex;
  }

  override copy(): Tex {
    const copy = new Tex(
      {
        latex: this._originalLatex,
        color: this._color,
        fontSize: this._fontSize,
        displayMode: this._displayMode,
        position: [this.position.x, this.position.y, this.position.z],
        strokeWidth: this._svgStrokeWidth,
        fillOpacity: this._svgFillOpacity,
        height: this._targetHeight,
        macros: this._macros,
        matchingKeys: this._matchingKeys,
      },
      false,
    );
    this._copyBaseAttributesInto(copy, { copyChildren: true });
    copy._parts = this._isMultiPart
      ? copy.children.filter(isMathTexPart)
      : [];
    if (this.children.length === 0 && this._renderPromise) {
      copy._renderPromise = this.waitForRender().then(() => {
        for (const child of this.children) copy.add(child.copy());
        copy._parts = this._isMultiPart
          ? copy.children.filter(isMathTexPart)
          : [];
      });
    }
    return copy;
  }
}
