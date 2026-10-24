import { guess } from 'web-audio-beat-detector';

// Audio for Portal Loops: a track list (public/audio files plus any local
// file the viewer picks or drops), raw Web Audio playback (no p5.sound, works
// everywhere), and BPM + first-beat detection so the flight can lock to the
// music. Talks to the lab ControlPanel through its window events:
//   listen   'labcat:toggle-playback', 'labcat:track-prev', 'labcat:track-next'
//   dispatch 'labcat:playback' { playing }, 'labcat:track' { title }
// The sketch reads position() each frame and gets onBeat({ bpm, offset })
// whenever a track's tempo is known.

const MIN_BPM = 60;
const MAX_BPM = 200;

export const createLoopAudio = (tracks, { onBeat } = {}) => {
  const list = tracks.map((t) => ({ ...t, buffer: null, beat: null, raw: null, missing: false }));
  let index = 0;
  let actx = null;
  let source = null;
  let startedAt = 0;
  let pausedAt = 0;
  let playing = false;
  let token = 0;

  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  const current = () => list[index];
  const announce = (suffix = '') => emit('labcat:track', { title: current() ? current().title + suffix : '' });
  const setPlaying = (on) => {
    playing = on;
    emit('labcat:playback', { playing: on });
  };

  // Fetch files up front (no user gesture needed); decoding waits for the
  // AudioContext, which browsers only allow after a click.
  list.forEach((track) => {
    if (!track.src) return;
    track.raw = fetch(track.src)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
      .catch(() => {
        track.missing = true;
        return null;
      });
  });

  const ensureCtx = () => {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  };

  // Decode + detect tempo once per track. Float tempo (not rounded) so the
  // flight doesn't drift off the grid by the end of the track.
  const prepare = async (track) => {
    if (track.buffer) return true;
    const raw = track.file ? await track.file.arrayBuffer() : await track.raw;
    if (!raw) return false;
    announce(' · analysing…');
    track.buffer = await ensureCtx().decodeAudioData(raw.slice(0));
    try {
      const g = await guess(track.buffer);
      if (Number.isFinite(g.tempo) && g.tempo >= MIN_BPM && g.tempo <= MAX_BPM) {
        track.beat = { bpm: g.tempo, offset: Math.max(0, g.offset || 0) };
      }
    } catch {
      track.beat = null;
    }
    return true;
  };

  const stopSource = () => {
    if (!source) return;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // already stopped
    }
    source.disconnect();
    source = null;
  };

  const start = (offset) => {
    stopSource();
    const track = current();
    source = actx.createBufferSource();
    source.buffer = track.buffer;
    source.loop = true;
    source.connect(actx.destination);
    source.start(0, offset % track.buffer.duration);
    startedAt = actx.currentTime - offset;
    setPlaying(true);
  };

  const play = async () => {
    const my = ++token;
    ensureCtx();
    const track = current();
    if (!track) return;
    const ok = await prepare(track);
    if (my !== token) return;
    if (!ok) {
      announce(' · not found');
      setPlaying(false);
      return;
    }
    announce();
    onBeat?.(track.beat);
    start(pausedAt);
  };

  const pause = () => {
    token++;
    if (playing && actx) pausedAt = actx.currentTime - startedAt;
    stopSource();
    setPlaying(false);
  };

  const select = (next, autoplay) => {
    pause();
    index = (next + list.length) % list.length;
    pausedAt = 0;
    announce(current().missing ? ' · not found' : '');
    if (autoplay) play();
    else if (current().beat) onBeat?.(current().beat);
  };

  const addFile = (file) => {
    list.push({ title: file.name.replace(/\.[^.]+$/, ''), file, buffer: null, beat: null, raw: null, missing: false });
    select(list.length - 1, true);
  };

  window.addEventListener('labcat:toggle-playback', () => (playing ? pause() : play()));
  window.addEventListener('labcat:track-prev', () => select(index - 1, playing));
  window.addEventListener('labcat:track-next', () => select(index + 1, playing));
  window.addEventListener('portals:file', (e) => e.detail?.file && addFile(e.detail.file));
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('audio/')) addFile(file);
  });

  announce();
  setPlaying(false);

  return {
    /** Seconds into the current track while playing, else null. */
    position: () => (playing && actx && source ? (actx.currentTime - startedAt) % source.buffer.duration : null),
    /** First-beat offset of the current track (seconds), 0 if unknown. */
    beatOffset: () => current()?.beat?.offset ?? 0,
    isPlaying: () => playing,
  };
};
