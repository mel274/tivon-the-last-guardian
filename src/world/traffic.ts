/** A few cars that cruise main roads. They are not enterable and they are not world colliders. */
import type { P2 } from './geo';
import { ROADS, VEHICLE } from './geo';
import { surfaceHeight } from './terrain';
import { trafficBody } from './vehicles';
import type * as THREE from 'three';

export interface TrafficCar {
  group: THREE.Group;
  points: P2[];
  dist: number;
  speed: number;
  length: number;
}

const COLORS = ['#c4b8a4', '#8a9aa6', '#b55248', '#d8d4cc', '#3d4a55', '#c9a24a', '#6e7d72', '#d7c2a2'];

function lengthOf(points: P2[]) {
  let n = 0;
  for (let i = 1; i < points.length; i++) n += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return n;
}

/** Up to eight cars on long driveable roads, kept apart so they do not stack at one junction. */
export function spawnTraffic(parent: THREE.Object3D): TrafficCar[] {
  const roads = ROADS
    .filter(r => VEHICLE.has(r.kind) && r.width >= 6 && r.points.length > 6)
    .map(r => ({ points: r.points, length: lengthOf(r.points) }))
    .filter(r => r.length >= 120)
    .sort((a, b) => b.length - a.length);
  const cars: TrafficCar[] = [];
  for (const road of roads) {
    if (cars.length >= 8) break;
    const start = road.points[0];
    if (cars.some(c => Math.hypot(c.points[0][0] - start[0], c.points[0][1] - start[1]) < 90)) continue;
    const points = cars.length % 2 ? [...road.points].reverse() : road.points;
    const group = trafficBody(COLORS[cars.length % COLORS.length]);
    parent.add(group);
    cars.push({ group, points, dist: (cars.length * 47) % road.length, speed: 8 + cars.length % 3, length: road.length });
  }
  return cars;
}

export function tickTraffic(cars: TrafficCar[], dt: number) {
  for (const car of cars) {
    car.dist = (car.dist + car.speed * dt) % car.length;
    let d = car.dist;
    for (let i = 1; i < car.points.length; i++) {
      const [ax, az] = car.points[i - 1], [bx, bz] = car.points[i];
      const seg = Math.hypot(bx - ax, bz - az) || .001;
      if (d > seg) { d -= seg; continue; }
      const t = d / seg, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      car.group.position.set(x, surfaceHeight(x, z), z);
      car.group.rotation.y = Math.atan2(bx - ax, bz - az);
      break;
    }
  }
}
