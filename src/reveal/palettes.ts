/** Standard slide colors plus any additional roles an author needs. */
export type ColorPalette = Readonly<
  {
    background: string;
    text: string;
    muted: string;
    accent: string;
    secondary: string;
  } & Record<string, string>
>;

export type PaletteCollection = Readonly<Record<string, ColorPalette>>;

export interface ResolvedPalette {
  readonly name: string;
  readonly colors: ColorPalette;
}

export const darkColors = Object.freeze({
  background: '#10141c',
  text: '#f3f4f6',
  muted: '#b8c2d1',
  accent: '#58c4dd',
  secondary: '#f4cf6b',
}) satisfies ColorPalette;

export const lightColors = Object.freeze({
  background: '#ffffff',
  text: '#202631',
  muted: '#596779',
  accent: '#087f9a',
  secondary: '#946200',
}) satisfies ColorPalette;

type PaletteKeys<T extends PaletteCollection> = {
  [Name in keyof T]: keyof T[Name];
}[keyof T];

type MatchingPalettes<T extends PaletteCollection> = {
  [Name in keyof T]: Readonly<Record<PaletteKeys<T>, string>>;
};

type DefinedPalettes<T extends PaletteCollection> = {
  readonly [Name in keyof T]: { readonly [Role in keyof T[Name]]: string };
};

/**
 * Copy named palettes into an immutable collection with identical color roles.
 * @pre Object.keys(palettes).length > 0
 * @post Object.isFrozen(result)
 */
export function definePalettes<const T extends PaletteCollection>(
  palettes: T & MatchingPalettes<T>,
): DefinedPalettes<T> {
  const names = Object.keys(palettes);
  if (names.length === 0) throw new Error('A presentation needs at least one palette.');
  const standardKeys = Object.keys(darkColors);
  const keys = Object.keys(palettes[names[0]]).sort();
  const result: Record<string, ColorPalette> = {};
  for (const name of names) {
    if (!name.trim()) throw new Error('A palette needs a nonempty name.');
    const colors = palettes[name];
    const colorKeys = Object.keys(colors).sort();
    if (
      standardKeys.some((key) => !Object.prototype.hasOwnProperty.call(colors, key)) ||
      keys.length !== colorKeys.length ||
      keys.some((key, index) => key !== colorKeys[index])
    ) {
      throw new Error(
        `Palette "${name}" must define the same color roles as every palette, including the standard roles.`,
      );
    }
    if (Object.values(colors).some((color) => typeof color !== 'string' || !color.trim()))
      throw new Error(`Palette "${name}" colors must be nonempty strings.`);
    Object.defineProperty(result, name, {
      value: Object.freeze({ ...colors }),
      enumerable: true,
    });
  }
  return Object.freeze(result) as DefinedPalettes<T>;
}

/** Resolve one immutable palette for an entire build or playback session. */
export function resolvePresentationPalette(definition: {
  palettes?: PaletteCollection;
  palette?: string;
}): ResolvedPalette | undefined {
  if (!definition.palettes) {
    if (definition.palette !== undefined)
      throw new Error('A palette selection requires presentation palettes.');
    return undefined;
  }
  const palettes = definePalettes(definition.palettes);
  const name = definition.palette ?? Object.keys(palettes)[0];
  if (!Object.prototype.hasOwnProperty.call(palettes, name))
    throw new Error(`Unknown presentation palette: ${name}`);
  return Object.freeze({ name, colors: palettes[name] });
}
