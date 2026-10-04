// Export the sample deck in every style without the editor or an API key:
//   npm run sample   ->   samples/<style>.html
// Plans come from the offline planner.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assembleHtml } from '../src/shared/assemble.ts';
import { toRuntimeData } from '../src/shared/compiler.ts';
import { offlinePlan } from '../src/shared/plan.ts';
import { sampleDeck } from '../src/shared/sample.ts';
import { STYLE_IDS } from '../src/shared/types.ts';
import { allFontCss, bundleRuntime } from '../server/bundle.ts';

const root = process.cwd();
const outDir = path.join(root, process.argv[2] ?? 'samples');
mkdirSync(outDir, { recursive: true });

const deck = sampleDeck();
const plans = deck.slides.map((s, i) => offlinePlan(s, s.story, i, deck.slides.length));
const { code } = await bundleRuntime(root, process.env.MINIFY !== '0');
const fonts = allFontCss(root);

for (const style of STYLE_IDS) {
  const data = toRuntimeData({ ...deck, style }, plans);
  const file = path.join(outDir, `${style}.html`);
  writeFileSync(file, assembleHtml(data, code, fonts.styles[style]));
  console.log(`wrote ${path.relative(root, file)}`);
}
for (const [i, p] of plans.entries()) {
  console.log(`scene ${i + 1}: mood=${p.mood} setting=${p.setting} motifs=${p.motifs.map((m) => m.motif).join(',')}`);
}
