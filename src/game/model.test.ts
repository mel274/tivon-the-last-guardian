import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameModel, SAVE_KEY, items, quests } from './model';

function choose(m: GameModel, id: string, action: string) { m.interact(id); return m.act(action); }
function coffee(m: GameModel) { choose(m, 'barista', 'acceptBeans'); choose(m, 'brewer', 'brew'); m.tick(3); m.act('drinkCoffee'); }
function bar(m: GameModel) { coffee(m); choose(m, 'bartender', 'buyDrink'); choose(m, 'bartender', 'buyDrink'); choose(m, 'storyteller', 'hearCaveStory'); }
function caves(m: GameModel) { bar(m); choose(m, 'shopkeeper', 'buyFlashlight'); choose(m, 'shopkeeper', 'buyBatteries'); choose(m, 'cave_entrance', 'enterCaves'); }
function puzzles(m: GameModel) {
  caves(m);
  for (const letter of ['a', 'b', 'c']) choose(m, `inscription_${letter}`, `readInscription${letter.toUpperCase()}`);
  m.act('toggleFlashlight'); choose(m, 'light_mark', 'revealLight');
  choose(m, 'map_a', 'collectMapA'); choose(m, 'map_b', 'collectMapB');
  for (const action of ['stoneLamp', 'stoneTree', 'stoneWater']) choose(m, 'mechanism', action);
  choose(m, 'hidden_gate', 'openHidden');
}
afterEach(() => vi.unstubAllGlobals());

describe('coffee and inventory', () => {
  it('keeps beans, brewing, prepared coffee, and drinking distinct', () => {
    const m = new GameModel();
    m.act('brew'); expect(m.state.brewing).toBe(0);
    choose(m, 'barista', 'acceptBeans');
    expect(m.state.inventory.coffee_beans).toBe(6);
    choose(m, 'barista', 'acceptBeans'); expect(m.state.inventory.coffee_beans).toBe(6);
    choose(m, 'brewer', 'brew');
    expect(m.state.inventory.coffee_beans).toBe(4); expect(m.state.inventory.coffee).toBeUndefined();
    m.tick(2); expect(m.state.inventory.coffee).toBeUndefined();
    m.tick(1); expect(m.state.inventory.coffee).toBe(1); expect(m.state.flags.coffeeBrewed).toBe(true);
    const wake = m.state.wakefulness; m.act('drinkCoffee');
    expect(m.state.inventory.coffee).toBe(0); expect(m.state.wakefulness).toBeGreaterThan(wake);
    expect(m.state.flags.coffeeDrunk).toBe(true); expect(m.state.inventory.coffee_beans).toBe(4);
    m.act('drinkCoffee'); expect(m.state.inventory.coffee).toBe(0);
  });
  it('does not duplicate coffee or spend beans when brewing twice', () => {
    const m = new GameModel(); choose(m, 'barista', 'acceptBeans'); choose(m, 'brewer', 'brew'); m.act('brew');
    m.tick(4); expect(m.state.inventory.coffee).toBe(1); expect(m.state.inventory.coffee_beans).toBe(4);
  });
});

