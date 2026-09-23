// Health: child survival, fertility, maternal care, prevention, spending (build time).
import healthJson from '../data/health.json';
import { national as censusNational } from './census';

interface Src { title: string; url: string; updated: string | null }
type Series = { survey: string; value: number }[];

const raw = healthJson as unknown as {
  sources: Record<'under5' | 'infant' | 'fertility' | 'maternal' | 'stunting' | 'vaccination' | 'teen' | 'nets' | 'hiv' | 'spending' | 'facilities' | 'budget', Src>;
  under5_mortality: Series;
  infant_mortality: Series;
  fertility: Series;
  maternal: { surveys: string[]; rows: { name: string; values: number[] }[] };
  stunting: Series;
  vaccination: Series;
  teen_childbearing: Series;
  mosquito_nets: Series;
  hiv_testing: { surveys: string[]; male: number[]; female: number[] };
  public_spending_per_person: { year: string; ugx: number }[];
  budget_share: { year: string; pct: number }[];
  facilities: { columns: string[]; rows: { year: string; values: number[] }[] };
  notes: string[];
};

export const {
  sources, maternal, notes, facilities,
  under5_mortality: under5, infant_mortality: infant, fertility, stunting, vaccination,
  teen_childbearing: teen, mosquito_nets: nets, hiv_testing: hiv,
  public_spending_per_person: spending, budget_share: budgetShare,
} = raw;

const first = <T,>(a: T[]) => a[0];
const last = <T,>(a: T[]) => a[a.length - 1];

/** "2014-15 Malaria Indicator Survey" -> "2014-15 (MIS)" for compact axes. */
export const shortSurvey = (s: string) => s.replace(/\s*Malaria Indicators? Survey/i, ' (MIS)');

export const censusNets = censusNational.mosquito_net;
export const censusInsurance = censusNational.insurance;

export function facts() {
  const u5a = first(under5), u5b = last(under5);
  const facility = maternal.rows.find((r) => r.name.toLowerCase().startsWith('birth in a health facility'));
  const tf0 = first(fertility), tf1 = last(fertility);
  const st0 = first(stunting), st1 = last(stunting);
  const sp0 = first(spending), sp1 = last(spending);
  return [
    `Out of every 1,000 children born, ${u5b.value} died before their 5th birthday in ${u5b.survey}, down from ${u5a.value} in ${u5a.survey}.`,
    `Women had ${tf1.value} children on average in ${tf1.survey}, down from ${tf0.value} in ${tf0.survey}.`,
    ...(facility ? [`${last(facility.values)}% of births took place in a health facility in ${last(maternal.surveys)}, up from ${first(facility.values)}% in ${first(maternal.surveys)}.`] : []),
    `${st1.value}% of children under 5 were stunted (too short for their age) in ${st1.survey}, down from ${st0.value}% in ${st0.survey}.`,
    `${Math.round(censusNets ?? 0)}% of households had a mosquito net at the 2024 census, but only ${(censusInsurance ?? 0).toFixed(1)}% of people had health insurance.`,
    `Public health spending per person rose from UGX ${sp0.ugx.toLocaleString('en-UG')} in ${sp0.year} to UGX ${sp1.ugx.toLocaleString('en-UG')} in ${sp1.year}.`,
    `About ${last(teen).value}% of teenage girls aged 15–19 had begun childbearing in ${last(teen).survey}.`,
  ];
}
