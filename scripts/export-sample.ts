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
import { familyFontCss, bundleRuntime } from '../server/bundle.ts';
import { fontsForDeck } from '../src/shared/fonts.ts';

const root = process.cwd();
const outDir = path.join(root, process.argv[2] ?? 'samples');
mkdirSync(outDir, { recursive: true });

const deck = sampleDeck();
const plans = deck.slides.map((s, i) => offlinePlan(s.elements, s.story, i, deck.slides.length));
const { code } = await bundleRuntime(root, process.env.MINIFY !== '0');
const fonts = familyFontCss(root);

for (const style of STYLE_IDS) {
  const styled = { ...deck, style };
  const data = toRuntimeData(styled, plans);
  const file = path.join(outDir, `${style}.html`);
  writeFileSync(file, assembleHtml(data, code, fontsForDeck(styled).map((k) => fonts[k]).join('\n')));
  console.log(`wrote ${path.relative(root, file)}`);
}
for (const [i, p] of plans.entries()) {
  console.log(`scene ${i + 1}: mood=${p.mood} setting=${p.setting} motifs=${p.motifs.map((m) => m.motif).join(',')}`);
}
