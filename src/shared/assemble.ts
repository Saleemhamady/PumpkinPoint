// Assembles the final single-file presentation: runtime script + fonts + scene data.

import type { RuntimeData } from './types.ts';

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** JSON that is safe to place inside a <script> element. */
export function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function assembleHtml(data: RuntimeData, runtimeJs: string, fontCss: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="PumpkinPoint">
<title>${escapeHtml(data.title || 'Presentation')}</title>
<style>${fontCss}</style>
</head>
<body>
<div id="pp-root"></div>
<script type="application/json" id="pp-data">${scriptSafeJson(data)}</script>
<script>${runtimeJs.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>
`;
}
