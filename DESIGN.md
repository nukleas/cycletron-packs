# What makes a mode good

Notes from reviewing the first three.js packs (2026-11-05), so the next
modes start from what worked. The app's own modes are the cyberpunk core;
these are the seasonal ones, but the same eye applies.

## The verdict

Kept as the reference set:

- **ice-cave** (winter): a yeti on a two-octave crystal marimba and a penguin
  on an ice drum and icicle chimes. Polished after the verdict: a key light and a
  paler dome brighten the room, and the crystals keep their unlit colour and
  glow, so a lit one still reads. A detailed yeti (shag, a dark face under a
  heavy brow, fangs) was tried and reverted: the round one's flat face and
  blank stare as it rocks on the beat is the charm. Simple, readable
  characters beat detailed ones.
- **yeti-dj** (winter): ice-cave's variant, the same cave and figures as a DJ
  set. The crystals' job goes to a laser fan, a beam per pitch class and
  register, and the drip's phrase count to a drop: the arm climbs through
  the last bar and every beam fires on the downbeat. The venue (riser, wall,
  truss of spots, cryo, a crowd) makes it a show. The crowd works here where
  the cut crowd modes didn't, because it is dark framing in the foreground,
  never the subject, and it moves as one.
- **aurora** (winter): northern lights over a cabin; held notes spread light
  along the curtains.
- **harvest-moon** (harvest): a pumpkin patch played like a keyboard, each
  pumpkin lit from inside while its note holds.
- **parade** (harvest): a marching band halted at the reviewing stand. Its
  horn ranks are one per register (trumpets high, trombones middle,
  sousaphones bass), each a plain outline you can tell at frame size, and a
  trombone's slide sits where its pitch is.

Cut, and why:

- **snowball-fight, confetti, champagne, autumn-forest**: crowds of block
  people. Six to eight figures with small props, each doing a small motion for
  its voice, under confetti, snowballs or leaves. The eye has nowhere to land,
  the props are too small to read at the frame's size, and the block people
  look crude next to the scenery around them. Each voice did have an owner
  and its hits landed on the frame; it still didn't read.
- **ski-jump**: one jump per bar whatever the song does. It runs on the bar
  clock, not the music, so the song barely changes what you see, and there is
  little light or effect to carry it.

Not yet judged: fireworks, ball-drop, cornfield, and the 8-bit packs.

## What the good ones share

- **A note is light in a fixed place.** A crystal, a pumpkin, a point on a
  curtain lights up in the track's colour against a dark scene. Brightness
  carries the music, so it reads at any size and from across the room.
- **Pitch has an address.** The marimba runs low to high, the pumpkin patch
  has a row per register and a pumpkin per pitch class, a curtain lights at
  its pitch. You can see the shape of the melody, and a repeated phrase lights
  the same places again.
- **Held notes have a state.** A crystal stays half lit, a pumpkin glows, a pad
  spreads across the whole sky. A mode that shows only onsets loses everything
  sustained; these show both the hit and the hold.
- **One focal point and a calm frame.** One instrument, one sky, one patch. The
  scenery stays still and lets the notes be the motion. aurora is the ambient
  one and still works, because its motion is the music's light, not a camera
  or particles moving on their own.
- **Few performers, big and distinct.** Two creatures with strong silhouettes
  (a yeti, a penguin) beat eight people. When there are many, they are drilled
  into ranks and move together, as in the parade, so they read as one shape.
  Non-human or stylised characters fit the low-poly look; block humans don't.

## Timing

A mode reads as music when you can watch it play, not when things flash
after a note. The band modes and ball-drop's countdown are the reference:

- **A cast.** Each voice has a visible owner that keeps it (a drummer for the
  kicks, a crystal per pitch), never a random spot per note.
- **Poses on the grid.** `stance(strike(…), windup(…))` from `kit/timing`
  picks rest, ready or hit; the hit pose is on the onset's frame. A few
  snapped poses read; eased decays read as mush.
- **Anticipation and structure.** `HapField` looks ahead (two bars, so a
  downbeat's wind-up is in view), so a figure can ready itself before its note
  (`windup`), and `beatsLeft` counts a phrase down to its downbeat. Camera
  cuts land on bar lines.
- **No off-grid motion on the subject.** Continuous motion is locked to the
  beat (`beatPhase`, a `strike` on each beat) or left out; the audio level
  (`s.low`) does not drive the main subject.

Timing alone isn't enough: the cut crowd modes had all of it. Get the picture
above right first.

## Checking a mode

- Look at a contact sheet across the song (`select='not(mod(n\,20))'`,
  `tile=4x4`) for the picture: is there one place to look, and does the music
  change it?
- Look at a strip of consecutive frames around a hit
  (`select='lt(n\,12)'`, `tile=6x2`) at 24 fps or more for the timing. At the
  probe's 8 fps a hit pose is a single frame.
