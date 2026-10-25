// LEGACY (replaced by build-dem.mjs, Copernicus GLO-30): builds the earlier src/data/tivon-dem.json from AWS Terrain Tiles (Terrarium encoding, z15) in docs/gis/terrain.
// Elevation (m) = R*256 + G + B/256 - 32768. Data: Mapzen/AWS Open Data terrain tiles (SRTM and other public sources).
// Usage: node docs/gis/build-dem-terrarium.mjs   (uses headless Edge via Playwright to decode PNGs)
import fs from 'node:fs';
import { chromium } from '@playwright/test';
const Z = 15, N = 2 ** Z, dir = new URL('terrain/', import.meta.url);
const tiles = fs.readdirSync(dir).filter(f => /^t15_\d+_\d+\.png$/.test(f)).map(f => { const [, x, y] = f.match(/t15_(\d+)_(\d+)/); return { f, x: +x, y: +y }; });
const xs = tiles.map(t => t.x), ys = tiles.map(t => t.y);
const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
const W = (x1 - x0 + 1) * 256, H = (y1 - y0 + 1) * 256;
const browser = await chromium.launch({ channel: 'msedge', args: ['--disable-gpu'] });
const page = await browser.newPage();
const imgs = tiles.map(t => ({ ...t, data: 'data:image/png;base64,' + fs.readFileSync(new URL(t.f, dir)).toString('base64') }));
const heights = await page.evaluate(async ({ imgs, x0, y0, W, H }) => {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
  for (const t of imgs) { const im = new Image(); im.src = t.data; await im.decode(); g.drawImage(im, (t.x - x0) * 256, (t.y - y0) * 256); }
  const d = g.getImageData(0, 0, W, H).data, out = new Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = Math.round((d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768) * 10);
  return out;
}, { imgs, x0, y0, W, H });
await browser.close();
const lon = px => (x0 + px / 256) / N * 360 - 180;
const lat = py => { const n = Math.PI * (1 - 2 * (y0 + py / 256) / N); return Math.atan(Math.sinh(n)) * 180 / Math.PI; };
// Resample to a regular lat/lon grid (~6 m) so the game can sample with simple bilinear lookup.
const bounds = { south: lat(H), north: lat(0), west: lon(0), east: lon(W) };
const step = 0.00006, cols = Math.floor((bounds.east - bounds.west) / step), rows = Math.floor((bounds.north - bounds.south) / step);
const merc = la => Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360));
const m0 = merc(bounds.north), m1 = merc(bounds.south);
const grid = new Int16Array(cols * rows);
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const la = bounds.north - r * step, lo = bounds.west + c * step;
  const px = (lo - bounds.west) / (bounds.east - bounds.west) * W, py = (merc(la) - m0) / (m1 - m0) * H;
  const ix = Math.min(W - 2, Math.max(0, Math.floor(px))), iy = Math.min(H - 2, Math.max(0, Math.floor(py))), fx = px - ix, fy = py - iy;
  const h = (a, b) => heights[b * W + a];
  grid[r * cols + c] = Math.round(h(ix, iy) * (1 - fx) * (1 - fy) + h(ix + 1, iy) * fx * (1 - fy) + h(ix, iy + 1) * (1 - fx) * fy + h(ix + 1, iy + 1) * fx * fy);
}
const out = { source: 'AWS Terrain Tiles (Terrarium, z15) — Mapzen / AWS Open Data; underlying public DEMs incl. SRTM', units: 'decimetres above sea level', north: bounds.north, west: bounds.west, step, cols, rows, data: Buffer.from(grid.buffer).toString('base64') };
fs.writeFileSync(new URL('../../src/data/tivon-dem.json', import.meta.url), JSON.stringify(out));
const sample = (la, lo) => grid[Math.round((bounds.north - la) / step) * cols + Math.round((lo - bounds.west) / step)] / 10;
console.log(JSON.stringify(bounds), cols, rows);
for (const [n, la, lo] of [['amali', 32.72299, 35.13091], ['mandu', 32.711304, 35.125844], ['route75 by mandu', 32.71165, 35.12590], ['plaza', 32.71115, 35.1259], ['szenes27', 32.71096, 35.12609], ['water tower', 32.71315, 35.12635], ['catacombs', 32.7027, 35.1276], ['statue?', 32.7013, 35.1279], ['habonim2', 32.7107, 35.1308], ['alonim mid', 32.7170, 35.1283]]) console.log(n, sample(la, lo));
