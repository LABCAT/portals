export const sketchMetadata = {
  'number-1': {
    title: '#PortalsNo1',
    description: 'Bespoke portal flight custom — fixed track + MIDI cues land here.',
    sketch: 'PortalsNo1.js',
  },
};

export function getAllSketches() {
  return Object.keys(sketchMetadata).map(id => ({
    id,
    ...sketchMetadata[id],
  }));
}

export function getSketchById(id) {
  return sketchMetadata[id] || null;
}
