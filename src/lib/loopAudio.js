import { guess } from 'web-audio-beat-detector';

// Audio for Portal Loops: a track list (suite parts from public/audio plus
// any local file the viewer picks or drops), raw Web Audio playback (no
// p5.sound, works everywhere), and BPM + first-beat detection so the flight
// can lock to the music. Talks to the lab ControlPanel through its window
// events:
//   listen   'labcat:toggle-playback', 'labcat:track-prev', 'labcat:track-next'
//   dispatch 'labcat:playback' { playing }, 'labcat:track' { title }
//
// Suite parts (tracks with `bars`) play once and flow gaplessly into the
// next part: the next file is scheduled sample-accurately on the current
// one's last bar line. Uploaded files loop on their own.
// Callbacks: onBeat({ bpm, offset }) when a track's tempo is known,
// onTrack(track) on every track change, onAdvance(track) when playback
// flows into the next part on its own (not on prev/next or play).

const MIN_BPM = 60;
const MAX_BPM = 200;
// mp3s without a LAME header keep the encoder's leading silence (~25ms);
// measured per file and skipped so the joins land on the beat.
const MAX_LEAD = 0.06;
const SCHEDULE_MS = 250;

const leadOf = (buffer) => {
  const data = buffer.getChannelData(0);
  const max = Math.min(data.length, Math.floor(MAX_LEAD * buffer.sampleRate));
  for (let i = 0; i < max; i++) if (Math.abs(data[i]) > 1e-5) return i / buffer.sampleRate;
  return 0;
};

/** Musical length of a suite part in seconds (bars of 4/4), else null. */
const lengthOf = (track) => (track?.bars ? (track.bars * 240) / (track.beat?.bpm ?? track.bpm) : null);

