// Government revenue and spending (build time). Values are million UGX.
import govJson from '../data/government.json';
import { census2024 } from './population';

interface Src { title: string; url: string; updated: string | null }

const raw = govJson as unknown as {
  sources: Record<'functions' | 'spending' | 'revenue' | 'tins', Src>;
  years: string[];
  functions: { name: string; values: number[] }[];
  total_spending: number[];
  spending_split: Record<string, number[]>;
  revenue: Record<string, number[]>;
  total_revenue: number[];
  tins_individuals: { year: string; issued: number }[];
  notes: string[];
};

export const { sources, years, notes } = raw;
export const tins = raw.tins_individuals;
const L = years.length - 1;
export const year = years[L];
export const prevYear = years[L - 1];

export const spending = raw.total_spending[L];
export const revenue = raw.total_revenue[L];
export const gap = spending - revenue;
export const perPerson = (spending * 1e6) / census2024.total;

export const trillion = (millions: number, d = 1) => `UGX ${(millions / 1e6).toFixed(d)} trillion`;

// Everyday names for the international (COFOG) spending headings.
const PLAIN: Record<string, string> = {
  'General Public Services': 'Running government & debt interest',
  'Economic Affairs': 'Roads, energy, farming & business',
  'Public Order and Safety': 'Police, courts & prisons',
  'Housing and Community amenities': 'Housing, water & community',
  'Recreation, Culture and Religion': 'Culture, sport & religion',
  'Environmental Protection': 'Environment',
};
export const plain = (n: string) => PLAIN[n] ?? n;

/** Latest year by function, largest first, with "out of every UGX 100,000". */
export const byFunction = raw.functions
  .map((f) => ({
    name: plain(f.name),
    official: f.name,
    value: f.values[L],
    prev: f.values[L - 1],
    per100k: Math.round((100_000 * f.values[L]) / spending / 100) * 100,
  }))
  .sort((a, b) => b.value - a.value);

export const split = Object.entries(raw.spending_split).map(([k, v]) => ({ name: k, value: v[L], share: (100 * v[L]) / spending }));
export const revenueParts = Object.entries(raw.revenue).map(([k, v]) => ({ name: k.replace(' revenue', ''), value: v[L] }));

export function facts() {
  const edu = byFunction.find((f) => f.official === 'Education')!;
  const health = byFunction.find((f) => f.official === 'Health')!;
  const gps = byFunction.find((f) => f.official === 'General Public Services')!;
  const t0 = tins[0], t1 = tins[tins.length - 1];
  return [
    `Government spent ${trillion(spending)} in ${year} and collected ${trillion(revenue)}, leaving a gap of ${trillion(gap)}.`,
    `That is about UGX ${(Math.round(perPerson / 1000) * 1000).toLocaleString('en-UG')} of spending for every Ugandan.`,
    `Out of every UGX 100,000 spent, about UGX ${gps.per100k.toLocaleString('en-UG')} went on running government, including interest on public debt.`,
    `Education received UGX ${edu.per100k.toLocaleString('en-UG')} and health UGX ${health.per100k.toLocaleString('en-UG')} out of every UGX 100,000.`,
    `Local governments spent ${Math.round(split.find((s) => s.name.startsWith('Local'))!.share)}% of the total; the rest was spent centrally.`,
    `${t1.issued.toLocaleString('en-UG')} individuals registered for a tax number (TIN) in ${t1.year}, up from ${t0.issued.toLocaleString('en-UG')} in ${t0.year}.`,
  ];
}
