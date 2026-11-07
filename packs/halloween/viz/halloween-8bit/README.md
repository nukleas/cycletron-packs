# Halloween, 8-bit

A visualizer pack (see `docs/PACKS.md` in the Cycletron repo): four modes and the `pumpkin` palette, drawn for the Bustin' show. `dist/index.js` is what the app loads; it imports only `@cycletron/viz-sdk`. The sources live in the cycletron-packs repo (`src/modes/<mode>/` per mode, `src/lib/` for what the modes share, and the repo's `kit/` for what the packs share), which builds and zips this folder; an installed copy carries only the build.

Graveyard is a Ghosts 'n Goblins / Castlevania yard: three terraces, grid tombs, bone sprites that climb out and cycle two or four dance frames on the beat. Held notes are Boo ghosts. Hats are two-frame bats, snares are staircase bolts, kicks hop the ground.

Haunted house is a NES mansion. Floors are registers and windows are pitch slots, each with a two-frame silhouette. Kicks open the door, hats light porch pumpkins, held notes puff chimney ghosts, the vane steps eight ways.

Ghost in the Machine is an imagined machine self-portrait: an asymmetric sensor array, a cognitive lattice, two rotating tetrahedra at its core, and a woven waveform speech field. A curved vector shell turns with melody pitch; bass opens the speech socket, chords widen the sensors and surrounding cage, snares separate the face plates, and leads extend the crown contacts. Kicks compress and expand the kernel and launch shock rings; hats advance orbital contacts.

The background is a full circuit board: two copper colours, memory dies, pins, vias, return paths, and edge buses. Each register / pitch class owns a fixed trace. Every pitched hap travels that trace half a cycle before onset, docks on the corresponding facial contact, displays its remaining hold as an arc, then returns through the board after release. Held notes illuminate their copper; spectrum bands drive the memory cells, and the live waveform weaves the speech field. Stopped playback leaves a dormant machine.

The projected face and PCB are resolution-independent canvas vectors. Flights, rings, and poses are sampled from absolute cycle time without accumulated trails or random motion, so seeks and render chunks remain deterministic. Its persistence ID remains `ghost-fog`, preserving existing shows and saved selections.

Graveyard and haunted house retain their 320×180 pixel buffers, solid theme colours and 2×2 dither. Ghost in the Machine uses a 640×360 logical coordinate system scaled directly to the output canvas, preserving fine vectors at larger sizes. None of these modes uses trail fade.

Sprites are small bitmaps: skeletons, tombs, bats, the moon, pumpkins, ghosts. Spawns and followers run in update(); render only reads state.
