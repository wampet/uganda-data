// Plain-language facts and derived views over the CPI data. Every sentence the
// site says about prices is computed here from the numbers, never hand-typed.
import { cpi, fmtPct, fmtUgx, monthLabel, type Series } from './data';

/** Annual rates need 12 months of history, so they start one year in. */
export const YOY_START = 12;
export const months = cpi.months;
export const latestMonth = months[months.length - 1];
export const yoyMonths = months.slice(YOY_START);

export const s = (id: string) => cpi.series[id];
export const last = (arr: (number | null)[]) => arr[arr.length - 1];
export const yoyOf = (id: string) => s(id).yoy.slice(YOY_START);

const byGroup = (g: string) => Object.entries(cpi.series).filter(([, v]) => v.group === g);

// Everyday names for UBOS's COICOP spending divisions (keyed by division code).
const DIVISION_NAMES: Record<string, string> = {
  '01': 'Food & soft drinks',
  '02': 'Alcohol & tobacco',
  '03': 'Clothes & shoes',
  '04': 'Rent, water & power',
  '05': 'Furniture & household',
  '06': 'Health',
  '07': 'Transport',
  '08': 'Phones & internet',
  '09': 'Recreation & culture',
  '10': 'School fees & education',
  '11': 'Eating out & hotels',
  '12': 'Insurance & finance',
  '13': 'Personal care & other',
};

export const divisions = byGroup('division')
  .map(([id, v]) => ({ id, name: DIVISION_NAMES[v.code ?? ''] ?? v.name, official: v.name, weight: v.weight ?? 0, yoy: last(v.yoy) }))
  .sort((a, b) => (b.yoy ?? 0) - (a.yoy ?? 0));

const TOWN_NAMES: Record<string, string> = { Fortportal: 'Fort Portal' };

export const centres = byGroup('centre')
  .map(([id, v]) => ({ id, name: TOWN_NAMES[v.name] ?? v.name, weight: v.weight ?? 0, yoy: last(v.yoy) }))
  .sort((a, b) => (b.yoy ?? 0) - (a.yoy ?? 0));

const items = byGroup('item').filter(([, v]) => !v.outlier && last(v.yoy) != null);
const sortedItems = [...items].sort(([, a], [, b]) => last(b.yoy)! - last(a.yoy)!);
export const risers = sortedItems.slice(0, 10).map(([id, v]) => ({ id, name: v.name, yoy: last(v.yoy)! }));
export const fallers = sortedItems.slice(-10).reverse().map(([id, v]) => ({ id, name: v.name, yoy: last(v.yoy)! }));

export const headline = last(s('headline').yoy)!;
export const headlinePrev = s('headline').yoy[s('headline').yoy.length - 2]!;
export const core = last(s('core').yoy)!;

export const peak = (() => {
  const yoy = s('headline').yoy;
  let best = YOY_START;
  for (let i = YOY_START; i < yoy.length; i++) if ((yoy[i] ?? -Infinity) > (yoy[best] ?? -Infinity)) best = i;
  return { value: yoy[best]!, month: months[best] };
})();

/** What an amount spent `monthsAgo` months back costs at today's prices. */
export function costToday(amount: number, monthsAgo: number, series: Series = s('headline')) {
  const idx = series.index;
  const then = idx[idx.length - 1 - monthsAgo];
  const now = last(idx);
  return then && now ? amount * (now / then) : null;
}

/** Headline index levels for the in-page shilling calculator (tiny). */
export const headlineIndex = { months, index: s('headline').index };

export function facts() {
  const firstMonth = months[0];
  const sinceStart = costToday(10_000, months.length - 1)!;
  const topCentre = centres[0];
  const lowCentre = centres[centres.length - 1];
  const topDiv = divisions[0];
  const fuel = s('fuel');
  const r = risers[0];
  const f = fallers[0];
  const direction = headline > headlinePrev ? 'up from' : headline < headlinePrev ? 'down from' : 'unchanged from';

  return [
    `Prices across Uganda were ${fmtPct(headline)} higher in ${monthLabel(latestMonth, true)} than a year earlier (${direction} ${fmtPct(headlinePrev)} the month before).`,
    `Shopping that cost UGX 10,000 in ${monthLabel(firstMonth, true)} costs ${fmtUgx(sinceStart)} today.`,
    `The fastest price rises since 2018 came in ${monthLabel(peak.month, true)}, when inflation hit ${fmtPct(peak.value)}.`,
    `${r.name} costs ${fmtPct(r.yoy, 0)} more than a year ago; ${f.name} costs ${fmtPct(Math.abs(f.yoy), 0)} less.`,
    `Liquid fuels (petrol, diesel, paraffin) are ${fmtPct(last(fuel.yoy), 0)} dearer than a year ago.`,
    `Of the ten towns UBOS tracks, prices rose fastest in ${topCentre.name} (${fmtPct(topCentre.yoy)}) and slowest in ${lowCentre.name} (${fmtPct(lowCentre.yoy)}).`,
    `${topDiv.name} is the fastest-rising spending category at ${fmtPct(topDiv.yoy)} a year.`,
  ];
}
