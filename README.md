# Portals

Audio-reactive portal animations at https://portals.labcat.nz

Two modes, one engine:
- **Customs** (`PortalsNo1`, `PortalsNo2`, …) — fixed `mp3 + .mid` in `public/audio/`, hybrid MIDI cues + FFT like other LABCAT series.
- **Upload** (`/play`) — user drops any audio file, pure FFT spectrum visualizer, no MIDI needed.

Follow on Instagram → https://www.instagram.com/labcat2020/

## #PortalsNo1
https://portals.labcat.nz/number-1/

Seeded GLSL nebula-tube flight (`src/shaders/portalLoop.frag`), speed locked to
the track's BPM, a new look every 8-bar phrase. `?seed=` reproduces a look,
`?bpm=` / `?beats=` / `?uX=` tune it; the control panel adds prev/next track,
play your own track, auto look (hold) and new look.

## /play — interactive
https://portals.labcat.nz/play

Upload any audio file and watch the portal react. Pure FFT, no MIDI required.
Spectrum + Portal views, toggleable from the control panel (or `V`).
