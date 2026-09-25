// Client runtime for <Chart> components.
//
// * Lazy: ECharts loads only when a chart comes within 300px of the viewport.
// * Themed: colours come from CSS tokens, re-read when light/dark changes.
// * Linked: a bar chart can drive a line chart (click a category -> the line
//   chart adds that category's series), so pages feel explorable.
// * Focus mode: any chart can be expanded to fill the screen.
// * Explorer controls (opt-in via the spec): Chart / Map / Table tabs, a
//   Count | Share toggle, an "Add" picker for more lines, a timeline slider.
import type { ChartSeries, ChartSpec } from '../lib/chart-spec';
import { chartRows, createOptions, toCsv, type ChartState } from '../lib/chart-options';

type EChartsType = import('echarts/core').EChartsType;

interface Instance {
  chart: EChartsType;
  spec: ChartSpec;
  /** bar: the clicked category */
  selected?: string;
  /** line: the comparison series currently shown */
  extra?: ChartSeries;
  picked: string[];
  window?: [number, number];
  relative?: boolean;
  view: 'chart' | 'map' | 'table';
}
const stateOf = (e: Instance): ChartState => ({ selected: e.selected, extra: e.extra, picked: e.picked, window: e.window, relative: e.relative });
/** The spec actually drawn: the Map tab swaps in the chart's `mapView`. */
const drawnSpec = (e: Instance): ChartSpec =>
  e.view === 'map' && e.spec.mapView ? { ...e.spec, kind: 'map', map: e.spec.mapView, series: [] } : e.spec;
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
  entry.chart.setOption(options.build(drawnSpec(entry), stateOf(entry)) as any, { notMerge: true });
}

