# New Year's Eve

The New Year's Eve pack: the `naderlabs/new-year-3d` visualizer pack (fireworks, ball
drop, and the midnight palette) under `viz/`. No songs or shows
yet; the probe borrows the Christmas pack's Deck the Halls (dubstep). Cycletron loads
`viz/new-year-3d/dist/index.js` at startup while the pack is enabled
(`Packs/enabled.json`); see `docs/PACKS.md` in the Cycletron repo.

| Path | What |
| --- | --- |
| `pack.json` | Manifest: id, authors, license, the viz pack |
| `viz/new-year-3d/` | The visualizer pack: its own `pack.json` and the built `dist/index.js` (`src/` is in the repo only, not the zip) |
| `probe/probe.show.toml` | Every mode for two bars each, for `cycpack probe new-year` |
| `renders/` | Renders (not tracked) |