describe('ordered quest progression and purchasing', () => {
  it('blocks jumping ahead and requires an active intoxicated conversation', () => {
    const m = new GameModel();
    choose(m, 'shopkeeper', 'buyFlashlight'); choose(m, 'cave_entrance', 'enterCaves');
    expect(m.state.inventory.flashlight).toBeUndefined(); expect(m.state.phase).toBe(1);
    coffee(m); choose(m, 'bartender', 'buyDrink'); choose(m, 'storyteller', 'hearCaveStory');
    expect(m.state.flags.manduClue).toBeUndefined();
    choose(m, 'bartender', 'buyDrink'); expect(m.state.intoxication).toBeGreaterThan(45);
    expect(m.state.flags.manduClue).toBeUndefined();
    choose(m, 'storyteller', 'hearCaveStory'); expect(m.state.flags.manduClue).toBe(true);
    expect(m.state.history.some(t => t.en.includes('Alexander Zeid'))).toBe(false);
  });
  it('deducts money atomically, prevents duplicate equipment, and requires spare batteries', () => {
    const m = new GameModel(); bar(m); expect(m.state.money).toBe(136);
    choose(m, 'shopkeeper', 'buyFlashlight'); expect(m.state.money).toBe(91); expect(m.state.inventory.flashlight).toBe(1);
    choose(m, 'shopkeeper', 'buyFlashlight'); expect(m.state.money).toBe(91);
    choose(m, 'cave_entrance', 'enterCaves'); expect(m.state.phase).toBe(1);
    choose(m, 'shopkeeper', 'buyBatteries'); expect(m.state.money).toBe(83);
    choose(m, 'cave_entrance', 'enterCaves'); expect(m.state.phase).toBe(2);
    expect(m.state.flags.suppliesBought).toBe(true);
  });
  it('reserves equipment money and offers a recovery battery when penniless', () => {
    const m = new GameModel(); coffee(m); m.state.money = 53;
    choose(m, 'barista', 'buyBeans'); expect(m.state.money).toBe(53);
    choose(m, 'bartender', 'buyDrink'); expect(m.state.money).toBe(53);
    m.state.flags.manduClue = true;
    choose(m, 'shopkeeper', 'buyFlashlight'); choose(m, 'shopkeeper', 'buyBatteries'); expect(m.state.money).toBe(0);
    m.state.inventory.batteries = 0; m.state.battery = 0;
    choose(m, 'shopkeeper', 'emergencyBattery'); expect(m.state.inventory.batteries).toBe(1);
    m.act('replaceBattery'); expect(m.state.battery).toBe(100);
  });
  it('keeps the required bar encounter playable if the player spends or sobers up', () => {
    const m = new GameModel(); coffee(m); m.state.money = 53;
    choose(m, 'bartender', 'joinToast'); choose(m, 'bartender', 'joinToast');
    expect(m.state.money).toBe(53); expect(m.state.intoxication).toBeGreaterThan(45);
    choose(m, 'storyteller', 'hearCaveStory'); expect(m.state.flags.manduClue).toBe(true);
  });
  it('allows entering with a purchased spare already installed', () => {
    const m = new GameModel(); bar(m);
    choose(m, 'shopkeeper', 'buyFlashlight'); choose(m, 'shopkeeper', 'buyBatteries');
    m.state.battery = 50; m.act('replaceBattery'); expect(m.state.inventory.batteries).toBe(0);
    choose(m, 'cave_entrance', 'enterCaves'); expect(m.state.phase).toBe(2);
  });
});

describe('flashlight, exploration, and puzzles', () => {
  it('drains only a lit flashlight and consumes a battery on replacement', () => {
    const m = new GameModel(); caves(m);
    m.tick(15); expect(m.state.battery).toBe(100);
    m.act('toggleFlashlight'); m.tick(15); expect(m.state.battery).toBeCloseTo(99);
    m.state.battery = 0.1; m.tick(2); expect(m.state.battery).toBe(0); expect(m.state.flashlightOn).toBe(false);
    m.act('replaceBattery'); expect(m.state.battery).toBe(100); expect(m.state.inventory.batteries).toBe(0);
  });
  it('requires the flashlight for markings and all evidence for the hidden passage', () => {
    const m = new GameModel(); caves(m);
    choose(m, 'light_mark', 'revealLight'); expect(m.state.flags.lightRevealed).toBeUndefined();
    m.act('toggleFlashlight'); choose(m, 'light_mark', 'revealLight'); expect(m.state.flags.lightRevealed).toBe(true);
    choose(m, 'hidden_gate', 'openHidden'); expect(m.state.phase).toBe(2);
    choose(m, 'mechanism', 'stoneLamp'); expect(m.state.flags.sequenceLamp).toBeUndefined();
    for (const letter of ['a', 'b', 'c']) choose(m, `inscription_${letter}`, `readInscription${letter.toUpperCase()}`);
    choose(m, 'mechanism', 'stoneTree'); expect(m.state.flags.sequenceLamp).toBe(false);
    choose(m, 'mechanism', 'stoneLamp'); choose(m, 'mechanism', 'stoneWater'); expect(m.state.flags.mechanismSolved).toBeUndefined();
    for (const action of ['stoneLamp', 'stoneTree', 'stoneWater']) choose(m, 'mechanism', action);
    expect(m.state.flags.mechanismSolved).toBe(true);
    choose(m, 'map_a', 'collectMapA'); choose(m, 'map_a', 'collectMapA'); expect(m.state.inventory.map_fragment).toBe(1);
    choose(m, 'map_b', 'collectMapB'); expect(m.state.inventory.cave_map).toBe(1);
    choose(m, 'hidden_gate', 'openHidden'); expect(m.state.phase).toBe(3);
  });
});

