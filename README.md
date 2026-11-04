# Cycletron packs

Packs for [Cycletron](https://github.com/nukleas/cycletron): each one is a
folder of visualizer modes, songs and shows that travel together and install
as one unit (`docs/PACKS.md` in the app repo has the format).

```
packs/<id>/            one pack; <id> is its pack.json id
  pack.json            the library manifest
  viz/<name>/          a visualizer pack: pack.json, src/, tsconfig.json
  songs/  shows/       the music and the show files
  README.md
```

The visualizer sources import `@cycletron/viz-sdk`, which `npm install`
links from the Cycletron checkout next to this repo
(`../cycletron/ui/packages/viz-sdk`). Building, rendering and the seam test
run in that checkout too, since they need the engine and the render page;
set `CYCLETRON` if it lives somewhere else.

```sh
npm install
npx cycpack check christmas                 # tsc on the pack's viz folders
npx cycpack build christmas                 # tsc + bundle each viz folder to dist/
npx cycpack zip christmas                   # build, then dist/christmas-<version>.zip
npx cycpack render packs/christmas/shows/jingle-bells.show.toml --size 960x540 --fps 24
npx cycpack seam christmas                  # the determinism test on the built modes
```

Install a zip in the app: Samples panel, Install from Zip, Replace if the pack
is already there; new visualizer code loads at the next launch.

Renders (`packs/*/renders/`), build output (`dist/`) and `_*` staging folders
are not tracked. Pack code runs inside the app with the app's permissions, so
the app only loads packs you install on purpose.
