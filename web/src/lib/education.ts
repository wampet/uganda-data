// Education: literacy, exams, progression through school, learning (build time).
import eduJson from '../data/education.json';
import { indicatorById, national as censusNational, ranked } from './census';

interface Src { title: string; url: string; updated: string | null }
interface LitRow { year: string; urban: number | null; rural: number | null; total: number }

const raw = eduJson as unknown as {
  sources: Record<'literacy' | 'ple' | 'uce' | 'uace' | 'p7' | 's4' | 'nape', Src>;
  literacy: { Male: LitRow[]; Female: LitRow[]; Total: LitRow[] };
  ple_2023: { registered: number; sat: number; passed: number; pass_rate: number; divisions: { name: string; candidates: number }[] };
  uce: { year: number; registered: number; sat: number }[];
  uace: Record<string, { grade: string; candidates: number; pct: number }[]>;
  progression: { years: string[]; rates: { name: string; values: (number | null)[] }[] };
  nape: { years: string[]; rows: { name: string; values: (number | null)[] }[] };
  notes: string[];
};

export const { sources, literacy, uce, uace, progression, nape, notes } = raw;
export const ple = raw.ple_2023;

const last = <T,>(a: T[]) => a[a.length - 1];
export const literacyLatest = last(literacy.Total);
export const pleShare = (name: string) => (100 * ple.divisions.find((d) => d.name === name)!.candidates) / ple.sat;
export const uaceYears = Object.keys(uace).sort();

export const outOfSchool = {
  primary: censusNational.out_of_school,
  teens: censusNational.out_of_school_teen,
  worst: ranked('out_of_school')[0],
  label: indicatorById.get('out_of_school')!.label,
};

const rate = (name: string) => progression.rates.find((r) => r.name.startsWith(name))!;
export const p7Completion = rate('P.7 Completion');
export const s4Completion = rate('Senior 4 Completion');
export const progressionYear = last(progression.years);

export function facts() {
  const m = last(literacy.Male);
  const f = last(literacy.Female);
  const p6num = nape.rows.find((r) => r.name === 'Competence in Numeracy at P.6');
  const p6numLatest = p6num ? [...p6num.values].reverse().find((v) => v != null) : null;
  const numYear = p6num ? nape.years[p6num.values.lastIndexOf(p6numLatest ?? null)] : null;
  return [
    `${Math.round(outOfSchool.primary ?? 0)}% of children aged 6–12 were not in school at the 2024 census; in ${outOfSchool.worst.name} it was ${Math.round(outOfSchool.worst.values.out_of_school ?? 0)}%.`,
    `${ple.sat.toLocaleString()} pupils sat PLE in 2023. ${ple.pass_rate}% passed, but only ${pleShare('DIV I').toFixed(0)}% got Division I and ${pleShare('DIV U').toFixed(0)}% were ungraded.`,
    `${literacyLatest.total}% of Ugandans aged 10 and over could read and write in ${literacyLatest.year}. In ${m.year}, it was ${m.total}% of men and ${f.total}% of women.`,
    `In ${progressionYear}, the P.7 completion rate was ${last(p7Completion.values)}% and the S.4 completion rate ${last(s4Completion.values)}%.`,
    ...(p6numLatest != null ? [`Only ${p6numLatest}% of P.6 pupils reached the expected level in numeracy (${numYear}).`] : []),
    `${uce[uce.length - 1].sat.toLocaleString()} students sat UCE (S.4) in ${uce[uce.length - 1].year}, up from ${uce[0].sat.toLocaleString()} in ${uce[0].year}.`,
  ];
}
