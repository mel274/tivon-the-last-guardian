/** Hand-surveyed layouts layered on the OSM map, from Google satellite/Street View and the
 *  player community's sketch of the Zeid centre (Kiryat Amal). Pure data so the terrain can
 *  flatten its terraces before anything is built. Coordinates are game metres. */
import { elevation, orientedBox, ROADS, BUILDINGS, type P2 } from './geo';

const BASE = elevation(126, 84);
const ground = (x: number, z: number) => elevation(x, z) - BASE;

/** Zeid commercial centre by the Kiryat Tivon junction on Route 75, as agreed with the owner in
 *  the Zeid Centre Plan (revision 4.2, docs/zeid-plan/zeid-plan.html). Building-local frame:
 *  lx runs east along the building (−HW … HW), lz runs south (−HD north wall … HD balcony edge).
 *  - Route 75 runs along the north, with a guardrail on its south edge; the bus stop is on its
 *    south kerb. A 14-step stair a few metres west of the building drops to the UPPER plaza:
 *    a walkway with benches and picnic tables, and a lane from Alexander Zaid St between the
 *    drugstore (porch on the lane) and the one-storey falafel row (pizza sticking out at its end).
 *  - The building's upper floor is level with the upper plaza. West to east: Butcher Tivon,
 *    printing, Mandu (a narrow north–south bar strip), the camera shop, Pilates, building
 *    supplies. All open onto the full-length BALCONY (lz BAL … HD) with a railing, entered
 *    from the upper plaza at the west end. Behind the building, at the same level, is
 *    Mandu's backyard; a bank of bushes rises from it to Route 75, and a gate at its east end
 *    opens onto a path down to the Hannah Szenes garden.
 *  - A stair runs outside the balcony (lz HD … HD + STW), down west to east, to the LOWER
 *    plaza. Below the balcony on the ground floor, from the west: a closed section (the
 *    Rav-Kav centre and the flower shop, also under the stair), entered by an east-facing
 *    door at lx = ARC0; then Zeid 1, Mishi and Oranim pharmacy, as deep as the upper floor.
 *    A roofed strip runs in front of them under the balcony. Zohar cinema faces the
 *    building across the lower plaza. */
