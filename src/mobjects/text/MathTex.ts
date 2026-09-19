/**
 * MathTex - Vector-based LaTeX rendering using SVG paths (default).
 *
 * Unlike MathTexImage (which rasterizes LaTeX to a canvas texture), MathTex
 * produces real VMobject paths from MathJax SVG output. This enables
 * path-based animations like Create (stroke-draw reveal), DrawBorderThenFill,
 * and point-morphing Transform.
 *
 * This is the default LaTeX renderer, matching Python Manim's behavior.
 *
 * Uses renderLatexToSVG() -> svgToVMobjects() pipeline.
 */

import { VGroup } from '../../core/VGroup';
import { VMobject } from '../../core/VMobject';
import type { Mobject, MobjectStyle, Vector3Tuple } from '../../core/Mobject';
import { WHITE } from '../../constants/colors';
import { DEFAULT_FONT_SIZE_IN_WORLD_SPACE, DEFAULT_FONT_SIZE_PT } from '../../constants/fontRender';
import typia from 'typia';
import { renderLatexToSVG } from './MathJaxRenderer';
import { logger } from '../../utils/logger';
import * as THREE from 'three';
import { semanticOpacity, type SemanticTextRun } from './TextSemantics';
import { resolveMathTexParts, type MathTexNamedPart } from './MathTexNamedParts';

export type { MathTexNamedPart } from './MathTexNamedParts';

/** MathJax SVG uses ~1000 font units per em. */
const MATHJAX_SVG_UNITS_PER_EM = 1000;

export interface MathTexOptions {
  /** LaTeX string or semantic parts with optional stable keys and colors. */
  latex: string | Array<string | MathTexNamedPart>;
  /** Color as CSS color string. Default: WHITE ('#ffffff') */
  color?: string;
  /** Scale factor (1 = standard math size). Default: 1 */
  fontSize?: number;
  /** Use display mode (block) vs inline mode. Default: true */
  displayMode?: boolean;
  /** Position in 3D space. Default: [0,0,0] */
  position?: Vector3Tuple;
  /** Stroke width for glyph outlines. Default: 0 */
  strokeWidth?: number;
  /** Fill opacity for glyph interiors. Default: 1 */
  fillOpacity?: number;
  /** Explicit target height in world units. Overrides fontSize scaling. */
  height?: number;
  /** Custom LaTeX macros as { name: expansion }. */
  macros?: Record<string, string>;
  /** Explicit identities for repeated matching parts, in source order. */
  matchingKeys?: string[];
}

export class MathTex extends VGroup {
  protected _latex: string;
  protected _fontSize: number;
  protected _displayMode: boolean;
  protected _svgStrokeWidth: number;
  protected _svgFillOpacity: number;
  protected _targetHeight: number | undefined;
  protected _macros: Record<string, string> | undefined;
  protected _svgViewBoxWidth: number = 1000;

  /** Whether this is a multi-part MathTex (created from string[]) */
  protected _isMultiPart: boolean = false;
  /** Child part groups (only when _isMultiPart is true) */
  protected _parts: VGroup[] = [];
  /** Promise that resolves when rendering is complete */
  protected _renderPromise: Promise<void> | null = null;
  /** Error from rendering, if any */
  protected _renderError: Error | null = null;
  protected _sourceLatex: string;
  protected _partLatex: string[];
  protected _matchingKeys: string[];
  protected _partColors: Array<string | null>;

  constructor(options: MathTexOptions, render = true) {
    super();

    // Validate options via typia and read required latex field
    typia.assert<MathTexOptions>(options);
    const latex = options.latex;
    const parts = resolveMathTexParts(latex, options.matchingKeys);
    this._sourceLatex = parts.sourceLatex;
    this._partLatex = parts.partLatex;
    this._matchingKeys = parts.matchingKeys;
    this._partColors = parts.partColors;

    const {
      color = WHITE,
      fontSize = DEFAULT_FONT_SIZE_PT,
      displayMode = true,
      position = [0, 0, 0],
      strokeWidth = 0.00001, // Workaround for https://github.com/maloyan/manim-web/issues/258
      fillOpacity = 1,
      height,
      macros,
    } = options;

    this._fontSize = fontSize;
    this._displayMode = displayMode;
    this.setColor(color);
    this._svgStrokeWidth = strokeWidth;
    this.strokeWidth = strokeWidth;
    this._svgFillOpacity = fillOpacity;
    this.fillOpacity = fillOpacity;
    this._targetHeight = height;
    this._macros = macros;

    // Set position
    this.position.set(position[0], position[1], position[2]);

    if (Array.isArray(latex) || this._partLatex.length > 1 || this._partLatex[0] !== latex) {
      // Multi-part mode: render the FULL expression as one MathJax call
      // for correct layout, then split VMobjects into parts by glyph count.
      this._isMultiPart = true;
      this._latex = parts.sourceLatex;
      if (render)
        this._renderPromise = this._renderMultiPart(this._partLatex).catch((error: unknown) => {
          this._renderError = error instanceof Error ? error : new Error(String(error));
        });
    } else {
      this._isMultiPart = false;
      this._latex = latex as string;
      if (render) this._startRender();
    }
  }

