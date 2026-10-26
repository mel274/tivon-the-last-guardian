/** Cuts the terrain mesh along sharp pad edges so an 8 m triangle cannot bridge a floor or a
 *  retaining wall. Boundary vertices sit at the pad; the slope begins outside it. */
import * as THREE from 'three';
import type { P2 } from './geo';

export interface CutSource { poly: P2[]; y: number; blend: number; edgeBlend?: number[] }
export interface CutSeg { ax: number; az: number; bx: number; bz: number; y: number; x0: number; x1: number; z0: number; z1: number }

const MESH_SINK = .08;

/** Sharp edges of flat pads (building floors, house terraces, their steps), at the mesh height. */
export function cutSegments(pads: CutSource[]): CutSeg[] {
  const out: CutSeg[] = [];
  for (const pad of pads) {
    const n = pad.poly.length, y = pad.y - MESH_SINK;
    for (let i = 0; i < n; i++) {
      const sharp = pad.edgeBlend ? !(pad.edgeBlend[i] > 0) : pad.blend === 0;
      if (!sharp) continue;
      const [ax, az] = pad.poly[(i + n - 1) % n], [bx, bz] = pad.poly[i];
      if (Math.hypot(bx - ax, bz - az) < .05) continue;
      out.push({ ax, az, bx, bz, y, x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) });
    }
  }
  return out;
}

interface V { x: number; y: number; z: number; nx: number; ny: number; nz: number; r: number; g: number; b: number }

/** Rewrite one tile so every sharp pad edge is an edge of the mesh. */
export function conformTerrain(geo: THREE.BufferGeometry, cuts: CutSeg[]) {
  if (!cuts.length || !geo.index) return;
  const pos = geo.attributes.position, nrm = geo.attributes.normal, col = geo.attributes.color;
  const src: V[] = [];
  for (let i = 0; i < pos.count; i++) src.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i), nx: nrm.getX(i), ny: nrm.getY(i), nz: nrm.getZ(i), r: col.getX(i), g: col.getY(i), b: col.getZ(i) });
  const index = geo.index;
  // Segments bucketed on a 16 m grid; a triangle only sees the cuts in its own cells.
  const CELL = 16, key = (ix: number, iz: number) => ix * 20000 + iz, buckets = new Map<number, CutSeg[]>();
  for (const s of cuts) for (let ix = Math.floor(s.x0 / CELL); ix <= Math.floor(s.x1 / CELL); ix++) for (let iz = Math.floor(s.z0 / CELL); iz <= Math.floor(s.z1 / CELL); iz++) {
    const k = key(ix, iz); let a = buckets.get(k); if (!a) { a = []; buckets.set(k, a); } a.push(s);
  }
  const seen = new Set<CutSeg>(), idOf = new Map<V, number>(), extra: V[] = [], idx: number[] = [];
  let dirty = false;
  src.forEach((v, i) => idOf.set(v, i));
  const vid = (v: V) => { const hit = idOf.get(v); if (hit !== undefined) return hit; const i = src.length + extra.length; idOf.set(v, i); extra.push(v); return i; };
  for (let t = 0; t < index.count; t += 3) {
    const ia = index.getX(t), ib = index.getX(t + 1), ic = index.getX(t + 2);
    const tri: [V, V, V] = [src[ia], src[ib], src[ic]];
    const x0 = Math.min(tri[0].x, tri[1].x, tri[2].x), x1 = Math.max(tri[0].x, tri[1].x, tri[2].x);
    const z0 = Math.min(tri[0].z, tri[1].z, tri[2].z), z1 = Math.max(tri[0].z, tri[1].z, tri[2].z);
    seen.clear();
    const local: CutSeg[] = [];
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) for (const s of buckets.get(key(ix, iz)) ?? []) {
      if (seen.has(s) || s.x1 < x0 || s.x0 > x1 || s.z1 < z0 || s.z0 > z1) continue;
      seen.add(s); local.push(s);
    }
    if (local.length) dirty = true;
    const made = local.length ? refine(tri, local) : [tri];
    for (const f of made) idx.push(vid(f[0]), vid(f[1]), vid(f[2]));
  }
  if (!dirty) return;
  const all = src.concat(extra), p = new Float32Array(all.length * 3), nm = new Float32Array(all.length * 3), c = new Float32Array(all.length * 3);
  all.forEach((v, i) => { p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z; nm[i * 3] = v.nx; nm[i * 3 + 1] = v.ny; nm[i * 3 + 2] = v.nz; c[i * 3] = v.r; c[i * 3 + 1] = v.g; c[i * 3 + 2] = v.b; });
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere(); geo.computeBoundingBox();
}

