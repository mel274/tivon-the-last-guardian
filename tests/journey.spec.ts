import { test, expect, type Page } from '@playwright/test';
import { state, close, choose, focus } from './helpers';

// This suite is a UI/renderer integration smoke journey. Location fixtures place
// the camera beside real targets; they never inject quest flags or inventory.
// Keyboard movement and complete geometric route connectivity have separate tests.
async function start(page: Page) {
  await page.addInitScript(() => localStorage.setItem('tivon.settings', JSON.stringify({lang:'en',quality:'low',volume:0,reducedMotion:true,sensitivity:1,invertY:false})));
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__tivon);
  await page.locator('[data-action="new"]').click();
}
async function amali(page: Page) {
  await focus(page,'barista');await choose(page,'acceptBeans');
  expect((await state(page)).inventory.coffee_beans).toBe(6);
  await focus(page,'brewer');await choose(page,'brew');
  await expect.poll(async()=>(await state(page)).inventory.coffee,{timeout:30000}).toBe(1);
  await page.keyboard.press('i');await choose(page,'drinkCoffee');await close(page);
  expect((await state(page)).flags.coffeeDrunk).toBe(true);
}
async function mandu(page: Page) {
  // The story cannot be acquired by merely reaching the intoxication threshold.
  await focus(page,'storyteller');
  await expect(page.locator('[data-action="act:hearCaveStory"]')).toHaveCount(0);
  await focus(page,'bartender');
  await choose(page,'buyDrink');await choose(page,'buyDrink');
  const tipsy=await state(page);expect(tipsy.intoxication).toBeGreaterThanOrEqual(45);expect(tipsy.flags.manduClue).not.toBe(true);
  await focus(page,'storyteller');
  await expect(page.locator('[data-action="act:hearCaveStory"]')).toBeVisible();
  await choose(page,'hearCaveStory');
  const clue=await state(page);expect(clue.flags.manduClue).toBe(true);expect(clue.inventory.cave_note).toBe(1);expect(clue.flags.identityRevealed).not.toBe(true);
}

test('Mandu storyteller unlocks the cave conversation through actual targeted UI',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await start(page);await amali(page);
  // Mandu upstairs is busy: count characters in the bar strip, backyard and balcony.
  expect(await page.evaluate(() => { const g=(window as any).__tivon, m=g.world.groups.mandu, c=Math.cos(m.rotation.y), s=Math.sin(m.rotation.y);
    return g.world.npcs.filter((n:any)=>{ const p=n.object.position, dx=p.x-m.position.x, dz=p.z-m.position.z, lx=dx*c-dz*s, lz=dx*s+dz*c; return Math.abs(lx)<24&&Math.abs(lz)<17&&Math.abs(p.y-m.position.y)<1.6; }).length; })).toBeGreaterThanOrEqual(12);
  await mandu(page);
  await page.screenshot({path:'docs/screenshots/mandu-story.png'});
  expect(errors).toEqual([]);
});

