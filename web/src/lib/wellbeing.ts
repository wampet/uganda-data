// UBOS's National Standard Indicators: the scorecard for graduating to
// lower-middle-income status (build time).
import wbJson from '../data/wellbeing.json';

interface Src { title: string; url: string; updated: string | null }
export interface Indicator {
  criterion: 'income' | 'assets' | 'vulnerability';
  name: string; official: string; unit: string; better: 'higher' | 'lower' | null; periodicity: string;
  points: [string, number][];
}

const raw = wbJson as unknown as {
  sources: Record<'level1' | 'level2', Src>;
  years: string[];
  indicators: Indicator[];
  gdp_per_person: { years: string[]; values: (number | null)[] };
  paved_roads: { years: string[]; values: (number | null)[] };
  level2_years: string[];
  multidimensional_poverty: { year: string; national: number; regions: Record<string, number> };
  electricity: { year: string; sources: Record<string, number>; total: number };
  women_in_parliament: (number | null)[];
  tax_to_gdp: (number | null)[];
  health_insurance: (number | null)[];
  notes: string[];
};

export const { sources, years, indicators, notes } = raw;
export const gdpPerPerson = raw.gdp_per_person;
export const pavedRoads = raw.paved_roads;
export const mpi = raw.multidimensional_poverty;
export const electricity = raw.electricity;
const L2 = raw.level2_years;
const lastKnown = (vals: (number | null)[]) => {
  for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return { year: L2[i], value: vals[i]! };
  throw new Error('wellbeing: no value');
};
export const parliament = lastKnown(raw.women_in_parliament);
export const tax = { first: { year: L2[0], value: raw.tax_to_gdp[0]! }, last: lastKnown(raw.tax_to_gdp) };
export const insurance = { first: { year: L2[0], value: raw.health_insurance[0]! }, last: lastKnown(raw.health_insurance) };

export const CRITERIA = [
  { id: 'income', title: 'Income', blurb: 'How much the economy produces per person, and how it is shared.' },
  { id: 'assets', title: 'Human assets', blurb: 'Health, schooling and nutrition.' },
  { id: 'vulnerability', title: 'Economic vulnerability', blurb: 'Exports, roads, power and water: how exposed the economy is to shocks.' },
] as const;

export const byCriterion = (id: string) => indicators.filter((i) => i.criterion === id);

const first = (i: Indicator) => i.points[0];
const latest = (i: Indicator) => i.points[i.points.length - 1];
export { first, latest };

/** 'better' | 'worse' | 'same' | null (null when there is no clear better direction or only one value). */
export function verdict(i: Indicator) {
  if (!i.better || i.points.length < 2) return null;
  const d = latest(i)[1] - first(i)[1];
  if (Math.abs(d) < 1e-9) return 'same';
  return (d > 0) === (i.better === 'higher') ? 'better' : 'worse';
}

export function fmt(i: Indicator, v: number) {
  if (i.unit === 'US$') return `US$${Math.round(v).toLocaleString('en-UG')}`;
  if (i.unit === 'km') return `${Math.round(v).toLocaleString('en-UG')} km`;
  if (i.unit === '%') return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
  if (i.unit === 'years') return `${v} years`;
  return v < 1 ? v.toFixed(3) : Number.isInteger(v) ? v.toLocaleString('en-UG') : v.toFixed(1);
}

const find = (name: string) => indicators.find((i) => i.name === name)!;
export const gdp = find('GDP per person');
export const roads = find('Paved national roads');
export const incomePoverty = find('People below the national poverty line');

const times = (r: number) => (r > 1.8 && r < 2.2 ? 'about twice' : `${r.toFixed(1)} times`);

export function facts() {
  const u5 = find('Child deaths before age 5 (per 1,000 births)');
  const tfr = find('Children per woman');
  const regions = Object.entries(mpi.regions).sort((a, b) => b[1] - a[1]);
  const [hi, lo] = [regions[0], regions[regions.length - 1]];
  const solar = (electricity.sources['Solar Kit'] ?? 0) + (electricity.sources['Solar system'] ?? 0);
  return [
    `GDP per person rose from ${fmt(gdp, first(gdp)[1])} in ${first(gdp)[0]} to ${fmt(gdp, latest(gdp)[1])} in ${latest(gdp)[0]}, on UBOS’s scorecard for becoming a lower-middle-income country.`,
    `${Math.round(mpi.national)}% of Ugandans were poor in several ways at once (schooling, health, living conditions) in ${mpi.year}, ${times(mpi.national / latest(incomePoverty)[1])} the ${Math.round(latest(incomePoverty)[1])}% who were poor by income alone.`,
    `Poverty in all its forms ranged from ${Math.round(lo[1])}% in the ${lo[0]} region to ${Math.round(hi[1])}% in the ${hi[0]} region (${mpi.year}).`,
    `Uganda’s paved national roads grew from ${fmt(roads, first(roads)[1])} in ${first(roads)[0]} to ${fmt(roads, latest(roads)[1])} in ${latest(roads)[0]}.`,
    `${electricity.total}% of households had some electricity in ${electricity.year}, but mostly from solar: ${solar}% used solar, against ${electricity.sources['Main Grid']}% on the national grid.`,
    `Women held ${parliament.value}% of seats in Parliament in ${parliament.year}.`,
    `Tax collected was ${tax.last.value}% of GDP in ${tax.last.year}, up from ${tax.first.value}% in ${tax.first.year}.`,
    `Children per woman fell from ${first(tfr)[1]} to ${latest(tfr)[1]}, and child deaths before age 5 from ${first(u5)[1]} to ${latest(u5)[1]} per 1,000 births, between the scorecard’s first two surveys.`,
  ];
}
