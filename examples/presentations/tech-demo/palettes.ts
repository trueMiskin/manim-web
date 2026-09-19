import { darkColors, definePalettes, lightColors } from 'manim-web/reveal';

/** Named colors shared by slide text and manually authored diagrams. */
export const techDemoPalettes = definePalettes({
  dark: {
    ...darkColors,
    background: '#000000',
    text: '#F3F4F6',
    muted: '#8996A6',
    accent: '#00FFFF',
    secondary: '#FFB300',
    card: '#161B22',
    cyan: '#00FFFF',
    amber: '#FFB300',
    green: '#00E676',
    red: '#FF1744',
    yellow: '#FFFF00',
    surfaceShade: '#176270',
    medium: '#173C52',
    tableSurface: '#0D3B2E',
  },
  light: {
    ...lightColors,
    background: '#FFFFFF',
    text: '#18222F',
    muted: '#536174',
    accent: '#005C9E',
    secondary: '#965000',
    card: '#DCE5EF',
    cyan: '#005C9E',
    amber: '#965000',
    green: '#087A46',
    red: '#C51C3A',
    yellow: '#8F6500',
    surfaceShade: '#65B9C4',
    medium: '#C2E0EF',
    tableSurface: '#D6EDE0',
  },
});