test('complete UI smoke journey through equipment, catacombs, guardian and ending',async({page})=>{
  test.setTimeout(300000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await start(page);
  await focus(page,'shopkeeper');
  await expect(page.locator('[data-action="act:buyFlashlight"]')).toHaveCount(0);
  await amali(page);await mandu(page);
  await focus(page,'shopkeeper');
  const money=(await state(page)).money;
  await choose(page,'buyFlashlight');await choose(page,'buyBatteries');
  const equipped=await state(page);expect(equipped.money).toBe(money-53);expect(equipped.inventory.flashlight).toBe(1);expect(equipped.inventory.batteries).toBe(1);
  await close(page);await page.keyboard.press('f');
  await expect.poll(()=>page.evaluate(()=>(window as any).__tivon.flashlight.visible)).toBe(true);
  expect(await page.evaluate(()=>{const l=(window as any).__tivon.flashlight;return l.isSpotLight&&l.intensity>0&&l.distance>10&&l.angle<1;})).toBe(true);
  await focus(page,'cave_entrance');await choose(page,'enterCaves');
  expect((await state(page)).phase).toBe(2);
  await focus(page,'hidden_gate');await choose(page,'openHidden');
  expect((await state(page)).flags.hiddenOpened).not.toBe(true);
  const panels:Array<[string,number,number,string]>=[
    ['inscription_a',108,123.2,'readInscriptionA'],['inscription_b',144,123.2,'readInscriptionB'],['inscription_c',126,134,'readInscriptionC'],
    ['map_a',108,144.4,'collectMapA'],['map_b',126,128,'collectMapB'],['light_mark',145,145.5,'revealLight'],
  ];
  for(const[id,x,z,action]of panels){await focus(page,id);await choose(page,action);}
  const explored=await state(page);expect(explored.flags.lightRevealed).toBe(true);expect(explored.inventory.cave_map).toBe(1);expect(explored.battery).toBeLessThan(100);
  await focus(page,'mechanism');
  await choose(page,'stoneLamp');await choose(page,'stoneTree');await choose(page,'stoneWater');
  expect((await state(page)).flags.mechanismSolved).toBe(true);
  await focus(page,'hidden_gate');await choose(page,'openHidden');
  expect((await state(page)).phase).toBe(3);expect((await state(page)).flags.identityRevealed).not.toBe(true);
  await focus(page,'explorer_note');await choose(page,'readExplorer');
  await focus(page,'guardian');await choose(page,'faceGuardian');
  expect((await state(page)).encounter.active).toBe(true);
  // Accelerated deterministic simulation: move with the actual controller and
  // run both the encounter's charge/hit code and model timer. No survivor flags
  // are assigned by this test. Location fixtures end before this encounter.
  const encounter=await page.evaluate(()=>{
    const g=(window as any).__tivon,dt=1/60;
    const route=[[120,220],[132,220],[132,230],[120,230]];let waypoint=0,steps=0;
    for(;steps<6000&&!g.model.state.encounter.survived;steps++){
      const p=g.camera.position,t=route[waypoint];
      if(Math.hypot(t[0]-p.x,t[1]-p.z)<.6)waypoint=(waypoint+1)%route.length;
      const destination=route[waypoint],dx=destination[0]-p.x,dz=destination[1]-p.z;
      g.player.yaw=Math.atan2(-dx,-dz);g.player.pitch=0;g.player.keys.add('KeyW');g.player.keys.add('ShiftLeft');
      g.total+=dt;g.player.tick(dt,g.model.state.flags,g.model.state.wakefulness,g.model.state.intoxication,true,g.total);
      g.model.tick(dt,true);g.updateEncounter(dt);
    }
    g.player.clear();return {steps,elapsed:steps*dt,encounter:JSON.parse(JSON.stringify(g.model.state.encounter))};
  });
  expect(encounter.elapsed).toBeGreaterThanOrEqual(19);expect(encounter.encounter.survived).toBe(true);
  const memories:Array<[string,number,number]>= [['memory_lantern',114,222],['memory_photo',138,222],['memory_letter',126,232]];
  for(const[id,x,z]of memories){await focus(page,id);await choose(page,`collect_${id}`);}
  expect((await state(page)).flags.identityRevealed).toBe(true);
  await focus(page,'oath');await choose(page,'oathPeople');await choose(page,'oathPlace');await choose(page,'oathMemory');
  expect((await state(page)).phase).toBe(4);expect((await state(page)).flags.spiritFreed).toBe(true);
  await focus(page,'treasure');await choose(page,'openTreasure');
  expect((await state(page)).inventory.valley_archive).toBe(1);
  await focus(page,'overlook');await choose(page,'finish');
  await expect(page.locator('.panel')).toContainText('The valley remembers');
  expect((await state(page)).flags.ending).toBe(true);
  await page.screenshot({path:'docs/screenshots/ending.png'});
  await page.locator('[data-action="returnTown"]').click();
  expect(await page.evaluate(()=>{const g=(window as any).__tivon;return Math.hypot(g.player.snapshot().x-g.world.groups.spawn.position.x,g.player.snapshot().z-g.world.groups.spawn.position.z);})).toBeLessThan(.5);
  await page.reload();await page.waitForFunction(()=>!!(window as any).__tivon);await page.locator('[data-action="continue"]').click();
  const loaded=await state(page);expect(loaded.flags.ending).toBe(true);expect(loaded.inventory.valley_archive).toBe(1);expect(loaded.phase).toBe(4);
  expect(errors).toEqual([]);
});
