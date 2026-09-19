import { defineSlide } from 'manim-web/reveal';

export default defineSlide({ title: 'Multiply a matrix by a vector' }, async (s) => {
  const [inputs, calculation] = s.columns([1, 1]);
  const intro = inputs.paragraph('A $2\\times2$ matrix maps a 2D vector to another 2D vector.');
  // Ordinary LaTeX matrices work in the same math blocks as other formulas.
  const operands = inputs.math(
    String.raw`A=\begin{bmatrix}1&2\\3&4\end{bmatrix},\qquad
    x=\begin{bmatrix}2\\3\end{bmatrix}`,
    { fontSize: 34 },
  );
  const instruction = calculation.paragraph('Take the dot product of each row with $x$.');
  const firstRow = calculation.math(String.raw`y_1=1\cdot2+2\cdot3=8`, {
    fontSize: 32,
    color: 'accent',
  });
  const secondRow = calculation.math(String.raw`y_2=3\cdot2+4\cdot3=18`, {
    fontSize: 32,
    color: 'secondary',
  });
  const result = calculation.math(String.raw`Ax=\begin{bmatrix}8\\18\end{bmatrix}`, {
    fontSize: 34,
  });

  await s.step(
    { id: 'inputs', notes: 'The matrix has two rows, so the output vector has two entries.' },
    () => s.reveal(intro, operands, instruction),
  );
  await s.step(
    { id: 'first-row', notes: 'Multiply corresponding entries in the first row and add: 2 + 6.' },
    () => s.write(firstRow),
  );
  await s.step(
    { id: 'result', notes: 'Repeat for the second row: 6 + 12. Stack the two results.' },
    async () => {
      await s.write(secondRow);
      await s.write(result);
    },
  );
});
