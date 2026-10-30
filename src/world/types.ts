import * as THREE from 'three';
import type { DriveableCar } from './vehicles';
export type LocalText = { he: string; en: string };
export interface Collider { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number; gate?: string; obb?: { cx: number; cz: number; hx: number; hz: number; c: number; s: number } }
export interface Interactable { id: string; label: LocalText; object: THREE.Object3D; radius?: number }
export interface AnimatedNPC { object: THREE.Group; phase: number; origin: THREE.Vector3; kind?: 'talk' | 'walk' | 'bar'; path?: Array<[number, number, number]>; speed?: number; progress?: number }
export interface WorldContext {
  scene: THREE.Scene;
  colliders: Collider[];
  interactables: Interactable[];
  npcs: AnimatedNPC[];
  grounds: Array<{ minX: number; maxX: number; minZ: number; maxZ: number; y: number; obb?: Collider['obb'] }>;
  groups: Record<string, THREE.Group>;
  lights: THREE.Light[];
  vehicles: DriveableCar[];
}
