// The deck new users start with: a short pitch for PumpkinPoint itself.

import type { Deck, Slide } from './types.ts';

let counter = 0;
export function newId(): string {
  counter = (counter + 1) % 1e6;
  return `s${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function blankSlide(partial: Partial<Slide> = {}): Slide {
  const slide: Slide = { layout: 'bullets', title: '', subtitle: '', bullets: [], story: '', ...partial, id: partial.id || newId() };
  slide.bullets = [...slide.bullets];
  return slide;
}

export function sampleDeck(): Deck {
  return {
    version: 1,
    title: 'PumpkinPoint',
    style: 'origami',
    slides: [
      blankSlide({
        layout: 'title',
        title: 'PumpkinPoint',
        subtitle: 'Presentations that tell a story',
        story: 'A boat sits in the harbour at dawn, ready to set sail.',
      }),
      blankSlide({
        title: 'Slides don’t stick',
        bullets: ['Audiences forget most bullet points', 'Every deck looks the same', 'Motion graphics take days to design'],
        story: 'A storm rolls in. Out at sea, the boats drift in the rain, lost and all alike.',
      }),
      blankSlide({
        title: 'The idea',
        bullets: ['Write your slides as usual', 'Add the story behind each one', 'AI turns it into motion'],
        story: 'Then a lighthouse switches on. Its light cuts through the rain and shows the boats the way home.',
      }),
      blankSlide({
        layout: 'stat',
        title: '10 min',
        subtitle: 'from plain slides to a story-driven deck',
        story: 'Fast now, the wind fills the sails and the boat speeds toward the light.',
      }),
      blankSlide({
        title: 'How it works',
        bullets: [
          'Pick a style: origami, pop-up book, whiteboard or kinetic',
          'Edit a slide or its story and only that scene rebuilds',
          'Export one HTML file that runs in any browser',
        ],
        story: 'Other boats follow in its wake: a whole fleet sailing together under the morning sun.',
      }),
      blankSlide({
        layout: 'statement',
        title: 'Every slide has a story. Let it be told.',
        subtitle: 'Try it with your next talk',
        story: 'The fleet reaches the harbour as the sun rises over a golden sea.',
      }),
    ],
  };
}
