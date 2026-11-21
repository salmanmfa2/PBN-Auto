import type {
  PerformanceDashboardResponse,
  PerformanceRecord,
  PerformanceUnitMetrics,
} from '../types';

export type UnitSortKey =
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
  | 'statusGap';

export type UnitSortState = {
  key: UnitSortKey;
  direction: 'asc' | 'desc';
} | null;

export const numberFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 2,
});

export function unitCorrectionPercentage(metrics: PerformanceUnitMetrics): number {
  if (metrics.employee_count === 0) return 0;
  return (metrics.correction.count / metrics.employee_count) * 100;
}

export function unitSortValue(
  metrics: PerformanceUnitMetrics,
  key: UnitSortKey,
): number | null {
  switch (key) {
    case 'employeeCount': return metrics.employee_count;
    case 'averageNpk': return metrics.average_npk;
    case 'averageNhk': return metrics.average_nhk;
    case 'averageNkpAwal': return metrics.average_nkp_awal;
    case 'nkpAwalExceptional': return metrics.nkp_perhitungan_sangat_istimewa_count;
    case 'hukdis': return metrics.hukdis_count;
    case 'dampakPelanggaran': return metrics.dampak_pelanggaran_count;
    case 'dampakPerilaku': return metrics.dampak_perilaku_count;
    case 'correction': return metrics.correction.count;
    case 'correctionPercentage': return unitCorrectionPercentage(metrics);
    case 'averageCorrection': return metrics.correction.average;
    case 'maximumCorrection': return metrics.correction.maximum;
    case 'minimumCorrection': return metrics.correction.minimum;
    case 'averageNkpAkhir': return metrics.average_nkp_akhir;
    case 'nkpAkhirExceptional': return metrics.nkp_akhir_sangat_istimewa_count;
    case 'statusGap': return metrics.status_gap_count;
  }
}

export function sortUnitMetrics<T extends PerformanceUnitMetrics>(
  metrics: T[],
  sort: UnitSortState,
): T[] {
  const direction = sort?.direction === 'desc' ? -1 : 1;
  return [...metrics].sort((left, right) => {
    const leftValue = sort ? unitSortValue(left, sort.key) : left.unit_kerja_id;
    const rightValue = sort ? unitSortValue(right, sort.key) : right.unit_kerja_id;
    if (leftValue === null && rightValue !== null) return 1;
    if (leftValue !== null && rightValue === null) return -1;
    if (leftValue !== null && rightValue !== null && leftValue !== rightValue) {
      return (leftValue - rightValue) * direction;
    }
    if (left.unit_kerja_id === null && right.unit_kerja_id !== null) return 1;
    if (left.unit_kerja_id !== null && right.unit_kerja_id === null) return -1;
    if (
      left.unit_kerja_id !== null
      && right.unit_kerja_id !== null
      && left.unit_kerja_id !== right.unit_kerja_id
    ) {
      return left.unit_kerja_id - right.unit_kerja_id;
    }
    return left.label.localeCompare(right.label, 'id', { sensitivity: 'base' });
  });
}

export function sortUnitHierarchy(
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

export function filterUnitHierarchyBySearch(
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

export function isRecordColumnKey(value: string): value is keyof PerformanceRecord {
  return [
    'nama', 'nip', 'unit_eselon_ii', 'unit_eselon_iii', 'unit_eselon_iv',
    'eselon', 'nhk', 'npk', 'nhk_kalibrasi', 'npk_kalibrasi', 'nkp_awal',
    'rating_hasil_kerja_awal', 'rating_perilaku_kerja_awal',
    'predikat_kinerja_awal', 'nilai_hukuman_disiplin',
    'nilai_dampak_pelanggaran_disiplin', 'nilai_dampak_perilaku',
    'nilai_koreksi', 'nko', 'nkp_perhitungan', 'status_nkp_perhitungan',
    'nkp_akhir', 'rating_hasil_kerja', 'rating_perilaku_kerja',
    'predikat_kinerja', 'status',
  ].includes(value);
}

export function makeRecordsCacheKey(
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

export function formatLoadTime(milliseconds: number): string {
  return milliseconds < 1000
    ? `${Math.round(milliseconds)} ms`
    : `${(milliseconds / 1000).toFixed(1)} dtk`;
}

export function currentPeriod(): string {
  const now = new Date();
  return `Q${Math.floor(now.getMonth() / 3) + 1}-${now.getFullYear()}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatNumber(value: number | null): string {
  return value === null ? '—' : numberFormatter.format(value);
}

export function formatCount(value: number | null): string {
  return value === null ? '—' : numberFormatter.format(value);
}

export function formatRecordValue(value: string | number | null): string {
  if (typeof value === 'number') return formatNumber(value);
  return value || '—';
}

export function formatUploadDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}