  /**
   * Wait for the LaTeX to finish rendering.
   */
  async waitForRender(): Promise<void> {
    if (this._renderPromise) {
      await this._renderPromise;
    }
    if (this._renderError) {
      throw this._renderError;
    }
  }

  /**
   * Get a sub-part of a multi-part expression.
   * Only available when created with a string array.
   * Returns a VGroup with setColor() support.
   */
  getPart(index: number): VGroup {
    if (!this._isMultiPart) {
      throw new Error('getPart() is only available on multi-part MathTex (created with string[])');
    }
    if (index < 0 || index >= this._parts.length) {
      throw new Error(`Part index ${index} out of range [0, ${this._parts.length - 1}]`);
    }
    return this._parts[index];
  }

  /**
   * Select a semantic part by its authored key after waitForRender().
   * Legacy matchingKeys and unique literal parts also support this selector.
   *
   * @pre this._matchingKeys.filter(value => value === key).length === 1
   * @pre !this._isMultiPart || this._parts.length === this._partLatex.length
   * @post result === this.getMatchingParts()[this._matchingKeys.indexOf(key)]
   */
  part(key: string): VGroup {
    const index = this._matchingKeys.indexOf(key);
    if (index < 0) throw new Error(`Unknown MathTex part "${key}".`);
    if (this._matchingKeys.lastIndexOf(key) !== index) {
      throw new Error(`MathTex part "${key}" is ambiguous; assign unique named keys.`);
    }
    if (!this._isMultiPart) return this;
    if (this._parts.length !== this._partLatex.length) {
      throw new Error('MathTex parts are not ready; await waitForRender() before calling part().');
    }
    return this.getPart(index);
  }

  /**
   * Get the number of parts.
   */
  getPartCount(): number {
    return this._isMultiPart ? this._parts.length : 1;
  }

  /**
   * Get the LaTeX string.
   */
  getLatex(): string {
    return this._latex;
  }

  /** Original authored LaTeX, including explicit matching boundaries. */
  getSourceLatex(): string {
    return this._sourceLatex;
  }

  /** Semantic matching units; glyph children inside a unit are kept together. */
  getMatchingParts(): VMobject[] {
    return this._isMultiPart ? [...this._parts] : [this];
  }

  getMatchingKey(): string {
    return this._matchingKeys[0] ?? this._latex;
  }

  override captureState(): Record<string, unknown> {
    return {
      ...super.captureState(),
      latex: this._latex,
      sourceLatex: this._sourceLatex,
      partLatex: [...this._partLatex],
      matchingKeys: [...this._matchingKeys],
      partColors: [...this._partColors],
      isMultiPart: this._isMultiPart,
      fontSize: this._fontSize,
    };
  }

  override restoreCapturedState(state: Record<string, unknown>): void {
    super.restoreCapturedState(state);
    if (typeof state.latex === 'string') this._latex = state.latex;
    if (typeof state.sourceLatex === 'string') this._sourceLatex = state.sourceLatex;
    if (Array.isArray(state.partLatex)) this._partLatex = state.partLatex.map(String);
    if (Array.isArray(state.matchingKeys)) this._matchingKeys = state.matchingKeys.map(String);
    if (Array.isArray(state.partColors))
      this._partColors = state.partColors.map((color) =>
        typeof color === 'string' ? color : null,
      );
    if (typeof state.isMultiPart === 'boolean') this._isMultiPart = state.isMultiPart;
    if (typeof state.fontSize === 'number') this._fontSize = state.fontSize;
    if (this._isMultiPart)
      this._parts = this.children.filter((child): child is VGroup => child instanceof VGroup);
  }

