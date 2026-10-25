// Builds src/data/tivon-world.json — the 1:1 game map of Kiryat Tivon from OpenStreetMap
// (© OpenStreetMap contributors, ODbL 1.0): streets and paths, pedestrian/park/parking areas,
// building footprints and named places, projected to local metres.
// Usage: node docs/gis/build-world.mjs   (reads docs/gis/tivon-osm-full.osm, an OSM export supplied by the project owner)
import fs from 'node:fs';
// Origin: Beit She'arim catacombs (Cave of Rabbi Yehuda HaNasi / Cave of the Coffins courtyard).
export const ORIGIN = { lat: 32.70340, lon: 35.12878, x: 126, z: 86 };
const MX = 93650, MZ = 110900;
const project = (lon, lat) => [+(ORIGIN.x + (lon - ORIGIN.lon) * MX).toFixed(1), +(ORIGIN.z - (lat - ORIGIN.lat) * MZ).toFixed(1)];
const BOUNDS = { south: 32.6995, north: 32.7375, west: 35.1126, east: 35.1380 };
const [minX, maxZ] = project(BOUNDS.west, BOUNDS.south), [maxX, minZ] = project(BOUNDS.east, BOUNDS.north);
const decode = s => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attrs = s => Object.fromEntries([...s.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], decode(m[2])]));
const tags = s => Object.fromEntries([...(s || '').matchAll(/<tag\s+([^>]+)\/>/g)].map(m => { const a = attrs(m[1]); return [a.k, a.v]; }));
const nodes = new Map(), ways = new Map(), relations = [];
for (const f of ['tivon-osm-full.osm']) {
  const xml = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
  for (const m of xml.matchAll(/<node\b([^>]*?)(?:\/>|>([\s\S]*?)<\/node>)/g)) { const a = attrs(m[1]); nodes.set(a.id, { lat: +a.lat, lon: +a.lon, t: tags(m[2]) }); }
  for (const m of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) { const a = attrs(m[1]); ways.set(a.id, { id: a.id, t: tags(m[2]), n: [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(x => x[1]) }); }
  for (const m of xml.matchAll(/<relation\b([^>]*)>([\s\S]*?)<\/relation>/g)) relations.push({ t: tags(m[2]), members: [...m[2].matchAll(/<member type="way" ref="(\d+)" role="([^"]*)"\/>/g)].map(x => ({ ref: x[1], role: x[2] })) });
}
const pts = w => w.n.map(id => nodes.get(id)).filter(Boolean).map(n => project(n.lon, n.lat));
const inBox = ([x, z], pad = 40) => x > minX - pad && x < maxX + pad && z > minZ - pad && z < maxZ + pad;
const simplify = (p, tol) => {
  if (p.length < 3) return p;
  const a = p[0], b = p.at(-1); let best = 0, idx = 0;
  for (let i = 1; i < p.length - 1; i++) { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, d = Math.abs((p[i][0] - a[0]) * dz - (p[i][1] - a[1]) * dx) / l; if (d > best) { best = d; idx = i; } }
  return best > tol ? [...simplify(p.slice(0, idx + 1), tol).slice(0, -1), ...simplify(p.slice(idx), tol)] : [a, b];
};
// Carriageway widths (m). Route 75 is mapped as two one-way carriageways.
const WIDTH = { motorway: 11, trunk: 7.5, trunk_link: 5, primary: 7.5, primary_link: 5, secondary: 7, secondary_link: 5, tertiary: 6.5, tertiary_link: 5, unclassified: 5.5, residential: 5.5, living_street: 4.5, service: 3.6, pedestrian: 5, footway: 2, path: 1.6, steps: 2.2, track: 3, cycleway: 2 };
const roads = [], areas = [], buildings = [], pois = [];
for (const w of ways.values()) {
  const t = w.t, p = pts(w); if (p.length < 2 || !p.some(q => inBox(q))) continue;
  const closed = w.n[0] === w.n.at(-1);
  if (t.highway && !(closed && (t.area === 'yes' || t.highway === 'pedestrian' && t.area !== 'no' && closed))) {
    const width = +t.width || WIDTH[t.highway]; if (!width) continue;
    roads.push({ k: t.highway, w: width, n: t.name || '', en: t['name:en'] || '', ow: t.oneway === 'yes' ? 1 : 0, br: t.bridge === 'yes' ? 1 : 0, sf: t.surface || '', p: simplify(p, .4) });
  } else if (closed && (t.highway === 'pedestrian' || t.area === 'yes' && t.highway)) areas.push({ k: 'pedestrian', p: simplify(p, .3) });
  else if (t.building) {
    const lv = +(t['building:levels'] || 0), h = +(t.height || 0);
    buildings.push({ id: w.id, p: simplify(p.slice(0, closed ? -1 : undefined), .25), lv, h, n: t.name || '', b: t.building, a: t.amenity || t.shop || t.man_made || t.historic || '', lay: +(t.layer || 0) });
  } else if (closed) {
    const k = t.leisure === 'park' || t.leisure === 'garden' ? 'park' : t.amenity === 'parking' ? 'parking' : t.leisure === 'pitch' ? 'pitch' : t.leisure === 'playground' ? 'playground' : t.landuse === 'forest' || t.natural === 'wood' ? 'forest' : t.amenity === 'school' ? 'school' : t.landuse === 'cemetery' ? 'cemetery' : t.landuse === 'farmland' || t.landuse === 'meadow' || t.landuse === 'orchard' ? 'farm' : t.leisure === 'swimming_pool' ? 'pool' : t.historic === 'archaeological_site' ? 'heritage' : '';
    if (k) areas.push({ k, n: t.name || '', p: simplify(p.slice(0, -1), .6) });
  }
  if ((t.name || t.shop || t.amenity) && !t.highway && closed) { const c = p.reduce((s, q) => [s[0] + q[0] / p.length, s[1] + q[1] / p.length], [0, 0]); pois.push({ n: t.name || '', k: t.shop || t.amenity || t.historic || t.leisure || t.building || '', x: +c[0].toFixed(1), z: +c[1].toFixed(1) }); }
}
for (const n of nodes.values()) {
  const t = n.t; if (!(t.name || t.shop || t.amenity || t.historic)) continue; if (t.bus || t.highway || t.public_transport) { if (!t.highway) continue; }
  const [x, z] = project(n.lon, n.lat); if (!inBox([x, z])) continue;
  pois.push({ n: t.name || '', k: t.shop || t.amenity || t.historic || t.tourism || t.leisure || (t.highway === 'bus_stop' ? 'bus_stop' : ''), x, z });
}
// Tag each building with the nearest named street (for per-street styling from the Street View survey).
const named = roads.filter(r => r.n && !['footway', 'path', 'steps', 'track', 'service', 'cycleway'].includes(r.k));
for (const b of buildings) {
  const cx = b.p.reduce((s, q) => s + q[0], 0) / b.p.length, cz = b.p.reduce((s, q) => s + q[1], 0) / b.p.length;
  let best = Infinity, name = '';
  for (const r of named) for (let i = 1; i < r.p.length; i++) {
    const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i], vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((cx - ax) * vx + (cz - az) * vz) / l2));
    const d = Math.hypot(cx - ax - vx * t, cz - az - vz * t); if (d < best) { best = d; name = r.n; }
  }
  b.st = best < 60 ? name : '';
}
const out = {
  attribution: '© OpenStreetMap contributors (ODbL 1.0)', scale: 1, origin: ORIGIN, mPerLon: MX, mPerLat: MZ,
  bounds: { minX: Math.round(minX), maxX: Math.round(maxX), minZ: Math.round(minZ), maxZ: Math.round(maxZ) },
  roads, areas, buildings, pois,
};
fs.mkdirSync(new URL('../../src/data/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../../src/data/tivon-world.json', import.meta.url), JSON.stringify(out));
const kinds = {}; for (const r of roads) kinds[r.k] = (kinds[r.k] || 0) + 1;
console.log(JSON.stringify({ bounds: out.bounds, roads: roads.length, kinds, areas: areas.length, buildings: buildings.length, pois: pois.length, kb: Math.round(fs.statSync(new URL('../../src/data/tivon-world.json', import.meta.url)).size / 1024) }));
