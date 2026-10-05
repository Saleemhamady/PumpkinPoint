// Small line icons for the properties panel (emoji-free, so they look the same everywhere).

import type { ReactNode } from 'react';

const P = (d: string) => <path d={d} />;

const PATHS: Record<string, ReactNode> = {
  // Align (and text alignment).
  'align-left': <>{P('M3 2v12')}{P('M6 5h7')}{P('M6 11h4')}</>,
  'align-hcenter': <>{P('M8 2v12')}{P('M4 5h8')}{P('M5.5 11h5')}</>,
  'align-right': <>{P('M13 2v12')}{P('M3 5h7')}{P('M6 11h4')}</>,
  'align-top': <>{P('M2 3h12')}{P('M5 6v7')}{P('M11 6v4')}</>,
  'align-vcenter': <>{P('M2 8h12')}{P('M5 4v8')}{P('M11 5.5v5')}</>,
  'align-bottom': <>{P('M2 13h12')}{P('M5 3v7')}{P('M11 6v4')}</>,
  'text-left': <>{P('M2 4h12')}{P('M2 8h8')}{P('M2 12h10')}</>,
  'text-center': <>{P('M2 4h12')}{P('M4 8h8')}{P('M3 12h10')}</>,
  'text-right': <>{P('M2 4h12')}{P('M6 8h8')}{P('M4 12h10')}</>,
  'text-top': <>{P('M2 2.5h12')}{P('M4 6h8')}{P('M4 9h8')}</>,
  'text-middle': <>{P('M4 6.5h8')}{P('M4 9.5h8')}{P('M2 2.5h12')}{P('M2 13.5h12')}</>,
  'text-bottom': <>{P('M2 13.5h12')}{P('M4 7h8')}{P('M4 10h8')}</>,
  bullets: <>{P('M6 4h8')}{P('M6 8h8')}{P('M6 12h8')}<circle cx="2.5" cy="4" r="1" /><circle cx="2.5" cy="8" r="1" /><circle cx="2.5" cy="12" r="1" /></>,
  // Layer order.
  front: <>{P('M8 13V3')}{P('M4 7l4-4 4 4')}{P('M3 1.5h10')}</>,
  forward: <>{P('M8 13V4')}{P('M4 8l4-4 4 4')}</>,
  backward: <>{P('M8 3v9')}{P('M4 8l4 4 4-4')}</>,
  back: <>{P('M8 3v10')}{P('M4 9l4 4 4-4')}{P('M3 14.5h10')}</>,
};

export function Icon({ name }: { name: keyof typeof PATHS | string }) {
  return (
    <svg className="ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  );
}
