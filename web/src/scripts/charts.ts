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
/** "2026-08" -> "Aug 2026"; any other label (e.g. "2025/26", "2025/26 Q4") passes through. */
const monthLabel = (ym: string) => {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
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

/** Compact axis numbers: 12,000,000 -> 12M, 450,000 -> 450K. */
function compact(v: number) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${+(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(0)}K`;
  return String(v);
}

function lineOption(spec: ChartSpec, extra?: ChartSeries) {
  const x = spec.x ?? [];
  const numeric = !!spec.xNumeric;
  const series = extra ? [...spec.series, extra] : [...spec.series];
  const colors = series.map((s) => slot(s.color ?? 1));
  const valueOf = (p: any) => (Array.isArray(p.value) ? p.value[1] : p.value);
  const xLabel = (v: string | number) => (numeric ? String(Math.round(Number(v))) : monthLabel(String(v)));
  const big = spec.series.some((s) => s.data.some((v) => v != null && Math.abs(v) >= 1e5));
  // Numeric year axis: pick a round step from the span and snap both ends to it,
  // so every tick is evenly spaced (no stray labels at the data's first/last year).
  const xNums = numeric ? x.map(Number) : [];
  const span = numeric ? Math.max(...xNums) - Math.min(...xNums) : 0;
  const step = span > 150 ? 50 : span > 60 ? 20 : span > 25 ? 10 : 5;
  const xMin = numeric ? Math.floor(Math.min(...xNums) / step) * step : 0;
  const xMax = numeric ? Math.ceil(Math.max(...xNums) / step) * step : 0;

  return {
    ...baseOption(),
    grid: { left: 8, right: 52, top: 16, bottom: 8 },
    tooltip: {
      ...baseOption().tooltip,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: css('--axis'), width: 1 } },
      formatter: (params: any[]) => {
        const shown = params.filter((p) => valueOf(p) != null);
        if (!shown.length) return '';
        const title = numeric ? xLabel(params[0].axisValue) : monthLabel(String(x[params[0].dataIndex]));
        return tooltipBox(
          title,
          shown.map((p) => ({ color: colors[p.seriesIndex], name: series[p.seriesIndex].name, value: fmt(valueOf(p), spec) })),
        );
      },
    },
    dataZoom: numeric
      ? []
      : [{ type: 'inside', startValue: spec.startIndex ?? 0, endValue: x.length - 1, zoomOnMouseWheel: false, moveOnMouseMove: false, moveOnMouseWheel: false }],
    xAxis: numeric
      ? {
          type: 'value',
          min: xMin,
          max: xMax,
          interval: step,
          splitLine: { show: false },
          axisLine: { show: true, lineStyle: { color: css('--axis') } },
          axisTick: { show: false },
          axisLabel: { color: css('--ink-3'), formatter: xLabel, hideOverlap: true },
        }
      : {
          type: 'category',
          data: x,
          boundaryGap: false,
          axisLine: { lineStyle: { color: css('--axis') } },
          axisTick: { show: false },
          axisLabel: { color: css('--ink-3'), formatter: xLabel, hideOverlap: true },
        },
    yAxis: {
      type: 'value',
      min: spec.yMin,
      max: spec.yMax,
      splitLine: { lineStyle: { color: css('--grid') } },
      axisLabel: { color: css('--ink-3'), formatter: (v: number) => (big ? compact(v) : `${v}${spec.unit ?? ''}`) },
    },
    series: series.map((s, i) => ({
      name: s.name,
      type: 'line',
      data: numeric ? s.data.map((v, j) => [x[j], v]).filter(([, v]) => v != null) : s.data,
      showSymbol: !!s.points,
      symbol: 'circle',
      symbolSize: 8,
      connectNulls: numeric,
      lineStyle: { width: 2, color: colors[i], type: s.dashed ? [6, 4] : 'solid' },
      itemStyle: { color: colors[i], borderColor: css('--surface'), borderWidth: 2 },
      areaStyle: i === 0 && spec.area ? { color: colors[i], opacity: 0.1 } : undefined,
      emphasis: { disabled: true },
      z: s.points ? 3 : 2,
      markLine:
        i === 0 && spec.zeroLine
          ? { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: css('--axis'), type: 'solid', width: 1 }, data: [{ yAxis: 0 }] }
          : undefined,
      // Label the latest value at the line end: main and compared series only
      // (muted context lines stay unlabelled so end labels don't collide).
      endLabel: {
        show: s.color !== 'muted',
        formatter: (p: any) => {
          const v = valueOf(p);
          return big && v != null ? compact(v) : fmt(v, spec);
        },
        color: css('--ink'),
        fontWeight: 600,
      },
    })),
  };
}

function pyramidOption(spec: ChartSpec) {
  const p = spec.pyramid!;
  const y = p.yearIndex;
  const male = p.male.map((row) => -row[y]);
  const female = p.female.map((row) => row[y]);
  const ghost = p.ghostIndex != null && p.ghostIndex !== y ? p.ghostIndex : null;
  const maxAbs = Math.max(...p.male.flat(), ...p.female.flat());
  const cM = slot(1);
  const cF = slot(2);
  const cG = css('--muted-series');
  const bar = (name: string, data: number[], color: string, extra: object = {}) => ({
    name,
    type: 'bar',
    stack: undefined,
    barWidth: '72%',
    barGap: '-100%',
    data: data.map((v) => ({ value: v, itemStyle: { color, borderRadius: v < 0 ? [4, 0, 0, 4] : [0, 4, 4, 0] } })),
    emphasis: { itemStyle: { opacity: 0.85 } },
    animationDurationUpdate: 350,
    ...extra,
  });

  const series: object[] = [];
  if (ghost != null) {
    // Muted outline of the comparison year behind the current bars.
    const gy = ghost;
    series.push(
      bar(`${p.years[gy]}`, p.male.map((r) => -r[gy]), cG, { silent: true, z: 1, itemStyle: { opacity: 0.6 } }),
      bar(`${p.years[gy]} `, p.female.map((r) => r[gy]), cG, { silent: true, z: 1, itemStyle: { opacity: 0.6 } }),
    );
  }
  series.push(bar('Male', male, cM, { z: 2 }), bar('Female', female, cF, { z: 2 }));

  return {
    ...baseOption(),
    animationDurationUpdate: 350,
    grid: [{ left: 8, right: 8, top: 8, bottom: 8 }],
    tooltip: {
      ...baseOption().tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: css('--surface-2'), opacity: 0.6 } },
      formatter: (params: any[]) => {
        const i = params[0].dataIndex;
        const rows = [
          { color: cM, name: 'Male', value: Math.abs(male[i]).toLocaleString('en-UG') },
          { color: cF, name: 'Female', value: female[i].toLocaleString('en-UG') },
        ];
        if (ghost != null) {
          rows.push({ color: cG, name: `Both sexes in ${p.years[ghost]}`, value: (p.male[i][ghost] + p.female[i][ghost]).toLocaleString('en-UG') });
        }
        return tooltipBox(`Age ${p.bands[i]} · ${p.years[y]}`, rows);
      },
    },
    xAxis: {
      type: 'value',
      min: -maxAbs * 1.05,
      max: maxAbs * 1.05,
      splitLine: { lineStyle: { color: css('--grid') } },
      axisLabel: { color: css('--ink-3'), formatter: (v: number) => compact(Math.abs(v)) },
    },
    yAxis: {
      type: 'category',
      data: p.bands,
      axisLine: { lineStyle: { color: css('--axis') } },
      axisTick: { show: false },
      axisLabel: { color: css('--ink-2') },
    },
    series,
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
    grid: { left: 8, right: 56, top: 4, bottom: 4 },
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
    spec.kind === 'map'
      ? mapOption(spec)
      : spec.kind === 'pyramid'
        ? pyramidOption(spec)
        : spec.kind === 'bar'
          ? barOption(spec, selected)
          : lineOption(spec, extra);
  chart.setOption(option as any, { notMerge: true });
}

/** Rebuild the table view for bar/map charts after the data changes. */
function renderTable(el: HTMLElement) {
  const { spec } = instances.get(el)!;
  const tbody = el.querySelector('tbody');
  if (!tbody || spec.kind === 'line') return;
  const num = (v: number | null) => fmt(v, spec);
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
