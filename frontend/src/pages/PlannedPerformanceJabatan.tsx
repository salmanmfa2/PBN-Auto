import { Fragment, useMemo, useState } from 'react';
import type {
  PerformanceMetricComparison,
  PerformanceUnitMetrics,
} from '../types';
import { Spinner } from '../components/Spinner';
import {
  UnitComparisonButton,
  UnitMetricCells,
} from '../components/performance/PerformanceComparisons';

export interface PlannedPerformanceJabatanMetrics extends PerformanceUnitMetrics {
  maximum_nkp_akhir: number | null;
}

export interface PlannedPerformanceJabatanGroup {
  tipe: string;
  jabatans: PlannedPerformanceJabatanMetrics[];
}

export interface PlannedPerformanceJabatanAnalysis {
  dataset: { period: string } | null;
  previous_period: string | null;
  jabatan_data_available: boolean;
  previous_jabatan_data_available: boolean;
  jabatan_groups: PlannedPerformanceJabatanGroup[];
}

export interface PlannedPerformanceJabatanComparison {
  label: string;
  comparison: Record<string, PerformanceMetricComparison>;
  includeMaximumNkpAkhir: true;
}

type JabatanColumnKey =
  | 'jabatan'
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
  | 'maximumNkpAkhir'
  | 'compare';
type JabatanSortKey = Exclude<JabatanColumnKey, 'compare'>;
type JabatanSortState = {
  key: JabatanSortKey;
  direction: 'asc' | 'desc';
} | null;
type JabatanColumnDefinition = {
  key: JabatanColumnKey;
  label: string;
  lite: boolean;
  sortValue?: (metrics: PlannedPerformanceJabatanMetrics) => number | null;
};

const numberFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 2,
});

function correctionPercentage(metrics: PerformanceUnitMetrics): number {
  if (metrics.employee_count === 0) return 0;
  return (metrics.correction.count / metrics.employee_count) * 100;
}

const JABATAN_COLUMN_DEFINITIONS: JabatanColumnDefinition[] = [
  { key: 'jabatan', label: 'Jabatan', lite: true },
  { key: 'employeeCount', label: 'Pegawai', lite: true, sortValue: (metrics) => metrics.employee_count },
  { key: 'averageNpk', label: 'Rata-rata NPK', lite: true, sortValue: (metrics) => metrics.average_npk },
  { key: 'averageNhk', label: 'Rata-rata NHK', lite: false, sortValue: (metrics) => metrics.average_nhk },
  { key: 'averageNkpAwal', label: 'Rata-rata NKP Awal', lite: false, sortValue: (metrics) => metrics.average_nkp_awal },
  { key: 'nkpAwalExceptional', label: 'NKP Perhitungan Sangat Istimewa', lite: false, sortValue: (metrics) => metrics.nkp_perhitungan_sangat_istimewa_count },
  { key: 'hukdis', label: 'Hukdis', lite: false, sortValue: (metrics) => metrics.hukdis_count },
  { key: 'dampakPelanggaran', label: 'Dampak Pelanggaran', lite: false, sortValue: (metrics) => metrics.dampak_pelanggaran_count },
  { key: 'dampakPerilaku', label: 'Dampak Perilaku', lite: false, sortValue: (metrics) => metrics.dampak_perilaku_count },
  { key: 'correction', label: 'Koreksi (+/−)', lite: true, sortValue: (metrics) => metrics.correction.count },
  { key: 'correctionPercentage', label: 'Pemberian Koreksi (%)', lite: true, sortValue: correctionPercentage },
  { key: 'averageCorrection', label: 'Rata-rata Koreksi', lite: false, sortValue: (metrics) => metrics.correction.average },
  { key: 'maximumCorrection', label: 'Maks. Koreksi', lite: false, sortValue: (metrics) => metrics.correction.maximum },
  { key: 'minimumCorrection', label: 'Min. Koreksi', lite: false, sortValue: (metrics) => metrics.correction.minimum },
  { key: 'averageNkpAkhir', label: 'Rata-rata NKP Akhir', lite: true, sortValue: (metrics) => metrics.average_nkp_akhir },
  { key: 'nkpAkhirExceptional', label: 'NKP Akhir Sangat Istimewa', lite: true, sortValue: (metrics) => metrics.nkp_akhir_sangat_istimewa_count },
  { key: 'statusGap', label: 'Gap Status', lite: true, sortValue: (metrics) => metrics.status_gap_count },
  { key: 'maximumNkpAkhir', label: 'Maks. NKP Akhir', lite: true, sortValue: (metrics) => metrics.maximum_nkp_akhir },
  { key: 'compare', label: 'Bandingkan', lite: true },
];

