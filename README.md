# Tivon: The Last Guardian

A first-person browser adventure set in Kiryat Tivon, rebuilt at real scale from open map and elevation data. Hebrew is the default language; English is available from the main menu or settings.

**Version 0.1 is a procedural gameplay prototype.** It establishes the coffee-to-caves story and its systems; it is not a photorealistic reconstruction, a surveyed town model, or a finished commercial game. The current validation record is in [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md).

## Run locally

Use Node.js 22.12 or newer, or a compatible Node 20.19 release. In PowerShell, from this folder:

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local address printed by Vite, normally **http://127.0.0.1:5173/**. If that port is occupied, Vite may choose the next free port. Keep the terminal running while playing. The server binds to this computer's loopback interface by default.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

`test` runs the pure gameplay tests. `build` checks TypeScript and creates `dist/`; `preview` serves that production build, normally at port 4173. The `test:e2e` script is reserved for browser integration tests; consult the validation record for installed browser requirements and actual executed results.

## Controls

| Input | Action |
|---|---|
| WASD | Walk |
| Mouse | Look around after clicking the scene |
| Left Shift | Sprint while sufficiently awake |
| Space | Jump |
| E | Interact with the object under the central prompt |
| F | Toggle an owned flashlight |
| I | Inventory; drink prepared coffee or replace batteries |
| J | Journal and current objective |
| M | Schematic game map |
| Esc | Release the mouse / pause |
| Up / Down arrows | Alternative forward / backward movement |
| Left / Right arrows | Alternative camera turning |

Settings expose language, graphics quality, volume, mouse sensitivity, inverted vertical look and reduced camera motion. The visual intoxication effect can be reduced without bypassing its dialogue requirement. Full key remapping is not implemented. Touch support is progressive and requires device testing; desktop keyboard/mouse is the primary target.

## Begin the story

1. A new journey starts on Ben Gurion Square, facing Amali. Walk in, approach the barista and press **E** when the interaction prompt appears.
2. Take the offered beans and listen to the conversation. Use the separate brewing station: two measures of beans make one cup after a short brew.
3. Open **I** and drink the prepared coffee. Beans are ingredients; they cannot be eaten. Drinking restores wakefulness.
4. Walk down Alonim Street to Kiryat Amal (Route 75 junction) and take the outside stair up to Mandu on the upper floor at 1 Alexander Zaid. Join the evening, then actively talk to the storyteller while intoxicated. Raising the meter alone does not award the clue.
5. Buy the flashlight and batteries from **בית התוכנה והמחשב** on HaBonim, then walk south along the park road to Beit She'arim. The carved courtyard and cave entrance start the next chapter.
6. In the catacombs a checklist in the corner of the screen (and in the journal) lists what opens the sealed door, with a hint for where to look: read carved panels I, II and III (they give the seal order lamp → tree → wave), collect both map halves, shine the flashlight (F) on the dark wall, then press the seals. Unfound clues glow; the seals light up as you press them; the door opens once everything is done.

**M** opens a map of Tivon drawn from the OpenStreetMap street network, with landmarks, your position and a ring on the next destination. Landmarks around town can be examined with **E**.

Later progression uses inscription observations, a light-revealed mark, map fragments, a stone sequence and a supernatural encounter. The journal retains clues. The guardian's identity is deliberately withheld until the later story.

## Saves

The versioned save stores the player's position, resources, inventory, flags, puzzle progress and dialogue history in browser `localStorage`, using `tivon.last-guardian.save.v1`. Pause-menu Save/Load controls and automatic-save integration use the same slot. Saves belong to the browser profile and URL origin: switching between `localhost` and `127.0.0.1`, changing ports, or clearing site data can make a save unavailable. There is no cloud account or cloud save.

## Project layout

- `src/game/model.ts`: serializable state, inventory, quest definitions, conditional dialogue, purchases, brewing, resources and save validation.
- `src/game/model.test.ts`: pure gameplay regression tests, including quest order and a full narrative state-machine path.
- `src/player/PlayerController.ts`: first-person movement, gravity, jump, floor heights and collision checks.
- `src/world/`: world construction, terrain, interactable registrations and shared scene types.
- `src/ui/UI.ts` and `src/style.css`: Hebrew/English menus, HUD, dialogue, inventory, journal, map and settings.
- `src/systems/AudioSystem.ts`: original Web Audio synthesis for ambient and interaction sounds.

## Accuracy and limitations

- Both user-provided Google links were resolved for identity. Amali is Amali Roasters. The linked computer shop is **בית התוכנה והמחשב at HaBonim 2**, correcting the initial brief's Yizrael Street description. Its place in the quest still follows Mandu.
- Amali's own website gives Ben Gurion Square 1; a directory gives HaRakafot 2. That address-label discrepancy remains documented. Storefront shapes and interiors are approximations.
- The map is 1:1: streets, paths and building footprints from OpenStreetMap (© OpenStreetMap contributors, ODbL) via `docs/gis/build-world.mjs`, on elevation from AWS Terrain Tiles via `docs/gis/build-dem.mjs` (`src/world/geo.ts`). Building heights are estimated where OSM has none; facades and trees are procedural. The two commercial centres and the landmarks are hand-built from Google Maps, Street View and local knowledge (`src/world/layout.ts`, `docs/LOCATION_REFERENCES.md`).
- Models and NPCs use procedural geometry. They are replaceable placeholders, with simple crowd animation rather than realistic human characters. Audio is synthesized and is not venue recordings, voiced dialogue or a finished score.
- The cave layout and all puzzle mechanisms, supernatural events and treasure are fictional. Historical context is separated from invented inscriptions and memory objects.
- Collision handling is a lightweight character/box implementation rather than a general physics engine. Streaming, comprehensive accessibility review, persistent control remapping and broad mobile/browser qualification remain future work.
- A 60 FPS target is not a hardware-independent guarantee. Performance results should specify the browser, viewport and machine used.

See [location references](docs/LOCATION_REFERENCES.md), [asset provenance](ASSET_SOURCES.md), [game design](GAME_DESIGN.md) and [development plan](DEVELOPMENT_PLAN.md). No real business or historical institution is represented as endorsing the fictional story.
