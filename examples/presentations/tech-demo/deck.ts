import { presentation, topic, sceneSlides, type SceneDefinition } from '../../../src/reveal';
import { prepareSourceFonts } from './scenes/common';
import { techDemoPalettes } from './palettes';

export interface TechDemoOptions {
  topics?: readonly string[];
  palette?: keyof typeof techDemoPalettes;
}
const modules = import.meta.glob('./scenes/demo-*.ts');
const topics = [
  { id: 'text', title: 'Text and formulas' },
  { id: 'optics', title: 'Shape morphing' },
  { id: 'formulas', title: 'Formula morphing' },
  { id: 'reflections', title: 'Paths and motion' },
  { id: 'dynamic', title: 'Live geometry' },
  { id: '3d', title: 'Deforming surfaces' },
  { id: 'fields', title: 'Heatmaps and gradients' },
  { id: 'optimization', title: 'Optimization' },
];

export function techDemo(options: TechDemoOptions = {}) {
  return presentation({
    title: 'manim-web tech demo',
    palettes: techDemoPalettes,
    palette: options.palette ?? 'dark',
    width: 1280,
    height: 720,
    topics: topics
      .filter((item) => !options.topics || options.topics.includes(item.id))
      .map((item) =>
        topic(
          item.id,
          [
            sceneSlides(item.id, async () => {
              const load = modules[`./scenes/demo-${item.id}.ts`];
              if (!load) throw new Error(`Missing tech demo scene: ${item.id}`);
              const { default: scene } = (await load()) as { default: SceneDefinition };
              await prepareSourceFonts();
              return scene;
            }),
          ],
          { title: item.title },
        ),
      ),
  });
}
