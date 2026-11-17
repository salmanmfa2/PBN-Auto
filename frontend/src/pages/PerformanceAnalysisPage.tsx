import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import * as apiClient from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type {
  PerformanceDashboardResponse,
  PerformanceHistogramBin,
  PerformanceInsight,
  PerformanceMetricComparison,
  PerformanceRecord,
  PerformanceRecordsResponse,
  PerformanceEmployeeSource,
  PerformanceUnitMetrics,
  PerformanceCorrectionSyncPreview,
  PerformanceCorrectionSyncResult,
  PerformanceCorrectionSourceYear,
  PerformanceUploadValidation,
} from '../types';
import { Spinner } from '../components/Spinner';

const RECORD_PAGE_SIZE = 50;
const PERFORMANCE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'units', label: 'Unit Eselon II' },
  { id: 'employees', label: 'Daftar Pegawai' },
] as const;
const PERFORMANCE_EMPLOYEE_SOURCES: {
  value: PerformanceEmployeeSource;
  label: string;
}[] = [
  { value: 'fetch_pbnopen', label: 'Default (fetch_pbnopen)' },
  { value: 'dt_employee_q2_2026', label: 'Q2 2026 (dt_employee_q2_2026)' },
];

function getPerformanceEmployeeSourceLabel(source: PerformanceEmployeeSource): string {
  return source === 'dt_employee_q2_2026'
    ? 'Q2 2026 (dt_employee_q2_2026)'
    : 'Default (fetch_pbnopen)';
}

type UnitColumnKey =
  | 'unit'
  | 'employeeCount'
  | 'averageNpk'
  | 'averageNhk'
  | 'averageNkpAwal'
  | 'nkpAwalExceptional'
  | 'hukdis'
  | 'dampakPelanggaran'
  | 'dampakPerilaku'
  | 'correction'
  | 'correctionPercentage'
  | 'averageCorrection'
  | 'maximumCorrection'
  | 'minimumCorrection'
  | 'averageNkpAkhir'
  | 'nkpAkhirExceptional'
  | 'statusGap'
  | 'compare';
type UnitSortKey = Exclude<UnitColumnKey, 'unit' | 'compare'>;
type UnitSortState = {
  key: UnitSortKey;
  direction: 'asc' | 'desc';
} | null;
type ModuleLoadTaskId = 'dashboard' | 'records' | 'insight';
type ModuleLoadTask = {
  status: 'loading' | 'complete' | 'failed';
  durationMs: number | null;
  error: string | null;
};
type ModuleLoadTasks = Record<ModuleLoadTaskId, ModuleLoadTask>;
type UnitColumnDefinition = {
  key: UnitColumnKey;
  label: string;
  minWidth: number;
  lite: boolean;
  expansionWeight?: number;
  sortValue?: (metrics: PerformanceUnitMetrics) => number | null;
};
const UNIT_COLUMN_DEFINITIONS: UnitColumnDefinition[] = [
  { key: 'unit', label: 'Unit', minWidth: 180, lite: true, expansionWeight: 0.45 },
  { key: 'employeeCount', label: 'Pegawai', minWidth: 80, lite: true, expansionWeight: 0.05, sortValue: (metrics) => metrics.employee_count },
  { key: 'averageNpk', label: 'Rata-rata NPK', minWidth: 100, lite: true, expansionWeight: 0.05, sortValue: (metrics) => metrics.average_npk },
  { key: 'averageNhk', label: 'Rata-rata NHK', minWidth: 100, lite: false, expansionWeight: 0.05, sortValue: (metrics) => metrics.average_nhk },
  { key: 'averageNkpAwal', label: 'Rata-rata NKP Awal', minWidth: 120, lite: false, sortValue: (metrics) => metrics.average_nkp_awal },
  { key: 'nkpAwalExceptional', label: 'NKP Awal Sangat Istimewa', minWidth: 170, lite: false, sortValue: (metrics) => metrics.nkp_awal_sangat_istimewa_count },
  { key: 'hukdis', label: 'Hukdis', minWidth: 80, lite: false, sortValue: (metrics) => metrics.hukdis_count },
  { key: 'dampakPelanggaran', label: 'Dampak Pelanggaran', minWidth: 145, lite: false, sortValue: (metrics) => metrics.dampak_pelanggaran_count },
  { key: 'dampakPerilaku', label: 'Dampak Perilaku', minWidth: 135, lite: false, sortValue: (metrics) => metrics.dampak_perilaku_count },
  { key: 'correction', label: 'Koreksi (+/−)', minWidth: 160, lite: true, expansionWeight: 0.2, sortValue: (metrics) => metrics.correction.count },
  { key: 'correctionPercentage', label: 'Pemberian Koreksi (%)', minWidth: 155, lite: true, expansionWeight: 0.1, sortValue: (metrics) => unitCorrectionPercentage(metrics) },
  { key: 'averageCorrection', label: 'Rata-rata Koreksi', minWidth: 120, lite: false, sortValue: (metrics) => metrics.correction.average },
  { key: 'maximumCorrection', label: 'Maks. Koreksi', minWidth: 100, lite: false, sortValue: (metrics) => metrics.correction.maximum },
  { key: 'minimumCorrection', label: 'Min. Koreksi', minWidth: 100, lite: false, sortValue: (metrics) => metrics.correction.minimum },
  { key: 'averageNkpAkhir', label: 'Rata-rata NKP Akhir', minWidth: 140, lite: true, expansionWeight: 0.1, sortValue: (metrics) => metrics.average_nkp_akhir },
  { key: 'nkpAkhirExceptional', label: 'NKP Akhir Sangat Istimewa', minWidth: 180, lite: true, expansionWeight: 0.1, sortValue: (metrics) => metrics.nkp_akhir_sangat_istimewa_count },
  { key: 'statusGap', label: 'Gap Status', minWidth: 90, lite: false, sortValue: (metrics) => metrics.status_gap_count },
  { key: 'compare', label: 'Bandingkan', minWidth: 90, lite: true, expansionWeight: 0.05 },
];

function isSortableUnitColumn(
  column: UnitColumnDefinition,
): column is UnitColumnDefinition & {
  key: UnitSortKey;
  sortValue: (metrics: PerformanceUnitMetrics) => number | null;
} {
  return column.sortValue !== undefined;
}

function unitSortValue(metrics: PerformanceUnitMetrics, key: UnitSortKey): number | null {
  const column = UNIT_COLUMN_DEFINITIONS.find((item) => item.key === key);
  return column?.sortValue?.(metrics) ?? null;
}

function sortUnitMetrics<T extends PerformanceUnitMetrics>(
  metrics: T[],
  sort: UnitSortState,
): T[] {
  const direction = sort?.direction === 'desc' ? -1 : 1;
  return [...metrics].sort((left, right) => {
    const leftValue = sort
      ? unitSortValue(left, sort.key)
      : left.unit_kerja_id;
    const rightValue = sort
      ? unitSortValue(right, sort.key)
      : right.unit_kerja_id;
    if (leftValue === null && rightValue !== null) return 1;
    if (leftValue !== null && rightValue === null) return -1;
    if (leftValue !== null && rightValue !== null && leftValue !== rightValue) {
      return (leftValue - rightValue) * direction;
    }

    const leftId = left.unit_kerja_id;
    const rightId = right.unit_kerja_id;
    if (leftId === null && rightId !== null) return 1;
    if (leftId !== null && rightId === null) return -1;
    if (leftId !== null && rightId !== null && leftId !== rightId) {
      return leftId - rightId;
    }
    return left.label.localeCompare(right.label, 'id', { sensitivity: 'base' });
  });
}

function sortUnitHierarchy(
  units: PerformanceDashboardResponse['units'],
  sort: UnitSortState,
): PerformanceDashboardResponse['units'] {
  return sortUnitMetrics(units, sort).map((unit) => ({
    ...unit,
    children: sortUnitMetrics(unit.children, sort).map((child) => ({
      ...child,
      children: sortUnitMetrics(child.children, sort),
    })),
  }));
}

function filterUnitHierarchyBySearch(
  units: PerformanceDashboardResponse['units'],
  search: string,
): {
  units: PerformanceDashboardResponse['units'];
  expandedKeys: Set<string>;
} {
  const query = search.trim().toLocaleLowerCase('id');
  const expandedKeys = new Set<string>();
  if (!query) return { units, expandedKeys };

  const matches = (label: string) => label.toLocaleLowerCase('id').includes(query);
  const filteredUnits: PerformanceDashboardResponse['units'] = [];
  for (const unit of units) {
    const unitMatches = matches(unit.label);
    const filteredChildren: typeof unit.children = [];
    for (const child of unit.children) {
      const childMatches = matches(child.label);
      const matchingGrandchildren = child.children.filter((grandchild) => (
        matches(grandchild.label)
      ));
      if (matchingGrandchildren.length) {
        filteredChildren.push({ ...child, children: matchingGrandchildren });
        expandedKeys.add(JSON.stringify([unit.label, child.label]));
      } else if (childMatches) {
        filteredChildren.push(child);
      }
    }
    if (filteredChildren.length) {
      filteredUnits.push({ ...unit, children: filteredChildren });
      expandedKeys.add(JSON.stringify([unit.label]));
    } else if (unitMatches) {
      filteredUnits.push(unit);
    }
  }
  return { units: filteredUnits, expandedKeys };
}

type UnitColumnWidths = Record<UnitColumnKey, number>;
const UNIT_COLUMN_WIDTHS_STORAGE_KEY = 'pbn.performance.unit-column-widths';
const MAX_UNIT_COLUMN_WIDTH = 640;
const DEFAULT_UNIT_COLUMN_WIDTHS: UnitColumnWidths = {
  unit: 250,
  employeeCount: 80,
  averageNpk: 100,
  averageNhk: 100,
  averageNkpAwal: 130,
  nkpAwalExceptional: 190,
  hukdis: 80,
  dampakPelanggaran: 145,
  dampakPerilaku: 135,
  correction: 165,
  correctionPercentage: 160,
  averageCorrection: 120,
  maximumCorrection: 100,
  minimumCorrection: 100,
  averageNkpAkhir: 140,
  nkpAkhirExceptional: 180,
  statusGap: 100,
  compare: 90,
};
const RECORD_COLUMNS: Array<{ key: keyof PerformanceRecord; label: string }> = [
  { key: 'nama', label: 'Nama' },
  { key: 'nip', label: 'NIP' },
  { key: 'unit_eselon_ii', label: 'Unit Eselon II' },
  { key: 'unit_eselon_iii', label: 'Unit Eselon III' },
  { key: 'unit_eselon_iv', label: 'Unit Eselon IV' },
  { key: 'eselon', label: 'Eselon' },
  { key: 'nhk', label: 'NHK' },
  { key: 'npk', label: 'NPK' },
  { key: 'nhk_kalibrasi', label: 'NHK Kalibrasi' },
  { key: 'npk_kalibrasi', label: 'NPK Kalibrasi' },
  { key: 'nkp_awal', label: 'NKP Awal' },
  { key: 'rating_hasil_kerja_awal', label: 'Rating Hasil Kerja Awal' },
  { key: 'rating_perilaku_kerja_awal', label: 'Rating Perilaku Kerja Awal' },
  { key: 'predikat_kinerja_awal', label: 'Predikat Kinerja Awal' },
  { key: 'nilai_hukuman_disiplin', label: 'Nilai Hukuman Disiplin' },
  { key: 'nilai_dampak_pelanggaran_disiplin', label: 'Nilai Dampak Pelanggaran Disiplin' },
  { key: 'nilai_dampak_perilaku', label: 'Nilai Dampak Perilaku' },
  { key: 'nilai_koreksi', label: 'Nilai Koreksi' },
  { key: 'nko', label: 'NKO' },
  { key: 'nkp_akhir', label: 'NKP Akhir' },
  { key: 'rating_hasil_kerja', label: 'Rating Hasil Kerja' },
  { key: 'rating_perilaku_kerja', label: 'Rating Perilaku Kerja' },
  { key: 'predikat_kinerja', label: 'Predikat Kinerja' },
  { key: 'status', label: 'Status' },
];
const RECORD_LITE_HIDDEN_COLUMNS = new Set<keyof PerformanceRecord>([
  'rating_hasil_kerja_awal',
  'rating_perilaku_kerja_awal',
  'predikat_kinerja_awal',
  'rating_hasil_kerja',
  'rating_perilaku_kerja',
  'predikat_kinerja',
]);
const INITIAL_MODULE_LOAD_TASKS: ModuleLoadTasks = {
  dashboard: { status: 'loading', durationMs: null, error: null },
  records: { status: 'loading', durationMs: null, error: null },
  insight: { status: 'loading', durationMs: null, error: null },
};
const MODULE_LOAD_TASK_LABELS: Array<{ id: ModuleLoadTaskId; label: string }> = [
  { id: 'dashboard', label: 'Dashboard dan filter Overview' },
  { id: 'records', label: 'Daftar Pegawai dan filter' },
  { id: 'insight', label: 'Insight' },
];
const NUMERIC_RECORD_COLUMNS = new Set<keyof PerformanceRecord>([
  'nhk',
  'npk',
  'nhk_kalibrasi',
  'npk_kalibrasi',
  'nkp_awal',
  'nilai_hukuman_disiplin',
  'nilai_dampak_pelanggaran_disiplin',
  'nilai_dampak_perilaku',
  'nilai_koreksi',
  'nko',
  'nkp_akhir',
]);

const numberFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 2,
});

function formatLoadTime(milliseconds: number): string {
  return milliseconds < 1000
    ? `${Math.round(milliseconds)} ms`
    : `${(milliseconds / 1000).toFixed(1)} dtk`;
}

function currentPeriod(): string {
  const now = new Date();
  return `Q${Math.floor(now.getMonth() / 3) + 1}-${now.getFullYear()}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unitCorrectionPercentage(metrics: PerformanceUnitMetrics): number {
  if (metrics.employee_count === 0) return 0;
  return (metrics.correction.count / metrics.employee_count) * 100;
}

function isUnitColumnWidths(value: unknown): value is UnitColumnWidths {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const widths = value as Partial<Record<UnitColumnKey, unknown>>;
  return UNIT_COLUMN_DEFINITIONS.every(({ key, minWidth }) => {
    const width = widths[key];
    return width === undefined || (typeof width === 'number'
      && Number.isFinite(width)
      && width >= minWidth
      && width <= MAX_UNIT_COLUMN_WIDTH);
  });
}

function getUnitColumnBaseWidth(
  column: UnitColumnKey,
  desiredDisplayWidth: number,
  widths: UnitColumnWidths,
  visibleColumns: UnitColumnDefinition[],
  containerWidth: number,
): number {
  const columnDefinition = visibleColumns.find((item) => item.key === column);
  if (!columnDefinition?.expansionWeight) return desiredDisplayWidth;
  const baseTableWidth = visibleColumns.reduce(
    (total, item) => total + widths[item.key],
    0,
  );
  const extraWidth = containerWidth - baseTableWidth;
  const totalExpansionWeight = visibleColumns.reduce(
    (total, item) => total + (item.expansionWeight ?? 0),
    0,
  );
  if (extraWidth <= 0 || totalExpansionWeight <= 0) return desiredDisplayWidth;
  const expansionShare = columnDefinition.expansionWeight / totalExpansionWeight;
  const widthAtFullTableBoundary = containerWidth - (baseTableWidth - widths[column]);
  if (desiredDisplayWidth >= widthAtFullTableBoundary) return desiredDisplayWidth;
  return (
    desiredDisplayWidth - expansionShare * widthAtFullTableBoundary
  ) / (1 - expansionShare);
}

function fitUnitColumnWidths(
  widths: UnitColumnWidths,
  visibleColumns: UnitColumnDefinition[],
  containerWidth: number,
): UnitColumnWidths {
  const fittedWidths = { ...widths };
  const baseTableWidth = visibleColumns.reduce(
    (total, column) => total + widths[column.key],
    0,
  );
  const extraWidth = Math.max(0, containerWidth - baseTableWidth);
  const totalExpansionWeight = visibleColumns.reduce(
    (total, column) => total + (column.expansionWeight ?? 0),
    0,
  );
  if (extraWidth === 0 || totalExpansionWeight === 0) return fittedWidths;
  for (const column of visibleColumns) {
    if (!column.expansionWeight) continue;
    fittedWidths[column.key] += extraWidth * column.expansionWeight / totalExpansionWeight;
  }
  return fittedWidths;
}

function saveExcelFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatNumber(value: number | null): string {
  return value === null ? '—' : numberFormatter.format(value);
}

function formatCount(value: number | null): string {
  return value === null ? '—' : numberFormatter.format(value);
}

function formatRecordValue(value: string | number | null): string {
  if (typeof value === 'number') return formatNumber(value);
  return value || '—';
}

function formatUploadDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}

function Histogram({
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
        <line x1={left} y1={plotHeight + 1} x2={chartWidth - 8} y2={plotHeight + 1} stroke="currentColor" opacity="0.35" />
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

function StatusDistribution({
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
    const percentages = Object.entries(counts).flatMap(([status, count]) => ([
      total ? (count / total) * 100 : 0,
      previousTotal ? ((previousCounts[status] ?? 0) / previousTotal) * 100 : 0,
    ]));
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

function UnitMetricCells({
  metrics,
  liteView,
}: {
  metrics: PerformanceUnitMetrics;
  liteView: boolean;
}) {
  if (liteView) {
    return (
      <>
        <td className="px-3 py-3">{numberFormatter.format(metrics.employee_count)}</td>
        <td className="px-3 py-3">{formatNumber(metrics.average_npk)}</td>
        <td className="px-3 py-3">
          {numberFormatter.format(metrics.correction.count)}
          <span className="ml-1 text-slate-400">
            (+{numberFormatter.format(metrics.correction.positive_count)} / −{numberFormatter.format(metrics.correction.negative_count)})
          </span>
        </td>
        <td className="px-3 py-3">{formatNumber(unitCorrectionPercentage(metrics))}%</td>
        <td className="px-3 py-3">{formatNumber(metrics.average_nkp_akhir)}</td>
        <td className="px-3 py-3">
          {numberFormatter.format(metrics.nkp_akhir_sangat_istimewa_count)}
          <span className="ml-1 text-slate-400">({formatNumber(metrics.nkp_akhir_sangat_istimewa_percentage)}%)</span>
        </td>
      </>
    );
  }

  return (
    <>
      <td className="px-3 py-3">{numberFormatter.format(metrics.employee_count)}</td>
      <td className="px-3 py-3">{formatNumber(metrics.average_npk)}</td>
      <td className="px-3 py-3">{formatNumber(metrics.average_nhk)}</td>
      <td className="px-3 py-3">{formatNumber(metrics.average_nkp_awal)}</td>
      <td className="px-3 py-3">
        {numberFormatter.format(metrics.nkp_awal_sangat_istimewa_count)}
        <span className="ml-1 text-slate-400">({formatNumber(metrics.nkp_awal_sangat_istimewa_percentage)}%)</span>
      </td>
      <td className="px-3 py-3">{numberFormatter.format(metrics.hukdis_count)}</td>
      <td className="px-3 py-3">{numberFormatter.format(metrics.dampak_pelanggaran_count)}</td>
      <td className="px-3 py-3">{numberFormatter.format(metrics.dampak_perilaku_count)}</td>
      <td className="px-3 py-3">
        {numberFormatter.format(metrics.correction.count)}
        <span className="ml-1 text-slate-400">
          (+{numberFormatter.format(metrics.correction.positive_count)} / −{numberFormatter.format(metrics.correction.negative_count)})
        </span>
      </td>
      <td className="px-3 py-3">{formatNumber(unitCorrectionPercentage(metrics))}%</td>
      <td className="px-3 py-3">{formatNumber(metrics.correction.average)}</td>
      <td className="px-3 py-3">{formatNumber(metrics.correction.maximum)}</td>
      <td className="px-3 py-3">{formatNumber(metrics.correction.minimum)}</td>
      <td className="px-3 py-3">{formatNumber(metrics.average_nkp_akhir)}</td>
      <td className="px-3 py-3">
        {numberFormatter.format(metrics.nkp_akhir_sangat_istimewa_count)}
        <span className="ml-1 text-slate-400">({formatNumber(metrics.nkp_akhir_sangat_istimewa_percentage)}%)</span>
      </td>
      <td
        className="px-3 py-3"
        title="Jumlah pegawai dengan status akhir yang berbeda dari status awal"
      >
        {numberFormatter.format(metrics.status_gap_count)}
      </td>
    </>
  );
}

const UNIT_COMPARISON_LABELS: Record<string, string> = {
  employee_count: 'Jumlah pegawai',
  average_npk: 'Rata-rata NPK',
  average_nhk: 'Rata-rata NHK',
  average_nkp_awal: 'Rata-rata NKP awal',
  nkp_awal_sangat_istimewa_count: 'NKP awal sangat istimewa · jumlah',
  nkp_awal_sangat_istimewa_percentage: 'NKP awal sangat istimewa · persentase',
  hukdis_count: 'Hukdis · jumlah pegawai',
  dampak_pelanggaran_count: 'Dampak pelanggaran · jumlah pegawai',
  dampak_perilaku_count: 'Dampak perilaku · jumlah pegawai',
  'correction.count': 'Koreksi · jumlah',
  'correction.positive_count': 'Koreksi · penambahan',
  'correction.negative_count': 'Koreksi · pengurangan',
  'correction.average': 'Koreksi · rata-rata',
  'correction.maximum': 'Koreksi · maksimum',
  'correction.minimum': 'Koreksi · minimum',
  average_nkp_akhir: 'Rata-rata NKP akhir',
  nkp_akhir_sangat_istimewa_count: 'NKP akhir sangat istimewa · jumlah',
  nkp_akhir_sangat_istimewa_percentage: 'NKP akhir sangat istimewa · persentase',
  status_gap_count: 'Perubahan status awal ke akhir · jumlah',
};

function comparisonLabel(key: string): string {
  const [field, status] = key.split('.', 2);
  if (field === 'nkp_awal_status_counts') return `Status NKP awal · ${status}`;
  if (field === 'nkp_akhir_status_counts') return `Status NKP akhir · ${status}`;
  return UNIT_COMPARISON_LABELS[key] ?? key;
}

function formatSignedNumber(value: number | null): string {
  if (value === null) return '—';
  return `${value > 0 ? '+' : ''}${numberFormatter.format(value)}`;
}

function OverviewComparisonDetail({
  comparison,
  previousPeriod,
  label,
  formatValue = formatNumber,
}: {
  comparison?: PerformanceMetricComparison;
  previousPeriod: string;
  label?: string;
  formatValue?: (value: number | null) => string;
}) {
  if (!comparison) return null;
  const changeColor = comparison.delta === null
    ? 'text-slate-400'
    : comparison.delta > 0
      ? 'text-emerald-400'
      : comparison.delta < 0
        ? 'text-rose-400'
        : 'text-slate-400';
  const percentage = comparison.percentage_change === null
    ? ' (—%)'
    : ` (${formatSignedNumber(comparison.percentage_change)}%)`;

  return (
    <p className="mt-1 text-xs text-slate-400">
      {label ? `${label} · ` : ''}
      Sebelumnya {previousPeriod}: {formatValue(comparison.previous)}
      {' · '}
      <span className={`font-semibold ${changeColor}`}>
        Δ {formatSignedNumber(comparison.delta)}{percentage}
      </span>
    </p>
  );
}

function UnitComparisonDialog({
  label,
  comparison,
  currentPeriod,
  previousPeriod,
  onClose,
}: {
  label: string;
  comparison: Record<string, PerformanceMetricComparison>;
  currentPeriod: string;
  previousPeriod: string;
  onClose: () => void;
}) {
  return createPortal(
    <div
      id="performance-comparison-print-root"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="performance-comparison-title"
        className="w-full max-w-5xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6"
      >
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="performance-comparison-title" className="text-lg font-semibold">
              Perbandingan kinerja · {label}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {currentPeriod} dibandingkan dengan {previousPeriod}. Persentase tidak tersedia jika nilai sebelumnya nol.
            </p>
          </div>
          <div className="performance-comparison-no-print flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              aria-label="Cetak atau simpan perbandingan sebagai PDF"
              title="Cetak atau simpan sebagai PDF"
              className="size-9 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-200 transition hover:bg-sky-500/20"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-5">
                <path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <path d="M7 14h10v7H7zM17 11h.01" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup perbandingan"
              className="size-9 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 transition hover:bg-slate-700"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="mx-auto size-5">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </header>
        <div className="performance-comparison-scroll max-h-[70vh] overflow-auto rounded-xl border border-slate-700">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-800 text-slate-300">
              <tr>
                <th className="px-3 py-2.5">Metrik</th>
                <th className="px-3 py-2.5">{currentPeriod}</th>
                <th className="px-3 py-2.5">{previousPeriod}</th>
                <th className="px-3 py-2.5">Perubahan</th>
                <th className="px-3 py-2.5">Perubahan %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {Object.entries(comparison).map(([key, values]) => (
                <tr key={key} className="text-slate-300">
                  <td className="px-3 py-2">{comparisonLabel(key)}</td>
                  <td className="px-3 py-2">{formatNumber(values.current)}</td>
                  <td className="px-3 py-2">{formatNumber(values.previous)}</td>
                  <td className="px-3 py-2">{formatSignedNumber(values.delta)}</td>
                  <td
                    className={`px-3 py-2 font-semibold ${
                      values.percentage_change === null
                        ? 'text-slate-400'
                        : values.percentage_change > 0
                          ? 'text-emerald-400'
                          : values.percentage_change < 0
                            ? 'text-rose-400'
                            : 'text-slate-300'
                    }`}
                  >
                    {values.percentage_change === null
                      ? '—'
                      : `${formatSignedNumber(values.percentage_change)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function UnitComparisonButton({
  unit,
  disabled,
  onClick,
}: {
  unit: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Bandingkan metrik ${unit} dengan periode sebelumnya`}
      title={disabled ? 'Periode sebelumnya tidak tersedia' : 'Bandingkan dengan periode sebelumnya'}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
        <path d="M4 19V5m0 14h16" />
        <path d="M8 15v-3m4 3V7m4 8v-5" />
      </svg>
    </button>
  );
}

export default function PerformanceAnalysisPage() {
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState<PerformanceDashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'units' | 'employees'>('overview');
  const [isOverviewCompareMode, setIsOverviewCompareMode] = useState(false);
  const [expandedUnits, setExpandedUnits] = useState<string[]>([]);
  const [collapsedSearchUnitKeys, setCollapsedSearchUnitKeys] = useState<string[]>([]);
  const [unitSort, setUnitSort] = useState<UnitSortState>(null);
  const [isUnitLiteView, setIsUnitLiteView] = useState(false);
  const [isRecordsLiteView, setIsRecordsLiteView] = useState(false);
  const [unitSearch, setUnitSearch] = useState('');
  const [moduleLoadTasks, setModuleLoadTasks] = useState<ModuleLoadTasks>(
    () => ({ ...INITIAL_MODULE_LOAD_TASKS }),
  );
  const [moduleLoadElapsedMs, setModuleLoadElapsedMs] = useState(0);
  const [moduleLoadDurationMs, setModuleLoadDurationMs] = useState<number | null>(null);
  const moduleLoadStartedAtRef = useRef(performance.now());
  const [unitColumnWidths, setUnitColumnWidths] = useState<UnitColumnWidths>(
    () => ({ ...DEFAULT_UNIT_COLUMN_WIDTHS }),
  );
  const [unitTableElement, setUnitTableElement] = useState<HTMLDivElement | null>(null);
  const [unitTableContainerWidth, setUnitTableContainerWidth] = useState(0);
  const [unitColumnWidthError, setUnitColumnWidthError] = useState<string | null>(null);
  const unitColumnWidthsRef = useRef<UnitColumnWidths>({ ...DEFAULT_UNIT_COLUMN_WIDTHS });
  const unitColumnResizeRef = useRef<{
    column: UnitColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);
  const visibleUnitColumns = UNIT_COLUMN_DEFINITIONS.filter(
    (column) => !isUnitLiteView || column.lite,
  );
  const visibleRecordColumns = RECORD_COLUMNS.filter(
    (column) => !isRecordsLiteView || !RECORD_LITE_HIDDEN_COLUMNS.has(column.key),
  );
  const visibleUnitColumnWidths = fitUnitColumnWidths(
    unitColumnWidths,
    visibleUnitColumns,
    unitTableContainerWidth,
  );
  const visibleUnitTableWidth = visibleUnitColumns.reduce(
    (total, column) => total + visibleUnitColumnWidths[column.key],
    0,
  );
  const [selectedUnit, setSelectedUnit] = useState('');
  const [selectedEselonIII, setSelectedEselonIII] = useState('');
  const [selectedEselonIV, setSelectedEselonIV] = useState('');
  const [selectedEselon, setSelectedEselon] = useState('');
  const [recordData, setRecordData] = useState<PerformanceRecordsResponse | null>(null);
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordPage, setRecordPage] = useState(1);
  const [recordSearch, setRecordSearch] = useState('');
  const [recordFilterDrafts, setRecordFilterDrafts] = useState<
    Record<string, string>
  >({});
  const [recordFilters, setRecordFilters] = useState<
    Record<string, string>
  >({});
  const [recordSort, setRecordSort] = useState<{
    key: keyof PerformanceRecord;
    direction: 'asc' | 'desc';
  }>({ key: 'nama', direction: 'asc' });
  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>();
  const [comparisonTarget, setComparisonTarget] = useState<{
    label: string;
    comparison: Record<string, PerformanceMetricComparison>;
  } | null>(null);
  const [unitExportBusy, setUnitExportBusy] = useState(false);
  const [unitExportError, setUnitExportError] = useState<string | null>(null);
  const [recordsExportBusy, setRecordsExportBusy] = useState(false);
  const [recordsExportError, setRecordsExportError] = useState<string | null>(null);
  const [insight, setInsight] = useState<PerformanceInsight | null>(null);
  const [insightDraft, setInsightDraft] = useState('');
  const [insightLoading, setInsightLoading] = useState(true);
  const [insightBusy, setInsightBusy] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [insightNotice, setInsightNotice] = useState<string | null>(null);
  const initialPeriod = currentPeriod();
  const [quarter, setQuarter] = useState(initialPeriod.slice(0, 2));
  const [year, setYear] = useState(initialPeriod.slice(3));
  const period = `${quarter}-${year}`;
  const analysisPeriod = selectedPeriod ?? analysis?.dataset?.period;
  const sortedUnits = useMemo(
    () => sortUnitHierarchy(analysis?.units ?? [], unitSort),
    [analysis?.units, unitSort],
  );
  const searchedUnitHierarchy = useMemo(
    () => filterUnitHierarchyBySearch(sortedUnits, unitSearch),
    [sortedUnits, unitSearch],
  );
  const completedModuleLoadTasks = Object.values(moduleLoadTasks)
    .filter((task) => task.status !== 'loading').length;
  const moduleLoadProgress = Math.round(
    (completedModuleLoadTasks / Object.keys(moduleLoadTasks).length) * 100,
  );
  const isUnitExpanded = (key: string) => (
    expandedUnits.includes(key)
    || (
      Boolean(unitSearch.trim())
      && searchedUnitHierarchy.expandedKeys.has(key)
      && !collapsedSearchUnitKeys.includes(key)
    )
  );
  const toggleUnitExpanded = (key: string) => {
    const expanded = isUnitExpanded(key);
    const autoExpanded = (
      Boolean(unitSearch.trim()) && searchedUnitHierarchy.expandedKeys.has(key)
    );
    setExpandedUnits((current) => expanded
      ? current.filter((value) => value !== key)
      : current.includes(key) ? current : [...current, key]);
    if (autoExpanded) {
      setCollapsedSearchUnitKeys((current) => expanded
        ? current.includes(key) ? current : [...current, key]
        : current.filter((value) => value !== key));
    }
  };

  useEffect(() => {
    if (!unitTableElement) return;
    const updateWidth = () => setUnitTableContainerWidth(unitTableElement.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(unitTableElement);
    return () => observer.disconnect();
  }, [unitTableElement]);

  useEffect(() => {
    try {
      const storedWidths = window.localStorage.getItem(UNIT_COLUMN_WIDTHS_STORAGE_KEY);
      if (!storedWidths) return;
      const parsed: unknown = JSON.parse(storedWidths);
      if (!isUnitColumnWidths(parsed)) {
        throw new Error('Format lebar kolom unit tidak valid.');
      }
      const mergedWidths = { ...DEFAULT_UNIT_COLUMN_WIDTHS, ...parsed };
      unitColumnWidthsRef.current = mergedWidths;
      setUnitColumnWidths(mergedWidths);
    } catch (storageError) {
      setUnitColumnWidthError(
        `Lebar kolom unit tersimpan tidak dapat dimuat: ${errorMessage(storageError)}`,
      );
    }
  }, []);

  const persistUnitColumnWidths = (widths: UnitColumnWidths) => {
    try {
      window.localStorage.setItem(UNIT_COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(widths));
      setUnitColumnWidthError(null);
    } catch (storageError) {
      setUnitColumnWidthError(
        `Lebar kolom unit tidak dapat disimpan: ${errorMessage(storageError)}`,
      );
    }
  };

  const startUnitColumnResize = (
    column: UnitColumnKey,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    unitColumnResizeRef.current = {
      column,
      startX: event.clientX,
      startWidth: visibleUnitColumnWidths[column],
    };
  };

  const moveUnitColumnResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = unitColumnResizeRef.current;
    if (!resize) return;
    const desiredDisplayWidth = resize.startWidth + event.clientX - resize.startX;
    const baseWidth = getUnitColumnBaseWidth(
      resize.column,
      desiredDisplayWidth,
      unitColumnWidthsRef.current,
      visibleUnitColumns,
      unitTableContainerWidth,
    );
    const columnDefinition = UNIT_COLUMN_DEFINITIONS.find(
      (column) => column.key === resize.column,
    );
    const width = Math.min(
      MAX_UNIT_COLUMN_WIDTH,
      Math.max(columnDefinition?.minWidth ?? 80, Math.round(baseWidth)),
    );
    const nextWidths = { ...unitColumnWidthsRef.current, [resize.column]: width };
    unitColumnWidthsRef.current = nextWidths;
    setUnitColumnWidths(nextWidths);
  };

  const finishUnitColumnResize = () => {
    if (!unitColumnResizeRef.current) return;
    unitColumnResizeRef.current = null;
    persistUnitColumnWidths(unitColumnWidthsRef.current);
  };

  const handleUnitColumnResizeKeyDown = (
    column: UnitColumnKey,
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 12 : -12;
    const baseWidth = getUnitColumnBaseWidth(
      column,
      visibleUnitColumnWidths[column] + delta,
      unitColumnWidthsRef.current,
      visibleUnitColumns,
      unitTableContainerWidth,
    );
    const columnDefinition = UNIT_COLUMN_DEFINITIONS.find(
      (item) => item.key === column,
    );
    const width = Math.min(
      MAX_UNIT_COLUMN_WIDTH,
      Math.max(columnDefinition?.minWidth ?? 80, Math.round(baseWidth)),
    );
    const nextWidths = { ...unitColumnWidthsRef.current, [column]: width };
    unitColumnWidthsRef.current = nextWidths;
    setUnitColumnWidths(nextWidths);
    persistUnitColumnWidths(nextWidths);
  };

  const unitColumnResizeHandle = (column: UnitColumnDefinition) => (
    <div
      role="separator"
      aria-label={`Ubah lebar kolom ${column.label}`}
      aria-orientation="vertical"
      aria-valuemin={column.minWidth}
      aria-valuemax={Math.max(
        MAX_UNIT_COLUMN_WIDTH,
        Math.round(visibleUnitColumnWidths[column.key]),
      )}
      aria-valuenow={Math.round(visibleUnitColumnWidths[column.key])}
      tabIndex={0}
      title={`Tarik untuk mengubah lebar kolom ${column.label}; gunakan tombol panah kiri/kanan.`}
      onPointerDown={(event) => startUnitColumnResize(column.key, event)}
      onPointerMove={moveUnitColumnResize}
      onPointerUp={finishUnitColumnResize}
      onPointerCancel={finishUnitColumnResize}
      onLostPointerCapture={finishUnitColumnResize}
      onKeyDown={(event) => handleUnitColumnResizeKeyDown(column.key, event)}
      className="absolute right-0 top-0 z-10 h-full w-2 touch-none cursor-col-resize border-r-2 border-transparent hover:border-sky-400 focus-visible:border-sky-400 focus-visible:outline-none"
    />
  );

  const [fullFile, setFullFile] = useState<File | null>(null);
  const [fullEmployeeSource, setFullEmployeeSource] =
    useState<PerformanceEmployeeSource>('fetch_pbnopen');
  const [fullValidation, setFullValidation] = useState<PerformanceUploadValidation | null>(null);
  const [fullBusy, setFullBusy] = useState(false);
  const [fullError, setFullError] = useState<string | null>(null);
  const [fullNotice, setFullNotice] = useState<string | null>(null);

  const [correctionSyncAction, setCorrectionSyncAction] =
    useState<'checking' | 'syncing' | null>(null);
  const [correctionSyncError, setCorrectionSyncError] = useState<string | null>(null);
  const [correctionSyncNotice, setCorrectionSyncNotice] = useState<string | null>(null);
  const [correctionSyncPreview, setCorrectionSyncPreview] =
    useState<PerformanceCorrectionSyncPreview | null>(null);
  const [correctionSourcePeriods, setCorrectionSourcePeriods] =
    useState<PerformanceCorrectionSourceYear[]>([]);
  const [correctionSourcePeriodsLoading, setCorrectionSourcePeriodsLoading] = useState(false);
  const [correctionSourcePeriodsError, setCorrectionSourcePeriodsError] =
    useState<string | null>(null);
  const [correctionSourceYear, setCorrectionSourceYear] = useState<number | null>(null);
  const [correctionSourceTw, setCorrectionSourceTw] = useState<number | null>(null);
  const [correctionConflictResolutions, setCorrectionConflictResolutions] =
    useState<Record<string, string>>({});
  const [isDataManagementOpen, setIsDataManagementOpen] = useState(false);
  const fullFileInput = useRef<HTMLInputElement>(null);
  const analysisRequestId = useRef(0);
  const recordFilterTimer = useRef<number | null>(null);
  const recordRequestId = useRef(0);

  useEffect(() => {
    if (!isDataManagementOpen || (user?.auth_level ?? 0) < 3) return undefined;
    let active = true;
    setCorrectionSourcePeriodsLoading(true);
    setCorrectionSourcePeriodsError(null);
    setCorrectionSourcePeriods([]);
    setCorrectionSourceYear(null);
    setCorrectionSourceTw(null);
    setCorrectionSyncPreview(null);
    setCorrectionConflictResolutions({});
    void apiClient.getPerformanceCorrectionSourcePeriods().then((periods) => {
      if (!active) return;
      setCorrectionSourcePeriods(periods);
      const latestPeriod = periods[0];
      setCorrectionSourceYear(latestPeriod?.year ?? null);
      setCorrectionSourceTw(
        latestPeriod?.available_tw[latestPeriod.available_tw.length - 1] ?? null,
      );
      setCorrectionSyncPreview(null);
      setCorrectionConflictResolutions({});
    }).catch((loadError: unknown) => {
      if (active) setCorrectionSourcePeriodsError(errorMessage(loadError));
    }).finally(() => {
      if (active) setCorrectionSourcePeriodsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [isDataManagementOpen, user?.auth_level]);

  const completeModuleLoadTask = useCallback((
    task: ModuleLoadTaskId,
    error: string | null = null,
  ) => {
    const durationMs = Math.round(performance.now() - moduleLoadStartedAtRef.current);
    setModuleLoadTasks((current) => {
      if (current[task].status !== 'loading') return current;
      return {
        ...current,
        [task]: {
          status: error ? 'failed' : 'complete',
          durationMs,
          error,
        },
      };
    });
  }, []);

  useEffect(() => {
    if (moduleLoadDurationMs !== null) return;
    const timer = window.setInterval(() => {
      setModuleLoadElapsedMs(
        Math.round(performance.now() - moduleLoadStartedAtRef.current),
      );
    }, 100);
    return () => window.clearInterval(timer);
  }, [moduleLoadDurationMs]);

  useEffect(() => {
    if (Object.values(moduleLoadTasks).some((task) => task.status === 'loading')) return;
    const durationMs = Math.round(performance.now() - moduleLoadStartedAtRef.current);
    setModuleLoadDurationMs(durationMs);
    setModuleLoadElapsedMs(durationMs);
  }, [moduleLoadTasks]);

  const refreshAnalysis = useCallback(async (requestedPeriod?: string) => {
    const requestId = ++analysisRequestId.current;
    setIsLoading(true);
    setError(null);
    let loadFailure: string | null = null;
    try {
      const result = await apiClient.getPerformanceDashboard(
        selectedUnit,
        selectedEselon ? [selectedEselon] : [],
        requestedPeriod ?? selectedPeriod,
        selectedEselonIII,
        selectedEselonIV,
      );
      if (requestId !== analysisRequestId.current) return;
      setAnalysis(result);
      if (result.dataset) {
        setQuarter(result.dataset.period.slice(0, 2));
        setYear(result.dataset.period.slice(3));
      }
    } catch (loadError) {
      if (requestId === analysisRequestId.current) {
        loadFailure = errorMessage(loadError);
        setError(loadFailure);
      }
    } finally {
      if (requestId === analysisRequestId.current) {
        setIsLoading(false);
        completeModuleLoadTask('dashboard', loadFailure);
      }
    }
  }, [
    completeModuleLoadTask,
    selectedEselon,
    selectedEselonIII,
    selectedEselonIV,
    selectedPeriod,
    selectedUnit,
  ]);

  useEffect(() => {
    void refreshAnalysis();
  }, [refreshAnalysis]);

  const refreshRecords = useCallback(async (requestedPeriod?: string) => {
    const requestId = ++recordRequestId.current;
    setIsLoadingRecords(true);
    setRecordError(null);
    let loadFailure: string | null = null;
    try {
      const result = await apiClient.getPerformanceRecords(
        recordPage,
        RECORD_PAGE_SIZE,
        recordSearch,
        recordFilters,
        recordSort.key,
        recordSort.direction,
        requestedPeriod ?? selectedPeriod,
      );
      if (requestId === recordRequestId.current) setRecordData(result);
    } catch (loadError) {
      if (requestId === recordRequestId.current) {
        loadFailure = errorMessage(loadError);
        setRecordError(loadFailure);
      }
    } finally {
      if (requestId === recordRequestId.current) {
        setIsLoadingRecords(false);
        completeModuleLoadTask('records', loadFailure);
      }
    }
  }, [completeModuleLoadTask, recordFilters, recordPage, recordSearch, recordSort, selectedPeriod]);

  useEffect(() => {
    void refreshRecords();
  }, [refreshRecords]);

  useEffect(() => () => {
    if (recordFilterTimer.current !== null) {
      window.clearTimeout(recordFilterTimer.current);
    }
    recordRequestId.current += 1;
  }, []);

  useEffect(() => {
    if (!isDataManagementOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsDataManagementOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDataManagementOpen]);

  useEffect(() => {
    if (!comparisonTarget) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setComparisonTarget(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [comparisonTarget]);

  useEffect(() => {
    let active = true;
    void apiClient.getPerformanceInsight()
      .then((result) => {
        if (active) {
          setInsight(result);
          setInsightDraft(result.content);
          completeModuleLoadTask('insight');
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          const message = errorMessage(loadError);
          setInsightError(message);
          completeModuleLoadTask('insight', message);
        }
      })
      .finally(() => {
        if (active) setInsightLoading(false);
      });
    return () => {
      active = false;
    };
  }, [completeModuleLoadTask]);

  const saveInsight = async () => {
    setInsightBusy(true);
    setInsightError(null);
    setInsightNotice(null);
    try {
      const updated = await apiClient.updatePerformanceInsight(insightDraft);
      setInsight(updated);
      setInsightDraft(updated.content);
      setInsightNotice('Insight berhasil disimpan.');
    } catch (saveError) {
      setInsightError(errorMessage(saveError));
    } finally {
      setInsightBusy(false);
    }
  };

  const validateFullData = async () => {
    if (!fullFile) return;
    setFullBusy(true);
    setFullError(null);
    setFullNotice(null);
    setFullValidation(null);
    try {
      setFullValidation(
        await apiClient.validatePerformanceFullData(fullFile, period, fullEmployeeSource),
      );
    } catch (validationError) {
      setFullError(errorMessage(validationError));
    } finally {
      setFullBusy(false);
    }
  };

  const replaceFullData = async () => {
    if (!fullFile || !fullValidation) return;
    if (!window.confirm(
      `Ganti dataset ${period} dengan ${fullValidation.row_count} baris menggunakan referensi ${getPerformanceEmployeeSourceLabel(fullEmployeeSource)}? Periode lain tidak akan berubah.`,
    )) {
      return;
    }
    setFullBusy(true);
    setFullError(null);
    setFullNotice(null);
    try {
      const result = await apiClient.replacePerformanceFullData(
        fullFile,
        period,
        fullEmployeeSource,
      );
      const uploadNotes = [
        result.unidentified_count > 0
          ? `${result.unidentified_count} NIP akan dikelompokkan sebagai Unidentified`
          : null,
        result.normalized_penalty_count > 0
          ? `${result.normalized_penalty_count} nilai Hukdis/Dampak disimpan sebagai potongan negatif`
          : null,
      ].filter((note): note is string => note !== null);
      setFullNotice(
        `${result.row_count} pegawai berhasil dimuat untuk ${result.period} menggunakan referensi ${getPerformanceEmployeeSourceLabel(fullEmployeeSource)}.`
        + (uploadNotes.length ? ` Catatan: ${uploadNotes.join('; ')}.` : ''),
      );
      setCorrectionSyncPreview(null);
      setCorrectionConflictResolutions({});
      setCorrectionSyncError(null);
      setCorrectionSyncNotice(null);
      setSelectedPeriod(result.period);
      if (selectedPeriod === result.period) {
        await Promise.all([
          refreshAnalysis(result.period),
          refreshRecords(result.period),
        ]);
      }
      setFullFile(null);
      if (fullFileInput.current) fullFileInput.current.value = '';
      setFullValidation(null);
    } catch (replaceError) {
      setFullError(errorMessage(replaceError));
    } finally {
      setFullBusy(false);
    }
  };

  const exportUnitAnalysis = async () => {
    setUnitExportBusy(true);
    setUnitExportError(null);
    try {
      const blob = await apiClient.downloadPerformanceUnitAnalysis(analysisPeriod);
      saveExcelFile(blob, `analisis-unit-eselon-ii-${analysis?.dataset?.period ?? 'data'}.xlsx`);
    } catch (exportError) {
      setUnitExportError(errorMessage(exportError));
    } finally {
      setUnitExportBusy(false);
    }
  };

  const exportRecords = async () => {
    setRecordsExportBusy(true);
    setRecordsExportError(null);
    try {
      const blob = await apiClient.downloadPerformanceRecordsExcel(
        recordSearch,
        recordFilterDrafts,
        recordSort.key,
        recordSort.direction,
        analysisPeriod,
      );
      saveExcelFile(blob, `daftar-pegawai-kinerja-${recordData?.period ?? 'data'}.xlsx`);
    } catch (exportError) {
      setRecordsExportError(errorMessage(exportError));
    } finally {
      setRecordsExportBusy(false);
    }
  };

  const updateRecordFilter = (key: string, value: string) => {
    const nextFilters = { ...recordFilterDrafts, [key]: value };
    setRecordFilterDrafts(nextFilters);
    if (recordFilterTimer.current !== null) {
      window.clearTimeout(recordFilterTimer.current);
    }
    recordFilterTimer.current = window.setTimeout(() => {
      setRecordFilters(nextFilters);
      setRecordPage(1);
      recordFilterTimer.current = null;
    }, 350);
  };

  const updateNumericRangeFilter = (
    key: keyof PerformanceRecord,
    bound: 'min' | 'max',
    value: string,
    range: [number | null, number | null],
  ) => {
    const [dataMinimum, dataMaximum] = range;
    const rangeMinimum = `${key}__min`;
    const rangeMaximum = `${key}__max`;
    const selectedMinimum = Number(recordFilterDrafts[rangeMinimum] ?? dataMinimum);
    const selectedMaximum = Number(recordFilterDrafts[rangeMaximum] ?? dataMaximum);
    const numericValue = Number(value);
    const nextFilters = { ...recordFilterDrafts, [`${key}__${bound}`]: value };

    if (bound === 'min' && numericValue > selectedMaximum) {
      nextFilters[rangeMaximum] = value;
    } else if (bound === 'max' && numericValue < selectedMinimum) {
      nextFilters[rangeMinimum] = value;
    }

    setRecordFilterDrafts(nextFilters);
    if (recordFilterTimer.current !== null) {
      window.clearTimeout(recordFilterTimer.current);
    }
    recordFilterTimer.current = window.setTimeout(() => {
      setRecordFilters(nextFilters);
      setRecordPage(1);
      recordFilterTimer.current = null;
    }, 350);
  };

  const clearRecordFilters = () => {
    if (recordFilterTimer.current !== null) {
      window.clearTimeout(recordFilterTimer.current);
      recordFilterTimer.current = null;
    }
    setRecordSearch('');
    setRecordFilterDrafts({});
    setRecordFilters({});
    setRecordPage(1);
  };

  const sortRecordsBy = (key: keyof PerformanceRecord) => {
    setRecordPage(1);
    setRecordSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const checkPerformanceCorrections = async () => {
    if (!analysisPeriod || correctionSourceYear === null || correctionSourceTw === null) return;
    setCorrectionSyncAction('checking');
    setCorrectionSyncError(null);
    setCorrectionSyncNotice(null);
    setCorrectionSyncPreview(null);
    setCorrectionConflictResolutions({});
    setCorrectionConflictResolutions({});
    try {
      setCorrectionSyncPreview(
        await apiClient.checkPerformanceCorrections(
          analysisPeriod,
          correctionSourceYear,
          correctionSourceTw,
        ),
      );
    } catch (checkError) {
      setCorrectionSyncError(errorMessage(checkError));
    } finally {
      setCorrectionSyncAction(null);
    }
  };

  const syncPerformanceCorrections = async () => {
    if (
      !analysisPeriod
      || correctionSourceYear === null
      || correctionSourceTw === null
      || correctionSyncPreview?.period !== analysisPeriod
      || correctionSyncPreview.source_year !== correctionSourceYear
      || correctionSyncPreview.source_tw !== correctionSourceTw
    ) return;
    const unresolvedConflicts = correctionSyncPreview.conflicts.filter(
      (conflict) => !correctionConflictResolutions[conflict.nip],
    );
    if (unresolvedConflicts.length > 0) return;
    if (!window.confirm(
      `Sinkronkan Nilai Koreksi untuk dataset ${analysisPeriod} memakai sumber EPRIDE ${correctionSourceYear} TW${correctionSourceTw}? NIP yang tidak ditemukan di EPRIDE akan diberi koreksi 0.`,
    )) {
      return;
    }
    setCorrectionSyncAction('syncing');
    setCorrectionSyncError(null);
    setCorrectionSyncNotice(null);
    try {
      const result: PerformanceCorrectionSyncResult =
        await apiClient.syncPerformanceCorrections(
          analysisPeriod,
          correctionSourceYear,
          correctionSourceTw,
          correctionConflictResolutions,
        );
      setCorrectionSyncNotice(
        `Sinkronisasi ${result.period} berhasil: ${result.matched_count} NIP cocok; `
        + `${result.unmatched_count} NIP tidak ditemukan dan koreksinya diatur ke 0.`
        + (result.resolved_conflict_count > 0
          ? ` ${result.resolved_conflict_count} konflik diselesaikan sesuai pilihan.`
          : '')
        + (result.duplicate_nip_group_count > 0
          ? ` ${result.duplicate_nip_group_count} kelompok NIP duplikat diproses sesuai aturan.`
          : '')
        + (result.ignored_unit_row_count > 0
          ? ` ${result.ignored_unit_row_count} baris diabaikan karena idUnit bukan 13 digit.`
          : '')
        + (result.source_only_nip_count > 0
          ? ` ${result.source_only_nip_count} NIP sumber tidak ada dalam dataset.`
          : ''),
      );
      setCorrectionSyncPreview(null);
      setCorrectionConflictResolutions({});
      await Promise.all([
        refreshAnalysis(result.period),
        refreshRecords(result.period),
      ]);
    } catch (applyError) {
      setCorrectionSyncError(errorMessage(applyError));
      setCorrectionSyncPreview(null);
    } finally {
      setCorrectionSyncAction(null);
    }
  };

  const selectedCorrectionSourcePeriod = correctionSourcePeriods.find(
    (sourcePeriod) => sourcePeriod.year === correctionSourceYear,
  );
  const availableCorrectionSourceTws = selectedCorrectionSourcePeriod?.available_tw ?? [];
  const correctionPreviewMatchesSelection = Boolean(
    correctionSyncPreview
    && correctionSyncPreview.period === analysisPeriod
    && correctionSyncPreview.source_year === correctionSourceYear
    && correctionSyncPreview.source_tw === correctionSourceTw,
  );
  const unresolvedCorrectionConflicts = correctionSyncPreview?.conflicts.filter(
    (conflict) => !correctionConflictResolutions[conflict.nip],
  ).length ?? 0;

  return (
    <main className="performance-analysis-page min-h-screen bg-surface-900 px-4 pb-14 pt-24 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-[105.8rem] space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link to="/" className="text-sm text-slate-400 hover:text-slate-200">← Menu utama</Link>
            <h1 className="mt-3 text-2xl font-semibold">Analisis Kinerja DJPb</h1>
            <p className="mt-1 text-sm text-slate-400">
              Analisis NPK dan penyesuaian kinerja berdasarkan data pegawai aktif.
            </p>
          </div>
          {analysis?.dataset && (
            <div className="card min-w-56 px-4 py-3 text-sm">
              <p className="text-slate-400">Periode terpilih</p>
              <p className="mt-1 font-semibold">{analysis.dataset.period} · {analysis.dataset.row_count} pegawai</p>
              <p className="mt-1 text-xs text-slate-400">
                Unggah oleh {analysis.dataset.uploaded_by_name} ({analysis.dataset.uploaded_by_user})
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {formatUploadDate(analysis.dataset.uploaded_at)}
              </p>
            </div>
          )}
        </header>

        <section
          className="card space-y-3 p-4"
          aria-busy={moduleLoadDurationMs === null}
          aria-label="Proses pemuatan awal Analisis Kinerja"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">
                {moduleLoadDurationMs === null
                  ? 'Memuat modul Analisis Kinerja'
                  : 'Modul Analisis Kinerja siap'}
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                {moduleLoadDurationMs === null
                  ? `Waktu berjalan ${formatLoadTime(moduleLoadElapsedMs)}`
                  : `Pemuatan awal selesai dalam ${formatLoadTime(moduleLoadDurationMs)}`}
              </p>
            </div>
            <span className="text-xs font-medium text-slate-400">
              {completedModuleLoadTasks}/{MODULE_LOAD_TASK_LABELS.length} proses · {moduleLoadProgress}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Kemajuan pemuatan awal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={moduleLoadProgress}
            className="h-2.5 overflow-hidden rounded-full bg-slate-800"
          >
            <div
              className="h-full rounded-full bg-sky-400 transition-[width] duration-300"
              style={{ width: `${moduleLoadProgress}%` }}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODULE_LOAD_TASK_LABELS.map(({ id, label }) => {
              const task = moduleLoadTasks[id];
              return (
                <div key={id} className="min-w-0 rounded-lg bg-slate-900/50 px-3 py-2">
                  <p className="truncate text-xs font-medium text-slate-300">{label}</p>
                  <p className={`mt-1 text-xs ${
                    task.status === 'failed' ? 'text-rose-300' : 'text-slate-400'
                  }`}>
                    {task.status === 'loading'
                      ? 'Memuat…'
                      : task.status === 'failed'
                        ? `Gagal setelah ${formatLoadTime(task.durationMs ?? 0)}`
                        : `Selesai setelah ${formatLoadTime(task.durationMs ?? 0)}`}
                  </p>
                  {task.error && (
                    <p className="mt-1 break-words text-xs text-rose-300">{task.error}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {error && (
          <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        )}

        {Boolean(analysis?.available_periods.length) && (
          <section className="card flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <h2 className="font-semibold">Periode dataset</h2>
              <p className="mt-1 text-sm text-slate-400">
                Pilih triwulan untuk melihat analisis dan data pegawainya.
              </p>
            </div>
            <div role="group" aria-label="Pilih periode dataset kinerja" className="flex flex-wrap gap-2">
              {analysis?.available_periods.map((item) => {
                const active = (selectedPeriod ?? analysis?.dataset?.period) === item.period;
                return (
                  <button
                    key={item.period}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedPeriod(item.period);
                      setQuarter(item.period.slice(0, 2));
                      setYear(item.period.slice(3));
                      setRecordPage(1);
                      setFullValidation(null);
                      setCorrectionSyncError(null);
                      setCorrectionSyncNotice(null);
                      setCorrectionSyncPreview(null);
                    }}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                      active
                        ? 'border-sky-400 bg-sky-500/15 text-sky-200'
                        : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-500 hover:bg-slate-800'
                    }`}
                  >
                    {item.period}
                    <span className="ml-2 text-xs text-slate-400">
                      {numberFormatter.format(item.row_count)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {(user?.auth_level ?? 0) >= 3 && (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsDataManagementOpen(true)}
                aria-label="Kelola dataset dan sinkronkan koreksi"
                title="Kelola dataset dan sinkronkan koreksi"
                className="inline-flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-sm font-medium text-sky-200 transition hover:bg-sky-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5">
                  <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
                  <path d="M5 16v4h14v-4" />
                </svg>
                <span>Kelola dataset</span>
              </button>
            </div>
            {isDataManagementOpen && (
              <div
                className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/70 p-4"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setIsDataManagementOpen(false);
                }}
              >
                <section
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="performance-data-management-title"
                  className="my-auto w-full max-w-5xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6"
                >
                  <header className="mb-5 flex items-center justify-between gap-4">
                    <div>
                      <h2 id="performance-data-management-title" className="text-lg font-semibold">Kelola dataset kinerja</h2>
                      <p className="mt-1 text-sm text-slate-400">Unggah dataset lengkap atau sinkronkan koreksi dari EPRIDE.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDataManagementOpen(false)}
                      aria-label="Tutup pengelolaan dataset"
                      title="Tutup"
                      className="size-9 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="mx-auto size-5">
                        <path d="m6 6 12 12M18 6 6 18" />
                      </svg>
                    </button>
                  </header>
                  <div className="grid max-h-[75vh] gap-5 overflow-y-auto lg:grid-cols-2">
            <div className="card p-5">
              <h2 className="font-semibold">Unggah dataset lengkap</h2>
              <p className="mt-1 text-sm text-slate-400">
                Unggahan mengganti data hanya untuk periode yang dipilih; periode lain tetap tersimpan. Gunakan CSV contoh; NIP boleh 16 atau 18 digit.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px]">
                <label className="block text-sm text-slate-300">
                  Periode
                  <select
                    value={quarter}
                    disabled={fullBusy}
                    onChange={(event) => {
                      setQuarter(event.target.value);
                      setFullValidation(null);
                    }}
                    className="input mt-1.5"
                  >
                    <option value="Q1">Triwulan I</option>
                    <option value="Q2">Triwulan II</option>
                    <option value="Q3">Triwulan III</option>
                    <option value="Q4">Triwulan IV</option>
                  </select>
                </label>
                <label className="block text-sm text-slate-300">
                  Tahun
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    value={year}
                    disabled={fullBusy}
                    onChange={(event) => {
                      setYear(event.target.value);
                      setFullValidation(null);
                    }}
                    className="input mt-1.5"
                  />
                </label>
              </div>
              <label className="mt-4 block text-sm text-slate-300">
                Referensi pegawai untuk pencocokan NIP
                <select
                  value={fullEmployeeSource}
                  disabled={fullBusy}
                  onChange={(event) => {
                    const selectedSource = PERFORMANCE_EMPLOYEE_SOURCES.find(
                      (source) => source.value === event.target.value,
                    )?.value;
                    if (!selectedSource) return;
                    setFullEmployeeSource(selectedSource);
                    setFullValidation(null);
                    setFullError(null);
                    setFullNotice(null);
                  }}
                  className="input mt-1.5"
                >
                  {PERFORMANCE_EMPLOYEE_SOURCES.map((source) => (
                    <option key={source.value} value={source.value}>{source.label}</option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-slate-400">
                  Nama, eselon, dan unit dari sumber ini disimpan pada periode yang diunggah dan dipakai di tab analisis.
                </span>
              </label>
              <label className="mt-4 block text-sm text-slate-300">
                File CSV
                <input
                  ref={fullFileInput}
                  type="file"
                  accept=".csv,text/csv"
                  disabled={fullBusy}
                  onChange={(event) => {
                    setFullFile(event.target.files?.[0] ?? null);
                    setFullValidation(null);
                    setFullError(null);
                  }}
                  className="mt-1.5 block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-surface-700 file:px-3 file:py-2 file:text-sm file:text-slate-100"
                />
              </label>
              {fullError && <p role="alert" className="mt-3 break-words text-sm text-rose-300">{fullError}</p>}
              {fullNotice && <p role="status" className="mt-3 text-sm text-emerald-300">{fullNotice}</p>}
              {fullValidation && (
                <div className="mt-3 space-y-1 text-sm">
                  <p role="status" className="text-emerald-300">
                    Valid: {fullValidation.row_count} pegawai · {fullValidation.period} · {getPerformanceEmployeeSourceLabel(fullEmployeeSource)}
                  </p>
                  {fullValidation.unidentified_count > 0 && (
                    <p className="text-amber-300">
                      {fullValidation.unidentified_count} NIP tidak cocok dengan sumber pegawai dan akan dikelompokkan sebagai Unidentified.
                    </p>
                  )}
                  {fullValidation.normalized_penalty_count > 0 && (
                    <p className="text-amber-300">
                      {fullValidation.normalized_penalty_count} nilai Hukdis/Dampak positif akan disimpan sebagai potongan negatif.
                    </p>
                  )}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => void validateFullData()} disabled={!fullFile || fullBusy} className="btn-secondary">
                  {fullBusy ? <Spinner size="sm" label="Memvalidasi…" /> : 'Validasi CSV'}
                </button>
                {fullValidation && (
                  <button type="button" onClick={() => void replaceFullData()} disabled={fullBusy} className="btn-primary">
                    Simpan Dataset Periode
                  </button>
                )}
              </div>
            </div>

            <div className="card p-5">
              <h2 className="font-semibold">Sinkronkan koreksi dari EPRIDE</h2>
              <p className="mt-1 text-sm text-slate-400">
                Dataset tujuan: {analysisPeriod ?? 'belum ada dataset'}. Pilih tahun dan TW sumber EPRIDE secara terpisah.
                Daftar pilihan mengikuti form eligible yang sudah terkirim dan dimuat ulang saat panel ini dibuka.
                Hanya form terkirim dengan `idUnit` 13 digit yang dipakai; nilai NULL menjadi 0. Nilai di luar -20 sampai 20 menghentikan sinkronisasi.
                Konflik nilai nonzero harus dipilih manual. NIP dataset yang tidak ditemukan akan diberi koreksi 0; tanpa sinkronisasi, nilai CSV tetap digunakan.
              </p>
              {correctionSyncError && <p role="alert" className="mt-3 break-words text-sm text-rose-300">{correctionSyncError}</p>}
              {correctionSyncNotice && <p role="status" className="mt-3 break-words text-sm text-emerald-300">{correctionSyncNotice}</p>}
              {correctionSourcePeriodsError && (
                <p role="alert" className="mt-3 break-words text-sm text-rose-300">
                  Tidak dapat memuat periode sumber EPRIDE: {correctionSourcePeriodsError}
                </p>
              )}
              {correctionSourcePeriodsLoading && (
                <p role="status" className="mt-3 text-sm text-slate-400">
                  <Spinner size="sm" label="Memuat periode sumber EPRIDE…" />
                </p>
              )}
              {!correctionSourcePeriodsLoading
                && !correctionSourcePeriodsError
                && correctionSourcePeriods.length === 0 && (
                  <p role="status" className="mt-3 text-sm text-amber-300">
                    Belum ada form EPRIDE terkirim dengan idUnit 13 digit.
                  </p>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-slate-300">Tahun sumber EPRIDE</span>
                  <select
                    value={correctionSourceYear ?? ''}
                    onChange={(event) => {
                      const nextYear = Number(event.target.value);
                      const nextPeriod = correctionSourcePeriods.find(
                        (sourcePeriod) => sourcePeriod.year === nextYear,
                      );
                      setCorrectionSourceYear(nextPeriod?.year ?? null);
                      setCorrectionSourceTw(
                        nextPeriod?.available_tw[nextPeriod.available_tw.length - 1] ?? null,
                      );
                      setCorrectionSyncPreview(null);
                      setCorrectionConflictResolutions({});
                      setCorrectionSyncError(null);
                      setCorrectionSyncNotice(null);
                    }}
                    disabled={correctionSourcePeriodsLoading || correctionSourcePeriods.length === 0}
                    className="mt-1 block w-full rounded-lg border border-slate-600 bg-surface-800 px-3 py-2 text-slate-100 disabled:opacity-50"
                  >
                    <option value="">Pilih tahun</option>
                    {correctionSourcePeriods.map((sourcePeriod) => (
                      <option key={sourcePeriod.year} value={sourcePeriod.year}>
                        {sourcePeriod.year}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-slate-300">TW sumber EPRIDE</span>
                  <select
                    value={correctionSourceTw ?? ''}
                    onChange={(event) => {
                      setCorrectionSourceTw(event.target.value ? Number(event.target.value) : null);
                      setCorrectionSyncPreview(null);
                      setCorrectionConflictResolutions({});
                      setCorrectionSyncError(null);
                      setCorrectionSyncNotice(null);
                    }}
                    disabled={correctionSourcePeriodsLoading || availableCorrectionSourceTws.length === 0}
                    className="mt-1 block w-full rounded-lg border border-slate-600 bg-surface-800 px-3 py-2 text-slate-100 disabled:opacity-50"
                  >
                    <option value="">Pilih TW</option>
                    {availableCorrectionSourceTws.map((tw) => (
                      <option key={tw} value={tw}>TW{tw}</option>
                    ))}
                  </select>
                </label>
              </div>
              {correctionSyncPreview && (
                <div role="status" className="mt-4 space-y-1 text-sm text-slate-300">
                  <p className="font-medium text-emerald-300">
                    Sumber EPRIDE {correctionSyncPreview.source_year} TW{correctionSyncPreview.source_tw} untuk dataset {correctionSyncPreview.period}: {numberFormatter.format(correctionSyncPreview.source_row_count)} baris eligible, {numberFormatter.format(correctionSyncPreview.source_nip_count)} NIP unik.
                  </p>
                  <p>
                    Akan diperbarui: {numberFormatter.format(correctionSyncPreview.row_count)} pegawai; cocok {numberFormatter.format(correctionSyncPreview.matched_count)}; tidak ditemukan dan akan diberi koreksi 0: {numberFormatter.format(correctionSyncPreview.unmatched_count)}.
                  </p>
                  {correctionSyncPreview.duplicate_nip_group_count > 0 && (
                    <p>{numberFormatter.format(correctionSyncPreview.duplicate_nip_group_count)} kelompok NIP duplikat akan diproses sesuai aturan koreksi.</p>
                  )}
                  {correctionSyncPreview.ignored_unit_row_count > 0 && (
                    <p>{numberFormatter.format(correctionSyncPreview.ignored_unit_row_count)} baris dengan idUnit bukan 13 digit akan diabaikan.</p>
                  )}
                  {correctionSyncPreview.source_only_nip_count > 0 && (
                    <p>{numberFormatter.format(correctionSyncPreview.source_only_nip_count)} NIP sumber tidak ada dalam dataset.</p>
                  )}
                  {correctionSyncPreview.conflicts.length > 0 && (
                    <div className="mt-3 space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                      <p className="font-medium text-amber-200">
                        Pilih satu nilai koreksi untuk setiap NIP yang memiliki konflik:
                      </p>
                      {correctionSyncPreview.conflicts.map((conflict) => (
                        <fieldset key={conflict.nip} className="space-y-2">
                          <legend className="text-slate-100">NIP {conflict.nip}</legend>
                          {conflict.candidates.map((candidate) => (
                            <label
                              key={`${conflict.nip}-${candidate.value}`}
                              className="flex cursor-pointer gap-2 rounded-md border border-slate-700 p-2"
                            >
                              <input
                                type="radio"
                                name={`epride-conflict-${conflict.nip}`}
                                value={candidate.value}
                                checked={correctionConflictResolutions[conflict.nip] === candidate.value}
                                onChange={() => setCorrectionConflictResolutions((current) => ({
                                  ...current,
                                  [conflict.nip]: candidate.value,
                                }))}
                                aria-label={`Pilih koreksi ${candidate.value} untuk NIP ${conflict.nip}`}
                                className="mt-1 accent-sky-400"
                              />
                              <span className="min-w-0">
                                <span className="block font-medium text-slate-100">
                                  Nilai koreksi {candidate.value}
                                </span>
                                {candidate.sources.map((source, sourceIndex) => (
                                  <span
                                    key={`${source.form_id}-${source.id_unit}-${sourceIndex}`}
                                    className="block break-words text-xs text-slate-400"
                                  >
                                    Form {source.form_id || '—'} · idUnit {source.id_unit}
                                    {source.submitted_at ? ` · ${source.submitted_at}` : ''}
                                  </span>
                                ))}
                              </span>
                            </label>
                          ))}
                        </fieldset>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void checkPerformanceCorrections()}
                  disabled={
                    !analysisPeriod
                    || correctionSourceYear === null
                    || correctionSourceTw === null
                    || correctionSyncAction !== null
                    || correctionSourcePeriodsLoading
                  }
                  className="btn-secondary"
                >
                  {correctionSyncAction === 'checking'
                    ? <Spinner size="sm" label="Memeriksa…" />
                    : analysisPeriod && correctionSourceYear !== null && correctionSourceTw !== null
                      ? `Periksa EPRIDE ${correctionSourceYear} TW${correctionSourceTw}`
                      : 'Periksa EPRIDE'}
                </button>
                {correctionPreviewMatchesSelection && (
                  <button
                    type="button"
                    onClick={() => void syncPerformanceCorrections()}
                    disabled={correctionSyncAction !== null || unresolvedCorrectionConflicts > 0}
                    className="btn-primary"
                  >
                    {correctionSyncAction === 'syncing'
                      ? <Spinner size="sm" label="Menyinkronkan…" />
                      : unresolvedCorrectionConflicts > 0
                        ? `Pilih ${unresolvedCorrectionConflicts} konflik`
                        : `Sinkronkan ${analysisPeriod}`}
                  </button>
                )}
              </div>
            </div>
                  </div>
                </section>
              </div>
            )}
          </>
        )}

        <div role="tablist" aria-label="Analisis kinerja" className="flex flex-wrap gap-2 border-b border-slate-700">
          {PERFORMANCE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`performance-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`performance-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-3 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'border-sky-400 bg-sky-500/10 text-sky-200'
                  : 'border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                {tab.id === 'overview' ? (
                  <>
                    <path d="M4 19V5m0 14h16" />
                    <path d="m7 15 4-4 3 2 5-6" />
                  </>
                ) : tab.id === 'units' ? (
                  <>
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M3 9h18M9 9v11m6-11v11" />
                  </>
                ) : (
                  <>
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6m2-9a3 3 0 1 0 0-6m1 9c2.2.6 3.8 2.6 4 5" />
                  </>
                )}
              </svg>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <section
            id="performance-panel-overview"
            role="tabpanel"
            aria-labelledby="performance-tab-overview"
            className="card p-5"
            aria-busy={isLoading}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-semibold">Overview Analisis Kinerja</h2>
                  <button
                    type="button"
                    aria-pressed={isOverviewCompareMode}
                    aria-label="Bandingkan periode terpilih dengan periode sebelumnya"
                    onClick={() => setIsOverviewCompareMode((current) => !current)}
                    disabled={!analysis?.dataset}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isOverviewCompareMode
                        ? 'border-sky-400 bg-sky-500/15 text-sky-200'
                        : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Compare
                  </button>
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  {analysis?.dataset
                    ? `Periode ${analysis.dataset.period} · ${numberFormatter.format(analysis.total_employees)} pegawai`
                    : 'Belum ada dataset kinerja yang diunggah.'}
                </p>
              </div>
              {analysis?.dataset && (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                  <label className="block min-w-64 text-sm text-slate-300">
                    Unit Eselon II
                    <select
                      value={selectedUnit}
                      onChange={(event) => setSelectedUnit(event.target.value)}
                      className="input mt-1.5"
                    >
                      <option value="">Semua Unit Eselon II</option>
                      {analysis.unit_eselon_ii_options.map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block min-w-64 text-sm text-slate-300">
                    Unit Eselon III
                    <select
                      value={selectedEselonIII}
                      onChange={(event) => setSelectedEselonIII(event.target.value)}
                      className="input mt-1.5"
                    >
                      <option value="">Semua Unit Eselon III</option>
                      {analysis.unit_eselon_iii_options.map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block min-w-64 text-sm text-slate-300">
                    Unit Eselon IV
                    <select
                      value={selectedEselonIV}
                      onChange={(event) => setSelectedEselonIV(event.target.value)}
                      className="input mt-1.5"
                    >
                      <option value="">Semua Unit Eselon IV</option>
                      {analysis.unit_eselon_iv_options.map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block min-w-64 text-sm text-slate-300">
                    Eselon
                    <select
                      value={selectedEselon}
                      onChange={(event) => setSelectedEselon(event.target.value)}
                      className="input mt-1.5"
                      aria-label="Filter Eselon"
                    >
                      <option value="">Semua Eselon</option>
                      {analysis.eselon_options.map((eselon) => (
                        <option key={eselon} value={eselon}>{eselon}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>

            {error && (
              <p role="alert" className="mt-4 break-words text-sm text-rose-300">{error}</p>
            )}
            {isOverviewCompareMode && analysis?.dataset && !analysis.previous_period && (
              <p role="status" className="mt-4 rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm text-slate-400">
                Data untuk triwulan sebelumnya tidak tersedia. Nilai periode terpilih tetap ditampilkan.
              </p>
            )}
            {isLoading && !analysis ? (
              <div className="flex justify-center p-10"><Spinner label="Memuat analisis…" /></div>
            ) : !analysis?.dataset ? (
              <p className="mt-6 rounded-lg border border-slate-700 bg-slate-900/50 p-5 text-sm text-slate-400">
                Super Admin perlu mengunggah dataset lengkap untuk memulai analisis.
              </p>
            ) : (
              <>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                    <p className="text-sm text-slate-400">Jumlah Pegawai</p>
                    <p className="mt-2 text-2xl font-semibold">{numberFormatter.format(analysis.overview.employee_count)}</p>
                    {isOverviewCompareMode && analysis.previous_period && (
                      <OverviewComparisonDetail
                        comparison={analysis.overview_comparison.employee_count}
                        previousPeriod={analysis.previous_period}
                        formatValue={formatCount}
                      />
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                    <p className="text-sm text-slate-400">Jumlah Koreksi (bukan nol)</p>
                    <p className="mt-2 text-2xl font-semibold">{numberFormatter.format(analysis.overview.correction.count)}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {numberFormatter.format(analysis.overview.correction.positive_count)} penambahan · {numberFormatter.format(analysis.overview.correction.negative_count)} pengurangan
                    </p>
                    {isOverviewCompareMode && analysis.previous_period && (
                      <>
                        <OverviewComparisonDetail
                          comparison={analysis.overview_comparison['correction.count']}
                          previousPeriod={analysis.previous_period}
                          label="Jumlah"
                          formatValue={formatCount}
                        />
                        <OverviewComparisonDetail
                          comparison={analysis.overview_comparison['correction.positive_count']}
                          previousPeriod={analysis.previous_period}
                          label="Penambahan"
                          formatValue={formatCount}
                        />
                        <OverviewComparisonDetail
                          comparison={analysis.overview_comparison['correction.negative_count']}
                          previousPeriod={analysis.previous_period}
                          label="Pengurangan"
                          formatValue={formatCount}
                        />
                      </>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                    <p className="text-sm text-slate-400">Rata-rata Nilai Koreksi</p>
                    <p className="mt-2 text-2xl font-semibold">{formatNumber(analysis.overview.correction.average)}</p>
                    {isOverviewCompareMode && analysis.previous_period && (
                      <OverviewComparisonDetail
                        comparison={analysis.overview_comparison['correction.average']}
                        previousPeriod={analysis.previous_period}
                      />
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                    <p className="text-sm text-slate-400">Jumlah Penambahan</p>
                    <p className="mt-2 text-2xl font-semibold">{numberFormatter.format(analysis.overview.correction.positive_count)}</p>
                    {isOverviewCompareMode && analysis.previous_period && (
                      <OverviewComparisonDetail
                        comparison={analysis.overview_comparison['correction.positive_count']}
                        previousPeriod={analysis.previous_period}
                        formatValue={formatCount}
                      />
                    )}
                  </div>
                </div>

                <div className="mt-5 grid gap-5 xl:grid-cols-2">
                  <div className="min-w-0 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                    <h3 className="mb-3 text-sm font-semibold">Distribusi NPK</h3>
                    <Histogram
                      bins={analysis.overview.histogram}
                      previousBins={
                        isOverviewCompareMode
                          ? analysis.overview_previous?.histogram
                          : undefined
                      }
                      currentPeriod={analysis.dataset.period}
                      previousPeriod={analysis.previous_period}
                    />
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                    <h3 className="mb-4 text-sm font-semibold">Distribusi Status NKP Akhir</h3>
                    <StatusDistribution
                      counts={analysis.overview.status_counts}
                      total={analysis.overview.employee_count}
                      previousCounts={
                        isOverviewCompareMode
                          ? analysis.overview_previous?.status_counts
                          : undefined
                      }
                      previousTotal={
                        isOverviewCompareMode
                          ? analysis.overview_previous?.employee_count
                          : undefined
                      }
                      currentPeriod={analysis.dataset.period}
                      previousPeriod={analysis.previous_period ?? undefined}
                    />
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                  <h3 className="text-sm font-semibold">Hukdis dan Dampak</h3>
                  <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-slate-400">Hukuman Disiplin</dt>
                      <dd className="mt-1 text-lg font-semibold">{numberFormatter.format(analysis.overview.hukdis_count)}</dd>
                      {isOverviewCompareMode && analysis.previous_period && (
                        <OverviewComparisonDetail
                          comparison={analysis.overview_comparison.hukdis_count}
                          previousPeriod={analysis.previous_period}
                          formatValue={formatCount}
                        />
                      )}
                    </div>
                    <div>
                      <dt className="text-slate-400">Dampak Pelanggaran Disiplin</dt>
                      <dd className="mt-1 text-lg font-semibold">{numberFormatter.format(analysis.overview.dampak_pelanggaran_count)}</dd>
                      {isOverviewCompareMode && analysis.previous_period && (
                        <OverviewComparisonDetail
                          comparison={analysis.overview_comparison.dampak_pelanggaran_count}
                          previousPeriod={analysis.previous_period}
                          formatValue={formatCount}
                        />
                      )}
                    </div>
                    <div>
                      <dt className="text-slate-400">Dampak Perilaku</dt>
                      <dd className="mt-1 text-lg font-semibold">{numberFormatter.format(analysis.overview.dampak_perilaku_count)}</dd>
                      {isOverviewCompareMode && analysis.previous_period && (
                        <OverviewComparisonDetail
                          comparison={analysis.overview_comparison.dampak_perilaku_count}
                          previousPeriod={analysis.previous_period}
                          formatValue={formatCount}
                        />
                      )}
                    </div>
                  </dl>
                </div>

                <section className="mt-5 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Insight Text</h3>
                      {insight?.updated_at && (
                        <p className="mt-1 text-xs text-slate-400">
                          Terakhir diperbarui {formatUploadDate(insight.updated_at)}
                          {insight.updated_by_name ? ` oleh ${insight.updated_by_name}` : ''}
                        </p>
                      )}
                    </div>
                    {user && user.auth_level >= 2 && (
                      <button
                        type="button"
                        onClick={() => void saveInsight()}
                        disabled={insightLoading || insightBusy || insightDraft === insight?.content}
                        className="btn-primary disabled:opacity-50"
                      >
                        {insightBusy ? <Spinner size="sm" label="Menyimpan…" /> : 'Simpan Insight'}
                      </button>
                    )}
                  </div>
                  {insightError && (
                    <p role="alert" className="mt-3 break-words text-sm text-rose-300">{insightError}</p>
                  )}
                  {insightNotice && (
                    <p role="status" className="mt-3 text-sm text-emerald-300">{insightNotice}</p>
                  )}
                  {user && user.auth_level >= 2 ? (
                    <textarea
                      value={insightDraft}
                      onChange={(event) => {
                        setInsightDraft(event.target.value);
                        setInsightNotice(null);
                      }}
                      disabled={insightLoading || insightBusy}
                      maxLength={10000}
                      rows={5}
                      className="input mt-3 min-h-32 resize-y"
                      placeholder="Tulis insight untuk seluruh pengguna…"
                    />
                  ) : (
                    <p className="mt-3 min-h-16 whitespace-pre-wrap text-sm text-slate-300">
                      {insightLoading ? 'Memuat insight…' : insight?.content || 'Belum ada insight.'}
                    </p>
                  )}
                </section>
              </>
            )}
          </section>
        )}

        {activeTab === 'units' && (
          <section
            id="performance-panel-units"
            role="tabpanel"
            aria-labelledby="performance-tab-units"
            className="card p-5"
            aria-busy={isLoading}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">Analisis berdasarkan Unit Eselon II</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Buka Unit Eselon II dan III untuk melihat rincian hingga Unit Eselon IV. Statistik mengikuti periode terpilih.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative block w-56">
                  <span className="sr-only">Cari unit Eselon II, III, atau IV</span>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400">
                    <circle cx="10.8" cy="10.8" r="6.8" />
                    <path d="m16 16 4.5 4.5" />
                  </svg>
                  <input
                    type="search"
                    value={unitSearch}
                    onChange={(event) => {
                      setUnitSearch(event.target.value);
                      setCollapsedSearchUnitKeys([]);
                    }}
                    maxLength={100}
                    aria-label="Cari unit Eselon II, III, atau IV"
                    placeholder="Cari nama unit"
                    className="input h-9 pl-9"
                  />
                </label>
                <div role="group" aria-label="Aksi analisis unit" className="performance-action-toolbar inline-flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-1">
                  <button
                    type="button"
                    aria-pressed={isUnitLiteView}
                    onClick={() => setIsUnitLiteView((current) => !current)}
                    title={isUnitLiteView ? 'Matikan Lite View' : 'Aktifkan Lite View'}
                    className={`inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                      isUnitLiteView
                        ? 'bg-brand-500/20 text-brand-200'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span>Lite View</span>
                    <span className="sr-only">{isUnitLiteView ? 'aktif' : 'nonaktif'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const defaults = { ...DEFAULT_UNIT_COLUMN_WIDTHS };
                      unitColumnWidthsRef.current = defaults;
                      setUnitColumnWidths(defaults);
                      persistUnitColumnWidths(defaults);
                    }}
                    aria-label="Atur ulang lebar kolom"
                    title="Atur ulang lebar kolom"
                    className="size-9 rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-5">
                      <path d="M4 7v5h5M20 17v-5h-5" />
                      <path d="M5.5 12a7 7 0 0 1 12-4.9L20 9m-1.5 3a7 7 0 0 1-12 4.9L4 15" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!analysis) return;
                      setComparisonTarget({
                        label: 'Seluruh Dataset',
                        comparison: analysis.overview_comparison,
                      });
                    }}
                    disabled={
                      !analysis?.previous_period
                      || Object.keys(analysis.overview_comparison).length === 0
                    }
                    aria-label="Bandingkan seluruh dataset dengan periode sebelumnya"
                    title={
                      analysis?.previous_period
                        ? 'Bandingkan seluruh dataset dengan periode sebelumnya'
                        : 'Periode sebelumnya tidak tersedia'
                    }
                    className="size-9 rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-5">
                      <path d="M4 19V5m0 14h16" />
                      <path d="M8 15v-3m4 3V7m4 8v-5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportUnitAnalysis()}
                    disabled={!analysis?.dataset || unitExportBusy}
                    aria-label={unitExportBusy ? 'Mengekspor analisis unit' : 'Unduh analisis unit sebagai Excel'}
                    title={unitExportBusy ? 'Mengekspor analisis unit' : 'Unduh analisis unit sebagai Excel'}
                    className="size-9 rounded-lg text-emerald-300 transition hover:bg-slate-800 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`mx-auto size-5 ${unitExportBusy ? 'animate-pulse' : ''}`}>
                      <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13l4 4m0-4-4 4" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            {unitExportError && (
              <p role="alert" className="mt-3 break-words text-sm text-rose-300">{unitExportError}</p>
            )}
            {unitColumnWidthError && (
              <p role="alert" className="mt-3 break-words text-sm text-rose-300">{unitColumnWidthError}</p>
            )}
            {isLoading && !analysis ? (
              <div className="flex justify-center p-10"><Spinner label="Memuat analisis unit…" /></div>
            ) : !analysis?.dataset ? (
              <p className="mt-5 rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-400">
                Belum ada dataset kinerja yang diunggah.
              </p>
            ) : (
              <div
                ref={setUnitTableElement}
                className="mt-5 overflow-x-auto rounded-xl border border-slate-700"
              >
                <table
                  className="text-left text-xs"
                  style={{ width: visibleUnitTableWidth, tableLayout: 'fixed' }}
                >
                  <colgroup>
                    {visibleUnitColumns.map((column) => (
                      <col
                        key={column.key}
                        style={{ width: visibleUnitColumnWidths[column.key] }}
                      />
                    ))}
                  </colgroup>
                  <thead className="sticky top-0 bg-slate-900 text-slate-300">
                    <tr>
                      {visibleUnitColumns.map((column) => (
                        <th
                          key={column.key}
                          aria-sort={
                            isSortableUnitColumn(column) && unitSort?.key === column.key
                              ? unitSort.direction === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                          className={`relative px-3 py-3 ${column.key === 'unit' ? 'sticky left-0 z-10 bg-slate-900' : ''}`}
                        >
                          {isSortableUnitColumn(column) ? (
                            <button
                              type="button"
                              onClick={() => {
                                const { key } = column;
                                setUnitSort((current) => ({
                                  key,
                                  direction: current?.key === key && current.direction === 'asc'
                                    ? 'desc'
                                    : 'asc',
                                }));
                              }}
                              className="inline-flex items-center gap-1 text-left hover:text-white"
                              aria-label={`Urutkan berdasarkan ${column.label}`}
                            >
                              {column.label}
                              <span aria-hidden="true" className="text-sky-300">
                                {unitSort?.key === column.key
                                  ? unitSort.direction === 'asc' ? '↑' : '↓'
                                  : '↕'}
                              </span>
                            </button>
                          ) : column.label}
                          {unitColumnResizeHandle(column)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {searchedUnitHierarchy.units.length === 0 ? (
                      <tr>
                        <td colSpan={visibleUnitColumns.length} className="px-3 py-8 text-center text-slate-400">
                          {unitSearch.trim()
                            ? 'Tidak ada unit yang cocok dengan pencarian.'
                            : 'Tidak ada unit untuk ditampilkan.'}
                        </td>
                      </tr>
                    ) : searchedUnitHierarchy.units.map((unit) => {
                      const unitKey = JSON.stringify([unit.label]);
                      const expanded = isUnitExpanded(unitKey);
                      return (
                        <Fragment key={unitKey}>
                          <tr className="bg-slate-800/40 hover:bg-slate-800/70">
                            <td className="sticky left-0 bg-surface-800 px-3 py-3 font-medium">
                              <button
                                type="button"
                                onClick={() => toggleUnitExpanded(unitKey)}
                                aria-expanded={expanded}
                                disabled={unit.children.length === 0}
                                className="mr-2 text-sky-300 disabled:text-slate-600"
                                aria-label={`${expanded ? 'Tutup' : 'Buka'} rincian ${unit.label}`}
                              >
                                {expanded ? '−' : '+'}
                              </button>
                              {unit.label}
                            </td>
                            <UnitMetricCells metrics={unit} liteView={isUnitLiteView} />
                            <td className="px-3 py-3">
                              <UnitComparisonButton
                                unit={unit.label}
                                disabled={!analysis.previous_period}
                                onClick={() => setComparisonTarget({
                                  label: unit.label,
                                  comparison: unit.comparison,
                                })}
                              />
                            </td>
                          </tr>
                          {expanded && unit.children.map((child) => {
                            const childKey = JSON.stringify([unit.label, child.label]);
                            const childExpanded = isUnitExpanded(childKey);
                            return (
                              <Fragment key={childKey}>
                                <tr className="hover:bg-slate-800/40">
                                  <td className="sticky left-0 bg-surface-900 px-3 py-3 pl-10 text-slate-300">
                                    <button
                                      type="button"
                                      onClick={() => toggleUnitExpanded(childKey)}
                                      aria-expanded={childExpanded}
                                      disabled={child.children.length === 0}
                                      className="mr-2 text-sky-300 disabled:text-slate-600"
                                      aria-label={`${childExpanded ? 'Tutup' : 'Buka'} rincian ${child.label}`}
                                    >
                                      {childExpanded ? '−' : '+'}
                                    </button>
                                    {child.label}
                                  </td>
                                  <UnitMetricCells metrics={child} liteView={isUnitLiteView} />
                                  <td className="px-3 py-3">
                                    <UnitComparisonButton
                                      unit={child.label}
                                      disabled={!analysis.previous_period}
                                      onClick={() => setComparisonTarget({
                                        label: `${unit.label} · ${child.label}`,
                                        comparison: child.comparison,
                                      })}
                                    />
                                  </td>
                                </tr>
                                {childExpanded && child.children.map((grandchild) => (
                                  <tr
                                    key={JSON.stringify([unit.label, child.label, grandchild.label])}
                                    className="hover:bg-slate-800/40"
                                  >
                                    <td className="sticky left-0 bg-surface-900 px-3 py-3 pl-16 text-slate-400">
                                      {grandchild.label}
                                    </td>
                                    <UnitMetricCells
                                      metrics={grandchild}
                                      liteView={isUnitLiteView}
                                    />
                                    <td className="px-3 py-3">
                                      <UnitComparisonButton
                                        unit={grandchild.label}
                                        disabled={!analysis.previous_period}
                                        onClick={() => setComparisonTarget({
                                          label: `${unit.label} · ${child.label} · ${grandchild.label}`,
                                          comparison: grandchild.comparison,
                                        })}
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </Fragment>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeTab === 'employees' && (
        <section
          id="performance-panel-employees"
          role="tabpanel"
          aria-labelledby="performance-tab-employees"
          className="card p-5"
          aria-busy={isLoadingRecords}
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-semibold">Data hasil ekstraksi</h2>
              <p className="mt-1 text-sm text-slate-400">
                Menampilkan seluruh kolom sumber, hasil perhitungan, unit, eselon, dan status.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block min-w-64 text-sm text-slate-300">
                Cari nama atau NIP
                <input
                  type="search"
                  value={recordSearch}
                  onChange={(event) => {
                    setRecordSearch(event.target.value);
                    setRecordPage(1);
                  }}
                  maxLength={100}
                  className="input mt-1.5"
                  placeholder="Masukkan nama atau NIP"
                />
              </label>
              <div role="group" aria-label="Aksi daftar pegawai" className="performance-action-toolbar inline-flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-1">
                <button
                  type="button"
                  aria-pressed={isRecordsLiteView}
                  onClick={() => setIsRecordsLiteView((current) => !current)}
                  title={isRecordsLiteView ? 'Matikan Lite View' : 'Aktifkan Lite View'}
                  className={`inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                    isRecordsLiteView
                      ? 'bg-brand-500/20 text-brand-200'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                    <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span>Lite View</span>
                  <span className="sr-only">{isRecordsLiteView ? 'aktif' : 'nonaktif'}</span>
                </button>
                <button
                  type="button"
                  onClick={clearRecordFilters}
                  disabled={
                    !recordSearch
                    && !Object.values(recordFilterDrafts).some((value) => value?.trim())
                  }
                  aria-label="Bersihkan pencarian dan filter"
                  title="Bersihkan pencarian dan filter"
                  className="size-9 rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-5">
                    <path d="M4 6h16M7 6l1 14h8l1-14M9 6V4h6v2" />
                    <path d="m10 10 4 4m0-4-4 4" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => void exportRecords()}
                  disabled={!recordData?.period || recordsExportBusy}
                  aria-label={recordsExportBusy ? 'Mengekspor daftar pegawai' : 'Unduh daftar pegawai sebagai Excel'}
                  title={recordsExportBusy ? 'Mengekspor daftar pegawai' : 'Unduh daftar pegawai sebagai Excel'}
                  className="size-9 rounded-lg text-emerald-300 transition hover:bg-slate-800 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`mx-auto size-5 ${recordsExportBusy ? 'animate-pulse' : ''}`}>
                    <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13l4 4m0-4-4 4" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          {recordsExportError && (
            <p role="alert" className="mt-3 break-words text-sm text-rose-300">{recordsExportError}</p>
          )}
          {recordError && (
            <p role="alert" className="mt-4 break-words text-sm text-rose-300">{recordError}</p>
          )}
          {isLoadingRecords && !recordData ? (
            <div className="flex justify-center p-8"><Spinner label="Memuat tabel data…" /></div>
          ) : !recordData?.period ? (
            <p className="mt-5 rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-400">
              Belum ada data yang cocok untuk ditampilkan.
            </p>
          ) : (
            <>
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full min-w-[2800px] text-left text-xs">
                  <thead className="sticky top-0 bg-slate-900 text-slate-300">
                    <tr>
                      {visibleRecordColumns.map((column) => {
                        const active = recordSort.key === column.key;
                        const numeric = NUMERIC_RECORD_COLUMNS.has(column.key);
                        const directionLabel = numeric
                          ? recordSort.direction === 'asc' ? 'kecil ke besar' : 'besar ke kecil'
                          : recordSort.direction === 'asc' ? 'A ke Z' : 'Z ke A';
                        return (
                        <th
                          key={column.key}
                          aria-sort={active
                            ? recordSort.direction === 'asc' ? 'ascending' : 'descending'
                            : 'none'}
                          className="whitespace-nowrap px-3 py-3 font-semibold"
                        >
                          <button
                            type="button"
                            onClick={() => sortRecordsBy(column.key)}
                            title={`${column.label}: ${active ? directionLabel : numeric ? 'kecil ke besar' : 'A ke Z'}`}
                            className="text-left hover:text-sky-300"
                          >
                            {column.label}
                            <span className="ml-1 text-sky-300">
                              {active ? recordSort.direction === 'asc' ? '↑' : '↓' : '↕'}
                            </span>
                          </button>
                        </th>
                        );
                      })}
                    </tr>
                    <tr className="border-t border-slate-700">
                      {visibleRecordColumns.map((column) => {
                        const options = recordData.filter_options[column.key];
                        const range = recordData.numeric_ranges[column.key];
                        if (options) {
                          return (
                            <th key={column.key} className="px-2 py-2">
                              <select
                                value={recordFilterDrafts[column.key] ?? ''}
                                onChange={(event) => updateRecordFilter(column.key, event.target.value)}
                                className="input w-40 px-2 py-1 text-xs"
                                aria-label={`Filter ${column.label}`}
                              >
                                <option value="">Semua</option>
                                {options.map((option) => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            </th>
                          );
                        }
                        if (
                          range
                          && range[0] !== null
                          && range[1] !== null
                          && range[0] < range[1]
                        ) {
                          const [minimum, maximum] = range;
                          const minKey = `${column.key}__min`;
                          const maxKey = `${column.key}__max`;
                          const selectedMinimum = Number(recordFilterDrafts[minKey] ?? minimum);
                          const selectedMaximum = Number(recordFilterDrafts[maxKey] ?? maximum);
                          return (
                            <th key={column.key} className="min-w-40 px-2 py-2">
                              <div className="space-y-1">
                                <label className="flex items-center gap-1 text-[10px] text-slate-400">
                                  Min
                                  <input
                                    type="range"
                                    min={minimum}
                                    max={maximum}
                                    step="0.01"
                                    value={selectedMinimum}
                                    aria-label={`Nilai minimum ${column.label}`}
                                    onChange={(event) => updateNumericRangeFilter(
                                      column.key,
                                      'min',
                                      event.target.value,
                                      range,
                                    )}
                                    className="w-20 accent-sky-400"
                                  />
                                  <span>{formatNumber(selectedMinimum)}</span>
                                </label>
                                <label className="flex items-center gap-1 text-[10px] text-slate-400">
                                  Maks
                                  <input
                                    type="range"
                                    min={minimum}
                                    max={maximum}
                                    step="0.01"
                                    value={selectedMaximum}
                                    aria-label={`Nilai maksimum ${column.label}`}
                                    onChange={(event) => updateNumericRangeFilter(
                                      column.key,
                                      'max',
                                      event.target.value,
                                      range,
                                    )}
                                    className="w-20 accent-sky-400"
                                  />
                                  <span>{formatNumber(selectedMaximum)}</span>
                                </label>
                              </div>
                            </th>
                          );
                        }
                        return <th key={column.key} className="px-2 py-2" />;
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {recordData.records.length ? (
                      recordData.records.map((record) => (
                        <tr key={record.nip} className="hover:bg-slate-800/50">
                          {visibleRecordColumns.map((column) => (
                            <td key={column.key} className="max-w-64 px-3 py-2.5 text-slate-300">
                              {formatRecordValue(record[column.key])}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={visibleRecordColumns.length} className="px-4 py-8 text-center text-slate-400">
                          Tidak ada pegawai yang cocok dengan filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
                <p>
                  {recordData.total
                    ? `Menampilkan ${(recordData.page - 1) * recordData.page_size + 1}–${Math.min(recordData.page * recordData.page_size, recordData.total)} dari ${recordData.total}`
                    : '0 pegawai cocok'}
                  {recordData.total ? ' pegawai' : ''}
                  {recordData.period ? ` · ${recordData.period}` : ''}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRecordPage((page) => Math.max(1, page - 1))}
                    disabled={recordData.page <= 1 || isLoadingRecords}
                    className="btn-secondary px-3 py-1.5 disabled:opacity-50"
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecordPage((page) => page + 1)}
                    disabled={recordData.page * recordData.page_size >= recordData.total || isLoadingRecords}
                    className="btn-secondary px-3 py-1.5 disabled:opacity-50"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
        )}
      </div>
      {comparisonTarget && analysis?.dataset && analysis?.previous_period && (
        <UnitComparisonDialog
          label={comparisonTarget.label}
          comparison={comparisonTarget.comparison}
          currentPeriod={analysis.dataset.period}
          previousPeriod={analysis.previous_period}
          onClose={() => setComparisonTarget(null)}
        />
      )}
    </main>
  );
}
