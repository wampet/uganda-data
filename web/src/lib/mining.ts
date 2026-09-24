// Recorded mineral production, 2019-2023 (build time).
import miningJson from '../data/mining.json';
import * as T from './trade';

interface Src { title: string; url: string; updated: string | null }
interface Mineral { group: string | null; name: string; values: (number | null)[] }

const raw = miningJson as unknown as {
  sources: Record<'value' | 'quantity', Src>;
  years: string[];
  value_ugx_bn: Mineral[];
  value_total_ugx_bn: number[];
  quantity_tonnes: Mineral[];
  quantity_total_tonnes: number[];
  notes: string[];
};

// UBOS spellings and labels -> everyday names.
const NAMES: Record<string, string> = {
  Pozollana: 'Pozzolana (for cement)',
  Limestone: 'Limestone (for cement)',
  'Coltan (30% Purity)': 'Coltan',
  'Tin (75% Purity)': 'Tin',
  'Beryl (1% Beryllium)': 'Beryl',
  'Beryllium (1%)': 'Beryl',
  'Synthetic Aggregate': 'Syenitic aggregate',
  'Syenitic Aggregate': 'Syenitic aggregate',
  'Iron Ore': 'Iron ore',
  'Volcanic Ash': 'Volcanic ash',
  'Dimension Stone': 'Dimension stone',
};
const tidy = (m: Mineral) => ({ ...m, name: NAMES[m.name] ?? m.name });

export const { sources, years, notes } = raw;
export const value = raw.value_ugx_bn.map(tidy);
export const valueTotal = raw.value_total_ugx_bn;
export const quantity = raw.quantity_tonnes.map(tidy);
const L = years.length - 1;
export const year = years[L];
export const y0 = years[0];

/** Latest year's minerals by value, largest first (only those with output). */
export const latestByValue = value
  .map((m) => ({ name: m.name, value: m.values[L] ?? 0 }))
  .filter((m) => m.value > 0)
  .sort((a, b) => b.value - a.value);

const get = (list: typeof value, name: string) => list.find((m) => m.name === name)!;
export const iron = get(value, 'Iron ore');
export const ironQty = get(quantity, 'Iron ore');
export const limestone = get(value, 'Limestone (for cement)');
export const gold = get(value, 'Gold');
export const goldQty = get(quantity, 'Gold');

/** Series for the chart: the biggest minerals by latest value, the rest summed as "Other minerals". */
export function topSeries(k = 4) {
  const top = latestByValue.slice(0, k).map((m) => m.name);
  const series = top.map((n) => ({ name: n, data: get(value, n).values.map((v) => v ?? 0) }));
  const other = years.map((_, i) => valueTotal[i] - series.reduce((s, x) => s + x.data[i], 0));
  return [...series, { name: 'Other minerals', data: other }];
}

// Gold: recorded mine output vs exports in the same year (trade data, US$ million).
const ti = T.annual.years.map(String).indexOf(year);
export const goldExportsUsdBn = ti >= 0 ? T.annual.gold_exports[ti] / 1000 : null;

const bn = (v: number) => `UGX ${v >= 10 ? Math.round(v) : v.toFixed(1)} billion`;
export { bn };

export function facts() {
  const share = (100 * (iron.values[L] ?? 0)) / valueTotal[L];
  const ironFirst = iron.values.findIndex((v) => v != null && v > 0);
  return [
    `Recorded mineral production was worth ${bn(valueTotal[L])} in ${year}, up from ${bn(valueTotal[0])} in ${y0}.`,
    `Iron ore went from nothing recorded before ${years[ironFirst]} to ${Math.round(share)}% of the value of all minerals produced in ${year}.`,
    `Limestone, used to make cement, was worth ${bn(limestone.values[L] ?? 0)} in ${year}.`,
    ...(goldExportsUsdBn != null
      ? [`Mines recorded gold worth only ${bn(gold.values[L] ?? 0)} in ${year}, yet Uganda exported US$${goldExportsUsdBn.toFixed(1)} billion of gold that year. Most exported gold is not recorded as mined in Uganda.`]
      : []),
  ];
}
