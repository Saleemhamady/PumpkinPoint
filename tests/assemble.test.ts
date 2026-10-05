import { describe, expect, it } from 'vitest';
import { assembleHtml, scriptSafeJson } from '../src/shared/assemble.ts';
import type { RuntimeData } from '../src/shared/types.ts';

describe('assembleHtml', () => {
  it('embeds data so that slide text cannot break out of the script tag', () => {
    const data: RuntimeData = {
      title: 'Tom & <Jerry>',
      style: 'kinetic',
      scenes: [{
        elements: [{ id: 't', type: 'text', role: 'title', text: '</script><script>alert(1)</script>\u2028', x: 0, y: 0, w: 100, h: 100, rotation: 0, font: 'auto', size: 40, bold: true, italic: false, align: 'left', valign: 'top', color: 'ink', list: false }],
        plan: { mood: 'calm', setting: 'none', motifs: [], narration: '', kinetic: [] },
      }],
    };
    const html = assembleHtml(data, 'console.log("</script>")', '');
    expect(html).toContain('<title>Tom &amp; &lt;Jerry&gt;</title>');
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    const json = html.match(/<script type="application\/json" id="pp-data">([\s\S]*?)<\/script>/)![1];
    expect(JSON.parse(json)).toEqual(data);
  });

  it('escapes line separators', () => {
    expect(scriptSafeJson('a\u2028b')).toBe('"a\\u2028b"');
  });
});