export const ZEID = (() => {
  const road = ground(-160, -848);
  const upper = road - 1.2, lower = upper - 4.2;
  const poly: P2[] = [[-164.6, -841.8], [-122.2, -837.7], [-123.8, -821.3], [-166.2, -825.5]];
  const box = orientedBox(poly), rot0 = Math.abs(Math.sin(box.rot)) > .5 ? box.rot + Math.PI / 2 : box.rot;
  const rot = Math.cos(rot0) > 0 ? rot0 : rot0 + Math.PI, c = Math.cos(rot), s = Math.sin(rot);
  const HW = Math.max(box.w, box.d) / 2, HD = Math.min(box.w, box.d) / 2, BAL = HD - 4.15, STW = 2.4, ARC0 = -10.5;
  /** Building-local point → world (the same convention as Frame.at). */
  const at = (lx: number, lz: number): P2 => [box.cx + lx * c + lz * s, box.cz - lx * s + lz * c];
  const rect = (x0: number, x1: number, z0: number, z1: number): P2[] => [at(x0, z0), at(x1, z0), at(x1, z1), at(x0, z1)];
  // The retaining wall between the two plazas runs from the stair's south-west corner to P2.
  const P1 = at(-HW, HD + STW), P2: P2 = [-169.5, -812.5];
  // The falafel row (revision 4.2): its lane face runs A → B, from the corner with Alexander Zaid
  // St east; D is its south-west corner. along(t, off): t metres east along the face, off north.
  const A: P2 = [-231, -833.2], Bf: P2 = [-203, -830.6], D: P2 = [-233.2, -823.5];
  const ul = Math.hypot(Bf[0] - A[0], Bf[1] - A[1]), u: P2 = [(Bf[0] - A[0]) / ul, (Bf[1] - A[1]) / ul];
  const along = (t: number, off = 0): P2 => [A[0] + u[0] * t + u[1] * off, A[1] + u[1] * t - u[0] * off];
  const busStair = { x: -176, z0: -852.6, z1: -848.4 };
  // Zohar cinema's north face (a → b) on the lower plaza, and the entrance lobby cut into it: t metres east
  // along the face, e metres in (south) from it. The lobby uses the whole north face (10 m deep, which stays inside the footprint). Lobby-local frame (kiryatAmal.ts): +z out to the plaza, +x west.
  const ca: P2 = [-133.9, -810.4], cb: P2 = [-108.7, -807.1], cl = Math.hypot(cb[0] - ca[0], cb[1] - ca[1]), cu: P2 = [(cb[0] - ca[0]) / cl, (cb[1] - ca[1]) / cl], cn: P2 = [-cu[1], cu[0]];
  const cat = (t: number, e: number): P2 => [ca[0] + cu[0] * t + cn[0] * e, ca[1] + cu[1] * t + cn[1] * e];
  const lobby = { a: ca, b: cb, L: cl, t0: 0, t1: cl, depth: 10, at: cat, rot: Math.atan2(cu[1], -cu[0]), poly: [cat(0, -.3), cat(cl, -.3), cat(cl, 10.3), cat(0, 10.3)] as P2[] };
  return {
    road, upper, lower, frame: { x: box.cx, z: box.cz, rot, HW, HD, BAL, STW, ARC0 }, at, rect,
    building: { id: '326224826', poly },
    /** The cinema stands on the lower plaza level over its whole footprint. The terrain mesh is cut to this pad so the lobby floor stays clear of the hill. */
    cinema: { id: '326224821', pad: (BUILDINGS.find(b => b.id === '326224821')?.points ?? lobby.poly) as P2[] }, lobby,
    /** One storey under a flat canopy, facing north onto the lane; the pizza unit sticks out 5 m
     *  north at its east end, its window on its west face looking back along the lane. */
    row: {
      A, B: Bf, D, u, along,
      footprint: [A, along(28.1, 0), along(28.1, 5), along(34, 5), along(34, -9.6), D] as P2[],
      pizza: [along(28.1, 0), along(28.1, 5), along(34, 5), along(34, 0)] as P2[],
      /** The paved walk under the canopy and in front of the pizza window, kept level with the lane. */
      apron: [A, along(28.1, 0), along(28.1, 5.5), along(26.5, 5.5), along(26.5, 3.5), along(0, 3.5)] as P2[],
    },
    /** Drugstore "הצומת": one storey, its roofed porch along the lane at plaza level. */
    drugstore: {
      poly: [[-224.3, -842.4], [-209.4, -841], [-208.6, -849.5], [-223.5, -850.9]] as P2[],
      porch: [[-224.3, -842.4], [-209.4, -841], [-209.6, -838.5], [-224.5, -839.9]] as P2[],
    },
    backyard: rect(-HW - 2.5, HW, -HD - 5.2, -HD),
    /** Walkway, lane and the corner by Alexander Zaid St; excludes the drugstore and the falafel row. */
    upperPlaza: [[-224.5, -839.9], [-209.6, -838.5], [-209.4, -841], [-208.6, -849.5], [-197, -848.6], [-180, -848.8], at(-HW - 2.5, -HD - 5.2), at(-HW - 2.5, -HD), at(-HW, -HD), P1, P2, [-196, -812], [-197.2, -821.5], [-196.9, -830.1], [-197.4, -835.3], [-203.3, -835.6], [-203, -830.6], [-231, -833.2], [-231.3, -838.6], [-226.4, -842.2]] as P2[],
    lowerPlaza: [P1, at(ARC0, HD + STW), at(ARC0, HD), at(HW, HD), [-110, -818.5], [-108.7, -807.1], [-133.9, -810.4], [-133, -801], [-160, -802.5], P2] as P2[],
    /** Building, balcony and the strip under the stair all stand on the lower plaza level. */
    footprint: [at(-HW, -HD), at(HW, -HD), at(HW, HD), at(ARC0, HD), at(ARC0, HD + STW), at(-HW, HD + STW)] as P2[],
    /** The pavement along Route 75 in front of the upper plaza, at road level. */
    kerb: [[-202, -857], [-166.4, -853.5], [-166.4, -849.6], [-202, -849.6]] as P2[],
    retaining: [P1, P2] as [P2, P2],
    busStop: [-162, -850.5] as P2,
    /** 14 steps from the Route 75 kerb (z0) down to the upper plaza (z1), 3 m wide. */
    busStair,
    busStairWell: [[busStair.x - 1.7, busStair.z0], [busStair.x + 1.7, busStair.z0], [busStair.x + 1.7, busStair.z1], [busStair.x - 1.7, busStair.z1]] as P2[],
    /** The garden path from the backyard's east gate down to the Hannah Szenes garden. */
    gardenPath: [at(HW - .5, -HD - 2.6), at(HW + 6, -HD - 1), [-112, -834], [-104, -827]] as P2[],
  };
})();

