// New slides and the deck new users start with (a short pitch for PumpkinPoint itself).

import { layoutElements, newShape, uid } from './elements.ts';
import type { Deck, Layout, Slide, SlideContent } from './types.ts';

export const newId = () => uid('s');

const PLACEHOLDER: Record<Layout, SlideContent> = {
  title: { layout: 'title', title: 'Presentation title', subtitle: 'A subtitle', bullets: [] },
  bullets: { layout: 'bullets', title: 'Slide title', subtitle: '', bullets: ['First point', 'Second point'] },
  statement: { layout: 'statement', title: 'A sentence worth remembering.', subtitle: '', bullets: [] },
  stat: { layout: 'stat', title: '42%', subtitle: 'what the number means', bullets: [] },
};

/** A slide laid out from structured content (or placeholder text for the layout). */
export function newSlide(layout: Layout = 'bullets', content?: Partial<SlideContent>, story = ''): Slide {
  const c = { ...PLACEHOLDER[layout], ...(content ?? {}), layout };
  return { id: newId(), elements: layoutElements(c), story };
}

export function sampleDeck(): Deck {
  const s1 = newSlide('title', { title: 'PumpkinPoint', subtitle: 'Presentations that tell a story' }, 'A boat sits in the harbour at dawn, ready to set sail.');
  s1.elements.push(newShape('round', { x: 740, y: 120, w: 120, h: 12, fill: 'accent' }));

  const s3 = newSlide(
    'bullets',
    { title: 'The idea', bullets: ['Write your slides as usual', 'Add the story behind each one', 'AI turns it into motion'] },
    'Then a lighthouse switches on. Its light cuts through the rain and shows the boats the way home.',
  );
  s3.elements.push(newShape('arrow', { x: 860, y: 610, w: 150, h: 70, fill: 'accent' }));

  return {
    version: 2,
    title: 'PumpkinPoint',
    style: 'origami',
    slides: [
      s1,
      newSlide(
        'bullets',
        { title: 'Slides don’t stick', bullets: ['Audiences forget most bullet points', 'Every deck looks the same', 'Motion graphics take days to design'] },
        'A storm rolls in. Out at sea, the boats drift in the rain, lost and all alike.',
      ),
      s3,
      newSlide('stat', { title: '10 min', subtitle: 'from plain slides to a story-driven deck' }, 'Fast now, the wind fills the sails and the boat speeds toward the light.'),
      newSlide(
        'bullets',
        {
          title: 'How it works',
          bullets: [
            'Pick a style: origami, pop-up book, whiteboard or kinetic',
            'Edit a slide or its story and only that scene rebuilds',
            'Export one HTML file that runs in any browser',
          ],
        },
        'Other boats follow in its wake: a whole fleet sailing together under the morning sun.',
      ),
      newSlide(
        'statement',
        { title: 'Every slide has a story. Let it be told.', subtitle: 'Try it with your next talk' },
        'The fleet reaches the harbour as the sun rises over a golden sea.',
      ),
    ],
  };
}
