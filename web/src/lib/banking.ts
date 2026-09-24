// Exchange rates, interest rates, bank lending, money and insurance (build time).
// Bank and money values are billion UGX; insurance is million UGX.
import bankJson from '../data/banking.json';
import { census2024 } from './population';

interface Src { title: string; url: string; updated: string | null }

const raw = bankJson as unknown as {
  sources: Record<'fx' | 'fx_old' | 'interest' | 'money_old' | 'money' | 'life' | 'non_life', Src>;
  fx: { years: string[]; rate: number[] };
  fx_volumes: { years: string[]; purchases: number[]; sales: number[] };
  interest: { years: string[]; rates: Record<string, number[]> };
  money: { years: string[]; private_loans: number[]; government_net: number[]; m3: number[]; currency: number[]; fx_deposits: number[] };
  insurance: Record<'life' | 'non_life', { years: string[]; total: number[]; classes: { name: string; values: (number | null)[] }[] }>;
  notes: string[];
};

export const { sources, fx, interest, money, insurance, notes } = raw;
const last = <T,>(a: T[]) => a[a.length - 1];

export const fx0 = { year: fx.years[0], rate: fx.rate[0] };
export const fx1 = { year: last(fx.years), rate: last(fx.rate) };

export const rateYear = last(interest.years);
export const lending = last(interest.rates['Bank lending (shillings)']);
export const savings = last(interest.rates['Savings deposits (shillings)']);
export const cbr = last(interest.rates['Central Bank Rate']);

export const moneyYears = money.years;
export const m0 = moneyYears[0];
export const m1 = last(moneyYears);
const at = (arr: number[], y: string) => arr[moneyYears.indexOf(y)];
export const trn = (billions: number, d = 1) => `UGX ${(billions / 1000).toFixed(d)} trillion`;

export const loans0 = money.private_loans[0];
export const loans1 = last(money.private_loans);
export const gov2019 = at(money.government_net, '2019');
export const gov1 = last(money.government_net);
export const cash1 = last(money.currency);
export const cashPerPerson = (cash1 * 1e9) / census2024.total;
export const dollarShare = (100 * last(money.fx_deposits)) / last(money.m3);

export const life = insurance.life;
export const nonLife = insurance.non_life;
export const insYear0 = life.years[0];
export const insYear1 = last(life.years);
const cls = (t: typeof life, name: string) => t.classes.find((c) => c.name === name)!.values;
export const lifeIndividual = cls(life, 'Life Individual') as number[];
export const motorShare = (100 * last(cls(nonLife, 'Motor') as number[])) / last(nonLife.total);

const n0 = (v: number) => Math.round(v).toLocaleString('en-UG');

export function facts() {
  return [
    `A US dollar cost about UGX ${n0(fx0.rate)} in ${fx0.year} and UGX ${n0(fx1.rate)} in ${fx1.year}: ${Math.round((100 * (fx1.rate - fx0.rate)) / fx0.rate)}% more shillings.`,
    `In June ${rateYear}, banks charged ${lending.toFixed(1)}% a year on shilling loans on average, but paid only ${savings.toFixed(1)}% on savings accounts.`,
    `Bank loans to businesses and households grew from ${trn(loans0)} in ${m0} to ${trn(loans1)} in ${m1}.`,
    `Net lending by the banking system to central government roughly quadrupled, from ${trn(gov2019)} in 2019 to ${trn(gov1)} in ${m1}.`,
    `About ${Math.round(dollarShare)}% of Uganda’s money (cash plus bank deposits) was held in foreign currency accounts in ${m1}.`,
    `There was ${trn(cash1)} in cash outside the banks in ${m1}, about UGX ${n0(Math.round(cashPerPerson / 1000) * 1000)} for every Ugandan.`,
    `Premiums for individual life insurance grew ${Math.round(last(lifeIndividual) / lifeIndividual[0])}-fold between ${insYear0} and ${insYear1}.`,
    `Motor insurance made up ${Math.round(motorShare)}% of non-life insurance premiums in ${insYear1}.`,
  ];
}
