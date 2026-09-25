// "How well do you know Uganda?" question bank, generated at build time from the
// same data as the charts. Every answer, wrong option and explanation is computed,
// so the quiz updates itself when the data does and never states a number the
// site does not show.
//
// Freshness rule: a quiz is about Uganda now, so questions use data from the last
// two years only (counted from the build date). The one exception is the 2024
// census ("landmark"): it is the latest count of the whole country until the next
// census, and its questions say so. Every question shows its data date.
import * as D from './census';
import * as C from './cpi';
import * as P from './population';
import * as G from './gdp';
import * as PR from './production';
import * as IX from './indices';
import { monthLabel } from './data';

interface Meta { asOf: string; year: number; landmark?: boolean }
export type Question = Meta & (
  | { kind: 'choice'; id: string; topic: string; q: string; options: string[]; answer: number; explain: string; href: string }
  | { kind: 'slider'; id: string; topic: string; q: string; min: number; max: number; step: number; unit: string; answer: number; tolerance: number; explain: string; href: string }
);
type Draft = Omit<Extract<Question, { kind: 'choice' }>, keyof Meta> | Omit<Extract<Question, { kind: 'slider' }>, keyof Meta>;

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

const f1 = (v: number) => v.toFixed(1);
const signed = (v: number, d = 1) => `${v > 0 ? '+' : ''}${v.toFixed(d)}%`;

// ---- data dates ------------------------------------------------------------------
/** "2026-08" -> 2026; "2025/26" or "2025/26 Q4" -> 2026. */
const yearOf = (label: string) => {
  const fy = label.match(/(\d{4})\/(\d{2})/);
  if (fy) return 2000 + Number(fy[2]);
  return Number(label.slice(0, 4));
};
const month = (ym: string): Meta => ({ asOf: monthLabel(ym, true), year: yearOf(ym) });
const fiscal = (fy: string): Meta => ({ asOf: fy, year: yearOf(fy) });
const CENSUS: Meta = { asOf: 'Census 2024', year: 2024, landmark: true };

const bank: Question[] = [];
/** Add a question (or several); a generator whose data is missing is skipped. */
function add(meta: Meta | (() => Meta), fn: () => Draft | Draft[] | null) {
  try {
    const m = typeof meta === 'function' ? meta() : meta;
    const out = fn();
    for (const q of Array.isArray(out) ? out : out ? [out] : []) bank.push({ ...q, ...m } as Question);
  } catch {
    /* skip */
  }
}

function choice(id: string, topic: string, q: string, right: string, wrong: string[], explain: string, href: string): Draft {
  const options = shuffle([right, ...wrong.slice(0, 3)]);
  return { kind: 'choice', id, topic, q, options, answer: options.indexOf(right), explain, href };
}
function slider(id: string, topic: string, q: string, answer: number, o: { min?: number; max?: number; unit?: string; tolerance?: number; step?: number }, explain: string, href: string): Draft {
  return { kind: 'slider', id, topic, q, answer: Math.round(answer * 10) / 10, min: o.min ?? 0, max: o.max ?? 100, step: o.step ?? 1, unit: o.unit ?? '%', tolerance: o.tolerance ?? 5, explain, href };
}
/** "Which is highest?" with wrong options clearly below the winner. */
function highest<T>(id: string, topic: string, q: string, items: T[], value: (t: T) => number, name: (t: T) => string, fmt: (v: number) => string, href: string): Draft | null {
  const sorted = [...items].sort((a, b) => value(b) - value(a));
  const top = sorted[0];
  const rest = sorted.length <= 5 ? sorted.slice(1) : sorted.slice(Math.ceil(sorted.length / 3));
  const pool = rest.filter((t) => value(t) < value(top) * 0.8 || value(top) - value(t) > 2);
  const wrong = shuffle(pool).slice(0, 3);
  if (wrong.length < 3) return null;
  return choice(id, topic, q, name(top), wrong.map(name),
    `${name(top)}: ${fmt(value(top))}. ${wrong.map((w) => `${name(w)}: ${fmt(value(w))}`).join('; ')}.`, href);
}

