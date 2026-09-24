// Build-time access to the pipeline's output (web/src/data). Nothing here ships
// to the browser unless a page explicitly passes it to a chart.
import catalogJson from '../data/catalog.json';
import taxonomyJson from '../data/taxonomy.json';
import cpiJson from '../data/indicators/cpi.json';

export interface Topic { slug: string; name: string; ubos_ids: number[] }
export interface Section { slug: string; name: string; blurb: string; topics: Topic[] }
export interface CatalogEntry {
  id: string; title: string; url: string; format: string;
  kind: 'dataset' | 'publication'; updated: string | null; topic: string; family: string | null;
}
export interface Series {
  name: string; group: string; weight: number | null; code: string | null;
  index: (number | null)[]; yoy: (number | null)[]; basket?: string; outlier?: boolean;
}
export interface Cpi {
  id: string; title: string; base: string; months: string[];
  series: Record<string, Series>;
  source: { title: string; url: string; updated: string };
}

export const sections = taxonomyJson as Section[];
// Defence in depth: the pipeline already drops non-web links, but never render
// a third-party URL into an href unless it is plain http(s).
const isWebUrl = (u: string) => /^https?:\/\//i.test(u);
export const catalog = (catalogJson as CatalogEntry[]).filter((e) => isWebUrl(e.url));
export const cpi = cpiJson as unknown as Cpi;

export const topicIndex = new Map(
  sections.flatMap((s) => s.topics.map((t) => [t.slug, { section: s, topic: t }] as const)),
);

export const topicUrl = (sectionSlug: string, topicSlug: string) => `/${sectionSlug}/${topicSlug}/`;

export function entriesFor(topicSlug: string, kind?: CatalogEntry['kind']) {
  return catalog.filter((e) => e.topic === topicSlug && (!kind || e.kind === kind));
}

/** Indicator pages we have built so far, by topic. Grows as parsers are added. */
const districtExplorer = {
  href: '/places/districts/',
  title: 'Uganda, district by district',
  blurb: 'Census 2024 on a map: schooling, jobs, power, water and health for all 146 districts and cities.',
};

// Production section pages (see lib/production.ts).
const madeInUganda = {
  href: '/production/industry/made-in-uganda/',
  title: 'Made in Uganda: what we produce, and what we import',
  blurb: 'Cement, beer, sugar, cooking oil, soft drinks and spirits: how much we make ourselves, plus factory growth by sector.',
};
const productionPages = {
  energy: [{
    href: '/production/energy/power-and-fuel/',
    title: 'Power and fuel',
    blurb: 'Generating capacity by source, electricity customers, and fuel prices and sales since 2013.',
  }],
  industry: [madeInUganda],
  construction: [madeInUganda],
  transport: [{
    href: '/production/transport/getting-around/',
    title: 'Getting around Uganda',
    blurb: 'New motorcycles vs cars, paved roads, Entebbe passengers since 2012, and ferries.',
  }],
  tourism: [{
    href: '/production/tourism/visitors/',
    title: 'Visitors to Uganda',
    blurb: 'Arrivals since 2019 and the most visited national parks.',
  }],
  communication: [{
    href: '/production/communication/mobile-money/',
    title: 'Mobile money',
    blurb: 'Money sent, accounts and agents since 2009.',
  }],
  agriculture: [{
    href: '/production/agriculture/livestock-and-fish/',
    title: 'Livestock, fish and honey',
    blurb: 'Fish catch by lake, animal numbers, milk, and where Uganda’s honey comes from.',
  }],
};

const environmentPage = {
  href: '/environment/land/forests-land-and-climate/',
  title: 'Where are Uganda’s forests going?',
  blurb: 'Forest loss and farmland since 2000, forest reserves, how hot each town gets, and piped water supply.',
};

