# Winter

The Winter pack: the `naderlabs/winter-3d` visualizer pack (ice cave, yeti DJ,
penguin warehouse, ice organ, aurora, and the glacier palette) under `viz/`, and a four-track
hard-techno EP to play on it. A 3D follow-up to the 8-bit Christmas pack, drawn in
three.js. Cycletron loads `viz/winter-3d/dist/index.js` at startup while the pack is
enabled (`Packs/enabled.json`); see `docs/PACKS.md` in the Cycletron repo. The probe
plays the modes to the Christmas pack's Silver Bells / Silent Night.

The EP is original, written for these modes; `shows/winter-ep.show.toml` plays it start to
finish. The cave, the booth, the warehouse and the organ draw the songs' glitches from their notes: a stutter loops the picture and jumps the camera, and
a hole before a drop cracks ice over the lens until the drop shatters it.

| Song | Show | What |
| --- | --- | --- |
| `songs/permafrost.strudel` | `shows/permafrost.show.toml` | 150 bpm industrial: an FM metal hook, a full-band stutter into a tape stop, an aurora thaw |
| `songs/rookery.strudel` | `shows/rookery.show.toml` | 145 bpm acid hard groove, with a vowel-formant lead answering the hook |
| `songs/crevasse.strudel` | `shows/crevasse.show.toml` | 140 bpm A phrygian, from the deep-phrygian sketches: a bass rocking on the half step from A to B♭, on the ice organ |
| `songs/avalanche.strudel` | `shows/avalanche.show.toml` | 155 bpm schranz: a rumble kick, an aurora breakdown, a double-time second drop |
| | `shows/winter-ep.show.toml` | The four back to back: Permafrost, Rookery, Crevasse, Avalanche |

| Path | What |
| --- | --- |
| `pack.json` | Manifest: id, authors, license, the viz pack, the songs and shows |
| `viz/winter-3d/` | The visualizer pack: its own `pack.json` and the built `dist/index.js` (`src/` is in the repo only, not the zip) |
| `probe/probe.show.toml` | Every mode for two bars, for `cycpack probe winter` |
| `renders/` | Renders (`out` in the show file) |
