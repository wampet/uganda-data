// Chart option builders, shared by the browser runtime (scripts/charts.ts) and
// the build-time image renderer (pages/og/[slug].png.ts). Pure functions of a
// ChartSpec plus a colour lookup, so the same chart looks identical in both.
import type { ChartSeries, ChartSpec } from './chart-spec';

/** Resolve a design token such as '--ink' or '--series-1' to a colour. */
export type TokenLookup = (name: string) => string;

export interface ChartState {
  /** bar: the clicked category */
  selected?: string;
  /** line: the comparison series currently shown */
  extra?: ChartSeries;
  /** line: pool keys the reader added with the picker */
  picked?: string[];
  /** line: visible window, as [first, last] indices into spec.x */
  window?: [number, number];
  /** show each series as a share of the total */
  relative?: boolean;
}

/** Series shown on a line chart: the spec's own, a linked comparison, then picked pool series. */
export function lineSeries(spec: ChartSpec, state: ChartState = {}): ChartSeries[] {
  const base = state.extra ? [...spec.series, state.extra] : [...spec.series];
  const used = new Set(base.map((s) => s.color ?? 1));
  const free = [1, 2, 3, 4, 5, 6, 7, 8].filter((n) => !used.has(n));
  const shown = new Set(base.map((s) => s.name));
  const picked = (state.picked ?? [])
    .filter((k) => spec.pool?.[k] && !shown.has(k))
    .map((k, i) => ({ name: k, data: spec.pool![k], color: free[i % Math.max(1, free.length)] ?? 1 }));
  return [...base, ...picked];
}

/** The spec as shares of the total at each point (line) or of each bar (bar). */
export function asShares(spec: ChartSpec): ChartSpec {
  const n = spec.kind === 'line' ? (spec.x ?? []).length : (spec.categories ?? []).length;
  const totals = Array.from({ length: n }, (_, i) => spec.series.reduce((sum, s) => sum + (s.data[i] ?? 0), 0));
  return {
    ...spec,
    unit: '%',
    digits: 1,
    yMin: 0,
    yMax: spec.kind === 'line' ? undefined : spec.stacked ? 100 : spec.yMax,
    series: spec.series.map((s) => ({
      ...s,
      data: s.data.map((v, i) => (v == null || !totals[i] ? null : Math.round((1000 * v) / totals[i]) / 10)),
    })),
  };
}

