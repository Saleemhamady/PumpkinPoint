// The Layer 1 look of a slide: used for editor thumbnails and for PDF export.

import type { Deck, SlideContent } from '../shared/types.ts';

export const SLIDE_W = 1280;
export const SLIDE_H = 720;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const SLIDE_CSS = `
.ls{position:relative;width:${SLIDE_W}px;height:${SLIDE_H}px;box-sizing:border-box;padding:96px 104px 80px;background:#FFFBF5;color:#2B2620;font-family:'Nunito',system-ui,-apple-system,'Segoe UI',sans-serif;overflow:hidden;display:flex;flex-direction:column;justify-content:center}
.ls::before{content:'';position:absolute;left:104px;top:60px;width:64px;height:10px;border-radius:5px;background:#F07C2A}
.ls::after{content:'';position:absolute;right:-120px;bottom:-160px;width:420px;height:420px;border-radius:50%;background:#FCE9D6}
.ls>*{position:relative;z-index:1}
.ls-num{position:absolute;right:56px;bottom:40px;font-size:20px;color:#B8AC9C;font-weight:800}
.ls h1{margin:0;font-weight:800;line-height:1.08;letter-spacing:-.01em}
.ls .sub{margin-top:22px;font-weight:600;color:#7A6E60;line-height:1.3}
.ls ul{margin:40px 0 0;padding:0;list-style:none}
.ls li{position:relative;padding-left:42px;margin:0 0 18px;font-weight:600;line-height:1.3}
.ls li::before{content:'';position:absolute;left:4px;top:.42em;width:15px;height:15px;border-radius:50%;background:#F07C2A}
.ls-title,.ls-statement,.ls-stat{text-align:center}
.ls-title::before,.ls-statement::before,.ls-stat::before{left:50%;margin-left:-32px}
.ls-title ul,.ls-statement ul,.ls-stat ul{display:inline-block;text-align:left;margin-left:auto;margin-right:auto}
.ls-stat .num{font-weight:800;color:#F07C2A;line-height:1;letter-spacing:-.02em}
.ls-empty{color:#C9BFB2}
`;

function size(text: string, sizes: [number, number][], fallback: number): number {
  for (const [maxLen, px] of sizes) if (text.length <= maxLen) return px;
  return fallback;
}

export function slideHtml(slide: SlideContent, index: number): string {
  const title = slide.title.trim();
  const bullets = slide.bullets.filter((b) => b.trim());
  const longest = bullets.reduce((n, b) => Math.max(n, b.length), 0);
  const bulletPx = bullets.length > 5 || longest > 70 ? 28 : bullets.length > 3 || longest > 45 ? 32 : 36;
  const list = bullets.length ? `<ul style="font-size:${bulletPx}px">${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '';
  const sub = slide.subtitle.trim() ? `<div class="sub" style="font-size:${slide.layout === 'stat' ? 40 : 30}px">${esc(slide.subtitle)}</div>` : '';
  const shown = title || 'Untitled slide';
  const emptyCls = title ? '' : ' ls-empty';
  let body: string;
  switch (slide.layout) {
    case 'title':
      body = `<h1 class="${emptyCls}" style="font-size:${size(shown, [[16, 104], [28, 84], [48, 68]], 56)}px">${esc(shown)}</h1>${sub}${list}`;
      break;
    case 'statement':
      body = `<h1 class="${emptyCls}" style="font-size:${size(shown, [[40, 72], [80, 60], [140, 48]], 40)}px">${esc(shown)}</h1>${sub}${list}`;
      break;
    case 'stat':
      body = `<div class="num${emptyCls}" style="font-size:${size(shown, [[6, 230], [10, 170], [16, 120]], 90)}px">${esc(shown)}</div>${sub}${list}`;
      break;
    default:
      body = `<h1 class="${emptyCls}" style="font-size:${size(shown, [[24, 64], [44, 54]], 44)}px">${esc(shown)}</h1>${sub}${list}`;
  }
  return `<div class="ls ls-${slide.layout}">${body}<div class="ls-num">${index + 1}</div></div>`;
}

/** Print the slides (Layer 1) through the browser's print dialog, one slide per page. */
export function printSlides(deck: Deck, fontCss: string): void {
  const frame = document.createElement('iframe');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(deck.title || 'Slides')}</title><style>
${fontCss}
@page{size:${SLIDE_W}px ${SLIDE_H}px;margin:0}
html,body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:${SLIDE_W}px;height:${SLIDE_H}px;overflow:hidden;page-break-after:always;break-after:page}
${SLIDE_CSS}
</style></head><body>${deck.slides.map((s, i) => `<div class="page">${slideHtml(s, i)}</div>`).join('')}</body></html>`);
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
