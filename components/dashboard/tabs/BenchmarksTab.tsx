'use client';

import { useState } from 'react';
import type { RatioReport } from '@/lib/models/statement';
import {
  BENCHMARKS,
  BENCHMARK_META,
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

function formatRange(lo: number, hi: number, unit: '%' | 'x'): string {
  return `${formatValue(lo, unit)} – ${formatValue(hi, unit)}`;
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
      <div
        className="relative rounded-full"
        style={{ height: 6, backgroundColor: 'var(--border)' }}
      >
        <div
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            left: `${zoneLeft}%`,
            width: `${zoneWidth}%`,
            backgroundColor: 'rgba(120,130,160,0.3)',
          }}
        />
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
      <p className="text-2xl font-bold leading-none" style={{ color: STATUS_COLORS[status] }}>
        {formatValue(value, def.unit)}
      </p>
      <RangeBar value={value} bm={bm} def={def} status={status} />
    </div>
  );
}

function ReferenceTable() {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Benchmark Reference Table
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Full ranges used for scoring, by property class
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
            Last updated
          </p>
          <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
            {BENCHMARK_META.lastUpdated}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
              <th className="text-left pb-2 font-medium pr-4" style={{ color: 'var(--muted)', minWidth: 160 }}>
                Metric
              </th>
              {(['A', 'B', 'C'] as PropertyClass[]).map(cls => (
                <th key={cls} className="text-center pb-2 font-medium px-4" style={{ color: 'var(--muted)', minWidth: 130 }}>
                  Class {cls}
                </th>
              ))}
              <th className="text-left pb-2 font-medium pl-4" style={{ color: 'var(--muted)', minWidth: 100 }}>
                Direction
              </th>
            </tr>
          </thead>
          <tbody>
            {BENCHMARKS.map((def, i) => (
              <tr
                key={def.key}
                className="border-b"
                style={{ borderColor: 'var(--border)', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(120,130,160,0.03)' }}
              >
                <td className="py-2.5 pr-4 font-medium" style={{ color: 'var(--text)' }}>
                  {def.label}
                </td>
                {(['A', 'B', 'C'] as PropertyClass[]).map(cls => (
                  <td key={cls} className="py-2.5 text-center px-4 font-mono" style={{ color: 'var(--text)' }}>
                    {formatRange(def[cls].lo, def[cls].hi, def.unit)}
                  </td>
                ))}
                <td className="py-2.5 pl-4" style={{ color: 'var(--muted)' }}>
                  {def.lowerIsBetter ? '↓ lower' : '↑ higher'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sources */}
      <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Sources</p>
        <ul className="space-y-1">
          {BENCHMARK_META.sources.map(s => (
            <li key={s.name} className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ color: 'var(--muted)', flexShrink: 0 }}>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                {s.name}
              </a>
            </li>
          ))}
        </ul>
        <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--muted)', opacity: 0.7 }}>
          {BENCHMARK_META.note}
        </p>
      </div>
    </div>
  );
}

export default function BenchmarksTab({ ratios }: BenchmarksTabProps) {
  const [propertyClass, setPropertyClass] = useState<PropertyClass>('B');
  const [showReference, setShowReference] = useState(false);

  const getValue = (key: string): number | null => {
    const r = ratios[key as keyof RatioReport];
    return r?.value ?? null;
  };

  const values = BENCHMARKS.map(def => getValue(def.key));

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

      {/* Reference table toggle */}
      <div>
        <button
          onClick={() => setShowReference(v => !v)}
          className="flex items-center gap-2 text-xs font-semibold transition-opacity hover:opacity-70"
          style={{ color: 'var(--accent)' }}
        >
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            style={{ transform: showReference ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          {showReference ? 'Hide' : 'View'} benchmark reference table
        </button>

        {showReference && (
          <div className="mt-3">
            <ReferenceTable />
          </div>
        )}
      </div>

    </div>
  );
}
