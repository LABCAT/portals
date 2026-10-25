// The suite, Intergalactic Portals: three movements of three 8-bar parts,
// each part its own .mp3 + .mid in public/audio/ (so each can be a reel). The
// panel's prev/next buttons walk every part of every movement that has a
// route; playing on, a part flows into the next. All exported from the DAW
// at 97 bpm starting on bar 1 (firstBeat 0, plus whatever silence the mp3
// encoder added, which is measured on load).

export const SUITE_BPM = 97;

export const SUITE = [
  { number: 1, title: 'Singularity', route: 'number-1', file: 'PortalsNo1-Singularity' },
  { number: 2, title: 'Event Horizon', route: 'number-2', file: 'PortalsNo2-EventHorizon' },
  { number: 3, title: 'Continuum', route: 'number-3', file: 'PortalsNo3-Continuum' },
];

export const SUITE_PARTS = SUITE.flatMap((movement) =>
  ['a', 'b', 'c'].map((part) => {
    const name = `${movement.file}-Part${part.toUpperCase()}`;
    return {
      title: `${movement.title} · Part ${part.toUpperCase()}`,
      src: `/audio/${name}.mp3`,
      midi: `/audio/${name}.mid`,
      prefix: name,
      route: movement.route,
      movement: movement.number,
      part,
      bpm: SUITE_BPM,
      firstBeat: 0,
      bars: 8,
    };
  })
);