// ==== Prices (monthly and quarterly: always fresh) ================================
const cpiMonth = month(C.latestMonth);
add(cpiMonth, () => {
  const h = C.headline;
  const opts = [h, h + 4.5, h + 9, Math.max(0.3, h / 4)].map((v) => `${v.toFixed(1)}%`);
  return choice('inflation', 'Prices', 'How fast are prices rising in Uganda (annual inflation)?', opts[0], opts.slice(1),
    `${h.toFixed(1)}% a year in ${monthLabel(C.latestMonth, true)}. The fastest in recent years was ${C.peak.value.toFixed(1)}% in ${monthLabel(C.peak.month, true)}.`, '/economy/prices/inflation/');
});
add(cpiMonth, () => highest('town-inflation', 'Prices', 'In which town are prices rising fastest?', C.centres.filter((c) => c.yoy != null),
  (c) => c.yoy!, (c) => c.name, (v) => `${v.toFixed(1)}%`, '/economy/prices/inflation/'));
add(cpiMonth, () => highest('category-inflation', 'Prices', 'Which household cost has risen fastest over the last year?', C.divisions.filter((d) => d.yoy != null),
  (d) => d.yoy!, (d) => d.name, (v) => `${v.toFixed(1)}%`, '/economy/prices/inflation/'));
add(cpiMonth, () => highest('item-riser', 'Prices', 'Which of these has got the most expensive over the last year?', [...C.risers.slice(0, 4), ...C.fallers.slice(0, 6)],
  (i) => i.yoy, (i) => i.name, (v) => signed(v, 0), '/economy/prices/inflation/'));
add(cpiMonth, () => {
  const v = C.last(C.s('fuel').yoy)!;
  return slider('fuel', 'Prices', 'How much more do petrol, diesel and paraffin cost than a year ago?', v, { min: -30, max: 60, tolerance: 6 },
    `Liquid fuels cost ${signed(v)} compared with a year earlier (${monthLabel(C.latestMonth, true)}).`, '/economy/prices/inflation/');
});
add(cpiMonth, () => {
  const v = C.last(C.s('food-crops').yoy)!;
  return slider('food-crops', 'Prices', 'By how much have food crop prices (matooke, beans, maize…) changed in a year?', v, { min: -30, max: 40, tolerance: 5 },
    `Food crop prices changed ${signed(v)} in the year to ${monthLabel(C.latestMonth, true)}. They swing with harvests.`, '/economy/prices/inflation/');
});
add(() => fiscal(IX.housePrices().latest), () => {
  const h = IX.housePrices();
  return slider('house-yoy', 'Prices', 'By how much did house prices in greater Kampala change over the last year?', h.yoy, { min: -20, max: 30, tolerance: 4 },
    `${signed(h.yoy)} in the year to ${h.latest}. Since 2015/16 they are ${signed(h.sinceBase, 0)}.`, '/economy/prices/house-prices/');
});
add(() => fiscal(IX.housePrices().latest), () => highest('house-area', 'Prices', 'Where in greater Kampala have house prices risen most since 2015/16?', IX.housePrices().since,
  (a) => a.change, (a) => a.area, (v) => signed(v, 0), '/economy/prices/house-prices/'));
add(() => month(IX.buildingCosts().latest), () => highest('material', 'Prices', 'Which building material’s price has risen most since 2016/17?', IX.buildingCosts().byMaterial,
  (m) => m.since, (m) => m.name, (v) => signed(v, 0), '/economy/prices/construction-costs/'));
add(() => month(IX.buildingCosts().latest), () => {
  const b = IX.buildingCosts();
  return slider('build-since', 'Prices', 'By how much has the cost of building gone up since 2016/17?', b.sinceBase, { min: 0, max: 100, tolerance: 7 },
    `Building costs are ${signed(b.sinceBase, 0)} since 2016/17 (${monthLabel(b.latest, true)}). ${b.facts[1].split('. ')[1] ?? ''}`, '/economy/prices/construction-costs/');
});
add(() => month(IX.producerPrices().latest), () => {
  const p = IX.producerPrices();
  return highest('ppi-industry', 'Prices', 'Which factories raised their prices most over the last year?', p.ranked,
    (x) => x.yoy, (x) => x.name, (v) => signed(v), '/economy/prices/producer-prices/');
});
add(() => month(IX.producerPrices().latest), () => {
  const fs = IX.factoryVsShop();
  const i = fs.months.length - 1;
  const ppi = fs.ppi[i];
  const cpi = fs.cpi[i];
  if (ppi == null || cpi == null || Math.abs(ppi - cpi) < 0.5) return null;
  const faster = ppi > cpi ? 'Factory prices' : 'Shop prices';
  return {
    kind: 'choice', id: 'ppi-vs-cpi', topic: 'Prices',
    q: 'Over the last year, which rose faster: factory prices or shop prices?',
    options: ['Factory prices', 'Shop prices'], answer: faster === 'Factory prices' ? 0 : 1,
    explain: `In the year to ${monthLabel(fs.months[i], true)}, factory prices changed ${signed(ppi)} and shop prices ${signed(cpi)}.`,
    href: '/economy/prices/producer-prices/',
  };
});

