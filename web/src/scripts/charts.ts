// Client runtime for <Chart> components.
//
// * Lazy: ECharts loads only when a chart comes within 300px of the viewport.
// * Themed: colours come from CSS tokens, re-read when light/dark changes.
// * Linked: a bar chart can drive a line chart (click a category -> the line
//   chart adds that category's series), so pages feel explorable.
// * Focus mode: any chart can be expanded to fill the screen.
import type { ChartSeries, ChartSpec } from '../lib/chart-spec';

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
const slot = (n: number | 'muted') => (n === 'muted' ? css('--muted-series') : css(`--series-${n}`));

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

function fmt(v: number | null | undefined, spec: ChartSpec) {
  if (v == null || Number.isNaN(v)) return '–';
  const d = spec.digits ?? 1;
  return `${v.toLocaleString('en-UG', { minimumFractionDigits: d, maximumFractionDigits: d })}${spec.unit ?? ''}`;
}

function tooltipBox(title: string, rows: { color: string; name: string; value: string }[]) {
  const items = rows
    .map(
      (r) => `<div style="display:flex;align-items:center;gap:8px;margin-top:4px">
        <span style="display:inline-block;width:12px;height:2px;border-radius:1px;background:${r.color}"></span>
        <strong style="font-weight:600;color:${css('--ink')}">${escapeHtml(r.value)}</strong>
        <span style="color:${css('--ink-2')}">${escapeHtml(r.name)}</span></div>`,
    )
    .join('');
  return `<div style="font:13px system-ui,sans-serif"><div style="color:${css('--ink-3')};font-size:12px">${escapeHtml(title)}</div>${items}</div>`;
}

function baseOption() {
  return {
    animationDuration: 500,
    textStyle: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: css('--ink-2') },
    tooltip: {
      backgroundColor: css('--surface'),
      borderColor: css('--border'),
      borderWidth: 1,
      padding: [8, 10],
      extraCssText: 'box-shadow:0 4px 16px rgba(0,0,0,.12);border-radius:10px;',
    },
  };
}

function lineOption(spec: ChartSpec, extra?: ChartSeries) {
  const x = spec.x ?? [];
  const series = extra ? [...spec.series, extra] : [...spec.series];
  const colors = series.map((s) => slot(s.color ?? 1));

  return {
    ...baseOption(),
    grid: { left: 8, right: 52, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      ...baseOption().tooltip,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: css('--axis'), width: 1 } },
      formatter: (params: any[]) =>
        tooltipBox(
          monthLabel(x[params[0].dataIndex]),
          params.map((p) => ({ color: colors[p.seriesIndex], name: series[p.seriesIndex].name, value: fmt(p.value, spec) })),
        ),
    },
    dataZoom: [{ type: 'inside', startValue: spec.startIndex ?? 0, endValue: x.length - 1, zoomOnMouseWheel: false, moveOnMouseMove: false, moveOnMouseWheel: false }],
    xAxis: {
      type: 'category',
      data: x,
      boundaryGap: false,
      axisLine: { lineStyle: { color: css('--axis') } },
      axisTick: { show: false },
      axisLabel: { color: css('--ink-3'), formatter: (v: string) => monthLabel(v), hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: css('--grid') } },
      axisLabel: { color: css('--ink-3'), formatter: (v: number) => `${v}${spec.unit ?? ''}` },
    },
    series: series.map((s, i) => ({
      name: s.name,
      type: 'line',
      data: s.data,
      showSymbol: false,
      symbolSize: 8,
      connectNulls: false,
      lineStyle: { width: 2, color: colors[i] },
      itemStyle: { color: colors[i], borderColor: css('--surface'), borderWidth: 2 },
      areaStyle: i === 0 && spec.area ? { color: colors[i], opacity: 0.1 } : undefined,
      emphasis: { disabled: true },
      markLine:
        i === 0 && spec.zeroLine
          ? { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: css('--axis'), type: 'solid', width: 1 }, data: [{ yAxis: 0 }] }
          : undefined,
      // Label the latest value at the line end: main and compared series only
      // (muted context lines stay unlabelled so end labels don't collide).
      endLabel: {
        show: s.color !== 'muted',
        formatter: (p: any) => fmt(p.value, spec),
        color: css('--ink'),
        fontWeight: 600,
      },
    })),
  };
}

function barOption(spec: ChartSpec, selected?: string) {
  const cats = spec.categories ?? [];
  const data = spec.series[0].data;
  const base = slot(1);
  const pick = slot(2);
  const clickable = !!spec.selectTarget;
  return {
    ...baseOption(),
    grid: { left: 8, right: 56, top: 4, bottom: 4, containLabel: true },
    tooltip: {
      ...baseOption().tooltip,
      trigger: 'item',
      formatter: (p: any) =>
        tooltipBox(cats[p.dataIndex], [{ color: p.color, name: spec.series[0].name, value: fmt(p.value, spec) }]),
    },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: css('--grid') } },
      axisLabel: { show: false },
    },
    yAxis: {
      type: 'category',
      data: cats,
      inverse: true,
      axisLine: { lineStyle: { color: css('--axis') } },
      axisTick: { show: false },
      axisLabel: { color: css('--ink-2'), width: spec.labelWidth ?? 170, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 18,
        cursor: clickable ? 'pointer' : 'default',
        data: data.map((v, i) => ({
          value: v,
          itemStyle: {
            color: cats[i] === selected || spec.highlight?.includes(cats[i]) ? pick : base,
            borderRadius: (v ?? 0) >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
          },
        })),
        label: {
          show: true,
          position: 'right',
          formatter: (p: any) => fmt(p.value, spec),
          color: css('--ink'),
          fontWeight: 500,
        },
        emphasis: { itemStyle: { opacity: 0.85 } },
      },
    ],
  };
}

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

