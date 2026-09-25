// Census 2024 district data: names, rankings, map classes and plain-language
// facts. All computed at build time from the pipeline's census.json.
import censusJson from '../data/census.json';
import livestockJson from '../data/livestock.json';

export interface Indicator {
  id: string;
  label: string;
  question: string;
  group: string;
  unit: string;
  better: 'higher' | 'lower' | null;
}
type Values = Record<string, number | null>;
export interface District { code: string; name: string; slug: string; subregion: string; subregion_code: string; area_km2: number; values: Values }
export interface Subregion { code: string; name: string; districts: string[]; values: Values }

const raw = censusJson as unknown as {
  source: { title: string; url: string };
  notes: string[];
  indicators: Indicator[];
  national: Values;
  subregions: Subregion[];
  districts: Omit<District, 'slug'>[];
};

/** "GULU CITY" -> "Gulu City"; keeps short all-caps words like "FORT" sensible. */
export function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[\s\-(/])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Livestock Census 2021 district indicators (pipeline: ubos/livestock.py). Kept
// separate from `indicators` so census-only consumers (the data API's "Census
// 2024 by district" table, other pages) are unaffected; the district map and
// district pages use `mapIndicators`, which carries both.
const livestock = livestockJson as unknown as {
  sources: { title: string; url: string }[];
  indicators: Indicator[];
  districts: Record<string, Values>;
  subregions: Record<string, Values>;
  national: Values;
  notes: string[];
};

export const source = raw.source;
export const notes = raw.notes;
export const indicators = raw.indicators;
export const farmingIndicators = livestock.indicators;
export const farmingSources = livestock.sources;
export const farmingNotes = livestock.notes;
export const mapIndicators = [...indicators, ...farmingIndicators];
export const indicatorById = new Map(mapIndicators.map((i) => [i.id, i]));
const farmingIds = new Set(farmingIndicators.map((i) => i.id));
/** The UBOS source behind an indicator (census portal or Livestock Census). */
export const sourceFor = (id: string) =>
  farmingIds.has(id) ? { title: 'National Livestock Census 2021', url: livestock.sources[0]?.url ?? source.url } : source;
export const national: Values = { ...raw.national, ...livestock.national };
export const districts: District[] = raw.districts.map((d) => ({
  ...d,
  name: titleCase(d.name),
  slug: slugify(d.name),
  values: { ...d.values, ...(livestock.districts[d.code] ?? {}) },
}));
export const subregions: Subregion[] = raw.subregions.map((s) => ({
  ...s,
  name: titleCase(s.name),
  values: { ...s.values, ...(livestock.subregions[s.code] ?? {}) },
}));
export const subregionByCode = new Map(subregions.map((s) => [s.code, s]));
export const districtByCode = new Map(districts.map((d) => [d.code, d]));

export const groups = [...new Set(mapIndicators.map((i) => i.group))];

// ---- formatting ----------------------------------------------------------
export function digitsFor(ind: Indicator) {
  return ind.id === 'population' || ind.id === 'density' || ind.unit === 'kg' ? 0 : 1;
}
export function unitSuffix(ind: Indicator) {
  return ind.unit === '%' ? '%' : '';
}
export function fmtValue(ind: Indicator, v: number | null | undefined) {
  if (v == null) return '–';
  if (ind.id === 'population') return Math.round(v).toLocaleString('en-UG');
  if (ind.id === 'density') return `${Math.round(v).toLocaleString('en-UG')} per km²`;
  if (ind.id === 'hh_size') return `${v.toFixed(1)} people`;
  if (ind.unit === 'kg') return `${Math.round(v).toLocaleString('en-UG')} kg`;
  if (ind.unit === 'per 100 people') return `${v.toFixed(1)} per 100 people`;
  return `${v.toFixed(1)}%`;
}

// ---- rankings & classes --------------------------------------------------
export function ranked(id: string) {
  return districts
    .filter((d) => d.values[id] != null)
    .sort((a, b) => b.values[id]! - a.values[id]!);
}

export function rankOf(id: string, code: string) {
  const list = ranked(id);
  return { rank: list.findIndex((d) => d.code === code) + 1, of: list.length };
}

/** Round a break to a number people can read on a legend (2 significant digits, whole numbers from 10 up). */
function nice(v: number) {
  if (v === 0) return 0;
  const mag = 10 ** Math.floor(Math.log10(Math.abs(v)));
  const step = mag >= 100 ? mag / 10 : mag >= 10 ? 1 : mag / 10;
  return Number((Math.round(v / step) * step).toPrecision(12)); // drop float noise (4.1000000000000005)
}