// ==== Economy (annual and quarterly GDP) ============================================
const gdpYear = fiscal(G.latest.year);
add(gdpYear, () => {
  const g = G.latest.growth;
  const opts = [g, g + 3.5, Math.max(0.5, g - 3.5), g + 7].map((v) => `${v.toFixed(1)}%`);
  return choice('gdp-growth', 'Economy', `How fast did Uganda’s economy grow in ${G.latest.year}?`, opts[0], opts.slice(1),
    `${g.toFixed(1)}% after taking out price rises, up from ${G.latest.prevGrowth.toFixed(1)}% the year before.`, '/economy/gdp/economic-growth/');
});
add(gdpYear, () => {
  const v = G.latest.perCapitaUsd;
  const r = (x: number) => `US$${(Math.round(x / 50) * 50).toLocaleString()}`;
  return choice('gdp-pc', 'Economy', `Roughly how much does Uganda produce per person in a year (GDP per person)?`, r(v), [r(v * 0.45), r(v * 2.2), r(v * 4)],
    `About US$${Math.round(v).toLocaleString()} per person in ${G.latest.year}, or UGX ${(G.latest.perCapitaUgx / 1e6).toFixed(1)} million.`, '/economy/gdp/economic-growth/');
});
add(gdpYear, () => slider('informal', 'Economy', 'What share of everything Uganda produces comes from the informal sector?', G.latest.informal!, {},
  `The informal sector made ${f1(G.latest.informal!)}% of GDP in ${G.latest.year}: small unregistered businesses and farms.`, '/economy/gdp/economic-growth/'));

// ==== People: projections (current year) and the 2024 census (landmark) ============
add({ asOf: 'UBOS projection for 2024', year: 2024 }, () => {
  const s = P.statFor(2024);
  return slider('median-age', 'People', 'Half of all Ugandans are younger than… what age?', s.median_age, { min: 10, max: 45, unit: ' years', tolerance: 3 },
    `The median age is about ${f1(s.median_age)} years: half of all Ugandans are children or teenagers.`, '/people/population/age-and-growth/');
});
add(CENSUS, () => {
  const m = P.census2024.total / 1e6;
  const opts = [m, m * 0.78, m * 1.15, m * 1.32].map((v) => `${v.toFixed(1)} million`);
  return choice('census-count', 'People', 'How many people did the 2024 census count in Uganda?', opts[0], opts.slice(1),
    `${P.millions(P.census2024.total)}, up from ${P.millions(P.history.find((h) => h.year === 2014)!.total)} in 2014.`, '/people/population/age-and-growth/');
});
const censusSlider = (id: string, key: string, topic: string, q: string, explain: (v: number) => string, href: string, o = {}) =>
  add(CENSUS, () => slider(id, topic, q, D.national[key]!, o, explain(D.national[key]!), href));
censusSlider('under18', 'children', 'People', 'In the 2024 census, what share of Ugandans were under 18?',
  (v) => `${f1(v)}%: about half the country.`, '/people/population/age-and-growth/');
censusSlider('grid', 'grid', 'Homes', 'In the 2024 census, what share of households got electricity from the grid?',
  (v) => `${f1(v)}%. Another ${f1(D.national.solar!)}% lit their homes with solar.`, '/places/districts/?show=grid');
censusSlider('internet', 'internet', 'Connected', 'In the 2024 census, how many in every 100 Ugandans used the internet?',
  (v) => `About ${f1(v)} in every 100 people.`, '/places/districts/?show=internet', { unit: '' });
censusSlider('insurance', 'insurance', 'Health', 'In the 2024 census, what share of Ugandans had health insurance?',
  (v) => `Only ${f1(v)}%. Most people pay for care out of pocket.`, '/places/districts/?show=insurance', { tolerance: 4 });
censusSlider('birth-cert', 'birth_cert', 'People', 'In the 2024 census, what share of Ugandans had a birth certificate?',
  (v) => `Just ${f1(v)}%, though more had a birth notification.`, '/places/districts/?show=birth_cert');
