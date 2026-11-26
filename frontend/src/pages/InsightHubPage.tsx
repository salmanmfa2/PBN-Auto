import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as apiClient from '../services/api';
import { useMenuAccess } from '../contexts/MenuAccessContext';
import type {
  PbnDashboardCount,
  PbnDashboardFilters,
  PbnDashboardPeopleResponse,
  PbnDashboardResponse,
} from '../types';

interface NumericRange {
  min: number;
  max: number;
}

const CHART_PALETTE = [
  '#0ea5e9', // sky-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#6366f1', // indigo-500
];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeDonutArc(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
): string {
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const p1 = polarToCartesian(cx, cy, outerR, startAngle);
  const p2 = polarToCartesian(cx, cy, outerR, endAngle);
  const p3 = polarToCartesian(cx, cy, innerR, endAngle);
  const p4 = polarToCartesian(cx, cy, innerR, startAngle);

  return [
    `M ${p1.x} ${p1.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ');
}

interface RangeFilterProps {
  title: string;
  unitLabel: string;
  value: NumericRange;
  bounds: NumericRange;
  onChange: (range: NumericRange) => void;
  disabled: boolean;
}

function RangeFilter({ title, unitLabel, value, bounds, onChange, disabled }: RangeFilterProps) {
  const isModified = value.min !== bounds.min || value.max !== bounds.max;
  const isLocked = disabled || bounds.min === bounds.max;

  const updateMin = (raw: number) => {
    if (!Number.isFinite(raw)) return;
    const clamped = Math.max(bounds.min, Math.min(raw, value.max));
    onChange({ min: clamped, max: value.max });
  };

  const updateMax = (raw: number) => {
    if (!Number.isFinite(raw)) return;
    const clamped = Math.min(bounds.max, Math.max(raw, value.min));
    onChange({ min: value.min, max: clamped });
  };

  return (
    <section className="ih-subpanel rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">{title}</h3>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-sky-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-sky-300">
            {value.min}–{value.max} {unitLabel}
          </span>
          {isModified && !disabled && (
            <button
              type="button"
              onClick={() => onChange({ min: bounds.min, max: bounds.max })}
              className="text-[11px] font-medium text-slate-400 hover:text-slate-200"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="mb-2.5 grid grid-cols-2 gap-2">
        <label className="block text-[11px] text-slate-400">
          Min
          <input
            type="number"
            min={bounds.min}
            max={value.max}
            value={value.min}
            disabled={isLocked}
            onChange={(event) => updateMin(Number(event.target.value))}
            className="input mt-1 py-1 font-mono text-xs tabular-nums"
            aria-label={`${title} minimum input`}
          />
        </label>
        <label className="block text-[11px] text-slate-400">
          Max
          <input
            type="number"
            min={value.min}
            max={bounds.max}
            value={value.max}
            disabled={isLocked}
            onChange={(event) => updateMax(Number(event.target.value))}
            className="input mt-1 py-1 font-mono text-xs tabular-nums"
            aria-label={`${title} maximum input`}
          />
        </label>
      </div>

      <div className="space-y-2">
        <label className="block text-[11px] text-slate-500">
          Batas bawah: {value.min}
          <input
            type="range"
            min={bounds.min}
            max={bounds.max}
            value={value.min}
            disabled={isLocked}
            onChange={(event) => updateMin(Number(event.target.value))}
            className="mt-1 block w-full accent-sky-400 disabled:opacity-40"
            aria-label={`${title} minimum`}
          />
        </label>
        <label className="block text-[11px] text-slate-500">
          Batas atas: {value.max}
          <input
            type="range"
            min={bounds.min}
            max={bounds.max}
            value={value.max}
            disabled={isLocked}
            onChange={(event) => updateMax(Number(event.target.value))}
            className="mt-1 block w-full accent-sky-400 disabled:opacity-40"
            aria-label={`${title} maximum`}
          />
        </label>
      </div>
    </section>
  );
}

interface CheckboxFilterProps {
  title: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled: boolean;
  defaultOpen?: boolean;
}

function CheckboxFilter({
  title,
  options,
  selected,
  onChange,
  disabled,
  defaultOpen = true,
}: CheckboxFilterProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.toLowerCase().includes(query));
  }, [options, searchQuery]);

  const toggle = (option: string, checked: boolean) => {
    const next = checked
      ? [...selected, option]
      : selected.filter((item) => item !== option);
    onChange(next.length === options.length ? [] : next);
  };

  return (
    <section className="ih-subpanel rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          className="flex flex-1 items-center justify-between text-left"
        >
          <span className="flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">{title}</h3>
            {selected.length > 0 && (
              <span className="rounded-full bg-sky-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-300">
                {selected.length}
              </span>
            )}
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`size-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="mt-2.5 space-y-2">
          {options.length > 6 && (
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={`Cari ${title.toLowerCase()}…`}
              className="input py-1 text-xs"
              aria-label={`Cari opsi ${title}`}
            />
          )}

          <div className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
            {!searchQuery.trim() && (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800/70">
                <input
                  disabled={disabled}
                  type="checkbox"
                  checked={selected.length === 0}
                  onChange={() => onChange([])}
                  className="accent-sky-400"
                />
                <span>Semua ({options.length})</span>
              </label>
            )}

            {filteredOptions.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-slate-800/70"
              >
                <input
                  disabled={disabled}
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={(event) => toggle(option, event.target.checked)}
                  className="mt-0.5 accent-sky-400"
                />
                <span className="break-words leading-4">{option}</span>
              </label>
            ))}

            {filteredOptions.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-slate-500">Tidak ada nilai yang cocok.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

interface VerticalColumnChartProps {
  title: string;
  subtitle?: string;
  items: PbnDashboardCount[];
}

function VerticalColumnChart({ title, subtitle, items }: VerticalColumnChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const hasData = items.length > 0 && items.some((item) => item.count > 0);
  const maxCount = Math.max(1, ...items.map((item) => item.count));

  const svgWidth = 560;
  const svgHeight = 230;
  const padLeft = 36;
  const padRight = 16;
  const padTop = 26;
  const padBottom = 42;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;
  const slotWidth = items.length > 0 ? plotWidth / items.length : plotWidth;
  const barWidth = Math.min(44, Math.max(16, slotWidth * 0.56));

  return (
    <section className="ih-panel flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/75 p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-100">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
        {hoveredIndex !== null && items[hoveredIndex] && (
          <span className="rounded-lg border border-sky-500/35 bg-sky-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-sky-200">
            {items[hoveredIndex].label}: {items[hoveredIndex].count.toLocaleString()} ({items[hoveredIndex].percentage}%)
          </span>
        )}
      </div>

      {!hasData ? (
        <p className="py-12 text-center text-sm text-slate-500">No data for the current filters.</p>
      ) : (
        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="h-60 w-full min-w-[380px] select-none"
            role="img"
            aria-label={title}
          >
            {/* Horizontal grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = padTop + plotHeight * (1 - ratio);
              const tickVal = Math.round(maxCount * ratio);
              return (
                <g key={ratio}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={svgWidth - padRight}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity={0.1}
                    strokeDasharray={ratio === 0 ? undefined : '3 3'}
                  />
                  <text
                    x={padLeft - 6}
                    y={y + 3.5}
                    textAnchor="end"
                    className="fill-slate-500 font-mono text-[10px]"
                  >
                    {tickVal}
                  </text>
                </g>
              );
            })}

            {/* Bars */}
            {items.map((item, idx) => {
              const barHeight = Math.max(2, (item.count / maxCount) * plotHeight);
              const x = padLeft + idx * slotWidth + (slotWidth - barWidth) / 2;
              const y = padTop + plotHeight - barHeight;
              const isHovered = hoveredIndex === idx;

              return (
                <g
                  key={item.label}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className="cursor-pointer"
                >
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx={6}
                    fill={isHovered ? '#38bdf8' : '#0ea5e9'}
                    fillOpacity={isHovered ? 1 : 0.85}
                  />
                  <text
                    x={x + barWidth / 2}
                    y={y - 6}
                    textAnchor="middle"
                    className="fill-slate-300 font-mono text-[10px] font-semibold"
                  >
                    {item.count.toLocaleString()}
                  </text>
                  <text
                    x={x + barWidth / 2}
                    y={padTop + plotHeight + 16}
                    textAnchor="middle"
                    className="fill-slate-400 text-[10px] font-medium"
                  >
                    {item.label}
                  </text>
                  <text
                    x={x + barWidth / 2}
                    y={padTop + plotHeight + 29}
                    textAnchor="middle"
                    className="fill-slate-500 font-mono text-[9px]"
                  >
                    {item.percentage}%
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </section>
  );
}

interface DonutDistributionChartProps {
  title: string;
  subtitle?: string;
  items: PbnDashboardCount[];
}

function DonutDistributionChart({ title, subtitle, items }: DonutDistributionChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const nonZeroItems = useMemo(() => items.filter((item) => item.count > 0), [items]);
  const totalCount = useMemo(
    () => nonZeroItems.reduce((sum, item) => sum + item.count, 0),
    [nonZeroItems],
  );

  const slices = useMemo(() => {
    let cursor = 0;
    return nonZeroItems.map((item, index) => {
      const sweep = totalCount > 0 ? (item.count / totalCount) * 360 : 0;
      const startAngle = cursor;
      const endAngle = cursor + sweep;
      cursor = endAngle;
      return {
        ...item,
        index,
        color: CHART_PALETTE[index % CHART_PALETTE.length],
        startAngle,
        endAngle,
      };
    });
  }, [nonZeroItems, totalCount]);

  const activeSlice = hoveredIndex !== null ? slices[hoveredIndex] ?? null : null;

  return (
    <section className="ih-panel flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/75 p-5">
      <div className="mb-3">
        <h2 className="text-sm font-bold text-slate-100">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      </div>

      {slices.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">No data for the current filters.</p>
      ) : (
        <div className="grid items-center gap-5 sm:grid-cols-[190px_minmax(0,1fr)]">
          <div className="relative mx-auto size-44">
            <svg viewBox="0 0 180 180" className="size-full overflow-visible" role="img" aria-label={title}>
              {slices.length === 1 ? (
                <circle
                  cx={90}
                  cy={90}
                  r={66}
                  fill="none"
                  stroke={slices[0].color}
                  strokeWidth={24}
                  onMouseEnter={() => setHoveredIndex(0)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className="cursor-pointer"
                />
              ) : (
                slices.map((slice) => {
                  const isHovered = hoveredIndex === slice.index;
                  const outerR = isHovered ? 81 : 78;
                  const innerR = 52;
                  return (
                    <path
                      key={slice.label}
                      d={describeDonutArc(90, 90, outerR, innerR, slice.startAngle, slice.endAngle)}
                      fill={slice.color}
                      stroke="rgba(15,23,42,0.75)"
                      strokeWidth={1.5}
                      onMouseEnter={() => setHoveredIndex(slice.index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      className="cursor-pointer transition-all duration-150"
                    />
                  );
                })
              )}
            </svg>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <span className="line-clamp-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {activeSlice ? activeSlice.label : 'Total'}
              </span>
              <span className="mt-0.5 font-mono text-lg font-bold tabular-nums text-slate-100">
                {(activeSlice ? activeSlice.count : totalCount).toLocaleString()}
              </span>
              {activeSlice && (
                <span className="font-mono text-[11px] font-semibold text-sky-300">
                  {activeSlice.percentage}%
                </span>
              )}
            </div>
          </div>

          <ul className="max-h-52 space-y-2 overflow-y-auto pr-1">
            {slices.map((slice) => {
              const isHovered = hoveredIndex === slice.index;
              return (
                <li
                  key={slice.label}
                  onMouseEnter={() => setHoveredIndex(slice.index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${
                    isHovered ? 'bg-slate-800/80' : 'hover:bg-slate-800/45'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="truncate font-medium text-slate-200">{slice.label}</span>
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-slate-400">
                    <strong className="text-slate-100">{slice.count.toLocaleString()}</strong>{' '}
                    ({slice.percentage}%)
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

interface InteractiveBarCardProps {
  title: string;
  subtitle?: string;
  items: PbnDashboardCount[];
  selectedValues?: string[];
  availableOptions?: string[];
  onToggleValue?: (value: string) => void;
  canCrossFilter?: boolean;
  accentClass?: string;
}

function InteractiveBarCard({
  title,
  subtitle,
  items,
  selectedValues = [],
  availableOptions,
  onToggleValue,
  canCrossFilter = false,
  accentClass = 'bg-sky-500',
}: InteractiveBarCardProps) {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [sortBy, setSortBy] = useState<'count' | 'label'>('count');

  const sortedItems = useMemo(() => {
    const copy = [...items];
    if (sortBy === 'label') {
      return copy.sort((a, b) => a.label.localeCompare(b.label, 'id'));
    }
    return copy.sort((a, b) => b.count - a.count);
  }, [items, sortBy]);

  const largestCount = Math.max(1, ...items.map((item) => item.count));
  const hasData = items.length > 0 && items.some((item) => item.count > 0);

  return (
    <section className="ih-panel flex min-h-80 flex-col rounded-2xl border border-slate-800 bg-slate-900/75 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-100">{title}</h2>
            {selectedValues.length > 0 && (
              <span className="rounded-full border border-sky-500/35 bg-sky-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-sky-300">
                {selectedValues.length} filter
              </span>
            )}
          </div>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSortBy((prev) => (prev === 'count' ? 'label' : 'count'))}
            title="Ubah urutan"
            className="rounded-lg border border-slate-700/80 bg-slate-950/60 px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-slate-800"
          >
            {sortBy === 'count' ? 'Urut: Terbanyak' : 'Urut: A–Z'}
          </button>
          <div className="inline-flex rounded-lg border border-slate-700/80 bg-slate-950/60 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setViewMode('chart')}
              className={`rounded-md px-2 py-0.5 font-semibold transition ${
                viewMode === 'chart' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Grafik
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`rounded-md px-2 py-0.5 font-semibold transition ${
                viewMode === 'table' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tabel
            </button>
          </div>
        </div>
      </div>

      {!hasData ? (
        <p className="my-auto py-8 text-center text-sm text-slate-500">No data for the current filters.</p>
      ) : viewMode === 'chart' ? (
        <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
          {sortedItems.map((item) => {
            const isFilterable = Boolean(
              canCrossFilter
              && onToggleValue
              && (!availableOptions || availableOptions.includes(item.label)),
            );
            const isSelected = selectedValues.includes(item.label);
            const isDimmed = selectedValues.length > 0 && !isSelected;

            return (
              <div
                key={item.label}
                role={isFilterable ? 'button' : undefined}
                tabIndex={isFilterable ? 0 : undefined}
                onClick={isFilterable ? () => onToggleValue?.(item.label) : undefined}
                onKeyDown={isFilterable ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onToggleValue?.(item.label);
                  }
                } : undefined}
                title={isFilterable ? `Klik untuk filter: ${item.label}` : undefined}
                className={`rounded-xl px-2.5 py-1.5 transition ${
                  isFilterable ? 'cursor-pointer hover:bg-slate-800/60' : ''
                } ${isSelected ? 'bg-sky-500/10 ring-1 ring-sky-500/40' : ''} ${
                  isDimmed ? 'opacity-50' : ''
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 break-words font-medium text-slate-200">
                    {item.label}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-slate-400">
                    <strong className="text-slate-100">{item.count.toLocaleString()}</strong>{' '}
                    <span className="text-slate-500">({item.percentage}%)</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-950/90">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isSelected ? 'bg-sky-400' : accentClass
                    }`}
                    style={{ width: `${(item.count / largestCount) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="max-h-72 overflow-auto rounded-xl border border-slate-800">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="ih-table-head sticky top-0 bg-slate-950 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2">Kategori</th>
                <th className="px-3 py-2 text-right">Jumlah</th>
                <th className="px-3 py-2 text-right">Proporsi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {sortedItems.map((item) => (
                <tr key={item.label} className="hover:bg-slate-800/40">
                  <td className="px-3 py-2 font-medium text-slate-200">{item.label}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-100">
                    {item.count.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-400">
                    {item.percentage}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface InsightHubPageProps {
  source?: 'dataset' | 'database';
}

export default function InsightHubPage({ source = 'dataset' }: InsightHubPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDatabaseSource = source === 'database';
  const { canEdit } = useMenuAccess();
  const canEditParameters = canEdit('insights-beta');
  const datasetId = isDatabaseSource ? 'pbncleaner.fetch_pbnopen' : searchParams.get('dataset_id');
  const sheetName = isDatabaseSource ? 'fetch_pbnopen' : searchParams.get('sheet_name') ?? 'Sheet1';
  const [dashboard, setDashboard] = useState<PbnDashboardResponse | null>(null);
  const [ageRange, setAgeRange] = useState<NumericRange | null>(null);
  const [tenureRange, setTenureRange] = useState<NumericRange | null>(null);
  const [selectedEselon, setSelectedEselon] = useState<string[]>([]);
  const [selectedEducation, setSelectedEducation] = useState<string[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string[]>([]);
  const [selectedRumpun, setSelectedRumpun] = useState<string[]>([]);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPeople, setShowPeople] = useState(false);
  const [peopleSearch, setPeopleSearch] = useState('');
  const [employeeNameSearch, setEmployeeNameSearch] = useState('');
  const [visiblePeopleColumns, setVisiblePeopleColumns] = useState<string[]>([
    'No',
    'Nama',
    'Eselon',
    'Jabatan',
    'Pendidikan Terakhir (Th.)',
    'Jurusan',
    'Universitas/Sekolah Tinggi',
  ]);
  const [showPeopleColumnChooser, setShowPeopleColumnChooser] = useState(false);
  const [people, setPeople] = useState<PbnDashboardPeopleResponse['people']>([]);
  const [isPeopleLoading, setIsPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);

  useEffect(() => {
    setDashboard(null);
    setAgeRange(null);
    setTenureRange(null);
    setSelectedEselon([]);
    setSelectedEducation([]);
    setSelectedRegion([]);
    setSelectedUnit([]);
    setSelectedRumpun([]);
    setError(null);
    setShowPeople(false);
    setPeopleSearch('');
    setEmployeeNameSearch('');
    setVisiblePeopleColumns([
      'No',
      'Nama',
      'Eselon',
      'Jabatan',
      'Pendidikan Terakhir (Th.)',
      'Jurusan',
      'Universitas/Sekolah Tinggi',
    ]);
    setShowPeopleColumnChooser(false);
    setPeople([]);
  }, [datasetId, sheetName]);

  useEffect(() => {
    if (!showPeople) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowPeople(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPeople]);

  useEffect(() => {
    if (!datasetId) {
      setDashboard(null);
      setIsLoading(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      const filters: PbnDashboardFilters = {
        name: employeeNameSearch,
        eselon: selectedEselon,
        education: selectedEducation,
        region: selectedRegion,
        unit: selectedUnit,
        rumpun: selectedRumpun,
      };
      if (ageRange) {
        filters.age_min = ageRange.min;
        filters.age_max = ageRange.max;
      }
      if (tenureRange) {
        filters.tenure_min = tenureRange.min;
        filters.tenure_max = tenureRange.max;
      }

      setIsLoading(true);
      setError(null);
      const request = isDatabaseSource
        ? apiClient.getPbnOpenDatabaseDashboard(filters)
        : apiClient.getPbnDashboard(datasetId, sheetName, filters);
      void request
        .then((result) => {
          if (active) setDashboard(result);
        })
        .catch((requestError: Error) => {
          if (active) setError(requestError.message);
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    datasetId,
    sheetName,
    isDatabaseSource,
    ageRange,
    tenureRange,
    selectedEselon,
    selectedEducation,
    selectedRegion,
    selectedUnit,
    selectedRumpun,
    employeeNameSearch,
  ]);

  useEffect(() => {
    if (!datasetId || !showPeople) return;

    let active = true;
    const filters: PbnDashboardFilters = {
      name: employeeNameSearch,
      eselon: selectedEselon,
      education: selectedEducation,
      region: selectedRegion,
      unit: selectedUnit,
      rumpun: selectedRumpun,
    };
    if (ageRange) {
      filters.age_min = ageRange.min;
      filters.age_max = ageRange.max;
    }
    if (tenureRange) {
      filters.tenure_min = tenureRange.min;
      filters.tenure_max = tenureRange.max;
    }

    setIsPeopleLoading(true);
    setPeopleError(null);
    const request = isDatabaseSource
      ? apiClient.getPbnOpenDatabaseDashboardPeople(filters)
      : apiClient.getPbnDashboardPeople(datasetId, sheetName, filters);
    void request
      .then((result) => {
        if (active) setPeople(result.people);
      })
      .catch((requestError: Error) => {
        if (active) setPeopleError(requestError.message);
      })
      .finally(() => {
        if (active) setIsPeopleLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    datasetId,
    sheetName,
    isDatabaseSource,
    showPeople,
    ageRange,
    tenureRange,
    selectedEselon,
    selectedEducation,
    selectedRegion,
    selectedUnit,
    selectedRumpun,
    employeeNameSearch,
  ]);

  const ageBounds = dashboard?.available_filters.age;
  const tenureBounds = dashboard?.available_filters.tenure;
  const effectiveAgeRange = ageRange ?? ageBounds;
  const effectiveTenureRange = tenureRange ?? tenureBounds;

  const hasAgeFilter = Boolean(
    ageBounds && ageRange && (ageRange.min !== ageBounds.min || ageRange.max !== ageBounds.max),
  );
  const hasTenureFilter = Boolean(
    tenureBounds
    && tenureRange
    && (tenureRange.min !== tenureBounds.min || tenureRange.max !== tenureBounds.max),
  );

  const activeFilterCount =
    (hasAgeFilter ? 1 : 0)
    + (hasTenureFilter ? 1 : 0)
    + (employeeNameSearch.trim() ? 1 : 0)
    + selectedEselon.length
    + selectedEducation.length
    + selectedRegion.length
    + selectedUnit.length
    + selectedRumpun.length;

  const resetAllFilters = () => {
    setAgeRange(null);
    setTenureRange(null);
    setEmployeeNameSearch('');
    setSelectedEselon([]);
    setSelectedEducation([]);
    setSelectedRegion([]);
    setSelectedUnit([]);
    setSelectedRumpun([]);
  };

  const toggleCategoryFilter = (
    value: string,
    current: string[],
    options: string[],
    setter: (next: string[]) => void,
  ) => {
    if (!canEditParameters) return;
    const exists = current.includes(value);
    const next = exists ? current.filter((item) => item !== value) : [...current, value];
    setter(next.length === options.length ? [] : next);
  };

  const topUnit = useMemo(() => {
    if (!dashboard?.unit_distribution.length) return null;
    return [...dashboard.unit_distribution].sort((a, b) => b.count - a.count)[0];
  }, [dashboard?.unit_distribution]);

  const filteredPeople = useMemo(() => {
    const query = peopleSearch.trim().toLowerCase();
    if (!query) return people;
    return people.filter((person) => (
      [
        person.Nama,
        person.Eselon,
        person.Jabatan,
        person.Jurusan,
        person['Universitas/Sekolah Tinggi'],
      ].some((field) => field?.toLowerCase().includes(query))
    ));
  }, [people, peopleSearch]);

  const exportPeopleCsv = () => {
    if (filteredPeople.length === 0) return;
    const availableColumns = visiblePeopleColumns.filter((column) => (
      column === 'No'
      || (filteredPeople[0] as unknown as Record<string, unknown>).hasOwnProperty(column)
    ));
    const headers = availableColumns;
    const escapeCell = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = filteredPeople.map((person) => availableColumns.map((column) => {
      if (column === 'No') return escapeCell(person.index);
      return escapeCell((person as unknown as Record<string, unknown>)[column]);
    }).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `insight-hub-pegawai-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="insight-hub-page relative isolate min-h-screen bg-surface-950 text-slate-100">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_40%_at_50%_-5%,rgba(14,165,233,0.10),transparent)]"
      />

      {/* Header */}
      <header className="ih-header border-b border-slate-800 bg-slate-900/95 px-4 pb-4 pt-[4.5rem] backdrop-blur-xs sm:px-6 xl:pr-[360px] xl:pt-4">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(isDatabaseSource ? '/' : '/pbn-analytics')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2 text-xs font-medium text-brand-300 transition hover:bg-slate-800 hover:text-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                <path d="M19 12H5m0 0 6 6m-6-6 6-6" />
              </svg>
              <span>{isDatabaseSource ? 'Menu utama' : 'PBN Analytics'}</span>
            </button>

            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/15 text-brand-300">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5">
                <path d="M3 3v18h18" />
                <path d="m7 15 4-4 3 3 5-6" />
              </svg>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight sm:text-xl">
                  {isDatabaseSource ? 'Insight Hub Beta' : 'PBN Open + Edu + HB Dashboard'}
                </h1>
                <span className="rounded-full border border-sky-500/35 bg-sky-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-300">
                  {isDatabaseSource ? 'Live Database' : 'Cleaned Dataset'}
                </span>
              </div>
              {dashboard && (
                <p className="mt-0.5 text-xs text-slate-400">
                  Sumber: <span className="font-mono text-slate-300">{dashboard.sheet_name}</span>
                  {canEditParameters && ' · Klik batang grafik untuk cross-filter'}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {dashboard && (
              <button
                type="button"
                onClick={() => setIsMobileFiltersOpen((open) => !open)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 xl:hidden"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-3.5">
                  <path d="M4 6h16M7 12h10M10 18h4" />
                </svg>
                <span>Filter {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}</span>
              </button>
            )}

            {isLoading && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/35 bg-sky-500/15 px-3 py-1 text-xs font-medium text-sky-300">
                <span className="size-1.5 animate-pulse rounded-full bg-sky-400" />
                <span>Memperbarui…</span>
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-[1800px] space-y-5 p-4 sm:p-6">
        {!isDatabaseSource && !datasetId && (
          <section className="ih-panel mx-auto max-w-xl rounded-2xl border border-slate-800 bg-slate-900/75 p-8 text-center">
            <h2 className="text-lg font-bold">No cleaned dataset selected</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Open PBN Analytics, upload a file, and apply the PBN Open + Edu + HB cleaning method to view its dashboard.
            </p>
            <button
              type="button"
              onClick={() => navigate('/pbn-analytics')}
              className="btn-primary mt-5 justify-center"
            >
              Go to PBN Analytics
            </button>
          </section>
        )}

        {error && (
          <div role="alert" className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            Could not update the dashboard: {error}
          </div>
        )}

        {datasetId && !dashboard && isLoading && (
          <div className="ih-panel rounded-2xl border border-slate-800 bg-slate-900/75 p-10 text-center text-sm text-slate-400">
            Memuat data demografi…
          </div>
        )}

        {dashboard && (
          <>
            {/* Active Filter Chips Strip */}
            {activeFilterCount > 0 && (
              <div className="ih-panel flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/75 px-4 py-3 text-xs">
                <span className="font-semibold text-slate-400">Filter aktif:</span>

                {hasAgeFilter && effectiveAgeRange && (
                  <button
                    type="button"
                    disabled={!canEditParameters}
                    onClick={() => setAgeRange(null)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/35 bg-sky-500/15 px-2.5 py-1 font-medium text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
                  >
                    <span>Usia: {effectiveAgeRange.min}–{effectiveAgeRange.max} th</span>
                    <span aria-hidden="true">×</span>
                  </button>
                )}

                {hasTenureFilter && effectiveTenureRange && (
                  <button
                    type="button"
                    disabled={!canEditParameters}
                    onClick={() => setTenureRange(null)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/35 bg-sky-500/15 px-2.5 py-1 font-medium text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
                  >
                    <span>Masa Jabatan: {effectiveTenureRange.min}–{effectiveTenureRange.max} th</span>
                    <span aria-hidden="true">×</span>
                  </button>
                )}

                {isDatabaseSource && employeeNameSearch.trim() && (
                  <button
                    type="button"
                    disabled={!canEditParameters}
                    onClick={() => setEmployeeNameSearch('')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/35 bg-sky-500/15 px-2.5 py-1 font-medium text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
                  >
                    <span>Nama: {employeeNameSearch.trim()}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                )}

                {selectedEselon.map((val) => (
                  <button
                    key={`es-${val}`}
                    type="button"
                    disabled={!canEditParameters}
                    onClick={() => setSelectedEselon((prev) => prev.filter((item) => item !== val))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                  >
                    <span>Eselon: {val}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}

                {selectedEducation.map((val) => (
                  <button
                    key={`edu-${val}`}
                    type="button"
                    disabled={!canEditParameters}
                    onClick={() => setSelectedEducation((prev) => prev.filter((item) => item !== val))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                  >
                    <span>Pendidikan: {val}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}

                {selectedRegion.map((val) => (
                  <button
                    key={`reg-${val}`}
                    type="button"
                    disabled={!canEditParameters}
                    onClick={() => setSelectedRegion((prev) => prev.filter((item) => item !== val))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                  >
                    <span>Region: {val}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}

                {selectedUnit.map((val) => (
                  <button
                    key={`unit-${val}`}
                    type="button"
                    disabled={!canEditParameters}
                    onClick={() => setSelectedUnit((prev) => prev.filter((item) => item !== val))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                  >
                    <span>Unit: {val}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}

                {selectedRumpun.map((val) => (
                  <button
                    key={`rumpun-${val}`}
                    type="button"
                    disabled={!canEditParameters}
                    onClick={() => setSelectedRumpun((prev) => prev.filter((item) => item !== val))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                  >
                    <span>Rumpun: {val}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}

                {canEditParameters && (
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="ml-auto font-semibold text-rose-300 hover:text-rose-200"
                  >
                    Reset semua filter
                  </button>
                )}
              </div>
            )}

            <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
              {/* Filter Sidebar */}
              <aside
                className={`ih-panel h-fit space-y-3 rounded-2xl border border-slate-800 bg-slate-900/75 p-4 ${
                  isMobileFiltersOpen ? 'block' : 'hidden xl:block'
                }`}
              >
                <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-100">Filter Parameter</h2>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {canEditParameters
                        ? 'Seluruh grafik diperbarui otomatis.'
                        : 'Mode baca saja (akses edit diperlukan).'}
                    </p>
                  </div>

                  {isDatabaseSource && (
                    <label className="block text-xs font-medium text-slate-300">
                      Cari Nama Pegawai
                      <input
                        type="search"
                        value={employeeNameSearch}
                        onChange={(event) => setEmployeeNameSearch(event.target.value)}
                        placeholder="Kata kunci Nama Gelar..."
                        disabled={!canEditParameters}
                        aria-label="Cari nama pegawai Nama Gelar"
                        className="input mt-1.5 w-full py-2 text-xs"
                      />
                    </label>
                  )}
                  {canEditParameters && activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/10"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {ageBounds && effectiveAgeRange && (
                  <RangeFilter
                    title="Usia"
                    unitLabel="th"
                    value={effectiveAgeRange}
                    bounds={ageBounds}
                    onChange={setAgeRange}
                    disabled={!canEditParameters}
                  />
                )}
                {tenureBounds && effectiveTenureRange && (
                  <RangeFilter
                    title="Lama Menjabat"
                    unitLabel="th"
                    value={effectiveTenureRange}
                    bounds={tenureBounds}
                    onChange={setTenureRange}
                    disabled={!canEditParameters}
                  />
                )}
                <CheckboxFilter
                  title="Eselon"
                  options={dashboard.available_filters.eselon}
                  selected={selectedEselon}
                  onChange={setSelectedEselon}
                  disabled={!canEditParameters}
                />
                <CheckboxFilter
                  title="Pendidikan"
                  options={dashboard.available_filters.education}
                  selected={selectedEducation}
                  onChange={setSelectedEducation}
                  disabled={!canEditParameters}
                />
                <CheckboxFilter
                  title="Region"
                  options={dashboard.available_filters.region}
                  selected={selectedRegion}
                  onChange={setSelectedRegion}
                  disabled={!canEditParameters}
                />
                <CheckboxFilter
                  title="Unit Eselon II"
                  options={dashboard.available_filters.unit}
                  selected={selectedUnit}
                  onChange={setSelectedUnit}
                  disabled={!canEditParameters}
                  defaultOpen={false}
                />
                <CheckboxFilter
                  title="Rumpun"
                  options={dashboard.available_filters.rumpun}
                  selected={selectedRumpun}
                  onChange={setSelectedRumpun}
                  disabled={!canEditParameters}
                  defaultOpen={false}
                />
              </aside>

              {/* Analytics Canvas */}
              <div className="space-y-5">
                {/* Executive KPI Strip */}
                <section className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Total Headcount Card */}
                  <div className="rounded-2xl border border-sky-500/35 bg-gradient-to-br from-sky-500/15 via-sky-500/10 to-slate-900/75 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
                      Jumlah Pegawai
                    </p>
                    <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-white">
                      {dashboard.total_employees.toLocaleString()}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-400">Sesuai filter aktif</span>
                      <button
                        type="button"
                        onClick={() => setShowPeople(true)}
                        disabled={dashboard.total_employees === 0}
                        className="rounded-lg border border-sky-400/40 bg-sky-500/15 px-2.5 py-1 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Lihat tabel
                      </button>
                    </div>
                  </div>

                  {/* Gender Ratio Card */}
                  <div className="ih-panel rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Komposisi Gender
                    </p>
                    {dashboard.sex_distribution.length === 0 ? (
                      <p className="mt-3 text-xs text-slate-500">Tidak ada data</p>
                    ) : (
                      <>
                        <div className="mt-2 flex items-baseline justify-between gap-2">
                          {dashboard.sex_distribution.map((item) => (
                            <div key={item.label}>
                              <span className="font-mono text-lg font-bold tabular-nums text-slate-100">
                                {item.count.toLocaleString()}
                              </span>
                              <span className="ml-1 text-[11px] text-slate-400">
                                {item.label} ({item.percentage}%)
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-800">
                          {dashboard.sex_distribution.map((item, idx) => (
                            <div
                              key={item.label}
                              style={{
                                width: `${item.percentage}%`,
                                backgroundColor: CHART_PALETTE[idx % CHART_PALETTE.length],
                              }}
                              title={`${item.label}: ${item.count.toLocaleString()} (${item.percentage}%)`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Dominant Unit Eselon II Card */}
                  <div className="ih-panel rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Unit Eselon II Terbesar
                    </p>
                    {topUnit ? (
                      <>
                        <p className="mt-2 line-clamp-1 text-sm font-bold text-slate-100" title={topUnit.label}>
                          {topUnit.label}
                        </p>
                        <p className="mt-1.5 font-mono text-xs text-emerald-300">
                          {topUnit.count.toLocaleString()} pegawai ({topUnit.percentage}%)
                        </p>
                      </>
                    ) : (
                      <p className="mt-3 text-xs text-slate-500">Tidak ada data</p>
                    )}
                  </div>

                  {/* Nearing Retirement Card */}
                  <div className="ih-panel rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Pegawai Mendekati Pensiun
                    </p>
                    {isDatabaseSource ? (
                      <>
                        <p className="mt-2 font-mono text-2xl font-bold text-amber-300">
                          {(dashboard?.retirement_count ?? 0).toLocaleString()}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Pensiun dalam 3 bulan
                        </p>
                      </>
                    ) : (
                      <p className="mt-3 text-xs text-slate-500">
                        Tersedia pada Insight Hub Beta
                      </p>
                    )}
                  </div>
                </section>

                {/* Primary Visual Row: Age Histogram + Religion Donut */}
                <section className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
                  <VerticalColumnChart
                    title="Distribusi Kelompok Usia"
                    subtitle="Sebaran demografi usia pegawai berdasarkan rentang tahun"
                    items={dashboard.age_group_distribution}
                  />
                  <DonutDistributionChart
                    title="Distribusi Agama"
                    subtitle="Proporsi pemeluk agama pada hasil filter"
                    items={dashboard.religion_distribution}
                  />
                </section>

                {/* Cross-Filterable Breakdown Row: Region & Education Level */}
                <section className="grid gap-4 lg:grid-cols-2">
                  <InteractiveBarCard
                    title="Distribusi per Region Homebase"
                    subtitle={canEditParameters ? 'Klik wilayah untuk menyaring data' : undefined}
                    items={dashboard.region_distribution}
                    selectedValues={selectedRegion}
                    availableOptions={dashboard.available_filters.region}
                    canCrossFilter={canEditParameters}
                    onToggleValue={(val) => toggleCategoryFilter(
                      val,
                      selectedRegion,
                      dashboard.available_filters.region,
                      setSelectedRegion,
                    )}
                    accentClass="bg-sky-500"
                  />
                  <InteractiveBarCard
                    title="Distribusi Tingkat Pendidikan"
                    subtitle={canEditParameters ? 'Klik jenjang pendidikan untuk menyaring data' : undefined}
                    items={dashboard.education_level_distribution}
                    selectedValues={selectedEducation}
                    availableOptions={dashboard.available_filters.education}
                    canCrossFilter={canEditParameters}
                    onToggleValue={(val) => toggleCategoryFilter(
                      val,
                      selectedEducation,
                      dashboard.available_filters.education,
                      setSelectedEducation,
                    )}
                    accentClass="bg-emerald-500"
                  />
                </section>

                {/* Cross-Filterable Breakdown Row: Unit Eselon II & Rumpun */}
                <section className="grid gap-4 lg:grid-cols-2">
                  <InteractiveBarCard
                    title="Distribusi per Unit Eselon II"
                    subtitle={canEditParameters ? 'Klik unit kerja untuk menyaring data' : undefined}
                    items={dashboard.unit_distribution}
                    selectedValues={selectedUnit}
                    availableOptions={dashboard.available_filters.unit}
                    canCrossFilter={canEditParameters}
                    onToggleValue={(val) => toggleCategoryFilter(
                      val,
                      selectedUnit,
                      dashboard.available_filters.unit,
                      setSelectedUnit,
                    )}
                    accentClass="bg-indigo-500"
                  />
                  <InteractiveBarCard
                    title="Distribusi Rumpun Pendidikan"
                    subtitle={canEditParameters ? 'Klik rumpun keilmuan untuk menyaring data' : undefined}
                    items={dashboard.education_group_distribution}
                    selectedValues={selectedRumpun}
                    availableOptions={dashboard.available_filters.rumpun}
                    canCrossFilter={canEditParameters}
                    onToggleValue={(val) => toggleCategoryFilter(
                      val,
                      selectedRumpun,
                      dashboard.available_filters.rumpun,
                      setSelectedRumpun,
                    )}
                    accentClass="bg-amber-500"
                  />
                </section>
              </div>
            </div>

            <p className="text-right font-mono text-[11px] text-slate-500">
              {isDatabaseSource
                ? `Dashboard source: ${dashboard.dataset_id}`
                : `Dashboard aggregates the full cleaned dataset · ID: ${dashboard.dataset_id.slice(0, 8)}…`}
            </p>
          </>
        )}
      </main>

      {/* Employee Table Modal */}
      {showPeople && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-xs sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowPeople(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-people-title"
            className="ih-modal flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
          >
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3.5 sm:px-6">
              <div>
                <h2 id="dashboard-people-title" className="text-base font-bold text-slate-100">
                  Daftar Pegawai Sesuai Filter
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {isPeopleLoading
                    ? 'Memperbarui daftar…'
                    : `Menampilkan ${filteredPeople.length.toLocaleString()} dari ${people.length.toLocaleString()} pegawai`}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={peopleSearch}
                  onChange={(event) => setPeopleSearch(event.target.value)}
                  placeholder="Cari nama, jabatan, jurusan…"
                  aria-label="Cari pegawai dalam tabel"
                  className="input w-56 py-1.5 text-xs"
                />
                <button
                  type="button"
                  disabled={filteredPeople.length === 0}
                  onClick={exportPeopleCsv}
                  className="btn-secondary !rounded-xl !px-3 !py-1.5 text-xs font-semibold disabled:opacity-40"
                >
                  Export CSV
                </button>
                {isDatabaseSource && (
                  <button
                    type="button"
                    onClick={() => setShowPeopleColumnChooser((current) => !current)}
                    className="btn-secondary !rounded-xl !px-3 !py-1.5 text-xs font-semibold"
                  >
                    Pilih Kolom
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPeople(false)}
                  aria-label="Close employee table"
                  className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                >
                  Tutup
                </button>
              </div>
            </header>

            {peopleError && (
              <p role="alert" className="px-4 py-3 text-sm text-rose-300 sm:px-6">
                Could not load employees: {peopleError}
              </p>
            )}

            {showPeopleColumnChooser && (
              <div className="border-b border-slate-800 px-4 py-3 sm:px-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Kolom tabel
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    'No',
                    'Nama',
                    'NIP',
                    'Eselon',
                    'Eselon ID',
                    'Jabatan',
                    'Gol',
                    'Pangkat',
                    'Pendidikan Terakhir (Th.)',
                    'Jurusan',
                    'Universitas/Sekolah Tinggi',
                    'Unit Eselon II',
                    'Unit Eselon III',
                    'Unit Eselon IV',
                    'Tanggal Lahir',
                    'Usia',
                    'Agama',
                    'Sex',
                    'Region Homebase',
                    'Homebase',
                    'Rumpun Pendidikan',
                  ].map((column) => {
                    const checked = visiblePeopleColumns.includes(column);
                    return (
                      <label
                        key={column}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                          checked
                            ? 'border-sky-500/50 bg-sky-500/10 text-sky-200'
                            : 'border-slate-800 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setVisiblePeopleColumns((current) => (
                              event.target.checked
                                ? [...current, column]
                                : current.filter((item) => item !== column)
                            ));
                          }}
                        />
                        {column}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead className="ih-table-head sticky top-0 z-10 bg-slate-950 text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    {visiblePeopleColumns.map((column) => (
                      <th key={column} className="border-b border-slate-800 px-3.5 py-3 font-semibold">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredPeople.map((person) => (
                    <tr
                      key={`${person.index}-${person.Nama ?? ''}`}
                      className="transition-colors hover:bg-slate-800/40"
                    >
                      {visiblePeopleColumns.map((column) => (
                        <td
                          key={column}
                          className={
                            column === 'No'
                              ? 'px-3.5 py-2.5 font-mono text-xs tabular-nums text-slate-400'
                              : column === 'Nama'
                                ? 'px-3.5 py-2.5 font-medium text-slate-100'
                                : 'px-3.5 py-2.5 text-slate-300'
                          }
                        >
                          {column === 'No'
                            ? person.index
                            : ((person as unknown as Record<string, unknown>)[column] as string | number | null)
                              ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}

                  {!isPeopleLoading && filteredPeople.length === 0 && !peopleError && (
                    <tr>
                      <td colSpan={visiblePeopleColumns.length} className="px-4 py-10 text-center text-sm text-slate-500">
                        Tidak ada pegawai yang sesuai dengan kriteria pencarian atau filter.
                      </td>
                    </tr>
                  )}

                  {isPeopleLoading && people.length === 0 && (
                    <tr>
                      <td colSpan={visiblePeopleColumns.length} className="px-4 py-10 text-center text-sm text-slate-500">
                        Memuat daftar pegawai…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}