import * as THREE from 'three';
import type { WorldContext } from './types';
import { Kit, mergeLooseMeshes } from './kit';
import { buildStreets } from './streets';
import { buildBenGurion } from './benGurion';
import { buildKiryatAmal, buildComputerShop } from './kiryatAmal';
import { buildLandmarks } from './landmarksWorld';
import { prepareTerraces, buildTerraceWalls } from './terraces';
import { buildFootprints, buildCars, buildTrees, flushExtrusions } from './scenery';
import { spawnDriveableCar } from './vehicles';

/** Kiryat Tivon at 1:1: every OSM street, path and building footprint on real elevation, with
 *  the old centre's pedestrian street, the Zeid centre, story venues and landmarks hand-built
 *  on top. Custom builders add the OSM footprints they replace to `skip`. */
/** Milliseconds per build stage (inspected in development and by tests). */
export const BUILD_TIMES: Record<string, number> = {};
let mark = 0;
const stage = (name: string) => { const now = performance.now(); if (mark) BUILD_TIMES[name] = Math.round(now - mark); mark = now; };

export function buildTown(ctx: WorldContext): void { for (const _ of townStages(ctx)) { /* run to completion */ } }

/** The town build as labelled stages; the game yields a frame between them to show progress. */
export function* townStages(ctx: WorldContext): Generator<[string, string]> {
  mark = performance.now();
  const town = new THREE.Group();
  town.name = 'Kiryat Tivon • OSM 1:1';
  ctx.scene.add(town);
  ctx.groups.town = town;
  const kit = new Kit(ctx, town), skip = new Set<string>();
  prepareTerraces(); // house pads must exist before anything is draped on the ground
  stage('terraces');
  yield ['רחובות ושבילים', 'Streets and paths'];
  buildStreets(kit);
  stage('streets');
  yield ['כיכר בן גוריון', 'Ben Gurion Square'];
  const amali = buildBenGurion(kit, skip);
  stage('benGurion');
  yield ['מרכז זייד ומנדו', 'The Zeid centre and Mandu'];
  const zeid = buildKiryatAmal(kit, skip);
  stage('zeid');
  const shop = buildComputerShop(kit, skip);
  stage('computerShop');
  yield ['אתרים ואנדרטאות', 'Landmarks'];
  buildLandmarks(kit, skip);
  stage('landmarks');
  yield ['בתים', 'Houses'];
  const { gardens } = buildFootprints(kit, skip);
  stage('buildings');
  buildTerraceWalls(kit);
  stage('terraceWalls');
  buildCars(kit);
  stage('cars');
  yield ['עצים', 'Trees'];
  buildTrees(kit, gardens);
  stage('trees');
  flushExtrusions(town);
  stage('extrusionFlush');
  yield ['מסיימים', 'Finishing'];
  kit.B.flush();
  stage('batchFlush');
  mergeLooseMeshes(town);
  stage('merge');
  // Named anchors used by the game for zones and spawn points.
  const anchor = (name: string, x: number, y: number, z: number, rot: number) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); g.rotation.y = rot; ctx.scene.add(g); ctx.groups[name] = g; };
  anchor('amali', amali.x, amali.y, amali.z, amali.rot);
  // Mandu's bar strip (upper floor) and the lower plaza in front of the building.
  anchor('mandu', zeid.bar.x, zeid.U, zeid.bar.z, zeid.M.rot);
  anchor('kiryatamal', zeid.plaza.x, zeid.Lw, zeid.plaza.z, zeid.M.rot);
  anchor('shop', shop.x, shop.y, shop.z, shop.rot);
  const [sx, sz] = amali.at(0, 9 + 5.2);
  anchor('spawn', sx, amali.y, sz, amali.rot);
  // Starter car right beside spawn — walk two steps and press E.
  spawnDriveableCar(kit, sx + Math.sin(amali.rot + Math.PI / 2) * 4.5, sz + Math.cos(amali.rot + Math.PI / 2) * 4.5, amali.rot, '#e8e4dc');
  if (import.meta.env?.DEV) console.info('[cars]', ctx.vehicles.length, 'driveable');
}
