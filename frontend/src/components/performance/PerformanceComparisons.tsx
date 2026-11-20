import { createPortal } from 'react-dom';
import type {
  PerformanceMetricComparison,
  PerformanceUnitMetrics,
} from '../../types';

const numberFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 2,
});

function formatNumber(value: number | null): string {
  return value === null ? '—' : numberFormatter.format(value);
}

function formatSignedNumber(value: number | null): string {
  if (value === null) return '—';
  return `${value > 0 ? '+' : ''}${numberFormatter.format(value)}`;
}

function unitCorrectionPercentage(metrics: PerformanceUnitMetrics): number {
  if (metrics.employee_count === 0) return 0;
  return (metrics.correction.count / metrics.employee_count) * 100;
}

export function UnitMetricCells({
  metrics,
  liteView,
}: {
  metrics: PerformanceUnitMetrics;
  liteView: boolean;
}) {
  const statusGapCell = (
    <td
      className={`px-3 py-3 ${
        metrics.status_gap_count > 0
          ? 'text-emerald-400'
          : metrics.status_gap_count < 0
            ? 'text-rose-400'
            : ''
      }`}
      title="NKP Akhir Sangat Istimewa dikurangi NKP Perhitungan Sangat Istimewa"
    >
      {numberFormatter.format(metrics.status_gap_count)}
    </td>
  );

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
          <span className="ml-1 text-slate-400">
            ({formatNumber(metrics.nkp_akhir_sangat_istimewa_percentage)}%)
          </span>
        </td>
        {statusGapCell}
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
        {numberFormatter.format(metrics.nkp_perhitungan_sangat_istimewa_count)}
        <span className="ml-1 text-slate-400">
          ({formatNumber(metrics.nkp_perhitungan_sangat_istimewa_percentage)}%)
        </span>
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
        <span className="ml-1 text-slate-400">
          ({formatNumber(metrics.nkp_akhir_sangat_istimewa_percentage)}%)
        </span>
      </td>
      {statusGapCell}
    </>
  );
}

export function OverviewComparisonDetail({
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

const UNIT_COMPARISON_LABELS: Record<string, string> = {
  employee_count: 'Jumlah pegawai',
  average_npk: 'Rata-rata NPK',
  average_nhk: 'Rata-rata NHK',
  average_nkp_awal: 'Rata-rata NKP awal',
  nkp_perhitungan_sangat_istimewa_count: 'NKP perhitungan sangat istimewa · jumlah',
  nkp_perhitungan_sangat_istimewa_percentage: 'NKP perhitungan sangat istimewa · persentase',
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
  status_gap_count: 'Gap status NKP Akhir − NKP Perhitungan · jumlah',
};

function comparisonLabel(key: string): string {
  const [field, status] = key.split('.', 2);
  if (field === 'nkp_perhitungan_status_counts') return `Status NKP Perhitungan · ${status}`;
  if (field === 'nkp_akhir_status_counts') return `Status NKP akhir · ${status}`;
  return UNIT_COMPARISON_LABELS[key] ?? key;
}

export function UnitComparisonDialog({
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

export function UnitComparisonButton({
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
