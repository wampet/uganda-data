// House prices (RPPI), construction input prices (CIPI) and producer prices (PPI).
// Build-time helpers over indices.json; every sentence is computed from the data.
import indicesJson from '../data/indices.json';
import { cpi, monthLabel } from './data';

type Vals = (number | null)[];
interface Src { title: string; url: string; updated: string | null }
interface Line { index: Vals; yoy: Vals }

const raw = indicesJson as unknown as {
  rppi: { quarters: string[]; index: Record<string, Vals>; yoy: Record<string, Vals>; base: string; source: Src };
  cipi: { months: string[]; base: string; overall: Record<string, Line>; products: Record<string, Line & { weight: number }>; source: Src };
  ppi: { months: string[]; base: string; headline: string; series: Record<string, Line & { weight: number; code: string | null; official: string }>; source: Src };
};

export const rppi = raw.rppi;
export const cipi = raw.cipi;
export const ppi = raw.ppi;

const lastOf = (v: Vals) => {
  for (let i = v.length - 1; i >= 0; i--) if (v[i] != null) return { i, v: v[i]! };
  return { i: -1, v: 0 };
};
export const pct = (v: number, d = 1) => `${v > 0 ? '+' : ''}${v.toFixed(d)}%`;
const plain = (v: number, d = 1) => `${Math.abs(v).toFixed(d)}%`;
const upDown = (v: number) => (v >= 0 ? 'rose' : 'fell');

// ---- house prices ----------------------------------------------------------
export const RPPI_HEADLINE = 'Greater Kampala (headline)';
export const rppiAreas = Object.keys(rppi.index).filter((k) => k !== RPPI_HEADLINE);

export function housePrices() {
  const q = rppi.quarters;
  const head = lastOf(rppi.index[RPPI_HEADLINE]);
  const yoy = lastOf(rppi.yoy[RPPI_HEADLINE]);
  const since = rppiAreas
    .map((a) => ({ area: a, change: lastOf(rppi.index[a]).v - 100 }))
    .sort((a, b) => b.change - a.change);
  const top = since[0];
  const bottom = since[since.length - 1];
  return {
    latest: q[head.i],
    yoy: yoy.v,
    sinceBase: head.v - 100,
    since,
    facts: [
      `House prices in greater Kampala ${upDown(yoy.v)} ${plain(yoy.v)} in the year to ${q[yoy.i]}.`,
      `Since ${q[0].split(' ')[0]}, prices are ${plain(head.v - 100, 0)} ${head.v >= 100 ? 'higher' : 'lower'} overall, but it depends where: ${top.area} is up ${plain(top.change, 0)}, while ${bottom.area} is ${bottom.change >= 0 ? `up only ${plain(bottom.change, 0)}` : `still ${plain(bottom.change, 0)} lower`}.`,
    ],
  };
}

// ---- construction costs ------------------------------------------------------
export const CIPI_ALL = 'All construction';
const CIPI_GROUPS = new Set(['Materials', 'Utilities', 'Services', 'Labour']);
export const cipiMaterials = Object.entries(cipi.products).filter(([k]) => !CIPI_GROUPS.has(k));
export const cipiGroups = Object.entries(cipi.products).filter(([k]) => CIPI_GROUPS.has(k));

export function buildingCosts() {
  const m = cipi.months;
  const all = cipi.overall[CIPI_ALL];
  const yoy = lastOf(all.yoy);
  const idx = lastOf(all.index);
  const byMaterial = cipiMaterials
    .map(([name, p]) => ({ name, since: lastOf(p.index).v - 100, yoy: lastOf(p.yoy).v }))
    .sort((a, b) => b.since - a.since);
  const top = byMaterial[0];
  const cement = byMaterial.find((x) => x.name === 'Cement');
  return {
    latest: m[idx.i],
    yoy: yoy.v,
    sinceBase: idx.v - 100,
    byMaterial,
    facts: [
      `Building materials, labour and services together cost ${plain(yoy.v)} ${yoy.v >= 0 ? 'more' : 'less'} than a year earlier (${monthLabel(m[yoy.i], true)}).`,
      `Since 2016/17, construction costs are up ${plain(idx.v - 100, 0)}. ${top.name} rose most (${pct(top.since, 0)})${cement ? `; cement only ${pct(cement.since, 0)}` : ''}.`,
    ],
  };
}

// ---- producer prices -----------------------------------------------------------
export const PPI_TOP = ['Manufacturing', 'Utilities (power, water, waste)'];
export const ppiIndustries = Object.entries(ppi.series).filter(
  ([k, s]) => k !== ppi.headline && !PPI_TOP.includes(k) && s.code && /^\d+$/.test(s.code),
);

/** PPI and CPI annual inflation on the CPI's months (they overlap from mid-2018). */
export function factoryVsShop() {
  const cpiYoy = cpi.series.headline.yoy;
  const months = cpi.months.filter((mth, i) => cpiYoy[i] != null && ppi.months.includes(mth));
  const at = (ms: string[], vals: Vals, m: string) => vals[ms.indexOf(m)] ?? null;
  return {
    months,
    ppi: months.map((m) => at(ppi.months, ppi.series[ppi.headline].yoy, m)),
    cpi: months.map((m) => at(cpi.months, cpiYoy, m)),
  };
}

export function producerPrices() {
  const head = ppi.series[ppi.headline];
  const yoy = lastOf(head.yoy);
  const ranked = ppiIndustries
    .map(([name, s]) => ({ name, yoy: lastOf(s.yoy).v, weight: s.weight }))
    .sort((a, b) => b.yoy - a.yoy);
  // Compare with shop prices for the same month, not simply the latest CPI.
  const month = ppi.months[yoy.i];
  const cpiSame = cpi.series.headline.yoy[cpi.months.indexOf(month)] ?? null;
  const low = ranked[ranked.length - 1];
  return {
    latest: ppi.months[yoy.i],
    yoy: yoy.v,
    ranked,
    facts: [
      `Prices charged by Uganda’s factories and utilities ${upDown(yoy.v)} ${plain(yoy.v)} in the year to ${monthLabel(month, true)}.` +
        (cpiSame != null ? ` Shop prices (the CPI) ${upDown(cpiSame)} ${plain(cpiSame)} over the same year.` : ''),
      `${ranked[0].name} saw the biggest factory-price rise (${pct(ranked[0].yoy)}); ` +
        (low.yoy < 0 ? `${low.name.toLowerCase()} fell the most (${pct(low.yoy)}).` : `${low.name.toLowerCase()} rose the least (${pct(low.yoy)}).`),
    ],
  };
}
