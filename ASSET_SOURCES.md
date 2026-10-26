# Asset sources and provenance

## Original prototype assets

The intended prototype asset approach is original procedural geometry and materials: terrain, buildings, café/bar/shop props, vegetation, NPC placeholders, cave meshes and the simplified statue. Such models are interpretations, not photogrammetry or measured reproductions. Any procedural synthesized sound is original game audio rather than a recording from a real venue. Check the actual implemented files before claiming a category is present.

No third-party photographs, music, textures, maps, 3D models or recordings were downloaded or added by the location research task. No real staff likenesses or recordings were used. Real business names identify setting references; fictional staff and dialogue do not imply endorsement.

The two user-provided Google share links were resolved with approved HTTP requests for identity research only. Their responses were temporary reference HTML, not game assets. They identify Amali Roasters and בית התוכנה והמחשב; the latter is consistently listed at HaBonim 2, correcting the initial Yizrael Street description. See the reference register for the exact links and address evidence.

## Research-only sources

The sources in [docs/LOCATION_REFERENCES.md](docs/LOCATION_REFERENCES.md) are references for facts and visual research. Their images and text are **not** automatically licensed for copying into a game. In particular, the Amali website reserves its rights, and council, INPA, Izkor, IAA and social-media photographs require separate reuse verification.

UNESCO labels its descriptive text under CC-BY-SA IGO 3.0 on the [property page](https://whc.unesco.org/en/list/1471/). This does not establish the same license for every photograph, map or linked document. The prototype should use concise original factual summaries with attribution, not copy entire descriptions or assume a blanket image license.

## Runtime software

Third-party runtime/build packages are code dependencies, not game art. Preserve their distributed license files. The package manifest and lockfile are the authoritative dependency/version inventory; no package version is asserted by this research document. Record any additional asset licenses here when adding assets.

## Future geographic data

OpenStreetMap street centrelines are imported: `docs/gis/tivon-api-map.osm` (OSM API 0.6 extract, bbox 32.708–32.730 N, 35.115–35.140 E) plus `tivon-api-south.osm` → `docs/gis/build-world.mjs` → `src/data/tivon-world.json` (projected at 1:1, simplified). Credit **© OpenStreetMap contributors**, ODbL 1.0; see the [OpenStreetMap copyright and license information](https://www.openstreetmap.org/copyright). The in-game map shows this attribution. For elevation data, retain the dataset name, release, resolution, bounds and redistribution terms before bundling.

## Asset intake template

For every external asset added later, record:

| Asset/file | Author/source URL | Exact license | Changes | Required credit |
|---|---|---|---|---|
| `public/textures/amali-logo.png` | Amali's logo, supplied by the project owner in chat for use on the in-game storefront | Business trademark; used to identify the real café, no endorsement implied | None | Amali (עמלי) |
| `public/textures/tivon-material-atlas.png` | Original AI-generated atlas, made for this project (`src/world/materials.ts`) | Original project art | Sampled in world space for limestone, plaster, asphalt and paving. Grass, roof tiles, wood and soil are painted on canvases in code, not taken from this file | None beyond the game itself |
| `src/data/tivon-world.json` | OpenStreetMap API extracts `docs/gis/tivon-api-map.osm` and `tivon-api-south.osm` (bbox 32.694–32.7085 N, 35.112–35.145 E, fetched 24 Oct 2026) | ODbL 1.0 | Projected to local metres at 1:1, simplified | © OpenStreetMap contributors |
| `src/data/tivon-dem.json` (built by `docs/gis/build-dem.mjs`) | Copernicus GLO-30 DEM (30 m DSM), tile `Copernicus_DSM_COG_10_N32_00_E035_00_DEM`, public on AWS Open Data (`s3://copernicus-dem-30m`), no credentials | Free, full and open for any use; attribution required: © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA, all rights reserved | Window over Tivon fetched by HTTP range reads, Catmull-Rom bicubic-resampled to the old ~6.7 m lat/lon grid, Int16 decimetres. Chosen over the earlier Terrarium DEM: roads are far smoother (RMS second difference per 4 m 0.07 m against 1.06 m), steep-road samples halve, and the Zeid road-to-lower-plaza drop is closer to the owner's 5.4 m (5.2 m against 3.7 m at the surveyed points). Both are about 30 m true resolution and both measure rooftops and tree canopy; the town's own smoothing and house terraces (`src/world/terrain.ts`, `terraces.ts`) shape the detail on top. Rechecked 2026-10-26: this is still the DEM the game samples. The plot, terrain-mesh and Mandu tasks added no new texture files | Copernicus DEM: ESA / European Union |
| `docs/gis/terrain/*.png`, `docs/gis/build-dem-terrarium.mjs` | AWS Terrain Tiles (Terrarium, z15), Mapzen / AWS Open Data Registry; underlying public DEMs incl. SRTM | Open data; attribution requested | Previous elevation source, kept for reference and reproducibility; no longer used by the game | Terrain tiles: Mapzen, AWS Open Data; SRTM: NASA/USGS |

For generated or procedural assets, identify the source code or generation process and label any unverified real-world resemblance as approximate. Do not label the prototype photorealistic or geographically exact.
