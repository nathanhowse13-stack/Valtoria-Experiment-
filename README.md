# Valtoria Experiment

A playable first-person sketch of *Valtoria*, Chapter One: Jacob's morning on the farm at Bleak Flats.
It runs in the browser with Three.js. Nothing needs installing.

## What's here

```
game/
  index.html        The Shack at First Light: the shack interior (iteration one, a built bundle)
  assets/           the shack's Blender model, baked lightmaps and photographed textures
  yard.html         The Yard at First Light: the page markup and styles
  yard/main.js      the yard's source: world, creatures, chores, dialogue, menu, workshop tags, the jotter
  yard/vendor/      Three.js r160, kept locally so the page works offline
  road.html         The Road to Bleak Flats (Chapter Two): markup and styles
  road/core.js      the road's shared state, materials, field notes and finds
  road/land.js      the land: the fork, the canyon, the old main road, the salt pans, the pipeline, the outskirts, the walls
  road/life.js      what lives on it: gums, spinifex, striders, boars, the wreck and its swarm, and the rest
  road/mainroad.js  along the old main road: the falling power line, Tally Bore, burst mains, Scream-Peas, the escarpment's Drop-Stalkers
  road/caves.js     three shallow caves to walk into, and the relics in them
  road/main.js      the player: the tractor and Jacob on foot, the camera, HUD, notebook, sound, survival
  shared/notebook.js  the idea notebook all three pages write to
  shared/tractor.js   Jacob's tractor, one model for the yard and the road
tools/build-pc.mjs  builds the single-file PC copies (npm install && npm run build:pc)
```

The three pages are one game. Working the shack's three bolts and stepping out takes you to
`yard.html?from=shack`. What Jacob did inside comes with him: breakfast, the wash, the flies, the Book
and the little green beast. The yard's door takes you back into the shack, and each page keeps its own
save, so going back and forth picks up where you left off. Starting the morning again in either
page clears both saves.

Finishing the yard's chores and choosing **Load up and head to town** drives the tractor out of the north
gate onto `road.html?from=yard`, carrying the clock and the load. The road is 1.8 km of playable land
standing for Valtoria's twenty clicks. It borrows Chapter Two's drive for flavour, but this is a
sandbox for developing ideas before the novel: the **Survival Field Guide** is the authority on what
lives here and how it behaves, and where the chapters disagree with it, the Guide wins.

- **The fork.** Signposts at the fork: the Old Canyon Road banks left (west) into a canyon of rusted
  iron-shale and sandstone strata, the interesting way to town. The old main road runs straight on.
- **The canyon** is lined with Gallows-Gums, then choked with Razor-Spinifex with one game trail
  through it. There are two caves in its walls.
- **The old main road** is what's left of a sealed road: broken bitumen under red dust, a faded centre
  line, knocked-over guide posts. It runs under the canyon mesa's eastern escarpment, along the edge of
  the salt pans. It's littered with what the old world left: a power line falling down pole by pole,
  a pipeline failing section by section, and Tally Bore, a hamlet of houses coming apart.
- **The salt pans** lie east of the main road: white crust cracked into plates, with liquid mirages.
  From the road you'll see a salt-strider out on the salt, keeping abreast. Drive or walk onto the
  pans and it hunts you. It's hotter out there, because the pans throw the sun back up.
- **The breakdown** is under the skeleton of the old transmission line: a transport truck on its side,
  its boiler smoking, a scrapper on his knees, and a gossip-fly swarm mining him.
- **The outskirts** have boreholes, two strip mines (with an old adit in the big one) and a ridge to the
  east. On the ridge a razor-back boar breaks cover and a strider paces the tractor.
- **Bleak Flats** has walls of corrugated iron and scrap, spikes and wire, stacks belching yellow-black
  smoke, a queue of steam trucks and the south gate. The journey ends there, at the Ironshell's booth
  and the entry tax. The city isn't built yet.

Off the road there are ruined shacks, the pipeline and its leaks, a Judas-Wattle, a Miser-Boab, an
Iron-Bark Sentinel, Argus-Bushes, compass-weed, thorny-devils and jaw-jaws.

### The old main road

The ruins along it are Experimental, new on the road. What lives there is the Field Guide's.

- **The power line** has a pole every 38 m from the gate to the walls, on the road's west side.
  About half stand. The rest lean, have snapped (a stump, with the top lying beside it), or lie in
  the dirt with their wires dragged down. Near the bend before Tally Bore, a pole has come down
  across the edge of the road, and one of its wires is still live. It lies across the road, arcing
  and crackling. On foot it bites (18 damage and a stun). The tractor rolls over it on leather
  wheels and only throws sparks. A green glass insulator lies by the fallen pole.
- **The pipeline** runs east of the main road and fails every way a pipe can: trestles toppled with
  their sections kinked in the dirt, sections rusted through and weeping, plain leaks, and burst
  mains still throwing a fan of spray. Burst mains and leaks are water sources.
