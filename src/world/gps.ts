/** GTA-style GPS: shortest walk along the OpenStreetMap road/path network. */
import { ROADS, VEHICLE, type P2 } from './geo';

const STEP = 8; // metres — snap resolution for the route graph
type Node = { x: number; z: number; edges: Array<{ to: number; w: number }> };

let nodes: Node[] | null = null;
let cellIndex: Map<number, number[]> | null = null;

const q = (v: number) => Math.round(v / STEP) * STEP;
const key = (x: number, z: number) => ((q(x) + 50000) * 200000) + (q(z) + 50000);
const cell = (x: number, z: number) => Math.floor(x / 64) * 10000 + Math.floor(z / 64);

function ensureGraph() {
  if (nodes) return;
  const map = new Map<number, number>();
  nodes = [];
  cellIndex = new Map();
  const add = (x: number, z: number) => {
    const k = key(x, z); let i = map.get(k);
    if (i === undefined) {
      i = nodes!.length;
      map.set(k, i);
      const n: Node = { x: q(x), z: q(z), edges: [] };
      nodes!.push(n);
      const c = cell(n.x, n.z); let bucket = cellIndex!.get(c); if (!bucket) { bucket = []; cellIndex!.set(c, bucket); }
      bucket.push(i);
    }
    return i;
  };
  const link = (a: number, b: number) => {
    if (a === b) return;
    const na = nodes![a], nb = nodes![b], w = Math.hypot(nb.x - na.x, nb.z - na.z);
    if (w < .5) return;
    if (!na.edges.some(e => e.to === b)) na.edges.push({ to: b, w });
    if (!nb.edges.some(e => e.to === a)) nb.edges.push({ to: a, w });
  };
  for (const road of ROADS) {
    // Prefer driveable streets + footpaths; skip tiny service stubs that clutter the graph.
    if (!VEHICLE.has(road.kind) && road.kind !== 'path' && road.kind !== 'footway' && road.kind !== 'steps' && road.kind !== 'pedestrian' && road.kind !== 'track') continue;
    let prev = -1;
    for (const [x, z] of road.points) {
      const i = add(x, z);
      if (prev >= 0) link(prev, i);
      prev = i;
    }
  }
  // Bridge nearby nodes from different ways so junctions connect.
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i], cx = Math.floor(n.x / 64), cz = Math.floor(n.z / 64);
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      for (const j of cellIndex.get((cx + ox) * 10000 + (cz + oz)) ?? []) {
        if (j <= i) continue;
        const m = nodes[j], d = Math.hypot(m.x - n.x, m.z - n.z);
        if (d > 0 && d <= 14) link(i, j);
      }
    }
  }
}

function nearestNode(x: number, z: number): number {
  ensureGraph();
  let best = 0, bd = Infinity;
  const cx = Math.floor(x / 64), cz = Math.floor(z / 64);
  for (let ring = 0; ring < 25; ring++) {
    for (let ix = cx - ring; ix <= cx + ring; ix++) for (let iz = cz - ring; iz <= cz + ring; iz++) {
      if (Math.max(Math.abs(ix - cx), Math.abs(iz - cz)) !== ring) continue;
      for (const i of cellIndex!.get(ix * 10000 + iz) ?? []) {
        const n = nodes![i], d = Math.hypot(n.x - x, n.z - z);
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (bd <= ring * 64 + 20) break;
  }
  return best;
}

export interface GpsRoute { points: P2[]; metres: number }

/** A* along the street graph from the player to a destination. */
export function findRoute(fromX: number, fromZ: number, toX: number, toZ: number): GpsRoute | null {
  ensureGraph();
  const start = nearestNode(fromX, fromZ), goal = nearestNode(toX, toZ);
  if (start === goal) {
    const metres = Math.hypot(toX - fromX, toZ - fromZ);
    return { points: [[fromX, fromZ], [toX, toZ]], metres };
  }
  const N = nodes!.length;
  const gScore = new Float64Array(N).fill(Infinity);
  const fScore = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const open: number[] = [start];
  const inOpen = new Uint8Array(N);
  gScore[start] = 0;
  fScore[start] = Math.hypot(nodes![goal].x - nodes![start].x, nodes![goal].z - nodes![start].z);
  inOpen[start] = 1;
  const h = (i: number) => Math.hypot(nodes![goal].x - nodes![i].x, nodes![goal].z - nodes![i].z);

  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (fScore[open[i]] < fScore[open[bi]]) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1]; open.pop(); inOpen[cur] = 0;
    if (cur === goal) break;
    for (const e of nodes![cur].edges) {
      const tent = gScore[cur] + e.w;
      if (tent >= gScore[e.to]) continue;
      came[e.to] = cur; gScore[e.to] = tent; fScore[e.to] = tent + h(e.to);
      if (!inOpen[e.to]) { open.push(e.to); inOpen[e.to] = 1; }
    }
  }
  if (came[goal] < 0 && start !== goal) {
    // Fallback: straight line if the graph is disconnected.
    const metres = Math.hypot(toX - fromX, toZ - fromZ);
    return { points: [[fromX, fromZ], [toX, toZ]], metres };
  }
  const chain: number[] = [];
  for (let c = goal; c >= 0; c = came[c]) { chain.push(c); if (c === start) break; }
  chain.reverse();
  const points: P2[] = [[fromX, fromZ], ...chain.map(i => [nodes![i].x, nodes![i].z] as P2), [toX, toZ]];
  let metres = 0;
  for (let i = 1; i < points.length; i++) metres += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return { points, metres };
}

/** Drop points the player has already passed (within 18 m of the remaining polyline). */
export function trimRoute(route: GpsRoute, x: number, z: number): GpsRoute {
  if (route.points.length < 2) return route;
  let cut = 0;
  for (let i = 0; i < route.points.length - 1; i++) {
    const [ax, az] = route.points[i], [bx, bz] = route.points[i + 1];
    const vx = bx - ax, vz = bz - az, len2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2));
    const px = ax + vx * t, pz = az + vz * t;
    if (Math.hypot(x - px, z - pz) < 18 && t > .55) cut = i + 1;
  }
  const points: P2[] = [[x, z], ...route.points.slice(Math.max(cut, 1))];
  let metres = 0;
  for (let i = 1; i < points.length; i++) metres += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return { points, metres };
}
