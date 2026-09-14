import { FadeIn, FadeOut, MathTex, Tex, TransformMatchingTex, Write } from '../../../../src';
import type { SceneDefinition } from '../../../../src/reveal';
import { C, heading, label, SOURCE_FONT_BOLD } from './common';

export default {
  async build(scene) {
    const title = heading('manim-web tech demo');
    const subtitle = label('Text, geometry and scientific animation', 30, C.cyan, [0, 1.7, 0]);
    const capabilities = label('Write • transform • animate • pause', 24, C.text, [0, 0, 0]);
    const controls = label(
      '← → topics    ↑ ↓ steps    Space next    R replay    P pause',
      18,
      C.muted,
      [0, -2, 0],
    );
    await scene.step(
      {
        id: 'text-intro',
        title: 'Text',
        notes:
          'Written text becomes selectable when playback pauses. This is the first of two text examples.',
      },
      async () => {
        await scene.play(new Write(title), new FadeIn(subtitle));
        await scene.play(new Write(capabilities), new FadeIn(controls));
      },
    );

    const from = new Tex({
      ...SOURCE_FONT_BOLD,
      latex: '{{Animated}} {{text}}',
      fontSize: 42,
      color: C.cyan,
    });
    const to = new Tex({
      ...SOURCE_FONT_BOLD,
      latex: '{{Animated}} {{equations}}',
      fontSize: 42,
      color: C.cyan,
    });
    await Promise.all([from.waitForRender(), to.waitForRender()]);
    from.moveTo([0, 1.4, 0]);
    to.moveTo([0, 1.4, 0]);
    const equation = new MathTex({
      latex: String.raw`E(x)=\sum_{k=1}^{N}a_k e^{i\phi_k(x)}`,
      fontSize: 40,
      color: C.text,
    }).moveTo([0, -0.4, 0]);
    const caption = label('Selectable text and LaTeX at each pause', 22, C.muted, [0, -2.2, 0]);
    await scene.step(
      {
        id: 'text-math',
        title: 'Matching text and LaTeX',
        notes:
          'The shared word stays in place during the matching transform. Select the final text or copy the formula source at the pause.',
      },
      async () => {
        await scene.play(
          ...[subtitle, capabilities, controls].map((object) => new FadeOut(object)),
        );
        await scene.play(new Write(from));
        await scene.play(new TransformMatchingTex(from, to), new Write(equation));
        await scene.play(new FadeIn(caption));
      },
    );
  },
} satisfies SceneDefinition;
