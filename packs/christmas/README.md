# Christmas

The Christmas pack: the `naderlabs/christmas` visualizer pack under `viz/`, five songs and
the shows made for them. The theme is a Cold-War ops room running Christmas Eve as an
operation: every visualizer is one station of the room, drawn through the same console.
See `docs/PACKS.md` in the Cycletron repo.

| Path | What |
| --- | --- |
| `pack.json` | Manifest: id, authors, license, the viz pack, its songs and shows |
| `viz/christmas/` | The visualizer pack: its own `pack.json` and the built `dist/index.js` (`src/` is in the repo only, not the zip) |
| `songs/01-jingle-bells.strudel` | Jingle Bells (Pierpont, 1857) as a synth-score opener, 120 BPM, 96 bars |
| `songs/02-deck-the-halls.strudel` | Deck the Halls (Welsh traditional) as the production line, D minor to F, 124 BPM, 96 bars |
| `songs/03-god-rest-ye-merry-gentlemen.strudel` | God Rest Ye Merry, Gentlemen (English traditional), the dark middle, 104 BPM, 84 bars |
| `songs/04-last-christmas.strudel` | Last Christmas (Wham!), a moody synth cover from the MIDI, 92 BPM, 84 bars. A cover, so it stays in the library |
| `songs/06-deck-the-halls-dubstep.strudel` | Deck the Halls again, as a dubstep track: the rec room after hours, D minor, 140 BPM, 104 bars |
| `songs/_last-christmas/` | The MIDI and the flat import |
| `shows/christmas-album.show.toml` | All five back to back: A Cycletron Christmas, run as an ops room, the dubstep as the encore |
| `shows/<song>.show.toml` | One show per song. The album is assembled from these; edit them first |
| `renders/` | Show renders (`out` in the show file) |

## Stations

| Mode id | Station | What it shows |
| --- | --- | --- |
| `santa-tracker` | STN-01 SITUATION DISPLAY | Wireframe globe, radar sweep, the sleigh's flight track and telemetry |
| `workshop` | STN-02 PRODUCTION | An isometric toy line: each pitched track a bench with an elf, notes load blanks onto the belt, the press stamps each one into a toy as it passes (kicks slam it too), a forklift laps the floor; line readouts beside it |
| `christmas-band` | STN-03 MORALE FEED | Santa's band on a monitor, VU meters, the roster, a morale meter |
| `snowfall` | STN-04 SAT FEED | The village outside under a starry sky and a satellite reticle: notes are stars, snares shooting stars, kicks shake the ground; reindeer on the snowfield, Santa out of a chimney now and then and the sleigh flying past; what the room protects |
| `snowglobe` | STN-05 REC ROOM | A rave in a snow globe: an iso dancefloor whose tiles light on notes, lasers per pitched note, a strobe on the drops, the snow spun up by kicks |
| `sleigh-road` | (cutaway, no console) | Santa's sleigh run on a Christmas star road: kicks are boost patches, snares gift boxes, hats bells, other drums wreaths, notes light the road by pitch, drum tracks are rival sleds; the shows cut to it on builds and lifts |
| `christmas-house` | (cutaway, no console) | A pixel house on Christmas Eve, after the Halloween pack's haunted house: each floor a register and pitch picks the window, lit in the track colour with an elf, snowman, reindeer or penguin in the glass; kicks open the door, hats light the step lanterns and chase the roof lights, snares are fireworks, held notes chimney smoke, a crash puts Santa in the attic for a bar |

Every station draws the same console: a header with the station, the SLEIGHCON block
and the bar clock, a footer with the net log and band meters. SLEIGHCON is the alert
level, 5 (calm) to 1 (all hands): a function of the bar's note density, so every station
reads the same number and a cut lands on it. Levels 2 and 1 tint the frame and flash.

Palettes: `norad` (phosphor green, the home look) and `evergreen` (the outside view, for
the SAT feed). The shows use the built-in `amber` on lifts and `blood` on last choruses.

Build the visualizers and render a show from the Cycletron repo:

    cd ui && node scripts/pack-build.mjs <this folder>/viz/christmas
    node scripts/render-viz.mjs <this folder>/shows/christmas-album.show.toml

## The music

Each piece is a Cold-War synth score built on its carol as a motif: a pulsing bass, arpeggios,
808/909 kits, low-passed pads, the tune on square leads or bells, minor colour in the verses, a
radio layer (static at section ends, Morse pings, a klaxon into the last drop). Forms run intro,
verse, build, drop, break, build, final, outro, and are shaped so SLEIGHCON goes 5 in the intros,
1 on the drops, back to 5 for the stand-down. The fifth track is Deck the Halls again as
dubstep, the rec room after hours: half-time 909 drums, a sine sub and a tempo-locked wobble
under the fa-la-la riff, the tune on square over the second drop.

## Not yet

- Carols in 3/4 (Carol of the Bells, We Wish You a Merry Christmas): the meter is four beats a
  cycle everywhere, so they wait for a meter concept in the sdk.
- Bells, celesta and choir soundfonts stream on first play; the songs lean on the bundled
  oscillators, VCSL bells and the 606/808 kits so they sound right offline.
