// Charts that have their own shareable page (/charts/<slug>/) and a preview
// image (/og/<slug>.png) for WhatsApp, X, Facebook and LinkedIn link cards.
// Every description is computed from the data, never typed by hand.
import type { ChartSpec } from './chart-spec';
import { cpi, fmtPct, monthLabel } from './data';
import * as C from './cpi';
import * as G from './gdp';
import * as T from './trade';
import * as P from './population';
import * as D from './census';
import * as V from './poverty';
import * as R from './road';
import * as E from './education';
import * as J from './jobs';
import * as H from './health';
import * as GF from './government';
import * as EN from './environment';
import * as BK from './banking';
import * as CR from './crime';
import * as GE from './gender';
import * as WB from './wellbeing';
import * as MN from './mining';
import * as TV from './travel';

export interface SharedChart {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  spec: ChartSpec;
  height: number;
  source: { title: string; url: string };
  page: { href: string; label: string };
  topic: string;
}

const src = (s: { title: string; url: string }) => ({ title: s.title, url: s.url });

function districtMap(id: string, slug: string, title: string, lead: string): SharedChart {
  const ind = D.indicatorById.get(id)!;
  const list = D.ranked(id);
  return {
    slug,
    title,
    subtitle: `${ind.label}, by district · Census 2024`,
    description: `${lead} Uganda overall: ${D.fmtValue(ind, D.national[id])}. Highest: ${list[0].name} (${D.fmtValue(ind, list[0].values[id])}); lowest: ${list[list.length - 1].name} (${D.fmtValue(ind, list[list.length - 1].values[id])}).`,
    spec: {
      kind: 'map',
      unit: D.unitSuffix(ind),
      digits: D.digitsFor(ind),
      series: [],
      map: {
        geo: '/geo/districts.json',
        values: D.mapValues(id),
        names: D.mapNames,
        slugs: D.mapSlugs,
        href: '/places/districts/',
        breaks: D.breaksFor(id),
        reference: { label: 'Uganda', value: D.national[id] },
      },
    },
    height: 560,
    source: src(D.source),
    page: { href: `/places/districts/?show=${id}`, label: 'Explore all district indicators' },
    topic: 'Places',
  };
}

const L = G.annual.years.length - 1;
const TL = T.annual.years.length - 1;
const pyr2024 = P.pyramid.years.indexOf(2024);
const censusYears = new Map(P.history.map((h) => [h.year, h.total]));
const projYears = new Map(P.stats.map((s) => [s.year, s.total]));
const popX = [...new Set([...P.history.map((h) => h.year), ...P.stats.map((s) => s.year)])].sort((a, b) => a - b);
const topExports = T.export_products.slice(0, 12);

