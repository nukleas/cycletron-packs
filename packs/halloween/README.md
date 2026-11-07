# Halloween

The Halloween pack: the `naderlabs/halloween-8bit` visualizer pack (graveyard, haunted
house, monster band, Ghost in the Machine, and the pumpkin palette) under `viz/`, and the songs,
shows and renders made for it. Cycletron loads `viz/halloween-8bit/dist/index.js` at
startup while the pack is enabled (`Packs/enabled.json`); see `docs/PACKS.md` in the
Cycletron repo.

| Path | What |
| --- | --- |
| `pack.json` | Manifest: id, authors, license, the viz pack, its songs and shows |
| `viz/halloween-8bit/` | The visualizer pack: its own `pack.json` and the built `dist/index.js` (`src/` is in the repo only, not the zip) |
| `songs/bustin-neil-cicierega.strudel` | Bustin' (Neil Cicierega), sectioned. A cover, so it stays out of the public repo |
| `songs/_bustin-neil-cicierega/` | The MIDI, the flat import, and the copy from before the mix |
| `shows/bustin.show.toml` | The Bustin' show |
| `songs/danse-macabre.strudel` | Danse Macabre (Saint-Saëns, 1874), from Liszt's piano transcription (Durand, 1876; Sibley Music Library scan) |
| `songs/mountain-king.strudel` | In the Hall of the Mountain King (Grieg, 1875), from the Mutopia piano score (public domain); speeds up section by section |
| `songs/marionette-march.strudel` | Funeral March of a Marionette (Gounod, 1872), from an 1890s piano edition (University of Toronto scan) |
| `songs/toccata-d-minor.strudel` | Toccata and Fugue in D minor, BWV 565 (Bach), from the Mutopia score (public domain) |
| `songs/_<slug>/` | Each song's source score or MIDI and working files (ignored) |
| `shows/<slug>.show.toml` | A show per song |
| `renders/` | Show renders (`out` in the show file) |

Render the show from this repo:

    npx cycpack render packs/halloween/shows/bustin.show.toml
