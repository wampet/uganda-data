// One static JSON file per international indicator, fetched by the compare
// explorer only when a reader switches to that indicator.
import { chartData, indicators } from '../../../lib/world';

export function getStaticPaths() {
  return indicators.map((i) => ({ params: { id: i.id } }));
}

export function GET({ params }: { params: { id: string } }) {
  const i = indicators.find((x) => x.id === params.id)!;
  return new Response(JSON.stringify(chartData(i)), { headers: { 'Content-Type': 'application/json' } });
}
