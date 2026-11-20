import { Fragment } from 'react';
import type { PerformanceHistogramBin } from '../../types';

const numberFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 2,
});

function formatSignedNumber(value: number | null): string {
  if (value === null) return '—';
  return `${value > 0 ? '+' : ''}${numberFormatter.format(value)}`;
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
  const chartHeight = 170;
  const left = 28;
  const bottom = 24;
  const plotWidth = chartWidth - left - 12;
  const plotHeight = chartHeight - bottom - 12;
  const slot = plotWidth / bins.length;
  const barWidth = Math.max(1, (slot - (comparing ? 4 : 2)) / (comparing ? 2 : 1));

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
        <line
          x1={left}
          y1={plotHeight + 1}
          x2={chartWidth - 8}
          y2={plotHeight + 1}
          stroke="currentColor"
          opacity="0.35"
        />
        {bins.map((bin, index) => {
          const previousBin = previousByStart.get(bin.start);
          const currentHeight = (bin.count / maxCount) * plotHeight;
          const previousHeight = ((previousBin?.count ?? 0) / maxCount) * plotHeight;
          const x = left + index * slot + 1;
          return (
            <Fragment key={bin.start}>
              <rect
                x={x}
                y={plotHeight - currentHeight + 1}
                width={barWidth}
                height={currentHeight}
                rx="1"
                fill="#38bdf8"
              >
                <title>{`${currentPeriod ?? 'Periode terpilih'} · ${bin.label}: ${bin.count} pegawai`}</title>
              </rect>
              {comparing && previousBin && (
                <rect
                  x={x + barWidth + 2}
                  y={plotHeight - previousHeight + 1}
                  width={barWidth}
                  height={previousHeight}
                  rx="1"
                  fill="#94a3b8"
                >
                  <title>{`${previousPeriod} · ${previousBin.label}: ${previousBin.count} pegawai`}</title>
                </rect>
              )}
            </Fragment>
          );
        })}
        <text x={left} y={chartHeight - 5} fill="currentColor" fontSize="10">80</text>
        <text x={left + plotWidth / 2} y={chartHeight - 5} fill="currentColor" fontSize="10" textAnchor="middle">100</text>
        <text x={chartWidth - 10} y={chartHeight - 5} fill="currentColor" fontSize="10" textAnchor="end">120</text>
        <text x="8" y="12" fill="currentColor" fontSize="10">{maxCount}</text>
      </svg>
      <p className="text-center text-xs text-slate-400">NPK 80–120 · interval 2 poin</p>
      {comparing && (
        <div className="mt-2 flex justify-center gap-4 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-sky-400" aria-hidden="true" />
            {currentPeriod}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-slate-400" aria-hidden="true" />
            {previousPeriod}
          </span>
        </div>
      )}
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
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-sky-400" aria-hidden="true" />
            {currentPeriod}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-slate-400" aria-hidden="true" />
            {previousPeriod}
          </span>
        </div>
        <ul className="space-y-3">
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
                className="grid grid-cols-[7rem_minmax(5rem,1fr)_minmax(9rem,auto)] items-center gap-3 text-xs sm:grid-cols-[7.5rem_1fr_auto] sm:text-sm"
              >
                <span className="text-slate-300">{status}</span>
                <span className="space-y-1">
                  <span className="block h-2 overflow-hidden rounded-full bg-slate-800">
                    <span
                      className="block h-full rounded-full bg-sky-400"
                      style={{ width: `${(currentPercentage / maximumPercentage) * 100}%` }}
                    />
                  </span>
                  <span className="block h-2 overflow-hidden rounded-full bg-slate-800">
                    <span
                      className="block h-full rounded-full bg-slate-400"
                      style={{ width: `${(previousPercentage / maximumPercentage) * 100}%` }}
                    />
                  </span>
                </span>
                <span className="text-right font-medium">
                  <span className="block">
                    {numberFormatter.format(count)}
                    <span className="ml-1 text-slate-400">
                      ({numberFormatter.format(currentPercentage)}%)
                    </span>
                  </span>
                  <span className="block text-slate-400">
                    {numberFormatter.format(previousCount)}
                    <span className="ml-1">
                      ({numberFormatter.format(previousPercentage)}%)
                    </span>
                  </span>
                  <span className={`block ${changeColor}`}>
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
    <ul className="space-y-3">
      {Object.entries(counts).map(([status, count]) => (
        <li key={status} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm">
          <span className="text-slate-300">{status}</span>
          <span className="h-2 overflow-hidden rounded-full bg-slate-800">
            <span
              className="block h-full rounded-full bg-sky-400"
              style={{ width: `${(count / maximum) * 100}%` }}
            />
          </span>
          <span className="min-w-20 text-right font-medium">
            {numberFormatter.format(count)}
            <span className="ml-1 text-slate-400">
              ({total ? numberFormatter.format((count / total) * 100) : '0'}%)
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
