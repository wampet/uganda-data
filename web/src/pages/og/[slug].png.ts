// Link-preview images (1200x630 PNG) for shareable charts, rendered at build
// time: ECharts draws the chart to SVG server-side using the same option
// builders as the browser, resvg turns the composed card into a PNG.
import type { APIRoute, GetStaticPaths } from 'astro';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as echarts from 'echarts';
import { Resvg } from '@resvg/resvg-js';
import { createOptions } from '../../lib/chart-options';
import { sharedBySlug, sharedCharts } from '../../lib/share-charts';

export const getStaticPaths: GetStaticPaths = () => sharedCharts.map((c) => ({ params: { slug: c.slug } }));

const W = 1200;
const H = 630;
const PAD = 56;
// Bundled Inter (SIL OFL) so previews render identically on any build machine;
// system fonts are ignored, and any other family in the SVG falls back to Inter.
const FONT = 'Inter';
const FONT_FILES = ['400Regular/Inter_400Regular.ttf', '600SemiBold/Inter_600SemiBold.ttf', '700Bold/Inter_700Bold.ttf'].map((f) =>
  join(process.cwd(), 'node_modules/@expo-google-fonts/inter', f),
);

// Light-theme tokens, read from the stylesheet so colours are defined once.
const tokens = (() => {
  const css = readFileSync(join(process.cwd(), 'src/styles/global.css'), 'utf-8');
  const root = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
  return Object.fromEntries([...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
})();
const t = (name: string) => tokens[name] ?? '#000000';
const options = createOptions(t);

let mapRegistered = false;
function ensureMap(url: string) {
  if (mapRegistered) return;
  const geo = JSON.parse(readFileSync(join(process.cwd(), 'public', url.replace(/^\//, '')), 'utf-8'));
  echarts.registerMap(url, geo);
  mapRegistered = true;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Greedy word wrap by an approximate character width. */
function wrap(text: string, maxChars: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, '')}…`;
  }
  return lines;
}

export const GET: APIRoute = ({ params }) => {
  const c = sharedBySlug.get(params.slug!)!;

  const titleLines = wrap(c.title, 44, 2);
  const titleSize = 44;
  // Legend (right-aligned on the subtitle line) whenever colour carries identity.
  const legendItems: { name: string; color: string; kind: 'line' | 'dashed' | 'box' }[] =
    c.spec.kind === 'pyramid'
      ? [{ name: 'Male', color: t('--series-1'), kind: 'box' }, { name: 'Female', color: t('--series-2'), kind: 'box' }]
      : c.spec.series.length > 1 && (c.spec.kind === 'line' || c.spec.kind === 'bar')
        ? c.spec.series.map((s) => ({
            name: s.name,
            color: s.color === 'muted' ? t('--muted-series') : t(`--series-${s.color ?? 1}`),
            kind: c.spec.kind === 'bar' ? 'box' : s.dashed ? 'dashed' : 'line',
          }))
        : [];
  const legendW = legendItems.reduce((n, it) => n + it.name.length * 10.5 + 54, 0);
  const subtitleW = c.subtitle.length * 12.5;
  const ownLine = legendItems.length > 0 && PAD + subtitleW + 24 > W - PAD - legendW;
  const subtitleY = PAD + titleLines.length * (titleSize + 8) + 22;
  const legendY = ownLine ? subtitleY + 34 : subtitleY;
  const top = PAD + titleLines.length * (titleSize + 8) + 34 + (ownLine ? 34 : 0); // title + subtitle (+ legend line)
  const footerH = 56;
  const chartW = W - PAD * 2;
  const chartH = H - top - footerH - 12;

  if (c.spec.kind === 'map') ensureMap(c.spec.map!.geo);
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: chartW, height: chartH });
  chart.setOption({ ...(options.build(c.spec) as object), animation: false } as any);
  const chartSvg = chart.renderToSVGString();
  chart.dispose();
  // Nest the chart's <svg> at its position in the card.
  const inner = chartSvg.replace(/^<svg\b[^>]*>/, `<svg x="${PAD}" y="${top}" width="${chartW}" height="${chartH}" viewBox="0 0 ${chartW} ${chartH}">`);

  let lx = W - PAD;
  const legend = legendItems
    .slice()
    .reverse()
    .map((it) => {
      const textW = it.name.length * 10.5;
      lx -= textW;
      const text = `<text x="${lx}" y="${legendY}" font-size="19" fill="${t('--ink-2')}">${esc(it.name)}</text>`;
      lx -= 30;
      const key =
        it.kind === 'box'
          ? `<rect x="${lx}" y="${legendY - 14}" width="16" height="16" rx="3" fill="${it.color}"/>`
          : `<line x1="${lx}" y1="${legendY - 6}" x2="${lx + 22}" y2="${legendY - 6}" stroke="${it.color}" stroke-width="3" stroke-linecap="round"${it.kind === 'dashed' ? ' stroke-dasharray="6 5"' : ''}/>`;
      lx -= 24;
      return key + text;
    })
    .join('\n  ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${esc(FONT)}">
  <rect width="${W}" height="${H}" fill="${t('--surface')}"/>
  <rect x="0" y="0" width="${W / 3}" height="8" fill="${t('--ink')}"/>
  <rect x="${W / 3}" y="0" width="${W / 3}" height="8" fill="${t('--brand')}"/>
  <rect x="${(2 * W) / 3}" y="0" width="${W / 3}" height="8" fill="#d90000"/>
  ${titleLines.map((l, i) => `<text x="${PAD}" y="${PAD + titleSize + i * (titleSize + 8)}" font-size="${titleSize}" font-weight="700" fill="${t('--ink')}">${esc(l)}</text>`).join('\n  ')}
  <text x="${PAD}" y="${subtitleY}" font-size="24" fill="${t('--ink-2')}">${esc(c.subtitle)}</text>
  ${legend}
  ${inner}
  <line x1="${PAD}" y1="${H - footerH}" x2="${W - PAD}" y2="${H - footerH}" stroke="${t('--grid')}" stroke-width="1"/>
  <text x="${PAD}" y="${H - 20}" font-size="20" fill="${t('--ink-3')}">${esc(wrap(`Source: UBOS, ${c.source.title}`, 72, 1)[0])}</text>
  <text x="${W - PAD}" y="${H - 20}" font-size="22" font-weight="700" text-anchor="end" fill="${t('--ink')}">Uganda in Data</text>
</svg>`;

  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { loadSystemFonts: false, fontFiles: FONT_FILES, defaultFontFamily: FONT },
  }).render().asPng();

  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