describe('guardian and ending', () => {
  it('supports a complete playthrough with a late identity reveal and peaceful ending', () => {
    const m = new GameModel(); puzzles(m);
    expect(m.state.flags.identityRevealed).toBeUndefined();
    choose(m, 'guardian', 'faceGuardian'); expect(m.state.encounter.active).toBe(false);
    choose(m, 'explorer_note', 'readExplorer'); choose(m, 'guardian', 'faceGuardian');
    choose(m, 'memory_lantern', 'collect_memory_lantern'); expect(m.state.inventory.memory_lantern).toBeUndefined();
    m.tick(19); expect(m.state.encounter.survived).toBe(false); m.tick(1); expect(m.state.encounter.survived).toBe(true);
    choose(m, 'memory_lantern', 'collect_memory_lantern'); choose(m, 'memory_photo', 'collect_memory_photo');
    expect(m.state.flags.identityRevealed).toBeUndefined();
    choose(m, 'memory_letter', 'collect_memory_letter'); expect(m.state.flags.identityRevealed).toBe(true);
    choose(m, 'oath', 'oathMemory'); expect(m.state.flags.spiritFreed).toBeUndefined();
    for (const action of ['oathPeople', 'oathPlace', 'oathMemory']) choose(m, 'oath', action);
    expect(m.state.phase).toBe(4); expect(m.state.flags.spiritFreed).toBe(true);
    choose(m, 'overlook', 'finish'); expect(m.state.flags.ending).toBeUndefined();
    choose(m, 'treasure', 'openTreasure'); choose(m, 'overlook', 'finish'); expect(m.state.flags.ending).toBe(true);
    choose(m, 'hidden_gate', 'openHidden'); expect(m.state.phase).toBe(4);
    expect(quests.every(q => q.completion(m.state))).toBe(true);
    expect(m.state.inventory.valley_archive).toBe(1);
  });
});

describe('versioned save data', () => {
  const storage = () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    return data;
  };
  it('round-trips position, resources, puzzle progress and dialogue history', () => {
    storage(); const m = new GameModel(); puzzles(m); m.state.position = { x: 45, y: -8, z: 91, yaw: 1, pitch: 0.4 };
    m.state.wakefulness = 37; m.state.intoxication = 12; m.state.battery = 63;
    expect(m.save()).toBe(true); const loaded = GameModel.load(); expect(loaded).not.toBeNull();
    expect(loaded).toEqual(m.state);
    const restored = new GameModel(loaded!); expect(restored.objective()).toEqual(m.objective());
  });
  it('rejects wrong versions and malformed JSON, sanitizes numbers and unknown items', () => {
    const data = storage(); data.set(SAVE_KEY, '{broken'); expect(GameModel.load()).toBeNull();
    data.set(SAVE_KEY, JSON.stringify({ version: 2 })); expect(GameModel.load()).toBeNull();
    const raw = new GameModel().state as unknown as Record<string, unknown>;
    raw.money = -20; raw.wakefulness = 500; raw.position = { x: 'wrong', y: null, z: 12, yaw: 0, pitch: 99 };
    raw.inventory = { coffee: -1, fake_item: 1000, batteries: 2.8 }; raw.flags = { ending: 'true', unknown: true };
    data.set(SAVE_KEY, JSON.stringify(raw)); const state = GameModel.load()!;
    expect(state.money).toBe(0); expect(state.wakefulness).toBe(100); expect(state.position.x).toBe(0); expect(state.position.pitch).toBe(1.55);
    expect(state.inventory).toEqual({ batteries: 2 }); expect(state.flags).toEqual({});
  });
  it('reports unavailable storage instead of crashing', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('quota'); } });
    expect(new GameModel().save()).toBe(false); expect(GameModel.load()).toBeNull();
  });
  it('preserves an in-progress brew without duplicating ingredients', () => {
    storage(); const m = new GameModel(); choose(m, 'barista', 'acceptBeans'); choose(m, 'brewer', 'brew'); m.tick(1); m.save();
    const loaded = new GameModel(GameModel.load()!); loaded.tick(2);
    expect(loaded.state.inventory.coffee).toBe(1); expect(loaded.state.inventory.coffee_beans).toBe(4);
  });
});

it('provides Hebrew and English text for every inventory item and quest', () => {
  for (const item of Object.values(items)) { expect(item.name.he).toBeTruthy(); expect(item.name.en).toBeTruthy(); expect(item.description.he).toBeTruthy(); expect(item.description.en).toBeTruthy(); }
  for (const quest of quests) { expect(quest.id).toBeTruthy(); expect(quest.title.he).toBeTruthy(); expect(quest.description.en).toBeTruthy(); }
});
