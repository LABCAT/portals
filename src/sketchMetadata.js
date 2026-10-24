export const sketchMetadata = {
  'number-1': {
    title: '#PortalsNo1',
    description: 'Seeded nebula-tube flight locked to the beat — a new look every phrase.',
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
