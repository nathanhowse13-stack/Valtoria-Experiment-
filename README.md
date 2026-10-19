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
```

The two pages are one game. Working the shack's three bolts and stepping out takes you to
`yard.html?from=shack`. What Jacob did inside comes with him: breakfast, the wash, the flies, the Book
and the little green beast. The yard's door takes you back into the shack, and each page keeps its own
save, so going back and forth picks up where you left off. Starting the morning again in either
page clears both saves.

## Playing locally

Serve the `game` folder over HTTP (pages opened with `file://` can't load their assets):

```
cd game && python3 -m http.server 8000
```

Then open <http://localhost:8000/>. To go straight to the yard, open <http://localhost:8000/yard.html>.

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
