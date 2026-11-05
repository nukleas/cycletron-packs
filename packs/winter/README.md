# Winter

The Winter pack: the `naderlabs/winter-3d` visualizer pack (ice cave, frozen lake,
aurora, ski jump, and the glacier palette) under `viz/`. A 3D follow-up to the 8-bit
Christmas pack, drawn in three.js. Cycletron loads `viz/winter-3d/dist/index.js` at
startup while the pack is enabled (`Packs/enabled.json`); see `docs/PACKS.md` in the
Cycletron repo. It has no songs or shows of its own yet; the probe plays it to the
Christmas pack's Silver Bells / Silent Night.

| Path | What |
| --- | --- |
| `pack.json` | Manifest: id, authors, license, the viz pack |
| `viz/winter-3d/` | The visualizer pack: its own `pack.json` and the built `dist/index.js` (`src/` is in the repo only, not the zip) |
| `probe/probe.show.toml` | Every mode for two bars, for `cycpack probe winter` |
| `renders/` | Renders (`out` in the show file) |
