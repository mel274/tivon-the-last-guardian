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
| `src/data/tivon-dem.json` (built by `docs/gis/build-dem-gem15.py`) | GEM-15 bare-earth DTM, 15 m, tile `w35s32`, public COG at `gs://climate-and-sustainability/gem-15`, no credentials. Replaces the Copernicus GLO-30 grid on 2026-10-30. Two no-data patches on the southern slope keep the previous Copernicus samples, shifted −0.36 m so the edge meets GEM-15 | CC BY 4.0. Attribution required: "This dataset is produced by Google". The filled patches remain Copernicus: © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA | Bilinear onto the fixed ~6.7 m grid, Int16 decimetres. Zeid road-to-lower-plaza drop on this grid is 4.93 m (target 5.4, accepted 4.2–6.6). GlobalBuildingAtlas heights are CC BY-NC and are not bundled | This dataset is produced by Google. Copernicus fill: © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA |
| `docs/gis/terrain/*.png`, `docs/gis/build-dem-terrarium.mjs` | AWS Terrain Tiles (Terrarium, z15), Mapzen / AWS Open Data Registry; underlying public DEMs incl. SRTM | Open data; attribution requested | Previous elevation source, kept for reference and reproducibility; no longer used by the game | Terrain tiles: Mapzen, AWS Open Data; SRTM: NASA/USGS |

For generated or procedural assets, identify the source code or generation process and label any unverified real-world resemblance as approximate. Do not label the prototype photorealistic or geographically exact.
