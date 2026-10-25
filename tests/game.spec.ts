import { test, expect, type Page } from '@playwright/test';
import { state, close, choose, focus } from './helpers';

async function ready(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__tivon);
  await page.locator('[data-action="language"]').click();
  await page.locator('[data-action="new"]').click();
}
async function snapshot(page: Page) { return page.evaluate(() => (window as any).__tivon.player.snapshot()); }

test('real keyboard walk, collision, Amali coffee and persistent save', async ({page}) => {
  test.setTimeout(300000);
  const errors: string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await ready(page);
  // New journeys start on Ben Gurion Square facing Amali; walk straight in until the counter stops us.
  const amaliLocal = () => page.evaluate(() => { const g=(window as any).__tivon, a=g.world.groups.amali, p=g.camera.position, c=Math.cos(a.rotation.y), s=Math.sin(a.rotation.y), dx=p.x-a.position.x, dz=p.z-a.position.z; return { x: dx*c-dz*s, z: dx*s+dz*c }; });
  const start=await amaliLocal(); expect(start.z).toBeGreaterThan(12);
  await page.keyboard.down('w'); await page.waitForTimeout(5200); await page.keyboard.up('w');
  const p=await amaliLocal(); console.log('Inside Amali (local)',p);
  expect(p.z).toBeLessThan(0); expect(p.z).toBeGreaterThan(-2.4); // stopped by the counter, not walked through it
  await focus(page,'barista'); await choose(page,'acceptBeans');
  expect((await state(page)).inventory.coffee_beans).toBe(6);
  await focus(page,'brewer'); await choose(page,'brew');
  await expect.poll(async()=>(await state(page)).inventory.coffee).toBe(1);
  await close(page); await page.keyboard.press('i'); const before=(await state(page)).wakefulness;
  await choose(page,'drinkCoffee'); const after=await state(page);
  expect(after.wakefulness).toBeGreaterThan(before+25); expect(after.inventory.coffee).toBe(0); expect(after.flags.coffeeDrunk).toBe(true);
  await page.screenshot({path:'docs/screenshots/amali-coffee.png'});
  await close(page); await page.keyboard.press('Escape'); await page.locator('[data-action="save"]').click();
  await page.reload(); await page.waitForFunction(()=>!!(window as any).__tivon); await page.locator('[data-action="continue"]').click();
  expect((await state(page)).flags.coffeeDrunk).toBe(true);
  expect(errors).toEqual([]);
});

test('Hebrew menu, settings, localization and rendered world', async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await page.waitForFunction(()=>!!(window as any).__tivon);
  await expect(page.locator('html')).toHaveAttribute('dir','rtl');
  await expect(page.getByRole('button',{name:'מסע חדש →'})).toBeVisible();
  await page.screenshot({path:'docs/screenshots/title-screen.png'});
  await page.locator('[data-action="settings"]').click();
  await page.locator('#setting-language').selectOption('en');await page.locator('#setting-motion').check();await page.locator('#setting-quality').selectOption('low');
  await page.locator('[data-action="applySettings"]').click();
  await expect(page.locator('html')).toHaveAttribute('dir','ltr');
  await page.locator('[data-action="new"]').click();await page.keyboard.press('m');
  await expect(page.locator('.panel')).toContainText('Map of Tivon');await expect(page.locator('.field-map')).toBeVisible();
  expect(errors).toEqual([]);
});
