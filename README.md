# Portals

Audio-reactive portal animations at https://portals.labcat.nz

Two modes, one engine:
- **Customs** (`PortalsNo1`, `PortalsNo2`, …) — fixed `mp3 + .mid` in `public/audio/`, hybrid MIDI cues + FFT like other LABCAT series.
- **Upload** (`/play`) — user drops any audio file, pure FFT spectrum visualizer, no MIDI needed.

Follow on Instagram → https://www.instagram.com/labcat2020/

## Intergalactic Portals (the suite)

Three movements of three 8-bar parts at 97 bpm, each part its own `.mp3` +
`.mid` in `public/audio/` (listed in `src/audioTracks.js`) so each can be a
reel. One player (`src/sketches/PortalsSuite.js`, movements in
`src/movements/`) sits behind every movement's page: a part flows gaplessly
into the next, across movements too, switching visuals and address without a
reload; the panel's prev/next walk the whole suite. Capture
(`labcat-capture`) renders a single part, once.

| URL | Plays |
|---|---|
| `/number-1` | Singularity A → B → C → Event Horizon A → … |
| `/number-2?part=b` | starts on Event Horizon Part B (capture: that part only) |

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

## /play — interactive
https://portals.labcat.nz/play

Upload any audio file and watch the portal react. Pure FFT, no MIDI required.
Spectrum + Portal views, toggleable from the control panel (or `V`).
