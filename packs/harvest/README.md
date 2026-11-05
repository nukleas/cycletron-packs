# Harvest

The Harvest pack: the `naderlabs/harvest-3d` visualizer pack (autumn forest, parade,
cornfield, harvest moon, and the harvest palette) under `viz/`. No songs or shows yet;
the probe plays the Halloween pack's Bustin' through every mode. Cycletron loads
`viz/harvest-3d/dist/index.js` at startup while the pack is enabled
(`Packs/enabled.json`); see `docs/PACKS.md` in the Cycletron repo.

| Path | What |
| --- | --- |
| `pack.json` | Manifest: id, authors, license, the viz pack |
| `viz/harvest-3d/` | The visualizer pack: its own `pack.json` and the built `dist/index.js` (`src/` is in the repo only, not the zip) |
| `probe/probe.show.toml` | Every mode for two bars each, for `cycpack probe harvest` |
| `renders/` | Probe renders (not tracked) |
