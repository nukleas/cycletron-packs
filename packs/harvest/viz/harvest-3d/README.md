# Harvest, 3D

A visualizer pack (see `docs/PACKS.md` in the Cycletron repo): four three.js modes and the `harvest` palette, low-poly and flat-shaded. `dist/index.js` is what the app loads; it imports only `@cycletron/viz-sdk` and bundles its own copy of three. The sources live in the cycletron-packs repo (`src/modes/<mode>/` per mode, `src/lib/` for what the modes share, and the repo's `kit/` for what the packs share, `gl` above all), which builds and zips this folder; an installed copy carries only the build.

Autumn forest walks a woodland path, one stretch per bar. The bass sways the maples, kicks are gusts that lean them and blow the falling leaves sideways, hats shake single leaves loose, snares a whole crown. Pitched notes drop big leaves in the track colour, low notes left of the path, high notes right.

Parade is Main Street from the kerb: balloon floats (a turkey, a pumpkin, an acorn) and marching bands go by, one block per bar, stepping on the beat. Pitch picks the file of the band and that player's horn lifts and flares in the track colour; kicks hit the bass drum, snares throw confetti off the roofs, hats bounce the crowd, the bass lifts the balloons.

Cornfield is a field at sunset round a scarecrow. The bass is the wind rolling across the rows, every kick sends a ring of wind out from the scarecrow and flaps its arms, snares put up crows, crashes flush the two on its arms, hats puff pollen off the tassels. Pitched notes light ears of corn, pitch picking the row.

Harvest moon is a pumpkin patch under a rising moon, played like a keyboard: bass, mid and lead rows of twelve, one per pitch class, each lit from inside in the track colour while its note holds. Kicks pulse the moon's halo, hats spark fireflies, snares and crashes send shooting stars, the bass lights the barn's loft window.

Each mode builds its scene once, writes instance matrices and colours from its own state in update(), and only calls the kit's shared renderer in render(). Every InstancedMesh has its own material: two instanced meshes sharing one made a render that starts mid-song differ by a level or two on a few edge pixels from one that played through. Instanced meshes also skip frustum culling (`Stage.uncull`), since three computes their bounds once, at the first draw, and instances that move on would be culled by those stale bounds.
