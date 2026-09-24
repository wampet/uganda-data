// /api/v1/tables/<id>.json: the same table as the CSV, as columns + rows.
import type { APIRoute, GetStaticPaths } from 'astro';
import { tableById, tableJson, tables } from '../../../../lib/api';

export const getStaticPaths: GetStaticPaths = () => tables.map((t) => ({ params: { id: t.id } }));

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(tableJson(tableById.get(params.id!)!)), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
