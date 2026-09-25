// "Uganda and the world": World Bank, IMF and WHO comparisons (pipeline/intl).
// Build-time helpers; every sentence and rank is computed from world.json.
import worldJson from '../data/world.json';

export interface Place { code: string; name: string; aggregate: boolean }
export interface WorldIndicator {
  id: string; source: 'wb' | 'imf' | 'who'; code: string; label: string; unit: string; digits: number;
  topic: string; better: 'higher' | 'lower' | null; note: string; projFrom: number | null;
  names: Record<string, string>; years: number[]; values: Record<string, (number | null)[]>;
}
interface Src { title: string; url: string; license: string }

const raw = worldJson as unknown as {
  generated: string;
  sources: Record<'wb' | 'imf' | 'who', Src>;
  places: Place[];
  groups: Record<string, { label: string; places: string[] }>;
  topics: string[];
  indicators: WorldIndicator[];
};

export const places = raw.places;
export const placeName = Object.fromEntries(places.map((p) => [p.code, p.name]));
export const groups = raw.groups;
export const GROUP_IDS = Object.keys(groups);
export const topics = raw.topics;
export const indicators = raw.indicators;
export const indicatorById = new Map(indicators.map((i) => [i.id, i]));
export const sources = raw.sources;
export const AVERAGES = places.filter((p) => p.aggregate).map((p) => p.code);
export const sourceOf = (i: WorldIndicator) => ({ title: sources[i.source].title, url: sources[i.source].url });

/** Newest actual (not projected) value for a place. */
export function latest(i: WorldIndicator, place: string): { year: number; value: number } | null {
  const vals = i.values[place];
  if (!vals) return null;
  for (let k = i.years.length - 1; k >= 0; k--) {
    if (i.projFrom != null && i.years[k] >= i.projFrom) continue;
    if (vals[k] != null) return { year: i.years[k], value: vals[k]! };
  }
  return null;
}

// ---- formatting ---------------------------------------------------------------
const compact = (v: number) =>
  Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(1)} billion` : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)} million` : Math.round(v).toLocaleString('en-UG');

export function fmt(i: WorldIndicator, v: number | null | undefined, withUnit = true): string {
  if (v == null) return '–';
  const n = v.toLocaleString('en-UG', { minimumFractionDigits: i.digits, maximumFractionDigits: i.digits });
  switch (i.unit) {
    case 'people': return compact(v);
    case 'US$': return `$${Math.round(v).toLocaleString('en-UG')}`;
    case 'intl $': return `$${Math.round(v).toLocaleString('en-UG')}`;
    case '%': case '% of people': case '% of jobs': case '% of land': return `${n}%`;
    case '% of GDP': return withUnit ? `${n}% of GDP` : `${n}%`;
    case 'years': return withUnit ? `${n} years` : n;
    default: return withUnit ? `${n} ${i.unit}` : n;
  }
}
/** Axis/label suffix for charts (the Chart component appends it to numbers). */
export const chartUnit = (i: WorldIndicator) => (i.unit.startsWith('%') ? '%' : '');

const ORD = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

// ---- ranking within a group ------------------------------------------------------
/** Oldest a comparison value may be, relative to Uganda's, to be ranked alongside it. */
const MAX_GAP = 5;
/** Uganda figures older than this are shown but not ranked. */
export const STALE_BEFORE = 2012;

export interface Ranked { code: string; name: string; year: number; value: number }

export function groupRanking(i: WorldIndicator, groupId: string) {
  const ug = latest(i, 'UGA');
  if (!ug) return null;
  const members: Ranked[] = groups[groupId].places
    .map((c) => ({ c, l: latest(i, c) }))
    .filter((x): x is { c: string; l: { year: number; value: number } } => x.l != null && Math.abs(x.l.year - ug.year) <= MAX_GAP)
    .map(({ c, l }) => ({ code: c, name: placeName[c], year: l.year, value: l.value }));
  const averages: Ranked[] = AVERAGES.map((c) => ({ c, l: latest(i, c) }))
    .filter((x): x is { c: string; l: { year: number; value: number } } => x.l != null && Math.abs(x.l.year - ug.year) <= MAX_GAP)
    .map(({ c, l }) => ({ code: c, name: i.names[c] ?? placeName[c], year: l.year, value: l.value }));
  const lowFirst = i.better === 'lower';
  const order = [...members].sort((a, b) => (lowFirst ? a.value - b.value : b.value - a.value));
  const pos = order.findIndex((m) => m.code === 'UGA') + 1;
  const word = lowFirst ? 'lowest' : 'highest';
  const rankText = pos === 1 ? `The ${word} of ${order.length}` : `${ORD(pos)} ${word} of ${order.length}`;
  return { ug, members, averages, pos, of: order.length, rankText, best: i.better != null && pos === 1, worst: i.better != null && pos === order.length, stale: ug.year < STALE_BEFORE };
}

