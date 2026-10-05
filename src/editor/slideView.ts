// Static slide rendering for thumbnails and PDF export, using the presentation's own
// element renderer so every view of a slide matches.

import type { Theme } from '../shared/theme.ts';
import { CANVAS_H, CANVAS_W, type Deck, type SlideElement } from '../shared/types.ts';
import { ELEMENT_CSS, renderSlide } from '../runtime/elements.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Draw a slide's elements into `host` (a 1600x900 box), replacing what was there. */
export function drawSlide(host: HTMLElement, elements: SlideElement[], theme: Theme): void {
  host.textContent = '';
  host.style.background = theme.background;
  renderSlide(elements, theme, host);
}

/** Print the slides through the browser's print dialog (Save as PDF), one per page. */
export function printSlides(deck: Deck, themes: Theme[], fontCss: string): void {
  const scratch = document.createElement('div');
  const pages = deck.slides.map((slide, i) => {
    drawSlide(scratch, slide.elements, themes[i]);
    return `<div class="page" style="background:${esc(themes[i].background)}">${scratch.innerHTML}</div>`;
  });
  const frame = document.createElement('iframe');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(deck.title || 'Slides')}</title><style>
${fontCss}
@page{size:${CANVAS_W}px ${CANVAS_H}px;margin:0}
html,body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{position:relative;width:${CANVAS_W}px;height:${CANVAS_H}px;overflow:hidden;page-break-after:always;break-after:page}
${ELEMENT_CSS}
</style></head><body>${pages.join('')}</body></html>`);
  doc.close();
  const win = frame.contentWindow!;
  const done = () => setTimeout(() => frame.remove(), 1000);
  win.addEventListener('afterprint', done);
  win.document.fonts.ready.then(() => {
    win.focus();
    win.print();
    setTimeout(done, 60_000);
  });
}
