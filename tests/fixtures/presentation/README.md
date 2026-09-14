# Presentation test fixtures

These small fixtures support geometry and SVG parser regression tests. They are
separate from the runnable technology demo.

`billiards.json` and `propagation.json` contain sampled results from the Python
geometry helpers in [Jérome Eertmans's presentation](https://github.com/jeertmans/jeertmans.github.io/blob/f5a6bf538bf86d41aba10f7cc3a907c098e77364/_slides/2026-07-06-public-defense/main.py).
The tests compare the TypeScript helpers with these independent reference results.

The SVG parser tests use the original
[speaker](https://github.com/jeertmans/jeertmans.github.io/blob/f5a6bf538bf86d41aba10f7cc3a907c098e77364/_slides/2023-12-07-confirmation/speaker.svg)
and [listener](https://github.com/jeertmans/jeertmans.github.io/blob/f5a6bf538bf86d41aba10f7cc3a907c098e77364/_slides/2023-12-07-confirmation/listener.svg)
icons. All fixtures derive from that repository at commit
`f5a6bf538bf86d41aba10f7cc3a907c098e77364` and retain its
[MIT license](SOURCE-LICENSE.txt).
