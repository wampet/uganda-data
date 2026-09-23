// The small, serialisable description a page hands to <Chart>. Pages describe
// WHAT to show; scripts/charts.ts decides HOW (colours, marks, interaction).
export interface ChartSeries {
  name: string;
  data: (number | null)[];
  /** Categorical palette slot 1-8 (fixed order), or 'muted' for context lines. */
  color?: number | 'muted';
  /** dashed line: reserved for projections / estimates, never for gridlines */
  dashed?: boolean;
  /** draw a marker at every data point (sparse series, e.g. census years) */
  points?: boolean;
}

export interface PyramidSpec {
  years: number[];
  /** age bands, youngest first */
  bands: string[];
  /** [band][year] */
  male: number[][];
  female: number[][];
  /** index into years currently shown */
  yearIndex: number;
  /** index of a year drawn as a muted "ghost" behind, for comparison */
  ghostIndex?: number;
}

export interface MapSpec {
  /** URL of a GeoJSON FeatureCollection whose features carry properties.name = area code */
  geo: string;
  /** value per area code */
  values: Record<string, number | null>;
  /** display name per area code */
  names: Record<string, string>;
  /** class breaks (ascending, length = classes - 1); computed server-side */
  breaks: number[];
  /** click an area -> navigate to `${href}${slug}/` */
  href?: string;
  slugs?: Record<string, string>;
  /** outline one area (e.g. on a district's own page) */
  highlight?: string;
  /** locator mode: no values, all areas neutral, `highlight` filled */
  locator?: boolean;
  /** national reference value, shown in the tooltip */
  reference?: { label: string; value: number | null };
}

export interface ChartSpec {
  kind: 'line' | 'bar' | 'map' | 'pyramid';
  map?: MapSpec;
  pyramid?: PyramidSpec;
  /** line: x values are numbers on a true linear axis (e.g. uneven census years) instead of monthly YYYY-MM categories */
  xNumeric?: boolean;
  /** line: fixed y-axis range */
  yMin?: number;
  yMax?: number;
  unit?: string;
  digits?: number;
  /** line: x values as YYYY-MM, or numbers when xNumeric */
  x?: (string | number)[];
  /** line: first visible index (the range buttons change it) */
  startIndex?: number;
  area?: boolean;
  zeroLine?: boolean;
  /** line: extra series a linked bar chart can add by name */
  pool?: Record<string, (number | null)[]>;
  /** bar: category labels, in display order */
  categories?: string[];
  /** bar: id of a line chart to drive when a bar is clicked */
  selectTarget?: string;
  highlight?: string[];
  labelWidth?: number;
  /** line/bar series; unused for maps */
  series: ChartSeries[];
}
