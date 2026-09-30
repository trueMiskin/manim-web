import { DEFAULT_COLOR_SCHEME, FadeOut } from 'manim-web';
import {
  code,
  defineSlide,
  mountPresentation,
  presentation,
  sceneSlides,
  slide,
  topic,
} from 'manim-web/reveal';

const source = 'int main() {\n\tconst int n = 2;\n\treturn n;\n}\n';
const options = {
  language: 'cpp',
  fontSize: 28,
  lineNumbers: true,
  copyButton: true,
  colorScheme: {
    ...DEFAULT_COLOR_SCHEME,
    background: '#123456',
    lineNumber: '#ff00cc',
  },
};

const replay = defineSlide({ title: 'Code enters and leaves' }, async (s) => {
  const snippet = s.code(source, options);
  await s.step({ id: 'hidden' }, () => {});
  await s.step({ id: 'shown' }, () => s.reveal(snippet));
  await s.step({ id: 'removed' }, () => s.play(new FadeOut(snippet, { duration: 0.4 })));
});

await mountPresentation(
  '#presentation',
  presentation({
    title: 'Code authoring fixture',
    topics: [
      topic('lesson', [sceneSlides('replay', async () => replay)]),
      topic('reference', [
        slide('declarative', { title: 'Code as content', content: [code(source, options)] }),
      ]),
    ],
  }),
  { notes: false },
);
