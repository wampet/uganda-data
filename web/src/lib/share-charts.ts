// Charts that have their own shareable page (/charts/<slug>/) and a preview
// image (/og/<slug>.png) for WhatsApp, X, Facebook and LinkedIn link cards.
// Every description is computed from the data, never typed by hand.
import type { ChartSpec } from './chart-spec';
import { cpi, fmtPct, monthLabel } from './data';
import * as C from './cpi';
import * as G from './gdp';
import * as T from './trade';
import * as P from './population';
import * as D from './census';

export interface SharedChart {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  spec: ChartSpec;
  height: number;
  source: { title: string; url: string };
  page: { href: string; label: string };
  topic: string;
}

const src = (s: { title: string; url: string }) => ({ title: s.title, url: s.url });

function districtMap(id: string, slug: string, title: string, lead: string): SharedChart {
  const ind = D.indicatorById.get(id)!;
  const list = D.ranked(id);
  return {
    slug,
    title,
    subtitle: `${ind.label}, by district · Census 2024`,
    description: `${lead} Uganda overall: ${D.fmtValue(ind, D.national[id])}. Highest: ${list[0].name} (${D.fmtValue(ind, list[0].values[id])}); lowest: ${list[list.length - 1].name} (${D.fmtValue(ind, list[list.length - 1].values[id])}).`,
    spec: {
      kind: 'map',
      unit: D.unitSuffix(ind),
      digits: D.digitsFor(ind),
      series: [],
      map: {
        geo: '/geo/districts.json',
        values: D.mapValues(id),
        names: D.mapNames,
        slugs: D.mapSlugs,
        href: '/places/districts/',
        breaks: D.breaksFor(id),
        reference: { label: 'Uganda', value: D.national[id] },
      },
    },
    height: 560,
    source: src(D.source),
    page: { href: `/places/districts/?show=${id}`, label: 'Explore all district indicators' },
    topic: 'Places',
  };
}

const L = G.annual.years.length - 1;
const TL = T.annual.years.length - 1;
const pyr2024 = P.pyramid.years.indexOf(2024);
const censusYears = new Map(P.history.map((h) => [h.year, h.total]));
const projYears = new Map(P.stats.map((s) => [s.year, s.total]));
const popX = [...new Set([...P.history.map((h) => h.year), ...P.stats.map((s) => s.year)])].sort((a, b) => a - b);
const topExports = T.export_products.slice(0, 12);

