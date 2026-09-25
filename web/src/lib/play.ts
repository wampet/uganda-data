// "Play & learn": data for "If Uganda were 100 people" and "Where do you fit?".
// Everything is computed at build time from the same data as the charts; the
// pages only rearrange it in the browser.
import * as D from './census';
import * as P from './population';

// ---- If Uganda were 100 … -------------------------------------------------------
/**
 * Each scene says what its 100 are, so a household share is never presented as a
 * share of people: "100 people", "100 homes", "100 children aged 6–12", ...
 */
export interface Scene {
  id: string; // census indicator id
  base: 'people' | 'homes' | 'children' | 'youth';
  /** Sentence for n out of 100; "{n}" is replaced. `one`/`zero` cover 1 and 0. */
  text: string;
  one?: string;
  zero?: string;
}
export const BASES: Record<Scene['base'], string> = {
  people: '100 people',
  homes: '100 homes',
  children: '100 children aged 6–12',
  youth: '100 young people aged 18–30',
};
export const SCENES: Scene[] = [
  { id: 'children', base: 'people', text: '{n} are children under 18.' },
  { id: 'birth_cert', base: 'people', text: '{n} have a birth certificate.', one: 'Just 1 has a birth certificate.' },
  { id: 'internet', base: 'people', text: '{n} use the internet.', one: 'Just 1 uses the internet.', zero: 'Not even one uses the internet.' },
  { id: 'insurance', base: 'people', text: '{n} have health insurance.', one: 'Just 1 has health insurance.', zero: 'Not even one has health insurance.' },
  { id: 'grid', base: 'homes', text: '{n} get electricity from the grid.', one: 'Just 1 gets electricity from the grid.', zero: 'Not one gets electricity from the grid.' },
  { id: 'solar', base: 'homes', text: '{n} light their home with solar.' },
  { id: 'water', base: 'homes', text: '{n} have safe drinking water.' },
  { id: 'sanitation', base: 'homes', text: '{n} have an improved toilet.' },
  { id: 'open_defecation', base: 'homes', text: '{n} have no toilet at all.', one: '1 has no toilet at all.', zero: 'Every one has some kind of toilet.' },
  { id: 'mosquito_net', base: 'homes', text: '{n} have a mosquito net.' },
  { id: 'radio', base: 'homes', text: '{n} own a radio.' },
  { id: 'tv', base: 'homes', text: '{n} own a TV.', one: 'Just 1 owns a TV.' },
  { id: 'subsistence', base: 'homes', text: '{n} live mainly off their own farming.' },
  { id: 'out_of_school', base: 'children', text: '{n} are not in school.' },
  { id: 'neet', base: 'youth', text: '{n} are not in work, school or training.' },
];
/** Render a scene sentence for n out of 100. */
export const sentence = (s: Scene, n: number) => (n === 0 && s.zero) || (n === 1 && s.one) || s.text.replace('{n}', String(n));
const sceneIds = SCENES.map((s) => s.id).filter((id) => D.indicatorById.has(id));

/** Values per area for the scenes: national plus every district (compact). */
export const hundred = {
  areas: [
    { code: 'UG', name: 'Uganda', slug: '', values: Object.fromEntries(sceneIds.map((id) => [id, D.national[id] ?? null])) },
    ...D.districts.map((d) => ({ code: d.code, name: d.name, slug: d.slug, values: Object.fromEntries(sceneIds.map((id) => [id, d.values[id] ?? null])) })),
  ],
  labels: Object.fromEntries(sceneIds.map((id) => [id, D.indicatorById.get(id)!.label])),
};

// ---- Where do you fit? ------------------------------------------------------------
const THIS_YEAR = new Date().getFullYear();
const pyrYear = P.pyramid.years.includes(THIS_YEAR) ? THIS_YEAR : P.pyramid.years[P.pyramid.years.length - 1];
const yi = P.pyramid.years.indexOf(pyrYear);
/** People in each 5-year age band (both sexes), for the current year's projection. */
const bandTotals = P.pyramid.bands.map((_, b) => P.pyramid.male[b][yi] + P.pyramid.female[b][yi]);

/**
 * Population by year: census counts only (1911–2024). Later birth years use the 2024
 * count rather than the older 2014-based projection, which overshoots the census.
 */
const popByYear: [number, number][] = P.history.map((h) => [h.year, h.total] as [number, number]);

export const fit = {
  year: pyrYear,
  census: { year: 2024, total: P.census2024.total },
  bands: P.pyramid.bands,     // "0–4" … "80+"
  bandTotals,
  popByYear,                  // interpolated between census years in the browser
  life: P.life.map((l) => ({ year: l.year, total: l.total })),
  medianAge: P.statFor(pyrYear).median_age,
  national: Object.fromEntries(['grid', 'water', 'internet', 'out_of_school', 'out_of_school_teen', 'neet', 'hh_size', 'children', 'unemployment'].map((id) => [id, D.national[id] ?? null])),
  districts: D.districts.map((d) => ({
    code: d.code,
    name: d.name,
    slug: d.slug,
    subregion: d.subregion,
    v: Object.fromEntries(['grid', 'water', 'internet', 'out_of_school', 'out_of_school_teen', 'neet', 'hh_size', 'children', 'unemployment', 'population'].map((id) => [id, d.values[id] ?? null])),
  })),
  ranks: Object.fromEntries(['grid', 'water', 'internet', 'out_of_school', 'neet'].map((id) => [id, Object.fromEntries(D.ranked(id).map((d, i) => [d.code, i + 1]))])),
  districtCount: D.districts.length,
};