export function createOptions(t: TokenLookup) {
  const slot = (n: number | 'muted') => (n === 'muted' ? t('--muted-series') : t(`--series-${n}`));

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
          <strong style="font-weight:600;color:${t('--ink')}">${escapeHtml(r.value)}</strong>
          <span style="color:${t('--ink-2')}">${escapeHtml(r.name)}</span></div>`,
      )
      .join('');
    return `<div style="font:13px system-ui,sans-serif"><div style="color:${t('--ink-3')};font-size:12px">${escapeHtml(title)}</div>${items}</div>`;
  }

  function baseOption() {
    return {
      animationDuration: 500,
      textStyle: { fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", color: t('--ink-2') },
      tooltip: {
        backgroundColor: t('--surface'),
        borderColor: t('--border'),
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

  function lineOption(spec: ChartSpec, state: ChartState = {}) {
    const x = spec.x ?? [];
    const numeric = !!spec.xNumeric;
    const series = lineSeries(spec, state);
    const win = state.window;
    const colors = series.map((s) => slot(s.color ?? 1));
    const valueOf = (p: any) => (Array.isArray(p.value) ? p.value[1] : p.value);
    const xLabel = (v: string | number) => (numeric ? String(Math.round(Number(v))) : monthLabel(String(v)));
    const big = spec.series.some((s) => s.data.some((v) => v != null && Math.abs(v) >= 1e5));
    // Numeric year axis: pick a round step from the span and snap both ends to it,
    // so every tick is evenly spaced (no stray labels at the data's first/last year).
    // A reader-chosen window (timeline slider) narrows the span the step is picked from.
    const xNums = numeric ? x.map(Number) : [];
    const lo = numeric ? (win ? xNums[win[0]] : Math.min(...xNums)) : 0;
    const hi = numeric ? (win ? xNums[win[1]] : Math.max(...xNums)) : 0;
    const span = hi - lo;
    const step = span > 150 ? 50 : span > 60 ? 20 : span > 25 ? 10 : span > 10 ? 5 : span > 5 ? 2 : 1;
    const xMin = numeric ? Math.floor(lo / step) * step : 0;
    const xMax = numeric ? Math.ceil(hi / step) * step : 0;

    return {
      ...baseOption(),
      grid: { left: 8, right: 52, top: 16, bottom: 8 },
      tooltip: {
        ...baseOption().tooltip,
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: t('--axis'), width: 1 } },
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
        : [{ type: 'inside', startValue: win ? win[0] : spec.startIndex ?? 0, endValue: win ? win[1] : x.length - 1, zoomOnMouseWheel: false, moveOnMouseMove: false, moveOnMouseWheel: false }],
      xAxis: numeric
        ? {
            type: 'value',
            min: xMin,
            max: xMax,
            interval: step,
            splitLine: { show: false },
            axisLine: { show: true, lineStyle: { color: t('--axis') } },
            axisTick: { show: false },
            axisLabel: { color: t('--ink-3'), formatter: xLabel, hideOverlap: true },
          }
        : {
            type: 'category',
            data: x,
            boundaryGap: false,
            axisLine: { lineStyle: { color: t('--axis') } },
            axisTick: { show: false },
            axisLabel: { color: t('--ink-3'), formatter: xLabel, hideOverlap: true },
          },
      yAxis: {
        type: 'value',
        min: spec.yMin,
        max: spec.yMax,
        splitLine: { lineStyle: { color: t('--grid') } },
        axisLabel: { color: t('--ink-3'), formatter: (v: number) => (big ? compact(v) : `${v}${spec.unit ?? ''}`) },
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
        itemStyle: { color: colors[i], borderColor: t('--surface'), borderWidth: 2 },
        areaStyle: i === 0 && spec.area ? { color: colors[i], opacity: 0.1 } : undefined,
        emphasis: { disabled: true },
        z: s.points ? 3 : 2,
        markLine:
          i === 0 && spec.zeroLine
            ? { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: t('--axis'), type: 'solid', width: 1 }, data: [{ yAxis: 0 }] }
            : undefined,
        // Label the latest value at the line end: main and compared series only
        // (muted context lines stay unlabelled so end labels don't collide).
        endLabel: {
          show: s.color !== 'muted',
          formatter: (p: any) => {
            const v = valueOf(p);
            return big && v != null ? compact(v) : fmt(v, spec);
          },
          color: t('--ink'),
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
    // Round the axis end up to a clean number (e.g. 4.9M -> 5M) so edge ticks don't crowd.
    const rawMax = Math.max(...p.male.flat(), ...p.female.flat());
    const mag = 10 ** Math.floor(Math.log10(rawMax));
    const maxAbs = Math.ceil(rawMax / (mag / 2)) * (mag / 2);
    const cM = slot(1);
    const cF = slot(2);
    const cG = t('--muted-series');
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
        axisPointer: { type: 'shadow', shadowStyle: { color: t('--surface-2'), opacity: 0.6 } },
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
        min: -maxAbs,
        max: maxAbs,
        splitLine: { lineStyle: { color: t('--grid') } },
        // The rounded ends aren't on the tick grid, so their labels would crowd the last tick.
        axisLabel: { color: t('--ink-3'), formatter: (v: number) => compact(Math.abs(v)), showMinLabel: false, showMaxLabel: false },
      },
      yAxis: {
        type: 'category',
        data: p.bands,
        axisLine: { lineStyle: { color: t('--axis') } },
        axisTick: { show: false },
        axisLabel: { color: t('--ink-2') },
      },
      series,
    };
  }

  /** Horizontal stacked bars: one colour per series (fixed slot order), 2px surface gaps between segments. */
  function stackedBarOption(spec: ChartSpec) {
    const cats = spec.categories ?? [];
    const colors = spec.series.map((s) => slot(s.color ?? 1));
    return {
      ...baseOption(),
      grid: { left: 8, right: 16, top: 4, bottom: 4 },
      tooltip: {
        ...baseOption().tooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: t('--surface-2'), opacity: 0.6 } },
        formatter: (params: any[]) =>
          tooltipBox(
            cats[params[0].dataIndex],
            params.map((p) => ({ color: colors[p.seriesIndex], name: spec.series[p.seriesIndex].name, value: fmt(p.value, spec) })),
          ),
      },
      xAxis: { type: 'value', max: spec.yMax, splitLine: { show: false }, axisLabel: { show: false } },
      yAxis: {
        type: 'category',
        data: cats,
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: t('--ink-2'), width: spec.labelWidth ?? 170, overflow: 'truncate' },
      },
      series: spec.series.map((s, i) => ({
        name: s.name,
        type: 'bar',
        stack: 'total',
        barMaxWidth: 22,
        data: s.data,
        itemStyle: { color: colors[i], borderColor: t('--surface'), borderWidth: 1 },
        // Label a segment only when it is wide enough to hold the text.
        label: {
          show: true,
          position: 'inside',
          formatter: (p: any) => (p.value >= 9 ? fmt(p.value, { ...spec, digits: 0 }) : ''),
          color: '#ffffff',
          fontWeight: 600,
          fontSize: 11,
        },
        emphasis: { focus: 'series' },
      })),
    };
  }

  /** Horizontal grouped bars (several series side by side), one colour per series, value labels at the end. */
  function groupedBarOption(spec: ChartSpec) {
    const cats = spec.categories ?? [];
    const colors = spec.series.map((s) => slot(s.color ?? 1));
    return {
      ...baseOption(),
      grid: { left: 8, right: 56, top: 4, bottom: 4 },
      tooltip: {
        ...baseOption().tooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: t('--surface-2'), opacity: 0.6 } },
        formatter: (params: any[]) =>
          tooltipBox(
            cats[params[0].dataIndex],
            params.map((p) => ({ color: colors[p.seriesIndex], name: spec.series[p.seriesIndex].name, value: fmt(p.value, spec) })),
          ),
      },
      xAxis: { type: 'value', splitLine: { lineStyle: { color: t('--grid') } }, axisLabel: { show: false } },
      yAxis: {
        type: 'category',
        data: cats,
        inverse: true,
        axisLine: { lineStyle: { color: t('--axis') } },
        axisTick: { show: false },
        axisLabel: { color: t('--ink-2'), width: spec.labelWidth ?? 170, overflow: 'truncate' },
      },
      series: spec.series.map((s, i) => ({
        name: s.name,
        type: 'bar',
        barMaxWidth: 12,
        barGap: '20%',
        data: s.data,
        itemStyle: { color: colors[i], borderRadius: [0, 3, 3, 0] },
        label: { show: true, position: 'right', formatter: (p: any) => fmt(p.value, spec), color: t('--ink'), fontSize: 11 },
        emphasis: { focus: 'series' },
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
      grid: { left: 8, right: 56, top: 4, bottom: 4 },
      tooltip: {
        ...baseOption().tooltip,
        trigger: 'item',
        formatter: (p: any) =>
          tooltipBox(cats[p.dataIndex], [{ color: p.color, name: spec.series[0].name, value: fmt(p.value, spec) }]),
      },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: t('--grid') } },
        axisLabel: { show: false },
      },
      yAxis: {
        type: 'category',
        data: cats,
        inverse: true,
        axisLine: { lineStyle: { color: t('--axis') } },
        axisTick: { show: false },
        axisLabel: { color: t('--ink-2'), width: spec.labelWidth ?? 170, overflow: 'truncate' },
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
            color: t('--ink'),
            fontWeight: 500,
          },
          emphasis: { itemStyle: { opacity: 0.85 } },
        },
      ],
    };
  }

  const seq = () => [1, 2, 3, 4, 5].map((i) => t(`--seq-${i}`));

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
          itemStyle: { areaColor: t('--muted-series'), borderColor: t('--surface'), borderWidth: 0.6 },
          emphasis: { label: { show: false }, itemStyle: { areaColor: t('--ink-3') } },
          data: Object.keys(m.names).map((code) => ({
            name: code,
            ...(code === m.highlight ? { itemStyle: { areaColor: t('--series-1'), borderColor: t('--surface') } } : {}),
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
          const rows = [{ color: p.color ?? t('--muted-series'), name: rank.has(code) ? `rank ${rank.get(code)} of ${ranked.length}` : 'no data', value: fmt(v, spec) }];
          if (m.reference) rows.push({ color: t('--axis'), name: m.reference.label, value: fmt(m.reference.value, spec) });
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
        textStyle: { color: t('--ink-2'), fontSize: 12 },
        outOfRange: { color: t('--surface-2') },
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
          itemStyle: { borderColor: t('--surface'), borderWidth: 0.8, areaColor: t('--surface-2') },
          emphasis: {
            label: { show: false },
            itemStyle: { areaColor: t('--series-2'), borderColor: t('--surface'), borderWidth: 1 },
          },
          label: { show: false },
          data: entries.map(([code, value]) => ({
            name: code,
            value,
            ...(m.highlight === code
              ? { itemStyle: { borderColor: t('--ink'), borderWidth: 2.5 }, label: { show: true, formatter: m.names[code], color: t('--ink'), fontWeight: 600, textBorderColor: t('--surface'), textBorderWidth: 3 } }
              : {}),
          })),
        },
      ],
    };
  }

  function build(input: ChartSpec, state: ChartState = {}) {
    const spec = state.relative && input.relative ? asShares(input) : input;
    return spec.kind === 'map'
      ? mapOption(spec)
      : spec.kind === 'pyramid'
        ? pyramidOption(spec)
        : spec.kind === 'bar'
          ? spec.stacked
            ? stackedBarOption(spec)
            : spec.series.length > 1
              ? groupedBarOption(spec)
              : barOption(spec, state.selected)
          : lineOption(spec, state);
  }

  return { build, fmt, label: monthLabel, series: lineSeries };
}

// ---- CSV export (same rows as the table view) ----------------------------------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const xLabel = (x: string | number, numeric?: boolean) => {
  const s = String(x);
  if (numeric || !/^\d{4}-\d{2}$/.test(s)) return s;
  const [y, m] = s.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

/** Rows (first row = header) of the data a chart currently shows, unrounded. */
export function chartRows(input: ChartSpec, state: ChartState = {}): (string | number | null)[][] {
  const spec = state.relative && input.relative ? asShares(input) : input;
  if (spec.kind === 'line') {
    const series = lineSeries(spec, state);
    return [
      [spec.xNumeric ? 'Year' : 'Period', ...series.map((s) => s.name)],
      ...(spec.x ?? []).map((x, i) => [xLabel(x, spec.xNumeric), ...series.map((s) => s.data[i] ?? null)]),
    ];
  }
  if (spec.kind === 'pyramid') {
    const p = spec.pyramid!;
    const y = p.yearIndex;
    return [['Age', `Male ${p.years[y]}`, `Female ${p.years[y]}`], ...p.bands.map((b, i) => [b, p.male[i][y], p.female[i][y]])];
  }
  if (spec.kind === 'map') {
    const m = spec.map!;
    return [['Area', 'Value'], ...Object.entries(m.values).map(([code, v]) => [m.names[code] ?? code, v])];
  }
  return [['', ...spec.series.map((s) => s.name)], ...(spec.categories ?? []).map((c, i) => [c, ...spec.series.map((s) => s.data[i] ?? null)])];
}

export function toCsv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    if (v == null) return '';
    const s = String(v);
    // Quote when needed; neutralise spreadsheet formula injection (=, +, -, @ at the start of text).
    const safe = typeof v === 'string' && /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}
