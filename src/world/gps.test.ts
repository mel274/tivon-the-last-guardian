import { describe, expect, it } from 'vitest';
import { findRoute, trimRoute } from './gps';
import { landmark } from './geo';

describe('gps routing', () => {
  it('finds a street route from Amali to Mandu', () => {
    const a = landmark('amali'), m = landmark('mandu');
    const route = findRoute(a.x, a.z, m.x, m.z);
    expect(route).not.toBeNull();
    expect(route!.points.length).toBeGreaterThan(2);
    expect(route!.metres).toBeGreaterThan(200);
    expect(route!.metres).toBeLessThan(5000);
  });

  it('trims passed segments as the player moves', () => {
    const route = findRoute(landmark('amali').x, landmark('amali').z, landmark('park_gate').x, landmark('park_gate').z)!;
    const mid = route.points[Math.floor(route.points.length / 3)];
    const trimmed = trimRoute(route, mid[0], mid[1]);
    expect(trimmed.metres).toBeLessThan(route.metres);
    expect(trimmed.points[0][0]).toBeCloseTo(mid[0], 0);
  });
});
