// "How well do you know Uganda?" question bank, generated at build time from the
// same data as the charts. Every answer, wrong option and explanation is computed,
// so the quiz updates itself when the data does and never states a number the
// site does not show.
import * as D from './census';
import * as C from './cpi';
import * as P from './population';
import * as G from './gdp';
import * as PR from './production';
import * as IX from './indices';
import { monthLabel } from './data';

export type Question =
  | { kind: 'choice'; id: string; topic: string; q: string; options: string[]; answer: number; explain: string; href: string }
  | { kind: 'slider'; id: string; topic: string; q: string; min: number; max: number; step: number; unit: string; answer: number; tolerance: number; explain: string; href: string };

// ---- deterministic randomness (same bank every build for the same data) -----
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20240925);
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
function shuffle<T>(a: T[]) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
/** Multiple choice from labelled options; the first entry is the right one. */
function choice(id: string, topic: string, q: string, right: string, wrong: string[], explain: string, href: string): Question {
  const options = shuffle([right, ...wrong.slice(0, 3)]);
  return { kind: 'choice', id, topic, q, options, answer: options.indexOf(right), explain, href };
}

const f1 = (v: number) => v.toFixed(1);
const f0 = (v: number) => Math.round(v).toLocaleString('en-UG');
const bank: Question[] = [];
const add = (fn: () => Question | Question[] | null) => {
  // A generator whose data is missing is skipped, never allowed to break the build.
  try {
    const q = fn();
    if (Array.isArray(q)) bank.push(...q);
    else if (q) bank.push(q);
  } catch {
    /* skip */
  }
};

// ---- guess the number (sliders) ------------------------------------------------
function slider(id: string, topic: string, q: string, answer: number, opts: { min?: number; max?: number; unit?: string; tolerance?: number; step?: number }, explain: string, href: string): Question {
  return { kind: 'slider', id, topic, q, answer: Math.round(answer * 10) / 10, min: opts.min ?? 0, max: opts.max ?? 100, step: opts.step ?? 1, unit: opts.unit ?? '%', tolerance: opts.tolerance ?? 5, explain, href };
}

add(() => slider('under18', 'People', 'What share of Ugandans are under 18?', D.national.children!, {},
  `${f1(D.national.children!)}% of Ugandans counted in the 2024 census were under 18: about half the country.`, '/people/population/age-and-growth/'));
add(() => {
  const s = P.statFor(2024);
  return slider('median-age', 'People', 'Half of all Ugandans are younger than… what age?', s.median_age, { min: 10, max: 45, unit: ' years', tolerance: 3 },
    `The median age is about ${f1(s.median_age)} years (UBOS projection for 2024): half of all Ugandans are children or teenagers.`, '/people/population/age-and-growth/');
});
add(() => slider('grid', 'Homes', 'What share of Uganda’s households get electricity from the grid?', D.national.grid!, {},
  `${f1(D.national.grid!)}% of households are on the grid (Census 2024). Another ${f1(D.national.solar!)}% light their homes with solar.`, '/places/districts/?show=grid'));
add(() => slider('internet', 'Connected', 'Out of every 100 Ugandans, how many use the internet?', D.national.internet!, { unit: '', tolerance: 5 },
  `About ${f1(D.national.internet!)} in every 100 people used the internet, according to the 2024 census.`, '/places/districts/?show=internet'));
add(() => slider('insurance', 'Health', 'What share of Ugandans have health insurance?', D.national.insurance!, { tolerance: 4 },
  `Only ${f1(D.national.insurance!)}% of people have health insurance (Census 2024). Most pay for care out of pocket.`, '/places/districts/?show=insurance'));
add(() => slider('birth-cert', 'People', 'What share of Ugandans have a birth certificate?', D.national.birth_cert!, {},
  `Just ${f1(D.national.birth_cert!)}% of people have a birth certificate (Census 2024), though more have a birth notification.`, '/places/districts/?show=birth_cert'));
add(() => slider('out-of-school', 'Education', 'What share of children aged 6–12 are out of school?', D.national.out_of_school!, {},
  `${f1(D.national.out_of_school!)}% of children aged 6–12 were out of school in 2024, and over 80% in parts of Karamoja.`, '/places/districts/?show=out_of_school'));
add(() => slider('informal', 'Economy', 'What share of everything Uganda produces comes from the informal sector?', G.latest.informal!, {},
  `The informal sector made ${f1(G.latest.informal!)}% of GDP in ${G.latest.year}: small unregistered businesses and farms.`, '/economy/gdp/economic-growth/'));
