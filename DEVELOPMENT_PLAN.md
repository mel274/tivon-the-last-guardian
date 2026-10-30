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
| TypeScript + production build | 2026-10-26: `npx tsc --noEmit -p .` and `npm run build` both passed |
| Pure gameplay suite | 2026-10-26: `npx vitest run`, 68 tests passed |
| Browser console and WebGL rendering | Pending recorded result |
| Amali UI playthrough | Pending recorded result |
| Full 3D route and story | Pending recorded result |
| Save/load and settings in browser | Pending recorded result |
| Performance sample | Measured 2026-10-26; see "World-pass measurements" below |

## Current limitations and next work

1. Finish and verify each integration gate before describing the corresponding browser milestone as complete.
2. Inspect current storefront reference images. Amali and the computer shop identities match the supplied links, but frontages are approximate and Amali's address labels need reconciliation.
3. Import reusable road/building and terrain data, document projection and compression, and replace the schematic town route without breaking progression.
4. Improve procedural characters, architectural detail and animation after performance measurements. Current primitive-based NPCs and synthesized sound are prototypes.
5. Expand catacomb investigation and the guardian encounter beyond their compact first versions; preserve the late reveal and nonviolent resolution.
6. Test lower-end desktop hardware and mobile browsers. Touch input scaffolding/responsive UI are progressive support, not full mobile qualification.
7. Add key remapping, broader accessibility settings, save migration/export and deployment documentation when the local loop is stable.

## Agreed next work (decided with the owner, 2026-10-25)

Done in 0.4.0. The Zeid centre is the owner-approved plan, revision 4.2, including the falafel-row order. Owner decisions are in [docs/LOCATION_REFERENCES.md](docs/LOCATION_REFERENCES.md).

1. **Cave entrance.** Done. The hill stays above the cave, and the walk test goes through the chambers.
2. **Private houses with gardens.** Done. 1,835 houses, 1,832 plots, dressed from the street survey. Cadastral parcels (Survey of Israel / govmap) could still replace the generated plots later.
3. **Elevation, options a + c.** Done. Roads are smoothed along their length and held to 12% grade. Each private house sits on a flat terrace with rubble walls. The DEM is the GEM-15 bare-earth model (15 m); the credit is in [ASSET_SOURCES.md](ASSET_SOURCES.md).

## World-pass measurements (2026-10-26)

Machine: Intel UHD Graphics 620, Microsoft Edge, window 1280×800, device pixel ratio 1. The dev server was running on the same machine. Nothing else was using the browser. The game lowers its own resolution when frames stay under about 40 fps, down to 0.6×, and raises it again when there is headroom. The figures below are after that has settled.

The earlier note of about 28 s to reach the menu was taken before the plot speed-up. The same load is now about 16–17 s.

### Load

Time from navigation to the main menu (`performance.now()` when "Begin a new journey" is on screen). The document itself arrives in about 25 ms, so this is the world build.

| Graphics | Menu ready |
|---|---|
| Low | 15.5 s |
| Medium | 16.9 s |
| High | 17.3 s |

A Node build of the same stages (Vitest, canvas painting stubbed, no GPU upload) took 13.0 s: terrain 5,252 ms (house terraces are prepared inside that, 1,491 ms), town 7,450 ms, caves 241 ms. Town stages, in ms:

| Stage | ms |
|---|---|
| Terraces | 0 (already prepared with the terrain) |
| Streets | 1,060 |
| Ben Gurion Square | 294 |
| Zeid centre and Mandu | 855 |
| Computer shop | 15 |
| Landmarks | 85 |
| Houses | 3,076 |
| Terrace walls | 87 |
| Cars | 39 |
| Trees | 669 |
| Extrusion flush | 33 |
| Batch flush | 1,041 |
| Merge | 196 |

Plot layout is 1,559 ms and plot dressing 942 ms, inside the houses stage. 1,835 houses, 1,832 plots, 1,821 terrace pads, 38,835 terrace-wall pieces.

### Totals

| | Count |
|---|---|
| Triangles in the whole scene | 5,607,105 |
| Terrain tiles | 568,000 |
| Town, including 123,827 tree instances | 4,749,939 |
| Zeid furnishings | 238,424 |
| Caves | 42,822 |
| Distant haze hills | 7,920 |
| Colliders | 56,320 (14,738 of them from plot boundaries) |

### Frame rate

Four seconds of frames at each spot, after eight seconds there to let the resolution settle. "HUD" is the smoothed counter in the corner. Median and average are from the raw frames. A median of 60 with a lower average means many frames hit the display refresh and enough miss it to land on the next one (about 33 ms).

| Graphics | Spot | HUD | Median | Average | Pixel ratio | Triangles drawn | Draw calls |
|---|---|---|---|---|---|---|---|
| Low | Ben Gurion Square | 46 | 60 | 44 | 0.85 | 326,000 | 302 |
| Low | Zeid balcony | 42 | 60 | 43 | 0.70 | 526,000 | 378 |
| Low | Motta Gur (hillside) | 57 | 60 | 55 | 0.70 | 161,000 | 232 |
| Medium | Ben Gurion Square | 38 | 30 | 37 | 0.60 | 368,000 | 375 |
| Medium | Zeid balcony | 37 | 30 | 36 | 0.60 | 673,000 | 608 |
| Medium | Motta Gur (hillside) | 48 | 60 | 46 | 0.60 | 330,000 | 435 |
| High | Ben Gurion Square | 38 | 30 | 37 | 0.60 | 473,000 | 507 |
| High | Zeid balcony | 32 | 30 | 30 | 0.60 | 900,000 | 1,158 |
| High | Motta Gur (hillside) | 37 | 30 | 35 | 0.60 | 640,000 | 808 |

Low turns shadows off and draws to 380 m. Medium draws to 620 m with a 1024 shadow map. High draws to 1,000 m with a 2048 shadow map. On this GPU, medium and high spend the sample at the 0.6 floor. The Zeid balcony on high is the heavy view: about 900,000 triangles and about 1,200 draw calls.

Screenshots from the same day are in [docs/screenshots/](docs/screenshots/): the cave entrance and hall, the falafel row, על-הקו, the cinema lobby, Butcher Tivon, Oranim pharmacy, Mandu, Yefe Nof (gardens and a terrace wall), and the Zeid centre from above Route 75 and from the bus-stop stair.

## Still open

1. **Frame rate in the centres.** On a modest GPU the automatic resolution hits its floor, and Ben Gurion Square and the Zeid balcony sit on a 30 fps cadence at medium and high. The balcony's draw-call count is the first place to look. Not changed in this pass.
2. **Tall terrace walls.** 2,048 edges stay as one wall because a tread would meet a road or a neighbour. The tallest measured is about 15.7 m, near (−266, −2157). Decide whether those should step anyway.
3. **Small things seen while shooting, not fixed here.** On Yefe Nof a few hedge planes and a pale bar cut through a retaining wall. From inside the cinema lobby the plaza shows through the glass, with a pale band under the trees outside.
4. Cadastral parcels, if they can be obtained, could replace the generated garden plots.
5. Amali's address labels, the computer-shop frontage, and the archaeological journal text are still the open items in [docs/LOCATION_REFERENCES.md](docs/LOCATION_REFERENCES.md).

## Release discipline

Commit only working milestones with meaningful validation notes. Do not force-push or overwrite an existing remote. This first local project can be built into static files under `dist/`; public hosting, performance qualification, asset/legal review and a production release are future steps. The package remains private during development.