const seq = () => [1, 2, 3, 4, 5].map((i) => css(`--seq-${i}`));

function binLabel(i: number, breaks: number[], spec: ChartSpec) {
  // Whole-number breaks read better without decimals ("25%" not "25.0%").
  const legendSpec = breaks.every(Number.isInteger) ? { ...spec, digits: 0 } : spec;
  const f = (v: number) => fmt(v, legendSpec);
  if (i === 0) return `Under ${f(breaks[0])}`;
  if (i === breaks.length) return `${f(breaks[breaks.length - 1])} or more`;
  return `${f(breaks[i - 1])} – ${f(breaks[i])}`;
}

function locatorOption(spec: ChartSpec) {
  const m = spec.map!;
  return {
    ...baseOption(),
    animation: false,
    tooltip: { ...baseOption().tooltip, trigger: 'item', formatter: (p: any) => tooltipBox(m.names[p.name] ?? p.name, []) },
    series: [
      {
        type: 'map',
        map: m.geo,
        roam: false,
        layoutCenter: ['50%', '50%'],
        layoutSize: '98%',
        selectedMode: false,
        cursor: m.href ? 'pointer' : 'default',
        itemStyle: { areaColor: css('--muted-series'), borderColor: css('--surface'), borderWidth: 0.6 },
        emphasis: { label: { show: false }, itemStyle: { areaColor: css('--ink-3') } },
        data: Object.keys(m.names).map((code) => ({
          name: code,
          ...(code === m.highlight ? { itemStyle: { areaColor: css('--series-1'), borderColor: css('--surface') } } : {}),
        })),
      },
    ],
  };
}

function mapOption(spec: ChartSpec) {
  const m = spec.map!;
  if (m.locator) return locatorOption(spec);
  const colors = seq();
  const entries = Object.entries(m.values);
  const ranked = entries.filter(([, v]) => v != null).sort(([, a], [, b]) => b! - a!);
  const rank = new Map(ranked.map(([code], i) => [code, i + 1]));
  const pieces = [...Array(m.breaks.length + 1).keys()].map((i) => ({
    min: i === 0 ? -Infinity : m.breaks[i - 1],
    max: i === m.breaks.length ? Infinity : m.breaks[i],
    label: binLabel(i, m.breaks, spec),
    color: colors[i],
  }));

  return {
    ...baseOption(),
    animation: false,
    tooltip: {
      ...baseOption().tooltip,
      trigger: 'item',
      formatter: (p: any) => {
        const code = p.name as string;
        const v = m.values[code];
        const rows = [{ color: p.color ?? css('--muted-series'), name: rank.has(code) ? `rank ${rank.get(code)} of ${ranked.length}` : 'no data', value: fmt(v, spec) }];
        if (m.reference) rows.push({ color: css('--axis'), name: m.reference.label, value: fmt(m.reference.value, spec) });
        return tooltipBox(m.names[code] ?? code, rows);
      },
    },
    // Legend runs low -> high along the top, clear of the map.
    visualMap: {
      type: 'piecewise',
      pieces,
      orient: 'horizontal',
      left: 0,
      top: 0,
      itemWidth: 14,
      itemHeight: 10,
      itemGap: 12,
      itemSymbol: 'roundRect',
      textStyle: { color: css('--ink-2'), fontSize: 12 },
      outOfRange: { color: css('--surface-2') },
      selectedMode: false,
    },
    series: [
      {
        type: 'map',
        map: m.geo,
        roam: false,
        layoutCenter: ['50%', '53%'],
        layoutSize: '90%',
        selectedMode: false,
        cursor: m.href ? 'pointer' : 'default',
        itemStyle: { borderColor: css('--surface'), borderWidth: 0.8, areaColor: css('--surface-2') },
        emphasis: {
          label: { show: false },
          itemStyle: { areaColor: css('--series-2'), borderColor: css('--surface'), borderWidth: 1 },
        },
        label: { show: false },
        data: entries.map(([code, value]) => ({
          name: code,
          value,
          ...(m.highlight === code
            ? { itemStyle: { borderColor: css('--ink'), borderWidth: 2.5 }, label: { show: true, formatter: m.names[code], color: css('--ink'), fontWeight: 600, textBorderColor: css('--surface'), textBorderWidth: 3 } }
            : {}),
        })),
      },
    ],
  };
}

function render(el: HTMLElement) {
  const entry = instances.get(el);
  if (!entry) return;
  const { chart, spec, selected, extra } = entry;
  const option =
    spec.kind === 'map' ? mapOption(spec) : spec.kind === 'bar' ? barOption(spec, selected) : lineOption(spec, extra);
  chart.setOption(option as any, { notMerge: true });
}

/** Rebuild the table view for bar/map charts after the data changes. */
function renderTable(el: HTMLElement) {
  const { spec } = instances.get(el)!;
  const tbody = el.querySelector('tbody');
  if (!tbody || spec.kind === 'line') return;
  const rows: [string, number | null][] =
    spec.kind === 'map'
      ? Object.entries(spec.map!.values)
          .map(([c, v]) => [spec.map!.names[c] ?? c, v] as [string, number | null])
          .sort((a, b) => (b[1] ?? -Infinity) - (a[1] ?? -Infinity))
      : (spec.categories ?? []).map((c, i) => [c, spec.series[0].data[i]]);
  tbody.replaceChildren(
    ...rows.map(([name, v]) => {
      const tr = document.createElement('tr');
      tr.className = 'border-t border-line';
      for (const text of [name, fmt(v, spec)]) {
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
  entry.spec = { ...entry.spec, ...specPatch, map: specPatch.map ? { ...entry.spec.map!, ...specPatch.map } : entry.spec.map };
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
