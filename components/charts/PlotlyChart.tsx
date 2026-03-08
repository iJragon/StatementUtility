'use client';

import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

interface PlotlyChartProps {
  data: Plotly.Data[];
  layout?: Partial<Plotly.Layout>;
  config?: Partial<Plotly.Config>;
  style?: React.CSSProperties;
}

export default function PlotlyChart({ data, layout = {}, config = {}, style }: PlotlyChartProps) {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        style={{ height: 300, backgroundColor: 'var(--surface)', ...style }}
        className="flex items-center justify-center rounded-md"
      />
    );
  }

  const isDark = theme === 'dark';
  const textColor = isDark ? '#f5f5f5' : '#0f172a';
  const gridColor = isDark ? '#262626' : '#e2e8f0';
  const paperBg = 'transparent';
  const plotBg = 'transparent';

  const defaultLayout: Partial<Plotly.Layout> = {
    paper_bgcolor: paperBg,
    plot_bgcolor: plotBg,
    font: { color: textColor, family: 'Inter, system-ui, sans-serif', size: 12 },
    margin: { l: 60, r: 20, t: 40, b: 60 },
    xaxis: {
      gridcolor: gridColor,
      linecolor: gridColor,
      tickfont: { color: textColor },
    },
    yaxis: {
      gridcolor: gridColor,
      linecolor: gridColor,
      tickfont: { color: textColor },
    },
    legend: {
      bgcolor: 'transparent',
      font: { color: textColor },
    },
    hoverlabel: {
      bgcolor: isDark ? '#262626' : '#ffffff',
      font: { color: textColor },
    },
    autosize: true,
    ...layout,
  };

  const defaultConfig: Partial<Plotly.Config> = {
    responsive: true,
    displayModeBar: false,
    ...config,
  };

  return (
    <Plot
      data={data}
      layout={defaultLayout}
      config={defaultConfig}
      style={{ width: '100%', ...style }}
      useResizeHandler
    />
  );
}
