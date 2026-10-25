// Lists sample points (start, middle, end) for every named street in docs/gis/tivon-osm-full.osm,
// for the Street View survey (docs/gis/street-survey.json). Usage: node docs/gis/street-samples.mjs
import fs from 'node:fs';
const xml = fs.readFileSync(new URL('tivon-osm-full.osm', import.meta.url), 'utf8');
const decode = s => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attrs = s => Object.fromEntries([...s.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], decode(m[2])]));
const tags = s => Object.fromEntries([...(s || '').matchAll(/<tag\s+([^>]+)\/>/g)].map(m => { const a = attrs(m[1]); return [a.k, a.v]; }));
const nodes = new Map();
for (const m of xml.matchAll(/<node\b([^>]*?)(?:\/>|>([\s\S]*?)<\/node>)/g)) { const a = attrs(m[1]); nodes.set(a.id, [+a.lat, +a.lon]); }
const VEH = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'pedestrian']);
const byName = new Map();
for (const m of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
  const t = tags(m[2]); if (!t.name || !VEH.has(t.highway)) continue;
  const pts = [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(x => nodes.get(x[1])).filter(Boolean);
  let e = byName.get(t.name); if (!e) { e = { name: t.name, en: t['name:en'] || '', kind: t.highway, pts: [] }; byName.set(t.name, e); }
  e.pts.push(...pts);
}
const len = p => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot((p[i][0] - p[i - 1][0]) * 110900, (p[i][1] - p[i - 1][1]) * 93650); return L; };
const out = [...byName.values()].map(e => {
  const L = len(e.pts), n = L > 900 ? 5 : L > 400 ? 3 : L > 120 ? 2 : 1;
  const samples = Array.from({ length: n }, (_, i) => e.pts[Math.floor((i + .5) / n * (e.pts.length - 1))]).map(([la, lo]) => [+la.toFixed(6), +lo.toFixed(6)]);
  return { name: e.name, en: e.en, kind: e.kind, lengthM: Math.round(L), samples };
}).sort((a, b) => b.lengthM - a.lengthM);
fs.writeFileSync(new URL('street-samples.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(out.length, 'streets,', out.reduce((s, e) => s + e.samples.length, 0), 'sample points');
