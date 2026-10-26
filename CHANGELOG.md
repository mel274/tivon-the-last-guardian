# Changelog

## Unreleased (branch `world-pass`)

### Added
- Walk-in shops across the Zeid centre, built with a shared interior kit (`src/world/interiors.ts`, 17 sets):
  - Upper floor: Butcher Tivon, printing, Itzik's camera shop, Pilates and building supplies.
  - Ground floor: Mishi, Oranim pharmacy, the על-הקו (Rav-Kav) service centre and the flower shop.
  - The Zohar cinema lobby with Eva & Batya inside.
  - The falafel row (Falafel Chen, AURUM clocks, מספרת סלים, Falafel Luli, a for-rent unit, Beit Chabad), the pizza unit and Drugstore HaTzomet.
  - Each shop has a keeper to talk to. Zeid 1 stays closed, and Mandu's interior waits for the owner's drawing (Mandu Interior Plan, revision 3).
  - Furnishings are hidden beyond 90 m.
- The falafel-row corner to plan revision 4.2:
  - the one-storey row with its canopy, the pizza unit facing the lane's street entrance, and the drugstore with red Coca-Cola boards and a porch;
  - the paved lane with picnic tables;
  - the Route 75 guardrail to the Kiryat Amal junction, and the garden path down to the Hannah Szenes garden.
- More details from the owner's photos: beige balcony tiles, canvas awnings, roller shutters, a landing on the lower-plaza stair, and a longer bus-stop stair with green railings.
- Private houses on their own garden plots (`src/world/plots.ts`):
  - a street wall, hedge or fence from the survey;
  - side fences, a gate and path, a driveway or carport;
  - lawn and garden trees.
- House terraces (`src/world/terraces.ts`): each private house sits on a flat pad, with rubble-stone retaining walls on its downhill edges.
- GitHub Pages deployment (base-path-aware asset loads and a deploy workflow).

### Changed
- The DEM is now Copernicus GLO-30, replacing AWS Terrain Tiles:
  - it gives smoother ground and a closer Zeid drop (5.2 m against the real 5.4 m);
  - `docs/gis/build-dem.mjs` rebuilds it, and the old builder is kept as `build-dem-terrarium.mjs`.
- Road beds are smoothed along each road and held to 12% grade (`src/world/roadGrade.ts`).
- The street survey covers all 81 streets (20 more from Street View, 15 estimated).
- Shopkeepers use the real shop names.

### Fixed
- The cave entrance is open: the hill stays above every cave space, and the walk test reaches every chamber.
- Distant ridges are drawn as unclipped haze, so there is no sky arc on the horizon.

### Known
- House plots make the town slower to build (about 28 s to load in the browser). A speed-up is half done on branch `worktree-agent-a7d8f80b132bf05e1`.
- Some Zeid rooms were cut short where the old ground poked through their floors. They have not been re-checked against the new DEM.

## 0.3.0 — Tivon at 1:1, 2026-10-24

