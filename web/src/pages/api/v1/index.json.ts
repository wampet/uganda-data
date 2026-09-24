// /api/v1/index.json: what the data API offers, with links to every file.
import { API, LICENCE, datasets, tables } from '../../../lib/api';

export function GET({ site }: { site?: URL }) {
  const abs = (p: string) => (site ? new URL(p, site).href : p);
  const body = {
    name: 'Uganda in Data API',
    version: 'v1',
    licence: LICENCE,
    docs: abs('/api/'),
    datasets: datasets.map((d) => ({
      id: d.id, title: d.title, description: d.description,
      json: abs(`${API}/datasets/${d.id}.json`), page: abs(d.page), sources: d.sources,
    })),
    tables: tables.map((t) => ({
      id: t.id, title: t.title, description: t.description,
      csv: abs(`${API}/tables/${t.id}.csv`), json: abs(`${API}/tables/${t.id}.json`), page: abs(t.page), source: t.source,
    })),
  };
  return new Response(JSON.stringify(body, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
