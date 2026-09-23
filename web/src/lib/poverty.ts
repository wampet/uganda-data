// Poverty and living standards (build time).
import povJson from '../data/poverty.json';

interface Src { title: string; url: string; updated: string | null }
interface Row { name: string; values: (number | null)[]; group?: string | null }

const raw = povJson as unknown as {
  sources: Record<'headcount' | 'long' | 'absolute' | 'dynamics' | 'shoes' | 'blanket' | 'meals', Src>;
  national: { years: string[]; rate: number[] };
  poor_millions: { years: string[]; values: number[] };
  by_region: { years: string[]; rows: Row[] };
  by_residence: { years: string[]; rows: Row[] };
  dynamics: { columns: string[]; rows: Row[]; period: string };
  shoes: { years: string[]; rows: Row[] };
  blanket: { years: string[]; rows: Row[] };
  one_meal_2023_24: { label: string; '0-5 years': number; '6-17 years': number; '18+ years': number }[];
};

export const sources = raw.sources;
/** The national series joins two UBOS tables (checked to agree where they overlap). */
export const nationalSource = {
  title: `Poverty tables 1999/00–2019/20 and 2012/13–2023/24 (UNHS)`,
  url: raw.sources.headcount.url,
};
export const national = raw.national;
export const poorMillions = raw.poor_millions;
export const byRegion = raw.by_region;
export const byResidence = raw.by_residence;
export const dynamics = raw.dynamics;
export const shoes = raw.shoes;
export const blanket = raw.blanket;
export const meals = raw.one_meal_2023_24;

const last = <T,>(a: T[]) => a[a.length - 1];
export const latestYear = last(national.years);
export const latestRate = last(national.rate);
export const firstYear = national.years[0];
export const firstRate = national.rate[0];
export const peakRate = Math.max(...national.rate);
export const peakYear = national.years[national.rate.indexOf(peakRate)];
export const latestPoor = last(poorMillions.values);

/** Latest value per region, highest first. */
export const regionsLatest = byRegion.rows
  .map((r) => ({ name: r.name, value: last(r.values)!, first: r.values[0]! }))
  .sort((a, b) => b.value - a.value);

export const rowOf = (t: { rows: Row[] }, name: string, group?: string) =>
  t.rows.find((r) => r.name === name && (!group || r.group === group))!;

export function facts() {
  const north = regionsLatest.find((r) => r.name === 'Northern')!;
  const kla = regionsLatest.find((r) => r.name === 'Kampala')!;
  const rural = last(rowOf(byResidence, 'Rural').values)!;
  const urban = last(rowOf(byResidence, 'Urban').values)!;
  const shoesUg = last(rowOf(shoes, 'Uganda').values)!;
  const blanketUg = last(rowOf(blanket, 'Uganda').values)!;
  const mealNorth = meals.find((m) => m.label === 'Northern');
  const dynNorth = rowOf(dynamics, 'Northern', 'Region');
  return [
    `About ${Math.round(latestRate)}% of Ugandans (${latestPoor} million people) lived below the poverty line in ${latestYear}, down from ${firstRate}% in ${firstYear}.`,
    `Northern Uganda is the poorest region: ${north.value}% of people are poor, down from ${north.first}% in ${byRegion.years[0]}. In Kampala it is ${kla.value}%.`,
    `Poverty is about ${Math.round(rural / urban)} times as common in rural areas (${rural}%) as in towns (${urban}%).`,
    `Between ${dynamics.period.replace(' to ', ' and ')}, ${dynNorth.values[1]}% of households in the North climbed out of poverty, while ${dynNorth.values[2]}% fell into it.`,
    `By UBOS’s measure, ${shoesUg}% of households have at least one pair of shoes for their members, and ${blanketUg}% have blankets.`,
    ...(mealNorth ? [`In the North, ${mealNorth['6-17 years']}% of children aged 6–17 eat only one meal a day.`] : []),
  ];
}
