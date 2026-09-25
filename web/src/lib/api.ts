// The static data API (/api/v1/): every dataset the site is built from, plus
// tidy tables (CSV and JSON) for each shareable chart, the district census and
// inflation. Everything is generated at build time; there is no server.
import cpiJson from '../data/indicators/cpi.json';
import gdpJson from '../data/gdp.json';
import tradeJson from '../data/trade.json';
import govJson from '../data/government.json';
import bankJson from '../data/banking.json';
import popJson from '../data/population.json';
import povJson from '../data/poverty.json';
import eduJson from '../data/education.json';
import jobsJson from '../data/jobs.json';
import healthJson from '../data/health.json';
import crimeJson from '../data/crime.json';
import roadJson from '../data/road_safety.json';
import envJson from '../data/environment.json';
import prodJson from '../data/production.json';
import censusJson from '../data/census.json';
import wbJson from '../data/wellbeing.json';
import miningJson from '../data/mining.json';
import govSurveyJson from '../data/governance.json';
import transportMoreJson from '../data/transport_more.json';
import tourismMoreJson from '../data/tourism_more.json';
import buildingJson from '../data/building.json';
import disabilityJson from '../data/disability.json';
import violenceJson from '../data/violence.json';
import { chartRows } from './chart-options';
import { sharedCharts } from './share-charts';
import { districts, indicators, national, source as censusSource } from './census';
import { cpi } from './data';
import { YOY_START } from './cpi';

export const API = '/api/v1';
export const LICENCE =
  'Figures are official statistics published by the Uganda Bureau of Statistics (UBOS) and its partner agencies. ' +
  'Cite UBOS as the source; the links in each dataset point to the original files.';

interface Src { title: string; url: string }
type Row = (string | number | null)[];

/** Collect {title, url} pairs from a dataset's "source"/"sources" field, whatever its shape. */
function sourcesOf(d: unknown): Src[] {
  const out: Src[] = [];
  const visit = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(visit);
    const o = v as Record<string, unknown>;
    if (typeof o.title === 'string' && typeof o.url === 'string') out.push({ title: o.title, url: o.url });
    else Object.values(o).forEach(visit);
  };
  const o = d as Record<string, unknown>;
  visit(o.sources ?? o.source);
  return out.filter((s, i) => out.findIndex((x) => x.url === s.url) === i && /^https?:\/\//i.test(s.url));
}

export interface Dataset { id: string; title: string; description: string; page: string; data: unknown; sources: Src[] }

const ds = (id: string, title: string, description: string, page: string, data: unknown): Dataset => ({
  id, title, description, page, data, sources: sourcesOf(data),
});

export const datasets: Dataset[] = [
  ds('inflation', 'Consumer prices (CPI)', 'Monthly index and annual inflation for the headline, 13 spending categories, 10 towns and about 345 items.', '/economy/prices/inflation/', cpiJson),
  ds('gdp', 'Economic growth (GDP)', 'Annual and quarterly GDP, growth, GDP per person and output by activity.', '/economy/gdp/economic-growth/', gdpJson),
  ds('trade', 'Exports and imports', 'Goods trade since 1996, by product and partner country.', '/economy/trade/exports-and-imports/', tradeJson),
  ds('government', 'Government revenue and spending', 'Spending by purpose (COFOG), central vs local, revenue and tax registrations.', '/economy/government-finance/where-the-money-goes/', govJson),
  ds('banking', 'Money and banking', 'Exchange rates, interest rates, bank lending, money supply and insurance premiums.', '/economy/banking/money-and-banks/', bankJson),
  ds('population', 'Population', 'Single-age projections (banded), census counts since 1911 and life expectancy.', '/people/population/age-and-growth/', popJson),
  ds('poverty', 'Poverty', 'Poverty rates since 1999/00, by region and residence, poverty dynamics and household possessions.', '/people/poverty/poverty-in-uganda/', povJson),
  ds('education', 'Education', 'Literacy, PLE/UCE/UACE results, completion rates and NAPE test scores.', '/people/education/learning-in-uganda/', eduJson),
  ds('jobs', 'Jobs and earnings', 'Labour force indicators by sex, youth indicators, employment by industry and median earnings.', '/people/jobs/work-and-earnings/', jobsJson),
  ds('health', 'Health', 'Child mortality, fertility, maternal care, vaccination, stunting, nets, HIV testing and health spending.', '/people/health/health-in-uganda/', healthJson),
  ds('crime', 'Crime and prisons', 'Crimes reported and prosecuted, victims and offenders by sex and age, prison population and occupancy.', '/people/crime/crime-and-prisons/', crimeJson),
  ds('road-safety', 'Road safety', 'Road crashes, deaths and injuries by road user, vehicle, time and region.', '/people/crime/road-safety/', roadJson),
  ds('environment', 'Environment', 'Land cover, forest reserves, temperature by weather station and piped water supply.', '/environment/land/forests-land-and-climate/', envJson),
  ds('production', 'Production', 'Energy, factories, transport, tourism, mobile money and agriculture.', '/production/', prodJson),
  ds('wellbeing', 'National standard indicators', 'UBOS’s scorecard for lower-middle-income status, multidimensional poverty, electricity access and more.', '/wellbeing/nsi-income/national-scorecard/', wbJson),
  ds('mining', 'Mineral production', 'Value and quantity of recorded mineral production by mineral, 2019–2023.', '/production/mining/minerals/', miningJson),
  ds('governance', 'Justice and elections (survey)', 'Where people take grievances, satisfaction with justice processes and reported election irregularities (published 2018).', '/people/governance/justice-and-elections/', govSurveyJson),
  ds('transport-extra', 'Rail, air cargo and transport licences', 'Railway and ferry freight, Entebbe air cargo and public transport licences issued.', '/production/transport/rail-air-and-licences/', transportMoreJson),
  ds('travel', 'Arrivals, hotels and attractions', 'Arrivals by month and border (2023), EAC visitors, hotel occupancy and visitors to major attractions.', '/production/tourism/travel-and-attractions/', tourismMoreJson),
  ds('building-plans', 'Building plans and permits', 'Building plans submitted, approved, rejected and deferred, and occupation permits, 2016–2020.', '/production/construction/building-plans/', buildingJson),
  ds('disability', 'Disability (functional difficulty)', 'Disability by type, age, sex, sub-region, wealth, schooling and marital status (UDHS 2022), with trends since 2011.', '/people/health/disability/', disabilityJson),
  ds('violence', 'Violence against women and men', 'Physical violence since 2006, spousal violence and help seeking (UDHS 2022).', '/people/gender/women-and-men/', violenceJson),
  ds('districts', 'Census 2024 by district', 'Indicators for every district, city and sub-region from the 2024 census.', '/places/districts/', censusJson),
];

