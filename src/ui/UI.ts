import { items, type GameState, type Lang, type Text, type CatacombStep } from '../game/model';
import { ROADS, WORLD, BUILDINGS, VEHICLE, landmark } from '../world/geo';

// Static town-map geometry in world metres (north up = −z), built once.
let roadSvg = '';
const townRoads = () => roadSvg || (roadSvg = ROADS.map(r => `<polyline points="${r.points.filter((_, i) => i % 2 === 0 || i === r.points.length - 1).map(([x, z]) => `${x.toFixed(1)},${z.toFixed(1)}`).join(' ')}" class="map-street ${r.kind}" stroke-width="${(r.width * (r.kind === 'trunk' ? 1.5 : 1.25)).toFixed(1)}"/>`).join(''));
const MAP_LANDMARKS = ['amali', 'bengurion_square', 'founders_garden', 'synagogue', 'gali_pool', 'rimonim', 'great_oak', 'mitzpe_sharon', 'water_tower', 'yad_labanim', 'mandu', 'falafel_luli', 'zohar', 'post_zevulun', 'burger_saloon', 'paz', 'szenes_pool', 'computer_shop', 'mitzpe_roni', 'zeid_statue', 'park_gate'];

export const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const icon = (id: string): string => {
  const drawings: Record<string, string> = {
    coffee_beans: '<ellipse cx="12" cy="12" rx="6.5" ry="9" transform="rotate(35 12 12)"/><path d="M16 5c-7 3-1 10-8 14"/>',
    coffee: '<path d="M5 9h12v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z M17 10h2a3 3 0 0 1 0 6h-2 M7 3v3 M11 2v4 M15 3v3"/>',
    flashlight: '<path d="m7 3 10 0-1 5-2 3v10h-4V11L8 8Z M8 7h8 M10 14h4"/>',
    batteries: '<rect x="6" y="4" width="12" height="17" rx="1"/><path d="M9 4V2h6v2 M9 9h6 M12 6v6 M9 17h6"/>',
    memory_lantern: '<path d="M8 6V5a4 4 0 0 1 8 0v1 M7 7h10l2 14H5Z M9 10v7 M15 10v7 M5 18h14"/>',
    map_fragment: '<path d="m3 5 6-2 6 3 6-2v16l-6 2-6-3-6 2Z M9 3v16 M15 6v16"/>',
    note: '<path d="M6 3h9l4 4v14H6Z M14 3v5h5 M9 12h7 M9 16h7"/>',
    eye: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
    bag: '<path d="M6 8h12l2 13H4Z M9 8V5a3 3 0 0 1 6 0v3"/>',
    journal: '<rect x="5" y="3" width="15" height="18" rx="1"/><path d="M9 3v18 M3 7h4 M3 12h4 M3 17h4 M12 8h5 M12 12h5"/>',
    sunrise: '<path d="M2 18h20 M5 22h14 M7 18a5 5 0 0 1 10 0 M12 3v4 M3 9l3 3 M21 9l-3 3"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">${drawings[id] ?? drawings.note}</svg>`;
};
export class UI {
  lang: Lang = 'he';
  layer = document.createElement('div');
  hud = document.createElement('div');
  toastBox = document.createElement('div');
  minimap = document.createElement('div');
  private toastTimer = 0;
  private miniSvg?: SVGSVGElement;
  constructor(private action: (action: string) => void) {
    this.layer.id = 'overlay'; this.hud.id = 'hud'; this.toastBox.id = 'toast';
    document.body.append(this.hud, this.layer, this.toastBox, this.minimap);
    this.buildMinimap();
    this.layer.addEventListener('click', e => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (btn && !btn.hasAttribute('disabled')) this.action(btn.dataset.action!);
    });
    this.hud.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-action]'); if (b) this.action(b.dataset.action!); });
  }
  t(he: string, en: string) { return this.lang === 'he' ? he : en; }
  text(t: Text) { return t[this.lang]; }
  setLanguage(l: Lang) { this.lang = l; document.documentElement.lang = l; document.documentElement.dir = l === 'he' ? 'rtl' : 'ltr'; }
  button(label: string, action: string, cls = '', disabled = false) {
    const names: Record<string,string> = { inventory: this.t('תיק · I','Inventory · I'), journal: this.t('יומן · J','Journal · J'), map: this.t('מפה · M','Map · M'), pause: this.t('השהיה · ESC','Pause · ESC'), close: this.t('סגירה','Close') };
    const accessible = names[action] ? ` title="${escape(names[action])}" aria-label="${escape(names[action])}"` : '';
    return `<button class="${cls}" data-action="${escape(action)}"${accessible} ${disabled ? 'disabled' : ''}>${label}</button>`;
  }
  menu(hasSave: boolean) {
    this.hud.hidden = true; this.layer.className = 'menu-layer';
    this.layer.innerHTML = `<div class="menu-top"><a class="wordmark">T / G</a><div class="build-label">${this.t('אב־טיפוס משחק · 0.3','PLAYABLE PROTOTYPE · 0.3')}</div>${this.button(this.lang === 'he' ? 'ENGLISH ↗' : 'עברית ↗','language','language')}</div>
      <main class="menu-main"><div class="eyebrow"><i></i>${this.t('קריית טבעון · ישראל','KIRYAT TIVON · ISRAEL')}</div><h1 dir="ltr">TIVON<span>THE LAST GUARDIAN</span></h1><div class="title-rule"></div><p class="menu-description">${this.t('לכל מקום יש זיכרון.<br>יש מקומות שלא שוכחים.','Every place holds a memory.<br>Some places never let go.')}</p><nav class="menu-actions">${this.button(`${this.t('להמשיך במסע','Continue journey')} <span>↗</span>`,'continue','primary',!hasSave)}${this.button(`${this.t('מסע חדש','Begin a new journey')} <span>→</span>`,'new',hasSave ? '' : 'primary')}${this.button(this.t('הגדרות','Settings'),'settings','quiet')}</nav><div class="menu-note">${this.t('הרפתקה בגוף ראשון בגבעות טבעון.<br>מרחב מקוצר ותפאורה בהשראת המקום; הסיפור בדיוני.','A first-person adventure through the hills of Tivon.<br>A compressed, interpretive world. A fictional story.')}</div></main>
      <div class="scene-caption"><span>01 — ${this.t('אור אחרון','THE LAST LIGHT')}</span><p>${this.t('קפה. שיחה. משהו מתחת לפני השטח.','Coffee. Conversation. Something beneath the surface.')}</p></div><footer class="menu-footer"><span>${this.t('אוזניות מומלצות','BEST EXPERIENCED WITH HEADPHONES')}</span>${this.button(this.t('המקום והסיפור','The place & the story'),'about','about-link')}<span>W A S D &nbsp; / &nbsp; ${this.t('תנועה','MOVE')} &nbsp; · &nbsp; E &nbsp; / &nbsp; ${this.t('פעולה','INTERACT')}</span></footer>`;
  }
  close() { this.layer.innerHTML = ''; this.layer.className = ''; this.hud.hidden = false; }
  panel(title: string, content: string, wide = false, surface = 'paper') {
    this.layer.className = 'panel-layer';
    this.layer.innerHTML = `<section class="panel ${wide ? 'wide' : ''} surface-${surface}" role="dialog" aria-modal="true" aria-label="${escape(title)}"><header><div><span class="eyebrow">${this.t('טבעון / פנקס כיס','TIVON / POCKET NOTES')}</span><h2>${title}</h2></div>${this.button('×','close','close')}</header><div class="panel-body">${content}</div><div class="paper-footer"><span>T / G</span><span>${this.t('לחזור החוצה · ESC','BACK TO THE WORLD · ESC')}</span></div></section>`;
  }
  dialogue(d: {title:Text;text:Text;options:{label:Text;action:string;disabled?:boolean}[]}) {
    this.layer.className = 'dialogue-layer';
    this.layer.innerHTML = `<section class="dialogue" role="dialog"><div class="dialogue-meta"><span>${this.t('שיחה / התבוננות','CONVERSATION / OBSERVATION')}</span>${this.button('×','close','close')}</div><h2>${escape(this.text(d.title))}</h2><p class="dialogue-text">${escape(this.text(d.text))}</p><div class="choices">${d.options.map(o=>this.button(escape(this.text(o.label)),`act:${o.action}`,'choice',o.disabled)).join('')}${this.button(this.t('לחזור למסע','Return to the journey'),'close','quiet')}</div><small>${this.t('דיאלוג ואירועים בדיוניים','Fictional dialogue and events')}</small></section>`;
  }
  inventory(s: GameState) {
    const cards = Object.entries(s.inventory).filter(([,n]) => n > 0).map(([id,n]) => {
      const item = items[id];
      return `<article class="item"><div class="item-icon">${icon(id)}</div><div><h3>${escape(item ? this.text(item.name) : id)} <span>× ${n}</span></h3><p>${escape(item ? this.text(item.description) : '')}</p></div></article>`;
    }).join('');
    this.panel(this.t('מה בתיק','In your bag'),`<div class="balance"><span>${this.t('כסף מזומן','CASH ON HAND')}</span><strong>₪${s.money}</strong></div><div class="item-grid">${cards || this.t('התיק עדיין ריק','Your bag is empty')}</div><div class="panel-actions">${this.button(this.t('לשתות קפה מוכן','Drink brewed coffee'),'act:drinkCoffee','primary',!(s.inventory.coffee>0))}${this.button(this.t('להחליף סוללה','Replace battery'),'act:replaceBattery','',!(s.inventory.batteries>0&&s.inventory.flashlight>0))}${this.button(this.t('להדליק / לכבות פנס','Toggle flashlight'),'act:toggleFlashlight','',!(s.inventory.flashlight>0))}</div>`,false,'canvas');
  }
  journal(s: GameState, objective: Text, steps: CatacombStep[] | null = null) {
    const manduHint = s.flags.coffeeDrunk && !s.flags.manduClue ? `<aside class="journal-tip"><span>${this.t('תזכורת מהערב','A NOTE FOR TONIGHT')}</span><p>${s.intoxication >= 45 ? this.t('השיחה יכולה להיפתח עכשיו. חזרו למספר שליד הבר, הביטו בו ולחצו E. שאלו אותו על המערות.','The storyteller is ready to open up. Return to him beside the bar, face him and press E. Ask about the caves.') : this.t('במנדו, הברמן והמספר הם שני אנשים שונים. הזמינו שני משקאות מהברמן, ואז חזרו למספר לשיחה.','At Mandu, the bartender and storyteller are two different people. Order two drinks from the bartender, then return to the storyteller for a conversation.')}</p></aside>` : '';
    this.panel(this.t('יומן מסע','Field journal'),`<div class="chapter-label">${this.t('פרק','CHAPTER')} ${String(Math.min(s.phase,3)).padStart(2,'0')}</div><blockquote>${escape(this.text(objective))}</blockquote>${manduHint}${steps ? `<ul class="journal-steps">${steps.map(st => `<li class="${st.done ? 'done' : ''}"><b>${st.done ? '✓' : '○'}</b> ${escape(this.text(st.label))} <span>${escape(this.text(st.hint))}</span></li>`).join('')}</ul>` : ''}<div class="journal-records">${s.history.slice(-20).reverse().map(h=>`<p>${escape(this.text(h))}</p>`).join('')}</div><div class="reference-note">${this.t('המקומות וההיסטוריה מבוססים על מחקר. רשת המערות, הדמויות, התצרפים והאירועים העל־טבעיים נוצרו למשחק.','Places and historical context are researched. The cave network, characters, puzzles and supernatural events are invented for the game.')}</div>`);
  }
  map(s: GameState, steps: CatacombStep[] | null = null) {
    const inCaves = s.position.z > 89.5 && s.position.z < 262 && s.position.x > 99 && s.position.x < 165 && s.position.y < 9;
    let map: string;
    if (!inCaves) {
      const goal = !s.flags.coffeeDrunk ? 'amali' : !s.flags.manduClue ? 'mandu' : !s.flags.suppliesBought ? 'computer_shop' : !s.flags.cavesEntered ? 'park_gate' : '';
      // Markers keep a constant on-screen size: each sits in a <g data-k> scaled on zoom.
      const marks = MAP_LANDMARKS.map(id => {
        const l = landmark(id), main = ['amali', 'mandu', 'computer_shop', 'park_gate', 'zeid_statue', 'get_phone', 'library'].includes(id);
        return `<g transform="translate(${l.x.toFixed(1)} ${l.z.toFixed(1)})"><g data-k class="map-poi ${main ? 'main' : ''} ${id === goal ? 'goal' : ''}"><circle r="${main ? 7 : 4.5}"/>${id === goal ? '<circle r="17" class="goal-ring"/>' : ''}<text x="10" y="5">${escape(this.text(l.name).split(' · ')[0])}</text></g></g>`;
      }).join('');
      const blds = BUILDINGS.map(b => `<polygon points="${b.points.map(([x, z]) => `${x.toFixed(0)},${z.toFixed(0)}`).join(' ')}"/>`).join('');
      const cyclamen = `<path d="M0 0 C-5 -3 -6 -10 -2.5 -13 C-1 -9 -.5 -5 0 0Z" fill="#d23a83"/><path d="M0 0 C5 -3 6 -10 2.5 -13 C1 -9 .5 -5 0 0Z" fill="#e0559a"/><path d="M0 0 C-1.6 -5 -1.6 -11 0 -15 C1.6 -11 1.6 -5 0 0Z" fill="#f07ab3"/><circle r="1.6" fill="#7a1747"/><path d="M0 1 C0 4 0 6 0 8" stroke="#3f6b3a" stroke-width="1.2"/>`;
      const deg = -s.position.yaw * 180 / Math.PI;
      map = `<div class="map-wrap"><svg class="field-map town-map" role="img" aria-label="Map of Kiryat Tivon" data-x="${s.position.x.toFixed(1)}" data-z="${s.position.z.toFixed(1)}">
        <rect x="${WORLD.minX - 300}" y="${WORLD.minZ - 300}" width="${WORLD.maxX - WORLD.minX + 600}" height="${WORLD.maxZ - WORLD.minZ + 600}" class="map-bg"/>
        <g class="map-blds">${blds}</g>
        <g class="map-streets">${townRoads()}</g>
        ${marks}
        <g transform="translate(${s.position.x.toFixed(1)} ${s.position.z.toFixed(1)})"><g data-k class="map-me">
          <circle r="40" class="map-me-pulse"/><circle r="17" class="map-me-disc"/>
          <path d="M0 -33 L8 -19 L-8 -19Z" class="map-me-dir" transform="rotate(${deg.toFixed(1)})"/>
          <g transform="scale(1.05) translate(0 5)">${cyclamen}</g>
          <g class="map-me-label"><rect x="-38" y="20" width="76" height="17" rx="8.5"/><text y="32">${this.t('אתם כאן', 'YOU ARE HERE')}</text></g>
        </g></g>
      </svg>
      <div class="map-tools"><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="me" aria-label="Centre on me">◎</button></div></div>`;
    } else {
      const X = (x: number) => (x - 126) * 4.5 + 260, Y = (z: number) => (z - 100) * 2.4 + 15;
      const rooms = [[126,105],[108,120],[144,120],[108,142],[126,142],[144,142],[126,159],...(s.flags.hiddenOpened ? [[126,178],[126,198],[126,226],[126,244]] : [])];
      const spots: Array<[string, number, number]> = [['inscriptionA', 108, 125.7], ['inscriptionB', 144, 125.7], ['inscriptionC', 126, 136.2], ['mapA', 108, 146.4], ['mapB', 126, 130], ['lightRevealed', 145, 147.7], ['mechanismSolved', 126, 160], ['hiddenOpened', 126, 167]];
      const glyph: Record<string, string> = { inscriptionA: 'I', inscriptionB: 'II', inscriptionC: 'III', mapA: 'A', mapB: 'B', lightRevealed: '✦', mechanismSolved: '◎', hiddenOpened: '▮' };
      const clueDots = steps ? spots.map(([id, x, z]) => { const st = steps.find(q => q.id === id); return `<g class="map-clue ${st?.done ? 'done' : ''}"><circle cx="${X(x)}" cy="${Y(z)}" r="9"/><text x="${X(x)}" y="${Y(z) + 3.5}">${glyph[id]}</text></g>`; }).join('') : '';
      map = `<svg viewBox="0 0 520 400" class="field-map" role="img" aria-label="Discovered cave schematic"><path d="M260 25V175M179 70H341M179 70V137H341V70M179 137H341${s.flags.hiddenOpened ? 'M260 175V370' : ''}" stroke="#b6ae94" stroke-width="8" fill="none"/>${rooms.map(([rx,rz])=>`<rect x="${(rx-126)*4.5+241}" y="${(rz-100)*2.4+2}" width="38" height="27" class="map-block"/>`).join('')}<g class="map-label"><text x="260" y="20">${this.t('כניסה','ENTRANCE')}</text><text x="80" y="64">${this.t('מערב · לוח I','WEST · PANEL I')}</text><text x="380" y="64">${this.t('מזרח · לוח II','EAST · PANEL II')}</text><text x="350" y="182">${this.t('חותמות ודלת','SEALS & DOOR')}</text>${s.flags.hiddenOpened ? `<text x="260" y="350">${this.t('האולם העמוק','DEEP CHAMBER')}</text>` : `<text x="260" y="240">${this.t('טרם נחקר','UNEXPLORED')}</text>`}</g>${clueDots}<circle cx="${X(s.position.x)}" cy="${Y(s.position.z)}" r="6" class="map-you"/></svg>`;
    }
    const legend = inCaves ? `<span><i></i> ${this.t('המיקום שלך', 'You are here')}</span><span class="legend-clue">● ${this.t('רמז שטרם נמצא', 'Clue still to find')}</span><span class="legend-done">● ${this.t('הושלם', 'Done')}</span>`
      : `<span><i></i> ${this.t('המיקום שלך', 'You are here')}</span><span class="legend-goal">◯ ${this.t('היעד הבא', 'Next destination')}</span><span>${this.t('רחובות ובניינים לפי OpenStreetMap, בקנה מידה 1:1', 'OpenStreetMap streets and buildings, 1:1')}</span>`;
    this.panel(this.t(inCaves ? 'מפת המערות' : 'מפת טבעון', inCaves ? 'Cave map' : 'Map of Tivon'),`<p class="map-subtitle">${this.t(inCaves ? 'סכמה בדיונית של רשת המערות' : 'קנה מידה 1:1 · © OpenStreetMap contributors', inCaves ? 'FICTIONAL SCHEMATIC OF THE CAVE NETWORK' : 'REAL SCALE 1:1 · © OPENSTREETMAP CONTRIBUTORS')}</p>${map}<div class="map-legend">${legend}</div>`,true);
    if (!inCaves) this.zoomableMap();
  }
  /** Wheel/pinch to zoom, drag to pan, +/− and centre-on-me buttons; markers keep their size. */
  private zoomableMap() {
    const svg = this.layer.querySelector<SVGSVGElement>('.town-map'); if (!svg) return;
    const me = { x: Number(svg.dataset.x), z: Number(svg.dataset.z) };
    let cx = me.x, cz = me.z, span = 520;
    const apply = () => {
      span = Math.max(80, Math.min(4600, span));
      const r = svg.getBoundingClientRect(), aspect = r.width && r.height ? r.width / r.height : 1.4;
      const w = aspect >= 1 ? span * aspect : span, h = aspect >= 1 ? span : span / aspect;
      svg.setAttribute('viewBox', `${(cx - w / 2).toFixed(1)} ${(cz - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
      const k = (span / 520).toFixed(3); svg.querySelectorAll('[data-k]').forEach(g => g.setAttribute('transform', `scale(${k})`));
      svg.classList.toggle('far', span > 1600);
    };
    apply(); requestAnimationFrame(apply);
    svg.addEventListener('wheel', e => { e.preventDefault(); span *= Math.pow(1.0015, e.deltaY); apply(); }, { passive: false });
    const pointers = new Map<number, { x: number; y: number }>(); let pinch = 0;
    svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
    svg.addEventListener('pointermove', e => {
      const prev = pointers.get(e.pointerId); if (!prev) return;
      const r = svg.getBoundingClientRect(), mPerPx = span / Math.min(r.width, r.height);
      if (pointers.size === 1) { cx -= (e.clientX - prev.x) * mPerPx; cz -= (e.clientY - prev.y) * mPerPx; }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) { const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) span *= pinch / d; pinch = d; }
      apply();
    });
    const up = (e: PointerEvent) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0; };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    this.layer.querySelectorAll<HTMLButtonElement>('[data-zoom]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); const z = b.dataset.zoom;
      if (z === 'in') span /= 1.6; else if (z === 'out') span *= 1.6; else { cx = me.x; cz = me.z; span = 520; }
      apply();
    }));
  }
  pause() {
    this.panel(this.t('רגע לנשום','A moment to breathe'),`<div class="pause-options">${this.button(this.t('לחזור למסע','Resume journey'),'close','primary')}${this.button(this.t('שמירה ידנית','Save journey'),'save')}${this.button(this.t('טעינת שמירה','Load saved journey'),'load')}${this.button(this.t('הגדרות','Settings'),'settings')}${this.button(this.t('המקום והסיפור','The place & the story'),'about')}${this.button(this.t('תפריט ראשי','Main menu'),'menu','quiet')}</div>`);
  }
  about() {
    this.panel(this.t('המקום והסיפור','The place & the story'),`<p class="about-intro">${this.t('טבעון היא מקום אמיתי. המסע הזה הוא סיפור שנכתב בשבילה.','Tivon is a real place. This journey is a story imagined for it.')}</p><dl class="provenance"><dt>${this.t('מבוסס על מקורות','RESEARCHED')}</dt><dd>${this.t('עמלי, מנדו, בית התוכנה והמחשב וגן לאומי בית שערים. זהות העסקים וכתובותיהם נבדקו במקורות המקושרים.','Amali, Mandu, Beit HaTochna VeHaMachshev and Beit She’arim National Park. Business identities and listed addresses were checked against the linked sources.')}</dd><dt>${this.t('פרשנות חזותית','INTERPRETIVE')}</dt><dd>${this.t('חזיתות הבניינים, חללי הפנים, הצמחייה ותוואי מערות המשחק הם קירובים. זו אינה סריקה צילומית של טבעון.','Building fronts, interiors, vegetation and the game’s cave layout are approximations. This is not a photographic scan of Tivon.')}</dd><dt>${this.t('בדיוני','FICTIONAL')}</dt><dd>${this.t('הדמויות, הדיאלוג, החידות, החפצים והאירועים העל־טבעיים נוצרו למשחק. הם אינם טענות על עסקים, עובדים או ממצאים ארכאולוגיים אמיתיים.','Characters, dialogue, puzzles, objects and supernatural events are invented. They are not claims about real businesses, employees or archaeological discoveries.')}</dd></dl><div class="source-links"><a href="https://www.amaliroast.com/about-us" target="_blank" rel="noopener noreferrer">${this.t('עמלי · אתר העסק','Amali · business website')} ↗</a><a href="https://tour.ktv.org.il/business/45/" target="_blank" rel="noopener noreferrer">${this.t('מנדו · תיירות טבעון','Mandu · Tivon tourism')} ↗</a><a href="https://whc.unesco.org/en/list/1471/" target="_blank" rel="noopener noreferrer">${this.t('בית שערים · אונסק״ו','Beit She’arim · UNESCO')} ↗</a></div><p class="reference-note">${this.t('כל הגאומטריה, הסימנים והצלילים בבנייה זו נוצרו עבור המשחק. מקורות ומגבלות נוספים נמצאים בקבצי הפרויקט.','Geometry, signage and synthesized sound in this build were created for the game. Further sources and limitations are recorded in the project files.')}</p>`);
  }
  settings(settings: { quality: string; volume: number; sensitivity: number; reducedMotion: boolean; invertY: boolean }) {
    this.panel(this.t('הגדרות','Settings'),`<div class="settings"><label>${this.t('שפה','Language')}<select id="setting-language"><option value="he" ${this.lang==='he'?'selected':''}>עברית</option><option value="en" ${this.lang==='en'?'selected':''}>English</option></select></label><label>${this.t('איכות גרפיקה','Graphics quality')}<select id="setting-quality">${['low','medium','high'].map(q=>`<option ${settings.quality===q?'selected':''} value="${q}">${this.t(({low:'נמוכה',medium:'בינונית',high:'גבוהה'} as Record<string,string>)[q],q)}</option>`).join('')}</select></label><label>${this.t('עוצמת שמע','Sound volume')}<input id="setting-volume" type="range" min="0" max="1" step="0.05" value="${settings.volume}"/></label><label>${this.t('רגישות עכבר','Mouse sensitivity')}<input id="setting-sensitivity" type="range" min="0.3" max="2" step="0.1" value="${settings.sensitivity}"/></label><label>${this.t('הפחתת תנועות מצלמה','Reduce camera motion')}<input id="setting-motion" type="checkbox" ${settings.reducedMotion?'checked':''}/></label><label>${this.t('היפוך ציר אנכי','Invert vertical look')}<input id="setting-invert" type="checkbox" ${settings.invertY?'checked':''}/></label></div><div class="controls-grid"><p><kbd>WASD</kbd> ${this.t('תנועה','Move')} <kbd>← →</kbd> ${this.t('מבט','Look')}</p><p><kbd>SHIFT</kbd> ${this.t('ריצה','Sprint')} <kbd>SPACE</kbd> ${this.t('קפיצה','Jump')}</p><p><kbd>E</kbd> ${this.t('פעולה','Interact')} <kbd>F</kbd> ${this.t('פנס','Flashlight')}</p><p><kbd>I</kbd> ${this.t('תיק','Inventory')} <kbd>J</kbd> ${this.t('יומן','Journal')} <kbd>M</kbd> ${this.t('מפה','Map')}</p><p>${this.t('אפשר גם לגרור עם העכבר כדי להביט. לחיצה על המסך נועלת את הסמן.','Drag to look if pointer lock is unavailable. Click the scene to capture the mouse.')}</p></div>${this.button(this.t('שמירת הגדרות','Apply settings'),'applySettings','primary')}`);
  }
  /** Always-on corner map: real streets and building outlines around the player, north up.
   *  The player is an upright cyclamen (Tivon's flower); the map turns so forward is up. */
  private miniBase?: HTMLCanvasElement; private miniCanvas?: HTMLCanvasElement;
  private static readonly MINI_RES = 1.5; // metres per pixel of the pre-drawn map
  private buildMinimap() {
    this.minimap.className = 'minimap'; this.minimap.hidden = true;
    const R = UI.MINI_RES, W = Math.ceil((WORLD.maxX - WORLD.minX + 400) / R), H = Math.ceil((WORLD.maxZ - WORLD.minZ + 400) / R);
    const base = document.createElement('canvas'); base.width = W; base.height = H; const g = base.getContext('2d');
    if (g) {
      g.fillStyle = '#cfd2b4'; g.fillRect(0, 0, W, H);
      const X = (x: number) => (x - WORLD.minX + 200) / R, Z = (z: number) => (z - WORLD.minZ + 200) / R;
      g.fillStyle = '#e6dcc8'; g.strokeStyle = '#a89c84'; g.lineWidth = .6;
      for (const b of BUILDINGS) { g.beginPath(); b.points.forEach(([x, z], i) => i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))); g.closePath(); g.fill(); g.stroke(); }
      g.lineCap = g.lineJoin = 'round';
      for (const pass of ['path', 'road', 'trunk']) for (const r of ROADS) {
        const kind = VEHICLE.has(r.kind) ? (r.kind.startsWith('trunk') ? 'trunk' : 'road') : 'path'; if (kind !== pass) continue;
        g.strokeStyle = kind === 'trunk' ? '#e7b97a' : kind === 'road' ? '#fbf8ef' : '#b49a74'; g.lineWidth = kind === 'path' ? 1.2 / R : r.width * 1.1 / R;
        g.setLineDash(kind === 'path' ? [2, 2] : []); g.beginPath(); r.points.forEach(([x, z], i) => i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))); g.stroke();
      }
      g.setLineDash([]);
    }
    this.miniBase = base;
    const cyclamen = `<path d="M0 0 C-5 -3 -6 -10 -2.5 -13 C-1 -9 -.5 -5 0 0Z" fill="#d23a83"/><path d="M0 0 C5 -3 6 -10 2.5 -13 C1 -9 .5 -5 0 0Z" fill="#e0559a"/><path d="M0 0 C-1.6 -5 -1.6 -11 0 -15 C1.6 -11 1.6 -5 0 0Z" fill="#f07ab3"/><circle r="1.6" fill="#7a1747"/><path d="M0 1 C0 4 0 6 0 8" stroke="#3f6b3a" stroke-width="1.2" fill="none"/><path d="M-3.5 7 C-6 5 -5 2 -1.5 3.5Z M3.5 7 C6 5 5 2 1.5 3.5Z" fill="#4f7a43"/>`;
    this.minimap.innerHTML = `<canvas width="180" height="180"></canvas><svg viewBox="0 0 180 180" aria-label="Minimap"><g transform="translate(90 94) scale(1.6)">${cyclamen}</g><text x="90" y="13" class="mm-n">N</text></svg>`;
    this.miniCanvas = this.minimap.querySelector('canvas')!; this.miniSvg = this.minimap.querySelector('svg')!;
  }
  /** Heading-up: the pre-drawn map turns around the player so the cyclamen stands upright. */
  updateMinimap(x: number, z: number, yaw: number, visible: boolean) {
    this.minimap.hidden = !visible; if (!visible || !this.miniCanvas || !this.miniBase) return;
    const g = this.miniCanvas.getContext('2d'); if (!g) return;
    const R = UI.MINI_RES, scale = 180 / 170 * R;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#cfd2b4'; g.fillRect(0, 0, 180, 180);
    g.translate(90, 90); g.rotate(yaw); g.scale(scale, scale);
    g.drawImage(this.miniBase, -(x - WORLD.minX + 200) / R, -(z - WORLD.minZ + 200) / R);
    const n = this.miniSvg!.querySelector<SVGTextElement>('.mm-n')!;
    n.setAttribute('x', (90 + 76 * Math.sin(yaw)).toFixed(1)); n.setAttribute('y', (94 - 76 * Math.cos(yaw)).toFixed(1));
  }
  toast(text: string) { this.toastBox.textContent = text; this.toastBox.classList.add('visible'); window.clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(()=>this.toastBox.classList.remove('visible'),5000); }
  updateHUD(s: GameState, prompt: string | null, zone: string, fps: number, brewing: number, locked: boolean, threat: number, steps: CatacombStep[] | null = null) {
    const wake = Math.round(s.wakefulness);
    const tipsy = s.intoxication >= 45 ? this.t('מעט שיכורים','Feeling tipsy') : this.t('ראש מעט קל','A little light-headed');
    this.hud.innerHTML = `<div class="hud-top"><span class="location"><i></i>${zone}</span><div class="hud-tools">${this.button(`<span>${icon('bag')}</span><kbd>I</kbd>`,'inventory','tool')}${this.button(`<span>${icon('journal')}</span><kbd>J</kbd>`,'journal','tool')}${this.button(`<span>${icon('map_fragment')}</span><kbd>M</kbd>`,'map','tool')}${this.button('<span class="pause-symbol">Ⅱ</span>','pause','tool')}</div></div><div class="crosshair ${prompt ? 'has-target' : ''}"></div>${prompt ? `<div class="interact-prompt"><kbd>E</kbd> <span>${escape(prompt)}</span></div>` : ''}<div class="vitals ${wake<20?'fatigued':''}"><div class="vital"><span>${icon('eye')} ${this.t('ערנות','Wakefulness')}</span><div class="meter"><i style="width:${wake}%"></i></div><b>${wake}</b></div>${s.inventory.flashlight ? `<div class="vital"><span>${icon('batteries')} ${this.t('סוללה','Battery')}</span><div class="meter"><i style="width:${s.battery}%"></i></div><b>${Math.round(s.battery)}</b></div>` : ''}${s.intoxication>10 ? `<div class="intox">${tipsy}</div>` : ''}</div>${brewing>0 ? `<div class="brewing">${icon('coffee')}<span>${this.t('הקפה מתבשל…','Brewing coffee…')}<small>${Math.ceil(brewing)} ${this.t('שניות','seconds')}</small></span></div>` : ''}${!locked ? `<div class="capture-hint">${this.t('לחצו להביט סביב','Click to look around')}<span>WASD · ${this.t('הליכה','walk')} &nbsp; E · ${this.t('פעולה','interact')}</span></div>` : ''}${threat>0 ? `<div class="threat">${this.t('הקשיבו לפרסות. המשיכו לנוע.','Listen for hoofbeats. Keep moving.')}<div class="meter"><i style="width:${threat}%"></i></div></div>` : ''}${steps ? `<aside class="tracker"><h4>${this.t('דלת האבן החתומה','THE SEALED DOOR')}</h4>${steps.map((st, i) => `<p class="${st.done ? 'done' : ''} ${!st.done && steps.findIndex(q => !q.done) === i ? 'next' : ''}"><b>${st.done ? '✓' : '○'}</b>${escape(this.text(st.label))}</p>`).join('')}${(() => { const n = steps.find(q => !q.done); return n ? `<small>${escape(this.text(n.hint))}</small>` : ''; })()}</aside>` : ''}<span class="performance-counter" aria-hidden="true">${Math.round(fps)}</span>`;
  }
  ending() {
    this.panel(this.t('העמק זוכר','The valley remembers'),`<div class="ending-mark">${icon('sunrise')}</div><p class="ending-prose">${this.t('האור הראשון עובר בין העצים. הפרש פונה אל האופק, והפעם אינו מביט לאחור. למטה, מישהו פותח בית קפה. כיסא נגרר על המדרכה. החיים נמשכים.','The first light moves between the trees. The rider turns toward the horizon, and this time he does not look back. Below, someone opens a café. A chair scrapes across the pavement. Life goes on.')}</p><blockquote>${this.t('לשמור על מקום — זה לתת לו לחיות.','To protect a place is to let it live.')}</blockquote><p>${this.t('סיימת את סיפור אב־הטיפוס. אפשר להמשיך לטייל בעמק.','You completed the prototype story. The valley remains open to explore.')}</p>${this.button(this.t('לחזור לטבעון','Return to Tivon'),'returnTown','primary')}`);
  }
}
