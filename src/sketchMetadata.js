export const sketchMetadata = {
  'number-1': {
    title: '#PortalsNo1',
    description: 'Singularity, movement one of Intergalactic Portals: a nebula-tube flight locked to the beat, flying through a ring of light into each new part.',
    sketch: 'PortalsSuite.js',
  },
  'number-2': {
    title: '#PortalsNo2',
    description: 'Event Horizon, movement two of Intergalactic Portals: a neon honeycomb portal zooming into itself, lit note by note by the lead.',
    sketch: 'PortalsSuite.js',
  },
  'number-3': {
    title: '#PortalsNo3',
    description: 'Continuum, movement three of Intergalactic Portals: a flight down a hyperspace tunnel of rushing starlight, flooded with the first movement\'s nebula by its pad.',
    sketch: 'PortalsSuite.js',
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