add(() => {
  const oil = PR.industry.products.find((p) => p.name === 'Cooking oil')!;
  return slider('cooking-oil', 'Industry', 'What share of the cooking oil Ugandans use is made in Uganda?', oil.local_share!, { tolerance: 7 },
    `About ${Math.round(oil.local_share!)}% in ${oil.latest_year}; the rest is imported. For cement, beer and soft drinks it is over 95%.`, '/production/industry/made-in-uganda/');
});
add(() => {
  const cap = PR.energy.capacity;
  const li = cap.years.length - 1;
  const total = Object.values(cap.series).reduce((a, v) => a + (v[li] ?? 0), 0);
  const hydro = (cap.series.Hydro[li]! / total) * 100;
  return slider('hydro', 'Energy', 'What share of Uganda’s power-generating capacity comes from hydro dams?', hydro, { tolerance: 7 },
    `About ${Math.round(hydro)}% of the ${f0(total)} MW Uganda could generate in ${cap.years[li]} was hydro.`, '/production/energy/power-and-fuel/');
});
add(() => slider('livestock-hh', 'Farming', 'What share of Uganda’s households keep livestock?', D.national.livestock_hh!, {},
  `${f1(D.national.livestock_hh!)}% of households kept animals in the 2021 livestock census, from chickens to cattle.`, '/places/districts/?show=livestock_hh'));

// ---- multiple choice: national numbers -------------------------------------------
add(() => {
  const m = P.census2024.total / 1e6;
  const opts = [m, m * 0.78, m * 1.15, m * 1.32].map((v) => `${v.toFixed(1)} million`);
  return choice('census-count', 'People', 'How many people did the 2024 census count in Uganda?', opts[0], opts.slice(1),
    `${P.millions(P.census2024.total)}, up from ${P.millions(P.history.find((h) => h.year === 2014)!.total)} in 2014.`, '/people/population/age-and-growth/');
});
add(() => {
  const v = G.latest.perCapitaUsd;
  const r = (x: number) => `US$${(Math.round(x / 50) * 50).toLocaleString()}`;
  return choice('gdp-pc', 'Economy', `Roughly how much does Uganda produce per person in a year (GDP per person, ${G.latest.year})?`, r(v), [r(v * 0.45), r(v * 2.2), r(v * 4)],
    `About US$${Math.round(v).toLocaleString()} per person, or UGX ${(G.latest.perCapitaUgx / 1e6).toFixed(1)} million.`, '/economy/gdp/economic-growth/');
});
add(() => {
  const h = C.headline;
  const opts = [h, h + 4.5, h + 9, Math.max(0.3, h / 4)].map((v) => `${v.toFixed(1)}%`);
  return choice('inflation', 'Prices', `How fast were prices rising in ${monthLabel(C.latestMonth, true)} (annual inflation)?`, opts[0], opts.slice(1),
    `${h.toFixed(1)}% a year. The fastest in recent years was ${C.peak.value.toFixed(1)}% in ${monthLabel(C.peak.month, true)}.`, '/economy/prices/inflation/');
});

// ---- multiple choice: which is highest ---------------------------------------------
function highest<T>(id: string, topic: string, q: string, items: T[], value: (t: T) => number, name: (t: T) => string, fmt: (v: number) => string, href: string) {
  const sorted = [...items].sort((a, b) => value(b) - value(a));
  const top = sorted[0];
  // Wrong options clearly below the winner: from the lower two-thirds when there are
  // many to choose from, otherwise any other item (e.g. the 4 Kampala areas).
  const rest = sorted.length <= 5 ? sorted.slice(1) : sorted.slice(Math.ceil(sorted.length / 3));
  const pool = rest.filter((t) => value(t) < value(top) * 0.8 || value(top) - value(t) > 2);
  const wrong = shuffle(pool).slice(0, 3);
  if (wrong.length < 3) return null;
  return choice(id, topic, q, name(top), wrong.map(name),
    `${name(top)}: ${fmt(value(top))}. ${wrong.map((w) => `${name(w)}: ${fmt(value(w))}`).join('; ')}.`, href);
}

add(() => highest('town-inflation', 'Prices', `In which town were prices rising fastest in ${monthLabel(C.latestMonth, true)}?`, C.centres.filter((c) => c.yoy != null),
  (c) => c.yoy!, (c) => c.name, (v) => `${v.toFixed(1)}%`, '/economy/prices/inflation/'));
add(() => highest('category-inflation', 'Prices', 'Which household cost rose fastest over the last year?', C.divisions.filter((d) => d.yoy != null),
  (d) => d.yoy!, (d) => d.name, (v) => `${v.toFixed(1)}%`, '/economy/prices/inflation/'));
