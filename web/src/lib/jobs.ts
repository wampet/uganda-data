// Jobs and earnings (build time).
import jobsJson from '../data/jobs.json';
import { national as censusNational, ranked } from './census';

interface Src { title: string; url: string; updated: string | null }
type BySex = Record<'Male' | 'Female' | 'Total', (number | null)[]>;

const raw = jobsJson as unknown as {
  sources: Record<'key' | 'youth' | 'epr' | 'industry' | 'status' | 'earnings' | 'civil_service' | 'wage_bill' | 'civil_service_sex' | 'pensioners' | 'nssf' | 'nssf_employers', Src>;
  surveys: string[];
  working_age_millions: number[];
  working_millions: number[];
  subsistence_only_pct: BySex;
  youth: { unemployment: BySex; neet: BySex; subsistence_only: (number | null)[] };
  epr_by_age: { age: string; values: number[] }[];
  industry: { surveys: string[]; rows: { name: string; values: number[] }[] };
  status_by_education: { columns: string[]; rows: { name: string; values: number[] }[] };
  earnings_2021_ugx_000: { group: string | null; name: string; total: number; male: number; female: number }[];
  civil_service: { years: string[]; groups: Record<string, number[]>; total: number[] };
  wage_bill_bn: { years: string[]; groups: Record<string, number[]>; total: number[] };
  civil_service_women_pct: { year: string; groups: Record<string, number> };
  pensioners: { years: string[]; rows: { female: number; male: number; total: number }[] };
  nssf: { years: string[]; sectors: { name: string; male: number[]; female: number[]; total: number[] }[]; total: { male: number[]; female: number[]; total: number[] }; employers: number[] };
  notes: string[];
};

export const { sources, surveys, youth, industry, notes } = raw;
export const civilService = raw.civil_service;
export const wageBill = raw.wage_bill_bn;
export const pensioners = raw.pensioners;
export const nssf = raw.nssf;

// Everyday names for the public-service groups (the tables spell them differently).
const GROUP: Record<string, string> = {
  'Traditional civil service': 'Ministries & agencies', 'Tradition service': 'Ministries & agencies',
  'Teaching service': 'Teachers', 'Police and Prisons': 'Police & prisons', 'Police and prisons': 'Police & prisons',
  'Public Universities': 'Public universities', 'Public universities': 'Public universities',
  'Local Governments excluding teaching services': 'Local governments', 'Local Governments': 'Local governments',
  'Local government': 'Local governments', Total: 'All public servants',
};
export const groupName = (g: string) => GROUP[g] ?? g;
export const womenInService = {
  year: raw.civil_service_women_pct.year,
  groups: Object.entries(raw.civil_service_women_pct.groups).map(([k, v]) => ({ name: groupName(k), pct: v })),
};
const sectorName = (n: string) => n.replace(/\s+/g, ' ').trim().replace(/\bAnd\b/g, 'and').replace(/^(\w)/, (c) => c.toUpperCase());
export const nssfSectors = nssf.sectors
  .filter((x) => !/^voluntary/i.test(x.name))
  .map((x) => ({ name: sectorName(x.name), total: x.total[x.total.length - 1] }))
  .sort((a, b) => b.total - a.total);
export const workingMillions = raw.working_millions;
export const earnings = raw.earnings_2021_ugx_000.map((e) => ({ ...e, name: e.name.trim() }));
export const statusByEducation = raw.status_by_education;
export const youthSubsistence = raw.youth.subsistence_only;
/** Share of the working population who only farm for their own family, by sex and survey. */
export const subsistenceBySex = raw.subsistence_only_pct;

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

export function publicFacts() {
  const L = <T,>(a: T[]) => a[a.length - 1];
  const cs = civilService, wb = wageBill, pn = pensioners, ns = nssf;
  const teachers = cs.groups['Teaching service'];
  const tWage = wb.groups['Teaching service'];
  const perTeacher = (L(tWage) * 1e9) / L(teachers);
  const p0 = pn.rows[0], p1 = L(pn.rows);
  const women = womenInService.groups.find((g) => g.name === 'All public servants');
  const police = womenInService.groups.find((g) => g.name === 'Police & prisons');
  return [
    `Uganda’s public service had ${L(cs.total).toLocaleString('en-UG')} employees in ${L(cs.years)}, up from ${cs.total[0].toLocaleString('en-UG')} in ${cs.years[0]}. ${Math.round((100 * L(teachers)) / L(cs.total))}% are teachers.`,
    `The public-service wage bill was about UGX ${Math.round(L(wb.total))} billion a month in ${L(wb.years)}, up from UGX ${Math.round(wb.total[0])} billion in ${wb.years[0]}.`,
    `That works out at roughly UGX ${(Math.round(perTeacher / 10000) * 10000).toLocaleString('en-UG')} a month per teacher on average (${L(wb.years)}).`,
    ...(women && police ? [`${Math.round(women.pct)}% of public servants were women in ${womenInService.year}, but only ${Math.round(police.pct)}% in the police and prisons.`] : []),
    `Public-service pensioners rose from ${p0.total.toLocaleString('en-UG')} in ${pn.years[0]} to ${p1.total.toLocaleString('en-UG')} in ${L(pn.years)}.`,
    `${L(ns.total.total).toLocaleString('en-UG')} workers contributed to NSSF in ${L(ns.years)}, through ${L(ns.employers).toLocaleString('en-UG')} employers. ${Math.round((100 * L(ns.total.female)) / L(ns.total.total))}% of members are women.`,
  ];
}

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
