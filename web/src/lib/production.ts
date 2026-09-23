// Production section: energy, industry, transport, tourism, mobile money, farming.
// Build-time helpers over the pipeline's production.json. Every sentence the
// pages say is computed here from the numbers.
import prodJson from '../data/production.json';

type Vals = (number | null)[];
export interface Packed { years: string[]; series: Record<string, Vals> }
interface Src { title: string; url: string; updated: string | null }
export interface Product extends Packed { name: string; unit: string; latest_year: string; local_share: number | null }

const raw = prodJson as unknown as {
  energy: { capacity: Packed; customers: Packed; fuel_prices: Packed; fuel_sales: Packed; notes: string[] };
  industry: {
    products: Product[];
    index: Packed;
    sector_growth: { year: string; total: number; sectors: { name: string; growth: number | null }[] };
  };
  transport: { roads: Packed; registrations: Packed; entebbe: Packed; ferries: Packed };
  tourism: { arrivals: Packed; visitors: Packed; parks: { years: string[]; rows: { name: string; values: Vals }[] }; notes: string[] };
  communication: { mobile_money: Packed; notes: string[] };
  agriculture: {
    livestock: Packed; fish: Packed; milk: Packed;
    honey: { total_kg: number; regions: { region: string; kg: number }[] }; notes: string[];
  };
  sources: Record<string, Src[]>;
};

export const energy = raw.energy;
export const industry = raw.industry;
export const transport = raw.transport;
export const tourism = raw.tourism;
export const communication = raw.communication;
export const agriculture = raw.agriculture;
export const sourcesFor = (section: string) => raw.sources[section] ?? [];

// ---- small helpers --------------------------------------------------------
export const years = (p: Packed) => p.years.map(Number);
export const s = (p: Packed, name: string) => p.series[name];
/** Last non-null value and its year. */
export function latest(p: Packed, name: string) {
  const v = p.series[name];
  for (let i = v.length - 1; i >= 0; i--) if (v[i] != null) return { year: p.years[i], value: v[i]! };
  return { year: '', value: 0 };
}
export function valueIn(p: Packed, name: string, year: string) {
  const i = p.years.indexOf(year);
  return i < 0 ? null : p.series[name][i];
}
export const pctChange = (from: number, to: number) => ((to - from) / from) * 100;
export const fmtN = (v: number, d = 0) => v.toLocaleString('en-UG', { maximumFractionDigits: d, minimumFractionDigits: d });
export const fmtM = (v: number, d = 1) => `${(v / 1e6).toFixed(d)} million`;
const signed = (v: number, d = 0) => `${v > 0 ? '+' : ''}${v.toFixed(d)}%`;
/** Index of the largest / smallest non-null value. */
const argmax = (v: Vals) => v.reduce<number>((best, x, i) => (x != null && (v[best] == null || x > v[best]!) ? i : best), 0);
const argmin = (v: Vals) => v.reduce<number>((best, x, i) => (x != null && (v[best] == null || x < v[best]!) ? i : best), 0);

/** A line/bar chart series list from a packed table, in a fixed colour order. */
export function lines(p: Packed, names: string[], opts: { dashed?: string[]; points?: boolean } = {}) {
  return names.map((name, i) => ({
    name,
    data: p.series[name],
    color: i + 1,
    points: opts.points,
    dashed: opts.dashed?.includes(name),
  }));
}

// ---- facts ------------------------------------------------------------------
export function energyFacts() {
  const cap = energy.capacity;
  const last = cap.years.length - 1;
  const hydroNow = cap.series.Hydro[last]!;
  const hydroPrev = cap.series.Hydro[last - 1]!;
  const totalNow = Object.values(cap.series).reduce((a, v) => a + (v[last] ?? 0), 0);
  const cust = latest(energy.customers, 'All electricity customers');
  const custFirst = energy.customers.series['All electricity customers'][0]!;
  const petrol = energy.fuel_prices.series.Petrol;
  const py = energy.fuel_prices.years;
  const jump = py.map((y, i) => (i && petrol[i] && petrol[i - 1] ? { y, c: pctChange(petrol[i - 1]!, petrol[i]!) } : null)).filter(Boolean) as { y: string; c: number }[];
  const biggest = jump.reduce((a, b) => (b.c > a.c ? b : a));
  return [
    `Hydro power capacity grew ${pctChange(hydroPrev, hydroNow).toFixed(0)}% in ${cap.years[last]} alone, to ${fmtN(hydroNow)} MW.`,
    `About ${Math.round((hydroNow / totalNow) * 100)}% of Uganda’s ${fmtN(totalNow)} MW of generating capacity is hydro.`,
    `Electricity customers grew ${(cust.value / custFirst).toFixed(1)}-fold, from ${fmtM(custFirst)} in ${energy.customers.years[0]} to ${fmtM(cust.value)} in ${cust.year}.`,
    `Petrol’s biggest price jump came in ${biggest.y}: ${signed(biggest.c)}, to UGX ${fmtN(petrol[py.indexOf(biggest.y)]!)} a litre.`,
  ];
}