censusSlider('out-of-school', 'out_of_school', 'Education', 'In the 2024 census, what share of children aged 6–12 were out of school?',
  (v) => `${f1(v)}%, and over 80% in parts of Karamoja.`, '/places/districts/?show=out_of_school');

// District questions: census indicators only (the 2021 livestock census is too old).
const censusIds = new Set(D.indicators.map((i) => i.id));
for (const [id, q] of [
  ['neet', 'In the 2024 census, which district had the highest share of young people (18–30) not in work, school or training?'],
  ['out_of_school', 'In the 2024 census, where were the most primary-age children out of school?'],
  ['density', 'Which district or city is the most crowded (people per km², 2024 census)?'],
  ['grid', 'Which district or city has the most homes on grid electricity (2024 census)?'],
] as const) {
  if (!censusIds.has(id)) continue;
  add(CENSUS, () => {
    const ind = D.indicatorById.get(id)!;
    return highest(`top-${id}`, ind.group, q, D.districts.filter((d) => d.values[id] != null), (d) => d.values[id]!, (d) => d.name, (v) => D.fmtValue(ind, v), `/places/districts/?show=${id}`);
  });
}

// Higher or lower: two well-known districts, clear differences only.
const known = [...D.districts].sort((a, b) => (b.values.population ?? 0) - (a.values.population ?? 0)).slice(0, 60);
const PAIRS: [string, (a: string, b: string) => string][] = [
  ['grid', (a, b) => `Which has more homes on grid electricity: ${a} or ${b}?`],
  ['water', (a, b) => `Which has more households with safe drinking water: ${a} or ${b}?`],
  ['internet', (a, b) => `Where do more people use the internet: ${a} or ${b}?`],
  ['out_of_school', (a, b) => `Where are more children aged 6–12 out of school: ${a} or ${b}?`],
  ['neet', (a, b) => `Where are more young people not in work, school or training: ${a} or ${b}?`],
  ['sanitation', (a, b) => `Which has more households with improved toilets: ${a} or ${b}?`],
  ['hh_size', (a, b) => `Where are households bigger: ${a} or ${b}?`],
  ['children', (a, b) => `Where are more of the people children (under 18): ${a} or ${b}?`],
];
for (const [id, text] of PAIRS) {
  const ind = D.indicatorById.get(id);
  if (!ind || !censusIds.has(id)) continue;
  const pool = known.filter((d) => d.values[id] != null);
  const made: Draft[] = [];
  for (let tries = 0; tries < 60 && made.length < 6; tries++) {
    const a = pick(pool);
    const b = pick(pool);
    if (a === b) continue;
    const va = a.values[id]!;
    const vb = b.values[id]!;
    const gap = Math.abs(va - vb);
    if (gap < Math.max(Math.abs(va), Math.abs(vb)) * 0.25 || (ind.unit === '%' && gap < 5)) continue;
    const [hi, lo] = va > vb ? [a, b] : [b, a];
    made.push({
      kind: 'choice', id: `pair-${id}-${a.code}-${b.code}`, topic: ind.group, q: text(a.name, b.name),
      options: [a.name, b.name], answer: va > vb ? 0 : 1,
      explain: `${hi.name}: ${D.fmtValue(ind, hi.values[id])}. ${lo.name}: ${D.fmtValue(ind, lo.values[id])}. Uganda: ${D.fmtValue(ind, D.national[id])}.`,
      href: `/places/districts/?show=${id}`,
    });
  }
  add(CENSUS, () => made);
}

// ==== Production: only where the data is recent ======================================
add(() => {
  const oil = PR.industry.products.find((p) => p.name === 'Cooking oil')!;
  return { asOf: oil.latest_year, year: Number(oil.latest_year) };
}, () => {
  const oil = PR.industry.products.find((p) => p.name === 'Cooking oil')!;
  return slider('cooking-oil', 'Industry', 'What share of the cooking oil Ugandans use is made in Uganda?', oil.local_share!, { tolerance: 7 },
    `About ${Math.round(oil.local_share!)}% in ${oil.latest_year}; the rest is imported. For cement, beer and soft drinks it is over 95%.`, '/production/industry/made-in-uganda/');
});

// ---- freshness filter ------------------------------------------------------------------
const THIS_YEAR = new Date().getFullYear();
export const MAX_AGE_YEARS = 2;
export const questions: Question[] = bank.filter((q) => q.landmark || q.year >= THIS_YEAR - MAX_AGE_YEARS);
export const dropped = bank.length - questions.length;
export const topics = [...new Set(questions.map((q) => q.topic))];