/** Route 75's guardrail on the south edge of the eastbound carriageway, from the Zeid bus stop
 *  east to the Kiryat Amal junction: points every ~2 m, width/2 + 0.6 m south of the centreline,
 *  with `gap` set wherever a path, slip road or street crosses (it starts just past the stop). */
export const ROUTE75_RAIL = (() => {
  const trunk = ROADS.filter(r => r.kind === 'trunk' && r.name === 'דרך העמקים');
  const x0 = -156.4, x1 = 310, near = (p: P2) => p[0] > x0 - 20 && p[0] < x1 + 20 && p[1] > -900 && p[1] < -780;
  const others = ROADS.filter(r => r.kind !== 'trunk' && r.points.some(near));
  const out: Array<{ x: number; z: number; nx: number; nz: number; gap: boolean }> = [];
  for (let x = x0; x <= x1; x += 2) {
    // The southernmost carriageway spanning x is the eastbound one.
    let best: { cz: number; nx: number; nz: number; w: number } | null = null;
    for (const r of trunk) for (let i = 1; i < r.points.length; i++) {
      const [ax, az] = r.points[i - 1], [bx, bz] = r.points[i];
      if (ax === bx || (x - ax) * (x - bx) > 0) continue;
      const cz = az + (bz - az) * (x - ax) / (bx - ax); if (cz < -900 || cz > -780 || (best && cz <= best.cz)) continue;
      const l = Math.hypot(bx - ax, bz - az), s = Math.sign(bx - ax);
      best = { cz, nx: -(bz - az) / l * s, nz: Math.abs(bx - ax) / l, w: r.width };
    }
    if (!best) continue;
    const off = best.w / 2 + .6, px = x + best.nx * off, pz = best.cz + best.nz * off;
    const gap = others.some(r => r.points.some((p, i) => {
      if (i === 0) return false;
      const [ax, az] = r.points[i - 1], vx = p[0] - ax, vz = p[1] - az, l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2));
      return Math.hypot(px - ax - vx * t, pz - az - vz * t) < r.width / 2 + .9;
    }));
    out.push({ x: px, z: pz, nx: best.nx, nz: best.nz, gap });
  }
  return out;
})();

/** Ben Gurion Square: the pedestrian street of the old centre, running from HaShkedim (SE)
 *  up to Get Phone (NW), with shop rows on both sides; OSM merges this block, so it is authored. */
export const BENGURION = (() => {
  const a: P2 = [283.9, -2020.6], b: P2 = [252.4, -2052.8]; // SE end at HaShkedim, NW end by Get Phone
  return { a, b, width: 14 };
})();

export const STATIC_PADS: Array<{ poly: P2[]; y: number; blend: number }> = [
  // The ground under Mandu's building, its balcony and the stair sits at the lower plaza.
  { poly: ZEID.footprint, y: ZEID.lower, blend: 0 },
  // The bus-stop stair is cut into the kerb down to the upper plaza (before the kerb pad wins).
  { poly: ZEID.busStairWell, y: ZEID.upper, blend: 0 },
  { poly: ZEID.upperPlaza, y: ZEID.upper, blend: 1 },
  // The falafel row, the walk in front of it and the drugstore with its porch stand at plaza level.
  { poly: ZEID.row.footprint, y: ZEID.upper, blend: 0 },
  { poly: ZEID.row.apron, y: ZEID.upper, blend: 0 },
  { poly: ZEID.drugstore.poly, y: ZEID.upper, blend: 0 },
  { poly: ZEID.drugstore.porch, y: ZEID.upper, blend: 0 },
  { poly: ZEID.backyard, y: ZEID.upper, blend: 1.5 },
  { poly: ZEID.kerb, y: ZEID.road, blend: 1 },
  // The Zohar cinema (its lobby floor is at plaza level, inside the hillside).
  { poly: ZEID.cinema.pad, y: ZEID.lower, blend: 0 },
  { poly: ZEID.lowerPlaza, y: ZEID.lower, blend: 4 },
];
