// /api/v1/datasets/<id>.json: a dataset exactly as the site's pages use it.
import type { APIRoute, GetStaticPaths } from 'astro';
import { LICENCE, datasetById, datasets } from '../../../../lib/api';

export const getStaticPaths: GetStaticPaths = () => datasets.map((d) => ({ params: { id: d.id } }));

export const GET: APIRoute = ({ params }) => {
  const d = datasetById.get(params.id!)!;
  const body = { id: d.id, title: d.title, description: d.description, licence: LICENCE, sources: d.sources, data: d.data };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
