import { describe, expect, it } from 'vitest';
import { assembleHtml, scriptSafeJson } from '../src/shared/assemble.ts';
import type { RuntimeData } from '../src/shared/types.ts';

describe('assembleHtml', () => {
  it('embeds data so that slide text cannot break out of the script tag', () => {
    const data: RuntimeData = {
      title: 'Tom & <Jerry>',
      style: 'kinetic',
      scenes: [{
        slide: { layout: 'title', title: '</script><script>alert(1)</script>', subtitle: ' ', bullets: [] },
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
    expect(scriptSafeJson('a b')).toBe('"a\\u2028b"');
  });
});