add(() => highest('item-riser', 'Prices', 'Which of these got the most expensive over the last year?', [...C.risers.slice(0, 4), ...C.fallers.slice(0, 6)],
  (i) => i.yoy, (i) => i.name, (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`, '/economy/prices/inflation/'));
add(() => {
  const f = PR.agriculture.fish;
  const y = f.years[f.years.length - 1];
  const lakes = Object.keys(f.series).filter((k) => !/other/i.test(k)).map((k) => ({ k, v: PR.valueIn(f, k, y) ?? 0 }));
  return highest('fish-lake', 'Farming', `Which lake landed the most fish in ${y}?`, lakes, (l) => l.v, (l) => (/nile/i.test(l.k) ? l.k : `Lake ${l.k}`), (v) => `${f0(v)} tonnes`, '/production/agriculture/livestock-and-fish/');
});
add(() => {
  const parks = PR.tourism.parks;
  const li = parks.years.length - 1;
  return highest('park', 'Tourism', `Which national park had the most visitors in ${parks.years[li]}?`, parks.rows.filter((r) => r.values[li] != null),
    (r) => r.values[li]!, (r) => r.name, (v) => `${f0(v)} visitors`, '/production/tourism/visitors/');
});
add(() => highest('house-area', 'Prices', 'Where in greater Kampala have house prices risen most since 2015/16?', IX.housePrices().since,
  (a) => a.change, (a) => a.area, (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`, '/economy/prices/house-prices/'));
add(() => highest('material', 'Prices', 'Which building material’s price has risen most since 2016/17?', IX.buildingCosts().byMaterial,
  (m) => m.since, (m) => m.name, (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`, '/economy/prices/construction-costs/'));

const districtsWith = (id: string) => D.districts.filter((d) => d.values[id] != null);
for (const [id, q] of [
  ['cattle_per_100', 'Which district has the most cattle per person?'],
  ['neet', 'Which district has the highest share of young people (18–30) not in work, school or training?'],
  ['out_of_school', 'In which district are the most primary-age children out of school?'],
  ['density', 'Which district or city is the most crowded (people per km²)?'],
  ['honey_kg', 'Which district harvests the most honey?'],
] as const) {
  add(() => {
    const ind = D.indicatorById.get(id)!;
    return highest(`top-${id}`, ind.group, q, districtsWith(id), (d) => d.values[id]!, (d) => d.name, (v) => D.fmtValue(ind, v), `/places/districts/?show=${id}`);
  });
}

// ---- higher or lower: two districts ----------------------------------------------
// Only well-known (larger) districts, and only clear differences, so the answer is
// never decided by a rounding error.
const known = [...D.districts].sort((a, b) => (b.values.population ?? 0) - (a.values.population ?? 0)).slice(0, 60);
const PAIRS: [string, (a: string, b: string) => string][] = [
  ['grid', (a, b) => `Which has more homes on grid electricity: ${a} or ${b}?`],
  ['water', (a, b) => `Which has more households with safe drinking water: ${a} or ${b}?`],
  ['internet', (a, b) => `Where do more people use the internet: ${a} or ${b}?`],
  ['out_of_school', (a, b) => `Where are more children aged 6–12 out of school: ${a} or ${b}?`],
  ['neet', (a, b) => `Where are more young people not in work, school or training: ${a} or ${b}?`],
  ['sanitation', (a, b) => `Which has more households with improved toilets: ${a} or ${b}?`],
  ['cattle_per_100', (a, b) => `Which has more cattle per person: ${a} or ${b}?`],
  ['chickens_per_100', (a, b) => `Which has more chickens per person: ${a} or ${b}?`],
  ['hh_size', (a, b) => `Where are households bigger: ${a} or ${b}?`],
  ['children', (a, b) => `Where are more of the people children (under 18): ${a} or ${b}?`],
];
for (const [id, text] of PAIRS) {
  const ind = D.indicatorById.get(id);
  if (!ind) continue;
  const pool = known.filter((d) => d.values[id] != null);
  let made = 0;
  for (let tries = 0; tries < 60 && made < 6; tries++) {
    const a = pick(pool);
    const b = pick(pool);
    if (a === b) continue;
    const va = a.values[id]!;
    const vb = b.values[id]!;
    const gap = Math.abs(va - vb);
    if (gap < Math.max(Math.abs(va), Math.abs(vb)) * 0.25 || (ind.unit === '%' && gap < 5)) continue;
    const [hi, lo] = va > vb ? [a, b] : [b, a];
    bank.push({
      kind: 'choice',
      id: `pair-${id}-${a.code}-${b.code}`,
      topic: ind.group,
      q: text(a.name, b.name),
      options: [a.name, b.name],
      answer: va > vb ? 0 : 1,
      explain: `${hi.name}: ${D.fmtValue(ind, hi.values[id])}. ${lo.name}: ${D.fmtValue(ind, lo.values[id])}. Uganda: ${D.fmtValue(ind, D.national[id])}.`,
      href: `/places/districts/?show=${id}`,
    });
    made++;
  }
}

export const questions: Question[] = bank;
export const topics = [...new Set(bank.map((q) => q.topic))];