- **Tally Bore** is a hamlet built round a pumping station on the pipeline, abandoned when the pipe
  failed:
  - **Four houses** in different states of coming apart: one racked over on its stumps, one with the
    roof fallen into the room, one only a front wall and a chimney, and one with a verandah.
  - **The verandah** groans when you stand under it, and comes down if you stay. A chair invites you
    to sit.
  - **The pump house** has its valve wheel (turn it and the burst main sprays higher) and a logbook.
  - **The rest:** a windmill still turning with a third of its blades gone, a water tower down on
    buckled legs, a car up on blocks being stripped by jaw-jaws, a half-fallen fence, a rainwater
    tank, and a Gallows-Gum, the best shade in town.
- **Things to see** along the road, all from the Field Guide and native to the country round
  Bleak Flats:
  - **Scream-Peas** (Guide; Chapter One) are wretched, parasitic vines. Here they've taken the dead
    poles, hang in rows off the sagging wires, run along Tally Bore's back fence, and climb the walls
    of Bleak Flats either side of the gate, where the Guide puts them.
    - By day their mouth-like pods are shut against the light, and every lidded flower turns to watch
      you pass. The eyes open when you come close; the eyes are the Farm of Rust sketch's look.
    - Put your face to one and a pod splits and screams.
    - Before seven, the last of them are still screaming in the shade.
  - **Drop-Stalkers** (Guide) live on the escarpment above the road; a cliff of overhangs is their
    country. Two of them, furred the colour of the strata, keep pace with anything on the road,
    ledge to ledge. Every time you look up, the one you're looking at is pressed flat to the rock
    and still. Walk under the cliff (by the windmill, say) and they come along the ledges to be over
    you. Look up and hold one's eye and it won't drop.
  - **Others:** razor-back boars rooting by the road (Chapter Two), thorny-devils on the warm seal
    (the Farm sketch), and the strider out on the pans.

  These replace the first pass's invented crows and hounds, keeping their ideas (rows on the wires,
  every head turning; something pacing you that's never there when you look) with the Guide's own
  species. There are seventeen finds now, three of them on the main road.

### The caves

Three shallow caves, each its own small world (a separate scene) that you walk into from its mouth and
walk back out of. Jacob carries no torch. He's vampiris, and Chapter One has his eyes open wide in the
dim, so the dark lifts as he goes in. Coming back out, the sun hits like a hammer: a white glare and
an exposure that takes a moment to settle.

| Cave | Where | What's in it | Relics |
| --- | --- | --- | --- |
| The den | the canyon's west wall, among the gums; a Drop-Stalker keeps the ledge over the mouth | a nest of shredded hide, bones, a scrapper's skeleton and pack, a webbed crawl to an alcove | Scrapper's tally-book, Stalker claw, Painted chariot |
| The seep | the canyon's east wall, in the spinifex | a high chamber where a crack lets a shaft of sun down onto still water (refill here), live creeper-vines, Truth-Rot lighting the back wall green, an old camp with strider marks scratched on the wall | Vacuum flask, Sulphur-Salts tin, Creeper-vine cord |
| The old adit | the east face of the big strip mine near Bleak Flats | timber frames, rails, a tipped ore cart, a collapse at the end, a jaw-jaw nest of stripped copper up a side gallery | Telephone handset, Miner's brass chit, Pre-Fracture glass |

Low roofs make Jacob stoop. Tunnel-Webs bite if he blunders through, and brush aside if he goes slowly.
Telling the Truth-Rot you're fine makes it flare. Some relics bring a line from the books to mind,
like the epigraphs about the Age of Glass. There are fourteen finds in all, and the notebook's Finds
page hints where the missing ones are.

### The road's life

The Field Guide decides what each species does. Where the chapters add detail that doesn't contradict
it (a look, a sound, a line), that's kept as flavour. The tells and counters are the game's own and are
tagged Experimental.

