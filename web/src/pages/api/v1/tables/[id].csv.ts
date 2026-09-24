// /api/v1/tables/<id>.csv: one tidy table, ready for a spreadsheet.
import type { APIRoute, GetStaticPaths } from 'astro';
import { tableById, tables } from '../../../../lib/api';
import { toCsv } from '../../../../lib/chart-options';

export const getStaticPaths: GetStaticPaths = () => tables.map((t) => ({ params: { id: t.id } }));

export const GET: APIRoute = ({ params }) => {
  const t = tableById.get(params.id!)!;
  // BOM so Excel opens the UTF-8 correctly (names like "Uganda’s", "°C").
  return new Response(`\uFEFF${toCsv(t.rows())}\r\n`, { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