export const featured: Record<string, { href: string; title: string; blurb: string }[]> = {
  ...productionPages,
  'admin-units': [districtExplorer],
  land: [environmentPage],
  climate: [environmentPage],
  water: [environmentPage],
  environment: [environmentPage],
  population: [
    {
      href: '/people/population/age-and-growth/',
      title: 'How old is Uganda, and how fast is it growing?',
      blurb: 'An animated population pyramid to 2050, census counts since 1911, and life expectancy.',
    },
    districtExplorer,
  ],
  education: [
    {
      href: '/people/education/learning-in-uganda/',
      title: 'Are Uganda’s children in school, and learning?',
      blurb: 'Out-of-school children, literacy, PLE, UCE and UACE results, completion rates and test scores.',
    },
    { ...districtExplorer, href: '/places/districts/?show=out_of_school', title: 'Children out of school, by district' },
  ],
  jobs: [
    {
      href: '/people/jobs/work-and-earnings/',
      title: 'Who has a job, and what does it pay?',
      blurb: 'Youth not in work or school, typical monthly pay, formal vs informal jobs, and where Ugandans work.',
    },
    { ...districtExplorer, href: '/places/districts/?show=neet', title: 'Youth not in work or school, by district' },
  ],
  health: [
    {
      href: '/people/health/health-in-uganda/',
      title: 'Are Ugandans getting healthier?',
      blurb: 'Child deaths, fertility, births in health facilities, vaccination, stunting, mosquito nets and health spending.',
    },
  ],
  crime: [
    {
      href: '/people/crime/crime-and-prisons/',
      title: 'Crime and prisons in Uganda',
      blurb: 'Which crimes are reported, who the victims are, mob justice, and how crowded prisons are.',
    },
    {
      href: '/people/crime/road-safety/',
      title: 'How dangerous are Uganda’s roads?',
      blurb: 'Road deaths and injuries since 2019: who gets hurt, which vehicles, what time of day, and where crashes are deadliest.',
    },
  ],
  poverty: [
    {
      href: '/people/poverty/poverty-in-uganda/',
      title: 'How many Ugandans are poor, and where?',
      blurb: 'Poverty since 1999, by region, who moved in and out of poverty, and daily life: shoes, blankets, meals.',
    },
  ],
  banking: [
    {
      href: '/economy/banking/money-and-banks/',
      title: 'The shilling, the banks and your money',
      blurb: 'The dollar rate since 2014, what banks charge and pay, who they lend to, cash in circulation and insurance.',
    },
  ],
  'government-finance': [
    {
      href: '/economy/government-finance/where-the-money-goes/',
      title: 'Where does government money go?',
      blurb: 'Spending out of every UGX 100,000, revenue, central vs local government, and tax registrations.',
    },
  ],
  trade: [
    {
      href: '/economy/trade/exports-and-imports/',
      title: 'What does Uganda sell, and to whom?',
      blurb: 'Exports and imports since 1996, top products and partners, with and without gold.',
    },
  ],
  gdp: [
    {
      href: '/economy/gdp/economic-growth/',
      title: 'Is the economy growing?',
      blurb: 'GDP growth by year and quarter, what the economy is made of, GDP per person and the informal sector.',
    },
  ],
  prices: [
    {
      href: '/economy/prices/inflation/',
      title: 'Inflation: how fast are prices rising?',
      blurb: 'Monthly since 2017, by spending category, town and ~350 individual items.',
    },
  ],
};

// ---- formatting ----------------------------------------------------------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthLabel(ym: string, long = false) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym; // fiscal years / quarters pass through
  const [y, m] = ym.split('-').map(Number);
  return `${(long ? MONTHS_LONG : MONTHS)[m - 1]} ${y}`;
}

export function fmtPct(v: number | null | undefined, digits = 1, signed = false) {
  if (v == null) return '–';
  const s = v.toFixed(digits);
  return `${signed && v > 0 ? '+' : ''}${s}%`;
}

export function fmtUgx(v: number) {
  return `UGX ${Math.round(v).toLocaleString('en-UG')}`;
}

export function fmtDate(iso: string | null) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Title-case a UBOS label that arrives in inconsistent case. */
export function tidy(label: string) {
  return label.replace(/\s+/g, ' ').trim();
}
