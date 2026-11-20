import { Fragment, useId } from 'react';
import type { PerformanceHistogramBin } from '../../types';

const numberFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 2,
});

function formatSignedNumber(value: number | null): string {
  if (value === null) return '—';
  return `${value > 0 ? '+' : ''}${numberFormatter.format(value)}`;
}

function statusBarColor(status: string): string {
  const normalized = status.toLocaleLowerCase('id-ID');
  if (normalized.includes('sangat istimewa')) return 'bg-emerald-400';
  if (normalized.includes('istimewa')) return 'bg-sky-400';
  if (normalized.includes('baik')) return 'bg-cyan-400';
  if (normalized.includes('butuh perbaikan')) return 'bg-amber-400';
  if (normalized.includes('kurang')) return 'bg-rose-400';
  return 'bg-sky-400';
}

export function Histogram({
  bins,
  previousBins,
  currentPeriod,
  previousPeriod,
}: {
  bins: PerformanceHistogramBin[];
  previousBins?: PerformanceHistogramBin[];
  currentPeriod?: string;
  previousPeriod?: string | null;
}) {
  const gradientId = useId();
  const previousByStart = new Map(
    (previousBins ?? []).map((bin) => [bin.start, bin]),
  );
  const maxCount = Math.max(
    1,
    ...bins.map((bin) => bin.count),
    ...(previousBins ?? []).map((bin) => bin.count),
  );
  const comparing = Boolean(previousBins && previousPeriod);
  const chartWidth = 720;
  const chartHeight = 186;
  const left = 34;
  const top = 14;
  const bottom = 26;
  const plotWidth = chartWidth - left - 12;
  const plotHeight = chartHeight - top - bottom;
  const slot = plotWidth / Math.max(1, bins.length);
  const barWidth = Math.max(2, (slot - (comparing ? 5 : 3)) / (comparing ? 2 : 1));
  const midTick = Math.round(maxCount / 2);

  return (
    <div>
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full"
        role="img"
        aria-label={
          comparing
            ? `Perbandingan distribusi NPK ${currentPeriod} dan ${previousPeriod}`
            : 'Histogram NPK dari 80 sampai 120 dengan interval 2'
        }
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.65" />
          </linearGradient>
        </defs>

        {/* Horizontal Reference Gridlines */}
        <line
          x1={left}
          y1={top}
          x2={chartWidth - 10}
          y2={top}
          stroke="currentColor"
          strokeDasharray="3 3"
          opacity="0.14"
        />
        <line
          x1={left}
          y1={top + plotHeight / 2}
          x2={chartWidth - 10}
          y2={top + plotHeight / 2}
          stroke="currentColor"
          strokeDasharray="3 3"
          opacity="0.14"
        />
        <line
          x1={left}
          y1={top + plotHeight + 1}
          x2={chartWidth - 10}
          y2={top + plotHeight + 1}
          stroke="currentColor"
          opacity="0.3"
        />

        {bins.map((bin, index) => {
          const previousBin = previousByStart.get(bin.start);
          const currentHeight = (bin.count / maxCount) * plotHeight;
          const previousHeight = ((previousBin?.count ?? 0) / maxCount) * plotHeight;
          const x = left + index * slot + 1.5;
          return (
            <Fragment key={bin.start}>
              <rect
                x={x}
                y={top + plotHeight - currentHeight + 1}
                width={barWidth}
                height={currentHeight}
                rx="2"
                fill={`url(#${gradientId})`}
                className="transition-opacity hover:opacity-80"
              >
                <title>{`${currentPeriod ?? 'Periode terpilih'} · ${bin.label}: ${bin.count} pegawai`}</title>
              </rect>
              {comparing && previousBin && (
                <rect
                  x={x + barWidth + 2}
                  y={top + plotHeight - previousHeight + 1}
                  width={barWidth}
                  height={previousHeight}
                  rx="2"
                  fill="#94a3b8"
                  opacity="0.8"
                  className="transition-opacity hover:opacity-100"
                >
                  <title>{`${previousPeriod} · ${previousBin.label}: ${previousBin.count} pegawai`}</title>
                </rect>
              )}
            </Fragment>
          );
        })}

        {/* Axis Ticks */}
        <text x={left} y={chartHeight - 6} fill="currentColor" opacity="0.65" fontSize="10" fontFamily="monospace">
          80
        </text>
        <text x={left + plotWidth / 2} y={chartHeight - 6} fill="currentColor" opacity="0.65" fontSize="10" fontFamily="monospace" textAnchor="middle">
          100
        </text>
        <text x={chartWidth - 10} y={chartHeight - 6} fill="currentColor" opacity="0.65" fontSize="10" fontFamily="monospace" textAnchor="end">
          120
        </text>
        <text x={left - 6} y={top + 4} fill="currentColor" opacity="0.65" fontSize="10" fontFamily="monospace" textAnchor="end">
          {maxCount}
        </text>
        {midTick > 0 && midTick < maxCount && (
          <text x={left - 6} y={top + plotHeight / 2 + 3} fill="currentColor" opacity="0.5" fontSize="9" fontFamily="monospace" textAnchor="end">
            {midTick}
          </text>
        )}
      </svg>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>Rentang NPK 80–120 · interval 2 poin</span>
        {comparing && (
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 font-medium text-sky-300">
              <span className="size-2.5 rounded-xs bg-sky-400" aria-hidden="true" />
              {currentPeriod}
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              <span className="size-2.5 rounded-xs bg-slate-400" aria-hidden="true" />
              {previousPeriod}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function StatusDistribution({
  counts,
  total,
  previousCounts,
  previousTotal,
  currentPeriod,
  previousPeriod,
}: {
  counts: Record<string, number>;
  total: number;
  previousCounts?: Record<string, number>;
  previousTotal?: number;
  currentPeriod?: string;
  previousPeriod?: string;
}) {
  if (previousCounts && previousTotal !== undefined && previousPeriod) {
    const percentages = Object.entries(counts).flatMap(([status, count]) => [
      total ? (count / total) * 100 : 0,
      previousTotal ? ((previousCounts[status] ?? 0) / previousTotal) * 100 : 0,
    ]);
    const maximumPercentage = Math.max(1, ...percentages);
    return (
      <div>
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5 text-xs">
          <span className="text-slate-400">Perbandingan proporsi status</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-medium text-sky-300">
              <span className="size-2.5 rounded-xs bg-sky-400" aria-hidden="true" />
              {currentPeriod}
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              <span className="size-2.5 rounded-xs bg-slate-400" aria-hidden="true" />
              {previousPeriod}
            </span>
          </div>
        </div>
        <ul className="space-y-3.5">
          {Object.entries(counts).map(([status, count]) => {
            const previousCount = previousCounts[status] ?? 0;
            const currentPercentage = total ? (count / total) * 100 : 0;
            const previousPercentage = previousTotal
              ? (previousCount / previousTotal) * 100
              : 0;
            const percentagePointDelta = currentPercentage - previousPercentage;
            const changeColor = percentagePointDelta > 0
              ? 'text-emerald-400'
              : percentagePointDelta < 0
                ? 'text-rose-400'
                : 'text-slate-400';
            return (
              <li
                key={status}
                className="grid grid-cols-[7.2rem_minmax(5rem,1fr)_minmax(9rem,auto)] items-center gap-3 text-xs sm:grid-cols-[8rem_1fr_auto] sm:text-sm"
              >
                <span className="font-medium text-slate-200">{status}</span>
                <span className="space-y-1.5">
                  <span className="block h-2 overflow-hidden rounded-full bg-slate-800/90">
                    <span
                      className={`block h-full rounded-full transition-all duration-300 ${statusBarColor(status)}`}
                      style={{ width: `${(currentPercentage / maximumPercentage) * 100}%` }}
                    />
                  </span>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-slate-800/90">
                    <span
                      className="block h-full rounded-full bg-slate-400 transition-all duration-300"
                      style={{ width: `${(previousPercentage / maximumPercentage) * 100}%` }}
                    />
                  </span>
                </span>
                <span className="text-right font-mono text-xs tabular-nums">
                  <span className="block font-semibold text-slate-100">
                    {numberFormatter.format(count)}
                    <span className="ml-1 font-normal text-slate-400">
                      ({numberFormatter.format(currentPercentage)}%)
                    </span>
                  </span>
                  <span className="block text-slate-400">
                    {numberFormatter.format(previousCount)}
                    <span className="ml-1">
                      ({numberFormatter.format(previousPercentage)}%)
                    </span>
                  </span>
                  <span className={`block font-semibold ${changeColor}`}>
                    Δ {formatSignedNumber(percentagePointDelta)} pp
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const maximum = Math.max(1, ...Object.values(counts));
  return (
    <ul className="space-y-3.5">
      {Object.entries(counts).map(([status, count]) => {
        const pct = total ? (count / total) * 100 : 0;
        return (
          <li key={status} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm">
            <span className="font-medium text-slate-200">{status}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-slate-800/90">
              <span
                className={`block h-full rounded-full transition-all duration-300 ${statusBarColor(status)}`}
                style={{ width: `${(count / maximum) * 100}%` }}
              />
            </span>
            <span className="min-w-24 text-right font-mono text-xs font-semibold tabular-nums text-slate-100">
              {numberFormatter.format(count)}
              <span className="ml-1 font-normal text-slate-400">
                ({numberFormatter.format(pct)}%)
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}