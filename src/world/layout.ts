/** Hand-surveyed layouts layered on the OSM map, from Google satellite/Street View and the
 *  player community's sketch of the Zeid centre (Kiryat Amal). Pure data so the terrain can
 *  flatten its terraces before anything is built. Coordinates are game metres. */
import { elevation, orientedBox, type P2 } from './geo';

const BASE = elevation(126, 84);
const ground = (x: number, z: number) => elevation(x, z) - BASE;

/** Zeid commercial centre by the Kiryat Tivon junction on Route 75, as agreed with the owner in
 *  the Zeid Centre Plan (revision 3.1, docs/zeid-plan/zeid-plan.html). Building-local frame:
 *  lx runs east along the building (−HW … HW), lz runs south (−HD north wall … HD balcony edge).
 *  - Route 75 runs along the north; the bus stop is on its south kerb. A short stair a few
 *    metres west of the building drops to the UPPER plaza: a walkway with benches and picnic
 *    tables, and a narrow lane between the drugstore building and the falafel row.
 *  - The building's upper floor is level with the upper plaza. West to east: Butcher Tivon,
 *    printing, Mandu (a narrow north–south bar strip), the camera shop, Pilates, building
 *    supplies. All open onto the full-length BALCONY (lz BAL … HD) with a railing, entered
 *    from the upper plaza at the west end. Behind the building, at the same level, is
 *    Mandu's backyard; a bank of bushes rises from it to Route 75.
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
  return {
    road, upper, lower, frame: { x: box.cx, z: box.cz, rot, HW, HD, BAL, STW, ARC0 }, at, rect,
    building: { id: '326224826', poly },
    cinema: { id: '326224821' }, drugstore: { id: '775921711' }, falafelRow: { id: '775921710' },
    backyard: rect(-HW - 2.5, HW, -HD - 5.2, -HD),
    upperPlaza: [[-230.6, -840.8], [-216.8, -839.6], [-203.9, -835.1], [-200.4, -845.1], [-197, -848.6], [-180, -848.8], at(-HW - 2.5, -HD - 5.2), at(-HW - 2.5, -HD), at(-HW, -HD), P1, P2, [-196, -812], [-203, -830.6], [-216.5, -835.5], [-230.6, -838.2]] as P2[],
    lowerPlaza: [P1, at(ARC0, HD + STW), at(ARC0, HD), at(HW, HD), [-110, -818.5], [-108.7, -807.1], [-133.9, -810.4], [-133, -801], [-160, -802.5], P2] as P2[],
    /** Building, balcony and the strip under the stair all stand on the lower plaza level. */
    footprint: [at(-HW, -HD), at(HW, -HD), at(HW, HD), at(ARC0, HD), at(ARC0, HD + STW), at(-HW, HD + STW)] as P2[],
    /** The pavement along Route 75 in front of the upper plaza, at road level. */
    kerb: [[-202, -857], [-166.4, -853.5], [-166.4, -849.6], [-202, -849.6]] as P2[],
    retaining: [P1, P2] as [P2, P2],
    busStop: [-162, -850.5] as P2,
    busStair: { x: -176, z0: -850.9, z1: -848.5 },
  };
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
  { poly: ZEID.upperPlaza, y: ZEID.upper, blend: 1 },
  { poly: ZEID.backyard, y: ZEID.upper, blend: 1.5 },
  { poly: ZEID.kerb, y: ZEID.road, blend: 1 },
  { poly: ZEID.lowerPlaza, y: ZEID.lower, blend: 4 },
];
