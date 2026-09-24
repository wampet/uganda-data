// Justice and elections: three small UBOS survey tables (build time).
// Presented plainly: these are survey answers, not official findings.
import govJson from '../data/governance.json';

interface Src { title: string; url: string; updated: string | null }

const raw = govJson as unknown as {
  sources: Record<'irregularities' | 'grievances' | 'satisfaction', Src>;
  published: string;
  irregularities: { columns: string[]; rows: { name: string; values: number[] }[] };
  grievances: { places: string[]; rows: { group: string | null; name: string; values: number[] }[] };
  satisfaction: { aspects: string[]; rows: { group: string | null; name: string; satisfied: (number | null)[] }[] };
  notes: string[];
};

export const { sources, notes } = raw;
export const publishedYear = raw.published.slice(0, 4);

const nat = raw.irregularities.columns.indexOf('National');
/** Reported irregularities by type (% of all reports), largest first; "Others" last. */
export const irregularities = raw.irregularities.rows
  .map((r) => ({ name: r.name.replace(/^Intimidation violence$/i, 'Intimidation/violence'), share: r.values[nat] }))
  .sort((a, b) => (a.name === 'Others' ? 1 : b.name === 'Others' ? -1 : b.share - a.share));

const PLACE: Record<string, string> = {
  'Local Council Leader': 'Local council (LC) leader',
  'Uganda Police Force': 'Police',
  'Family Leader': 'Family leader',
  'Religious Leader': 'Religious leader',
  'Traditional healer': 'Traditional healer',
  'Uganda Human Rights Commission': 'Uganda Human Rights Commission',
};
export const places = raw.grievances.places.map((p) => PLACE[p] ?? p);
const total = raw.grievances.rows.find((r) => r.name === 'Total')!;
export const grievanceTotal = places.map((p, i) => ({ name: p, value: total.values[i] })).sort((a, b) => b.value - a.value);
export const grievanceRegions = raw.grievances.rows.filter((r) => r.group === 'Region');

const ASPECT: Record<string, string> = {
  'Time it took to dispose-off': 'Time taken',
  'The Process': 'The process',
  'The final judgment': 'The final judgment',
  'The cost of the process': 'The cost',
};
export const aspects = raw.satisfaction.aspects.map((a) => ASPECT[a] ?? a);
export const satNational = raw.satisfaction.rows.find((r) => r.name === 'National')!.satisfied as number[];
export const satEducation = raw.satisfaction.rows.filter((r) => r.group?.startsWith('Education'));

export function facts() {
  const judg = aspects.indexOf('The final judgment');
  const deg = satEducation.find((r) => /degree/i.test(r.name));
  const none = satEducation.find((r) => /^none$/i.test(r.name));
  return [
    `Most people with a grievance took it to a local council (LC) leader (${Math.round(grievanceTotal[0].value)}%); ${Math.round(total.values[raw.grievances.places.indexOf('Uganda Police Force')])}% went to the police.`,
    `Only ${Math.round(satNational[judg])}% of people who went through a justice process were satisfied with the final judgment.`,
    ...(deg && none ? [`Satisfaction with judgments was lowest among degree holders (${Math.round(deg.satisfied[judg]!)}%), against ${Math.round(none.satisfied[judg]!)}% of people with no schooling.`] : []),
    `Among people who reported seeing an irregularity in the last presidential election before the survey, the most common type reported was ${irregularities[0].name.toLowerCase()} (${irregularities[0].share}% of reports).`,
  ];
}
