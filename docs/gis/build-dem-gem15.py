"""Rebuild src/data/tivon-dem.json from GEM-15 bare-earth DTM (15 m).

Public COG, no key. CC BY 4.0. The grid stays the one geo.ts already reads:
north 32.75032260780971, west 35.1123046875, step 0.00006, 549 x 1232.
Bilinear only. The 15 m posts are not sharpened.

  python docs/gis/build-dem-gem15.py
"""
import base64
import json
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.windows import Window, from_bounds

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "data" / "tivon-dem.json"
URL = "https://storage.googleapis.com/climate-and-sustainability/gem-15/p30_p30/w35s32/dtm/zall/mosaic.tif"
NORTH, WEST, STEP, COLS, ROWS = 32.75032260780971, 35.1123046875, 0.00006, 549, 1232

south = NORTH - (ROWS - 1) * STEP
east = WEST + (COLS - 1) * STEP
pad = 0.002
to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32636", always_xy=True)
corners = [to_utm.transform(lon, lat) for lon in (WEST - pad, east + pad) for lat in (south - pad, NORTH + pad)]
minx, maxx = min(c[0] for c in corners), max(c[0] for c in corners)
miny, maxy = min(c[1] for c in corners), max(c[1] for c in corners)

with rasterio.open(URL) as src:
    win = from_bounds(minx, miny, maxx, maxy, transform=src.transform)
    win = Window(win.col_off - 2, win.row_off - 2, win.width + 4, win.height + 4)
    arr = src.read(1, window=win, boundless=True, fill_value=np.nan).astype(np.float64)
    transform = src.window_transform(win)

a, b, c, d, e, f = transform.a, transform.b, transform.c, transform.d, transform.e, transform.f
rr, cc = np.meshgrid(np.arange(ROWS), np.arange(COLS), indexing="ij")
lats = NORTH - rr * STEP
lons = WEST + cc * STEP
xs, ys = to_utm.transform(lons, lats)
# North-up UTM: column from x, row from y.
# Affine maps the pixel corner. Samples sit on pixel centres.
cols_f = (xs - c) / a - 0.5
rows_f = (ys - f) / e - 0.5
c0 = np.floor(cols_f).astype(np.int32)
r0 = np.floor(rows_f).astype(np.int32)
tx = cols_f - c0
ty = rows_f - r0
h, w = arr.shape

def at(r, c):
    return arr[np.clip(r, 0, h - 1), np.clip(c, 0, w - 1)]

sampled = (
    at(r0, c0) * (1 - tx) * (1 - ty)
    + at(r0, c0 + 1) * tx * (1 - ty)
    + at(r0 + 1, c0) * (1 - tx) * ty
    + at(r0 + 1, c0 + 1) * tx * ty
)
# GEM-15 leaves no-data on low-texture ground. Two patches sit on the southern slope
# (about 32.689–32.691 N, 35.133–35.136 E). Those cells keep the previous Copernicus
# grid, shifted so the edge meets the GEM-15 bank.
previous = json.loads(OUT.read_text(encoding="utf-8"))
old = np.frombuffer(base64.b64decode(previous["data"]), dtype="<i2").reshape(ROWS, COLS).astype(np.float64) / 10
missing = np.isnan(sampled)
if int(missing.sum()):
    valid = ~missing
    ring = missing.copy()
    ring[1:] |= missing[:-1]
    ring[:-1] |= missing[1:]
    ring[:, 1:] |= missing[:, :-1]
    ring[:, :-1] |= missing[:, 1:]
    ring &= valid
    shift = float(np.mean(sampled[ring] - old[ring])) if int(ring.sum()) else 0.0
    sampled = sampled.copy()
    sampled[missing] = old[missing] + shift
    print(f"filled {int(missing.sum())} cells from the previous grid, edge shift {shift:.2f} m")
grid = np.clip(np.rint(sampled * 10), -32768, 32767).astype("<i2")
source = (
    "GEM-15 bare-earth DTM (15 m), tile w35s32, bilinear onto ~6.7 m. "
    "This dataset is produced by Google. CC BY 4.0. Batchu et al. 2026, GEM-15. "
    "Two no-data patches on the southern slope (about 32.689-32.691 N, 35.133-35.136 E) "
    "keep the previous Copernicus grid, shifted to meet the GEM-15 edge."
)
out = {
    "source": source,
    "units": "decimetres above sea level",
    "north": NORTH,
    "west": WEST,
    "step": STEP,
    "cols": COLS,
    "rows": ROWS,
    "data": base64.b64encode(grid.tobytes()).decode("ascii"),
}
OUT.write_text(json.dumps(out), encoding="utf-8")
print(COLS, ROWS, "range", float(grid.min()) / 10, float(grid.max()) / 10, "wrote", OUT)
