// GDP: size, growth, structure and per-person figures (build time).
import gdpJson from '../data/gdp.json';

interface Src { title: string; url: string; updated: string | null }
interface Activity { name: string; isic: string; sector: string; current: number[]; growth: (number | null)[] | null }

const raw = gdpJson as unknown as {
  sources: { annual: Src; quarterly: Src };
  annual: {
    years: string[];
    gdp_current: number[];
    gdp_constant: number[];
    growth: (number | null)[];
    per_capita_ugx: number[];
    per_capita_usd: number[];
    population_000: number[];
    usd_rate: number[];
    gdp_usd_million: number[];
    broad_current: Record<string, number[]>;
    activities: Activity[];
    informal_share: number[] | null;
  };
  quarterly: { quarters: string[]; gdp_constant: number[]; yoy: (number | null)[] };
};

export const sources = raw.sources;
export const annual = raw.annual;
export const quarterly = raw.quarterly;

const lastIdx = annual.years.length - 1;
export const latestYear = annual.years[lastIdx];
export const latest = {
  year: latestYear,
  growth: annual.growth[lastIdx]!,
  prevGrowth: annual.growth[lastIdx - 1]!,
  sizeTrillion: annual.gdp_current[lastIdx] / 1000,
  sizeUsdBillion: annual.gdp_usd_million[lastIdx] / 1000,
  perCapitaUgx: annual.per_capita_ugx[lastIdx],
  perCapitaUsd: annual.per_capita_usd[lastIdx],
  informal: annual.informal_share?.[lastIdx] ?? null,
};

/** Share (%) of GDP by broad sector, per year, from current-price values. */
export const shares = Object.fromEntries(
  Object.entries(annual.broad_current).map(([k, vals]) => [
    k,
    vals.map((v, i) => Math.round((1000 * v) / annual.gdp_current[i]) / 10),
  ]),
) as Record<string, number[]>;

// Everyday names for UBOS activity labels.
const PLAIN: Record<string, string> = {
  'Trade and Repairs': 'Shops & trade',
  'Transportation and Storage': 'Transport & storage',
  'Accommodation and Food Service Activities': 'Hotels & restaurants',
  'Information and Communication': 'Phones, internet & media',
  'Financial and Insurance Activities': 'Banking & insurance',
  'Real Estate Activities': 'Real estate & housing',
  'Professional, Scientific and Technical Activities': 'Professional services',
  'Administrative and Support Service Activities': 'Admin & support services',
  'Public Administration': 'Government administration',
  'Human Health and Social Work Activities': 'Health & social work',
  'Arts, Entertainment and Recreation': 'Arts & entertainment',
  'Other Service Activities': 'Other services',
  'Activities of Households as Employers': 'Household workers',
  'Mining & quarrying': 'Mining & quarrying',
  'Agriculture Support Services': 'Farm support services',
};
export const plainName = (n: string) => PLAIN[n] ?? n;

export const activities = annual.activities
  .map((a) => ({
    ...a,
    label: plainName(a.name),
    size: a.current[lastIdx] / 1000, // trillion UGX
    share: (100 * a.current[lastIdx]) / annual.gdp_current[lastIdx],
    growthLatest: a.growth?.[lastIdx] ?? null,
  }))
  .filter((a) => a.size > 0);

export const biggest = [...activities].sort((a, b) => b.size - a.size).slice(0, 12);
export const fastest = [...activities]
  .filter((a) => a.growthLatest != null && a.share >= 0.5) // ignore tiny activities whose % swings are noise
  .sort((a, b) => b.growthLatest! - a.growthLatest!)
  .slice(0, 12);

const fmtT = (t: number) => `UGX ${t.toFixed(0)} trillion`;

export function facts() {
  const first = 0;
  const covid = annual.years.indexOf('2019/20');
  const pcGrowth = ((annual.per_capita_usd[lastIdx] / annual.per_capita_usd[first]) - 1) * 100;
  const cash = activities.find((a) => a.isic === 'AA');
  const cashShare0 = cash ? (100 * cash.current[first]) / annual.gdp_current[first] : null;
  const q = quarterly;
  const lastQ = q.quarters.length - 1;
  const out = [
    `Uganda's economy produced ${fmtT(latest.sizeTrillion)} (about US$${latest.sizeUsdBillion.toFixed(0)} billion) in ${latestYear}.`,
    `After prices are taken out, the economy grew ${latest.growth}% in ${latestYear}, ${latest.growth >= latest.prevGrowth ? 'up' : 'down'} from ${latest.prevGrowth}% the year before.`,
    `GDP per person was US$${Math.round(latest.perCapitaUsd).toLocaleString()} (UGX ${(latest.perCapitaUgx / 1e6).toFixed(1)} million) in ${latestYear}, ${pcGrowth.toFixed(0)}% more than in ${annual.years[first]} in dollar terms.`,
  ];
  if (covid >= 0) out.push(`Growth slowed to ${annual.growth[covid]}% in ${annual.years[covid]}, the year Covid-19 lockdowns began.`);
  if (latest.informal != null) out.push(`About ${Math.round(latest.informal)}% of what Uganda produces comes from the informal sector.`);
  if (cash && cashShare0 != null) out.push(`Cash crops grew from ${cashShare0.toFixed(1)}% to ${cash.share.toFixed(1)}% of the economy between ${annual.years[first]} and ${latestYear}.`);
  out.push(`In the latest quarter (${q.quarters[lastQ]}), output was ${q.yoy[lastQ]}% higher than a year earlier.`);
  return out;
}
