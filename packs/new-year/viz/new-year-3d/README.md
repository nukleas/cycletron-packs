# New Year's Eve, 3D

A visualizer pack (see `docs/PACKS.md` in the Cycletron repo): two three.js modes and the `midnight` palette. `dist/index.js` is what the app loads; it imports only `@cycletron/viz-sdk` and carries its own copy of three. The sources live in the cycletron-packs repo (`src/modes/<mode>/` per mode, `src/lib/` for what the modes share, and the repo's `kit/` for what the packs share), which builds and zips this folder; an installed copy carries only the build.

Fireworks is a harbour skyline. Every pitched note is a shell that launches a little over a second early, so it bursts on its onset: pitch is height, the register picks the shell (bass willows on the beat, mid chrysanthemums, lead peonies), long notes burst wider. Snares are white salutes, crashes rings, kicks barge fountains; hats make the stars crackle. Bursts light the haze and the upper floors in their colour, and the water carries a dim mirror of the sky.

Ball drop is a mirror ball on a tower mast. It slides down across every eight-bar phrase while the display counts the beats left, lands on the next downbeat (00, a white flash and a shower of sparks) and climbs back up over the first beat. Its facets are LED panels: a note lights the ring at its pitch's latitude in its track colour. The billboards follow one track each; kicks flash the ball and the searchlights.

Both draw through `@naderlabs/kit/gl`'s shared renderer. Sparks and lights are one pooled `Points` buffer per mode (`lib/glow.ts`). Shells, sparks and the landing shower are closed-form paths from an onset and a seed. `render()` only turns state into buffers. Colours come from the theme in `layout()`.
