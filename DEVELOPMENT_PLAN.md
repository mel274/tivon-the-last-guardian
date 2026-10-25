# Development plan and validation record

The workflow is incremental: make a stage playable, run the relevant checks, correct failures, then extend it. Source implementation alone is not proof that an interaction works in the browser.

## Milestone gates

| Milestone | Scope | Required evidence before marking verified |
|---|---|---|
| 1. Foundation | Three.js/Vite scene, terrain, first-person movement, enterable building, interaction targets | Build passes; browser renders; walking/jump/gravity/walls/doorways checked |
| 2. Amali | Barista, beans, timed station brewing, inventory drinking and wakefulness | Real UI path obtains beans, consumes them at station, adds cup, restores wakefulness; save/load preserves state |
| 3. Mandu | Populated bar, ambient sound, drink purchase, intoxication and storyteller | Crowd visible; intoxication alone does not grant clue; active eligible dialogue does; reduced motion works |
| 4. Equipment | Confirmed computer-shop identity, purchases, flashlight and batteries | Prices/inventory correct; insufficient funds handled; actual beam illuminates geometry; charge drains and replacement works |
| 5. Phase 1 route | Connected town/footpath and cave entrance gate | Full café → bar → shop → cave route completed in order without level-selection teleporting |
| 6. Catacombs | Interconnected chambers, inscriptions, light mark, map fragments and mechanism | Clues discoverable; wrong sequence gives feedback; incomplete evidence cannot open gate |
| 7. Hidden annex | Deeper fictional cave space and hoofbeat foreshadowing | Transition gated correctly; identity stays hidden; navigation and resource recovery checked |
| 8. Resolution | Guardian encounter, memory objects, oath, archive, sunrise | End-to-end completion; failures/recovery work; peaceful ending and return to town are reachable |

The state model and tests cover the narrative sequence through the ending. The town renderer, controls, UI and audio modules are implemented in source. Integration and browser checks are being recorded separately; do not infer a test pass from this table.

## Validation commands

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run dev
npm.cmd run test:e2e
```

Pure tests exercise ingredient accounting, brewing completion, quest ordering, active intoxicated dialogue, purchases and budget recovery, battery consumption, puzzle prerequisites, late identity reveal, final resolution, and save-data validation. A state-machine playthrough does not substitute for a browser walkthrough of the 3D spaces.

Browser checks should use actual input/UI where possible, record console/page errors, and cover movement, walls and entrances, contextual interaction, settings, save/reload and the full Amali loop. Any test-only state setup or shortened navigation must be identified in the test/report so it is not mistaken for a complete manual traversal.

## Execution record

No test results are asserted by this documentation-writing task. The integrating developer should append the actual command, date and result here after execution, including failed attempts and remaining limitations when material.

| Check | Result |
|---|---|
| Dependency installation | See integration run record; not independently re-run for these docs |
| TypeScript + production build | Pending recorded result |
| Pure gameplay suite | Pending recorded result |
| Browser console and WebGL rendering | Pending recorded result |
| Amali UI playthrough | Pending recorded result |
| Full 3D route and story | Pending recorded result |
| Save/load and settings in browser | Pending recorded result |
| Performance sample | Pending measured browser/viewport/machine result |

## Current limitations and next work

1. Finish and verify each integration gate before describing the corresponding browser milestone as complete.
2. Inspect current storefront reference images. Amali and the computer shop identities match the supplied links, but frontages are approximate and Amali's address labels need reconciliation.
3. Import reusable road/building and terrain data, document projection and compression, and replace the schematic town route without breaking progression.
4. Improve procedural characters, architectural detail and animation after performance measurements. Current primitive-based NPCs and synthesized sound are prototypes.
5. Expand catacomb investigation and the guardian encounter beyond their compact first versions; preserve the late reveal and nonviolent resolution.
6. Test lower-end desktop hardware and mobile browsers. Touch input scaffolding/responsive UI are progressive support, not full mobile qualification.
7. Add key remapping, broader accessibility settings, save migration/export and deployment documentation when the local loop is stable.

## Agreed next work (decided with the owner, 2026-10-25)

These approaches are agreed but not yet built. The Zeid centre was rebuilt first (2026-10-25, plan revision 3.1). Its remaining photo details and the falafel-row question are listed in docs/LOCATION_REFERENCES.md.

1. **Cave entrance blocked.** Cause: at 1:1 the fictional catacomb lies under the real hill. `surfaceHeight` (src/world/terrain.ts) only raises a covering mound and cuts a small notch at the courtyard (z 93–99); it never lowers real ground, so past the notch the hillside comes up through the passage floor. The navigation test only walks to the courtyard, which is why it still passed. Fix: carve the terrain below the cave floor along the whole entrance passage and hall outline, keeping the ceiling. Extend `navigation.test.ts` to walk courtyard → hall → every clue → the "up to daylight" stair.
2. **Private houses with gardens (fills the empty spaces).** Most of Tivon is private houses. Classify OSM footprints as private houses when they are under ~250 m², ≤3 storeys and not tagged shop, public or apartments, and report the count first. Give each house a plot: split each street block among its houses by nearest house (Voronoi), clipped to the street edge and capped at ~20 m from the house. Dress each plot from the street survey:
   - a low rubble wall and tall hedge, or a fence, on the street side;
   - side fences between neighbours;
   - a gate and path to the door;
   - a driveway or carport;
   - lawn, with garden trees inside the plot instead of random woodland.

   Real cadastral parcels (Survey of Israel / govmap) could replace the Voronoi plots later if they can be obtained.
3. **Elevation, options a + c.**
   - (a) Keep the DEM for the large shape and let the town shape the detail: smooth each road's profile along its length, and put each house on its own flat terrace with a retaining wall downhill. That is how Tivon is built, and it matches the survey's stepped walls.
   - (c) Fetch Copernicus GLO-30 and compare it with the current AWS Terrarium tiles (mostly SRTM, ~30 m true resolution resampled to ~6.7 m), then keep the better of the two.
   - Source and method go in ASSET_SOURCES.md and `docs/gis/build-dem.mjs`.

## Release discipline

Commit only working milestones with meaningful validation notes. Do not force-push or overwrite an existing remote. This first local project can be built into static files under `dist/`; public hosting, performance qualification, asset/legal review and a production release are future steps. The package remains private during development.
