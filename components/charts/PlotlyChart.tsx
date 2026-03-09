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
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return (
      <div
        style={{ height: style?.height ?? 320, backgroundColor: 'var(--surface)', ...style }}
        className="flex items-center justify-center rounded-md animate-pulse"
      />
    );
  }

  const isDark = resolvedTheme === 'dark';
  const textColor = isDark ? '#d4d4d4' : '#1e293b';
  const mutedColor = isDark ? '#737373' : '#94a3b8';
  const gridColor = isDark ? '#292929' : '#f1f5f9';
  const lineColor = isDark ? '#3a3a3a' : '#e2e8f0';
  const hoverBg = isDark ? '#1c1c1c' : '#ffffff';
  const hoverBorder = isDark ? '#404040' : '#e2e8f0';

  const axisDefaults: Partial<Plotly.LayoutAxis> = {
    gridcolor: gridColor,
    linecolor: lineColor,
    tickfont: { color: mutedColor, size: 11 },
    title: { font: { color: mutedColor, size: 11 } } as never,
    zeroline: false,
    showgrid: true,
  };

  // Deep-merge axis overrides so chart-specific tickformat etc. doesn't blow away gridcolor
  const mergedXAxis = { ...axisDefaults, ...(layout.xaxis ?? {}) };
  const mergedYAxis = { ...axisDefaults, ...(layout.yaxis ?? {}) };

  const mergedLayout: Partial<Plotly.Layout> = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: textColor, family: 'Inter, system-ui, sans-serif', size: 12 },
    margin: { l: 64, r: 24, t: 48, b: 56 },
    autosize: true,
    hovermode: layout.hovermode ?? 'closest',
    hoverlabel: {
      bgcolor: hoverBg,
      bordercolor: hoverBorder,
      font: { color: textColor, size: 12 },
    },
    legend: {
      bgcolor: 'transparent',
      font: { color: mutedColor, size: 11 },
      orientation: 'h',
      x: 0,
      y: 1.12,
    },
    title: layout.title
      ? {
          ...(typeof layout.title === 'string' ? { text: layout.title } : layout.title),
          font: { color: textColor, size: 13, family: 'Inter, system-ui, sans-serif' },
          x: 0.01,
          xanchor: 'left',
        }
      : undefined,
    // Spread everything from layout except xaxis/yaxis (handled by deep merge above)
    ...Object.fromEntries(Object.entries(layout).filter(([k]) => k !== 'xaxis' && k !== 'yaxis' && k !== 'title')),
    xaxis: mergedXAxis,
    yaxis: mergedYAxis,
  };

  return (
    <Plot
      data={data}
      layout={mergedLayout}
      config={{ responsive: true, displayModeBar: false, ...config }}
      style={{ width: '100%', ...style }}
      useResizeHandler
    />
  );
}
