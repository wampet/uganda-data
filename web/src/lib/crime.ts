// Crime reported to police, victims, offenders and prisons (build time).
import crimeJson from '../data/crime.json';

interface Src { title: string; url: string; updated: string | null }
interface Victims { name: string; male_adult: number; male_child: number; female_adult: number; female_child: number; total: number }

const raw = crimeJson as unknown as {
  sources: Record<'categories' | 'reported' | 'serious' | 'victims' | 'offenders' | 'prison' | 'capacity' | 'offences' | 'recidivism', Src>;
  years: string[];
  categories: { name: string; reported: (number | null)[]; prosecuted: (number | null)[] }[];
  total: { reported: number[]; prosecuted: number[] };
  reported_detail: { years: string[]; rows: { name: string; values: number[] }[] };
  serious: { years: string[]; mob: number[]; defilement: number[] };
  victims_2023: Victims[];
  offenders_2023: { male: number; female: number; total: number; juvenile: number };
  prison: { years: string[]; remand: number[]; convicted: number[]; debtors: number[]; total: number[]; deaths: number[]; babies: number[] };
  capacity: { region: string; capacity: (number | null)[]; occupancy: (number | null)[] }[];
  offences_2023: { name: string; convicts: number; remand: number; total: number }[];
  recidivism: { year: string; rate: number; admissions: number };
  notes: string[];
};

export const { sources, years, total, serious, prison, recidivism, notes } = raw;
const last = <T,>(a: T[]) => a[a.length - 1];
export const year = last(years);
export const y0 = years[0];
export const reported = last(total.reported);
export const prosecuted = last(total.prosecuted);
export const prosecutedPct = (100 * prosecuted) / reported;

/** Latest year's reported cases by category, largest first. */
export const categories = raw.categories
  .map((c) => ({ name: c.name.replace(/ in general$/i, ''), reported: last(c.reported) ?? 0, prosecuted: last(c.prosecuted) ?? 0 }))
  .sort((a, b) => b.reported - a.reported);
const named = categories.filter((c) => !/^other/i.test(c.name));
export const topCrime = named[0];

export const victims = raw.victims_2023;
const sexVictims = victims.find((v) => /^sex/i.test(v.name))!;
export const girlsShareSex = (100 * sexVictims.female_child) / sexVictims.total;
export const sexVictimsTotal = sexVictims.total;
export const offenders = raw.offenders_2023;
export const maleOffenderPct = (100 * offenders.male) / offenders.total;

export const prisonYear = last(prison.years);
export const prisoners = last(prison.total);
export const remandPct = (100 * last(prison.remand)) / prisoners;
export const national = raw.capacity.find((c) => c.region === 'National')!;
export const capacity = last(national.capacity) as number;
export const occupancy = last(national.occupancy) as number;
export const regions = raw.capacity
  .filter((c) => c.region !== 'National')
  .map((c) => ({ region: c.region, occupancy: last(c.occupancy) as number, capacity: last(c.capacity) as number }))
  .sort((a, b) => b.occupancy - a.occupancy);

export const offences = [...raw.offences_2023]
  .map((o) => ({ ...o, name: o.name === 'Others' ? 'Other offences' : o.name }))
  .sort((a, b) => b.total - a.total);

const n0 = (v: number) => Math.round(v).toLocaleString('en-UG');

export function facts() {
  const mob0 = serious.mob[0], mob1 = last(serious.mob);
  return [
    `Police recorded ${n0(reported)} crimes in ${year}, up from ${n0(total.reported[0])} in ${y0}. ${n0(prosecuted)} cases were taken to court that year, equal to ${Math.round(prosecutedPct)}% of the number reported.`,
    `Theft is the most reported crime: ${n0(topCrime.reported)} cases in ${year}, about ${Math.round(topCrime.reported / 365)} a day.`,
    `Of ${n0(sexVictimsTotal)} victims of sex-related crimes in ${year}, ${Math.round(girlsShareSex)}% were girls under 18.`,
    `${Math.round(maleOffenderPct)}% of people identified as offenders in ${year} were male.`,
    `Deaths from mob justice rose from ${n0(mob0)} in ${serious.years[0]} to ${n0(mob1)} in ${last(serious.years)}, nearly ${Math.round(mob1 / 365)} a day.`,
    `Uganda’s prisons held ${n0(prisoners)} people in ${prisonYear}, in space built for ${n0(capacity)}: ${Math.round(occupancy / 100 * 10) / 10} people for every place.`,
    `${Math.round(remandPct)}% of prisoners in ${prisonYear} were on remand, waiting for trial without a conviction.`,
    `${n0(last(prison.babies))} babies were living in prison with their mothers in ${prisonYear}, and ${n0(last(prison.deaths))} prisoners died.`,
    `About ${Math.round(recidivism.rate)}% of people admitted to prison in ${recidivism.year} had been in prison before.`,
  ];
}
