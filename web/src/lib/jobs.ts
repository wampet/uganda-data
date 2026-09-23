// Jobs and earnings (build time).
import jobsJson from '../data/jobs.json';
import { national as censusNational, ranked } from './census';

interface Src { title: string; url: string; updated: string | null }
type BySex = Record<'Male' | 'Female' | 'Total', (number | null)[]>;

const raw = jobsJson as unknown as {
  sources: Record<'key' | 'youth' | 'epr' | 'industry' | 'status' | 'earnings', Src>;
  surveys: string[];
  working_age_millions: number[];
  working_millions: number[];
  subsistence_only_pct: BySex;
  youth: { unemployment: BySex; neet: BySex; subsistence_only: (number | null)[] };
  epr_by_age: { age: string; values: number[] }[];
  industry: { surveys: string[]; rows: { name: string; values: number[] }[] };
  status_by_education: { columns: string[]; rows: { name: string; values: number[] }[] };
  earnings_2021_ugx_000: { group: string | null; name: string; total: number; male: number; female: number }[];
  notes: string[];
};

export const { sources, surveys, youth, industry, notes } = raw;
export const workingMillions = raw.working_millions;
export const earnings = raw.earnings_2021_ugx_000.map((e) => ({ ...e, name: e.name.trim() }));
export const statusByEducation = raw.status_by_education;
export const youthSubsistence = raw.youth.subsistence_only;

const last = <T,>(a: T[]) => a[a.length - 1];
export const latestSurvey = last(surveys);

/** Monthly median earnings (UGX) for a named row. */
export const earn = (name: string, group?: string) => {
  const e = earnings.find((x) => x.name === name && (!group || x.group === group));
  return e ? { total: e.total * 1000, male: e.male * 1000, female: e.female * 1000 } : null;
};
export const earningsGroup = (group: string) =>
  earnings.filter((e) => e.group === group).map((e) => ({ name: e.name, value: e.total * 1000 }));

export const censusNeet = censusNational.neet;
export const censusUnemployment = censusNational.unemployment;
export const neetWorst = ranked('neet')[0];

/** Share of workers who are employees (wage/salary jobs), by education. */
export const employeesByEducation = (() => {
  // Columns may be two-level ("Dependent workers · Employees"): match the last part.
  const idx = statusByEducation.columns.findIndex((c) => c.split(' · ').pop()!.toLowerCase() === 'employees');
  if (idx < 0) throw new Error('jobs: "Employees" column not found in status-in-employment table');
  return statusByEducation.rows.map((r) => ({ name: r.name, value: r.values[idx] }));
})();

const ugx = (n: number) => `UGX ${Math.round(n).toLocaleString('en-UG')}`;

export function facts() {
  const nat = earn('National');
  const formal = earn('Formal employment');
  const informal = earn('Informal Employment');
  const pub = earn('Public');
  const priv = earn('Private');
  const edu0 = employeesByEducation[0];
  const eduTop = last(employeesByEducation);
  const agri = industry.rows.find((r) => r.name.startsWith('Agriculture'));
  const trade = industry.rows.find((r) => r.name === 'Trade');
  return [
    `At the 2024 census, ${Math.round(censusNeet ?? 0)}% of Ugandans aged 18–30 were not in work, school or training. In ${neetWorst.name} it was ${Math.round(neetWorst.values.neet ?? 0)}%.`,
    ...(nat ? [`The typical worker in a paid job earned ${ugx(nat.total)} a month in 2021: ${ugx(nat.male)} for men and ${ugx(nat.female)} for women.`] : []),
    ...(formal && informal ? [`Formal jobs paid a typical ${ugx(formal.total)} a month, informal jobs ${ugx(informal.total)}.`] : []),
    ...(pub && priv ? [`Public-sector workers earned a typical ${ugx(pub.total)} a month, nearly ${Math.round(pub.total / priv.total)} times the private sector’s ${ugx(priv.total)}.`] : []),
    `${Math.round(eduTop.value)}% of working degree holders are employees, compared with ${Math.round(edu0.value)}% of workers with no formal education; most others work for themselves.`,
    ...(agri && trade ? [`Farming’s share of jobs fell from ${agri.values[0]}% to ${last(agri.values)}% between ${industry.surveys[0]} and ${last(industry.surveys)}, while trade rose from ${trade.values[0]}% to ${last(trade.values)}%.`] : []),
    `Youth unemployment (18–30) was ${last(youth.unemployment.Total)}% in ${latestSurvey}: ${last(youth.unemployment.Male)}% for young men and ${last(youth.unemployment.Female)}% for young women.`,
  ];
}
