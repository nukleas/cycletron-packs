# New Year's Eve, 3D

A visualizer pack (see `docs/PACKS.md` in the Cycletron repo): four three.js modes and the `midnight` palette. `dist/index.js` is what the app loads; it imports only `@cycletron/viz-sdk` and carries its own copy of three. The sources live in the cycletron-packs repo (`src/modes/<mode>/` per mode, `src/lib/` for what the modes share, and the repo's `kit/` for what the packs share), which builds and zips this folder; an installed copy carries only the build.

Fireworks is a harbour skyline. Every pitched note is a shell that launches a little over a second early, so it bursts on its onset: pitch is height, the register picks the shell (bass willows on the beat, mid chrysanthemums, lead peonies), long notes burst wider. Snares are white salutes, crashes rings, kicks barge fountains; hats make the stars crackle. Bursts light the haze and the upper floors in their colour, and the water carries a dim mirror of the sky.

Ball drop is a mirror ball on a tower mast. It slides down across every eight-bar phrase while the display counts the beats left, lands on the next downbeat (00, a white flash and a shower of sparks) and climbs back up over the first beat. Its facets are LED panels: a note lights the ring at its pitch's latitude in its track colour. The billboards follow one track each; kicks flash the ball and the searchlights.

Confetti is a ballroom. Hats shake puffs from the ceiling nets, snares fire a floor cannon (sides take turns), crashes fire both, kicks are gusts. Pitched notes light the bokeh along the back wall like a keyboard. What lands stays on the floor until it fades.

Champagne is a tower of fourteen coupes. Each downbeat pours into the top glass; a full glass spills into the four under it, so the tower fills from the top and then cascades. Notes clink a glass by pitch (rim flash, slosh), hats and the highs fizz, kicks light the wine, snares splash the top glass.

All four draw through `@naderlabs/kit/gl`'s shared renderer. Sparks, bubbles and lights are one pooled `Points` buffer per mode (`lib/glow.ts`); confetti is one `InstancedMesh`. Shells, sparks and the landing shower are closed-form paths from an onset and a seed; confetti and the champagne levels are stepped in `update()`. `render()` only turns state into buffers. Colours come from the theme in `layout()`.
