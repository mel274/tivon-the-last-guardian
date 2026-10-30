// Builds src/data/tivon-dem.json from the Copernicus GLO-30 DEM (30 m, public on AWS, no credentials):
//   s3://copernicus-dem-30m/Copernicus_DSM_COG_10_N32_00_E035_00_DEM/  (a cloud-optimised GeoTIFF, 1 arc-second, 3600 x 3600, EPSG:4326)
// Only the window over Tivon is fetched (HTTP range reads). Output: Int16 decimetres, base64, on the same ~6.7 m lat/lon grid and
// bounds as the earlier Terrarium DEM (docs/gis/build-dem-terrarium.mjs). Catmull-Rom fills the grid, then a 16 m local minimum
// and a 10 m gaussian pull canopy and roofs toward the ground. See docs/gis/ELEVATION_DECISION.md.
// Dev tool only (the game has no runtime dependency): needs the `geotiff` package, which is not in package.json:
//   cd docs/gis && npm i --no-save geotiff && node build-dem.mjs
// or point GEOTIFF_DIR at any folder whose node_modules holds it:  GEOTIFF_DIR=/some/dir node docs/gis/build-dem.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.env.GEOTIFF_DIR ? new URL('file:///' + process.env.GEOTIFF_DIR.replace(/\\/g, '/').replace(/\/?$/, '/') + 'x.js') : import.meta.url);
const { fromUrl } = require('geotiff');
const URL_TIF = 'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N32_00_E035_00_DEM/Copernicus_DSM_COG_10_N32_00_E035_00_DEM.tif';
// Output grid (kept identical to the old file so geo.ts is unchanged).
const north = 32.75032260780971, west = 35.1123046875, step = 0.00006, cols = 549, rows = 1232;
const img = await (await fromUrl(URL_TIF)).getImage();
const [ox, oy] = img.getOrigin(), [rx, ry] = img.getResolution(); // top-left corner of the tile, pixel size (ry < 0)
const c0 = Math.floor((west - ox) / rx) - 3, c1 = Math.ceil((west + cols * step - ox) / rx) + 3;
const r0 = Math.floor((north - oy) / ry) - 3, r1 = Math.ceil((north - rows * step - oy) / ry) + 3;
const W = c1 - c0, H = r1 - r0;
const src = (await img.readRasters({ window: [c0, r0, c1, r1], interleave: false }))[0];
// Catmull-Rom weights; pixel values are samples at pixel centres.
const cr = t => [(2 * t * t - t ** 3 - t) / 2, (3 * t ** 3 - 5 * t * t + 2) / 2, (4 * t * t + t - 3 * t ** 3) / 2, (t ** 3 - t * t) / 2];
const px = (r, c) => src[Math.min(H - 1, Math.max(0, r)) * W + Math.min(W - 1, Math.max(0, c))];
function sample(lat, lon) {
  const fr = (lat - oy) / ry - .5 - r0, fc = (lon - ox) / rx - .5 - c0, r = Math.floor(fr), c = Math.floor(fc), wr = cr(fr - r), wc = cr(fc - c);
  let s = 0; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) s += wr[i] * wc[j] * px(r - 1 + i, c - 1 + j);
  return s;
}
const grid = new Int16Array(cols * rows);
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) grid[r * cols + c] = Math.round(sample(north - r * step, west + c * step) * 10);
// Bare-earth correction. The native posting is a DSM (roofs and oak canopy). A local minimum over
// about one 30 m cell (radius 16 m) takes the lowest real sample in that cell, then a short gaussian
// (sigma 10 m) removes the flat bottoms. Heights stay Copernicus samples; nothing is invented.
const world = JSON.parse(fs.readFileSync(new URL('../../src/data/tivon-world.json', import.meta.url), 'utf8'));
const mLat = world.mPerLat * step, mLon = world.mPerLon * step, rad = 16;
const rLat = Math.ceil(rad / mLat), rLon = Math.ceil(rad / mLon);
const eroded = new Int16Array(grid.length);
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  let m = 32767;
  for (let dr = -rLat; dr <= rLat; dr++) {
    const rr = r + dr; if (rr < 0 || rr >= rows) continue;
    const dy = dr * mLat;
    for (let dc = -rLon; dc <= rLon; dc++) {
      const cc = c + dc; if (cc < 0 || cc >= cols) continue;
      const dx = dc * mLon;
      if (dx * dx + dy * dy > rad * rad) continue;
      const v = grid[rr * cols + cc];
      if (v < m) m = v;
    }
  }
  eroded[r * cols + c] = m;
}
const sigma = 10, kLat = Math.ceil(2.5 * sigma / mLat), kLon = Math.ceil(2.5 * sigma / mLon);
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  let sw = 0, sh = 0;
  for (let dr = -kLat; dr <= kLat; dr++) {
    const rr = r + dr; if (rr < 0 || rr >= rows) continue;
    const dy = dr * mLat;
    for (let dc = -kLon; dc <= kLon; dc++) {
      const cc = c + dc; if (cc < 0 || cc >= cols) continue;
      const dx = dc * mLon, w = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      sw += w; sh += w * eroded[rr * cols + cc];
    }
  }
  grid[r * cols + c] = Math.round(sh / sw);
}
const out = { source: 'Copernicus GLO-30 DEM (30 m DSM; 16 m local-minimum bare-earth correction, then 10 m gaussian), © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA; public on AWS (copernicus-dem-30m). Bicubic-resampled to ~6.7 m', units: 'decimetres above sea level', north, west, step, cols, rows, data: Buffer.from(grid.buffer).toString('base64') };
fs.writeFileSync(new URL('../../src/data/tivon-dem.json', import.meta.url), JSON.stringify(out));
const at = (la, lo) => grid[Math.round((north - la) / step) * cols + Math.round((lo - west) / step)] / 10;
console.log(cols, rows, 'range', grid.reduce((a, b) => Math.min(a, b)) / 10, grid.reduce((a, b) => Math.max(a, b)) / 10);
for (const [n, la, lo] of [['amali', 32.72299, 35.13091], ['mandu', 32.711304, 35.125844], ['route75 by mandu', 32.71165, 35.12590], ['plaza', 32.71115, 35.1259], ['catacombs', 32.7027, 35.1276]]) console.log(n, at(la, lo));
