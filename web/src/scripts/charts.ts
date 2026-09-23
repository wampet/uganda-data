// Client runtime for <Chart> components.
//
// * Lazy: ECharts loads only when a chart comes within 300px of the viewport.
// * Themed: colours come from CSS tokens, re-read when light/dark changes.
// * Linked: a bar chart can drive a line chart (click a category -> the line
//   chart adds that category's series), so pages feel explorable.
// * Focus mode: any chart can be expanded to fill the screen.
import type { ChartSeries, ChartSpec } from '../lib/chart-spec';
import { chartRows, createOptions, toCsv } from '../lib/chart-options';

type EChartsType = import('echarts/core').EChartsType;

interface Instance {
  chart: EChartsType;
  spec: ChartSpec;
  /** bar: the clicked category */
  selected?: string;
  /** line: the comparison series currently shown */
  extra?: ChartSeries;
}
const instances = new Map<HTMLElement, Instance>();
let echartsPromise: Promise<typeof import('./echarts-setup').default> | null = null;
const loadEcharts = () => (echartsPromise ??= import('./echarts-setup').then((m) => m.default));

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
// Colours are looked up live, so a theme switch just needs a re-render.
const options = createOptions(css);

// ---- maps -------------------------------------------------------------------
const geoLoaded = new Map<string, Promise<string>>();
/** Fetch + register a GeoJSON once per URL; returns the registered map name. */
function loadGeo(url: string) {
  let p = geoLoaded.get(url);
  if (!p) {
    p = Promise.all([loadEcharts(), fetch(url).then((r) => r.json())]).then(([echarts, geo]) => {
      echarts.registerMap(url, geo);
      return url;
    });
    geoLoaded.set(url, p);
  }
  return p;
}

function render(el: HTMLElement) {
  const entry = instances.get(el);
  if (!entry) return;
  const { chart, spec, selected, extra } = entry;
  chart.setOption(options.build(spec, { selected, extra }) as any, { notMerge: true });
}

/** Rebuild the table view for bar/map charts after the data changes. */
function renderTable(el: HTMLElement) {
  const { spec } = instances.get(el)!;
  const tbody = el.querySelector('tbody');
  if (!tbody || spec.kind === 'line') return;
  const num = (v: number | null) => options.fmt(v, spec);
  let rows: string[][];
  if (spec.kind === 'pyramid') {
    const p = spec.pyramid!;
    const y = p.yearIndex;
    const n = (v: number) => v.toLocaleString('en-UG');
    rows = p.bands.map((b, i) => [b, n(p.male[i][y]), n(p.female[i][y])]).reverse();
    const cap = el.querySelector('[data-table-caption]');
    if (cap) cap.textContent = String(p.years[y]);
  } else if (spec.kind === 'map') {
    rows = Object.entries(spec.map!.values)
      .sort(([, a], [, b]) => (b ?? -Infinity) - (a ?? -Infinity))
      .map(([c, v]) => [spec.map!.names[c] ?? c, num(v)]);
  } else {
    rows = (spec.categories ?? []).map((c, i) => [c, num(spec.series[0].data[i])]);
  }
  tbody.replaceChildren(
    ...rows.map((cells) => {
      const tr = document.createElement('tr');
      tr.className = 'border-t border-line';
      for (const text of cells) {
        const td = document.createElement('td');
        td.className = 'px-3 py-1';
        td.textContent = text;
        tr.appendChild(td);
      }
      return tr;
    }),
  );
}

/** Replace parts of a chart's spec (e.g. switch the indicator shown on a map). */
async function update(el: HTMLElement, patch: Partial<ChartSpec> & { title?: string; subtitle?: string }) {
  await mount(el);
  const entry = instances.get(el)!;
  const { title, subtitle, ...specPatch } = patch;
  entry.spec = {
    ...entry.spec,
    ...specPatch,
    map: specPatch.map ? { ...entry.spec.map!, ...specPatch.map } : entry.spec.map,
    pyramid: specPatch.pyramid ? { ...entry.spec.pyramid!, ...specPatch.pyramid } : entry.spec.pyramid,
  };
  render(el);
  renderTable(el);
  if (title != null) el.querySelector('[data-title]')!.textContent = title;
  if (subtitle != null) el.querySelector('[data-subtitle]')!.textContent = subtitle;
}

