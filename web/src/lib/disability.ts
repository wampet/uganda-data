// Disability (functional difficulty), UDHS 2022 (build time).
import disJson from '../data/disability.json';

interface Src { title: string; url: string; updated: string | null }
type Pair = { name: string; Male?: number; Female?: number; Men?: number; Women?: number };

const raw = disJson as unknown as {
  sources: Record<'domains' | 'trend' | 'age' | 'region' | 'wealth' | 'education' | 'marital', Src>;
  survey: string;
  national_pct: number;
  domains: { name: string; some: number; severe: number }[];
  trend: { survey: string; severe: number; some: number }[];
  by_age: { age: string; pct: number }[];
  by_subregion: Pair[];
  by_wealth: Pair[];
  by_education: Pair[];
  by_marital: Pair[];
  notes: string[];
};

export const { sources, survey, domains, trend, notes } = raw;
export const national = raw.national_pct;
export const byAge = raw.by_age.map((a) => ({ ...a, age: a.age.replace('-', '–') }));
const men = (p: Pair) => (p.Male ?? p.Men)!;
const women = (p: Pair) => (p.Female ?? p.Women)!;
const pairs = (rows: Pair[]) => rows.map((p) => ({ name: p.name, men: men(p), women: women(p) }));
const nat = raw.by_wealth.find((w) => w.name === 'National')!;
export const bySex = { men: men(nat), women: women(nat) };
export const byWealth = pairs(raw.by_wealth.filter((w) => w.name !== 'National'))
  .map((w, i, a) => ({ ...w, name: i === 0 ? 'Poorest fifth' : i === a.length - 1 ? 'Richest fifth' : `${w.name} fifth` }));
export const bySubregion = pairs(raw.by_subregion).sort((a, b) => b.women + b.men - (a.women + a.men));
export const byEducation = pairs(raw.by_education).map((e) => ({ ...e, name: e.name.replace('Pre-primary/No school', 'No schooling') }));
export const byMarital = pairs(raw.by_marital);
export const domainsSorted = [...domains].sort((a, b) => b.severe - a.severe);

export function facts() {
  const old = byAge[byAge.length - 1];
  const top = domainsSorted[0];
  const [hi] = bySubregion;
  const poor = byWealth[0], rich = byWealth[byWealth.length - 1];
  const noSchool = byEducation[0];
  return [
    `About ${national}% of Ugandans aged 5 and over live with a disability: a lot of difficulty, or being unable, to see, hear, walk, remember, care for themselves or communicate (${survey}).`,
    `Disability rises steeply with age: ${old.pct}% of people aged ${old.age} have one.`,
    `Women are more likely than men to have a disability (${bySex.women}% vs ${bySex.men}%).`,
    `${top.name} is the most common difficulty (${top.severe}% of people have a lot of difficulty); a further ${top.some}% have some difficulty.`,
    `Women in the poorest households are ${(poor.women / rich.women).toFixed(1)} times as likely to have a disability as women in the richest (${poor.women}% vs ${rich.women}%).`,
    `${hi.name} has the highest rate of any sub-region: ${hi.women}% of women and ${hi.men}% of men.`,
    `Among women with no schooling, ${noSchool.women}% have a disability.`,
  ];
}
