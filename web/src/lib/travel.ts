// Extra transport, tourism and construction tables (build time), shown on
// their own pages alongside the Production section's main pages.
import transportJson from '../data/transport_more.json';
import tourismJson from '../data/tourism_more.json';
import buildingJson from '../data/building.json';

interface Src { title: string; url: string; updated: string | null }
type Vals = (number | null)[];
const last = <T,>(a: T[]) => a[a.length - 1];
const n0 = (v: number) => Math.round(v).toLocaleString('en-UG');

// ---- Transport ----------------------------------------------------------------
const tr = transportJson as unknown as {
  sources: Record<'licences' | 'railway' | 'air_cargo', Src>;
  licences: { years: string[]; rows: Record<string, Vals> };
  railway: { years: string[]; tonnes: number[]; ton_km_000: number[]; port_bell: Vals; jinja_pier: Vals; accidents: number[] };
  air_cargo: { years: string[]; offloaded: number[]; loaded: number[]; total: number[] };
  notes: string[];
};
const LICENCE: Record<string, string> = {
  'Boda boda': 'Boda boda',
  'Public Service Vehicles Operators license': 'Buses & minibus taxis (PSV)',
  'Rental/Town Taxi': 'Special hire & town taxis',
  Tourist: 'Tourist vehicles',
  'Inland Water Transport Vessels': 'Boats & lake vessels',
};
export const transport = {
  sources: tr.sources, notes: tr.notes, railway: tr.railway, air: tr.air_cargo,
  licenceYears: tr.licences.years,
  licences: Object.entries(LICENCE).map(([k, name]) => ({ name, data: tr.licences.rows[k] })),
};
export function transportFacts() {
  const r = tr.railway, a = tr.air_cargo, y = tr.licences.years;
  const boda = tr.licences.rows['Boda boda'] as number[];
  const peak = Math.max(...boda);
  return [
    `Uganda Railways carried ${n0(last(r.tonnes))} tonnes of freight in ${last(r.years)}, up from ${n0(r.tonnes[0])} in ${r.years[0]}.`,
    `${n0(last(a.loaded))} tonnes of cargo were flown out of Entebbe in ${last(a.years)}, ${(last(a.loaded) / last(a.offloaded)).toFixed(1)} times the ${n0(last(a.offloaded))} tonnes flown in.`,
    `Boda boda licences issued peaked at ${n0(peak)} in ${y[boda.indexOf(peak)]}, up from ${n0(boda[0])} in ${y[0]}.`,
    `The rail ferry through Port Bell on Lake Victoria moved ${n0(last(r.port_bell) ?? 0)} tonnes in ${last(r.years)}.`,
  ];
}

// ---- Tourism and travel ----------------------------------------------------------------
const tm = tourismJson as unknown as {
  sources: Record<string, Src>;
  arrivals_2023_000: { months: { month: string; arrivals: number; departures: number }[]; total: number };
  borders_2023_000: { name: string; arrivals: number; departures: number }[];
  eac_arrivals_000: { years: string[]; countries: Record<string, Vals> };
  room_occupancy: { region: string; y2019: number; y2020: number }[];
  attractions: Record<string, { years: string[]; total: number[]; schools: number[] }>;
  notes: string[];
};
export const tourism = {
  sources: tm.sources, notes: tm.notes,
  months: tm.arrivals_2023_000.months, arrivalsTotal: tm.arrivals_2023_000.total,
  borders: tm.borders_2023_000.filter((b) => b.arrivals >= 5),
  eac: tm.eac_arrivals_000,
  rooms: tm.room_occupancy,
  attractions: tm.attractions,
};
export function tourismFacts() {
  const m = tm.arrivals_2023_000.months;
  const busiest = [...m].sort((a, b) => b.arrivals - a.arrivals)[0];
  const b = tm.borders_2023_000, ent = b.find((x) => x.name === 'Entebbe')!;
  const road = b.filter((x) => x.name !== 'Entebbe').sort((a, c) => c.arrivals - a.arrivals)[0];
  const ug = tm.room_occupancy.find((r) => r.region === 'Uganda')!;
  const nile = tm.attractions['Source of the Nile'];
  const zoo = tm.attractions['Uganda Wildlife Education Centre'];
  const L = nile.years.length - 1;
  return [
    `There were about ${(tm.arrivals_2023_000.total / 1000).toFixed(1)} million arrivals into Uganda in 2023; ${busiest.month === 'Dec' ? 'December' : busiest.month} was the busiest month (${n0(busiest.arrivals)},000).`,
    `Entebbe airport handled ${Math.round((100 * ent.arrivals) / tm.arrivals_2023_000.total)}% of arrivals in 2023. The busiest road border was ${road.name} (${n0(road.arrivals)},000).`,
    `Hotels were ${Math.round(ug.y2019)}% full in 2019 but only ${Math.round(ug.y2020)}% in 2020, the year of the COVID-19 lockdowns.`,
    `${n0(nile.total[L])} people visited the Source of the Nile in ${nile.years[L]}; ${Math.round((100 * nile.schools[L]) / nile.total[L])}% came with school groups.`,
    `The Uganda Wildlife Education Centre in Entebbe had ${n0(zoo.total[L])} visitors in ${zoo.years[L]}, more than any other attraction here.`,
  ];
}

// ---- Construction: building plans --------------------------------------------------
interface Plan { years: string[]; total: number[]; categories: Record<string, Vals> }
const bd = buildingJson as unknown as {
  sources: Record<'submitted' | 'approved' | 'rejected' | 'deferred' | 'permits', Src>;
  submitted: Plan; approved: Plan; rejected: Plan; deferred: Plan; permits: Plan;
  notes: string[];
};
export const building = bd;
/** Value of a plan table for a given year (null if that table doesn't cover it). */
export const planIn = (p: Plan, y: string) => { const i = p.years.indexOf(y); return i < 0 ? null : p.total[i]; };
export function buildingFacts() {
  const s = bd.submitted, a = bd.approved, p = bd.permits;
  const peakI = s.total.indexOf(Math.max(...s.total));
  const res = s.categories['Residential'] as number[];
  const y = s.years[peakI];
  return [
    `${n0(s.total[peakI])} building plans were submitted in ${y}, the most in these tables; ${n0(planIn(a, y) ?? 0)} were approved that year.`,
    `Homes make up most plans: ${Math.round((100 * res[peakI]) / s.total[peakI])}% of plans submitted in ${y} were residential.`,
    `Submissions fell to ${n0(last(s.total))} in ${last(s.years)}, the year of the COVID-19 lockdowns.`,
    `Only ${n0(last(p.total))} occupation permits were issued in ${last(p.years)}, against ${n0(last(a.total))} plans approved.`,
  ];
}
