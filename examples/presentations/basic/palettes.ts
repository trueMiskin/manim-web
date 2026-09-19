import { darkColors, definePalettes, lightColors } from 'manim-web/reveal';

// Add the same named colors to both palettes, then use s.colors in your slides.
export const palettes = definePalettes({
  dark: {
    ...darkColors,
    grid: '#293341',
    orbit: '#466277',
    highlight: '#FFFF00',
  },
  light: {
    ...lightColors,
    grid: '#DCE3EB',
    orbit: '#8296A8',
    highlight: '#946200',
  },
});