const mounting = new Map<HTMLElement, Promise<void>>();
function mount(el: HTMLElement): Promise<void> {
  let p = mounting.get(el);
  if (!p) {
    p = doMount(el);
    mounting.set(el, p);
  }
  return p;
}

async function doMount(el: HTMLElement) {
  const spec: ChartSpec = JSON.parse(el.querySelector('script[type="application/json"]')!.textContent!);
  const echarts = await loadEcharts();
  if (spec.kind === 'map') await loadGeo(spec.map!.geo);
  const canvas = el.querySelector<HTMLElement>('[data-canvas]')!;
  const chart = echarts.init(canvas, undefined, { renderer: 'svg' });
  instances.set(el, { chart, spec });
  render(el);
  el.classList.add('is-ready');

  if (spec.kind === 'map' && spec.map!.href) {
    chart.on('click', (p: any) => {
      const m = instances.get(el)!.spec.map!;
      const slug = m.slugs?.[p.name];
      if (slug) location.href = `${m.href}${slug}/`;
    });
  }

  if (spec.selectTarget) {
    chart.on('click', (p: any) => {
      const target = document.getElementById(spec.selectTarget!);
      const current = instances.get(el)!;
      current.selected = current.selected === p.name ? undefined : p.name;
      render(el);
      if (target) select(target, current.selected);
    });
  }

  new ResizeObserver(() => chart.resize()).observe(canvas);
}

/** Add (or clear) a comparison series on a line chart. `detail` is a pool key or a full series. */
async function select(el: HTMLElement, detail: string | ChartSeries | undefined) {
  await mount(el);
  const entry = instances.get(el)!;
  if (typeof detail === 'string') {
    const data = entry.spec.pool?.[detail];
    entry.extra = data ? { name: detail, data, color: 2 } : undefined;
  } else {
    entry.extra = detail ? { ...detail, color: 2 } : undefined;
  }
  render(el);
  const name = entry.extra?.name;
  const live = el.querySelector('[data-selection]');
  if (live) live.textContent = name ? `Now comparing with ${name}` : '';
  const key = el.querySelector<HTMLElement>('[data-selection-name]');
  if (key) {
    key.dataset.hint ??= key.textContent ?? '';
    key.textContent = name ?? key.dataset.hint;
  }
}

// ---- downloads ------------------------------------------------------------------
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'chart';

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function meta(el: HTMLElement) {
  return {
    title: el.querySelector('[data-title]')?.textContent?.trim() || 'Chart',
    subtitle: el.querySelector('[data-subtitle]')?.textContent?.trim() || '',
    source: el.dataset.sourceTitle ? `Source: UBOS, ${el.dataset.sourceTitle}` : 'Source: Uganda Bureau of Statistics',
    sourceUrl: el.dataset.sourceUrl ?? '',
  };
}

async function downloadCsv(el: HTMLElement) {
  await mount(el);
  const { spec, selected, extra } = instances.get(el)!;
  const m = meta(el);
  const rows = chartRows(spec, { selected, extra });
  rows.push([], [m.title], [m.subtitle], [m.source], [m.sourceUrl], [`Downloaded from Uganda in Data, ${location.href}`]);
  // BOM so Excel opens UTF-8 correctly.
  save(new Blob(['\ufeff' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }), `${slugify(m.title)}.csv`);
}

