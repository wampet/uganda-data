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

export const featured: Record<string, { href: string; title: string; blurb: string }[]> = {
  'admin-units': [districtExplorer],
  population: [
    {
      href: '/people/population/age-and-growth/',
      title: 'How old is Uganda, and how fast is it growing?',
      blurb: 'An animated population pyramid to 2050, census counts since 1911, and life expectancy.',
    },
    districtExplorer,
  ],
  education: [{ ...districtExplorer, href: '/places/districts/?show=out_of_school', title: 'Children out of school, by district' }],
  jobs: [{ ...districtExplorer, href: '/places/districts/?show=neet', title: 'Youth not in work or school, by district' }],
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
