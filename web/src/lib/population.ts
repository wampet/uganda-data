// Population age structure, growth and life expectancy (build time).
import popJson from '../data/population.json';
import { national as censusNational } from './census';

export interface YearStats {
  year: number; total: number; male: number; female: number; median_age: number;
  under15_pct: number; under18_pct: number; over65_pct: number; youth_18_30_pct: number; dependency_ratio: number;
}
interface Src { title: string; url: string; updated: string | null }

const raw = popJson as unknown as {
  sources: { projections: Src; history: Src; life: Src };
  pyramid: { years: number[]; bands: string[]; male: number[][]; female: number[][] };
  stats: YearStats[];
  history: { year: number; male: number; female: number; total: number; growth: number | null }[];
  life: { year: number; male: number; female: number; total: number }[];
  projection_check: { year: number; projected: number; census: number; diff_pct: number };
};

export const sources = raw.sources;
export const history = raw.history;
export const life = raw.life;
export const check = raw.projection_check;
export const stats = raw.stats;

// The pyramid starts at 2015 (first mid-year projection after the 2014 census base).
const first = raw.pyramid.years.indexOf(2015);
export const pyramid = {
  years: raw.pyramid.years.slice(first),
  bands: raw.pyramid.bands,
  male: raw.pyramid.male.map((r) => r.slice(first)),
  female: raw.pyramid.female.map((r) => r.slice(first)),
};
export const statsFrom2015 = stats.filter((s) => s.year >= 2015);
export const statFor = (year: number) => stats.find((s) => s.year === year)!;

export const census2024 = history.find((h) => h.year === 2024)!;
export const censusChildrenPct = censusNational.children; // share under 18, counted in 2024

export const millions = (n: number, d = 1) => `${(n / 1e6).toFixed(d)} million`;

/** "For every 100 working-age people there are N children and older people." */
export const dependencyText = (s: YearStats) =>
  `For every 100 people of working age (15–64) there are ${Math.round(s.dependency_ratio)} children and older people to support.`;

export function facts() {
  const y24 = statFor(2024);
  const y50 = statFor(2050);
  const doubling = stats.find((s) => s.total >= census2024.total * 2);
  const first = history[0];
  const peakIdx = history.reduce((best, h, i) => ((h.growth ?? -1) > (history[best].growth ?? -1) ? i : best), 0);
  const peakGrowth = history[peakIdx];
  const peakFrom = history[peakIdx - 1]?.year;
  const le0 = life[0];
  const le1 = life[life.length - 1];
  return [
    `Uganda counted ${millions(census2024.total)} people in the 2024 census, ${Math.round(census2024.total / first.total)} times the ${millions(first.total)} counted in ${first.year}.`,
    `About ${Math.round(censusChildrenPct ?? 0)}% of Ugandans are under 18.`,
    `Half of all Ugandans are younger than ${Math.round(y24.median_age)} (projected median age in 2024).`,
    `UBOS projects ${millions(y50.total, 0)} people by 2050${doubling ? `, roughly double today's population by ${doubling.year}` : ''}.`,
    `Population grew fastest between the ${peakFrom} and ${peakGrowth.year} censuses: ${peakGrowth.growth}% a year.`,
    `Life expectancy at birth rose from ${le0.total} years in ${le0.year} to ${le1.total} in ${le1.year}.`,
    `${dependencyText(y24)} By 2050 that falls to ${Math.round(y50.dependency_ratio)}.`,
  ];
}
