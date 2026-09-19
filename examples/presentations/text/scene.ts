import { Text, AddTextLetterByLetter, Indicate, FadeOut } from 'manim-web';
import { defineSlide } from 'manim-web/reveal';

export default defineSlide({ title: 'Writing and selection' }, async (slide) => {
  const heading = slide.paragraph('Text stays text', { fontSize: 40 });
  // Text exposes grapheme ranges for the typewriter animation; place handles its layout.
  const message = slide.place(
    new Text({
      text: 'Café  👩‍🔬\nWrite. Pause. Select. Print.',
      fontSize: 36,
      fontFamily: slide.theme.fontFamily,
      color: slide.theme.colors.text,
      lineHeight: slide.theme.lineHeight,
      textAlign: 'left',
    }),
    { align: 'left' },
  );

  await slide.step(
    {
      id: 'heading',
      title: 'Writing',
      notes: 'Texture text uses a reveal treatment. Supply fontUrl for vector outlines.',
    },
    () => slide.write(heading),
  );
  await slide.step({ id: 'graphemes', title: 'Unicode graphemes' }, () =>
    slide.play(new AddTextLetterByLetter(message, { duration: 2 })),
  );
  await slide.step({ id: 'emphasis', title: 'Emphasis and selection' }, () =>
    slide.play(new Indicate(heading)),
  );
  await slide.step({ id: 'remove', title: 'Only visible text is selectable' }, () =>
    slide.play(new FadeOut(message)),
  );
});