function lerp(a: V, b: V, t: number, y: number): V {
  const s = 1 - t;
  return { x: a.x * s + b.x * t, y, z: a.z * s + b.z * t, nx: a.nx * s + b.nx * t, ny: a.ny * s + b.ny * t, nz: a.nz * s + b.nz * t, r: a.r * s + b.r * t, g: a.g * s + b.g * t, b: a.b * s + b.b * t };
}
function area2(ax: number, az: number, bx: number, bz: number, cx: number, cz: number) { return (bx - ax) * (cz - az) - (cx - ax) * (bz - az); }
/** 0 outside, 1 strictly inside, 2 on the boundary. */
function inTri(px: number, pz: number, a: V, b: V, c: V): number {
  const ab = area2(a.x, a.z, b.x, b.z, px, pz), bc = area2(b.x, b.z, c.x, c.z, px, pz), ca = area2(c.x, c.z, a.x, a.z, px, pz);
  const s = Math.sign(area2(a.x, a.z, b.x, b.z, c.x, c.z)) || 1;
  if (ab * s < -1e-4 || bc * s < -1e-4 || ca * s < -1e-4) return 0;
  if (Math.abs(ab) < 1e-3 || Math.abs(bc) < 1e-3 || Math.abs(ca) < 1e-3) return 2;
  return 1;
}
function segHit(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-8) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
  if (t < -1e-5 || t > 1 + 1e-5 || u < -1e-5 || u > 1 + 1e-5) return null;
  const tt = Math.min(1, Math.max(0, t)), uu = Math.min(1, Math.max(0, u));
  return { t: tt, u: uu, x: ax + rx * tt, z: az + rz * tt };
}
function onSeg(px: number, pz: number, a: V, b: V) {
  const abx = b.x - a.x, abz = b.z - a.z, cross = abx * (pz - a.z) - abz * (px - a.x);
  if (Math.abs(cross) > .025 * (Math.hypot(abx, abz) || 1)) return false;
  const dot = (px - a.x) * abx + (pz - a.z) * abz, len2 = abx * abx + abz * abz;
  return dot >= -.001 && dot <= len2 + .001;
}

function refine(tri: [V, V, V], cuts: CutSeg[]): V[][] {
  const pts: V[] = [tri[0], tri[1], tri[2]];
  const segs: Array<[number, number]> = [[0, 1], [1, 2], [2, 0]];
  let cut = false;
  const snap = (x: number, z: number, y: number | null, from?: V, to?: V, t?: number) => {
    for (let i = 0; i < pts.length; i++) if (Math.hypot(pts[i].x - x, pts[i].z - z) < .03) { if (y !== null) pts[i].y = y; return i; }
    const v = from && to && t !== undefined ? lerp(from, to, t, y ?? from.y + (to.y - from.y) * t) : { x, y: y ?? tri[0].y, z, nx: 0, ny: 1, nz: 0, r: (tri[0].r + tri[1].r + tri[2].r) / 3, g: (tri[0].g + tri[1].g + tri[2].g) / 3, b: (tri[0].b + tri[1].b + tri[2].b) / 3 };
    v.x = x; v.z = z; if (y !== null) v.y = y;
    pts.push(v); return pts.length - 1;
  };
  const holding = (x: number, z: number) => segs.findIndex(([a, b]) => onSeg(x, z, pts[a], pts[b]));
  const splitAt = (x: number, z: number, y: number) => {
    const si = holding(x, z); if (si < 0) return snap(x, z, y);
    const [ia, ib] = segs[si];
    const id = snap(x, z, y, pts[ia], pts[ib], Math.hypot(x - pts[ia].x, z - pts[ia].z) / (Math.hypot(pts[ib].x - pts[ia].x, pts[ib].z - pts[ia].z) || 1));
    if (id !== ia && id !== ib) { segs[si] = [ia, id]; segs.push([id, ib]); cut = true; }
    return id;
  };
  const link = (a: number, b: number) => {
    if (a === b) return;
    const queue: Array<[number, number]> = [[a, b]];
    let guard = 0;
    while (queue.length && guard++ < 24) {
      const [u, v] = queue.pop()!;
      if (u === v || segs.some(([p, q]) => (p === u && q === v) || (p === v && q === u))) continue;
      let crossed = false;
      for (let si = 0; si < segs.length; si++) {
        const [c, d] = segs[si];
        if (c === u || c === v || d === u || d === v) continue;
        const hit = segHit(pts[u].x, pts[u].z, pts[v].x, pts[v].z, pts[c].x, pts[c].z, pts[d].x, pts[d].z);
        if (!hit || hit.t < .02 || hit.t > .98 || hit.u < .02 || hit.u > .98) continue;
        const id = snap(hit.x, hit.z, null, pts[u], pts[v], hit.t);
        if (id === u || id === v || id === c || id === d) continue;
        segs[si] = [c, id]; segs.push([id, d]);
        queue.push([u, id], [id, v]); crossed = true; cut = true; break;
      }
      if (!crossed) { segs.push([u, v]); cut = true; }
    }
  };
  for (const s of cuts) {
    const hits: Array<{ u: number; id: number }> = [];
    for (const end of [[0, s.ax, s.az], [1, s.bx, s.bz]] as const) {
      const where = inTri(end[1], end[2], tri[0], tri[1], tri[2]);
      if (where === 1) hits.push({ u: end[0], id: snap(end[1], end[2], s.y) }), cut = true;
      else if (where === 2) hits.push({ u: end[0], id: splitAt(end[1], end[2], s.y) });
    }
    const ips: Array<{ u: number; x: number; z: number }> = [];
    for (const [ia, ib] of segs) {
      const hit = segHit(pts[ia].x, pts[ia].z, pts[ib].x, pts[ib].z, s.ax, s.az, s.bx, s.bz);
      if (!hit) continue;
      if (hit.t < .004 || hit.t > .996) hits.push({ u: hit.u, id: snap(hit.x, hit.z, s.y) });
      else ips.push({ u: hit.u, x: hit.x, z: hit.z });
    }
    for (const ip of ips) hits.push({ u: ip.u, id: splitAt(ip.x, ip.z, s.y) });
    hits.sort((a, b) => a.u - b.u);
    const uniq: typeof hits = [];
    for (const h of hits) if (!uniq.length || uniq[uniq.length - 1].id !== h.id) uniq.push(h);
    for (let i = 0; i + 1 < uniq.length; i += 2) link(uniq[i].id, uniq[i + 1].id);
  }
  if (!cut) return [tri];
  const faces = walk(pts, segs);
  const out: V[][] = [];
  for (const face of faces) {
    if (ringArea(face, pts) <= 1e-4) continue;
    for (const ids of triangulate(face, pts)) {
      const a = pts[ids[0]], b = pts[ids[1]], c = pts[ids[2]];
      if (Math.abs(area2(a.x, a.z, b.x, b.z, c.x, c.z)) < 1e-5) continue;
      // The grass is drawn from above, so the triangle's normal must point up.
      const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
      out.push(ny > 0 ? [a, b, c] : [a, c, b]);
    }
  }
  return out.length ? out : [tri];
}