function isSortableJabatanColumn(
  column: JabatanColumnDefinition,
): column is JabatanColumnDefinition & { key: JabatanSortKey } {
  return column.key !== 'compare';
}

function sortJabatanMetrics(
  metrics: PlannedPerformanceJabatanMetrics[],
  sort: JabatanSortState,
): PlannedPerformanceJabatanMetrics[] {
  if (!sort) {
    return [...metrics].sort((left, right) => (
      left.label.localeCompare(right.label, 'id', { sensitivity: 'base' })
    ));
  }
  const direction = sort.direction === 'desc' ? -1 : 1;
  return [...metrics].sort((left, right) => {
    if (sort.key === 'jabatan') {
      return left.label.localeCompare(right.label, 'id', { sensitivity: 'base' }) * direction;
    }
    const column = JABATAN_COLUMN_DEFINITIONS.find((item) => item.key === sort.key);
    const leftValue = column?.sortValue?.(left) ?? null;
    const rightValue = column?.sortValue?.(right) ?? null;
    if (leftValue === null && rightValue !== null) return 1;
    if (leftValue !== null && rightValue === null) return -1;
    if (leftValue !== null && rightValue !== null && leftValue !== rightValue) {
      return (leftValue - rightValue) * direction;
    }
    return left.label.localeCompare(right.label, 'id', { sensitivity: 'base' });
  });
}