  /** LaTeX semantics for copying/accessibility; math source is not ordinary prose. */
  getSemanticTextRuns(): SemanticTextRun[] {
    let offset = 0;
    return this.getMatchingParts().map((part, index) => {
      const text = this._partLatex[index] ?? this._latex;
      const sourceRange: [number, number] = [offset, offset + text.length];
      offset += text.length;
      const object = part._syncWorldMatrices();
      const inverse = object.matrixWorld.clone().invert();
      const box = new THREE.Box3();
      const collect = (node: Mobject) => {
        if (node instanceof VMobject) {
          const matrix = node.getThreeObject().matrixWorld;
          for (const point of node.getLocalPoints())
            box.expandByPoint(
              new THREE.Vector3(point[0], point[1], point[2])
                .applyMatrix4(matrix)
                .applyMatrix4(inverse),
            );
        }
        node.children.forEach(collect);
      };
      collect(part);
      if (box.isEmpty()) box.set(new THREE.Vector3(), new THREE.Vector3());
      const opacity = semanticOpacity(part);
      return {
        id: `${this.id}:part:${index}`,
        mobjectId: this.id,
        kind: 'math',
        source: this._latex,
        text,
        sourceRange,
        graphemeRange: [index, index + 1],
        readingOrder: index,
        font: {
          family: 'serif',
          size: this._fontSize,
          weight: 'normal',
          style: 'normal',
          lineHeight: 1,
          letterSpacing: 0,
        },
        color: part.color,
        opacity,
        visible: opacity > 0 && text.length > 0,
        bounds: {
          x: box.min.x,
          y: box.min.y,
          width: box.max.x - box.min.x,
          height: box.max.y - box.min.y,
        },
        matrixWorld: object.matrixWorld.toArray(),
      };
    });
  }

  /**
   * Get the render error, if any.
   * Returns null if rendering succeeded or is still in progress.
   */
  getRenderError(): Error | null {
    return this._renderError;
  }

  /** Preserve pending placement when a containing Group normalizes before SVG readiness. */
  override normalizeTransform(worldMatrix: THREE.Matrix4 = this._ownMatrix()): this {
    if (this.children.length === 0) return this._flattenAsMesh(worldMatrix);
    return super.normalizeTransform(worldMatrix);
  }

  /**
   * World-space center. Unlike the base VGroup, an empty (not-yet-rendered)
   * MathTex falls back to its world-space origin instead of throwing: MathTex is
   * built lazily, so `scale()`/`moveTo()` (which read getCenter() for their
   * default anchor) are routinely called before the SVG geometry exists.
   */
  override getCenter(): Vector3Tuple {
    if (this.isEmpty()) {
      // World location of the node origin (own + ancestor transforms applied).
      return this._localToWorld([0, 0, 0]);
    }
    return super.getCenter();
  }

  /**
   * Override setColor to propagate to all VMobject children (fill + stroke).
   */
  override setColor(color: string): this {
    return super.setColor(color);
  }

  /**
   * Start the async rendering process.
   */
  protected _startRender(): void {
    this._renderPromise = this._render()
      .then(() => {
        this._markDirty();
      })
      .catch((error) => {
        logger.error('MathTex rendering error:', error);
        this._renderError = error instanceof Error ? error : new Error(String(error));
      });
  }

  /**
   * Render the LaTeX to VMobject paths.
   */
  protected async _render(): Promise<void> {
    const result = await renderLatexToSVG(this._latex, {
      displayMode: this._displayMode,
      color: this._color,
      macros: this._macros,
    });

    const viewBox = result.svgElement.getAttribute?.('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/\s+/).map(Number);
      this._svgViewBoxWidth = parts[2] || 1000;
    }

    const vmobjectGroup = result.vmobjectGroup;

    // Restyle children: MathJax glyphs should be filled with visible border
    this._restyleChildren(vmobjectGroup);

    // Add the VMobject children from the group
    for (const child of [...vmobjectGroup.children]) {
      vmobjectGroup.remove(child);
      this.add(child);
    }

    // Scale to target height if specified, otherwise use a sensible default
    this._scaleToTarget();

    // Bake any pre-render scale() call into glyph geometry so subsequent
    // transforms operate in a consistent coordinate frame (#324).
    this._consumePendingScale();

    // Set fillOpacity on this VGroup so Create animation detects it has fill
    // and properly hides it during the stroke-draw phase before fading it in.
    this.fillOpacity = this._svgFillOpacity;
  }

  /**
   * Restyle all VMobject children for solid glyph rendering.
   */
  protected _restyleChildren(group: VGroup): void {
    const restyle = (mob: Mobject) => {
      if (mob instanceof VMobject) {
        mob.fillOpacity = this._svgFillOpacity;
        mob.strokeWidth = this._svgStrokeWidth;
        mob.setColor(this._color);
        // Access _style directly: protected member, reached from a sibling instance.
        const style = (mob as unknown as { _style: MobjectStyle })._style;
        style.fillOpacity = this._svgFillOpacity;
        style.strokeWidth = this._svgStrokeWidth;
      }
      if ('children' in mob) {
        for (const child of (mob as { children: Mobject[] }).children) {
          restyle(child);
        }
      }
    };
    restyle(group);
  }

