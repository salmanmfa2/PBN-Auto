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
import { useMenuAccess } from '../contexts/MenuAccessContext';
import type {
  PerformanceDashboardResponse,
  PerformanceInsight,
  PerformanceMetricComparison,
  PerformanceRecord,
  PerformanceRecordsResponse,
  PerformanceEmployeeSource,
  PerformanceUnitMetrics,
  PerformanceCorrectionSyncPreview,
  PerformanceCorrectionSyncResult,
  PerformanceCorrectionSourceYear,
  PerformanceCorrectionEditLogPage,
  PerformanceCorrectionEditResult,
  PerformanceCorrectionBatchResult,
  PerformanceUploadValidation,
} from '../types';
import { Spinner } from '../components/Spinner';
import { Histogram, StatusDistribution } from '../components/performance/PerformanceVisuals';
import { OverviewComparisonDetail, UnitComparisonDialog, UnitComparisonButton, UnitMetricCells } from '../components/performance/PerformanceComparisons';
import {
  clearPerformanceCache,
  readPerformanceCache,
  readPerformanceRecordsViewState,
  writePerformanceCache,
  writePerformanceRecordsViewState,
} from '../services/performanceCache';

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
  { key: 'nkpAwalExceptional', label: 'NKP Perhitungan Sangat Istimewa', minWidth: 190, lite: false, sortValue: (metrics) => metrics.nkp_perhitungan_sangat_istimewa_count },
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
  { key: 'statusGap', label: 'Gap Status', minWidth: 90, lite: true, sortValue: (metrics) => metrics.status_gap_count },
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
type RecordColumnKey = keyof PerformanceRecord;
type RecordColumnWidths = Record<RecordColumnKey, number>;
const UNIT_COLUMN_WIDTHS_STORAGE_KEY = 'pbn.performance.unit-column-widths';
const MAX_UNIT_COLUMN_WIDTH = 640;
const RECORD_COLUMN_WIDTH_MIN = 72;
const RECORD_COLUMN_WIDTH_MAX = 640;
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
const DEFAULT_RECORD_COLUMN_WIDTHS: RecordColumnWidths = {
  nama: 220,
  nip: 160,
  unit_eselon_ii: 220,
  unit_eselon_iii: 220,
  unit_eselon_iv: 180,
  eselon: 90,
  nhk: 90,
  npk: 90,
  nhk_kalibrasi: 120,
  npk_kalibrasi: 120,
  nkp_awal: 110,
  rating_hasil_kerja_awal: 220,
  rating_perilaku_kerja_awal: 220,
  predikat_kinerja_awal: 180,
  nilai_hukuman_disiplin: 150,
  nilai_dampak_pelanggaran_disiplin: 190,
  nilai_dampak_perilaku: 160,
  nilai_koreksi: 120,
  nko: 90,
  nkp_perhitungan: 150,
  status_nkp_perhitungan: 180,
  nkp_akhir: 120,
  rating_hasil_kerja: 200,
  rating_perilaku_kerja: 200,
  predikat_kinerja: 170,
  status: 130,
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
  { key: 'nkp_perhitungan', label: 'NKP Perhitungan' },
  { key: 'status_nkp_perhitungan', label: 'Status NKP Perhitungan' },
  { key: 'nkp_akhir', label: 'NKP Akhir' },
  { key: 'rating_hasil_kerja', label: 'Rating Hasil Kerja' },
  { key: 'rating_perilaku_kerja', label: 'Rating Perilaku Kerja' },
  { key: 'predikat_kinerja', label: 'Predikat Kinerja' },
  { key: 'status', label: 'Status' },
];

function isRecordColumnKey(value: string): value is keyof PerformanceRecord {
  return RECORD_COLUMNS.some((column) => column.key === value);
}

function makeRecordsCacheKey(
  page: number,
  pageSize: number,
  search: string,
  filters: Record<string, string>,
  sortBy: keyof PerformanceRecord,
  sortOrder: 'asc' | 'desc',
  period: string | undefined,
): string {
  const stableFilters = Object.fromEntries(
    Object.entries(filters).sort(([left], [right]) => left.localeCompare(right)),
  );
  return `records:${JSON.stringify({
    page,
    pageSize,
    search,
    filters: stableFilters,
    sortBy,
    sortOrder,
    period: period ?? null,
  })}`;
}

