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
  road.html         The Road to Bleak Flats: markup and styles
  road/main.js      the road's source: the Red Waste, the tractor, the Field Guide's hazards, survival
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
gate onto `road.html?from=yard`, carrying the clock and the load. The road is 1.8 km of playable track
standing for Valtoria's twenty clicks: five minutes by tractor without stopping, longer for every
detour. It ends at the Bleak Flats perimeter fence. The town isn't built yet.

### The road's hazards

Each Field Guide species does what the Guide says it does. Each also has a tell and a counter, so the
player learns the Waste rather than out-gunning it. The tells and counters are tagged Experimental.

| Species | What it does (Canon) | The tell and the counter (Experimental) |
| --- | --- | --- |
| Razor-Spinifex | cuts, and feeds on the blood | clumps redden as they feed; walk slowly through or go round, the tractor crushes it |
| Compass-Weed | scrambles the compass and the sense of direction | the needle swings and footsteps drift; steer by the power line, the pipeline and the sun |
| Gallows-Gum | waits for someone to relax in its shade | a creak after a couple of seconds still; keep moving |
| Drop-Stalker | ambushes from above, around rocky overhangs | clicking from the rocks; look up and hold its eye and it won't drop |
| Gossip-Flies | whisper fears (fist-sized) | outrun them in the tractor; an ear-cage found in the yard halves them |
| Judas-Wattle | Golden Haze turns the red world green | a mirage of water along a tempting shortcut |
| Argus-Bush | watches, and records fear and memory | every eye turns to follow Jacob |
| Salt-Strider | the pale walker of the salt country | one crossing: stop, and it passes; keep moving and it charges |

The tractor is the safe place: stress falls while you're aboard, flies can't keep up at speed, and
bleeding slows. Heat climbs with the clock, so water matters. Refill the water bag at pipeline leaks,
the first shack's tank and the seep in the last rock shelter.

The road's systems came from the *Road Relic v0.5* prototype: the route length, pacing, power line,
pipeline, ruins, vitals and six finds. They were rebuilt in the game's own renderer, controls, saves,
tags and notebook. Rustbucket is Jacob's bull; the tractor has no name.

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

On the road these are things to use. The shielding is why flies can't get into Jacob's head while
he's aboard. F drinks from the canister at the wheel, and the canister refills at a water source if
the tractor is parked nearby. The compartment opens, and R works the radio. All of it is tagged
Experimental.

## Playing locally

Serve the `game` folder over HTTP (pages opened with `file://` can't load their assets):

```
cd game && python3 -m http.server 8000
```

Then open <http://localhost:8000/>. To go straight to the yard or the road, open
<http://localhost:8000/yard.html> or <http://localhost:8000/road.html>.

Controls: WASD walk, Shift run (outside), mouse look, E use, F or left-click swing, Q swap tools,
B the Book, Tab the menu, N jot an idea. An Xbox controller also works when the page is opened
directly in Chrome or Edge.

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
