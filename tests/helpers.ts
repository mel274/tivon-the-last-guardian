import { expect, type Page } from '@playwright/test';

// Shared browser fixtures. `focus` stands the player beside a real interaction target on the
// generated map (searching nearby floor that is unobstructed, at the target's storey) and
// faces it; it never injects quest flags or inventory.
export async function state(page: Page) {
  return page.evaluate(() => JSON.parse(JSON.stringify((window as any).__tivon.model.state)));
}
export async function close(page: Page) {
  const button = page.locator('#overlay [data-action="close"]').first();
  if (await button.count()) await button.click();
}
export async function choose(page: Page, action: string) {
  await page.locator(`[data-action="act:${action}"]`).click();
}
export async function focus(page: Page, id: string) {
  await close(page);
  const label = await page.evaluate((id) => {
    const g = (window as any).__tivon;
    const item = g.world.interactables.find((i: any) => i.id === id);
    if (!item) throw new Error(`Unknown target ${id}`);
    const dest = item.object.getWorldPosition(g.camera.position.clone());
    for (const r of [1.8, 2.4, 1.3, 3, 3.5]) for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2, x = dest.x + Math.cos(a) * r, z = dest.z + Math.sin(a) * r;
      const feet = g.player.groundAt(x, z, dest.y - 1.2);
      if (Math.abs(feet - (dest.y - 1.25)) > 1.5) continue;
      g.camera.position.y = feet + 1.7;
      if (g.player.blocked(x, z, g.model.state.flags)) continue;
      const dx = dest.x - x, dy = dest.y - (feet + 1.7), dz = dest.z - z;
      g.player.restore({ x, y: feet + 1.7, z, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) });
      g.findTarget();
      if (g.target?.id === id) return item.label.en;
    }
    throw new Error(`No standing spot can target ${id}`);
  }, id);
  await expect(page.locator('.interact-prompt')).toContainText(label, { timeout: 25000 });
  await page.keyboard.press('e');
  await expect(page.locator('.dialogue')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__tivon.currentInteraction)).toBe(id);
}