export function PlannedPerformanceJabatanTab({
  analysis,
  isLoading,
  exportBusy,
  exportError,
  onExport,
  onCompare,
}: {
  analysis: PlannedPerformanceJabatanAnalysis | null;
  isLoading: boolean;
  exportBusy: boolean;
  exportError: string | null;
  onExport: () => void;
  onCompare: (target: PlannedPerformanceJabatanComparison) => void;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<JabatanSortState>(null);
  const [liteView, setLiteView] = useState(false);
  const visibleColumns = JABATAN_COLUMN_DEFINITIONS.filter(
    (column) => !liteView || column.lite,
  );
  const searchedGroups = useMemo(() => {
    if (!analysis?.jabatan_data_available) return [];
    const query = search.trim().toLocaleLowerCase('id');
    return analysis.jabatan_groups.flatMap((group) => {
      const tipeMatches = !query || group.tipe.toLocaleLowerCase('id').includes(query);
      const jabatans = sortJabatanMetrics(
        group.jabatans.filter((metrics) => (
          tipeMatches || metrics.label.toLocaleLowerCase('id').includes(query)
        )),
        sort,
      );
      return jabatans.length ? [{ ...group, jabatans }] : [];
    });
  }, [analysis?.jabatan_data_available, analysis?.jabatan_groups, search, sort]);

  return (
    <section
      id="planned-performance-panel-jabatan"
      role="tabpanel"
      aria-labelledby="planned-performance-tab-jabatan"
      className="perf-panel rounded-2xl border border-slate-800 bg-slate-900/75 p-5 sm:p-6"
      aria-busy={isLoading}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Analisis berdasarkan Jabatan</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Metrik kinerja per Jabatan, dikelompokkan berdasarkan tipe Unit Kerja.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="relative block w-60">
            <span className="sr-only">Cari tipe Unit Kerja atau Jabatan</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400">
              <circle cx="10.8" cy="10.8" r="6.8" />
              <path d="m16 16 4.5 4.5" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={100}
              aria-label="Cari tipe Unit Kerja atau Jabatan"
              placeholder="Cari Jabatan atau tipe..."
              className="input h-9 pl-9"
            />
          </label>
          <div role="group" aria-label="Aksi analisis Jabatan" className="performance-action-toolbar inline-flex items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-950/60 p-1">
            <button
              type="button"
              aria-pressed={liteView}
              onClick={() => setLiteView((current) => !current)}
              title={liteView ? 'Matikan Lite View' : 'Aktifkan Lite View'}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                liteView
                  ? 'bg-sky-500/20 text-sky-200'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>Lite View</span>
              <span className="sr-only">{liteView ? 'aktif' : 'nonaktif'}</span>
            </button>
            <button
              type="button"
              onClick={onExport}
              disabled={!analysis?.jabatan_data_available || exportBusy}
              aria-label={exportBusy ? 'Mengekspor analisis Jabatan' : 'Unduh analisis Jabatan sebagai Excel'}
              title={
                !analysis?.jabatan_data_available
                  ? 'Snapshot Jabatan tidak tersedia untuk periode ini'
                  : exportBusy
                    ? 'Mengekspor analisis Jabatan'
                    : 'Unduh analisis Jabatan sebagai Excel'
              }
              className="size-8 rounded-lg text-emerald-300 transition hover:bg-slate-800 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {exportBusy ? (
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
      {exportError && (
        <p role="alert" className="mt-3 break-words text-sm text-rose-300">{exportError}</p>
      )}
      {isLoading && !analysis ? (
        <div className="flex justify-center p-12"><Spinner label="Memuat analisis Jabatan..." /></div>
      ) : !analysis?.dataset ? (
        <p className="perf-subpanel mt-5 rounded-xl border border-slate-700 bg-slate-950/50 p-5 text-sm text-slate-400">
          Belum ada dataset kinerja yang diunggah.
        </p>
      ) : !analysis.jabatan_data_available ? (
        <p role="status" className="perf-subpanel mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-200">
          Snapshot Jabatan dan tipe Unit Kerja belum tersedia untuk periode {analysis.dataset.period}. Unggah ulang periode ini untuk mengaktifkan analisis Jabatan.
        </p>
      ) : (
        <>
          {analysis.previous_period && !analysis.previous_jabatan_data_available && (
            <p role="status" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
              Periode sebelumnya ({analysis.previous_period}) belum memiliki snapshot Jabatan dan tipe Unit Kerja. Unggah ulang periode tersebut untuk mengaktifkan perbandingan.
            </p>
          )}
          <div
            role="region"
            aria-label="Tabel analisis berdasarkan Jabatan dan tipe Unit Kerja"
            tabIndex={0}
            className="mt-5 max-h-[70vh] overflow-auto overscroll-contain rounded-xl border border-slate-700"
          >
            <table className="w-full min-w-max text-left text-xs">
              <thead className="perf-table-head sticky top-0 z-20 bg-slate-900/95 text-[11px] uppercase tracking-wider text-slate-300 backdrop-blur-xs">
                <tr>
                  {visibleColumns.map((column) => (
                    <th
                      key={column.key}
                      aria-sort={
                        isSortableJabatanColumn(column) && sort?.key === column.key
                          ? sort.direction === 'asc' ? 'ascending' : 'descending'
                          : 'none'
                      }
                      className={`px-3 py-3.5 ${column.key === 'jabatan' ? 'perf-table-head sticky left-0 z-10 bg-slate-900' : ''}`}
                    >
                      {isSortableJabatanColumn(column) ? (
                        <button
                          type="button"
                          onClick={() => {
                            const { key } = column;
                            setSort((current) => ({
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
                            {sort?.key === column.key
                              ? sort.direction === 'asc' ? '↑' : '↓'
                              : '↕'}
                          </span>
                        </button>
                      ) : column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {searchedGroups.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="px-3 py-8 text-center text-slate-400">
                      {search.trim()
                        ? 'Tidak ada Jabatan atau tipe Unit Kerja yang cocok dengan pencarian.'
                        : 'Tidak ada Jabatan untuk ditampilkan.'}
                    </td>
                  </tr>
                ) : searchedGroups.map((group) => (
                  <Fragment key={group.tipe}>
                    <tr className="bg-slate-800/45">
                      <th
                        scope="rowgroup"
                        colSpan={visibleColumns.length}
                        className="px-3 py-2.5 text-left font-semibold text-sky-200"
                      >
                        <span>Tipe Unit Kerja · {group.tipe}</span>
                        <span className="ml-2 font-normal text-slate-400">
                          ({numberFormatter.format(group.jabatans.reduce(
                            (total, metrics) => total + metrics.employee_count,
                            0,
                          ))} pegawai)
                        </span>
                      </th>
                    </tr>
                    {group.jabatans.map((metrics) => (
                      <tr
                        key={JSON.stringify([group.tipe, metrics.label])}
                        className="transition-colors hover:bg-slate-800/45"
                      >
                        <td className="perf-sticky-cell sticky left-0 bg-surface-900 px-3 py-3 font-medium text-slate-200">
                          {metrics.label}
                        </td>
                        <UnitMetricCells metrics={metrics} liteView={liteView} />
                        <td className="px-3 py-3 font-mono font-semibold tabular-nums text-sky-200">
                          {metrics.maximum_nkp_akhir === null
                            ? '—'
                            : numberFormatter.format(metrics.maximum_nkp_akhir)}
                        </td>
                        <td className="px-3 py-3">
                          <UnitComparisonButton
                            unit={`${metrics.label} · ${group.tipe}`}
                            disabled={
                              !analysis.previous_period
                              || !analysis.previous_jabatan_data_available
                            }
                            onClick={() => onCompare({
                              label: `${group.tipe} · ${metrics.label}`,
                              comparison: metrics.comparison,
                              includeMaximumNkpAkhir: true,
                            })}
                          />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
