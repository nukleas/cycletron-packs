# Winter, 3D

A visualizer pack (see `docs/PACKS.md` in the Cycletron repo): two three.js modes, a band whose hits land on the frame the note sounds and the aurora, and the `glacier` palette. `dist/index.js` is what the app loads; it imports only `@cycletron/viz-sdk` and bundles its own copy of three. The sources live in the cycletron-packs repo (`src/modes/<mode>/` per mode, `src/lib/` for what the modes share, and the repo's `kit/` for what the packs share, including the one shared WebGL renderer), which builds and zips this folder; an installed copy carries only the build.

Ice cave is a band in an ice cavern. A yeti plays a two-octave marimba of crystals: every pitched note lights its crystal in the track's colour, and the yeti's mallets, raised over the next crystal an eighth of a bar before, land on the mid and lead notes. Kicks are the yeti's stomp, the bass lights two crystal pillars, and a penguin plays the snares on an ice drum and the hats on icicle chimes. A drop of meltwater swells a step a beat through each phrase's last bar and splashes on the downbeat. The camera cuts on the bar lines.

Aurora is the northern lights over a cabin on a snowy ridge. Five curtains share the pitched tracks; a note lights its curtain at its pitch and the light spreads while the note is held, so pads burn the whole sky and short notes flick. Highs shimmer the rays, kicks surge light up the curtains, snares are shooting stars, hats twinkle the stars, bass warms the window, and the snow takes the aurora's colour.

Geometry and materials are built once; `layout()` recolours them from the theme. Notes come from `HapField`; spawns run in `update()`, which also places everything, and `render()` only hands the scene to the shared renderer.
