# Portals

Audio-reactive portal animations at https://portals.labcat.nz

Two modes, one engine:
- **The suite** — one song (`public/audio/IntergalticPortals.mp3` + `.mid`) playing three movements of three parts, with MIDI cues like the other LABCAT series.
- **Upload** (`/play`) — user drops any audio file, pure FFT spectrum visualizer, no MIDI needed.

Follow on Instagram → https://www.instagram.com/labcat2020/

## Intergalactic Portals (the suite)

Three movements of three 8-bar parts at 97 bpm, all one song
(`public/audio/IntergalticPortals.mp3` + `.mid`). The movements and their nine
parts are bar ranges in `src/audioTracks.js`; the suite `.mid` keeps the same
17-track slot layout the old per-part files had, with notes at absolute song
time. One player (`src/sketches/PortalsSuite.js`, movements in
`src/movements/`) sits behind every movement's page: the panel's prev/next
walk all nine parts, the address follows the movement without a reload, and the
current movement / part / time-within-part are derived from absolute song time.
Capture (`labcat-capture`) renders the whole suite, one movement, or one part:

| URL | Plays (live) | Capture |
|---|---|---|
| `/number-1` | Singularity, part A (prev/next walks the suite) | whole suite |
| `/number-2?part=b` | Event Horizon, part B | part B only |
| `/number-3?movement=3` | Continuum, part A | the whole Continuum movement |

## #PortalsNo1 Singularity
https://portals.labcat.nz/number-1/

Seeded GLSL nebula-tube flight (`src/shaders/portalLoop.frag`), speed locked to
the BPM. Parts change through a ring of light that rushes out of the core and
passes over you on the bar line, into a new look. `?seed=` reproduces a look,
`?bpm=` / `?beats=` / `?uX=` tune it; the control panel adds prev/next part,
play your own track, auto look (hold) and new look.

## #PortalsNo2 Event Horizon
https://portals.labcat.nz/number-2/

Seeded flight down a neon hexagonal tunnel through honeycomb gates
(`src/shaders/portalHive.frag`), same speed as Singularity. Each part's MIDI
lights it: every lead note changes the colour scheme (from the seed's six) and
lights one hex cell; Part B's bass pulses the frames, Part C's stabs and arps
flare the lasers and spark the circuits.

## #PortalsNo3 Continuum
https://portals.labcat.nz/number-3/

Seeded flight down a hyperspace tunnel (`src/shaders/portalWarp.frag`), same
speed as Singularity: lanes of starlight streaks rushing past faster than you,
into a soft light. Every lead note flares it and turns the streaks a click;
held notes change the colours. Thor 2, the first movement's pad, enters in
Parts B and C: Singularity's nebula floods in and each chord changes the
colours with Singularity's dip. Part C adds a third, fastest streak layer.
Plucks twinkle the stars, bass breathes the tunnel, stabs flash it; between
parts it spins up and burns to white.

## /play — interactive
https://portals.labcat.nz/play

Upload any audio file and watch the portal react. Pure FFT, no MIDI required.
Spectrum + Portal views, toggleable from the control panel (or `V`).