  /**
   * Scale and center the assembled paths by transforming point data directly.
   *
   * Unit flow:
   * - MathJax path coordinates arrive in font units (~1000 units per em).
   * - Convert font-size points to world units via DEFAULT_FONT_SIZE_PT baseline.
   * - Convert MathJax units to em by dividing by MATHJAX_SVG_UNITS_PER_EM.
   *
   * This keeps MathTex aligned with Text/MathTexImage behavior at 48pt.
   */
  protected _scaleToTarget(): void {
    // Collect all VMobject descendants (may be direct children or nested in part VGroups)
    const vmobjects: VMobject[] = [];
    const collect = (mob: Mobject) => {
      if (mob instanceof VMobject && !(mob instanceof VGroup)) {
        vmobjects.push(mob);
      }
      if ('children' in mob) {
        for (const child of (mob as { children: Mobject[] }).children) {
          collect(child);
        }
      }
    };
    collect(this);

    // Compute bounding box from raw point data
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    for (const vmob of vmobjects) {
      for (const p of vmob.getLocalPoints()) {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
    }

    const rawHeight = maxY - minY;
    if (rawHeight < 0.0001) return;

    const worldPerMathJaxUnit =
      DEFAULT_FONT_SIZE_IN_WORLD_SPACE / (DEFAULT_FONT_SIZE_PT * MATHJAX_SVG_UNITS_PER_EM);
    let s = this._fontSize * worldPerMathJaxUnit;
    if (this._targetHeight !== undefined) {
      s = this._targetHeight / rawHeight;
    }

    // Center of current bounds
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // Transform all point data: scale and center at origin
    for (const vmob of vmobjects) {
      const pts = vmob.getLocalPoints();
      const transformed = pts.map((p) => [(p[0] - cx) * s, (p[1] - cy) * s, p[2]]);
      vmob.setPoints3D(transformed);
    }
  }

  /**
   * Bake any pending parent `scaleVector` (e.g. from a pre-render `scale()`)
   * into descendant geometry so post-render `shift`/`moveTo` operate in the
   * same coordinate frame as the rendered glyphs. Without this step the
   * parent's Three.js scale would silently multiply any later child-frame
   * translations, producing a mismatch between `getCenter()` and the
   * rendered position. See issue #324.
   */
  protected _consumePendingScale(): void {
    const sx = this.scaleVector.x;
    const sy = this.scaleVector.y;
    const sz = this.scaleVector.z;
    if (sx === 1 && sy === 1 && sz === 1) return;

    const visit = (mob: Mobject) => {
      mob.position.set(mob.position.x * sx, mob.position.y * sy, mob.position.z * sz);
      if (mob instanceof VMobject && !(mob instanceof VGroup)) {
        const pts = mob.getLocalPoints();
        const scaled = pts.map((p) => [p[0] * sx, p[1] * sy, p[2] * sz]);
        mob.setPoints3D(scaled);
      }
      if ('children' in mob) {
        for (const child of (mob as { children: Mobject[] }).children) visit(child);
      }
      mob._markDirty();
    };
    for (const child of this.children) visit(child);
    this.scaleVector.set(1, 1, 1);
    this._markDirty();
  }

  /**
   * Render a multi-part expression by:
   * 1. Rendering the FULL expression as one MathJax call (correct layout)
   * 2. Rendering each part separately to count its glyphs
   * 3. Splitting the full expression's VMobjects into part groups by glyph count
   */
  private async _renderMultiPart(latexParts: string[]): Promise<void> {
    // Render the full expression as one unit (correct spacing & layout)
    const fullResult = await renderLatexToSVG(this._latex, {
      displayMode: this._displayMode,
      color: this._color,
      macros: this._macros,
    });
    const viewBox = fullResult.svgElement.getAttribute?.('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/\s+/).map(Number);
      this._svgViewBoxWidth = parts[2] || 1000;
    }

    this._restyleChildren(fullResult.vmobjectGroup);

    // Collect all VMobject children from the full render
    const allGlyphs: VMobject[] = [];
    for (const child of [...fullResult.vmobjectGroup.children]) {
      if (child instanceof VMobject) {
        allGlyphs.push(child);
      }
    }

    // Render each part separately to count how many glyphs it produces.
    // Use the same displayMode as the full render so MathJax produces matching
    // glyph counts (operators rendered alone in inline mode can drop or add
    // wrapper paths, throwing off the per-part assignment).
    const partGlyphCounts: number[] = [];
    for (const partLatex of latexParts) {
      const partResult = await renderLatexToSVG(partLatex, {
        displayMode: this._displayMode,
        color: this._color,
        macros: this._macros,
      });
      let count = 0;
      for (const child of partResult.vmobjectGroup.children) {
        if (child instanceof VMobject) count++;
      }
      partGlyphCounts.push(count);
    }

    // Assign glyphs from the full render to parts by count
    let glyphIdx = 0;
    for (let i = 0; i < latexParts.length; i++) {
      const partGroup = new MathTex._PartGroup();
      partGroup._latex = latexParts[i];
      partGroup._matchingKey = this._matchingKeys[i];
      partGroup.setColor(this._color);

      const count = partGlyphCounts[i];
      for (let j = 0; j < count && glyphIdx < allGlyphs.length; j++) {
        const glyph = allGlyphs[glyphIdx++];
        fullResult.vmobjectGroup.remove(glyph);
        partGroup.add(glyph);
      }

      this._parts.push(partGroup);
      this.add(partGroup);
    }

    // If there are leftover glyphs (spacing elements etc.), add to last part
    while (glyphIdx < allGlyphs.length) {
      const lastPart = this._parts[this._parts.length - 1];
      const glyph = allGlyphs[glyphIdx++];
      fullResult.vmobjectGroup.remove(glyph);
      lastPart.add(glyph);
    }

    this._parts.forEach((part, index) => part.setColor(this._partColors[index] ?? this._color));

    // Scale and center the full expression
    this._scaleToTarget();

    // Bake any pre-render scale() call into glyph geometry so subsequent
    // transforms operate in a consistent coordinate frame (#324).
    this._consumePendingScale();

    // Set fillOpacity on the parent VGroup for Create animation
    this.fillOpacity = this._svgFillOpacity;
  }

  /**
   * Lightweight VGroup used as a part container in multi-part mode.
   * Supports setColor() for per-part coloring.
   */
  protected _createPart(latex: string, key: string): VGroup {
    const part = new MathTex._PartGroup();
    part._latex = latex;
    part._matchingKey = key;
    part.setColor(this._color);
    return part;
  }

  private static _PartGroup = class extends VGroup {
    _latex: string = '';
    _matchingKey: string = '';
    constructor() {
      super();
    }

    getLatex(): string {
      return this._latex;
    }

    getMatchingKey(): string {
      return this._matchingKey;
    }

    override captureState(): Record<string, unknown> {
      return { ...super.captureState(), latex: this._latex, matchingKey: this._matchingKey };
    }

    override restoreCapturedState(state: Record<string, unknown>): void {
      super.restoreCapturedState(state);
      if (typeof state.latex === 'string') this._latex = state.latex;
      if (typeof state.matchingKey === 'string') this._matchingKey = state.matchingKey;
    }

    override copy(): VGroup {
      const copy = new MathTex._PartGroup();
      copy._latex = this._latex;
      copy._matchingKey = this._matchingKey;
      this._copyBaseAttributesInto(copy);
      return copy;
    }
  };

  override copy(): MathTex {
    const latexValue = this._isMultiPart ? this._partLatex : this._latex;
    const copy = new MathTex(
      {
        latex: latexValue,
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
    copy._latex = this._latex;
    copy._sourceLatex = this._sourceLatex;
    copy._partColors = [...this._partColors];
    this._copyBaseAttributesInto(copy, { copyChildren: true });
    copy._parts = this._isMultiPart
      ? copy.children.filter((child): child is VGroup => child instanceof VGroup)
      : [];
    if (this.children.length === 0 && this._renderPromise) {
      const pendingScale = this.scaleVector.clone();
      copy._renderPromise = this.waitForRender().then(() => {
        // Source readiness baked its pending scale into the copied geometry.
        copy.scaleVector.set(
          copy.scaleVector.x / (pendingScale.x || 1),
          copy.scaleVector.y / (pendingScale.y || 1),
          copy.scaleVector.z / (pendingScale.z || 1),
        );
        for (const child of this.children) copy.add(child.copy());
        copy._parts = this._isMultiPart
          ? copy.children.filter((child): child is VGroup => child instanceof VGroup)
          : [];
      });
    }
    return copy;
  }
}

/**
 * @deprecated Use `MathTex` instead. `MathTexSVG` is a backwards-compatible alias.
 */
export const MathTexSVG = MathTex;
/** @deprecated Use `MathTexOptions` instead. */
export type MathTexSVGOptions = MathTexOptions;
