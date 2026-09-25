// Census 2024 below the district: sub-county (city division) profiles for each
// district page. Built by pipeline/ubos/subcounties.py; one small slice per page.
import subJson from '../data/subcounties.json';
import { fmtValue, indicators, type Indicator } from './census';

type Values = Record<string, number | null>;
export interface SubCounty { code: string; name: string; county: string; area_km2: number; values: Values }

const raw = subJson as unknown as {
  source: { title: string; url: string };
  notes: string[];
  districts: Record<string, SubCounty[]>;
};

export const subSource = raw.source;
export const subcountiesOf = (districtCode: string) => raw.districts[districtCode] ?? [];
export const subNotesFor = (districtName: string) =>
  raw.notes.filter((n) => n.toLowerCase().startsWith(`${districtName.toLowerCase()}:`));

// Questions worth asking at sub-county level (population-type and size rows excluded).
const SKIP = new Set(['population', 'children', 'hh_size']);
export const subIndicators: Indicator[] = indicators.filter((i) => !SKIP.has(i.id));

/** Round to a legend-friendly number. */
function nice(v: number) {
  if (v === 0) return 0;
  const mag = 10 ** Math.floor(Math.log10(Math.abs(v)));
  const step = mag >= 10 ? mag / 10 : mag / 10;
  return Number((Math.round(v / step) * step).toPrecision(12));
}

/** Up to 4 quantile classes: a district has only 2–44 sub-counties, too few for natural breaks. */
export function subBreaks(values: (number | null)[]) {
  const v = values.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (v.length < 3) return [];
  const k = Math.min(4, v.length - 1);
  const cuts = Array.from({ length: k - 1 }, (_, i) => nice(v[Math.floor(((i + 1) * v.length) / k)]));
  return [...new Set(cuts)].sort((a, b) => a - b);
}

/** Everything the district page needs to switch questions in the browser. */
export function subPayload(districtCode: string, districtValues: Values) {
  const rows = subcountiesOf(districtCode);
  return {
    names: Object.fromEntries(rows.map((r) => [r.code, r.name])),
    rows: rows.map((r) => ({ code: r.code, name: r.name, county: r.county, pop: r.values.population })),
    indicators: subIndicators.map((i) => {
      const values = Object.fromEntries(rows.map((r) => [r.code, r.values[i.id] ?? null]));
      const ranked = rows.filter((r) => r.values[i.id] != null).sort((a, b) => b.values[i.id]! - a.values[i.id]!);
      const facts =
        ranked.length >= 2
          ? `Highest: ${ranked[0].name} (${fmtValue(i, ranked[0].values[i.id])}). Lowest: ${ranked[ranked.length - 1].name} (${fmtValue(i, ranked[ranked.length - 1].values[i.id])}).`
          : '';
      return {
        id: i.id,
        label: i.label,
        question: i.question,
        suffix: i.unit === '%' ? '%' : '',
        digits: i.id === 'density' ? 0 : 1,
        values,
        texts: Object.fromEntries(rows.map((r) => [r.code, fmtValue(i, r.values[i.id])])),
        breaks: subBreaks(Object.values(values)),
        district: districtValues[i.id] ?? null,
        districtText: fmtValue(i, districtValues[i.id]),
        facts,
      };
    }),
  };
}
