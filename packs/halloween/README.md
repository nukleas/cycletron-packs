# Halloween

The Halloween pack: the `naderlabs/halloween-8bit` visualizer pack (graveyard, haunted
house, monster band, ghost fog, and the pumpkin palette) under `viz/`, and the songs,
shows and renders made for it. Cycletron loads `viz/halloween-8bit/dist/index.js` at
startup while the pack is enabled (`Packs/enabled.json`); see `docs/PACKS.md` in the
Cycletron repo.

| Path | What |
| --- | --- |
| `pack.json` | Manifest: id, authors, license, the viz pack, its songs and shows |
| `viz/halloween-8bit/` | The visualizer pack: `src/`, the built `dist/index.js`, its own `pack.json` |
| `songs/bustin-neil-cicierega.strudel` | Bustin' (Neil Cicierega), sectioned. A cover, so it stays out of the public repo |
| `songs/_bustin-neil-cicierega/` | The MIDI, the flat import, and the copy from before the mix |
| `shows/bustin.show.toml` | The Bustin' show |
| `renders/` | Show renders (`out` in the show file) |

Render the show from the Cycletron repo:

    cd ui && node scripts/render-viz.mjs ~/Code/strulibrary/Packs/halloween/shows/bustin.show.toml