export function industryFacts() {
  const ps = [...industry.products].sort((a, b) => (a.local_share ?? 0) - (b.local_share ?? 0));
  const low = ps[0];
  const high = ps[ps.length - 1];
  const g = industry.sector_growth;
  const top = [...g.sectors].sort((a, b) => (b.growth ?? -1e9) - (a.growth ?? -1e9))[0];
  return [
    `Uganda makes about ${Math.round(high.local_share ?? 0)}% of the ${high.name.toLowerCase()} it uses, but only ${Math.round(low.local_share ?? 0)}% of its ${low.name.toLowerCase()}; the rest is imported.`,
    `Factory output grew ${g.total}% in ${g.year}; ${top.name.toLowerCase()} grew fastest (${signed(top.growth ?? 0, 1)}).`,
  ];
}

export function transportFacts() {
  const reg = transport.registrations;
  const moto = latest(reg, 'Motorcycles');
  const cars = valueIn(reg, 'Cars', moto.year)!;
  const peakI = argmax(reg.series.Motorcycles);
  const e = transport.entebbe;
  const eLast = latest(e, 'International passengers');
  const e2020 = valueIn(e, 'International passengers', '2020')!;
  const e2019 = valueIn(e, 'International passengers', '2019')!;
  const paved = latest(transport.roads, 'Paved');
  const unpaved = valueIn(transport.roads, 'Unpaved', paved.year)!;
  return [
    `For every new car registered in ${moto.year}, about ${Math.round(moto.value / cars)} new motorcycles were registered. Motorcycle registrations peaked in ${reg.years[peakI]} at ${fmtN(reg.series.Motorcycles[peakI]!)}.`,
    `Entebbe lost ${Math.round(100 - (e2020 / e2019) * 100)}% of its international passengers in 2020, then set a record of ${fmtM(eLast.value, 2)} in ${eLast.year}.`,
    `Only ${Math.round((paved.value / (paved.value + unpaved)) * 100)}% of Uganda’s ${fmtN(paved.value + unpaved)} km national road network is paved (${paved.year}).`,
  ];
}

export function tourismFacts() {
  const a = tourism.arrivals;
  const last = latest(a, 'All arrivals');
  const low = argmin(a.series['All arrivals']);
  const lowV = a.series['All arrivals'][low]!;
  const parks = tourism.parks;
  const li = parks.years.length - 1;
  const top = [...parks.rows].sort((x, y) => (y.values[li] ?? 0) - (x.values[li] ?? 0))[0];
  return [
    `${fmtM(last.value, 2)} people arrived in Uganda in ${last.year}, ${(last.value / lowV).toFixed(1)} times the ${fmtM(lowV, 2)} of ${a.years[low]}.`,
    `${top.name} was the most visited national park in ${parks.years[li]}, with ${fmtN(top.values[li]!)} visitors.`,
  ];
}

export function mobileMoneyFacts() {
  const mm = communication.mobile_money;
  const v = latest(mm, 'value');
  const c = latest(mm, 'customers');
  const ag = latest(mm, 'agents');
  return [
    `Ugandans moved UGX ${v.value.toFixed(1)} trillion through mobile money in ${v.year}, up from UGX ${(mm.series.value[0]! * 1000).toFixed(0)} billion in ${mm.years[0]}.`,
    `There were ${c.value.toFixed(1)} million registered mobile-money accounts and ${fmtN(ag.value)} agents in ${ag.year}.`,
  ];
}

export function farmingFacts() {
  const f = agriculture.fish;
  const last = f.years[f.years.length - 1];
  const vic = valueIn(f, 'Victoria', last)!;
  const alb = valueIn(f, 'Albert', last)!;
  const h = agriculture.honey;
  const topH = h.regions[0];
  const st = agriculture.livestock;
  const goats = latest(st, 'Goats');
  const cattle = latest(st, 'Cattle');
  return [
    alb > vic
      ? `Lake Albert now lands more fish than Lake Victoria: ${fmtN(alb / 1000)} thousand tonnes against ${fmtN(vic / 1000)} thousand in ${last}.`
      : `Lake Victoria landed ${fmtN(vic / 1000)} thousand tonnes of fish in ${last}, and Lake Albert ${fmtN(alb / 1000)} thousand.`,
    `${topH.region} produces ${Math.round((topH.kg / h.total_kg) * 100)}% of Uganda’s honey, more than any other sub-region.`,
    `Uganda had about ${(goats.value / 1000).toFixed(1)} million goats and ${(cattle.value / 1000).toFixed(1)} million cattle in ${goats.year}.`,
  ];
}