| Species | What it does (Canon) | The tell and the counter |
| --- | --- | --- |
| Gallows-Gum (Guide; the look is Ch. 2's) | the best shade on the road; waits for someone to relax in it, then strikes | stop in its shade and settle, and the limb creaks and angles down; keep moving, stay on edge, never park under one |
| Razor-Spinifex (Ch. 2) | glass blades; senses movement, thrashes, drinks the blood it cuts; lashes the hull ("schwick") | creep the trail, then punch it once you're clear of the gums; on foot, walk |
| Salt-Strider (Guide; the look and the blink are Ch. 2's) | walks the salt; raptor-like, bone-furred, blinks fifty feet at a time | seen from the main road, it only watches; on the salt, hold a constant, boring speed and it weighs you, finds you too metallic and leaves |
| Gossip-Flies (Guide; the swarm is Ch. 2's) | fist-sized, oil-slick; whisper fears back; a swarm mines a mind | outrun the small ones; Sulphur-Salts in the intake (G), then redline it, breaks a swarm |
| Razor-Back Boar (Ch. 2) | one running scared means something spooked it | a warning that a strider is near |
| Compass-Weed (Ch. 1, Guide) | scrambles the compass and the sense of direction | steer by the wires, the pipeline and the sun |
| Drop-Stalker (Guide) | ambushes from above, around rocky overhangs | clicking from the rocks; look up and hold its eye |
| Judas-Wattle, Argus-Bush, Truth-Rot (Guide) | Golden Haze; eyes that record; glows at a lie | |
| Thorny-devils, jaw-jaws, Tunnel-Webs (Farm sketch) | Plausible | jaw-jaws strip the ignition wiring of a parked tractor |

Heat climbs with the clock, so water matters. Refill at pipeline leaks and burst mains, the shack and
Tally Bore tanks, and the seep. The caves are cool.

The road's systems began in the *Road Relic v0.5* prototype (route length, pacing, power line, pipeline,
ruins, vitals) and were rebuilt in the game's own renderer, controls, saves, tags and notebook.
Rustbucket is Jacob's bull; the tractor has no name.

#### Where the books and the Field Guide disagree

The Field Guide wins on species and behaviour. The chapters are flavour.
- **Gallows-Gums.** Chapter Two has them feed on fear and frenzy at vibration. The Guide has them
  wait for someone to relax. The road follows the Guide, keeping Chapter Two's pale, peeling,
  red-under-the-bark look.
- **Gossip-flies.** Chapters One and Two say thumb-sized; the Guide says fist-sized. They're fist-sized.
- **Salt-strider.** It's in the Guide, but beyond its walking the salt, its look and its blink are
  Chapter Two's. Nothing in the Guide, as far as these notes go, contradicts them.
- **Not about species, so the chapters stand:** the anima shield ("Non-existent" on the gauge, so it
  only cuts the flies' pressure by 40 per cent) and Bleak Flats' walls, stacks and south gate. If the
  Guide describes Bleak Flats differently (the prototype had a crater rim and a Scream-Pea fence),
  that's an easy swap.

### The tractor

`game/shared/tractor.js` builds the one tractor both pages use: an old long-bonnet two-cylinder,
its paint long since gone to brown and rust, kept alive by salvage. It has:
- riveted anima shielding over the engine, round the seat and on the back
- a stack rebuilt to spit phosphorus, with a spark cage and a feed line from a little hopper
- a windscreen cracked from a stone strike and missing a corner, and no side windows
- a single patched seat
- wheels rebuilt from layered, strapped and riveted salvaged leather, no two alike
- a radio whip with the set under the roof
- a small water canister with a tap
- a lidded compartment on the back

On the road these are things to use. F drinks from the canister at the wheel, and the canister refills
at a water source if the tractor is close enough to carry it over. The compartment opens and holds the
Sulphur-Salts. G throws a tin into the intake, and the stack chokes out a yellow-white cloud (Chapter
Two). R works the radio. Aboard, the gauges read as Chapter Two has them: engine temperature high,
fuel pressure low, anima-shield integrity non-existent, coolant high, the oil dial spinning. The
spinifex scratches add up on the hull.

## Playing locally

Serve the `game` folder over HTTP (pages opened with `file://` can't load their assets):

```
cd game && python3 -m http.server 8000
```

Then open <http://localhost:8000/>. To go straight to the yard or the road, open
<http://localhost:8000/yard.html> or <http://localhost:8000/road.html>.

Controls: WASD walk, Shift run (outside), mouse look, E use, F or left-click swing, Q swap tools,
B the Book, Tab the menu, N jot an idea. An Xbox controller also works when the page is opened
directly in Chrome or Edge. On the road: W/S drive, A/D steer, E climb down or aboard, F drink,
G Sulphur-Salts, R the radio, V seat or chase view. Walk into a cave mouth to go in.

## Canon, Plausible, Experimental

Turn on **Workshop view** from the title screen or the menu. Every line and thing then shows its tag
and where it comes from:

- **Canon**: in the books.
- **Plausible**: fits the books, but isn't in them.
- **Experimental**: an idea being tested.

Most of the yard came across from the earlier *Farm of Rust* sketch. It's marked Plausible until
it has been checked against the manuscript. Nothing becomes Canon unless the author says so. Yard tags
live in `LINE_PROV`, `BOOK_PROV`, `WHISPER_PROV` and `ITEM_PROV` in `game/yard/main.js`.

## Ideas

Press **N** anywhere to jot an idea. It's saved with where Jacob is standing, what he's looking at, the heat,
the time and a small picture of the view. When the game runs as a claude.ai artifact, ideas go into the
page's shared notebook (the `ideas` collection), so Claude can read them next session. Otherwise they stay
in the browser and can be exported from the menu's Ideas page.

## Where the shack's source went

Iteration one was built in an earlier, temporary workspace, and only its built bundle survived.
`game/index.html` is that bundle, with two small patches: the door leads on to the yard, and
starting again clears the yard's save too. Its assets are the originals.
