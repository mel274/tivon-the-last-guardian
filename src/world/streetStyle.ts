import survey from '../data/street-styles.json';

/** Per-street look from the Street View survey (docs/gis/street-survey.json → src/data/street-styles.json):
 *  storeys, roof mix, wall finishes, front boundaries and vegetation. Streets without a survey
 *  entry use the town-wide defaults below, which follow the survey's overall patterns. */
export interface StreetStyle {
  type: string; floorsTypical: number; floorsMax: number; redTileRoofShare: number;
  walls: string[]; setbackM: number; frontBoundary: string; solarHeaters: boolean; balconies: boolean;
  treeDensity: string; species: string[]; hedges: boolean; retainingWalls: boolean;
}
type Survey = { name: string; buildings?: Partial<{ type: string; floorsTypical: number; floorsMax: number; redTileRoofShare: number; walls: string[]; setbackM: number; frontBoundary: string; solarHeaters: boolean; balconies: boolean }>; street?: Partial<{ retainingWalls: boolean }>; nature?: Partial<{ treeDensity: string; species: string[]; hedges: boolean }> };

/** Town-wide pattern from the Street View survey (46 streets, 2012 imagery), used for streets not
 *  yet surveyed: detached two-storey houses set back behind low rubble walls and hedges, about half
 *  with red-tile roofs, the rest flat with solar heaters, all among dense pine, oak and ficus. */
export const DEFAULT_STYLE: StreetStyle = {
  type: 'private houses', floorsTypical: 2, floorsMax: 2, redTileRoofShare: .5,
  walls: ['white plaster', 'cream plaster', 'white plaster', 'grey-green plaster'], setbackM: 6, frontBoundary: 'low stone wall + hedge',
  solarHeaters: true, balconies: false, treeDensity: 'high', species: ['aleppo pine', 'oak', 'ficus', 'cypress', 'carob', 'olive'], hedges: true, retainingWalls: true,
};
const byName = new Map<string, StreetStyle>();
for (const s of survey as Survey[]) {
  if (!s?.name) continue;
  // A street with no houses facing it (e.g. Route 75) keeps the default buildings for footprints tagged to it.
  const b = s.buildings?.type === 'none' || !s.buildings?.floorsTypical ? {} : s.buildings, n = s.nature ?? {};
  byName.set(s.name, {
    type: b.type ?? DEFAULT_STYLE.type,
    floorsTypical: Math.max(1, Math.min(8, Math.round(b.floorsTypical ?? DEFAULT_STYLE.floorsTypical))),
    floorsMax: Math.max(1, Math.min(10, Math.round(b.floorsMax ?? b.floorsTypical ?? DEFAULT_STYLE.floorsMax))),
    redTileRoofShare: Math.max(0, Math.min(1, b.redTileRoofShare ?? DEFAULT_STYLE.redTileRoofShare)),
    walls: b.walls?.length ? b.walls : DEFAULT_STYLE.walls,
    setbackM: Math.max(0, Math.min(15, b.setbackM ?? DEFAULT_STYLE.setbackM)),
    frontBoundary: b.frontBoundary ?? DEFAULT_STYLE.frontBoundary,
    solarHeaters: b.solarHeaters ?? true, balconies: b.balconies ?? true,
    treeDensity: n.treeDensity ?? DEFAULT_STYLE.treeDensity, species: n.species?.length ? n.species : DEFAULT_STYLE.species,
    hedges: n.hedges ?? true, retainingWalls: s.street?.retainingWalls ?? true,
  });
}
export const styleFor = (street: string): StreetStyle => byName.get(street) ?? DEFAULT_STYLE;
export const surveyedStreets = () => byName.size;

/** Wall finish → (colour, stone texture?). */
export function wallFinish(name: string, r: number): { color: string; stone: boolean } {
  const n = name.toLowerCase();
  if (n.includes('stone')) return { color: ['#efe2c4', '#e8d9b8', '#f1e6cc'][Math.floor(r * 3)], stone: true };
  if (n.includes('green')) return { color: ['#d9dcc8', '#d3d8c2', '#dde0cf'][Math.floor(r * 3)], stone: false }; // 1950s cottages
  if (n.includes('concrete') || n.includes('grey') || n.includes('gray')) return { color: ['#c4bfb4', '#bdb8ad', '#cfcac0'][Math.floor(r * 3)], stone: false };
  if (n.includes('cream') || n.includes('beige') || n.includes('yellow')) return { color: ['#efe3c6', '#e9dfc8', '#e7d5b6'][Math.floor(r * 3)], stone: false };
  if (n.includes('pink') || n.includes('ochre') || n.includes('orange') || n.includes('terracotta')) return { color: ['#e8c9b0', '#e6c49c', '#ddb595'][Math.floor(r * 3)], stone: false };
  if (n.includes('wood')) return { color: '#a98563', stone: false };
  return { color: ['#f5f1e8', '#f1ebdd', '#eee6d6'][Math.floor(r * 3)], stone: false };
}
/** Trees per garden for a density label. */
export const gardenTrees = (density: string) => ({ none: 0, low: .6, medium: 1.4, high: 2.4, forest: 3.4 } as Record<string, number>)[density] ?? 1.6;
/** Survey species → instanced tree kind (0 oak/broadleaf, 1 Aleppo pine, 2 cypress, 3 olive). */
export function treeKind(species: string[], r: number): 0 | 1 | 2 | 3 {
  const s = species[Math.floor(r * species.length)]?.toLowerCase() ?? 'oak';
  if (s.includes('pine')) return 1; if (s.includes('cypress')) return 2; if (s.includes('olive')) return 3;
  return 0;
}
