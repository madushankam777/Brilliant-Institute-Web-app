// one Apache ECharts chart - only the chart types the dashboard uses are loaded
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart, HeatmapChart } from 'echarts/charts';
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  ToolboxComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  HeatmapChart,
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  ToolboxComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

// brand colours: navy, blue, gold, green, teal, amber, purple, red
const PALETTE = ['#1e3a8a', '#2563eb', '#c9a961', '#15803d', '#0f766e', '#b45309', '#7c3aed', '#b91c1c'];

function EChart({ option, height = 320, onClick, label }) {
  const boxRef = useRef(null);
  const chartRef = useRef(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  // create once, resize with the card, clean up on leave
  useEffect(() => {
    const chart = echarts.init(boxRef.current, null, { renderer: 'canvas' });
    chartRef.current = chart;
    chart.on('click', (params) => {
      if (clickRef.current) clickRef.current(params);
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(boxRef.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // new data -> redraw
  useEffect(() => {
    if (!chartRef.current || !option) return;
    chartRef.current.setOption(
      {
        color: PALETTE,
        aria: { enabled: true },
        textStyle: { fontFamily: "'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif" },
        animationDuration: 500,
        ...option,
      },
      true
    );
  }, [option]);

  return <div ref={boxRef} className="echart-box" style={{ height }} role="img" aria-label={label} />;
}

export default EChart;
