import fs from 'node:fs';
const root = new URL('../../', import.meta.url);
const files = ['tivon-api-map.osm', 'tivon-api-south.osm'];
const decode = s => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attrs = s => Object.fromEntries([...s.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], decode(m[2])]));
const tags = s => Object.fromEntries([...s.matchAll(/<tag\s+([^>]+)\/>/g)].map(m => { const a = attrs(m[1]); return [a.k, a.v]; }));
const nodes = new Map(), ways = new Map();
const sources = [];
for (const file of files) {
  const url = new URL(file, import.meta.url);
  if (!fs.existsSync(url)) continue;
  const xml = fs.readFileSync(url, 'utf8');
  if (!xml.includes('<osm version=')) throw Error(`Invalid OSM XML: ${file}`);
  const bounds = attrs(xml.match(/<bounds ([^>]+)\/>/)[1]);
  sources.push({ file, bounds, url: `https://api.openstreetmap.org/api/0.6/map?bbox=${bounds.minlon},${bounds.minlat},${bounds.maxlon},${bounds.maxlat}` });
  for (const match of xml.matchAll(/<node\b([^>]*?)(?:\/>|>([\s\S]*?)<\/node>)/g)) {
    const a = attrs(match[1]); nodes.set(a.id, { id: +a.id, lat: +a.lat, lon: +a.lon, tags: tags(match[2] ?? '') });
  }
  for (const match of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    const a = attrs(match[1]); ways.set(a.id, { id: +a.id, tags: tags(match[2]), nodeIds: [...match[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(n => n[1]) });
  }
}
const geometry = way => way.nodeIds.map(id => { const n = nodes.get(id); if (!n) throw Error(`Missing node ${id}`); return [n.lon, n.lat]; });
const relevant = way => ({ id: way.id, name: way.tags.name ?? '', kind: way.tags.highway ?? way.tags.building, tags: way.tags, nodeIds: way.nodeIds.map(Number), points: geometry(way) });
const roads = [...ways.values()].filter(w => w.tags.highway).map(relevant);
const buildings = [...ways.values()].filter(w => w.tags.building).map(w => ({ ...relevant(w), ...(w.tags['building:levels'] ? { levels: Number.parseFloat(w.tags['building:levels']) } : {}) }));
const pois = [...nodes.values()].filter(n => n.tags.name || n.tags.shop || n.tags.amenity || n.tags.tourism || n.tags.historic || n.tags['addr:housenumber']).map(n => ({ ...n, name: n.tags.name ?? '' }));
const dataset = {
  origin: { lat: 32.719, lon: 35.1275 },
  bounds: { south: Math.min(...sources.map(s => +s.bounds.minlat)), west: Math.min(...sources.map(s => +s.bounds.minlon)), north: Math.max(...sources.map(s => +s.bounds.maxlat)), east: Math.max(...sources.map(s => +s.bounds.maxlon)) },
  attribution: '© OpenStreetMap contributors', timestamp: new Date().toISOString(),
  metadata: {
    title: 'Kiryat Tivon street and building extract', fetchedAt: new Date().toISOString(),
    source: 'OpenStreetMap API 0.6', sources,
    attribution: '© OpenStreetMap contributors', attributionUrl: 'https://www.openstreetmap.org/copyright',
    license: 'ODbL 1.0', licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    coordinates: 'points are [longitude, latitude] in WGS84. Geometry has not been compressed, rotated or simplified. origin is the arithmetic center of the original requested central bounding box, not a claimed landmark coordinate.',
    limitations: 'Community mapping; not a survey or photographic reconstruction. Building heights and businesses may be absent/outdated. Multipolygon building relations are not extracted. No elevation raster is included.'
  }, roads, buildings, pois
};
fs.writeFileSync(new URL('src/data/tivon-osm.json', root), JSON.stringify(dataset));
console.log(JSON.stringify({ roads: roads.length, buildings: buildings.length, pois: pois.length, bytes: fs.statSync(new URL('src/data/tivon-osm.json', root)).size }));
for (const w of roads.filter(w => /בן גוריון|רקפות|אלכסנדר|הבונים|יזרעאל/.test(w.tags.name ?? ''))) console.log(JSON.stringify({ id:w.id, name:w.tags.name, nameEn:w.tags['name:en'], highway:w.tags.highway, junction:w.tags.junction, points:w.points.length, first:w.points[0],last:w.points.at(-1) }));
for (const n of pois.filter(n => /עמלי|מנדו|תוכנה|זייד|שערים/.test(n.tags.name ?? ''))) console.log(JSON.stringify(n));