const RECORD_LITE_COLUMNS = new Set<keyof PerformanceRecord>([
  'nama',
  'unit_eselon_ii',
  'eselon',
  'nkp_awal',
  'nilai_koreksi',
  'nko',
  'nkp_perhitungan',
  'status_nkp_perhitungan',
  'nkp_akhir',
  'status',
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
  'nkp_perhitungan',
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

function getRecordColumnWidthsStorageKey(userKey: string): string {
  return `pbn.performance.employee-column-widths.${encodeURIComponent(userKey)}`;
}

function isRecordColumnWidths(value: unknown): value is Partial<RecordColumnWidths> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const widths = value as Partial<Record<RecordColumnKey, unknown>>;
  return RECORD_COLUMNS.every(({ key }) => {
    const width = widths[key];
    return width === undefined || (typeof width === 'number'
      && Number.isFinite(width)
      && width >= RECORD_COLUMN_WIDTH_MIN
      && width <= RECORD_COLUMN_WIDTH_MAX);
  });
}

function readRecordColumnWidths(userKey: string): {
  widths: RecordColumnWidths;
  error: string | null;
} {
  try {
    const storedWidths = window.localStorage.getItem(
      getRecordColumnWidthsStorageKey(userKey),
    );
    if (!storedWidths) {
      return { widths: { ...DEFAULT_RECORD_COLUMN_WIDTHS }, error: null };
    }
    const parsed: unknown = JSON.parse(storedWidths);
    if (!isRecordColumnWidths(parsed)) {
      throw new Error('Format lebar kolom pegawai tidak valid.');
    }
    return {
      widths: { ...DEFAULT_RECORD_COLUMN_WIDTHS, ...parsed },
      error: null,
    };
  } catch (storageError) {
    return {
      widths: { ...DEFAULT_RECORD_COLUMN_WIDTHS },
      error: `Lebar kolom pegawai tersimpan tidak dapat dimuat: ${errorMessage(storageError)}`,
    };
  }
}

function fitRecordColumnWidths(
  widths: RecordColumnWidths,
  visibleColumns: Array<{ key: RecordColumnKey }>,
  containerWidth: number,
): RecordColumnWidths {
  const fittedWidths = { ...widths };
  if (visibleColumns.length === 0 || containerWidth <= 0) return fittedWidths;

  const minimumTableWidth = visibleColumns.length * RECORD_COLUMN_WIDTH_MIN;
  const targetWidth = Math.max(Math.round(containerWidth), minimumTableWidth);
  let difference = targetWidth - visibleColumns.reduce(
    (total, column) => total + fittedWidths[column.key],
    0,
  );
  while (Math.abs(difference) >= 1) {
    const adjustableColumns = visibleColumns.filter(({ key }) => (
      difference > 0
        ? fittedWidths[key] < RECORD_COLUMN_WIDTH_MAX
        : fittedWidths[key] > RECORD_COLUMN_WIDTH_MIN
    ));
    if (adjustableColumns.length === 0) break;
    const adjustment = difference / adjustableColumns.length;
    let appliedAdjustment = 0;
    for (const { key } of adjustableColumns) {
      const currentWidth = fittedWidths[key];
      const nextWidth = Math.min(
        RECORD_COLUMN_WIDTH_MAX,
        Math.max(RECORD_COLUMN_WIDTH_MIN, currentWidth + adjustment),
      );
      appliedAdjustment += nextWidth - currentWidth;
      fittedWidths[key] = nextWidth;
    }
    if (Math.abs(appliedAdjustment) < 1) break;
    difference -= appliedAdjustment;
  }
  for (const column of visibleColumns) {
    fittedWidths[column.key] = Math.round(fittedWidths[column.key]);
  }
  return fittedWidths;
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

export default function PerformanceAnalysisPage() {
  const { user } = useAuth();
  const { canEdit } = useMenuAccess();
  const canEditPerformance = canEdit('analisis-kinerja');
  const userCacheKey = user?.user ?? 'guest';
  const savedRecordView = useMemo(
    () => readPerformanceRecordsViewState(userCacheKey),
    [userCacheKey],
  );
  const savedRecordColumnWidths = useMemo(
    () => readRecordColumnWidths(userCacheKey),
    [userCacheKey],
  );
  const savedViewState = savedRecordView.value;
  const savedSortKey = savedViewState && isRecordColumnKey(savedViewState.recordSortKey)
    ? savedViewState.recordSortKey
    : 'nama';
  const [viewStateOwnerKey, setViewStateOwnerKey] = useState(userCacheKey);
  const [analysis, setAnalysis] = useState<PerformanceDashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'units' | 'employees'>(
    () => savedViewState?.activeTab ?? 'overview',
  );
  const [isOverviewCompareMode, setIsOverviewCompareMode] = useState(false);
  const [expandedUnits, setExpandedUnits] = useState<string[]>([]);
  const [collapsedSearchUnitKeys, setCollapsedSearchUnitKeys] = useState<string[]>([]);
  const [unitSort, setUnitSort] = useState<UnitSortState>(null);
  const [isUnitLiteView, setIsUnitLiteView] = useState(false);
  const [isRecordsLiteView, setIsRecordsLiteView] = useState(
    () => savedViewState?.isRecordsLiteView ?? false,
  );
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
  const [recordsFromCache, setRecordsFromCache] = useState(false);
  const [performanceCacheWarning, setPerformanceCacheWarning] = useState<string | null>(
    () => savedRecordView.error,
  );
  const [recordPage, setRecordPage] = useState(
    () => savedViewState?.recordPage ?? 1,
  );
  const [recordSearch, setRecordSearch] = useState(
    () => savedViewState?.recordSearch ?? '',
  );
  const [recordFilterDrafts, setRecordFilterDrafts] = useState<
    Record<string, string>
  >(() => savedViewState?.recordFilterDrafts ?? {});
  const [recordFilters, setRecordFilters] = useState<
    Record<string, string>
  >(() => savedViewState?.recordFilters ?? {});
  const [recordSort, setRecordSort] = useState<{
    key: keyof PerformanceRecord;
    direction: 'asc' | 'desc';
  }>(() => ({
    key: savedSortKey,
    direction: savedViewState?.recordSortDirection ?? 'asc',
  }));
  const [recordColumnWidths, setRecordColumnWidths] = useState<RecordColumnWidths>(
    () => ({ ...savedRecordColumnWidths.widths }),
  );
  const [recordColumnWidthError, setRecordColumnWidthError] = useState<string | null>(
    () => savedRecordColumnWidths.error,
  );
  const [recordTableElement, setRecordTableElement] = useState<HTMLDivElement | null>(null);
  const [recordTableContainerWidth, setRecordTableContainerWidth] = useState(0);
  const recordColumnWidthsRef = useRef<RecordColumnWidths>({
    ...savedRecordColumnWidths.widths,
  });
  const recordColumnResizeRef = useRef<{
    column: RecordColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);
  const autoFitRecordColumnsOnLiteActivation = useRef(false);
  const visibleRecordColumns = RECORD_COLUMNS
    .filter((column) => !isRecordsLiteView || RECORD_LITE_COLUMNS.has(column.key))
    .map((column) => {
      if (!isRecordsLiteView) return column;
      if (column.key === 'nkp_perhitungan') {
        return { ...column, label: 'Nilai Perhitungan' };
      }
      if (column.key === 'status_nkp_perhitungan') {
        return { ...column, label: 'Status NKP perhitungan' };
      }
      return column;
    });
  const visibleRecordTableWidth = visibleRecordColumns.reduce(
    (total, column) => total + recordColumnWidths[column.key],
    0,
  );
  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>(
    () => savedViewState?.selectedPeriod ?? undefined,
  );
  const [datasetDeleteBusyPeriod, setDatasetDeleteBusyPeriod] = useState<string | null>(null);
  const [datasetDeleteError, setDatasetDeleteError] = useState<string | null>(null);
  const [datasetDeleteNotice, setDatasetDeleteNotice] = useState<string | null>(null);
  const [correctionEditTarget, setCorrectionEditTarget] = useState<{
    record: PerformanceRecord;
    period: string;
  } | null>(null);
  const [correctionEditValue, setCorrectionEditValue] = useState('');
  const [correctionEditBusy, setCorrectionEditBusy] = useState(false);
  const [correctionEditError, setCorrectionEditError] = useState<string | null>(null);
  const [correctionEditNotice, setCorrectionEditNotice] = useState<string | null>(null);
  const [isBatchCorrectionOpen, setIsBatchCorrectionOpen] = useState(false);
  const [batchCorrectionFile, setBatchCorrectionFile] = useState<File | null>(null);
  const [batchCorrectionBusy, setBatchCorrectionBusy] = useState(false);
  const [batchCorrectionTemplateBusy, setBatchCorrectionTemplateBusy] = useState(false);
  const [batchCorrectionError, setBatchCorrectionError] = useState<string | null>(null);
  const [batchCorrectionNotice, setBatchCorrectionNotice] = useState<string | null>(null);
  const batchCorrectionFileInput = useRef<HTMLInputElement>(null);
  const [isCorrectionLogOpen, setIsCorrectionLogOpen] = useState(false);
  const [correctionLogPage, setCorrectionLogPage] = useState(1);
  const [correctionLogData, setCorrectionLogData] =
    useState<PerformanceCorrectionEditLogPage | null>(null);
  const [correctionLogLoading, setCorrectionLogLoading] = useState(false);
  const [correctionLogValidated, setCorrectionLogValidated] = useState(false);
  const [correctionLogActionId, setCorrectionLogActionId] = useState<number | null>(null);
  const [correctionLogError, setCorrectionLogError] = useState<string | null>(null);
  const [correctionLogNotice, setCorrectionLogNotice] = useState<string | null>(null);
  const correctionLogRequestId = useRef(0);
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
  const isPeriodLoading = Boolean(
    selectedPeriod
    && (
      (isLoading && analysis?.dataset?.period !== selectedPeriod)
      || (isLoadingRecords && recordData?.period !== selectedPeriod)
    ),
  );
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
    if (!recordTableElement) return;
    const updateWidth = () => setRecordTableContainerWidth(recordTableElement.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(recordTableElement);
    return () => observer.disconnect();
  }, [recordTableElement]);

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

  const persistRecordColumnWidths = useCallback((widths: RecordColumnWidths) => {
    try {
      window.localStorage.setItem(
        getRecordColumnWidthsStorageKey(userCacheKey),
        JSON.stringify(widths),
      );
      setRecordColumnWidthError(null);
    } catch (storageError) {
      setRecordColumnWidthError(
        `Lebar kolom pegawai tidak dapat disimpan: ${errorMessage(storageError)}`,
      );
    }
  }, [userCacheKey]);

  const updateRecordColumnWidth = (column: RecordColumnKey, width: number) => {
    const nextWidths = { ...recordColumnWidthsRef.current, [column]: width };
    recordColumnWidthsRef.current = nextWidths;
    setRecordColumnWidths(nextWidths);
    return nextWidths;
  };

  const startRecordColumnResize = (
    column: RecordColumnKey,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    recordColumnResizeRef.current = {
      column,
      startX: event.clientX,
      startWidth: recordColumnWidths[column],
    };
  };

  const moveRecordColumnResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = recordColumnResizeRef.current;
    if (!resize) return;
    const width = Math.min(
      RECORD_COLUMN_WIDTH_MAX,
      Math.max(
        RECORD_COLUMN_WIDTH_MIN,
        Math.round(resize.startWidth + event.clientX - resize.startX),
      ),
    );
    updateRecordColumnWidth(resize.column, width);
  };

  const finishRecordColumnResize = () => {
    if (!recordColumnResizeRef.current) return;
    recordColumnResizeRef.current = null;
    persistRecordColumnWidths(recordColumnWidthsRef.current);
  };

  const handleRecordColumnResizeKeyDown = (
    column: RecordColumnKey,
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 12 : -12;
    const width = Math.min(
      RECORD_COLUMN_WIDTH_MAX,
      Math.max(RECORD_COLUMN_WIDTH_MIN, recordColumnWidths[column] + delta),
    );
    const nextWidths = updateRecordColumnWidth(column, width);
    persistRecordColumnWidths(nextWidths);
  };

  const recordColumnResizeHandle = (column: { key: RecordColumnKey; label: string }) => (
    <div
      role="separator"
      aria-label={`Ubah lebar kolom ${column.label}`}
      aria-orientation="vertical"
      aria-valuemin={RECORD_COLUMN_WIDTH_MIN}
      aria-valuemax={RECORD_COLUMN_WIDTH_MAX}
      aria-valuenow={Math.round(recordColumnWidths[column.key])}
      tabIndex={0}
      title={`Tarik untuk mengubah lebar kolom ${column.label}; gunakan tombol panah kiri/kanan.`}
      onPointerDown={(event) => startRecordColumnResize(column.key, event)}
      onPointerMove={moveRecordColumnResize}
      onPointerUp={finishRecordColumnResize}
      onPointerCancel={finishRecordColumnResize}
      onLostPointerCapture={finishRecordColumnResize}
      onKeyDown={(event) => handleRecordColumnResizeKeyDown(column.key, event)}
      className="absolute right-0 top-0 z-10 h-full w-2 touch-none cursor-col-resize border-r-2 border-transparent hover:border-sky-400 focus-visible:border-sky-400 focus-visible:outline-none"
    />
  );

  useEffect(() => {
    if (!isRecordsLiteView) {
      autoFitRecordColumnsOnLiteActivation.current = false;
      return;
    }
    if (
      !autoFitRecordColumnsOnLiteActivation.current
      || recordTableContainerWidth <= 0
    ) return;
    const liteColumns = RECORD_COLUMNS.filter(
      (column) => RECORD_LITE_COLUMNS.has(column.key),
    );
    const fittedWidths = fitRecordColumnWidths(
      recordColumnWidthsRef.current,
      liteColumns,
      recordTableContainerWidth,
    );
    autoFitRecordColumnsOnLiteActivation.current = false;
    recordColumnWidthsRef.current = fittedWidths;
    setRecordColumnWidths(fittedWidths);
    persistRecordColumnWidths(fittedWidths);
  }, [isRecordsLiteView, persistRecordColumnWidths, recordTableContainerWidth]);

  const toggleRecordsLiteView = () => {
    setIsRecordsLiteView((current) => {
      autoFitRecordColumnsOnLiteActivation.current = !current;
      return !current;
    });
  };

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

  const refreshAnalysis = useCallback(async (requestedPeriod?: string | null) => {
    const requestId = ++analysisRequestId.current;
    setIsLoading(true);
    setError(null);
    let loadFailure: string | null = null;
    try {
      const result = await apiClient.getPerformanceDashboard(
        selectedUnit,
        selectedEselon ? [selectedEselon] : [],
        requestedPeriod === null ? undefined : requestedPeriod ?? selectedPeriod,
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

  useEffect(() => {
    if (viewStateOwnerKey === userCacheKey) return;
    const restored = savedRecordView.value;
    recordRequestId.current += 1;
    correctionLogRequestId.current += 1;
    setViewStateOwnerKey(userCacheKey);
    setActiveTab(restored?.activeTab ?? 'overview');
    setIsRecordsLiteView(restored?.isRecordsLiteView ?? false);
    setRecordPage(restored?.recordPage ?? 1);
    setRecordSearch(restored?.recordSearch ?? '');
    setRecordFilterDrafts(restored?.recordFilterDrafts ?? {});
    setRecordFilters(restored?.recordFilters ?? {});
    setRecordSort({
      key: restored && isRecordColumnKey(restored.recordSortKey)
        ? restored.recordSortKey
        : 'nama',
      direction: restored?.recordSortDirection ?? 'asc',
    });
    setSelectedPeriod(restored?.selectedPeriod ?? undefined);
    setRecordColumnWidths(savedRecordColumnWidths.widths);
    recordColumnWidthsRef.current = { ...savedRecordColumnWidths.widths };
    setRecordColumnWidthError(savedRecordColumnWidths.error);
    autoFitRecordColumnsOnLiteActivation.current = false;
    setRecordData(null);
    setRecordsFromCache(false);
    setRecordError(null);
    setIsLoadingRecords(true);
    setPerformanceCacheWarning(
      savedRecordView.error,
    );
    setCorrectionEditTarget(null);
    setCorrectionEditBusy(false);
    setCorrectionEditError(null);
    setCorrectionEditNotice(null);
    setIsBatchCorrectionOpen(false);
    setBatchCorrectionFile(null);
    setBatchCorrectionBusy(false);
    setBatchCorrectionTemplateBusy(false);
    setBatchCorrectionError(null);
    setBatchCorrectionNotice(null);
    setIsCorrectionLogOpen(false);
    setCorrectionLogLoading(false);
    setCorrectionLogPage(1);
    setCorrectionLogData(null);
    setCorrectionLogValidated(false);
    setCorrectionLogError(null);
    setCorrectionLogNotice(null);
    setCorrectionLogActionId(null);
  }, [savedRecordColumnWidths, savedRecordView, userCacheKey, viewStateOwnerKey]);

  useEffect(() => {
    if (viewStateOwnerKey !== userCacheKey) return;
    try {
      writePerformanceRecordsViewState(userCacheKey, {
        activeTab,
        isRecordsLiteView,
        recordPage,
        recordSearch,
        recordFilterDrafts,
        recordFilters,
        recordSortKey: recordSort.key,
        recordSortDirection: recordSort.direction,
        selectedPeriod: selectedPeriod ?? null,
      });
    } catch (storageError) {
      setPerformanceCacheWarning(
        `Could not save employee-table settings: ${errorMessage(storageError)}`,
      );
    }
  }, [
    activeTab,
    isRecordsLiteView,
    recordFilterDrafts,
    recordFilters,
    recordPage,
    recordSearch,
    recordSort,
    selectedPeriod,
    userCacheKey,
    viewStateOwnerKey,
  ]);

  const refreshRecords = useCallback(async (requestedPeriod?: string | null) => {
    const requestId = ++recordRequestId.current;
    const queryPeriod = requestedPeriod === null ? undefined : requestedPeriod ?? selectedPeriod;
    const cacheKey = makeRecordsCacheKey(
      recordPage,
      RECORD_PAGE_SIZE,
      recordSearch,
      recordFilters,
      recordSort.key,
      recordSort.direction,
      queryPeriod,
    );
    setIsLoadingRecords(true);
    setRecordError(null);
    setRecordsFromCache(false);
    let loadFailure: string | null = null;
    let cachedRecordsLoaded = false;
    try {
      const cached = await readPerformanceCache<PerformanceRecordsResponse>(
        userCacheKey,
        cacheKey,
      );
      if (requestId === recordRequestId.current && cached) {
        setRecordData(cached);
        setRecordsFromCache(true);
        setIsLoadingRecords(false);
        cachedRecordsLoaded = true;
      }
    } catch (cacheError) {
      if (requestId === recordRequestId.current) {
        setPerformanceCacheWarning(
          `Could not read the employee-record browser cache: ${errorMessage(cacheError)}`,
        );
      }
    }
    try {
      const result = await apiClient.getPerformanceRecords(
        recordPage,
        RECORD_PAGE_SIZE,
        recordSearch,
        recordFilters,
        recordSort.key,
        recordSort.direction,
        queryPeriod,
      );
      if (requestId === recordRequestId.current) {
        const lastPage = Math.max(1, Math.ceil(result.total / result.page_size));
        if (result.page > lastPage) {
          setRecordPage(lastPage);
          return;
        }
        setRecordData(result);
        setRecordsFromCache(false);
        try {
          await writePerformanceCache(userCacheKey, cacheKey, result);
        } catch (cacheError) {
          setPerformanceCacheWarning(
            `Could not save employee records in the browser cache: ${errorMessage(cacheError)}`,
          );
        }
      }
    } catch (loadError) {
      if (requestId === recordRequestId.current) {
        loadFailure = errorMessage(loadError);
        setRecordError(loadFailure);
        if (cachedRecordsLoaded) {
          setRecordsFromCache(true);
        }
      }
    } finally {
      if (requestId === recordRequestId.current) {
        setIsLoadingRecords(false);
        completeModuleLoadTask('records', loadFailure);
      }
    }
  }, [
    completeModuleLoadTask,
    recordFilters,
    recordPage,
    recordSearch,
    recordSort,
    selectedPeriod,
    userCacheKey,
  ]);

  useEffect(() => {
    void refreshRecords();
  }, [refreshRecords]);

  const invalidatePerformanceBrowserCache = useCallback(async () => {
    recordRequestId.current += 1;
    correctionLogRequestId.current += 1;
    setIsLoadingRecords(false);
    setCorrectionLogLoading(false);
    setCorrectionLogData(null);
    setCorrectionLogValidated(false);
    setRecordsFromCache(false);
    try {
      await clearPerformanceCache(userCacheKey);
    } catch (cacheError) {
      setPerformanceCacheWarning(
        `Could not clear the performance browser cache: ${errorMessage(cacheError)}`,
      );
    }
  }, [userCacheKey]);

  const refreshCorrectionEditLogs = useCallback(async (page: number) => {
    const requestId = ++correctionLogRequestId.current;
    const cacheKey = `correction-logs:${page}`;
    setCorrectionLogPage(page);
    setCorrectionLogLoading(true);
    setCorrectionLogValidated(false);
    setCorrectionLogError(null);
    try {
      const cached = await readPerformanceCache<PerformanceCorrectionEditLogPage>(
        userCacheKey,
        cacheKey,
      );
      if (requestId === correctionLogRequestId.current && cached) {
        setCorrectionLogData(cached);
      }
    } catch (cacheError) {
      if (requestId === correctionLogRequestId.current) {
        setPerformanceCacheWarning(
          `Could not read the correction-log browser cache: ${errorMessage(cacheError)}`,
        );
      }
    }
    try {
      const result = await apiClient.getPerformanceCorrectionEditLog(page, 50);
      if (requestId === correctionLogRequestId.current) {
        setCorrectionLogData(result);
        setCorrectionLogValidated(true);
        try {
          await writePerformanceCache(userCacheKey, cacheKey, result);
        } catch (cacheError) {
          setPerformanceCacheWarning(
            `Could not save the correction log in the browser cache: ${errorMessage(cacheError)}`,
          );
        }
      }
    } catch (loadError) {
      if (requestId === correctionLogRequestId.current) {
        setCorrectionLogError(errorMessage(loadError));
      }
    } finally {
      if (requestId === correctionLogRequestId.current) {
        setCorrectionLogLoading(false);
      }
    }
  }, [userCacheKey]);

  const updateVisibleCorrectionRecord = (result: PerformanceCorrectionEditResult) => {
    setRecordData((current) => {
      if (!current || current.period !== result.period) return current;
      return {
        ...current,
        records: current.records.map((record) => (
          record.nip === result.nip
            ? {
              ...record,
              nilai_koreksi: result.nilai_koreksi,
              nkp_akhir: result.nkp_akhir,
              status: result.status,
            }
            : record
        )),
      };
    });
  };

  const openCorrectionEditor = (record: PerformanceRecord, period: string) => {
    setCorrectionEditTarget({ record, period });
    setCorrectionEditValue(
      record.nilai_koreksi === null ? '' : String(record.nilai_koreksi),
    );
    setCorrectionEditError(null);
    setCorrectionEditNotice(null);
  };

  const submitCorrectionEdit = async () => {
    if (!correctionEditTarget) return;
    const value = Number(correctionEditValue);
    if (
      correctionEditValue.trim() === ''
      || !Number.isFinite(value)
      || value < -5
      || value > 5
    ) {
      setCorrectionEditError('Nilai Koreksi harus berupa angka antara -5 dan 5 (termasuk batasnya).');
      return;
    }
    setCorrectionEditBusy(true);
    setCorrectionEditError(null);
    setCorrectionEditNotice(null);
    try {
      const result = await apiClient.updatePerformanceCorrection({
        period: correctionEditTarget.period,
        nip: correctionEditTarget.record.nip,
        nilai_koreksi: value,
      });
      setCorrectionEditTarget(null);
      if (!result.changed) {
        setCorrectionEditNotice('Nilai Koreksi tidak berubah.');
        return;
      }
      updateVisibleCorrectionRecord(result);
      setCorrectionEditNotice(
        `Nilai Koreksi untuk NIP ${result.nip} tersimpan dan NKP Akhir dihitung ulang.`,
      );
      await invalidatePerformanceBrowserCache();
      await Promise.all([
        analysisPeriod === result.period
          ? refreshAnalysis(result.period)
          : Promise.resolve(),
        recordData?.period === result.period
          ? refreshRecords(result.period)
          : Promise.resolve(),
      ]);
    } catch (saveError) {
      setCorrectionEditError(errorMessage(saveError));
    } finally {
      setCorrectionEditBusy(false);
    }
  };

  const openCorrectionLog = () => {
    setCorrectionLogNotice(null);
    setCorrectionLogError(null);
    setIsCorrectionLogOpen(true);
    void refreshCorrectionEditLogs(1);
  };

  const openBatchCorrection = () => {
    setBatchCorrectionError(null);
    setBatchCorrectionNotice(null);
    setBatchCorrectionFile(null);
    if (batchCorrectionFileInput.current) {
      batchCorrectionFileInput.current.value = '';
    }
    setIsBatchCorrectionOpen(true);
  };

  const downloadBatchCorrectionTemplate = async () => {
    setBatchCorrectionTemplateBusy(true);
    setBatchCorrectionError(null);
    try {
      const template = await apiClient.downloadPerformanceCorrectionBatchTemplate();
      saveExcelFile(template, 'template-koreksi.xlsx');
    } catch (downloadError) {
      setBatchCorrectionError(errorMessage(downloadError));
    } finally {
      setBatchCorrectionTemplateBusy(false);
    }
  };

  const submitBatchCorrection = async () => {
    const targetPeriod = recordData?.period;
    if (!targetPeriod) {
      setBatchCorrectionError('Tidak ada periode dataset yang sedang ditampilkan.');
      return;
    }
    if (!batchCorrectionFile) {
      setBatchCorrectionError('Pilih file template koreksi berformat .xlsx terlebih dahulu.');
      return;
    }

    setBatchCorrectionBusy(true);
    setBatchCorrectionError(null);
    try {
      const result: PerformanceCorrectionBatchResult =
        await apiClient.batchUpdatePerformanceCorrections(
          batchCorrectionFile,
          targetPeriod,
        );
      setIsBatchCorrectionOpen(false);
      setBatchCorrectionFile(null);
      if (batchCorrectionFileInput.current) {
        batchCorrectionFileInput.current.value = '';
      }
      setBatchCorrectionNotice(
        `Batch koreksi ${result.period} selesai: ${result.updated_count} diperbarui, `
        + `${result.unchanged_count} tidak berubah dari ${result.input_count} NIP.`,
      );
      if (result.updated_count === 0) return;

      await invalidatePerformanceBrowserCache();
      await Promise.all([
        refreshAnalysis(result.period),
        refreshRecords(result.period),
        isCorrectionLogOpen
          ? refreshCorrectionEditLogs(1)
          : Promise.resolve(),
      ]);
    } catch (batchError) {
      setBatchCorrectionError(errorMessage(batchError));
    } finally {
      setBatchCorrectionBusy(false);
    }
  };

  const undoCorrectionEdit = async (logId: number) => {
    const selectedLog = correctionLogData?.records.find((log) => log.id === logId);
    if (!selectedLog || !correctionLogValidated) return;
    if (!window.confirm(
      `Pulihkan Nilai Koreksi sebelum perubahan ${selectedLog.edited_at} untuk NIP ${selectedLog.nip} pada ${selectedLog.period}? Semua edit setelah perubahan ini untuk NIP dan periode yang sama juga akan dihapus.`,
    )) {
      return;
    }
    setCorrectionLogActionId(logId);
    setCorrectionLogError(null);
    setCorrectionLogNotice(null);
    try {
      const result = await apiClient.undoPerformanceCorrectionEdit(logId);
      updateVisibleCorrectionRecord(result);
      setCorrectionLogNotice(
        `Nilai Koreksi NIP ${result.nip} pada ${result.period} dipulihkan; edit berikutnya untuk pegawai dan periode tersebut dihapus.`,
      );
      await invalidatePerformanceBrowserCache();
      await Promise.all([
        refreshCorrectionEditLogs(1),
        analysisPeriod === result.period
          ? refreshAnalysis(result.period)
          : Promise.resolve(),
        recordData?.period === result.period
          ? refreshRecords(result.period)
          : Promise.resolve(),
      ]);
    } catch (undoError) {
      setCorrectionLogError(errorMessage(undoError));
    } finally {
      setCorrectionLogActionId(null);
    }
  };

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
    if (!correctionEditTarget && !isCorrectionLogOpen && !isBatchCorrectionOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (
        correctionLogActionId !== null
        || correctionEditBusy
        || batchCorrectionBusy
        || batchCorrectionTemplateBusy
      ) return;
      setCorrectionEditTarget(null);
      setIsCorrectionLogOpen(false);
      setIsBatchCorrectionOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    correctionEditBusy,
    batchCorrectionBusy,
    batchCorrectionTemplateBusy,
    correctionEditTarget,
    correctionLogActionId,
    isBatchCorrectionOpen,
    isCorrectionLogOpen,
  ]);

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
      await invalidatePerformanceBrowserCache();
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

  const deleteDatasetPeriod = async (periodToDelete: string) => {
    if (!window.confirm(
      `Hapus dataset periode ${periodToDelete} beserta seluruh data pegawai dan log koreksinya? Tindakan ini tidak dapat dibatalkan.`,
    )) {
      return;
    }

    const activePeriod = selectedPeriod ?? analysis?.dataset?.period;
    const nextPeriodOptions = analysis?.available_periods.filter(
      (item) => item.period !== periodToDelete,
    ) ?? [];
    const nextPeriod = nextPeriodOptions[nextPeriodOptions.length - 1]?.period;
    const deletingActivePeriod = activePeriod === periodToDelete;
    const selectionWillChange = selectedPeriod !== nextPeriod;

    setDatasetDeleteBusyPeriod(periodToDelete);
    setDatasetDeleteError(null);
    setDatasetDeleteNotice(null);
    try {
      await apiClient.deletePerformanceDatasetPeriod(periodToDelete);
      await invalidatePerformanceBrowserCache();
      setDatasetDeleteNotice(
        `Dataset periode ${periodToDelete} beserta data pegawai dan log koreksinya berhasil dihapus.`,
      );

      if (deletingActivePeriod) {
        setSelectedPeriod(nextPeriod);
        setRecordPage(1);
        if (!selectionWillChange) {
          await Promise.all([
            refreshAnalysis(null),
            refreshRecords(null),
          ]);
        }
      } else {
        await refreshAnalysis(activePeriod ?? null);
      }
    } catch (deleteError) {
      setDatasetDeleteError(errorMessage(deleteError));
    } finally {
      setDatasetDeleteBusyPeriod(null);
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
      await invalidatePerformanceBrowserCache();
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
    <main className="performance-analysis-page relative isolate min-h-screen bg-surface-950 px-4 pb-14 pt-24 text-slate-100 sm:px-6">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_40%_at_50%_-5%,rgba(14,165,233,0.12),transparent)]"
        aria-hidden="true"
      />

      <div className="mx-auto max-w-[105.8rem] space-y-6">
        {/* Top Executive Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <Link
              to="/"
              className="mt-1 inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
            >
              <span aria-hidden="true">←</span>
              <span>Menu utama</span>
            </Link>

            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-500/30 bg-sky-500/15 text-sky-300">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 19V5m0 14h16" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m7 15 4-4 3 2 5-6" />
              </svg>
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Analisis Kinerja DJPb</h1>
              <p className="mt-1 text-sm text-slate-400">
                Evaluasi distribusi NPK, penyesuaian koreksi triwulanan, dan capaian unit kerja aktif.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {(user?.auth_level ?? 0) >= 3 && (
              <button
                type="button"
                onClick={() => setIsDataManagementOpen(true)}
                aria-label="Kelola dataset dan sinkronkan koreksi"
                title="Kelola dataset dan sinkronkan koreksi"
                className="inline-flex items-center gap-2 rounded-2xl border border-sky-500/40 bg-sky-500/15 px-4 py-2.5 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                  <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
                  <path d="M5 16v4h14v-4" />
                </svg>
                <span>Kelola Dataset</span>
              </button>
            )}

            {analysis?.dataset && (
              <div className="perf-header-card min-w-64 rounded-2xl border border-slate-700/80 bg-slate-900/80 px-4 py-3 text-sm backdrop-blur-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Periode Aktif
                  </span>
                  <span className="rounded-full border border-sky-500/30 bg-sky-500/15 px-2.5 py-0.5 font-mono text-xs font-semibold text-sky-300">
                    {analysis.dataset.period} · {numberFormatter.format(analysis.dataset.row_count)} peg
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-300">
                  Diunggah oleh <span className="font-medium">{analysis.dataset.uploaded_by_name}</span>{' '}
                  <span className="text-slate-400">({analysis.dataset.uploaded_by_user})</span>
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                  {formatUploadDate(analysis.dataset.uploaded_at)}
                </p>
              </div>
            )}
          </div>
        </header>

        {/* Compact Module Telemetry Bar */}
        <section
          className="perf-panel rounded-2xl border border-slate-800 bg-slate-900/65 px-4 py-3"
          aria-busy={moduleLoadDurationMs === null}
          aria-label="Proses pemuatan awal Analisis Kinerja"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className={`size-2 rounded-full ${
                  moduleLoadDurationMs === null ? 'animate-pulse bg-sky-400' : 'bg-emerald-400'
                }`}
              />
              <h2 className="text-xs font-semibold text-slate-200">
                {moduleLoadDurationMs === null
                  ? 'Memuat modul Analisis Kinerja'
                  : 'Modul Analisis Kinerja siap'}
              </h2>
              <span className="font-mono text-xs text-slate-400">
                ·{' '}
                {moduleLoadDurationMs === null
                  ? `Berjalan ${formatLoadTime(moduleLoadElapsedMs)}`
                  : `Selesai dalam ${formatLoadTime(moduleLoadDurationMs)}`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {MODULE_LOAD_TASK_LABELS.map(({ id, label }) => {
                const task = moduleLoadTasks[id];
                const badgeClass =
                  task.status === 'failed'
                    ? 'border-rose-500/35 bg-rose-500/10 text-rose-300'
                    : task.status === 'complete'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-slate-700 bg-slate-800/70 text-slate-400';
                return (
                  <span
                    key={id}
                    title={task.error ?? undefined}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium ${badgeClass}`}
                  >
                    <span>{label}</span>
                    <span className="font-mono opacity-85">
                      {task.status === 'loading'
                        ? '…'
                        : task.status === 'failed'
                          ? `Gagal (${formatLoadTime(task.durationMs ?? 0)})`
                          : formatLoadTime(task.durationMs ?? 0)}
                    </span>
                  </span>
                );
              })}

              <span className="ml-1 font-mono text-xs font-semibold text-slate-400">
                {completedModuleLoadTasks}/{MODULE_LOAD_TASK_LABELS.length} · {moduleLoadProgress}%
              </span>
            </div>
          </div>

          <div
            role="progressbar"
            aria-label="Kemajuan pemuatan awal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={moduleLoadProgress}
            className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-800"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${
                moduleLoadDurationMs === null ? 'bg-sky-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${moduleLoadProgress}%` }}
            />
          </div>

          {Object.values(moduleLoadTasks).some((task) => task.error) && (
            <div className="mt-2 space-y-1">
              {MODULE_LOAD_TASK_LABELS.map(({ id, label }) =>
                moduleLoadTasks[id].error ? (
                  <p key={id} className="break-words text-xs text-rose-300">
                    {label}: {moduleLoadTasks[id].error}
                  </p>
                ) : null,
              )}
            </div>
          )}
        </section>

        {error && (
          <div role="alert" className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        )}

        {/* Quarter Period Switcher */}
        {Boolean(analysis?.available_periods.length) && (
          <section className="perf-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
            <div>
              <h2 className="text-sm font-semibold">Periode Dataset</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Pilih triwulan untuk meninjau analisis agregat dan rincian data pegawai.
              </p>
            </div>
            <div role="group" aria-label="Pilih periode dataset kinerja" className="flex flex-wrap gap-2">
              {analysis?.available_periods.map((item) => {
                const active = (selectedPeriod ?? analysis?.dataset?.period) === item.period;
                return (
                  <div
                    key={item.period}
                    className={`inline-flex overflow-hidden rounded-xl border transition ${
                      active
                        ? 'border-sky-400 bg-sky-500/15 shadow-xs'
                        : 'border-slate-700 bg-slate-800/60 hover:border-slate-600'
                    }`}
                  >
                    <button
                      type="button"
                      disabled={datasetDeleteBusyPeriod !== null}
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
                      className={`px-3.5 py-2 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60 sm:text-sm ${
                        active ? 'text-sky-200' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <span>{item.period}</span>
                      <span className="ml-2 rounded-md bg-slate-950/35 px-1.5 py-0.5 font-mono text-[11px] font-normal text-slate-400">
                        {numberFormatter.format(item.row_count)}
                      </span>
                    </button>
                    {(user?.auth_level ?? 0) >= 3 && (
                      <button
                        type="button"
                        onClick={() => void deleteDatasetPeriod(item.period)}
                        disabled={datasetDeleteBusyPeriod !== null}
                        aria-label={
                          datasetDeleteBusyPeriod === item.period
                            ? `Menghapus dataset periode ${item.period}`
                            : `Hapus dataset periode ${item.period}`
                        }
                        title={
                          datasetDeleteBusyPeriod === item.period
                            ? 'Menghapus dataset…'
                            : `Hapus dataset ${item.period}`
                        }
                        className="inline-flex w-9 items-center justify-center border-l border-slate-700/70 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-wait disabled:opacity-50"
                      >
                        {datasetDeleteBusyPeriod === item.period ? (
                          <Spinner size="sm" />
                        ) : (
                          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                            <path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {isPeriodLoading && selectedPeriod && (
              <div role="status" aria-live="polite" className="flex basis-full justify-end">
                <Spinner size="sm" label={`Memuat data periode ${selectedPeriod}…`} />
              </div>
            )}
          </section>
        )}

        {datasetDeleteError && (
          <p role="alert" className="text-sm text-rose-300">
            {datasetDeleteError}
          </p>
        )}
        {datasetDeleteNotice && (
          <p role="status" className="text-sm text-emerald-300">
            {datasetDeleteNotice}
          </p>
        )}

        {/* Data Management Modal */}
        {(user?.auth_level ?? 0) >= 3 && isDataManagementOpen && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-xs"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsDataManagementOpen(false);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="performance-data-management-title"
              className="perf-modal my-auto w-full max-w-5xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6"
            >
              <header className="mb-5 flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h2 id="performance-data-management-title" className="text-lg font-bold">
                    Kelola Dataset Kinerja
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Unggah dataset triwulan baru atau sinkronkan nilai koreksi dari database EPRIDE.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDataManagementOpen(false)}
                  aria-label="Tutup pengelolaan dataset"
                  title="Tutup"
                  className="flex size-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                >
                  ×
                </button>
              </header>

              <div className="grid max-h-[75vh] gap-5 overflow-y-auto pr-1 lg:grid-cols-2">
                <div className="perf-subcard rounded-2xl border border-slate-700/80 bg-slate-950/40 p-5">
                  <h3 className="text-base font-semibold">Unggah Dataset Lengkap</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Unggahan mengganti data hanya untuk periode yang dipilih; periode lain tetap tersimpan. Gunakan CSV contoh; NIP boleh 16 atau 18 digit.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px]">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Periode
                      <select
                        value={quarter}
                        disabled={fullBusy}
                        onChange={(event) => {
                          setQuarter(event.target.value);
                          setFullValidation(null);
                        }}
                        className="input mt-1.5 normal-case"
                      >
                        <option value="Q1">Triwulan I</option>
                        <option value="Q2">Triwulan II</option>
                        <option value="Q3">Triwulan III</option>
                        <option value="Q4">Triwulan IV</option>
                      </select>
                    </label>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
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
                        className="input mt-1.5 normal-case"
                      />
                    </label>
                  </div>
                  <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Referensi Pegawai untuk Pencocokan NIP
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
                      className="input mt-1.5 normal-case"
                    >
                      {PERFORMANCE_EMPLOYEE_SOURCES.map((source) => (
                        <option key={source.value} value={source.value}>{source.label}</option>
                      ))}
                    </select>
                    <span className="mt-1 block text-[11px] font-normal normal-case text-slate-400">
                      Nama, eselon, dan unit dari sumber ini disimpan pada periode yang diunggah dan dipakai di tab analisis.
                    </span>
                  </label>
                  <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-400">
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
                      className="mt-1.5 block w-full text-sm normal-case text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-100 hover:file:bg-slate-700"
                    />
                  </label>
                  {fullError && <p role="alert" className="mt-3 break-words text-sm text-rose-300">{fullError}</p>}
                  {fullNotice && <p role="status" className="mt-3 text-sm text-emerald-300">{fullNotice}</p>}
                  {fullValidation && (
                    <div className="mt-3 space-y-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                      <p role="status" className="font-semibold text-emerald-300">
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

                <div className="perf-subcard rounded-2xl border border-slate-700/80 bg-slate-950/40 p-5">
                  <h3 className="text-base font-semibold">Sinkronkan Koreksi dari EPRIDE</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Dataset tujuan: <span className="font-semibold text-slate-200">{analysisPeriod ?? 'belum ada dataset'}</span>. Pilih tahun dan TW sumber EPRIDE secara terpisah.
                    Hanya form terkirim dengan <code className="font-mono text-sky-300">idUnit</code> 13 digit yang dipakai; nilai NULL menjadi 0. Nilai di luar -20 sampai 20 menghentikan sinkronisasi.
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
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Tahun Sumber EPRIDE
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
                        className="input mt-1.5 normal-case disabled:opacity-50"
                      >
                        <option value="">Pilih tahun</option>
                        {correctionSourcePeriods.map((sourcePeriod) => (
                          <option key={sourcePeriod.year} value={sourcePeriod.year}>
                            {sourcePeriod.year}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      TW Sumber EPRIDE
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
                        className="input mt-1.5 normal-case disabled:opacity-50"
                      >
                        <option value="">Pilih TW</option>
                        {availableCorrectionSourceTws.map((tw) => (
                          <option key={tw} value={tw}>TW{tw}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {correctionSyncPreview && (
                    <div role="status" className="mt-4 space-y-1.5 rounded-xl border border-slate-700 bg-slate-900/60 p-3.5 text-xs text-slate-300">
                      <p className="font-semibold text-emerald-300">
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
                        <div className="mt-3 space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                          <p className="font-semibold text-amber-200">
                            Pilih satu nilai koreksi untuk setiap NIP yang memiliki konflik:
                          </p>
                          {correctionSyncPreview.conflicts.map((conflict) => (
                            <fieldset key={conflict.nip} className="space-y-2">
                              <legend className="font-mono font-semibold text-slate-100">NIP {conflict.nip}</legend>
                              {conflict.candidates.map((candidate) => (
                                <label
                                  key={`${conflict.nip}-${candidate.value}`}
                                  className="flex cursor-pointer gap-2 rounded-lg border border-slate-700 bg-slate-950/40 p-2"
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
                                        className="block break-words text-[11px] text-slate-400"
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

        {/* Navigation Tabs */}
        <div
          role="tablist"
          aria-label="Analisis kinerja"
          className="perf-panel inline-flex flex-wrap gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/75 p-1.5"
        >
          {PERFORMANCE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`performance-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`performance-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/75 hover:text-slate-100'
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

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <section
            id="performance-panel-overview"
            role="tabpanel"
            aria-labelledby="performance-tab-overview"
            className="perf-panel rounded-2xl border border-slate-800 bg-slate-900/75 p-5 sm:p-6"
            aria-busy={isLoading}
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-5">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-bold">Overview Analisis Kinerja</h2>
                  <button
                    type="button"
                    aria-pressed={isOverviewCompareMode}
                    aria-label="Bandingkan periode terpilih dengan periode sebelumnya"
                    onClick={() => setIsOverviewCompareMode((current) => !current)}
                    disabled={!analysis?.dataset}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isOverviewCompareMode
                        ? 'border-sky-400 bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/40'
                        : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4"
                    >
                      <path d="M12 3v18m-8 0h16M4 7h16M5 7l-3 8h6L5 7Zm14 0-3 8h6l-3-8Z" />
                      <path d="M4 15c.8 1 1.8 1.5 3 1.5S9.2 16 10 15m4 0c.8 1 1.8 1.5 3 1.5s2.2-.5 3-1.5" />
                    </svg>
                    <span>Compare QoQ</span>
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {analysis?.dataset
                    ? `Periode ${analysis.dataset.period} · ${numberFormatter.format(analysis.total_employees)} pegawai aktif`
                    : 'Belum ada dataset kinerja yang diunggah.'}
                </p>
              </div>

              {analysis?.dataset && (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                  <label className="block min-w-60 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Unit Eselon II
                    <select
                      value={selectedUnit}
                      onChange={(event) => setSelectedUnit(event.target.value)}
                      className="input mt-1.5 normal-case"
                    >
                      <option value="">Semua Unit Eselon II</option>
                      {analysis.unit_eselon_ii_options.map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block min-w-60 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Unit Eselon III
                    <select
                      value={selectedEselonIII}
                      onChange={(event) => setSelectedEselonIII(event.target.value)}
                      className="input mt-1.5 normal-case"
                    >
                      <option value="">Semua Unit Eselon III</option>
                      {analysis.unit_eselon_iii_options.map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block min-w-60 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Unit Eselon IV
                    <select
                      value={selectedEselonIV}
                      onChange={(event) => setSelectedEselonIV(event.target.value)}
                      className="input mt-1.5 normal-case"
                    >
                      <option value="">Semua Unit Eselon IV</option>
                      {analysis.unit_eselon_iv_options.map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block min-w-52 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Eselon
                    <select
                      value={selectedEselon}
                      onChange={(event) => setSelectedEselon(event.target.value)}
                      className="input mt-1.5 normal-case"
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
              <p role="status" className="perf-subpanel mt-4 rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-400">
                Data untuk triwulan sebelumnya tidak tersedia. Nilai periode terpilih tetap ditampilkan.
              </p>
            )}

            {isLoading && !analysis ? (
              <div className="flex justify-center p-12"><Spinner label="Memuat analisis…" /></div>
            ) : !analysis?.dataset ? (
              <p className="perf-subpanel mt-6 rounded-xl border border-slate-700 bg-slate-950/50 p-6 text-center text-sm text-slate-400">
                Super Admin perlu mengunggah dataset lengkap untuk memulai analisis.
              </p>
            ) : (
              <>
                {/* 4 Executive KPI Cards */}
                <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="perf-kpi-card rounded-2xl border border-slate-700/80 bg-slate-950/45 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Jumlah Pegawai</p>
                    <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-slate-100">
                      {numberFormatter.format(analysis.overview.employee_count)}
                    </p>
                    {isOverviewCompareMode && analysis.previous_period && (
                      <OverviewComparisonDetail
                        comparison={analysis.overview_comparison.employee_count}
                        previousPeriod={analysis.previous_period}
                        formatValue={formatCount}
                      />
                    )}
                  </div>

                  <div className="perf-kpi-card rounded-2xl border border-slate-700/80 bg-slate-950/45 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Jumlah Koreksi (≠ 0)</p>
                    <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-sky-300">
                      {numberFormatter.format(analysis.overview.correction.count)}
                    </p>
                    <p className="mt-1.5 text-xs text-slate-400">
                      <span className="font-mono font-semibold text-emerald-400">
                        +{numberFormatter.format(analysis.overview.correction.positive_count)}
                      </span>{' '}
                      penambahan ·{' '}
                      <span className="font-mono font-semibold text-rose-400">
                        −{numberFormatter.format(analysis.overview.correction.negative_count)}
                      </span>{' '}
                      pengurangan
                    </p>
                    {isOverviewCompareMode && analysis.previous_period && (
                      <div className="mt-1 border-t border-slate-800/80 pt-1">
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
                      </div>
                    )}
                  </div>

                  <div className="perf-kpi-card rounded-2xl border border-slate-700/80 bg-slate-950/45 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Rata-rata Nilai Koreksi</p>
                    <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-slate-100">
                      {formatNumber(analysis.overview.correction.average)}
                    </p>
                    {isOverviewCompareMode && analysis.previous_period && (
                      <OverviewComparisonDetail
                        comparison={analysis.overview_comparison['correction.average']}
                        previousPeriod={analysis.previous_period}
                      />
                    )}
                  </div>

                  <div className="perf-kpi-card rounded-2xl border border-slate-700/80 bg-slate-950/45 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Jumlah Penambahan</p>
                    <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-emerald-300">
                      {numberFormatter.format(analysis.overview.correction.positive_count)}
                    </p>
                    {isOverviewCompareMode && analysis.previous_period && (
                      <OverviewComparisonDetail
                        comparison={analysis.overview_comparison['correction.positive_count']}
                        previousPeriod={analysis.previous_period}
                        formatValue={formatCount}
                      />
                    )}
                  </div>
                </div>

                {/* Visualizations Grid */}
                <div className="mt-6 grid gap-5 xl:grid-cols-2">
                  <div className="perf-subcard min-w-0 rounded-2xl border border-slate-700/80 bg-slate-950/45 p-5">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold">Distribusi NPK</h3>
                      <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-400">
                        Histogram 80–120
                      </span>
                    </div>
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

                  <div className="perf-subcard rounded-2xl border border-slate-700/80 bg-slate-950/45 p-5">
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold">Distribusi Status NKP Akhir</h3>
                      <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-400">
                        Predikat Kinerja
                      </span>
                    </div>
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

                {/* Hukdis & Dampak Strip */}
                <div className="perf-subcard mt-6 rounded-2xl border border-slate-700/80 bg-slate-950/45 p-5">
                  <h3 className="text-sm font-bold">Hukdis dan Dampak Pengurangan</h3>
                  <dl className="mt-3.5 grid gap-4 text-sm sm:grid-cols-3">
                    <div className="perf-subpanel rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                      <dt className="text-xs font-medium text-slate-400">Hukuman Disiplin</dt>
                      <dd className="mt-1 font-mono text-xl font-bold tabular-nums text-rose-300">
                        {numberFormatter.format(analysis.overview.hukdis_count)}
                      </dd>
                      {isOverviewCompareMode && analysis.previous_period && (
                        <OverviewComparisonDetail
                          comparison={analysis.overview_comparison.hukdis_count}
                          previousPeriod={analysis.previous_period}
                          formatValue={formatCount}
                        />
                      )}
                    </div>
                    <div className="perf-subpanel rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                      <dt className="text-xs font-medium text-slate-400">Dampak Pelanggaran Disiplin</dt>
                      <dd className="mt-1 font-mono text-xl font-bold tabular-nums text-amber-300">
                        {numberFormatter.format(analysis.overview.dampak_pelanggaran_count)}
                      </dd>
                      {isOverviewCompareMode && analysis.previous_period && (
                        <OverviewComparisonDetail
                          comparison={analysis.overview_comparison.dampak_pelanggaran_count}
                          previousPeriod={analysis.previous_period}
                          formatValue={formatCount}
                        />
                      )}
                    </div>
                    <div className="perf-subpanel rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                      <dt className="text-xs font-medium text-slate-400">Dampak Perilaku</dt>
                      <dd className="mt-1 font-mono text-xl font-bold tabular-nums text-amber-300">
                        {numberFormatter.format(analysis.overview.dampak_perilaku_count)}
                      </dd>
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

                {/* Insight Text Section */}
                <section className="perf-subcard mt-6 rounded-2xl border border-slate-700/80 bg-slate-950/45 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold">Catatan & Insight Pimpinan</h3>
                      {insight?.updated_at && (
                        <p className="mt-0.5 text-xs text-slate-400">
                          Terakhir diperbarui {formatUploadDate(insight.updated_at)}
                          {insight.updated_by_name ? ` oleh ${insight.updated_by_name}` : ''}
                        </p>
                      )}
                    </div>
                    {canEditPerformance && (
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
                  {canEditPerformance ? (
                    <textarea
                      value={insightDraft}
                      onChange={(event) => {
                        setInsightDraft(event.target.value);
                        setInsightNotice(null);
                      }}
                      disabled={insightLoading || insightBusy}
                      maxLength={10000}
                      rows={5}
                      className="input mt-3 min-h-32 resize-y leading-relaxed"
                      placeholder="Tulis insight atau catatan evaluasi untuk seluruh pengguna…"
                    />
                  ) : (
                    <p className="perf-subpanel mt-3 min-h-16 whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm leading-relaxed text-slate-200">
                      {insightLoading ? 'Memuat insight…' : insight?.content || 'Belum ada insight.'}
                    </p>
                  )}
                </section>
              </>
            )}
          </section>
        )}

        {/* UNIT ESELON II TAB */}
        {activeTab === 'units' && (
          <section
            id="performance-panel-units"
            role="tabpanel"
            aria-labelledby="performance-tab-units"
            className="perf-panel rounded-2xl border border-slate-800 bg-slate-900/75 p-5 sm:p-6"
            aria-busy={isLoading}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">Analisis berdasarkan Unit Eselon II</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Buka hierarki Unit Eselon II dan III untuk meninjau rincian hingga Unit Eselon IV.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <label className="relative block w-60">
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
                    placeholder="Cari nama unit..."
                    className="input h-9 pl-9"
                  />
                </label>
                <div role="group" aria-label="Aksi analisis unit" className="performance-action-toolbar inline-flex items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-950/60 p-1">
                  <button
                    type="button"
                    aria-pressed={isUnitLiteView}
                    onClick={() => setIsUnitLiteView((current) => !current)}
                    title={isUnitLiteView ? 'Matikan Lite View' : 'Aktifkan Lite View'}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                      isUnitLiteView
                        ? 'bg-sky-500/20 text-sky-200'
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
                    className="size-8 rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-4">
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
                    className="size-8 rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-4">
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
                    className="size-8 rounded-lg text-emerald-300 transition hover:bg-slate-800 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {unitExportBusy ? (
                      <Spinner size="sm" />
                    ) : (
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-4">
                        <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13l4 4m0-4-4 4" />
                      </svg>
                    )}
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
              <div className="flex justify-center p-12"><Spinner label="Memuat analisis unit…" /></div>
            ) : !analysis?.dataset ? (
              <p className="perf-subpanel mt-5 rounded-xl border border-slate-700 bg-slate-950/50 p-5 text-sm text-slate-400">
                Belum ada dataset kinerja yang diunggah.
              </p>
            ) : (
              <div
                ref={setUnitTableElement}
                role="region"
                aria-label="Tabel analisis berdasarkan Unit Eselon II"
                tabIndex={0}
                className="mt-5 max-h-[70vh] overflow-auto overscroll-contain rounded-xl border border-slate-700"
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
                  <thead className="perf-table-head sticky top-0 z-20 bg-slate-900/95 text-[11px] uppercase tracking-wider text-slate-300 backdrop-blur-xs">
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
                          className={`relative px-3 py-3.5 ${column.key === 'unit' ? 'perf-table-head sticky left-0 z-10 bg-slate-900' : ''}`}
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
                              className="inline-flex items-center gap-1 text-left font-semibold hover:text-white"
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
                          <tr className="bg-slate-800/45 transition-colors hover:bg-slate-800/75">
                            <td className="perf-sticky-cell-parent sticky left-0 bg-surface-800 px-3 py-3 font-semibold text-slate-100">
                              <button
                                type="button"
                                onClick={() => toggleUnitExpanded(unitKey)}
                                aria-expanded={expanded}
                                disabled={unit.children.length === 0}
                                className="mr-2 inline-flex size-5 items-center justify-center rounded border border-slate-700 bg-slate-900/70 font-mono text-xs text-sky-300 transition hover:border-sky-400 disabled:border-transparent disabled:bg-transparent disabled:text-slate-600"
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
                                <tr className="transition-colors hover:bg-slate-800/45">
                                  <td className="perf-sticky-cell sticky left-0 bg-surface-900 px-3 py-3 pl-9 text-slate-200">
                                    <button
                                      type="button"
                                      onClick={() => toggleUnitExpanded(childKey)}
                                      aria-expanded={childExpanded}
                                      disabled={child.children.length === 0}
                                      className="mr-2 inline-flex size-5 items-center justify-center rounded border border-slate-700 bg-slate-900/70 font-mono text-xs text-sky-300 transition hover:border-sky-400 disabled:border-transparent disabled:bg-transparent disabled:text-slate-600"
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
                                    className="transition-colors hover:bg-slate-800/45"
                                  >
                                    <td className="perf-sticky-cell sticky left-0 bg-surface-900 px-3 py-3 pl-16 text-slate-400">
                                      <span className="mr-1.5 text-slate-600" aria-hidden="true">└</span>
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

        {/* DAFTAR PEGAWAI TAB */}
        {activeTab === 'employees' && (
          <section
            id="performance-panel-employees"
            role="tabpanel"
            aria-labelledby="performance-tab-employees"
            className="perf-panel rounded-2xl border border-slate-800 bg-slate-900/75 p-5 sm:p-6"
            aria-busy={isLoadingRecords}
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">Data Hasil Ekstraksi Pegawai</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Menampilkan seluruh kolom sumber, hasil perhitungan NPK, koreksi, unit, eselon, dan status.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block min-w-64 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Cari Nama atau NIP
                  <input
                    type="search"
                    value={recordSearch}
                    onChange={(event) => {
                      setRecordSearch(event.target.value);
                      setRecordPage(1);
                    }}
                    maxLength={100}
                    className="input mt-1.5 normal-case"
                    placeholder="Masukkan nama atau NIP..."
                  />
                </label>
                <div role="group" aria-label="Aksi daftar pegawai" className="performance-action-toolbar inline-flex items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-950/60 p-1">
                  <button
                    type="button"
                    aria-pressed={isRecordsLiteView}
                    onClick={toggleRecordsLiteView}
                    title={isRecordsLiteView ? 'Matikan Lite View' : 'Aktifkan Lite View'}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                      isRecordsLiteView
                        ? 'bg-sky-500/20 text-sky-200'
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
                    onClick={() => {
                      const defaults = { ...DEFAULT_RECORD_COLUMN_WIDTHS };
                      recordColumnWidthsRef.current = defaults;
                      setRecordColumnWidths(defaults);
                      persistRecordColumnWidths(defaults);
                    }}
                    aria-label="Atur ulang lebar kolom daftar pegawai"
                    title="Atur ulang lebar kolom daftar pegawai"
                    className="size-8 rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-4">
                      <path d="M4 7v5h5M20 17v-5h-5" />
                      <path d="M5.5 12a7 7 0 0 1 12-4.9L20 9m-1.5 3a7 7 0 0 1-12 4.9L4 15" />
                    </svg>
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
                    className="size-8 rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-4">
                      <path d="M4 6h16M7 6l1 14h8l1-14M9 6V4h6v2" />
                      <path d="m10 10 4 4m0-4-4 4" />
                    </svg>
                  </button>
                  {canEditPerformance && (
                    <button
                      type="button"
                      onClick={openBatchCorrection}
                      disabled={!recordData?.period || batchCorrectionBusy}
                      aria-label="Batch input koreksi"
                      title="Batch input koreksi dari file Excel"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-emerald-200 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                        <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
                        <path d="M5 16v4h14v-4" />
                      </svg>
                      <span>Batch input koreksi</span>
                    </button>
                  )}
                  {canEditPerformance && (
                    <button
                      type="button"
                      aria-pressed={isCorrectionLogOpen}
                      onClick={openCorrectionLog}
                      aria-label="Buka Koreksi Edit Log"
                      title="Buka Koreksi Edit Log"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-sky-200 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2M4 5l2-2" />
                      </svg>
                      <span>Koreksi Edit Log</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void exportRecords()}
                    disabled={!recordData?.period || recordsExportBusy}
                    aria-label={recordsExportBusy ? 'Mengekspor daftar pegawai' : 'Unduh daftar pegawai sebagai Excel'}
                    title={recordsExportBusy ? 'Mengekspor daftar pegawai' : 'Unduh daftar pegawai sebagai Excel'}
                    className="size-8 rounded-lg text-emerald-300 transition hover:bg-slate-800 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {recordsExportBusy ? (
                      <Spinner size="sm" />
                    ) : (
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-4">
                        <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13l4 4m0-4-4 4" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {recordsExportError && (
              <p role="alert" className="mt-3 break-words text-sm text-rose-300">{recordsExportError}</p>
            )}
            {recordColumnWidthError && (
              <p role="alert" className="mt-3 break-words text-sm text-amber-300">
                {recordColumnWidthError}
              </p>
            )}
            {performanceCacheWarning && (
              <p role="alert" className="mt-3 break-words text-sm text-amber-300">
                Cache browser: {performanceCacheWarning}
              </p>
            )}
            {recordsFromCache && (
              <p role="status" className="mt-3 text-xs text-slate-400">
                Menampilkan data tersimpan di browser sambil memeriksa pembaruan dari server.
              </p>
            )}
            {correctionEditNotice && (
              <p role="status" className="mt-3 break-words text-sm text-emerald-300">
                {correctionEditNotice}
              </p>
            )}
            {batchCorrectionNotice && (
              <p role="status" className="mt-3 break-words text-sm text-emerald-300">
                {batchCorrectionNotice}
              </p>
            )}
            {recordError && (
              <p role="alert" className="mt-4 break-words text-sm text-rose-300">{recordError}</p>
            )}

            {isLoadingRecords && !recordData ? (
              <div className="flex justify-center p-10"><Spinner label="Memuat tabel data…" /></div>
            ) : !recordData?.period ? (
              <p className="perf-subpanel mt-5 rounded-xl border border-slate-700 bg-slate-950/50 p-5 text-sm text-slate-400">
                Belum ada data yang cocok untuk ditampilkan.
              </p>
            ) : (
              <>
                <div
                  ref={setRecordTableElement}
                  role="region"
                  aria-label="Tabel daftar pegawai"
                  tabIndex={0}
                  className="mt-4 max-h-[70vh] overflow-auto overscroll-contain rounded-xl border border-slate-700"
                >
                  <table
                    style={{
                      width: visibleRecordTableWidth,
                      minWidth: visibleRecordTableWidth,
                      tableLayout: 'fixed',
                    }}
                    className="text-left text-xs"
                  >
                    <colgroup>
                      {visibleRecordColumns.map((column) => (
                        <col
                          key={column.key}
                          style={{ width: recordColumnWidths[column.key] }}
                        />
                      ))}
                    </colgroup>
                    <thead className="perf-table-head sticky top-0 z-20 bg-slate-900/95 text-[11px] uppercase tracking-wider text-slate-300 backdrop-blur-xs">
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
                              className="relative whitespace-nowrap px-3 py-3.5 font-semibold"
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
                              {recordColumnResizeHandle(column)}
                            </th>
                          );
                        })}
                      </tr>
                      <tr className="border-t border-slate-700/80">
                        {visibleRecordColumns.map((column) => {
                          const options = recordData.filter_options[column.key];
                          const range = recordData.numeric_ranges[column.key];
                          if (options) {
                            return (
                              <th key={column.key} className="px-2 py-2">
                                <select
                                  value={recordFilterDrafts[column.key] ?? ''}
                                  onChange={(event) => updateRecordFilter(column.key, event.target.value)}
                                  className="input w-40 px-2 py-1 text-xs font-normal normal-case"
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
                              <th key={column.key} className="min-w-40 px-2 py-2 font-normal normal-case">
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
                                    <span className="font-mono">{formatNumber(selectedMinimum)}</span>
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
                                    <span className="font-mono">{formatNumber(selectedMaximum)}</span>
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
                          <tr key={record.nip} className="transition-colors hover:bg-slate-800/45">
                            {visibleRecordColumns.map((column) => {
                              const isNumeric = NUMERIC_RECORD_COLUMNS.has(column.key);
                              return (
                                <td
                                  key={column.key}
                                  className={`overflow-hidden px-3 py-2.5 text-slate-300 ${
                                    isNumeric || column.key === 'nip' ? 'font-mono tabular-nums' : ''
                                  } ${column.key === 'nama' ? 'font-medium text-slate-100' : ''}`}
                                >
                                  {column.key === 'nilai_koreksi' && canEditPerformance ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (recordData.period) {
                                          openCorrectionEditor(record, recordData.period);
                                        }
                                      }}
                                      aria-label={`Edit Nilai Koreksi ${record.nama}, NIP ${record.nip}`}
                                      title="Klik untuk mengedit Nilai Koreksi"
                                      className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-left font-mono font-semibold text-sky-200 transition hover:bg-sky-500/20 hover:text-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                                    >
                                      <span>{formatRecordValue(record[column.key])}</span>
                                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3">
                                        <path d="m14 5 5 5M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
                                      </svg>
                                    </button>
                                  ) : formatRecordValue(record[column.key])}
                                </td>
                              );
                            })}
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

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 sm:text-sm">
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

      {/* EDIT NILAI KOREKSI PORTAL */}
      {correctionEditTarget && createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !correctionEditBusy) {
              setCorrectionEditTarget(null);
            }
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="correction-edit-title"
            onSubmit={(event) => {
              event.preventDefault();
              void submitCorrectionEdit();
            }}
            className="perf-modal w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 id="correction-edit-title" className="text-lg font-bold text-slate-100">
                  Edit Nilai Koreksi
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  {correctionEditTarget.record.nama} · <span className="font-mono">NIP {correctionEditTarget.record.nip}</span>
                  {' · '}{correctionEditTarget.period}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCorrectionEditTarget(null)}
                disabled={correctionEditBusy}
                aria-label="Tutup editor Nilai Koreksi"
                className="flex size-8 items-center justify-center rounded-xl border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-50"
              >
                ×
              </button>
            </div>
            <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Nilai Koreksi
              <input
                type="number"
                min="-5"
                max="5"
                step="any"
                required
                autoFocus
                value={correctionEditValue}
                onChange={(event) => setCorrectionEditValue(event.target.value)}
                className="input mt-2 w-full font-mono normal-case"
                aria-describedby="correction-edit-range"
              />
            </label>
            <p id="correction-edit-range" className="mt-2 text-xs text-slate-400">
              Nilai harus antara -5 dan 5, termasuk batasnya. Perubahan akan menghitung ulang NKP Akhir.
            </p>
            {correctionEditError && (
              <p role="alert" className="mt-3 text-sm text-rose-300">
                {correctionEditError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => setCorrectionEditTarget(null)}
                disabled={correctionEditBusy}
                className="btn-secondary px-4 py-2 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={correctionEditBusy}
                className="btn-primary px-4 py-2 disabled:cursor-wait disabled:opacity-50"
              >
                {correctionEditBusy
                  ? <Spinner size="sm" label="Menyimpan…" />
                  : 'Simpan'}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}

      {/* BATCH CORRECTION PORTAL */}
      {isBatchCorrectionOpen && createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          onMouseDown={(event) => {
            if (
              event.currentTarget === event.target
              && !batchCorrectionBusy
              && !batchCorrectionTemplateBusy
            ) {
              setIsBatchCorrectionOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="batch-correction-title"
            className="perf-modal w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 id="batch-correction-title" className="text-lg font-bold text-slate-100">
                  Batch Input Koreksi
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Dataset tujuan: <span className="font-mono font-semibold text-sky-300">{recordData?.period ?? '—'}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBatchCorrectionOpen(false)}
                disabled={batchCorrectionBusy || batchCorrectionTemplateBusy}
                aria-label="Tutup batch input koreksi"
                className="flex size-8 items-center justify-center rounded-xl border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-50"
              >
                ×
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <div className="perf-subpanel rounded-xl border border-slate-700 bg-slate-950/50 p-4 text-xs leading-relaxed text-slate-300">
                <p>
                  Unduh template Excel dengan dua kolom: <code className="font-mono text-sky-300">nip</code> dan <code className="font-mono text-sky-300">nilai_koreksi</code>.
                  Isi NIP sebagai teks agar digitnya tetap akurat. NIP dengan awalan apostrof atau backtick juga diterima.
                </p>
                <p className="mt-2 text-slate-400">
                  Semua baris divalidasi sebelum disimpan. Jika ada NIP tidak dikenal, NIP duplikat, atau nilai di luar rentang -5 sampai 5 (eksklusif), tidak ada perubahan yang diterapkan. Setiap koreksi yang berubah masuk ke Koreksi Edit Log.
                </p>
                <button
                  type="button"
                  onClick={() => void downloadBatchCorrectionTemplate()}
                  disabled={batchCorrectionTemplateBusy || batchCorrectionBusy}
                  className="mt-3 rounded-xl border border-sky-500/35 bg-sky-500/15 px-3.5 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/25 disabled:cursor-wait disabled:opacity-50"
                >
                  {batchCorrectionTemplateBusy ? 'Mengunduh template…' : 'Unduh Template Excel'}
                </button>
              </div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                File Excel (.xlsx)
                <input
                  ref={batchCorrectionFileInput}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => {
                    setBatchCorrectionFile(event.target.files?.[0] ?? null);
                    setBatchCorrectionError(null);
                  }}
                  disabled={batchCorrectionBusy}
                  className="input mt-2 w-full normal-case file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-200"
                />
              </label>
              {batchCorrectionFile && (
                <p className="font-mono text-xs text-slate-400">
                  Dipilih: {batchCorrectionFile.name} ({Math.max(1, Math.round(batchCorrectionFile.size / 1024))} KB)
                </p>
              )}
              {batchCorrectionError && (
                <p role="alert" className="whitespace-pre-line text-sm text-rose-300">
                  {batchCorrectionError}
                </p>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => setIsBatchCorrectionOpen(false)}
                disabled={batchCorrectionBusy || batchCorrectionTemplateBusy}
                className="btn-secondary px-4 py-2 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void submitBatchCorrection()}
                disabled={!batchCorrectionFile || batchCorrectionBusy || batchCorrectionTemplateBusy}
                className="btn-primary px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {batchCorrectionBusy ? 'Memproses batch…' : 'Validasi dan Terapkan'}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {/* CORRECTION EDIT LOG PORTAL */}
      {isCorrectionLogOpen && createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && correctionLogActionId === null) {
              setIsCorrectionLogOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="correction-log-title"
            className="perf-modal flex max-h-[90vh] w-full max-w-6xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-800 p-5">
              <div>
                <h2 id="correction-log-title" className="text-lg font-bold text-slate-100">
                  Koreksi Edit Log
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Undo memulihkan nilai sebelum edit yang dipilih dan menghapus edit sesudahnya untuk NIP dan periode yang sama.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCorrectionLogOpen(false)}
                disabled={correctionLogActionId !== null}
                aria-label="Tutup Koreksi Edit Log"
                className="flex size-8 items-center justify-center rounded-xl border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-50"
              >
                ×
              </button>
            </header>
            <div className="min-h-0 overflow-auto p-5">
              {correctionLogNotice && (
                <p role="status" className="mb-3 text-sm text-emerald-300">
                  {correctionLogNotice}
                </p>
              )}
              {correctionLogError && (
                <p role="alert" className="mb-3 text-sm text-rose-300">
                  {correctionLogError}
                </p>
              )}
              {!correctionLogValidated && correctionLogData && (
                <p role="status" className="mb-3 text-xs text-slate-400">
                  Memverifikasi riwayat edit terbaru dari server; Undo dinonaktifkan sampai selesai.
                </p>
              )}
              {correctionLogLoading && !correctionLogData ? (
                <div className="flex justify-center p-8">
                  <Spinner label="Memuat riwayat edit koreksi…" />
                </div>
              ) : correctionLogData?.records.length ? (
                <div className="overflow-auto rounded-xl border border-slate-700">
                  <table className="w-full min-w-[1050px] text-left text-xs">
                    <thead className="perf-table-head sticky top-0 bg-slate-800 text-[11px] uppercase tracking-wider text-slate-300">
                      <tr>
                        <th className="px-3 py-3 font-semibold">Waktu</th>
                        <th className="px-3 py-3 font-semibold">Periode</th>
                        <th className="px-3 py-3 font-semibold">Pegawai</th>
                        <th className="px-3 py-3 font-semibold">NIP</th>
                        <th className="px-3 py-3 font-semibold">Sebelum</th>
                        <th className="px-3 py-3 font-semibold">Sesudah</th>
                        <th className="px-3 py-3 font-semibold">Editor</th>
                        <th className="px-3 py-3 font-semibold">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {correctionLogData.records.map((log) => (
                        <tr key={log.id} className="text-slate-300 transition-colors hover:bg-slate-800/45">
                          <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px]">
                            {new Date(log.edited_at).toLocaleString('id-ID')}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-mono">{log.period}</td>
                          <td className="max-w-56 truncate px-3 py-3 font-medium text-slate-100" title={log.employee_name}>
                            {log.employee_name}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-mono">{log.nip}</td>
                          <td className="whitespace-nowrap px-3 py-3 font-mono tabular-nums">{formatNumber(log.old_value)}</td>
                          <td className="whitespace-nowrap px-3 py-3 font-mono tabular-nums font-semibold text-sky-300">{formatNumber(log.new_value)}</td>
                          <td className="whitespace-nowrap px-3 py-3">
                            {log.edited_by_name} <span className="text-slate-500">({log.edited_by_user})</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <button
                              type="button"
                              onClick={() => void undoCorrectionEdit(log.id)}
                              disabled={
                                !correctionLogValidated
                                || correctionLogLoading
                                || correctionLogActionId !== null
                              }
                              title="Undo edit ini dan seluruh edit berikutnya untuk pegawai dan periode yang sama"
                              className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 font-semibold text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {correctionLogActionId === log.id ? 'Memproses…' : 'Undo dari sini'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : correctionLogLoading ? (
                <div className="flex justify-center p-8">
                  <Spinner label="Memverifikasi riwayat edit koreksi…" />
                </div>
              ) : correctionLogError ? (
                <p className="perf-subpanel rounded-xl border border-slate-700 bg-slate-950/50 p-4 text-sm text-slate-400">
                  Riwayat tidak dapat ditampilkan sampai server berhasil dihubungi.
                </p>
              ) : (
                <p className="perf-subpanel rounded-xl border border-slate-700 bg-slate-950/50 p-4 text-sm text-slate-400">
                  Belum ada riwayat edit Nilai Koreksi.
                </p>
              )}
              {correctionLogData && correctionLogData.total > 0 && (
                <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-400">
                  <span>
                    Halaman {correctionLogData.page} · {correctionLogData.total} edit
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void refreshCorrectionEditLogs(correctionLogPage - 1)}
                      disabled={correctionLogPage <= 1 || correctionLogLoading}
                      className="btn-secondary px-3 py-1.5 disabled:opacity-40"
                    >
                      Sebelumnya
                    </button>
                    <button
                      type="button"
                      onClick={() => void refreshCorrectionEditLogs(correctionLogPage + 1)}
                      disabled={
                        correctionLogPage * correctionLogData.page_size >= correctionLogData.total
                        || correctionLogLoading
                      }
                      className="btn-secondary px-3 py-1.5 disabled:opacity-40"
                    >
                      Berikutnya
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>,
        document.body,
      )}

      {/* UNIT COMPARISON PORTAL */}
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