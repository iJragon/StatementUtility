'use client';

import { useState } from 'react';
import type { RatioReport } from '@/lib/models/statement';
import {
  BENCHMARKS,
  PROPERTY_CLASSES,
  evaluateBenchmark,
  barPosition,
  type PropertyClass,
  type BenchmarkDef,
  type ClassBenchmark,
} from '@/lib/benchmarks';

interface BenchmarksTabProps {
  ratios: RatioReport;
}

const STATUS_COLORS = {
  good: 'var(--success)',
  warning: 'var(--warning)',
  bad: 'var(--danger)',
} as const;

const STATUS_BG = {
  good: 'rgba(34,197,94,0.12)',
  warning: 'rgba(245,158,11,0.12)',
  bad: 'rgba(239,68,68,0.12)',
} as const;

function formatValue(value: number, unit: '%' | 'x'): string {
  return unit === 'x' ? `${value.toFixed(2)}x` : `${value.toFixed(1)}%`;
}

function RangeBar({
  value,
  bm,
  def,
  status,
}: {
  value: number;
  bm: ClassBenchmark;
  def: BenchmarkDef;
  status: 'good' | 'warning' | 'bad';
}) {
  const { barMin, barMax } = def;
  const zoneLeft = barPosition(bm.lo, barMin, barMax);
  const zoneWidth = barPosition(bm.hi, barMin, barMax) - zoneLeft;
  const dotLeft = barPosition(value, barMin, barMax);

  return (
    <div className="mt-3 mb-1">
      {/* Track */}
      <div
        className="relative rounded-full"
        style={{ height: 6, backgroundColor: 'var(--border)' }}
      >
        {/* Benchmark zone */}
        <div
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            left: `${zoneLeft}%`,
            width: `${zoneWidth}%`,
            backgroundColor: 'rgba(120,130,160,0.3)',
          }}
        />
        {/* Value dot */}
        <div
          className="absolute rounded-full border-2"
          style={{
            left: `${dotLeft}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 13,
            height: 13,
            backgroundColor: STATUS_COLORS[status],
            borderColor: 'var(--surface)',
            boxShadow: `0 0 0 2px ${STATUS_COLORS[status]}40`,
          }}
        />
      </div>

      {/* Scale labels */}
      <div className="flex justify-between mt-1.5">
        <span className="text-xs" style={{ color: 'var(--muted)', opacity: 0.55 }}>
          {formatValue(barMin, def.unit)}
        </span>
        <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
          Target {formatValue(bm.lo, def.unit)}–{formatValue(bm.hi, def.unit)}
        </span>
        <span className="text-xs" style={{ color: 'var(--muted)', opacity: 0.55 }}>
          {formatValue(barMax, def.unit)}
        </span>
      </div>
    </div>
  );
}

function BenchmarkCard({
  def,
  value,
  propertyClass,
}: {
  def: BenchmarkDef;
  value: number | null;
  propertyClass: PropertyClass;
}) {
  const bm = def[propertyClass];

  if (value === null) {
    return (
      <div className="card flex flex-col gap-2">
        <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{def.label}</p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>{def.description}</p>
        <p className="text-sm font-mono mt-1" style={{ color: 'var(--muted)' }}>No data</p>
      </div>
    );
  }

  const status = evaluateBenchmark(value, bm, def.lowerIsBetter);

  return (
    <div className="card flex flex-col">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <p className="text-xs font-semibold leading-tight" style={{ color: 'var(--text)' }}>
          {def.label}
        </p>
        <span
          className="flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full capitalize"
          style={{ color: STATUS_COLORS[status], backgroundColor: STATUS_BG[status] }}
        >
          {status}
        </span>
      </div>

      <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>{def.description}</p>

      {/* Value */}
      <p className="text-2xl font-bold leading-none" style={{ color: STATUS_COLORS[status] }}>
        {formatValue(value, def.unit)}
      </p>

      {/* Bar */}
      <RangeBar value={value} bm={bm} def={def} status={status} />
    </div>
  );
}

export default function BenchmarksTab({ ratios }: BenchmarksTabProps) {
  const [propertyClass, setPropertyClass] = useState<PropertyClass>('B');

  // Resolve ratio values from the RatioReport by key
  const getValue = (key: string): number | null => {
    const r = ratios[key as keyof RatioReport];
    return r?.value ?? null;
  };

  const values = BENCHMARKS.map(def => getValue(def.key));

  // Summary counts
  const scored = BENCHMARKS.map((def, i) => {
    const v = values[i];
    if (v === null) return null;
    return evaluateBenchmark(v, def[propertyClass], def.lowerIsBetter);
  }).filter(Boolean) as Array<'good' | 'warning' | 'bad'>;

  const counts = {
    good: scored.filter(s => s === 'good').length,
    warning: scored.filter(s => s === 'warning').length,
    bad: scored.filter(s => s === 'bad').length,
  };

  return (
    <div className="space-y-5 max-w-4xl">

      {/* Class selector */}
      <div className="card">
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
          Property Class
        </p>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(PROPERTY_CLASSES) as PropertyClass[]).map(cls => (
            <button
              key={cls}
              onClick={() => setPropertyClass(cls)}
              className="flex-1 min-w-[140px] text-left px-4 py-3 rounded-lg border transition-all"
              style={{
                borderColor: propertyClass === cls ? 'var(--accent)' : 'var(--border)',
                backgroundColor: propertyClass === cls ? 'rgba(var(--accent-rgb,99,102,241),0.08)' : 'var(--bg)',
              }}
            >
              <p
                className="text-sm font-semibold"
                style={{ color: propertyClass === cls ? 'var(--accent)' : 'var(--text)' }}
              >
                {PROPERTY_CLASSES[cls].label}
              </p>
              <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--muted)' }}>
                {PROPERTY_CLASSES[cls].description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Scorecard summary */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { label: 'On Target', key: 'good', color: 'var(--success)', bg: 'rgba(34,197,94,0.08)' },
          { label: 'Watch', key: 'warning', color: 'var(--warning)', bg: 'rgba(245,158,11,0.08)' },
          { label: 'Off Target', key: 'bad', color: 'var(--danger)', bg: 'rgba(239,68,68,0.08)' },
        ] as const).map(({ label, key, color, bg }) => (
          <div key={key} className="rounded-xl px-4 py-3 border" style={{ borderColor: 'var(--border)', backgroundColor: bg }}>
            <p className="text-2xl font-bold" style={{ color }}>{counts[key]}</p>
            <p className="text-xs font-medium mt-0.5" style={{ color }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Benchmark cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {BENCHMARKS.map((def, i) => (
          <BenchmarkCard
            key={def.key}
            def={def}
            value={values[i]}
            propertyClass={propertyClass}
          />
        ))}
      </div>

      {/* Source footnote */}
      <p className="text-xs pb-2" style={{ color: 'var(--muted)', opacity: 0.6 }}>
        Benchmark ranges are derived from consensus figures across IREM Income/Expense Analysis,
        NMHC Research, and ULI Emerging Trends reports (2023–2024). Ranges reflect national
        medians — local markets, property age, and unit mix may shift thresholds materially.
        Use as directional guidance, not absolute targets.
      </p>

    </div>
  );
}