function ringArea(ids: number[], pts: V[]) {
  let a = 0;
  for (let i = 0; i < ids.length; i++) { const p = pts[ids[i]], q = pts[ids[(i + 1) % ids.length]]; a += p.x * q.z - q.x * p.z; }
  return a / 2;
}
function walk(pts: V[], segs: Array<[number, number]>): number[][] {
  const adj: number[][] = pts.map(() => []), undup: Array<[number, number]> = [], seen = new Set<string>();
  for (const [a, b] of segs) {
    if (a === b) continue;
    const k = a < b ? a + ',' + b : b + ',' + a;
    if (seen.has(k)) continue;
    seen.add(k); undup.push([a, b]); adj[a].push(b); adj[b].push(a);
  }
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    adj[i].sort((u, v) => Math.atan2(pts[u].z - p.z, pts[u].x - p.x) - Math.atan2(pts[v].z - p.z, pts[v].x - p.x));
  }
  const used = new Set<string>(), out: number[][] = [];
  for (const [a0, b0] of undup) for (const s0 of [a0, b0]) {
    const s1 = s0 === a0 ? b0 : a0;
    if (used.has(s0 + '>' + s1)) continue;
    const face: number[] = [];
    let u = s0, v = s1, guard = 0;
    while (guard++ < pts.length + 5) {
      const d = u + '>' + v;
      if (used.has(d)) break;
      used.add(d); face.push(u);
      const nb = adj[v], k = nb.indexOf(u);
      if (k < 0) break;
      const nxt = nb[(k - 1 + nb.length) % nb.length];
      u = v; v = nxt;
      if (u === s0 && v === s1) break;
    }
    if (face.length >= 3) out.push(face);
  }
  return out;
}
function triangulate(ids: number[], pts: V[]): number[][] {
  const ring = ringArea(ids, pts) < 0 ? [...ids].reverse() : ids.slice();
  const out: number[][] = [];
  let guard = 0;
  while (ring.length > 3 && guard++ < ring.length * ring.length + 4) {
    let ear = -1;
    for (let i = 0; i < ring.length; i++) if (isEar(ring, i, pts)) { ear = i; break; }
    if (ear < 0) break;
    const n = ring.length;
    out.push([ring[(ear + n - 1) % n], ring[ear], ring[(ear + 1) % n]]);
    ring.splice(ear, 1);
  }
  if (ring.length === 3) out.push([ring[0], ring[1], ring[2]]);
  else for (let i = 1; i + 1 < ring.length; i++) out.push([ring[0], ring[i], ring[i + 1]]);
  return out;
}
function isEar(ring: number[], i: number, pts: V[]) {
  const n = ring.length, ia = ring[(i + n - 1) % n], ib = ring[i], ic = ring[(i + 1) % n];
  const a = pts[ia], b = pts[ib], c = pts[ic];
  if (area2(a.x, a.z, b.x, b.z, c.x, c.z) <= 1e-8) return false;
  for (const id of ring) {
    if (id === ia || id === ib || id === ic) continue;
    const p = pts[id];
    const ab = area2(a.x, a.z, b.x, b.z, p.x, p.z), bc = area2(b.x, b.z, c.x, c.z, p.x, p.z), ca = area2(c.x, c.z, a.x, a.z, p.x, p.z);
    if (ab > 1e-6 && bc > 1e-6 && ca > 1e-6) return false;
  }
  return true;
}
