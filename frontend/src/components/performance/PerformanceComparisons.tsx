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
  const statusGapBadge =
    metrics.status_gap_count > 0
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : metrics.status_gap_count < 0
        ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
        : 'border-slate-700/70 bg-slate-800/40 text-slate-400';

  const statusGapCell = (
    <td
      className="px-3 py-3 font-mono tabular-nums"
      title="NKP Akhir Sangat Istimewa dikurangi NKP Perhitungan Sangat Istimewa"
    >
      <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusGapBadge}`}>
        {metrics.status_gap_count > 0 ? `+${numberFormatter.format(metrics.status_gap_count)}` : numberFormatter.format(metrics.status_gap_count)}
      </span>
    </td>
  );

  if (liteView) {
    return (
      <>
        <td className="px-3 py-3 font-mono tabular-nums">{numberFormatter.format(metrics.employee_count)}</td>
        <td className="px-3 py-3 font-mono tabular-nums">{formatNumber(metrics.average_npk)}</td>
        <td className="px-3 py-3 font-mono tabular-nums">
          <span className="font-semibold text-slate-100">{numberFormatter.format(metrics.correction.count)}</span>
          <span className="ml-1.5 text-[11px] text-slate-400">
            (<span className="text-emerald-400">+{numberFormatter.format(metrics.correction.positive_count)}</span> /{' '}
            <span className="text-rose-400">−{numberFormatter.format(metrics.correction.negative_count)}</span>)
          </span>
        </td>
        <td className="px-3 py-3 font-mono tabular-nums">{formatNumber(unitCorrectionPercentage(metrics))}%</td>
        <td className="px-3 py-3 font-mono font-semibold tabular-nums text-sky-300">{formatNumber(metrics.average_nkp_akhir)}</td>
        <td className="px-3 py-3 font-mono tabular-nums">
          <span>{numberFormatter.format(metrics.nkp_akhir_sangat_istimewa_count)}</span>
          <span className="ml-1 text-[11px] text-slate-400">
            ({formatNumber(metrics.nkp_akhir_sangat_istimewa_percentage)}%)
          </span>
        </td>
        {statusGapCell}
      </>
    );
  }

  return (
    <>
      <td className="px-3 py-3 font-mono tabular-nums">{numberFormatter.format(metrics.employee_count)}</td>
      <td className="px-3 py-3 font-mono tabular-nums">{formatNumber(metrics.average_npk)}</td>
      <td className="px-3 py-3 font-mono tabular-nums">{formatNumber(metrics.average_nhk)}</td>
      <td className="px-3 py-3 font-mono tabular-nums">{formatNumber(metrics.average_nkp_awal)}</td>
      <td className="px-3 py-3 font-mono tabular-nums">
        <span>{numberFormatter.format(metrics.nkp_perhitungan_sangat_istimewa_count)}</span>
        <span className="ml-1 text-[11px] text-slate-400">
          ({formatNumber(metrics.nkp_perhitungan_sangat_istimewa_percentage)}%)
        </span>
      </td>
      <td className="px-3 py-3 font-mono tabular-nums">{numberFormatter.format(metrics.hukdis_count)}</td>
      <td className="px-3 py-3 font-mono tabular-nums">{numberFormatter.format(metrics.dampak_pelanggaran_count)}</td>
      <td className="px-3 py-3 font-mono tabular-nums">{numberFormatter.format(metrics.dampak_perilaku_count)}</td>
      <td className="px-3 py-3 font-mono tabular-nums">
        <span className="font-semibold text-slate-100">{numberFormatter.format(metrics.correction.count)}</span>
        <span className="ml-1.5 text-[11px] text-slate-400">
          (<span className="text-emerald-400">+{numberFormatter.format(metrics.correction.positive_count)}</span> /{' '}
          <span className="text-rose-400">−{numberFormatter.format(metrics.correction.negative_count)}</span>)
        </span>
      </td>
      <td className="px-3 py-3 font-mono tabular-nums">{formatNumber(unitCorrectionPercentage(metrics))}%</td>
      <td className="px-3 py-3 font-mono tabular-nums">{formatNumber(metrics.correction.average)}</td>
      <td className="px-3 py-3 font-mono tabular-nums">{formatNumber(metrics.correction.maximum)}</td>
      <td className="px-3 py-3 font-mono tabular-nums">{formatNumber(metrics.correction.minimum)}</td>
      <td className="px-3 py-3 font-mono font-semibold tabular-nums text-sky-300">{formatNumber(metrics.average_nkp_akhir)}</td>
      <td className="px-3 py-3 font-mono tabular-nums">
        <span>{numberFormatter.format(metrics.nkp_akhir_sangat_istimewa_count)}</span>
        <span className="ml-1 text-[11px] text-slate-400">
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
  const isPositive = comparison.delta !== null && comparison.delta > 0;
  const isNegative = comparison.delta !== null && comparison.delta < 0;
  const changeColor = isPositive
    ? 'text-emerald-400'
    : isNegative
      ? 'text-rose-400'
      : 'text-slate-400';
  const arrow = isPositive ? '▲' : isNegative ? '▼' : '•';
  const percentage = comparison.percentage_change === null
    ? ' (—%)'
    : ` (${formatSignedNumber(comparison.percentage_change)}%)`;

  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-slate-400">
      <span>
        {label ? `${label} · ` : ''}
        {previousPeriod}: <span className="font-mono text-slate-300">{formatValue(comparison.previous)}</span>
      </span>
      <span className={`inline-flex items-center gap-0.5 font-mono font-semibold ${changeColor}`}>
        <span aria-hidden="true" className="text-[10px]">{arrow}</span>
        <span>Δ {formatSignedNumber(comparison.delta)}{percentage}</span>
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
  correction_percentage: 'Pemberian Koreksi (%)',
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
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
        <header className="mb-4 flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="performance-comparison-title" className="text-lg font-bold text-slate-100">
                Perbandingan Kinerja · {label}
              </h2>
              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-sky-300">
                {currentPeriod} vs {previousPeriod}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Persentase tidak tersedia jika nilai pada periode sebelumnya bernilai nol.
            </p>
          </div>
          <div className="performance-comparison-no-print flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              aria-label="Cetak atau simpan perbandingan sebagai PDF"
              title="Cetak atau simpan sebagai PDF"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-sky-500/35 bg-sky-500/10 px-3 text-xs font-medium text-sky-200 transition hover:bg-sky-500/20"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                <path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <path d="M7 14h10v7H7zM17 11h.01" />
              </svg>
              <span className="hidden sm:inline">Cetak / PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup perbandingan"
              className="flex size-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-white"
            >
              ×
            </button>
          </div>
        </header>
        <div className="performance-comparison-scroll max-h-[70vh] overflow-auto rounded-xl border border-slate-700">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-800/95 text-xs uppercase tracking-wider text-slate-300 backdrop-blur-xs">
              <tr>
                <th className="px-4 py-3">Metrik</th>
                <th className="px-4 py-3">{currentPeriod}</th>
                <th className="px-4 py-3">{previousPeriod}</th>
                <th className="px-4 py-3">Perubahan</th>
                <th className="px-4 py-3">Perubahan %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {Object.entries(comparison).map(([key, values]) => {
                const isCorrectionPercentage = key === 'correction_percentage';
                return (
                  <tr key={key} className="text-slate-300 transition-colors hover:bg-slate-800/45">
                    <td className="px-4 py-2.5 font-medium text-slate-200">{comparisonLabel(key)}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums font-semibold text-slate-100">
                      {formatNumber(values.current)}{isCorrectionPercentage && values.current !== null ? '%' : ''}
                    </td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-slate-400">
                      {formatNumber(values.previous)}{isCorrectionPercentage && values.previous !== null ? '%' : ''}
                    </td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">
                      {formatSignedNumber(values.delta)}{isCorrectionPercentage && values.delta !== null ? ' pp' : ''}
                    </td>
                    <td
                      className={`px-4 py-2.5 font-mono tabular-nums font-semibold ${
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
                );
              })}
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
      className="inline-flex size-8 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300 transition hover:bg-sky-500/20 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-35"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
        <path d="M4 19V5m0 14h16" />
        <path d="M8 15v-3m4 3V7m4 8v-5" />
      </svg>
    </button>
  );
}