### Changed
- The map is now real scale: every OpenStreetMap street, footpath, steps, track, car park and pedestrian area in a 2 × 3 km area (`docs/gis/build-world.mjs`), and all 2,342 OSM building footprints extruded on real ground with per-storey windows, red-tile or solar-heater roofs and real-edge colliders.
- Real elevation from AWS Terrain Tiles (`docs/gis/build-dem.mjs`): the old centre on the hill (~176 m), Kiryat Amal by Route 75 (~159 m), the catacombs (~97 m). Terraces are flattened where the town is built in levels.
- Ben Gurion Square is the real pedestrian street from HaShkedim up to Get Phone, with the shops from Google Maps (Arbes Hummus, BM Real Estate, MoneyGram, Lehem Erez, Shany, the local council, Dani, Nitzat HaDuvdevan, the butcher, Hinanit) under ash trees, and Amali on its footprint.
- Get Phone: Dima sells a flashlight and batteries from the start.
- Zeid centre rebuilt from the community sketch: the Mandu building on Route 75 with the bus-stop stair down to the upper plaza (Falafel Chen), Mandu upstairs (bar strip, pergola backyard under the highway, columned balcony), the stair down to the lower plaza, Zohar cinema with its solar roof, and on the ground floor Oranim pharmacy, Mishi, Zeid 1 (under construction) and the covered passage with the Rav-Kav centre, a flower shop and empty units.
- Mandu is Café Beinenu by day (beans and its own espresso machine) and the bar at night; its signs swap at dusk.
- Landmarks recreated from photos: the water-tower lookout, the Library & Memorial Center with its skylight drum, the three-rail monument, Yad LaBanim, and the Alexander Zaid statue on its boulder pedestal at its real place south of the catacombs.
- Every person can be talked to; locals share very Tivon complaints (boars, parking, leaf blowers, Route 75, Waze…).
- A corner minimap shows real streets and buildings, with the player as a cyclamen.
- The fictional cave now runs into the real hill; the ending climbs out to the Zaid statue at sunrise. Walking and sprinting are faster for the real distances.
- Saves made on earlier maps re-spawn on Ben Gurion Square.
- Buildings come from the community's full OSM extract (`docs/gis/tivon-osm-full.osm`): 2,660 footprints over 2.4 × 4.2 km, each tagged with its nearest street so per-street styles (storeys, wall finish, roofs, front walls/hedges, garden trees) can follow a Street View survey (`src/data/street-styles.json`).
- The Zeid centre is rebuilt to the owner-approved plan (Zeid Centre Plan, revision 3.1; `ZEID` in `src/world/layout.ts`):
  - Bus-stop stair down to the upper-plaza walkway, with picnic tables, the drugstore and the falafel row along the lane.
  - Upper floor, west to east: Butcher Tivon, printing, Mandu's bar strip, the camera shop, Pilates, building supplies, all on a full-length balcony.
  - The backyard behind, below a bank of bushes.
  - The stair down to the lower plaza.
  - Ground floor: the closed Rav-Kav and flowers section with its east-facing door, then Zeid 1, Mishi and Oranim pharmacy behind a roofed strip.
  - Zohar cinema facing the building.
  - A route test walks from the bus stop to every part of the centre at the right level.
- Details from the owner's photos:
  - On the balcony: wooden-slat piers, a stucco parapet with a wooden cap, red ceiling beams, and Mandu's hanging sign.
  - Elsewhere: the stair's stucco wall, red pavers, the yellow kiosk by the bus stop, umbrellas, and Falafel Luli's real sign and blue scalloped awning.
- Plazas are laid as level terraces; footpaths and garden hedges no longer drape over them, and the ground mesh stays below terrace paving at retaining walls. The loading screen also finishes in a background tab.
- Street View survey of 46 streets (2012 imagery) now drives about 2,100 of the 2,660 houses: storeys, plaster colours (including the grey-green 1950s cottages), red-tile share, low rubble walls with tall hedges behind, and tree density and species. Unsurveyed streets use the town-wide pattern the survey found. Red-tile roofs now actually render terracotta (they were white).
- About 22,600 trees (was ~14,000): street trees, garden trees and yard trees now place properly, as dense as each street's survey says; distant trees draw as a single crown.
- The town map (M) zooms (wheel, pinch, +/−) and pans, draws every building, and marks the player with a pulsing cyclamen, a heading arrow and "YOU ARE HERE"; ◎ re-centres. The corner minimap turns with the player so the cyclamen always stands upright.
- Performance: a loading screen builds the world in stages; the ground is split into culled tiles (about a third of the triangles per frame); draw distance, fog and shadow-map size follow the graphics setting (low 380 m, medium 620 m, high 1,000 m); shadows update every other frame; daylight keeps only the two nearest lamps lit; lighter tree crowns; nearest-road, land-use and interaction lookups are indexed; resolution drops automatically when frames run below about 40 fps and recovers when there is headroom.


