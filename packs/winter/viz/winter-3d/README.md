# Winter, 3D

A visualizer pack (see `docs/PACKS.md` in the Cycletron repo): four three.js modes and the `glacier` palette. `dist/index.js` is what the app loads; it imports only `@cycletron/viz-sdk` and bundles its own copy of three. The sources live in the cycletron-packs repo (`src/modes/<mode>/` per mode, `src/lib/` for what the modes share, and the repo's `kit/` for what the packs share, including the one shared WebGL renderer), which builds and zips this folder; an installed copy carries only the build.

Ice cave is a flight down a tunnel of ice where distance is musical time. Notes are crystals budding on the walls three bars ahead: pitch is the height up the wall, length is the size. They shoot to full size at the ring that marks now and glow in their track's colour while they sound. Kicks flash the ring, snares drop shards from the roof, hats glint.

Frozen lake is a low camera over the ice between two pine shores. Each pitched track is a crack in its colour, and each note pushes it on: the interval from the last note turns it, the length is how far it runs, and the stretch glows as it opens and cools to a scar. Notes struck together fork it, held notes well up as light under the ice. Kicks send shock rings, snares splinter stars, hats glint.

Aurora is the northern lights over a cabin on a snowy ridge. Five curtains share the pitched tracks; a note lights its curtain at its pitch and the light spreads while the note is held, so pads burn the whole sky and short notes flick. Highs shimmer the rays, kicks surge light up the curtains, snares are shooting stars, hats twinkle the stars, bass warms the window, and the snow takes the aurora's colour.

Ski jump is a floodlit jump at night, one jumper a bar: the in-run, the lip on beat three, the landing on the next downbeat. The bar's highest note sets the distance and a line marks the spot. Kicks throw snow from the skis, the lamps along the hill light by pitch, held notes brighten the floodlights, snares are camera flashes in the crowd. The cameras cut like a broadcast.

Geometry and materials are built once; `layout()` recolours them from the theme. Notes come from `HapField`; spawns run in `update()`, which also places everything, and `render()` only hands the scene to the shared renderer.
