// Only the ECharts pieces we use, so the chart bundle stays small. This module
// is dynamically imported the first time a chart scrolls near the viewport.
import * as echarts from 'echarts/core';
import { BarChart, LineChart, MapChart } from 'echarts/charts';
import {
  DataZoomInsideComponent,
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapPiecewiseComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  BarChart,
  MapChart,
  GridComponent,
  TooltipComponent,
  DataZoomInsideComponent,
  MarkAreaComponent,
  MarkLineComponent,
  VisualMapPiecewiseComponent,
  SVGRenderer,
]);

export default echarts;