export const sharedCharts: SharedChart[] = [
  {
    slug: 'uganda-inflation-rate',
    title: 'Uganda’s inflation rate',
    subtitle: 'Annual % change in consumer prices',
    description: `Prices were ${fmtPct(C.headline)} higher in ${monthLabel(C.latestMonth, true)} than a year earlier. Inflation peaked at ${fmtPct(C.peak.value)} in ${monthLabel(C.peak.month, true)}.`,
    spec: { kind: 'line', unit: '%', x: C.yoyMonths, zeroLine: true, series: [
      { name: 'All items', data: C.yoyOf('headline'), color: 1 },
      { name: 'Core', data: C.yoyOf('core'), color: 'muted' },
    ] },
    height: 400,
    source: src(cpi.source),
    page: { href: '/economy/prices/inflation/', label: 'Inflation: categories, towns and 340 items' },
    topic: 'Economy',
  },
  {
    slug: 'inflation-by-category',
    title: 'Which prices are rising fastest?',
    subtitle: `Annual inflation by spending category, ${monthLabel(C.latestMonth)}`,
    description: `${C.divisions[0].name} is rising fastest at ${fmtPct(C.divisions[0].yoy)} a year; ${C.divisions[C.divisions.length - 1].name} slowest at ${fmtPct(C.divisions[C.divisions.length - 1].yoy)}.`,
    spec: { kind: 'bar', unit: '%', categories: C.divisions.map((d) => d.name), series: [{ name: 'Annual change', data: C.divisions.map((d) => d.yoy) }], labelWidth: 170 },
    height: 460,
    source: src(cpi.source),
    page: { href: '/economy/prices/inflation/', label: 'More on inflation' },
    topic: 'Economy',
  },
  {
    slug: 'inflation-by-town',
    title: 'Inflation by town',
    subtitle: `Annual % change in prices, ${monthLabel(C.latestMonth)}`,
    description: `Prices rose fastest in ${C.centres[0].name} (${fmtPct(C.centres[0].yoy)}) and slowest in ${C.centres[C.centres.length - 1].name} (${fmtPct(C.centres[C.centres.length - 1].yoy)}).`,
    spec: { kind: 'bar', unit: '%', categories: C.centres.map((c) => c.name), series: [{ name: 'Annual change', data: C.centres.map((c) => c.yoy) }], labelWidth: 170 },
    height: 420,
    source: src(cpi.source),
    page: { href: '/economy/prices/inflation/', label: 'More on inflation' },
    topic: 'Economy',
  },
  {
    slug: 'uganda-gdp-growth',
    title: 'Uganda’s economic growth',
    subtitle: 'Real GDP growth, % per financial year',
    description: `The economy grew ${G.latest.growth}% in ${G.latest.year} after prices are taken out.`,
    spec: { kind: 'line', unit: '%', x: G.annual.years.slice(1), zeroLine: true, series: [{ name: 'Real growth', data: G.annual.growth.slice(1), color: 1, points: true }] },
    height: 400,
    source: src(G.sources.annual),
    page: { href: '/economy/gdp/economic-growth/', label: 'More on GDP' },
    topic: 'Economy',
  },
  {
    slug: 'uganda-gdp-per-person',
    title: 'GDP per person in Uganda',
    subtitle: 'US dollars at each year’s exchange rate',
    description: `GDP per person was US$${Math.round(G.latest.perCapitaUsd).toLocaleString()} in ${G.latest.year}, up from US$${Math.round(G.annual.per_capita_usd[0])} in ${G.annual.years[0]}.`,
    spec: { kind: 'line', unit: '', digits: 0, x: G.annual.years, series: [{ name: 'US$ per person', data: G.annual.per_capita_usd, color: 1, points: true }] },
    height: 400,
    source: src(G.sources.annual),
    page: { href: '/economy/gdp/economic-growth/', label: 'More on GDP' },
    topic: 'Economy',
  },
  {
    slug: 'uganda-economy-by-sector',
    title: 'What Uganda’s economy is made of',
    subtitle: 'Share of GDP by sector, %',
    description: `In ${G.latest.year}, services were ${G.shares.Services[L]}% of GDP, agriculture ${G.shares.Agriculture[L]}% and industry ${G.shares.Industry[L]}%.`,
    spec: { kind: 'line', unit: '%', x: G.annual.years, series: [
      { name: 'Services', data: G.shares.Services, color: 1 },
      { name: 'Agriculture', data: G.shares.Agriculture, color: 3 },
      { name: 'Industry', data: G.shares.Industry, color: 2 },
    ] },
    height: 400,
    source: src(G.sources.annual),
    page: { href: '/economy/gdp/economic-growth/', label: 'More on GDP' },
    topic: 'Economy',
  },
  {
    slug: 'uganda-exports-and-imports',
    title: 'Uganda’s exports and imports',
    subtitle: 'Goods, US$ million per year',
    description: `Uganda exported ${T.bn(T.latest.exports)} and imported ${T.bn(T.latest.imports)} of goods in ${T.year}. Gold was ${Math.round(T.latest.goldShare)}% of exports.`,
    spec: { kind: 'line', unit: '', digits: 0, x: T.annual.years, xNumeric: true, series: [
      { name: 'Exports', data: T.annual.exports, color: 1 },
      { name: 'Imports', data: T.annual.imports, color: 2 },
    ] },
    height: 400,
    source: src(T.sources.export_products),
    page: { href: '/economy/trade/exports-and-imports/', label: 'More on trade' },
    topic: 'Economy',
  },
  {
    slug: 'uganda-top-exports',
    title: 'What Uganda sells to the world',
    subtitle: `Top exports, US$ million, ${T.year}`,
    description: `Gold (${T.bn(topExports[0].values[TL])}) and coffee (${T.bn(topExports[1].values[TL], 2)}) lead Uganda’s exports.`,
    spec: { kind: 'bar', unit: '', digits: 0, categories: topExports.map((p) => p.name), series: [{ name: 'US$ million', data: topExports.map((p) => Math.round(p.values[TL])) }], labelWidth: 170 },
    height: 460,
    source: src(T.sources.export_products),
    page: { href: '/economy/trade/exports-and-imports/', label: 'More on trade' },
    topic: 'Economy',
  },
  {
    slug: 'uganda-population-growth',
    title: 'Uganda’s population, 1911 to 2050',
    subtitle: 'Census counts and UBOS projection',
    description: `The 2024 census counted ${P.millions(P.census2024.total)} people. UBOS projects ${P.millions(P.statFor(2050).total, 0)} by 2050.`,
    spec: { kind: 'line', unit: '', digits: 0, xNumeric: true, x: popX, series: [
      { name: 'Census count', data: popX.map((y) => censusYears.get(y) ?? null), color: 1, points: true },
      { name: 'Projection', data: popX.map((y) => (y >= 2014 ? projYears.get(y) ?? null : null)), color: 1, dashed: true },
    ] },
    height: 400,
    source: src(P.sources.history),
    page: { href: '/people/population/age-and-growth/', label: 'Population pyramid and more' },
    topic: 'People',
  },
  {
    slug: 'uganda-population-pyramid',
    title: 'Uganda’s population pyramid',
    subtitle: 'Population by age and sex, 2024 (UBOS projection)',
    description: `Half of Ugandans are younger than ${Math.round(P.statFor(2024).median_age)}. ${P.dependencyText(P.statFor(2024))}`,
    spec: { kind: 'pyramid', series: [], pyramid: { ...P.pyramid, yearIndex: pyr2024 } },
    height: 520,
    source: src(P.sources.projections),
    page: { href: '/people/population/age-and-growth/', label: 'Watch it change to 2050' },
    topic: 'People',
  },
  {
    slug: 'uganda-life-expectancy',
    title: 'Life expectancy in Uganda',
    subtitle: 'Years at birth, by census',
    description: `Life expectancy rose from ${P.life[0].total} years in ${P.life[0].year} to ${P.life[P.life.length - 1].total} in ${P.life[P.life.length - 1].year}.`,
    spec: { kind: 'line', unit: '', digits: 1, xNumeric: true, yMin: 40, x: P.life.map((l) => l.year), series: [
      { name: 'Women', data: P.life.map((l) => l.female), color: 2, points: true },
      { name: 'Men', data: P.life.map((l) => l.male), color: 1, points: true },
    ] },
    height: 400,
    source: src(P.sources.life),
    page: { href: '/people/population/age-and-growth/', label: 'More on population' },
    topic: 'People',
  },
  {
    slug: 'uganda-poverty-rate',
    title: 'Poverty in Uganda since 2000',
    subtitle: '% of people below the national poverty line',
    description: `${V.latestRate}% of Ugandans (${V.latestPoor} million) were poor in ${V.latestYear}, down from ${V.firstRate}% in ${V.firstYear}.`,
    spec: { kind: 'line', unit: '%', x: V.national.years, yMin: 0, series: [{ name: 'Poverty rate', data: V.national.rate, color: 1, points: true }] },
    height: 400,
    source: src(V.nationalSource),
    page: { href: '/people/poverty/poverty-in-uganda/', label: 'Poverty by region and in daily life' },
    topic: 'People',
  },
  {
    slug: 'poverty-by-region',
    title: 'Poverty by region',
    subtitle: `% of people below the poverty line, ${V.latestYear}`,
    description: `${V.regionsLatest[0].name} is the poorest region (${V.regionsLatest[0].value}%); ${V.regionsLatest[V.regionsLatest.length - 1].name} the least poor (${V.regionsLatest[V.regionsLatest.length - 1].value}%).`,
    spec: { kind: 'bar', unit: '%', categories: V.regionsLatest.map((r) => r.name), series: [{ name: 'Poverty rate', data: V.regionsLatest.map((r) => r.value) }], labelWidth: 120 },
    height: 360,
    source: src(V.sources.headcount),
    page: { href: '/people/poverty/poverty-in-uganda/', label: 'More on poverty' },
    topic: 'People',
  },
  {
    slug: 'uganda-poverty-covid',
    title: 'Poverty before and during COVID-19',
    subtitle: '% of people below the poverty line, by sub-region (survey estimates)',
    description: V.extraFacts()[0],
    spec: (() => {
      const sub = [...V.covid.subregions].sort((a, b) => b.during - a.during);
      return { kind: 'bar' as const, unit: '%', digits: 1, categories: sub.map((x) => x.name), series: [
        { name: 'Before COVID-19', data: sub.map((x) => x.before), color: 'muted' as const },
        { name: 'During COVID-19', data: sub.map((x) => x.during), color: 2 },
      ], labelWidth: 120 };
    })(),
    height: 520,
    source: src(V.sources.covid_subregion),
    page: { href: '/people/poverty/poverty-in-uganda/', label: 'More on poverty' },
    topic: 'People',
  },
  {
    slug: 'uganda-road-deaths',
    title: 'Road deaths in Uganda',
    subtitle: 'People killed on the roads, as reported to the police',
    description: `${R.killed.toLocaleString()} people were killed on Uganda’s roads in ${R.year}, about ${Math.round(R.perDay)} a day.`,
    spec: { kind: 'line', unit: '', digits: 0, x: R.years, xNumeric: true, yMin: 0, series: [{ name: 'Killed', data: R.casualties.killed, color: 1, points: true }] },
    height: 400,
    source: src(R.sources.casualties),
    page: { href: '/people/crime/road-safety/', label: 'Who dies, when and where' },
    topic: 'People',
  },
  {
    slug: 'road-casualties-by-road-user',
    title: 'Who is killed or injured on Uganda’s roads?',
    subtitle: `People killed or injured, by road user, ${R.year}`,
    description: `${R.usersLatest[0].name} (${R.usersLatest[0].value.toLocaleString()}) and ${R.usersLatest[1].name.toLowerCase()} (${R.usersLatest[1].value.toLocaleString()}) were the most affected in ${R.year}.`,
    spec: { kind: 'bar', unit: '', digits: 0, categories: R.usersLatest.map((u) => u.name), series: [{ name: 'Killed or injured', data: R.usersLatest.map((u) => u.value) }], labelWidth: 150 },
    height: 360,
    source: src(R.sources.road_users),
    page: { href: '/people/crime/road-safety/', label: 'More on road safety' },
    topic: 'People',
  },
  {
    slug: 'road-crashes-by-time-of-day',
    title: 'When do road crashes happen?',
    subtitle: `Crashes by time of day, ${R.year}`,
    description: `Crashes peak at ${R.slotLabel(R.peakSlot.slot)}: ${R.peakSlot.crashes.toLocaleString()} crashes in ${R.year}.`,
    spec: { kind: 'bar', unit: '', digits: 0, categories: R.timeOfDay.map((t) => R.slotLabel(t.slot)), series: [{ name: 'Crashes', data: R.timeOfDay.map((t) => t.crashes) }], labelWidth: 110 },
    height: 460,
    source: src(R.sources.time),
    page: { href: '/people/crime/road-safety/', label: 'More on road safety' },
    topic: 'People',
  },
  {
    slug: 'ple-results-2023',
    title: 'PLE results, 2023',
    subtitle: 'Primary Leaving Examination candidates by division',
    description: `${E.ple.sat.toLocaleString()} pupils sat PLE in 2023: ${E.pleShare('DIV I').toFixed(0)}% got Division I and ${E.pleShare('DIV U').toFixed(0)}% were ungraded.`,
    spec: { kind: 'bar', unit: '', digits: 0, categories: E.ple.divisions.map((d) => d.name.replace('DIV', 'Division').replace('Division U', 'Ungraded (U)')), series: [{ name: 'Candidates', data: E.ple.divisions.map((d) => d.candidates) }], labelWidth: 130 },
    height: 360,
    source: src(E.sources.ple),
    page: { href: '/people/education/learning-in-uganda/', label: 'More on education' },
    topic: 'People',
  },
  (() => {
    const rows = [
      ...J.earningsGroup('Nature of employment'),
      ...J.earningsGroup('Type of Institution').map((e) => ({ ...e, name: `${e.name} sector` })),
      ...J.earningsGroup('Residence'),
    ].sort((a, b) => b.value - a.value);
    const nat = J.earn('National');
    return {
      slug: 'uganda-monthly-earnings',
      title: 'What does a job pay in Uganda?',
      subtitle: 'Median monthly earnings in paid jobs, UGX, 2021',
      description: nat ? `The typical worker in a paid job earned UGX ${Math.round(nat.total).toLocaleString('en-UG')} a month in 2021.` : 'Median monthly earnings in paid jobs, 2021.',
      spec: { kind: 'bar' as const, unit: '', digits: 0, categories: rows.map((r) => r.name), series: [{ name: 'UGX per month', data: rows.map((r) => r.value) }], labelWidth: 150 },
      height: 360,
      source: src(J.sources.earnings),
      page: { href: '/people/jobs/work-and-earnings/', label: 'More on jobs and earnings' },
      topic: 'People',
    };
  })(),
  {
    slug: 'uganda-child-mortality',
    title: 'Child deaths in Uganda',
    subtitle: 'Deaths before age 5 and age 1, per 1,000 live births',
    description: `Under-5 deaths fell from ${H.under5[0].value} to ${H.under5[H.under5.length - 1].value} per 1,000 births between ${H.under5[0].survey} and ${H.under5[H.under5.length - 1].survey}.`,
    spec: { kind: 'line', unit: '', digits: 0, x: H.under5.map((d) => d.survey), yMin: 0, series: [
      { name: 'Before age 5', data: H.under5.map((d) => d.value), color: 1, points: true },
      { name: 'Before age 1', data: H.under5.map((d) => H.infant.find((i) => i.survey === d.survey)?.value ?? null), color: 2, points: true },
    ] },
    height: 400,
    source: src(H.sources.under5),
    page: { href: '/people/health/health-in-uganda/', label: 'More on health' },
    topic: 'People',
  },
  {
    slug: 'uganda-health-worker-gap',
    title: 'Too few health workers where people need them most',
    subtitle: `% of approved posts filled in public health facilities, ${H.staffingYear}`,
    description: `${H.facts().at(-4)} ${H.facts().at(-3)}`,
    spec: { kind: 'bar', unit: '%', digits: 0, categories: [...H.staffingLevels.map((l) => l.name), 'All public facilities'], series: [{ name: 'Posts filled', data: [...H.staffingLevels.map((l) => l.pct), (100 * H.staffingTotal.filled) / H.staffingTotal.approved] }], highlight: ['All public facilities'], labelWidth: 240 },
    height: 400,
    source: src(H.sources.staffing),
    page: { href: '/people/health/health-in-uganda/', label: 'More on health' },
    topic: 'People',
  },
  {
    slug: 'uganda-public-service',
    title: 'Who works for Uganda’s government?',
    subtitle: 'Public servants by group',
    description: `${J.publicFacts()[0]} ${J.publicFacts()[1]}`,
    spec: { kind: 'bar', stacked: true, unit: '', digits: 0, categories: J.civilService.years, series: Object.entries(J.civilService.groups).map(([g, v], i) => ({ name: J.groupName(g), data: v, color: i + 1 })), labelWidth: 60 },
    height: 440,
    source: src(J.sources.civil_service),
    page: { href: '/people/jobs/work-and-earnings/', label: 'More on jobs' },
    topic: 'People',
  },
  {
    slug: 'uganda-interest-vs-salaries',
    title: 'Uganda now pays more in interest than in salaries',
    subtitle: 'Central government, UGX trillion a year',
    description: `${GF.historyFacts()[0]} ${GF.historyFacts()[1] ?? ''}`.trim(),
    spec: { kind: 'line', unit: ' tn', digits: 1, x: GF.history.years, yMin: 0, series: [
      { name: 'Interest on debt', data: GF.history.interest.map((v) => v / 1000), color: 2, points: true },
      { name: 'Employee pay', data: GF.history.employees.map((v) => v / 1000), color: 1, points: true },
    ] },
    height: 400,
    source: src(GF.sources.history),
    page: { href: '/economy/government-finance/where-the-money-goes/', label: 'More on government money' },
    topic: 'Economy',
  },
  {
    slug: 'uganda-government-spending',
    title: 'Where Uganda’s government spends its money',
    subtitle: `Out of every UGX 100,000 spent, ${GF.year}`,
    description: `Government spent ${GF.trillion(GF.spending)} in ${GF.year}. Education got UGX ${GF.byFunction.find((f) => f.official === 'Education')!.per100k.toLocaleString('en-UG')} and health UGX ${GF.byFunction.find((f) => f.official === 'Health')!.per100k.toLocaleString('en-UG')} of every UGX 100,000.`,
    spec: { kind: 'bar', unit: '', digits: 0, categories: GF.byFunction.map((f) => f.name), series: [{ name: 'UGX out of 100,000', data: GF.byFunction.map((f) => f.per100k) }], labelWidth: 230 },
    height: 460,
    source: src(GF.sources.functions),
    page: { href: '/economy/government-finance/where-the-money-goes/', label: 'More on government money' },
    topic: 'Economy',
  },
  {
    slug: 'uganda-air-cargo',
    title: 'More cargo flies out of Entebbe than in',
    subtitle: 'Cargo through Entebbe International Airport, tonnes',
    description: TV.transportFacts()[1],
    spec: { kind: 'bar', stacked: true, unit: ' t', digits: 0, categories: TV.transport.air.years, series: [
      { name: 'Flown out', data: TV.transport.air.loaded, color: 1 },
      { name: 'Flown in', data: TV.transport.air.offloaded, color: 2 },
    ], labelWidth: 60 },
    height: 400,
    source: src(TV.transport.sources.air_cargo),
    page: { href: '/production/transport/rail-air-and-licences/', label: 'More on rail and air cargo' },
    topic: 'Production',
  },
  {
    slug: 'uganda-border-arrivals',
    title: 'Where people enter Uganda',
    subtitle: 'Arrivals by border post, thousands, 2023',
    description: TV.tourismFacts()[1],
    spec: { kind: 'bar', unit: 'k', digits: 0, categories: TV.tourism.borders.map((b) => b.name), series: [{ name: 'Arrivals (000s)', data: TV.tourism.borders.map((b) => b.arrivals) }], labelWidth: 120 },
    height: 460,
    source: src(TV.tourism.sources.borders),
    page: { href: '/production/tourism/travel-and-attractions/', label: 'More on travel' },
    topic: 'Production',
  },
  {
    slug: 'uganda-attraction-visitors',
    title: 'Popular days out in Uganda',
    subtitle: 'Visitors a year',
    description: `${TV.tourismFacts()[3]} ${TV.tourismFacts()[4]}`,
    spec: (() => {
      const a = Object.entries(TV.tourism.attractions);
      return { kind: 'line' as const, unit: '', digits: 0, x: a[0][1].years, yMin: 0, series: a.map(([k, v], i) => ({ name: k, data: v.total, color: i + 1, points: true })) };
    })(),
    height: 400,
    source: src(TV.tourism.sources['Source of the Nile']),
    page: { href: '/production/tourism/travel-and-attractions/', label: 'More on travel' },
    topic: 'Production',
  },
  {
    slug: 'uganda-building-plans',
    title: 'Building plans submitted and approved',
    subtitle: 'Building plans a year',
    description: TV.buildingFacts()[0],
    spec: { kind: 'line', unit: '', digits: 0, x: TV.building.submitted.years, yMin: 0, series: [
      { name: 'Submitted', data: TV.building.submitted.years.map((y) => TV.planIn(TV.building.submitted, y)), color: 1, points: true },
      { name: 'Approved', data: TV.building.submitted.years.map((y) => TV.planIn(TV.building.approved, y)), color: 3, points: true },
    ] },
    height: 400,
    source: src(TV.building.sources.submitted),
    page: { href: '/production/construction/building-plans/', label: 'More on building plans' },
    topic: 'Production',
  },
  {
    slug: 'uganda-mineral-production',
    title: 'What Uganda mines: iron ore takes off',
    subtitle: 'Value of recorded mineral production, UGX billion',
    description: `${MN.facts()[0]} ${MN.facts()[1]}`,
    spec: { kind: 'bar', stacked: true, unit: ' bn', digits: 1, categories: MN.years, series: MN.topSeries(4).map((x, i) => ({ ...x, color: i + 1 })), labelWidth: 60 },
    height: 420,
    source: src(MN.sources.value),
    page: { href: '/production/mining/minerals/', label: 'More on mining' },
    topic: 'Production',
  },
  {
    slug: 'uganda-multidimensional-poverty',
    title: 'Poor in several ways at once',
    subtitle: `Multidimensional poverty by region, % of people, ${WB.mpi.year}`,
    description: `${WB.facts()[1]} ${WB.facts()[2]}`,
    spec: { kind: 'bar', unit: '%', digits: 0, categories: [...Object.entries(WB.mpi.regions).sort((a, b) => b[1] - a[1]).map(([r]) => r), 'Uganda'], series: [{ name: 'Poor in several ways', data: [...Object.entries(WB.mpi.regions).sort((a, b) => b[1] - a[1]).map(([, v]) => v), WB.mpi.national] }], highlight: ['Uganda'], labelWidth: 100 },
    height: 360,
    source: src(WB.sources.level2),
    page: { href: '/wellbeing/nsi-income/national-scorecard/', label: 'More on the national scorecard' },
    topic: 'Wellbeing',
  },
  {
    slug: 'uganda-pay-gap',
    title: 'Women in Uganda earn less in every sector',
    subtitle: 'Typical (median) monthly pay in paid jobs, UGX, 2021',
    description: GE.facts()[0],
    spec: { kind: 'bar', unit: '', digits: 0, categories: ['All paid jobs', ...GE.payBySector.map((x) => x.name)], series: [
      { name: 'Women', data: [GE.pay.female, ...GE.payBySector.map((x) => x.women)], color: 2 },
      { name: 'Men', data: [GE.pay.male, ...GE.payBySector.map((x) => x.men)], color: 1 },
    ], labelWidth: 120 },
    height: 420,
    source: src(GE.sources.earnings),
    page: { href: '/people/gender/women-and-men/', label: 'More on women and men' },
    topic: 'People',
  },
  {
    slug: 'uganda-women-and-men',
    title: 'Where women and men differ in Uganda',
    subtitle: '%, women vs men',
    description: `${GE.facts()[1]} ${GE.facts()[2]}`,
    spec: { kind: 'bar', unit: '%', digits: 0, categories: GE.gaps.map((g) => g.name), series: [
      { name: 'Women', data: GE.gaps.map((g) => g.women), color: 2 },
      { name: 'Men', data: GE.gaps.map((g) => g.men), color: 1 },
    ], labelWidth: 300 },
    height: 440,
    source: src(GE.sources.jobs),
    page: { href: '/people/gender/women-and-men/', label: 'More on women and men' },
    topic: 'People',
  },
  {
    slug: 'uganda-crimes-by-type',
    title: 'What crimes are reported in Uganda?',
    subtitle: `Cases reported to police, ${CR.year}`,
    description: `${CR.facts()[0]} ${CR.facts()[1]}`,
    spec: { kind: 'bar', unit: '', digits: 0, categories: CR.categories.map((c) => c.name), series: [{ name: 'Cases reported', data: CR.categories.map((c) => c.reported) }], labelWidth: 190 },
    height: 460,
    source: src(CR.sources.categories),
    page: { href: '/people/crime/crime-and-prisons/', label: 'More on crime and prisons' },
    topic: 'People',
  },
  {
    slug: 'uganda-crime-victims',
    title: 'Who are the victims of crime in Uganda?',
    subtitle: `Share of each crime’s victims by sex and age, ${CR.year}`,
    description: CR.facts()[2],
    spec: (() => {
      const v = CR.victims.filter((x) => x.total >= 4000).sort((a, b) => b.total - a.total);
      const sh = (k: 'male_adult' | 'male_child' | 'female_adult' | 'female_child') => v.map((x) => (100 * x[k]) / x.total);
      return { kind: 'bar' as const, stacked: true, unit: '%', digits: 0, yMax: 100, categories: v.map((x) => x.name), series: [
        { name: 'Men', data: sh('male_adult'), color: 1 },
        { name: 'Boys under 18', data: sh('male_child'), color: 5 },
        { name: 'Women', data: sh('female_adult'), color: 2 },
        { name: 'Girls under 18', data: sh('female_child'), color: 4 },
      ], labelWidth: 170 };
    })(),
    height: 460,
    source: src(CR.sources.victims),
    page: { href: '/people/crime/crime-and-prisons/', label: 'More on crime and prisons' },
    topic: 'People',
  },
  {
    slug: 'uganda-prison-population',
    title: 'Uganda’s prisons keep filling up',
    subtitle: 'Prisoners, convicted and on remand',
    description: `${CR.facts()[5]} ${CR.facts()[6]}`,
    spec: { kind: 'bar', stacked: true, unit: '', digits: 0, categories: CR.prison.years, series: [
      { name: 'Convicted', data: CR.prison.convicted, color: 1 },
      { name: 'On remand', data: CR.prison.remand, color: 2 },
    ], labelWidth: 60 },
    height: 420,
    source: src(CR.sources.prison),
    page: { href: '/people/crime/crime-and-prisons/', label: 'More on crime and prisons' },
    topic: 'People',
  },
  {
    slug: 'uganda-shilling-dollar-rate',
    title: 'What a dollar costs in Uganda shillings',
    subtitle: `Average inter-bank rate, UGX per US$, ${BK.fx0.year}–${BK.fx1.year}`,
    description: BK.facts()[0],
    spec: { kind: 'line', unit: '', digits: 0, x: BK.fx.years, series: [{ name: 'UGX per US$', data: BK.fx.rate, color: 1, points: true }] },
    height: 400,
    source: src(BK.sources.fx),
    page: { href: '/economy/banking/money-and-banks/', label: 'More on money and banks' },
    topic: 'Economy',
  },
  {
    slug: 'uganda-interest-rates',
    title: 'Banks lend dear and pay little on savings',
    subtitle: 'Interest rates in June, % a year',
    description: BK.facts()[1],
    spec: { kind: 'line', unit: '%', digits: 1, x: BK.interest.years, yMin: 0, series: [
      { name: 'Bank lending', data: BK.interest.rates['Bank lending (shillings)'], color: 2, points: true },
      { name: 'Central Bank Rate', data: BK.interest.rates['Central Bank Rate'], color: 1, points: true },
      { name: 'Savings', data: BK.interest.rates['Savings deposits (shillings)'], color: 4, points: true },
    ] },
    height: 400,
    source: src(BK.sources.interest),
    page: { href: '/economy/banking/money-and-banks/', label: 'More on money and banks' },
    topic: 'Economy',
  },
  {
    slug: 'uganda-forest-cover',
    title: 'Uganda’s forests are shrinking',
    subtitle: `Land cover, square kilometres, ${EN.firstYear}–${EN.lastYear}`,
    description: `${EN.facts()[0]} ${EN.facts()[2]}`,
    spec: { kind: 'line', unit: ' km²', digits: 0, x: EN.landYears, yMin: 0, series: ['Forestry', 'Agriculture', 'Grassland', 'Bush land'].map((n, i) => {
      const r = EN.landSummary.find((x) => x.name === n)!;
      return { name: r.label, data: r.values, color: i + 1, points: true };
    }) },
    height: 400,
    source: src(EN.sources.land),
    page: { href: '/environment/land/forests-land-and-climate/', label: 'More on land and climate' },
    topic: 'Environment',
  },
  {
    slug: 'uganda-temperature-by-town',
    title: 'How hot does it get in Uganda’s towns?',
    subtitle: 'Long-term average daytime high and night-time low, °C',
    description: `${EN.facts()[5]} ${EN.facts()[6]}`,
    spec: { kind: 'bar', unit: '°C', digits: 1, categories: EN.stations.map((s) => s.station), series: [
      { name: 'Daytime high', data: EN.stations.map((s) => s.max), color: 2 },
      { name: 'Night-time low', data: EN.stations.map((s) => s.min), color: 1 },
    ], labelWidth: 80 },
    height: 440,
    source: src(EN.sources.temperature),
    page: { href: '/environment/land/forests-land-and-climate/', label: 'More on land and climate' },
    topic: 'Environment',
  },
  districtMap('grid', 'grid-electricity-by-district', 'Who has power from the grid?', 'Share of households using grid electricity for lighting.'),
  districtMap('out_of_school', 'children-out-of-school-by-district', 'Children out of school, by district', 'Share of children aged 6–12 not in school.'),
  districtMap('neet', 'youth-not-in-work-or-school-by-district', 'Young people not in work, school or training', 'Share of 18–30 year olds not in employment, education or training.'),
];

export const sharedBySlug = new Map(sharedCharts.map((c) => [c.slug, c]));
