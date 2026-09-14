import {
  Arc,
  Create,
  DashedLine,
  FadeIn,
  FadeOut,
  Line,
  MathTex,
  Rectangle,
  Transform,
  TransformMatchingTex,
  Write,
} from '../../../../src';
import type { SceneDefinition } from '../../../../src/reveal';
import { C, heading, label } from './common';

export default {
  options: { backgroundColor: C.bg },
  async build(scene) {
    const reflection = new MathTex({
      latex: [String.raw`\theta_i`, '=', String.raw`\theta_r`],
      matchingKeys: ['incident', 'equals', 'outgoing'],
      fontSize: 44,
      color: C.text,
    });
    const refraction = new MathTex({
      latex: [
        'n_1',
        String.raw`\sin`,
        String.raw`\theta_i`,
        '=',
        'n_2',
        String.raw`\sin`,
        String.raw`\theta_t`,
      ],
      matchingKeys: ['n1', 'sin1', 'incident', 'equals', 'n2', 'sin2', 'outgoing'],
      fontSize: 36,
      color: C.text,
    });
    const incidentAngle = new MathTex({ latex: String.raw`\theta_i`, fontSize: 28, color: C.cyan });
    const reflectedAngle = new MathTex({
      latex: String.raw`\theta_r`,
      matchingKeys: ['outgoing'],
      fontSize: 28,
      color: C.amber,
    });
    const refractedAngle = new MathTex({
      latex: String.raw`\theta_t`,
      matchingKeys: ['outgoing'],
      fontSize: 28,
      color: C.amber,
    });
    await Promise.all(
      [reflection, refraction, incidentAngle, reflectedAngle, refractedAngle].map((math) =>
        math.waitForRender(),
      ),
    );
    reflection.moveTo([-3.2, 0.55, 0]);
    refraction.moveTo([-3.2, 0.55, 0]);
    reflection.getPart(0).setColor(C.cyan);
    reflection.getPart(2).setColor(C.amber);
    refraction.getPart(2).setColor(C.cyan);
    refraction.getPart(6).setColor(C.amber);
    incidentAngle.moveTo([2.7, 0.98, 0]);
    reflectedAngle.moveTo([3.75, 0.98, 0]);
    refractedAngle.moveTo([3.58, -1.3, 0]);

    const medium = new Rectangle({
      width: 5.9,
      height: 2.6,
      color: '#173C52',
      fillOpacity: 0.65,
      strokeWidth: 0,
    }).moveTo([3.25, -1.45, 0]);
    const boundary = new Line({
      start: [0.3, -0.15, 0],
      end: [6.2, -0.15, 0],
      color: C.text,
      strokeWidth: 2,
    });
    const normal = new DashedLine({
      start: [3.2, -2.55, 0],
      end: [3.2, 2.25, 0],
      color: C.muted,
      strokeWidth: 2,
    });
    const incoming = new Line({
      start: [1.25, 1.8, 0],
      end: [3.2, -0.15, 0],
      color: C.cyan,
      strokeWidth: 5,
    });
    const outgoing = new Line({
      start: [3.2, -0.15, 0],
      end: [5.15, 1.8, 0],
      color: C.amber,
      strokeWidth: 5,
    });
    const transmittedAngle = Math.asin(Math.sin(Math.PI / 4) / 1.5);
    const transmitted = new Line({
      start: [3.2, -0.15, 0],
      end: [3.2 + 2.75 * Math.sin(transmittedAngle), -0.15 - 2.75 * Math.cos(transmittedAngle), 0],
      color: C.amber,
      strokeWidth: 5,
    });
    const incidentArc = new Arc({
      center: [3.2, -0.15, 0],
      radius: 0.65,
      startAngle: Math.PI / 2,
      angle: Math.PI / 4,
      color: C.cyan,
    });
    const outgoingArc = new Arc({
      center: [3.2, -0.15, 0],
      radius: 0.85,
      startAngle: Math.PI / 4,
      angle: Math.PI / 4,
      color: C.amber,
    });
    const transmittedArc = new Arc({
      center: [3.2, -0.15, 0],
      radius: 0.85,
      startAngle: -Math.PI / 2,
      angle: transmittedAngle,
      color: C.amber,
    });
    const reflectionLabel = label('Reflection', 27, C.text, [-3.2, -0.65, 0]);
    const refractionLabel = label('Refraction', 27, C.text, [-3.2, -0.65, 0]);

    await scene.step(
      {
        id: 'formulas-reflection',
        title: 'Reflection: equal angles',
        notes: 'The incident and reflected angles are measured from the surface normal.',
      },
      async () => {
        await scene.play(
          new FadeIn(heading('Formula morphing')),
          new FadeIn(medium),
          new Create(boundary),
          new Create(normal),
        );
        await scene.play(
          new Write(reflection),
          new FadeIn(reflectionLabel),
          new Create(incoming),
          new Create(outgoing),
        );
        await scene.play(
          new Create(incidentArc),
          new Create(outgoingArc),
          new FadeIn(incidentAngle),
          new FadeIn(reflectedAngle),
        );
      },
    );
    await scene.step(
      {
        id: 'formulas-refraction',
        title: 'Refraction: matching symbols',
        notes:
          'Shared equation parts move into Snell’s law while the outgoing ray turns into the second medium. The indices are n₁ = 1 and n₂ = 1.5.',
      },
      async () => {
        await scene.play(
          new TransformMatchingTex(reflection, refraction, { duration: 2.5 }),
          new Transform(outgoing, transmitted, { duration: 2.5 }),
          new Transform(outgoingArc, transmittedArc, { duration: 2.5 }),
          new TransformMatchingTex(reflectedAngle, refractedAngle, {
            duration: 2.5,
          }),
          new FadeOut(reflectionLabel),
          new FadeIn(refractionLabel),
          new FadeIn(label('n₁ = 1', 20, C.muted, [5.5, 0.25, 0])),
          new FadeIn(label('n₂ = 1.5', 20, C.text, [5.45, -0.55, 0])),
        );
        await scene.play(
          new FadeIn(label('Matching symbols move as the ray changes', 22, C.muted, [0, -3.25, 0])),
        );
      },
    );
  },
} satisfies SceneDefinition;
