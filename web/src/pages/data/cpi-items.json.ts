// Static JSON (generated at build) for the item explorer. Fetched only when a
// reader opens the picker, so it never weighs down the page itself.
import { cpi } from '../../lib/data';
import { YOY_START } from '../../lib/cpi';

export function GET() {
  const items = Object.entries(cpi.series)
    .filter(([, v]) => v.group === 'item' && !v.outlier)
    .map(([id, v]) => ({
      id,
      name: v.name,
      yoy: v.yoy.slice(YOY_START).map((x) => (x == null ? null : Math.round(x * 10) / 10)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return new Response(JSON.stringify({ items }), { headers: { 'Content-Type': 'application/json' } });
}
