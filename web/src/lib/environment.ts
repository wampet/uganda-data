// Land cover, forest reserves, temperature and water (build time).
import envJson from '../data/environment.json';

interface Src { title: string; url: string; updated: string | null }
interface Row { name: string; values: number[] }

const raw = envJson as unknown as {
  sources: Record<'land' | 'reserves' | 'temperature' | 'water', Src>;
  land: { years: string[]; summary: Row[]; detail: Row[]; total: number; unit: string };
  forest_reserves_2015: { region: string; central_ha: number; local_ha: number; total_ha: number }[];
  temperature: { station: string; max: number; min: number; monthly_max: (number | null)[]; monthly_min: (number | null)[] }[];
  water: { year: string; produced: number; supplied: number }[];
  notes: string[];
};

export const { sources, notes, water } = raw;
export const land = raw.land;
export const landYears = land.years;
export const firstYear = landYears[0];
export const lastYear = landYears[landYears.length - 1];
const L = landYears.length - 1;

const find = (rows: Row[], name: string) => rows.find((r) => r.name.toLowerCase() === name.toLowerCase())!;
export const forest = find(land.summary, 'Forestry');
export const farmland = find(land.summary, 'Agriculture');
export const woodland = find(land.detail, 'Woodland');
export const builtUp = find(land.detail, 'Built Up areas');
export const grassland = find(land.summary, 'Grassland');

export const sharePct = (km2: number) => (100 * km2) / land.total;
export const change = (r: Row) => (100 * (r.values[L] - r.values[0])) / r.values[0];
/** Forest lost per day over the whole period, in hectares (1 km² = 100 ha). */
export const forestLossPerDayHa =
  ((forest.values[0] - forest.values[L]) * 100) / ((Number(lastYear) - Number(firstYear)) * 365.25);

// Readable names for the summary land classes.
const PLAIN: Record<string, string> = { Forestry: 'Forest & woodland', Agriculture: 'Farmland', Others: 'Built-up & other' };
export const landSummary = land.summary.map((r) => ({ ...r, label: PLAIN[r.name] ?? r.name }));

export const reserves = [...raw.forest_reserves_2015].sort((a, b) => b.total_ha - a.total_ha);
export const reservesTotal = reserves.reduce((n, r) => n + r.total_ha, 0);

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const stations = [...raw.temperature].sort((a, b) => b.max - a.max);
export const hottest = stations[0];
export const coolest = stations[stations.length - 1];
const peak = (s: (typeof stations)[number]) => {
  const v = Math.max(...s.monthly_max.filter((x): x is number => x != null));
  return { value: v, month: MONTHS_LONG[s.monthly_max.indexOf(v)] };
};
export const hottestMonth = peak(hottest);

export const w0 = water[0];
export const w1 = water[water.length - 1];
export const lostPct = (w: (typeof water)[number]) => (100 * (w.produced - w.supplied)) / w.produced;

const n0 = (v: number) => Math.round(v).toLocaleString('en-UG');

export function facts() {
  const west = reserves[0];
  return [
    `Uganda’s forest and woodland shrank from ${n0(forest.values[0])} km² in ${firstYear} to ${n0(forest.values[L])} km² in ${lastYear}, a loss of ${Math.round(-change(forest))}%.`,
    `That is roughly ${n0(Math.round(forestLossPerDayHa / 10) * 10)} hectares of forest lost every day for ${Number(lastYear) - Number(firstYear)} years.`,
    `Farmland covered ${Math.round(sharePct(farmland.values[L]))}% of Uganda’s total area in ${lastYear}, up from ${Math.round(sharePct(farmland.values[0]))}% in ${firstYear}.`,
    `Built-up areas grew more than ${Math.floor(builtUp.values[L] / builtUp.values[0])}-fold, from ${n0(builtUp.values[0])} km² in ${firstYear} to ${n0(builtUp.values[L])} km² in ${lastYear}.`,
    `The ${west.region} region holds ${Math.round((100 * west.total_ha) / reservesTotal)}% of the land in Uganda’s forest reserves.`,
    `${hottest.station} is the hottest of UBOS’s weather stations: daytime highs average ${hottest.max.toFixed(1)}°C and reach ${hottestMonth.value.toFixed(1)}°C in ${hottestMonth.month}.`,
    `${coolest.station} is the coolest: nights average ${coolest.min.toFixed(1)}°C.`,
    `National Water and Sewerage Corporation produced ${Math.round((100 * (w1.produced - w0.produced)) / w0.produced)}% more water in ${w1.year} than in ${w0.year}, and the amount supplied was about ${Math.round(lostPct(w1))}% less than the amount produced.`,
  ];
}