/**
 * Natural breaks (Jenks / optimal 1-D k-means) into `k` classes. Unlike
 * quantiles, classes follow gaps in the data, so outlier regions (e.g.
 * Karamoja on schooling) get their own colour instead of being lumped in.
 */
function jenks(sorted: number[], k: number): number[] {
  const n = sorted.length;
  if (n <= k) return sorted.slice(1);
  const pre = [0], pre2 = [0];
  for (const v of sorted) {
    pre.push(pre[pre.length - 1] + v);
    pre2.push(pre2[pre2.length - 1] + v * v);
  }
  // Sum of squared deviations of sorted[i..j] (inclusive).
  const ssd = (i: number, j: number) => {
    const s = pre[j + 1] - pre[i], s2 = pre2[j + 1] - pre2[i], m = j - i + 1;
    return s2 - (s * s) / m;
  };
  const cost = Array.from({ length: k }, () => new Array(n).fill(Infinity));
  const cut = Array.from({ length: k }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) cost[0][j] = ssd(0, j);
  for (let c = 1; c < k; c++) {
    for (let j = c; j < n; j++) {
      for (let i = c; i <= j; i++) {
        const v = cost[c - 1][i - 1] + ssd(i, j);
        if (v < cost[c][j]) {
          cost[c][j] = v;
          cut[c][j] = i;
        }
      }
    }
  }
  const starts: number[] = [];
  for (let c = k - 1, j = n - 1; c > 0; c--) {
    const i = cut[c][j];
    starts.unshift(i);
    j = i - 1;
  }
  // Break halfway between the last value of one class and the first of the next.
  return starts.map((i) => (sorted[i - 1] + sorted[i]) / 2);
}

/** 5-class natural breaks, rounded for the legend and de-duplicated. */
export function breaksFor(id: string, k = 5) {
  const vals = ranked(id).map((d) => d.values[id]!).reverse();
  const cuts = jenks(vals, k).map(nice);
  return [...new Set(cuts)].sort((a, b) => a - b);
}

export function mapValues(id: string): Record<string, number | null> {
  return Object.fromEntries(districts.map((d) => [d.code, d.values[id]]));
}
export const mapNames = Object.fromEntries(districts.map((d) => [d.code, d.name]));
export const mapSlugs = Object.fromEntries(districts.map((d) => [d.code, d.slug]));

// ---- facts ---------------------------------------------------------------
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Headline facts for one indicator across districts. */
export function indicatorFacts(id: string) {
  const ind = indicatorById.get(id)!;
  const list = ranked(id);
  const top = list[0];
  const bottom = list[list.length - 1];
  const nat = national[id];
  const facts = [
    `Highest: ${top.name} (${fmtValue(ind, top.values[id])}). Lowest: ${bottom.name} (${fmtValue(ind, bottom.values[id])}).`,
  ];
  if (nat != null && (ind.unit === '%' || ind.unit === 'per 100 people')) {
    const above = list.filter((d) => d.values[id]! > nat).length;
    facts.push(`${above} of ${list.length} districts are above the national figure.`);
  }
  return facts;
}

/** A plain-language summary of where a district stands out. */
export function districtHighlights(d: District) {
  const scored = indicators
    .filter((i) => i.better && i.unit === '%' && d.values[i.id] != null && national[i.id])
    .map((i) => {
      const v = d.values[i.id]!;
      const n = national[i.id]!;
      // Positive = better than Uganda, measured in percentage points.
      const diff = (v - n) * (i.better === 'higher' ? 1 : -1);
      return { i, v, n, diff };
    })
    .sort((a, b) => b.diff - a.diff);

  const say = (x: (typeof scored)[number]) =>
    `${lc(x.i.label)}: ${fmtValue(x.i, x.v)} vs ${fmtValue(x.i, x.n)} nationally`;
  return {
    strengths: scored.filter((x) => x.diff >= 3).slice(0, 3).map(say),
    challenges: scored.filter((x) => x.diff <= -3).reverse().slice(0, 3).map(say),
  };
}

/** Neighbouring districts in the same sub-region, largest first. */
export function siblings(d: District) {
  return districts
    .filter((x) => x.subregion_code === d.subregion_code && x.code !== d.code)
    .sort((a, b) => (b.values.population ?? 0) - (a.values.population ?? 0));
}
