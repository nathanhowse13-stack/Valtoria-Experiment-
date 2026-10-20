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
  road/land.js      the land: the fork, the canyon, the salt pans, the transmission line, the outskirts, the walls
  road/life.js      what lives on it: gums, spinifex, striders, boars, the wreck and its swarm, and the rest
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
standing for Valtoria's twenty clicks, laid out the way Chapter Two drives it:

- **The fork.** The Old Canyon Road banks left (west) into a canyon of rusted iron-shale and sandstone
  strata, longer but sheltered. The direct track runs straight across the salt pans.
- **The canyon** is lined with Gallows-Gums, then choked with Razor-Spinifex with one game trail
  through it. There are two caves in its walls.
- **The salt pans** are white crust cracked into plates, with liquid mirages. A salt-strider hunts here
  by day, and it's hotter, because the pans throw the sun back up.
- **The breakdown** is under the skeleton of the old transmission line: a transport truck on its side,
  its boiler smoking, a scrapper on his knees, and a gossip-fly swarm mining him.
- **The outskirts** have boreholes, two strip mines (with an old adit in the big one) and a ridge to the
  east. On the ridge a razor-back boar breaks cover and a strider paces the tractor.
- **Bleak Flats** has walls of corrugated iron and scrap, spikes and wire, stacks belching yellow-black
  smoke, a queue of steam trucks and the south gate. The journey ends there, at the Ironshell's booth
  and the entry tax. The city isn't built yet.

Off the road there are ruined shacks, the pipeline and its leaks, a Judas-Wattle, a Miser-Boab, an
Iron-Bark Sentinel, Argus-Bushes, compass-weed, thorny-devils and jaw-jaws.

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

Where Chapter Two describes a creature, it behaves as the book says. Where only the Field Guide or Chapter
One does, it follows them. The tells and counters are the game's own and are tagged Experimental.

| Species | What it does (Canon) | The tell and the counter |
| --- | --- | --- |
| Gallows-Gum (Ch. 2) | tastes the anima of fear; vibration frenzies it; looking up is acknowledgement | the limb creaks and angles down; go slow, stay calm, don't look up |
| Razor-Spinifex (Ch. 2) | glass blades; senses movement, thrashes, drinks the blood it cuts; lashes the hull ("schwick") | creep the trail, then punch it once you're clear of the gums; on foot, walk |
| Salt-Strider (Ch. 2) | raptor-like, bone-furred, blinks fifty feet at a time; hunts the open flats | hold a constant, boring speed and it weighs you, finds you too metallic and leaves |
| Gossip-Flies (Ch. 1–2) | thumb-sized, oil-slick; mimic fears; a swarm mines a mind | outrun the small ones; Sulphur-Salts in the intake (G), then redline it, breaks a swarm |
| Razor-Back Boar (Ch. 2) | one running scared means something spooked it | a warning that a strider is near |
| Compass-Weed (Ch. 1, Guide) | scrambles the compass and the sense of direction | steer by the wires, the pipeline and the sun |
| Drop-Stalker (Guide) | ambushes from above, around rocky overhangs | clicking from the rocks; look up and hold its eye |
| Judas-Wattle, Argus-Bush, Truth-Rot (Guide) | Golden Haze; eyes that record; glows at a lie | |
| Thorny-devils, jaw-jaws, Tunnel-Webs (Farm sketch) | Plausible | jaw-jaws strip the ignition wiring of a parked tractor |

Heat climbs with the clock, so water matters. Refill at pipeline leaks, the first shack's tank and the
seep. The caves are cool.

The road's systems began in the *Road Relic v0.5* prototype (route length, pacing, power line, pipeline,
ruins, vitals) and were rebuilt in the game's own renderer, controls, saves, tags and notebook.
Rustbucket is Jacob's bull; the tractor has no name.

#### Where the books and the earlier notes disagree

These were settled in favour of the chapters. Each is worth a look by the author:
- **Gallows-Gums.** The road notes said they wait for someone to *relax*. Chapter Two has them feed
  on fear and frenzy at vibration. The road now follows Chapter Two.
- **Gossip-flies.** The Field Guide note had them fist-sized; Chapters One and Two say thumb-sized.
- **Salt-strider.** The prototype had a tall stilt-walker that you stop for. Chapter Two's strider is
  a raptor that blinks, and the counter is a constant speed, not stopping.
- **The anima shield.** It used to keep the flies out entirely. Chapter Two's gauge reads
  "Non-existent", so aboard, the flies' pressure is only cut by 40 per cent.
- **Bleak Flats.** The prototype's crater rim and Scream-Pea fence are now Chapter Two's walls, stacks
  and south gate.

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