/** Rebuild the table view after the data changes (picks, shares, updates). */
function renderTable(el: HTMLElement) {
  const entry = instances.get(el)!;
  const { spec } = entry;
  const tbody = el.querySelector('tbody');
  if (!tbody) return;
  let heads: string[] | null = null;
  let rows: string[][];
  if (spec.kind === 'pyramid') {
    const p = spec.pyramid!;
    const y = p.yearIndex;
    const n = (v: number) => v.toLocaleString('en-UG');
    rows = p.bands.map((b, i) => [b, n(p.male[i][y]), n(p.female[i][y])]).reverse();
    const cap = el.querySelector('[data-table-caption]');
    if (cap) cap.textContent = String(p.years[y]);
  } else {
    const shown = entry.relative && spec.relative ? { ...spec, unit: '%', digits: 1 } : spec;
    const raw = chartRows(spec, stateOf(entry));
    heads = raw[0].map(String);
    rows = raw.slice(1).map((r) => [String(r[0] ?? ''), ...r.slice(1).map((v) => options.fmt(v as number | null, shown))]);
    if (spec.kind === 'map') rows.sort((a, b) => (parseFloat(b[1]) || -Infinity) - (parseFloat(a[1]) || -Infinity));
    if (spec.kind === 'line') rows.reverse(); // newest first
    if (spec.kind === 'map') heads = ['Area', 'Value'];
  }
  const td = (text: string, tag: 'td' | 'th', cls: string) => {
    const c = document.createElement(tag);
    c.className = cls;
    c.textContent = text;
    return c;
  };
  if (heads) {
    const tr = el.querySelector('thead tr');
    if (tr) tr.replaceChildren(...heads.map((h) => td(h, 'th', 'px-3 py-1.5 font-medium')));
  }
  tbody.replaceChildren(
    ...rows.map((cells) => {
      const tr = document.createElement('tr');
      tr.className = 'border-t border-line';
      tr.append(...cells.map((c) => td(c, 'td', 'px-3 py-1')));
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
  const n = spec.x?.length ?? 0;
  instances.set(el, {
    chart,
    spec,
    view: 'chart',
    picked: [...(spec.picker?.initial ?? [])],
    window: spec.kind === 'line' && n ? [spec.startIndex ?? 0, n - 1] : undefined,
  });
  render(el);
  el.classList.add('is-ready');

  if ((spec.kind === 'map' && spec.map!.href) || spec.mapView?.href) {
    chart.on('click', (p: any) => {
      const e = instances.get(el)!;
      const m = drawnSpec(e).map;
      if (!m || (e.spec.kind !== 'map' && e.view !== 'map')) return;
      const slug = m.slugs?.[p.name];
      if (slug && m.href) location.href = `${m.href}${slug}/`;
    });
  }
  syncPicked(el);

  if (spec.selectTarget) {
    chart.on('click', (p: any) => {
      if (instances.get(el)!.view !== 'chart') return;
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
  const n = instances.get(el)?.spec.x?.length ?? 0;
  if (!n) return;
  setWindow(el, [months === 'all' ? 0 : Math.max(0, n - months), n - 1]);
}

/** Show x[from..to] on a line chart, and keep the slider, labels and range buttons in step. */
// Coalesce redraws while a slider handle is dragged (one pending redraw per chart).
const pendingDraw = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
function setWindow(el: HTMLElement, win: [number, number]) {
  const entry = instances.get(el);
  const x = entry?.spec.x ?? [];
  if (!entry || !x.length) return;
  entry.window = win;
  if (!pendingDraw.has(el)) {
    pendingDraw.set(el, setTimeout(() => {
      pendingDraw.delete(el);
      render(el);
    }, 16));
  }
  const [a, b] = el.querySelectorAll<HTMLInputElement>('[data-tl]');
  if (a && b) {
    a.value = String(win[0]);
    b.value = String(win[1]);
    const fill = el.querySelector<HTMLElement>('[data-tl-fill]');
    const pct = (i: number) => (100 * i) / Math.max(1, x.length - 1);
    if (fill) {
      fill.style.left = `${pct(win[0])}%`;
      fill.style.right = `${100 - pct(win[1])}%`;
    }
    const label = (i: number) => (entry.spec.xNumeric ? String(x[i]) : options.label(String(x[i])));
    el.querySelector('[data-tl-start]')!.textContent = label(win[0]);
    el.querySelector('[data-tl-end]')!.textContent = label(win[1]);
  }
  const span = win[1] - win[0] + 1;
  el.querySelectorAll<HTMLButtonElement>('[data-range]').forEach((btn) => {
    const r = btn.dataset.range!;
    const on = win[1] === x.length - 1 && (r === 'all' ? win[0] === 0 : span === Number(r));
    btn.setAttribute('aria-pressed', String(on));
  });
}

async function setView(el: HTMLElement, view: Instance['view']) {
  await mount(el);
  const entry = instances.get(el)!;
  if (view === 'map' && entry.spec.mapView) await loadGeo(entry.spec.mapView.geo);
  entry.view = view;
  el.classList.toggle('is-view-table', view === 'table');
  el.classList.toggle('is-view-map', view === 'map');
  const canvas = el.querySelector<HTMLElement>('[data-canvas]')!;
  const panel = el.querySelector<HTMLElement>('[data-table-panel]');
  canvas.style.visibility = view === 'table' ? 'hidden' : '';
  if (panel) panel.hidden = view !== 'table';
  el.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => {
    const on = b.dataset.view === view;
    b.setAttribute('aria-selected', String(on));
    b.setAttribute('aria-pressed', String(on));
  });
  if (view === 'table') renderTable(el);
  else render(el);
}

async function setRelative(el: HTMLElement, on: boolean) {
  await mount(el);
  instances.get(el)!.relative = on;
  el.querySelectorAll<HTMLButtonElement>('[data-relative]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.relative === '1') === on)));
  render(el);
  renderTable(el);
}

/** Legend chips and picker ticks for the series the reader added. */
function syncPicked(el: HTMLElement) {
  const entry = instances.get(el);
  if (!entry) return;
  const host = el.querySelector('[data-picked]');
  const colors = new Map(
    (entry.spec.kind === 'line' ? options.series(entry.spec, stateOf(entry)) : []).map((s) => [s.name, s.color ?? 1] as const),
  );
  host?.replaceChildren(
    ...entry.picked.map((name) => {
      const li = document.createElement('span');
      li.className = 'chip-x';
      const key = document.createElement('span');
      key.className = 'key';
      key.style.setProperty('--c', `var(--series-${colors.get(name) ?? 1})`);
      key.style.background = 'var(--c)';
      const x = document.createElement('button');
      x.type = 'button';
      x.textContent = '×';
      x.setAttribute('aria-label', `Remove ${name}`);
      x.addEventListener('click', () => togglePick(el, name));
      li.append(key, document.createTextNode(name), x);
      return li;
    }),
  );
  el.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) => b.setAttribute('aria-selected', String(entry.picked.includes(b.dataset.pick!))));
}

async function togglePick(el: HTMLElement, name: string) {
  await mount(el);
  const entry = instances.get(el)!;
  const max = Number(el.querySelector<HTMLElement>('[data-picker]')?.dataset.max ?? 5);
  if (entry.picked.includes(name)) entry.picked = entry.picked.filter((k) => k !== name);
  else if (entry.picked.length < max) entry.picked = [...entry.picked, name];
  render(el);
  renderTable(el);
  syncPicked(el);
  const live = el.querySelector('[data-selection]');
  if (live) live.textContent = entry.picked.length ? `Showing ${entry.picked.join(', ')}` : '';
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
    el.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) =>
      b.addEventListener('click', () => setView(el, b.dataset.view as Instance['view'])),
    );
    el.querySelectorAll<HTMLButtonElement>('[data-relative]').forEach((b) =>
      b.addEventListener('click', () => setRelative(el, b.dataset.relative === '1')),
    );
    el.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) => b.addEventListener('click', () => togglePick(el, b.dataset.pick!)));
    el.querySelector<HTMLInputElement>('[data-picker-search]')?.addEventListener('input', (e) => {
      const q = (e.target as HTMLInputElement).value.trim().toLowerCase();
      el.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) => {
        b.parentElement!.hidden = !!q && !b.dataset.pick!.toLowerCase().includes(q);
      });
    });
    const tl = el.querySelectorAll<HTMLInputElement>('[data-tl]');
    tl.forEach((input) =>
      input.addEventListener('input', async () => {
        await mount(el);
        let a = Number(tl[0].value);
        let b = Number(tl[1].value);
        // Keep at least two points visible; the dragged handle yields.
        if (b - a < 1) {
          if (input === tl[0]) a = b - 1;
          else b = a + 1;
        }
        setWindow(el, [Math.max(0, a), Math.min(Number(tl[1].max), b)]);
      }),
    );
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