export const createLoopAudio = (tracks, { start = 0, onBeat, onTrack, onAdvance } = {}) => {
  const list = tracks.map((t) => ({ ...t, buffer: null, beat: null, raw: null, ready: null, missing: false }));
  let index = Math.max(0, Math.min(list.length - 1, start));
  // Known tempos apply before the first play, so the flight already matches.
  const initial = list[index]?.bpm ? { bpm: list[index].bpm, offset: list[index].firstBeat ?? 0 } : null;
  let actx = null;
  let decoder = null;
  let source = null;
  let pending = null; // next part, scheduled: { index, source, at, startedAt }
  let startedAt = 0; // audio-clock time at which the current track's position was 0
  let pausedAt = 0;
  let playing = false;
  let token = 0;

  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  const current = () => list[index];
  const announce = (suffix = '') => {
    emit('labcat:track', { title: current() ? current().title + suffix : '' });
    if (!suffix) onTrack?.(current());
  };
  const setPlaying = (on) => {
    playing = on;
    emit('labcat:playback', { playing: on });
  };
  // Parts flow into the next part (wrapping to the first); uploads don't.
  const nextPart = (i) => (list[i + 1]?.bars ? i + 1 : 0);

  // Fetch the files up front (no user gesture needed).
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

  // Decoding doesn't need the (click-gated) playback context: an offline one
  // decodes before the first play, so parts are ready ahead of time.
  const decode = (raw) => {
    if (!decoder) decoder = new OfflineAudioContext(2, 1, 44100);
    return decoder.decodeAudioData(raw.slice(0));
  };

  // Decode once per track. Known tracks carry their exact bpm/firstBeat;
  // otherwise detect them. Float tempo (not rounded) so the flight doesn't
  // drift off the grid by the end of the track. Detection finds *a* beat,
  // not necessarily the bar's downbeat, so exact values win when we have them.
  const prepare = (track) => {
    track.ready ??= (async () => {
      const raw = track.file ? await track.file.arrayBuffer() : await track.raw;
      if (!raw) return false;
      track.buffer = await decode(raw);
      const lead = track.bars ? leadOf(track.buffer) : 0;
      if (track.bpm) {
        track.beat = { bpm: track.bpm, offset: (track.firstBeat ?? 0) + lead };
        return true;
      }
      try {
        const g = await guess(track.buffer);
        if (Number.isFinite(g.tempo) && g.tempo >= MIN_BPM && g.tempo <= MAX_BPM) {
          track.beat = { bpm: g.tempo, offset: Math.max(0, g.offset || 0) };
        }
      } catch {
        track.beat = null;
      }
      return true;
    })().catch(() => false);
    return track.ready;
  };

  const stop = (src) => {
    if (!src) return;
    src.onended = null;
    try {
      src.stop();
    } catch {
      // already stopped
    }
    src.disconnect();
  };
  const stopAll = () => {
    stop(source);
    stop(pending?.source);
    source = null;
    pending = null;
  };

  const makeSource = (track) => {
    const src = actx.createBufferSource();
    src.buffer = track.buffer;
    src.connect(actx.destination);
    // A part that ends with nothing scheduled after it (the next file wasn't
    // ready in time) moves on the slow way.
    src.onended = () => {
      if (src === source && playing && !pending) select(nextPart(index), true);
    };
    return src;
  };

  // Queue the next part to start exactly on the current part's last bar line
  // (its first beat lined up there too); the current part stops at that
  // instant, cutting the encoder's trailing padding.
  const scheduleNext = async () => {
    const my = token;
    const n = nextPart(index);
    const next = list[n];
    if (!(await prepare(next)) || my !== token || !source || pending) return;
    const cur = current();
    const at = startedAt + cur.beat.offset + lengthOf(cur);
    if (at < actx.currentTime + 0.05) return;
    const src = makeSource(next);
    src.start(at, next.beat.offset);
    source.stop(at);
    pending = { index: n, source: src, at, startedAt: at - next.beat.offset };
  };

  const latency = () => actx.outputLatency || actx.baseLatency || 0;

  // Hand over to the scheduled part once it's heard (or right away when
  // pausing). Checked every frame by position() and on a timer, so it still
  // happens in a background tab.
  const advance = (now = false) => {
    if (!pending || !actx) return;
    if (actx.currentTime - (now ? 0 : latency()) < pending.at) return;
    index = pending.index;
    source = pending.source;
    startedAt = pending.startedAt;
    pending = null;
    announce();
    onBeat?.(current().beat);
    onAdvance?.(current());
    scheduleNext();
  };
  setInterval(advance, SCHEDULE_MS);

  const begin = (offset) => {
    stopAll();
    const track = current();
    source = makeSource(track);
    source.loop = !track.bars;
    source.start(0, track.bars ? offset : offset % track.buffer.duration);
    startedAt = actx.currentTime - offset;
    setPlaying(true);
    if (track.bars) scheduleNext();
  };

  const play = async () => {
    const my = ++token;
    ensureCtx();
    const track = current();
    if (!track) return;
    if (!track.buffer) announce(' · loading…');
    const ok = await prepare(track);
    if (my !== token) return;
    if (!ok) {
      announce(' · not found');
      setPlaying(false);
      return;
    }
    announce();
    onBeat?.(track.beat);
    // A part starts on its first beat; resuming picks up where it paused.
    begin(pausedAt || (track.bars ? track.beat.offset : 0));
  };

  const pause = () => {
    token++;
    if (playing && actx) {
      advance(true);
      pausedAt = actx.currentTime - startedAt;
    }
    stopAll();
    setPlaying(false);
  };

  function select(next, autoplay) {
    const n = (next + list.length) % list.length;
    pause();
    index = n;
    pausedAt = 0;
    announce(current().missing ? ' · not found' : '');
    if (autoplay) play();
    else if (current().beat) onBeat?.(current().beat);
  }

  const addFile = (file) => {
    list.push({ title: file.name.replace(/\.[^.]+$/, ''), file, buffer: null, beat: null, raw: null, ready: null, missing: false });
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
  if (initial) queueMicrotask(() => onBeat?.(initial));

  return {
    /** Seconds into the current track as heard, while playing, else null
     * (what you hear lags the audio clock by the device's output latency,
     * tens of ms on Windows, far more over Bluetooth, so it's subtracted).
     * Slightly negative just after play, before the first sound arrives. */
    position: () => {
      if (!playing || !actx || !source) return null;
      advance();
      const heard = actx.currentTime - startedAt - latency();
      return heard < 0 || current().bars ? heard : heard % source.buffer.duration;
    },
    /** First-beat offset of the current track (seconds), 0 if unknown. */
    beatOffset: () => current()?.beat?.offset ?? 0,
    /** Musical length of the current part (seconds), null for looping tracks. */
    length: () => lengthOf(current()),
    current,
    /** Decode the current track without playing it (capture). */
    prepareCurrent: () => prepare(current()).then((ok) => (ok ? current() : null)),
    isPlaying: () => playing,
  };
};