/** Chart + title + source as one PNG, so a shared image always carries its attribution. */
async function downloadPng(el: HTMLElement) {
  await mount(el);
  const { chart } = instances.get(el)!;
  const m = meta(el);
  const w = chart.getWidth();
  const h = chart.getHeight();
  const img = new Image();
  img.src = chart.getDataURL({ type: 'svg' } as any);
  await img.decode();

  const scale = 2, pad = 28, head = m.subtitle ? 74 : 52, foot = 46;
  const cw = w + pad * 2, ch = head + h + foot;
  const canvas = document.createElement('canvas');
  canvas.width = cw * scale;
  canvas.height = ch * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = css('--surface');
  ctx.fillRect(0, 0, cw, ch);

  const font = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const fit = (text: string, max: number) => {
    let t = text;
    while (t.length > 3 && ctx.measureText(t).width > max) t = t.slice(0, -2);
    return t === text ? t : `${t.trimEnd()}…`;
  };
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = css('--ink');
  ctx.font = `600 19px ${font}`;
  ctx.fillText(fit(m.title, cw - pad * 2), pad, pad + 14);
  if (m.subtitle) {
    ctx.fillStyle = css('--ink-2');
    ctx.font = `14px ${font}`;
    ctx.fillText(fit(m.subtitle, cw - pad * 2), pad, pad + 38);
  }
  ctx.drawImage(img, pad, head, w, h);

  ctx.fillStyle = css('--ink-3');
  ctx.font = `12px ${font}`;
  ctx.fillText(fit(m.source, cw - pad * 2 - 140), pad, ch - 18);
  ctx.fillStyle = css('--ink');
  ctx.font = `600 13px ${font}`;
  const brand = 'Uganda in Data';
  ctx.fillText(brand, cw - pad - ctx.measureText(brand).width, ch - 18);

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (blob) save(blob, `${slugify(m.title)}.png`);
}

function setRange(el: HTMLElement, months: number | 'all') {
  const entry = instances.get(el);
  const n = entry?.spec.x?.length ?? 0;
  if (!entry || !n) return;
  const start = months === 'all' ? 0 : Math.max(0, n - months);
  entry.chart.dispatchAction({ type: 'dataZoom', startValue: start, endValue: n - 1 });
  el.querySelectorAll<HTMLButtonElement>('[data-range]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.range === String(months))),
  );
}

function toggleFocus(el: HTMLElement, on?: boolean) {
  const focused = on ?? !el.classList.contains('is-focused');
  el.classList.toggle('is-focused', focused);
  document.documentElement.classList.toggle('has-focused-chart', focused);
  el.querySelector('[data-focus]')?.setAttribute('aria-pressed', String(focused));
  requestAnimationFrame(() => instances.get(el)?.chart.resize());
}

function init() {
  const els = document.querySelectorAll<HTMLElement>('[data-chart]');
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          io.unobserve(e.target);
          mount(e.target as HTMLElement);
        }
      }
    },
    { rootMargin: '300px' },
  );
  els.forEach((el) => {
    io.observe(el);
    el.querySelectorAll<HTMLButtonElement>('[data-range]').forEach((b) =>
      b.addEventListener('click', async () => {
        await mount(el);
        setRange(el, b.dataset.range === 'all' ? 'all' : Number(b.dataset.range));
      }),
    );
    el.querySelector('[data-focus]')?.addEventListener('click', () => toggleFocus(el));
    el.querySelector('[data-download="csv"]')?.addEventListener('click', () => downloadCsv(el));
    el.querySelector('[data-download="png"]')?.addEventListener('click', () => downloadPng(el));
    // Other widgets on the page (e.g. an item picker) can add a comparison series.
    el.addEventListener('chart:select', (e) => select(el, (e as CustomEvent).detail));
    el.addEventListener('chart:update', (e) => update(el, (e as CustomEvent).detail));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll<HTMLElement>('[data-chart].is-focused').forEach((el) => toggleFocus(el, false));
  });

  // Re-theme charts when the OS scheme or the site toggle changes.
  const rerender = () => instances.forEach((_, el) => render(el));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerender);
  new MutationObserver(rerender).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

init();
