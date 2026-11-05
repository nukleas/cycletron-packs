# Cycletron packs

Packs for [Cycletron](https://github.com/nukleas/cycletron): each one is a
folder of visualizer modes, songs and shows that travel together and install
as one unit (`docs/PACKS.md` in the app repo has the format). The app's own
modes stay its cyberpunk core; the seasonal one-offs (Halloween, Christmas)
live here.

```
packs/<id>/            one pack; <id> is its pack.json id
  pack.json            the library manifest
  viz/<name>/          a visualizer pack: pack.json, src/, tsconfig.json
  songs/  shows/       the music and the show files
  probe/               probe.show.toml: every mode, two bars each (cycpack probe)
  README.md
kit/                   @naderlabs/kit, scene parts the packs share
bin/cycpack.ts         the CLI
```

Inside a visualizer pack's `src/`:

```
index.ts               the VizPack: manifest, mode defs, palettes
modes/<mode>/          one folder per mode: index.ts exports its VizModeDef,
                       next to the helpers only that mode uses
lib/                   code two or more modes share, nothing else
```

A helper starts in its mode's folder and moves to `lib/` when a second mode
imports it; one mode never imports from another mode's folder.

`kit/` is the tier above: code that two or more *packs* share, imported as
`@naderlabs/kit/<module>` (an npm workspace; `npm install` links it).
Today it holds `pen` (outlined rect figures), `drum-rig` (a seated drummer's
kit flashes and arm strokes), `night` (stars, clouds, ridge, moon, dither),
`roles` (hap roles by drum voice and register), `color`, and `gl` (the
three.js bridge and `setRgb`). Each pack's build
bundles what it uses, so an installed pack still needs only the SDK. Code
moves into the kit when it is the same in two packs; what makes a pack look
like itself (sprites, colours, which sounds count as which drum) stays in the
pack.

## three.js modes

A mode still gets the host's 2D context, so a three.js mode renders its scene
with `drawScene(ctx, scene, camera, s.width, s.height, s.dpr)` from
`@naderlabs/kit/gl`, which draws through one WebGL renderer shared by every
three.js mode in the page. The host never disposes a mode, so a renderer per
mode would leak a GL context on every entry. The same rules hold as for 2D:
drive every transform from `s.cycle` and the audio, never `THREE.Clock` or
`performance.now()`, and seed randomness with the sdk's `SeededRandom`. Build
geometry in the constructor or `layout()`, move it in `update()`, and only
draw in `render()`. Theme colours go in through `setRgb` (also in `kit/gl`):
theme triples are sRGB, and a bare `setRGB` or `new Color(r, g, b)` reads them
as linear and washes them out.

Two three.js habits break the seam test, so avoid them:

- **Two InstancedMeshes sharing one material.** It renders a level or few off
  on edge pixels depending on where the render started, even with identical
  scene state. Give each InstancedMesh its own material.
- **Culling moving instances.** three computes an InstancedMesh's bounds once,
  at its first draw, so instances that move later get culled against stale
  bounds. Set `frustumCulled = false` on any InstancedMesh or Points whose
  contents move.

The renderer runs headless Chromium's WebGL (SwiftShader,
a software rasterizer), so renders are exact and the seam test and probe work
unchanged, though a busy scene renders slower than a 2D mode. Each three.js
pack bundles its own copy of three (`three` is pinned to one minor in the
root `package.json`).

Not in the kit yet: the three.js packs each have their own sky dome, glow
sprites and instance pools. They do similar jobs in different ways, so they
stay in the packs until one version clearly serves all three.

Everything here is TypeScript: the modes run in the app's web view, and
`bin/cycpack.ts` runs on Node's type stripping (Node 22.18 or newer), no build.

The visualizer sources import `@cycletron/viz-sdk`, which `npm install`
links from the Cycletron checkout next to this repo
(`../cycletron/ui/packages/viz-sdk`). Building, rendering and the seam test
run in that checkout too, since they need the engine and the render page;
set `CYCLETRON` if it lives somewhere else.

```sh
npm install
npm run lint                                # oxlint (with oxlint-anti-slop) on the whole repo
npx cycpack check christmas                 # tsc + oxlint on the pack's viz folders, bin/ and kit/
npx cycpack build christmas                 # tsc + bundle each viz folder to dist/
npx cycpack zip christmas                   # build, then dist/christmas-<version>.zip
npx cycpack render packs/christmas/shows/jingle-bells.show.toml --size 960x540 --fps 24
npx cycpack seam christmas                  # build, then the determinism test on the built modes
npx cycpack probe christmas                 # render probe/, hash the frames, compare with the last probe
```

`render`, `seam` and `probe` build the pack first: the renderer only rebuilds
when a pack's `src/` is newer than its `dist/`, which misses kit edits.

A refactor that should change nothing (moving code into the kit, renames,
lint fixes) should leave `cycpack probe` saying `unchanged`. It renders on one
job, so the frames are exact; the digest of the last probe is kept in
`renders/probe.digest`.

Install a zip in the app: Samples panel, Install from Zip, Replace if the pack
is already there; new visualizer code loads at the next launch. The zip
carries the built `dist/` but not `src/`, which imports the kit.

Renders (`packs/*/renders/`), build output (`dist/`) and `_*` staging folders
are not tracked. Pack code runs inside the app with the app's permissions, so
the app only loads packs you install on purpose.

## Lint

`.oxlintrc.json` runs Oxlint's correctness and suspicious categories plus the
[oxlint-anti-slop](https://github.com/emilioSp/oxlint-anti-slop) rules, all as
errors; `cycpack check` fails on any finding. Two rules are off on purpose:
`anti-slop/require-logical-blank-lines` (a spacing convention that fights the
dense drawing code) and `unicorn/no-array-sort` (`toSorted` is ES2023 and
allocates a copy each frame; in-place sorts of per-frame scratch arrays are
intended). A type assertion needs a `JUSTIFICATION:` comment, but type the
value so the assertion isn't needed first. `no-restricted-imports` holds the
layout above: a mode can't import another mode's folder, `lib/` can't import
a mode, and `kit/` can't import a pack.