## 0.2.0 — bigger, more accurate Tivon, 2026-10-24

### Changed
- The town is rebuilt on the real OpenStreetMap street network of Kiryat Tivon (compressed, with the two commercial centres magnified), covering the old centre on the hill, Alonim Street, Kiryat Amal by Route 75, HaBonim and the road south to Beit She'arim — roughly 500 × 950 m of walkable world.
- Graphics: photographic world-projected materials (limestone, plaster, asphalt, paving) from the existing atlas, procedural grass/tile/wood/soil, gradient sky with sun, clouds and stars, glowing windows and lamps after dusk, Tivon-style houses (red-tile cottages, flat roofs with solar water heaters, apartment blocks), oak/pine/cypress/olive woodland, red-and-white kerbs, lane markings, crossings, street signs and parked cars. Chunked batching keeps draw calls low.
- Amali: tall former-cinema hall with the café's own logo, its purple brand colour, glazed steel front, roaster, grinders, pastry case and laptop tables.
- Mandu moved to the upper floor of 1 Alexander Zaid with an outside stair, terrace seating, ~22 tables, a long bar, a stage and a vintage corner.
- Storefront rows: Falafel Luli, shawarma, barbers and a hair salon, bakery, pharmacy, post office, Bank Hapoalim, Zol Stock, Rani Organic, Shalva café, Braaap bikes, books and flowers, Butcher Tivon, Zohar Hall and more.
- New examinable landmarks (`landmark_*`): Founders' Garden, synagogue, water tower, Yad LaBanim, MDA, Gali Tivon pool, Momos, Rimonim school, the Great Oak, lookouts, Paz station, Hannah Szenes pool, Route 75 junction, park entrance and the relocated Alexander Zaid memorial.
- Catacomb puzzle made explicit: a briefing board, junction signs, symbol-carved panels I–III, a visible dark wall for the flashlight mark, glowing markers on unfound clues, seals that light as pressed, an on-screen checklist with location hints, clearer dialogue and an automatic door once everything is solved.
- Town map (M) drawn from the OSM streets with landmarks and the next destination; cave map shows clue status.
- Multi-storey floors and stairs, oriented colliders for buildings on angled streets, collision spatial hashing.
- Old saves outside the caves re-spawn on Ben Gurion Square (positions from the earlier schematic map no longer match).


## 0.1.0 — initial prototype, 2026-10-24

This entry records source work. Executed build/browser results belong in [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md); it does not claim a finished production release.

### Added

- Three.js, TypeScript and Vite project configuration, plus Vitest and Playwright development tooling.
- Procedural Tivon town with enterable café, populated Mandu bar, electronics shop, regional scenery, interaction targets and replaceable geometry.
- First-person movement, jump/gravity, floor-height handling, wall collisions, keyboard alternatives and reduced camera-motion support.
- Hebrew/English interface, inventory, dialogue, journal, schematic map, pause and settings panels.
- Serializable gameplay for separate beans/brewing/drinking actions, wakefulness, intoxication, purchases, flashlight batteries and ordered quests.
- Catacomb and guardian story state: observations, light mark, map fragments, mechanisms, late identity reveal, memory objects, final oath and peaceful ending.
- Versioned local save validation and pure gameplay regression tests.
- Original synthesized ambience and effects; no external music or venue recordings.
- Location research register, asset provenance, game design and staged validation plan.

### Research corrections

- Resolved the original Amali share link to **עמלי בית קפה – Amali Roasters**. Recorded the remaining Ben Gurion Square/HaRakafot address-label discrepancy.
- Resolved the user's computer-shop link to **בית התוכנה והמחשב**, consistently listed at **HaBonim 2**. This corrects the initial uncertain Yizrael Street description while preserving its position after Mandu in the quest.
- Labeled approximate façades, compressed routes and all fictional archaeology/supernatural content. No GIS accuracy, photorealism or permission to reuse reference photographs is claimed.