// ---- tables ---------------------------------------------------------------------
export interface Table { id: string; title: string; description: string; page: string; source: Src; rows: () => Row[] }

const tidy = (rows: Row[]): Row[] => [[rows[0][0] === '' ? 'Category' : rows[0][0], ...rows[0].slice(1)], ...rows.slice(1)];

const round = (v: number | null | undefined, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

const districtTable: Table = {
  id: 'districts',
  title: 'Census 2024: every district',
  description: 'One row per district or city, one column per indicator; the first row after the header is Uganda overall.',
  page: '/places/districts/',
  source: censusSource,
  rows: () => [
    ['Code', 'District', 'Sub-region', 'Area (km²)', ...indicators.map((i) => `${i.label}${i.unit ? ` (${i.unit})` : ''}`)],
    ['UG', 'Uganda', '', null, ...indicators.map((i) => national[i.id] ?? null)],
    ...districts.map((d) => [d.code, d.name, d.subregion, d.area_km2, ...indicators.map((i) => d.values[i.id] ?? null)]),
  ],
};

// UBOS item labels carry stray markers (".1Batteries ( Dry Cells)").
const itemName = (n: string) => n.replace(/^\.\d+/, '').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+/g, ' ').trim();

const cpiSeries = (group: string) => Object.entries(cpi.series).filter(([, v]) => v.group === group);
const cpiMonths = cpi.months.slice(YOY_START);
const cpiTable = (id: string, title: string, description: string, cols: [string, (typeof cpi.series)[string]][]): Table => ({
  id, title, description,
  page: '/economy/prices/inflation/',
  source: cpi.source,
  rows: () => [
    ['Month', ...cols.map(([name]) => name)],
    ...cpiMonths.map((m, i) => [m, ...cols.map(([, s]) => round(s.yoy[i + YOY_START], 2))]),
  ],
});

export const tables: Table[] = [
  districtTable,
  cpiTable('inflation', 'Inflation: headline, categories and towns', 'Annual inflation (%) by month.', [
    ...cpiSeries('headline').map(([, s]) => [s.name, s] as [string, typeof s]),
    ...cpiSeries('aggregate').map(([, s]) => [s.name, s] as [string, typeof s]),
    ...cpiSeries('division').map(([, s]) => [s.name, s] as [string, typeof s]),
    ...cpiSeries('centre').map(([, s]) => [s.name, s] as [string, typeof s]),
  ]),
  cpiTable('inflation-items', 'Inflation by item', 'Annual price change (%) by month for each of the items UBOS tracks.', (() => {
    const items = cpiSeries('item').map(([, s]) => [itemName(s.name), s] as [string, typeof s]);
    // A few names repeat (e.g. "Vodka" bought in shops and in bars): add UBOS's item code to tell them apart.
    const seen = new Map<string, number>();
    items.forEach(([n]) => seen.set(n, (seen.get(n) ?? 0) + 1));
    return items
      .map(([n, s]) => [seen.get(n)! > 1 ? `${n} (${s.code})` : n, s] as [string, typeof s])
      .sort((a, b) => a[0].localeCompare(b[0]));
  })()),
  ...sharedCharts.map((c): Table => ({
    id: c.slug,
    title: c.title,
    description: c.subtitle,
    page: `/charts/${c.slug}/`,
    source: c.source,
    rows: () => tidy(chartRows(c.spec)),
  })),
];

export const tableById = new Map(tables.map((t) => [t.id, t]));
export const datasetById = new Map(datasets.map((d) => [d.id, d]));

export function tableJson(t: Table) {
  const [head, ...body] = t.rows();
  return {
    id: t.id, title: t.title, description: t.description,
    source: t.source, page: t.page, licence: LICENCE,
    columns: head,
    rows: body,
  };
}
