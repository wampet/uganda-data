// Site search index, built at build time and fetched by the search box the
// first time someone uses it. Rows are [title, kind, url, extra words].
import type { APIRoute } from 'astro';
import { catalog, featured, sections, topicUrl } from '../lib/data';
import { districts, mapIndicators, subregionByCode } from '../lib/census';
import { sharedCharts } from '../lib/share-charts';
import cpiItems from '../data/indicators/cpi.json';

type Row = [title: string, kind: string, url: string, extra: string];

export const GET: APIRoute = () => {
  const rows: Row[] = [];
  const seen = new Set<string>();
  const add = (r: Row) => {
    const key = `${r[1]}|${r[2]}|${r[0]}`;
    if (!seen.has(key)) {
      seen.add(key);
      rows.push(r);
    }
  };

  // Stories, with their topic and section names as extra words.
  for (const s of sections) {
    add([s.name, 'Section', `/${s.slug}/`, s.blurb]);
    for (const t of s.topics) {
      add([t.name, 'Topic', topicUrl(s.slug, t.slug), s.name]);
      for (const f of featured[t.slug] ?? []) {
        if (f.href.includes('?')) continue;
        add([f.title, 'Story', f.href, `${f.blurb} ${t.name} ${s.name}`]);
      }
    }
  }
  for (const c of sharedCharts) add([c.title, 'Chart', `/charts/${c.slug}/`, `${c.subtitle} ${c.topic}`]);
  for (const d of districts) {
    const sr = subregionByCode.get(d.subregion_code);
    add([d.name, 'District', `/places/districts/${d.slug}/`, `${sr?.name ?? ''} district city census`]);
  }
  add(['Compare two districts', 'Tool', '/places/districts/compare/', 'district comparison versus vs']);
  add(['Uganda, district by district', 'Tool', '/places/districts/', 'map districts census']);
  for (const i of mapIndicators) add([`${i.label}, by district`, 'Map', `/places/districts/?show=${i.id}`, `${i.question} ${i.group} map`]);

  // Individual price items in the CPI (~350), linking to their trend.
  const series = (cpiItems as unknown as { series: Record<string, { name: string; group: string }> }).series;
  for (const v of Object.values(series)) {
    if (v.group === 'item') add([v.name, 'Item price', `/economy/prices/inflation/?item=${encodeURIComponent(v.name)}`, 'price inflation cost']);
  }

  // Every UBOS table and report (links go to UBOS).
  for (const e of catalog) add([e.title, e.kind === 'dataset' ? 'UBOS table' : 'UBOS report', e.url, e.topic]);

  return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
