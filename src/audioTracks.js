// Tracks Portal Loops cycles through with the panel's prev/next buttons.
// Files live in public/audio/; the first one is the default. For our own
// tracks give the exact bpm and firstBeat (seconds to the first downbeat; 0
// for a DAW export that starts on bar 1) so loops land on the bar line.
// Without them (and for uploaded files) tempo and first beat are detected.
export const LOOP_TRACKS = [{ title: 'PortalsNo1', src: '/audio/PortalsNo1.mp3', bpm: 97, firstBeat: 0 }];