export const sharedCharts: SharedChart[] = [
  {
    slug: 'uganda-inflation-rate',
    title: 'Uganda’s inflation rate',
    subtitle: 'Annual % change in consumer prices',
    description: `Prices were ${fmtPct(C.headline)} higher in ${monthLabel(C.latestMonth, true)} than a year earlier. Inflation peaked at ${fmtPct(C.peak.value)} in ${monthLabel(C.peak.month, true)}.`,
    spec: { kind: 'line', unit: '%', x: C.yoyMonths, zeroLine: true, series: [
      { name: 'All items', data: C.yoyOf('headline'), color: 1 },
      { name: 'Core', data: C.yoyOf('core'), color: 'muted' },
    ] },
    height: 400,
    source: src(cpi.source),
    page: { href: '/economy/prices/inflation/', label: 'Inflation: categories, towns and 340 items' },
    topic: 'Economy',
  },
  {
    slug: 'inflation-by-category',
    title: 'Which prices are rising fastest?',
    subtitle: `Annual inflation by spending category, ${monthLabel(C.latestMonth)}`,
    description: `${C.divisions[0].name} is rising fastest at ${fmtPct(C.divisions[0].yoy)} a year; ${C.divisions[C.divisions.length - 1].name} slowest at ${fmtPct(C.divisions[C.divisions.length - 1].yoy)}.`,
    spec: { kind: 'bar', unit: '%', categories: C.divisions.map((d) => d.name), series: [{ name: 'Annual change', data: C.divisions.map((d) => d.yoy) }], labelWidth: 170 },
    height: 460,
    source: src(cpi.source),
    page: { href: '/economy/prices/inflation/', label: 'More on inflation' },
    topic: 'Economy',
  },
  {
    slug: 'inflation-by-town',
    title: 'Inflation by town',
    subtitle: `Annual % change in prices, ${monthLabel(C.latestMonth)}`,
    description: `Prices rose fastest in ${C.centres[0].name} (${fmtPct(C.centres[0].yoy)}) and slowest in ${C.centres[C.centres.length - 1].name} (${fmtPct(C.centres[C.centres.length - 1].yoy)}).`,
    spec: { kind: 'bar', unit: '%', categories: C.centres.map((c) => c.name), series: [{ name: 'Annual change', data: C.centres.map((c) => c.yoy) }], labelWidth: 170 },
    height: 420,
    source: src(cpi.source),
    page: { href: '/economy/prices/inflation/', label: 'More on inflation' },
    topic: 'Economy',
  },
  {
    slug: 'uganda-gdp-growth',
    title: 'Uganda’s economic growth',
    subtitle: 'Real GDP growth, % per financial year',
    description: `The economy grew ${G.latest.growth}% in ${G.latest.year} after prices are taken out.`,
    spec: { kind: 'line', unit: '%', x: G.annual.years.slice(1), zeroLine: true, series: [{ name: 'Real growth', data: G.annual.growth.slice(1), color: 1, points: true }] },
    height: 400,
    source: src(G.sources.annual),
    page: { href: '/economy/gdp/economic-growth/', label: 'More on GDP' },
    topic: 'Economy',
  },
  {
    slug: 'uganda-gdp-per-person',
    title: 'GDP per person in Uganda',
    subtitle: 'US dollars at each year’s exchange rate',
    description: `GDP per person was US$${Math.round(G.latest.perCapitaUsd).toLocaleString()} in ${G.latest.year}, up from US$${Math.round(G.annual.per_capita_usd[0])} in ${G.annual.years[0]}.`,
    spec: { kind: 'line', unit: '', digits: 0, x: G.annual.years, series: [{ name: 'US$ per person', data: G.annual.per_capita_usd, color: 1, points: true }] },
    height: 400,
    source: src(G.sources.annual),
    page: { href: '/economy/gdp/economic-growth/', label: 'More on GDP' },
    topic: 'Economy',
  },
  {
    slug: 'uganda-economy-by-sector',
    title: 'What Uganda’s economy is made of',
    subtitle: 'Share of GDP by sector, %',
    description: `In ${G.latest.year}, services were ${G.shares.Services[L]}% of GDP, agriculture ${G.shares.Agriculture[L]}% and industry ${G.shares.Industry[L]}%.`,
    spec: { kind: 'line', unit: '%', x: G.annual.years, series: [
      { name: 'Services', data: G.shares.Services, color: 1 },
      { name: 'Agriculture', data: G.shares.Agriculture, color: 3 },
      { name: 'Industry', data: G.shares.Industry, color: 2 },
    ] },
    height: 400,
    source: src(G.sources.annual),
    page: { href: '/economy/gdp/economic-growth/', label: 'More on GDP' },
    topic: 'Economy',
  },
  {
    slug: 'uganda-exports-and-imports',
    title: 'Uganda’s exports and imports',
    subtitle: 'Goods, US$ million per year',
    description: `Uganda exported ${T.bn(T.latest.exports)} and imported ${T.bn(T.latest.imports)} of goods in ${T.year}. Gold was ${Math.round(T.latest.goldShare)}% of exports.`,
    spec: { kind: 'line', unit: '', digits: 0, x: T.annual.years, xNumeric: true, series: [
      { name: 'Exports', data: T.annual.exports, color: 1 },
      { name: 'Imports', data: T.annual.imports, color: 2 },
    ] },
    height: 400,
    source: src(T.sources.export_products),
    page: { href: '/economy/trade/exports-and-imports/', label: 'More on trade' },
    topic: 'Economy',
  },
  {
    slug: 'uganda-top-exports',
    title: 'What Uganda sells to the world',
    subtitle: `Top exports, US$ million, ${T.year}`,
    description: `Gold (${T.bn(topExports[0].values[TL])}) and coffee (${T.bn(topExports[1].values[TL], 2)}) lead Uganda’s exports.`,
    spec: { kind: 'bar', unit: '', digits: 0, categories: topExports.map((p) => p.name), series: [{ name: 'US$ million', data: topExports.map((p) => Math.round(p.values[TL])) }], labelWidth: 170 },
    height: 460,
    source: src(T.sources.export_products),
    page: { href: '/economy/trade/exports-and-imports/', label: 'More on trade' },
    topic: 'Economy',
  },
  {
    slug: 'uganda-population-growth',
    title: 'Uganda’s population, 1911 to 2050',
    subtitle: 'Census counts and UBOS projection',
    description: `The 2024 census counted ${P.millions(P.census2024.total)} people. UBOS projects ${P.millions(P.statFor(2050).total, 0)} by 2050.`,
    spec: { kind: 'line', unit: '', digits: 0, xNumeric: true, x: popX, series: [
      { name: 'Census count', data: popX.map((y) => censusYears.get(y) ?? null), color: 1, points: true },
      { name: 'Projection', data: popX.map((y) => (y >= 2014 ? projYears.get(y) ?? null : null)), color: 1, dashed: true },
    ] },
    height: 400,
    source: src(P.sources.history),
    page: { href: '/people/population/age-and-growth/', label: 'Population pyramid and more' },
    topic: 'People',
  },
  {
    slug: 'uganda-population-pyramid',
    title: 'Uganda’s population pyramid',
    subtitle: 'Population by age and sex, 2024 (UBOS projection)',
    description: `Half of Ugandans are younger than ${Math.round(P.statFor(2024).median_age)}. ${P.dependencyText(P.statFor(2024))}`,
    spec: { kind: 'pyramid', series: [], pyramid: { ...P.pyramid, yearIndex: pyr2024 } },
    height: 520,
    source: src(P.sources.projections),
    page: { href: '/people/population/age-and-growth/', label: 'Watch it change to 2050' },
    topic: 'People',
  },
  {
    slug: 'uganda-life-expectancy',
    title: 'Life expectancy in Uganda',
    subtitle: 'Years at birth, by census',
    description: `Life expectancy rose from ${P.life[0].total} years in ${P.life[0].year} to ${P.life[P.life.length - 1].total} in ${P.life[P.life.length - 1].year}.`,
    spec: { kind: 'line', unit: '', digits: 1, xNumeric: true, yMin: 40, x: P.life.map((l) => l.year), series: [
      { name: 'Women', data: P.life.map((l) => l.female), color: 2, points: true },
      { name: 'Men', data: P.life.map((l) => l.male), color: 1, points: true },
    ] },
    height: 400,
    source: src(P.sources.life),
    page: { href: '/people/population/age-and-growth/', label: 'More on population' },
    topic: 'People',
  },
  districtMap('grid', 'grid-electricity-by-district', 'Who has power from the grid?', 'Share of households using grid electricity for lighting.'),
  districtMap('out_of_school', 'children-out-of-school-by-district', 'Children out of school, by district', 'Share of children aged 6–12 not in school.'),
  districtMap('neet', 'youth-not-in-work-or-school-by-district', 'Young people not in work, school or training', 'Share of 18–30 year olds not in employment, education or training.'),
];

export const sharedBySlug = new Map(sharedCharts.map((c) => [c.slug, c]));