/** Plain phrases for "better than most" / "worse than most", per ranked measure. */
export const PHRASE: Record<string, [good: string, bad: string]> = {
  gdp_growth: ['faster growth', 'slower growth'],
  gdp_pc_ppp: ['higher incomes', 'lower incomes'],
  gdp_pc_usd: ['higher incomes in dollars', 'lower incomes in dollars'],
  debt: ['lower government debt', 'higher government debt'],
  poverty_3: ['less extreme poverty', 'more extreme poverty'],
  life_exp: ['longer lives', 'shorter lives'],
  under5: ['fewer child deaths', 'more child deaths'],
  maternal: ['fewer mothers dying in childbirth', 'more mothers dying in childbirth'],
  malaria: ['less malaria', 'more malaria'],
  uhc: ['better health service coverage', 'weaker health service coverage'],
  doctors: ['more doctors per person', 'fewer doctors per person'],
  primary_completion: ['more children finishing primary school', 'fewer children finishing primary school'],
  secondary: ['more teenagers in secondary school', 'fewer teenagers in secondary school'],
  literacy: ['more adults who can read', 'fewer adults who can read'],
  electricity: ['more people with electricity', 'fewer people with electricity'],
  clean_cooking: ['more people cooking with clean fuels', 'fewer people cooking with clean fuels'],
  internet: ['more internet users', 'fewer internet users'],
};

/** Where Uganda does best and worst against a group (only indicators with a "better" direction). */
export function standouts(groupId: string) {
  const scored = indicators
    .filter((i) => i.better)
    .map((i) => ({ i, r: groupRanking(i, groupId) }))
    .filter((x): x is { i: WorldIndicator; r: NonNullable<ReturnType<typeof groupRanking>> } => !!x.r && !x.r.stale && x.r.of >= 4);
  const score = (x: (typeof scored)[number]) => (x.r.pos - 1) / (x.r.of - 1); // 0 best, 1 worst
  return {
    leads: scored.filter((x) => score(x) <= 0.2).sort((a, b) => score(a) - score(b)).slice(0, 4),
    lags: scored.filter((x) => score(x) >= 0.8).sort((a, b) => score(b) - score(a)).slice(0, 4),
  };
}

// ---- series for charts --------------------------------------------------------------
const africaNames = (worldJson as unknown as { africaNames: Record<string, string> }).africaNames;

/** Up to 5 quantile classes over Africa's values, rounded to the measure's digits (legend-friendly). */
function quantileBreaks(values: number[], digits: number) {
  const v = [...values].sort((a, b) => a - b);
  if (v.length < 6) return [];
  const round = (x: number) => {
    const mag = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(x) || 1)) - 1);
    return digits === 0 || Math.abs(x) >= 100 ? Math.round(x / mag) * mag : Number(x.toFixed(digits));
  };
  const cuts = [1, 2, 3, 4].map((k) => round(v[Math.floor((k * v.length) / 5)]));
  return [...new Set(cuts)].sort((a, b) => a - b);
}

/** The Map tab: every African country's latest actual value, Uganda outlined. */
export function africaMap(i: WorldIndicator) {
  const africa = (i as WorldIndicator & { africa: Record<string, [number, number]> }).africa ?? {};
  const values = Object.fromEntries(Object.keys(africaNames).map((iso) => [iso, africa[iso]?.[1] ?? null]));
  const nums = Object.values(values).filter((v): v is number => v != null);
  return {
    geo: '/geo/africa.json',
    values,
    names: africaNames,
    breaks: quantileBreaks(nums, i.digits),
    highlight: 'UGA',
    reference: { label: 'Uganda', value: africa.UGA?.[1] ?? null },
  };
}

/** Chart-ready data for one indicator: years, Uganda, and a pool of every other place by name. */
export function chartData(i: WorldIndicator) {
  const round = (v: number | null) => (v == null ? null : Number(v.toFixed(Math.max(i.digits, 2))));
  const pool = Object.fromEntries(
    places.filter((p) => p.code !== 'UGA').map((p) => [p.name, (i.values[p.code] ?? i.years.map(() => null)).map(round)]),
  );
  return {
    id: i.id,
    label: i.label,
    note: i.note,
    unit: chartUnit(i),
    digits: i.digits,
    x: i.years,
    uganda: (i.values.UGA ?? []).map(round),
    pool,
    projFrom: i.projFrom,
    source: sourceOf(i),
    whoRegion: i.source === 'who',
    mapView: africaMap(i),
  };
}
