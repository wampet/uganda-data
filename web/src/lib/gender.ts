// Women and men: sex-disaggregated figures gathered from the other stories'
// data (build time). Nothing here is new data; every number links to its source.
import * as E from './education';
import * as J from './jobs';
import * as V from './poverty';
import * as CR from './crime';
import { census2024, life, sources as popSources } from './population';
import violenceJson from '../data/violence.json';

const last = <T,>(a: T[]) => a[a.length - 1];
const at = (surveys: string[], s: string) => {
  const i = surveys.indexOf(s);
  if (i < 0) throw new Error(`gender: survey ${s} not found`);
  return i;
};

// The 2019/20 household survey is the latest one whose youth and farming
// figures can be compared (see the jobs page for why 2021 differs).
export const survey = 'UNHS 2019/20';
const si = at(J.surveys, survey);

// By-sex literacy stops earlier than the total (UBOS's later by-sex figures are misaligned).
export const literacyYear = last(E.literacy.Female).year;
if (last(E.literacy.Male).year !== literacyYear) throw new Error('gender: literacy years differ by sex');
export const literacy = { women: last(E.literacy.Female).total, men: last(E.literacy.Male).total };
export const neet = { women: J.youth.neet.Female[si]!, men: J.youth.neet.Male[si]! };
export const farmingOnly = { women: J.subsistenceBySex.Female[si]!, men: J.subsistenceBySex.Male[si]! };

const shoesRow = (name: string) => last(V.rowOf(V.shoes, name, 'Sex of Head')!.values)!;
export const shoesYear = last(V.shoes.years);
export const shoes = { women: shoesRow('Female'), men: shoesRow('Male') };

/** Percent indicators, women vs men, for one grouped chart. */
export const gaps = [
  { name: `Can read and write (${literacyYear})`, ...literacy },
  { name: `Household members all have shoes (${shoesYear})`, ...shoes },
  { name: `Workers who only farm for their family (${survey.split(' ')[1]})`, ...farmingOnly },
  { name: `Youth not in work, school or training (${survey.split(' ')[1]})`, ...neet },
];

// Pay (2021, median monthly, UGX).
export const pay = J.earn('National')!;
export const payRatio = pay.female / pay.male;
export const payBySector = J.earnings
  .filter((e) => e.group === 'Sector of employment')
  .map((e) => ({ name: e.name.replace(', forestry and fishing', ''), women: e.female * 1000, men: e.male * 1000 }));

export const lifeExp = life;
export const lifeLatest = last(life);

export const people = { women: census2024.female, men: census2024.male };

// Crime (2023): share of victims who are women or girls, main crime groups.
export const victimsFemale = CR.victims
  .filter((v) => v.total >= 4000)
  .map((v) => ({ name: v.name, female: (100 * (v.female_adult + v.female_child)) / v.total }))
  .sort((a, b) => b.female - a.female);
export const offendersMalePct = CR.maleOffenderPct;

// Violence (UDHS): physical violence since age 15, spousal violence and help seeking.
const vio = violenceJson as unknown as {
  sources: Record<'physical' | 'spousal' | 'help', { title: string; url: string }>;
  physical_trend: { year: string; women: number; men: number }[];
  spousal_2022: { name: string; Women: number; Men: number }[];
  help_seeking_2022: { name: string; Women: number; Men: number }[];
  notes: string[];
};
export const violence = {
  physical: vio.physical_trend,
  // The single forms, then "any of these"; the combined "and" rows are left out of the chart.
  spousal: vio.spousal_2022.filter((r) => !/ and /i.test(r.name)).map((r) => ({ name: r.name.replace(/Physical or sexual or emotional/i, 'Any of these'), women: r.Women, men: r.Men })),
  help: vio.help_seeking_2022.map((r) => ({ name: r.name, women: r.Women, men: r.Men })),
  notes: vio.notes,
};

export const sources = {
  literacy: E.sources.literacy,
  jobs: J.sources.youth,
  key: J.sources.key,
  earnings: J.sources.earnings,
  shoes: V.sources.shoes,
  life: popSources.life,
  history: popSources.history,
  victims: CR.sources.victims,
  offenders: CR.sources.offenders,
  ...vio.sources,
};

const n0 = (v: number) => Math.round(v).toLocaleString('en-UG');

export function violenceFacts() {
  const p0 = violence.physical[0], p1 = violence.physical[violence.physical.length - 1];
  const any = violence.spousal.find((r) => r.name === 'Any of these')!;
  const phys = violence.spousal.find((r) => /^physical violence$/i.test(r.name))!;
  const help = violence.help.find((r) => /physical and sexual/i.test(r.name))!;
  return [
    `${any.women}% of women who have ever had a partner have experienced physical, sexual or emotional violence from them, and ${any.men}% of men (${p1.year}).`,
    `${phys.women}% of these women experienced physical violence from a partner, against ${phys.men}% of men.`,
    `The share of women who have faced physical violence since age 15 fell from ${p0.women}% in ${p0.year} to ${p1.women}% in ${p1.year}.`,
    `Only ${help.women}% of women who experienced both physical and sexual violence sought help from anyone.`,
  ];
}

export function facts() {
  const sex = victimsFemale.find((v) => /^sex/i.test(v.name))!;
  const hom = victimsFemale.find((v) => /^homicide/i.test(v.name));
  return [
    `The typical woman in paid work earned UGX ${n0(pay.female)} a month in 2021, against UGX ${n0(pay.male)} for a man: ${Math.round(100 * payRatio)} shillings for every 100 a man earns.`,
    `In the ${survey.split(' ')[1]} household survey, ${neet.women}% of young women aged 18–30 were not in work, school or training, against ${neet.men}% of young men.`,
    `${literacy.women}% of women can read and write, against ${literacy.men}% of men (${literacyYear}).`,
    `Women outlive men: life expectancy at birth is ${lifeLatest.female} years for women and ${lifeLatest.male} for men (${lifeLatest.year}).`,
    `The 2024 census counted ${n0(people.women - people.men)} more women than men.`,
    `${Math.round(sex.female)}% of victims of sex-related crimes in 2023 were women or girls${hom ? `, but ${Math.round(100 - hom.female)}% of homicide victims were men or boys` : ''}.`,
    `${Math.round(offendersMalePct)}% of offenders identified by police in 2023 were male.`,
    `${farmingOnly.women}% of working women only farm for their own family, against ${farmingOnly.men}% of working men (${survey.split(' ')[1]} household survey).`,
  ];
}
