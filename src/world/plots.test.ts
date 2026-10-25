import { describe, it, expect } from 'vitest';
import { layoutPlots, pavement, corridor, type PlotLayout } from './plots';
import type { P2, Road } from './geo';

/** A synthetic block: one residential street along the x axis (z = 0) with three houses north of it, 4 m apart. */
const road: Road = { name: 'Test', en: 'Test', kind: 'residential', width: 7, oneway: false, bridge: false, surface: '', points: [[-40, 0], [80, 0]] };
const house = (x: number): P2[] => [[x, -22], [x + 10, -22], [x + 10, -14], [x, -14]];
const houses = [house(0), house(14), house(28)];
const layout: PlotLayout = layoutPlots({ houses, roads: [road], driveShare: 0 });
const cellsOf = (h: number) => { const out: Array<[number, number]> = []; layout.grid.each(-40, 80, -60, 10, (t, i, ix, iz) => { if (t.own[i] === h) out.push([ix, iz]); }); return out; };

describe('plots', () => {
  it('gives every house one contiguous plot that touches it', () => {
    for (let h = 0; h < houses.length; h++) {
      const cells = cellsOf(h), set = new Set(cells.map(c => c.join())), seen = new Set<string>([cells[0].join()]), queue = [cells[0]];
      expect(cells.length).toBeGreaterThan(150);
      expect(layout.plots[h].cells).toBe(cells.length);
      for (let q = 0; q < queue.length; q++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${queue[q][0] + dx},${queue[q][1] + dz}`; if (set.has(k) && !seen.has(k)) { seen.add(k); queue.push([queue[q][0] + dx, queue[q][1] + dz]); } }
      expect(seen.size).toBe(cells.length); // 4-connected
      const [bx] = houses[h][0];
      expect(cells.some(([ix, iz]) => ix >= bx - 2 && ix <= bx + 12 && iz >= -24 && iz <= -12)).toBe(true); // right next to its own footprint
      expect(cells.every(([ix, iz]) => !(ix >= bx && ix < bx + 10 && iz >= -22 && iz < -14))).toBe(true); // never inside it
    }
  });

  it('puts one gate in each plot, on its street side', () => {
    for (const p of layout.plots) {
      expect(p.gate).not.toBeNull();
      const g = p.gate!, near = p.runs.filter(r => r.kind === 'street');
      expect(g.nz).toBeLessThan(-.9); // faces into the plot, away from the street
      expect(g.z).toBeGreaterThan(-9); expect(g.z).toBeLessThan(0);
      expect(near.length).toBeGreaterThan(0);
      // The gap: no street run passes through the gate.
      for (const r of near) { const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]); for (let s = 0; s <= 1; s += .02) expect(Math.hypot(r.a[0] + (r.b[0] - r.a[0]) * s - g.x, r.a[1] + (r.b[1] - r.a[1]) * s - g.z) > .55 || L === 0).toBe(true); }
      expect(p.path).not.toBeNull();
    }
  });

  it('keeps every boundary out of the road corridor and its pavement', () => {
    const clear = road.width / 2 + pavement(road), limit = corridor(road);
    expect(limit).toBeGreaterThan(clear);
    for (const p of layout.plots) for (const r of p.runs) for (let s = 0; s <= 1; s += .1) expect(Math.abs(r.a[1] + (r.b[1] - r.a[1]) * s)).toBeGreaterThanOrEqual(clear);
  });

  it('fences neighbours along a shared side and faces every run into its own plot', () => {
    const side = layout.plots.flatMap(p => p.runs.filter(r => r.kind === 'side'));
    expect(side.length).toBeGreaterThan(0);
    for (const p of layout.plots) for (const r of p.runs) { const mx = (r.a[0] + r.b[0]) / 2 + r.nx * .8, mz = (r.a[1] + r.b[1]) / 2 + r.nz * .8; expect(layout.grid.ownAt(mx, mz)).toBe(p.house); }
  });

  it('is deterministic', () => {
    const again = layoutPlots({ houses, roads: [road], driveShare: 0 });
    expect(again.plots.map(p => [p.cells, p.runs.length, p.gate?.x])).toEqual(layout.plots.map(p => [p.cells, p.runs.length, p.gate?.x]));
  });
});
