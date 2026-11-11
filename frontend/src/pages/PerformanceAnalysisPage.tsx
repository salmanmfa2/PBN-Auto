import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as apiClient from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type {
  PerformanceDashboardResponse,
  PerformanceHistogramBin,
  PerformanceInsight,
  PerformanceRecord,
  PerformanceRecordsResponse,
  PerformanceUnitMetrics,
  PerformanceUploadValidation,
} from '../types';
import { Spinner } from '../components/Spinner';

const RECORD_PAGE_SIZE = 50;
const PERFORMANCE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'units', label: 'Unit Eselon II' },
  { id: 'employees', label: 'Daftar Pegawai' },
] as const;
const RECORD_COLUMNS: Array<{ key: keyof PerformanceRecord; label: string }> = [
  { key: 'nama', label: 'Nama' },
  { key: 'nip', label: 'NIP' },
  { key: 'unit_eselon_ii', label: 'Unit Eselon II' },
  { key: 'unit_eselon_iii', label: 'Unit Eselon III' },
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

function currentPeriod(): string {
  const now = new Date();
  return `Q${Math.floor(now.getMonth() / 3) + 1}-${now.getFullYear()}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function Histogram({ bins }: { bins: PerformanceHistogramBin[] }) {
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));
  const chartWidth = 720;
  const chartHeight = 170;
  const left = 28;
  const bottom = 24;
  const plotWidth = chartWidth - left - 12;
  const plotHeight = chartHeight - bottom - 12;
  const slot = plotWidth / bins.length;
  const barWidth = Math.max(1, slot - 2);

  return (
    <div>
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full"
        role="img"
        aria-label="Histogram NPK dari 80 sampai 120 dengan interval 2"
      >
        <line x1={left} y1={plotHeight + 1} x2={chartWidth - 8} y2={plotHeight + 1} stroke="currentColor" opacity="0.35" />
        {bins.map((bin, index) => {
          const height = (bin.count / maxCount) * plotHeight;
          return (
            <rect
              key={bin.start}
              x={left + index * slot + 1}
              y={plotHeight - height + 1}
              width={barWidth}
              height={height}
              rx="1"
              fill="#38bdf8"
            >
              <title>{`${bin.label}: ${bin.count} pegawai`}</title>
            </rect>
          );
        })}
        <text x={left} y={chartHeight - 5} fill="currentColor" fontSize="10">80</text>
        <text x={left + plotWidth / 2} y={chartHeight - 5} fill="currentColor" fontSize="10" textAnchor="middle">100</text>
        <text x={chartWidth - 10} y={chartHeight - 5} fill="currentColor" fontSize="10" textAnchor="end">120</text>
        <text x="8" y="12" fill="currentColor" fontSize="10">{maxCount}</text>
      </svg>
      <p className="text-center text-xs text-slate-400">NPK 80–120 · interval 2 poin</p>
    </div>
  );
}

function StatusDistribution({ counts }: { counts: Record<string, number> }) {
  const maximum = Math.max(1, ...Object.values(counts));
  return (
    <ul className="space-y-3">
      {Object.entries(counts).map(([status, count]) => (
        <li key={status} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3 text-sm">
          <span className="text-slate-300">{status}</span>
          <span className="h-2 overflow-hidden rounded-full bg-slate-800">
            <span
              className="block h-full rounded-full bg-sky-400"
              style={{ width: `${(count / maximum) * 100}%` }}
            />
          </span>
          <span className="text-right font-medium">{numberFormatter.format(count)}</span>
        </li>
      ))}
    </ul>
  );
}

function UnitMetricCells({ metrics }: { metrics: PerformanceUnitMetrics }) {
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

export default function PerformanceAnalysisPage() {
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState<PerformanceDashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'units' | 'employees'>('overview');
  const [expandedUnits, setExpandedUnits] = useState<string[]>([]);
  const [selectedUnit, setSelectedUnit] = useState('');
  const [selectedEselon, setSelectedEselon] = useState('');
  const [recordData, setRecordData] = useState<PerformanceRecordsResponse | null>(null);
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordPage, setRecordPage] = useState(1);
  const [recordSearch, setRecordSearch] = useState('');
  const [recordFilterDrafts, setRecordFilterDrafts] = useState<
    Partial<Record<keyof PerformanceRecord, string>>
  >({});
  const [recordFilters, setRecordFilters] = useState<
    Partial<Record<keyof PerformanceRecord, string>>
  >({});
  const [recordSort, setRecordSort] = useState<{
    key: keyof PerformanceRecord;
    direction: 'asc' | 'desc';
  }>({ key: 'nama', direction: 'asc' });
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

  const [fullFile, setFullFile] = useState<File | null>(null);
  const [fullValidation, setFullValidation] = useState<PerformanceUploadValidation | null>(null);
  const [fullBusy, setFullBusy] = useState(false);
  const [fullError, setFullError] = useState<string | null>(null);
  const [fullNotice, setFullNotice] = useState<string | null>(null);

  const [adjustmentFile, setAdjustmentFile] = useState<File | null>(null);
  const [adjustmentValidation, setAdjustmentValidation] = useState<PerformanceUploadValidation | null>(null);
  const [adjustmentBusy, setAdjustmentBusy] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [adjustmentNotice, setAdjustmentNotice] = useState<string | null>(null);
  const fullFileInput = useRef<HTMLInputElement>(null);
  const adjustmentFileInput = useRef<HTMLInputElement>(null);
  const analysisRequestId = useRef(0);
  const recordFilterTimer = useRef<number | null>(null);
  const recordRequestId = useRef(0);

  const refreshAnalysis = useCallback(async () => {
    const requestId = ++analysisRequestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await apiClient.getPerformanceDashboard(
        selectedUnit,
        selectedEselon ? [selectedEselon] : [],
      );
      if (requestId !== analysisRequestId.current) return;
      setAnalysis(result);
      if (result.dataset) {
        setQuarter(result.dataset.period.slice(0, 2));
        setYear(result.dataset.period.slice(3));
      }
    } catch (loadError) {
      if (requestId === analysisRequestId.current) {
        setError(errorMessage(loadError));
      }
    } finally {
      if (requestId === analysisRequestId.current) setIsLoading(false);
    }
  }, [selectedEselon, selectedUnit]);

  useEffect(() => {
    void refreshAnalysis();
  }, [refreshAnalysis]);

  const refreshRecords = useCallback(async () => {
    const requestId = ++recordRequestId.current;
    setIsLoadingRecords(true);
    setRecordError(null);
    try {
      const result = await apiClient.getPerformanceRecords(
        recordPage,
        RECORD_PAGE_SIZE,
        recordSearch,
        recordFilters,
        recordSort.key,
        recordSort.direction,
      );
      if (requestId === recordRequestId.current) setRecordData(result);
    } catch (loadError) {
      if (requestId === recordRequestId.current) {
        setRecordError(errorMessage(loadError));
      }
    } finally {
      if (requestId === recordRequestId.current) setIsLoadingRecords(false);
    }
  }, [recordFilters, recordPage, recordSearch, recordSort]);

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
    let active = true;
    void apiClient.getPerformanceInsight()
      .then((result) => {
        if (active) {
          setInsight(result);
          setInsightDraft(result.content);
        }
      })
      .catch((loadError: unknown) => {
        if (active) setInsightError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setInsightLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
      setFullValidation(await apiClient.validatePerformanceFullData(fullFile, period));
    } catch (validationError) {
      setFullError(errorMessage(validationError));
    } finally {
      setFullBusy(false);
    }
  };

  const replaceFullData = async () => {
    if (!fullFile || !fullValidation) return;
    if (!window.confirm(`Ganti seluruh dataset aktif dengan ${fullValidation.row_count} baris untuk ${period}?`)) {
      return;
    }
    setFullBusy(true);
    setFullError(null);
    setFullNotice(null);
    try {
      const result = await apiClient.replacePerformanceFullData(fullFile, period);
      const uploadNotes = [
        result.unidentified_count > 0
          ? `${result.unidentified_count} NIP akan dikelompokkan sebagai Unidentified`
          : null,
        result.normalized_penalty_count > 0
          ? `${result.normalized_penalty_count} nilai Hukdis/Dampak disimpan sebagai potongan negatif`
          : null,
      ].filter((note): note is string => note !== null);
      setFullNotice(
        `${result.row_count} pegawai berhasil dimuat untuk ${result.period}.`
        + (uploadNotes.length ? ` Catatan: ${uploadNotes.join('; ')}.` : ''),
      );
      setFullFile(null);
      if (fullFileInput.current) fullFileInput.current.value = '';
      setFullValidation(null);
      await Promise.all([refreshAnalysis(), refreshRecords()]);
    } catch (replaceError) {
      setFullError(errorMessage(replaceError));
    } finally {
      setFullBusy(false);
    }
  };

  const downloadTemplate = async () => {
    setAdjustmentError(null);
    try {
      const blob = await apiClient.downloadPerformanceAdjustmentTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'template-penyesuaian-kinerja.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setAdjustmentError(errorMessage(downloadError));
    }
  };

  const exportUnitAnalysis = async () => {
    setUnitExportBusy(true);
    setUnitExportError(null);
    try {
      const blob = await apiClient.downloadPerformanceUnitAnalysis();
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
      );
      saveExcelFile(blob, `daftar-pegawai-kinerja-${recordData?.period ?? 'data'}.xlsx`);
    } catch (exportError) {
      setRecordsExportError(errorMessage(exportError));
    } finally {
      setRecordsExportBusy(false);
    }
  };

  const updateRecordFilter = (key: keyof PerformanceRecord, value: string) => {
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

  const validateAdjustments = async () => {
    if (!adjustmentFile) return;
    setAdjustmentBusy(true);
    setAdjustmentError(null);
    setAdjustmentNotice(null);
    setAdjustmentValidation(null);
    try {
      setAdjustmentValidation(
        await apiClient.validatePerformanceAdjustments(adjustmentFile, period),
      );
    } catch (validationError) {
      setAdjustmentError(errorMessage(validationError));
    } finally {
      setAdjustmentBusy(false);
    }
  };

  const applyAdjustments = async () => {
    if (!adjustmentFile || !adjustmentValidation) return;
    if (!window.confirm(`Terapkan penyesuaian untuk ${adjustmentValidation.row_count} pegawai pada ${period}?`)) {
      return;
    }
    setAdjustmentBusy(true);
    setAdjustmentError(null);
    setAdjustmentNotice(null);
    try {
      const result = await apiClient.replacePerformanceAdjustments(adjustmentFile, period);
      setAdjustmentNotice(
        `Penyesuaian ${result.row_count} pegawai berhasil diterapkan.`
        + (result.normalized_penalty_count > 0
          ? ` ${result.normalized_penalty_count} nilai Hukdis/Dampak disimpan sebagai potongan negatif.`
          : ''),
      );
      setAdjustmentFile(null);
      if (adjustmentFileInput.current) adjustmentFileInput.current.value = '';
      setAdjustmentValidation(null);
      await Promise.all([refreshAnalysis(), refreshRecords()]);
    } catch (applyError) {
      setAdjustmentError(errorMessage(applyError));
    } finally {
      setAdjustmentBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-surface-900 px-4 pb-14 pt-24 text-slate-100 sm:px-6">
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
              <p className="text-slate-400">Dataset aktif</p>
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

        {error && (
          <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        )}

        {user?.auth_level === 3 && (
          <section className="grid gap-5 lg:grid-cols-2">
            <div className="card p-5">
              <h2 className="font-semibold">Unggah dataset lengkap</h2>
              <p className="mt-1 text-sm text-slate-400">
                Dataset aktif akan diganti setelah validasi berhasil. Gunakan CSV contoh; NIP boleh 16 atau 18 digit.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px]">
                <label className="block text-sm text-slate-300">
                  Periode
                  <select
                    value={quarter}
                    onChange={(event) => {
                      setQuarter(event.target.value);
                      setFullValidation(null);
                      setAdjustmentValidation(null);
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
                    onChange={(event) => {
                      setYear(event.target.value);
                      setFullValidation(null);
                      setAdjustmentValidation(null);
                    }}
                    className="input mt-1.5"
                  />
                </label>
              </div>
              <label className="mt-4 block text-sm text-slate-300">
                File CSV
                <input
                  ref={fullFileInput}
                  type="file"
                  accept=".csv,text/csv"
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
                    Valid: {fullValidation.row_count} pegawai · {fullValidation.period}
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
                    Ganti Dataset Aktif
                  </button>
                )}
              </div>
            </div>

            <div className="card p-5">
              <h2 className="font-semibold">Penyesuaian nilai</h2>
              <p className="mt-1 text-sm text-slate-400">
                Kosongkan sel untuk mempertahankan nilai saat ini. Nilai Hukdis/Dampak positif akan dinormalisasi sebagai potongan negatif.
                Periode harus sama dengan dataset aktif.
              </p>
              <button type="button" onClick={() => void downloadTemplate()} className="btn-secondary mt-4">
                Unduh Template Excel
              </button>
              <label className="mt-4 block text-sm text-slate-300">
                File penyesuaian (.xlsx)
                <input
                  ref={adjustmentFileInput}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => {
                    setAdjustmentFile(event.target.files?.[0] ?? null);
                    setAdjustmentValidation(null);
                    setAdjustmentError(null);
                  }}
                  className="mt-1.5 block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-surface-700 file:px-3 file:py-2 file:text-sm file:text-slate-100"
                />
              </label>
              {adjustmentError && <p role="alert" className="mt-3 break-words text-sm text-rose-300">{adjustmentError}</p>}
              {adjustmentNotice && <p role="status" className="mt-3 text-sm text-emerald-300">{adjustmentNotice}</p>}
              {adjustmentValidation && (
                <div className="mt-3 space-y-1 text-sm">
                  <p role="status" className="text-emerald-300">
                    Valid: {adjustmentValidation.row_count} pegawai · {adjustmentValidation.period}
                  </p>
                  {adjustmentValidation.normalized_penalty_count > 0 && (
                    <p className="text-amber-300">
                      {adjustmentValidation.normalized_penalty_count} nilai Hukdis/Dampak positif akan disimpan sebagai potongan negatif.
                    </p>
                  )}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void validateAdjustments()}
                  disabled={!adjustmentFile || adjustmentBusy}
                  className="btn-secondary"
                >
                  {adjustmentBusy ? <Spinner size="sm" label="Memvalidasi…" /> : 'Validasi Penyesuaian'}
                </button>
                {adjustmentValidation && (
                  <button type="button" onClick={() => void applyAdjustments()} disabled={adjustmentBusy} className="btn-primary">
                    Terapkan Penyesuaian
                  </button>
                )}
              </div>
            </div>
          </section>
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
              className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'border-sky-400 text-sky-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
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
                <h2 className="font-semibold">Overview Analisis Kinerja</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {analysis?.dataset
                    ? `Periode ${analysis.dataset.period} · ${numberFormatter.format(analysis.total_employees)} pegawai`
                    : 'Belum ada dataset kinerja yang diunggah.'}
                </p>
              </div>
              {analysis?.dataset && (
                <div className="grid gap-3 sm:grid-cols-2">
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
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                    <p className="text-sm text-slate-400">Jumlah Koreksi (bukan nol)</p>
                    <p className="mt-2 text-2xl font-semibold">{numberFormatter.format(analysis.overview.correction.count)}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {numberFormatter.format(analysis.overview.correction.positive_count)} penambahan · {numberFormatter.format(analysis.overview.correction.negative_count)} pengurangan
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                    <p className="text-sm text-slate-400">Rata-rata Nilai Koreksi</p>
                    <p className="mt-2 text-2xl font-semibold">{formatNumber(analysis.overview.correction.average)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                    <p className="text-sm text-slate-400">Jumlah Penambahan</p>
                    <p className="mt-2 text-2xl font-semibold">{numberFormatter.format(analysis.overview.correction.positive_count)}</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-5 xl:grid-cols-2">
                  <div className="min-w-0 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                    <h3 className="mb-3 text-sm font-semibold">Distribusi NPK</h3>
                    <Histogram bins={analysis.overview.histogram} />
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                    <h3 className="mb-4 text-sm font-semibold">Distribusi Status NKP Akhir</h3>
                    <StatusDistribution counts={analysis.overview.status_counts} />
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                  <h3 className="text-sm font-semibold">Hukdis dan Dampak</h3>
                  <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-slate-400">Hukuman Disiplin</dt>
                      <dd className="mt-1 text-lg font-semibold">{numberFormatter.format(analysis.overview.hukdis_count)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Dampak Pelanggaran Disiplin</dt>
                      <dd className="mt-1 text-lg font-semibold">{numberFormatter.format(analysis.overview.dampak_pelanggaran_count)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Dampak Perilaku</dt>
                      <dd className="mt-1 text-lg font-semibold">{numberFormatter.format(analysis.overview.dampak_perilaku_count)}</dd>
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
                  Buka baris unit untuk melihat rincian Unit Eselon III. Statistik memakai seluruh dataset aktif.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void exportUnitAnalysis()}
                disabled={!analysis?.dataset || unitExportBusy}
                className="btn-secondary disabled:opacity-50"
              >
                {unitExportBusy ? 'Mengekspor…' : 'Unduh Excel'}
              </button>
            </div>
            {unitExportError && (
              <p role="alert" className="mt-3 break-words text-sm text-rose-300">{unitExportError}</p>
            )}
            {isLoading && !analysis ? (
              <div className="flex justify-center p-10"><Spinner label="Memuat analisis unit…" /></div>
            ) : !analysis?.dataset ? (
              <p className="mt-5 rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-400">
                Belum ada dataset kinerja yang diunggah.
              </p>
            ) : (
              <div className="mt-5 overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full min-w-[2320px] text-left text-xs">
                  <thead className="sticky top-0 bg-slate-900 text-slate-300">
                    <tr>
                      <th className="sticky left-0 z-10 bg-slate-900 px-3 py-3">Unit</th>
                      <th className="px-3 py-3">Pegawai</th>
                      <th className="px-3 py-3">Rata-rata NPK</th>
                      <th className="px-3 py-3">Rata-rata NHK</th>
                      <th className="px-3 py-3">Rata-rata NKP Awal</th>
                      <th className="px-3 py-3">NKP Awal Sangat Istimewa</th>
                      <th className="px-3 py-3">Hukdis</th>
                      <th className="px-3 py-3">Dampak Pelanggaran</th>
                      <th className="px-3 py-3">Dampak Perilaku</th>
                      <th className="px-3 py-3">Koreksi (+/−)</th>
                      <th className="px-3 py-3">Rata-rata Koreksi</th>
                      <th className="px-3 py-3">Maks. Koreksi</th>
                      <th className="px-3 py-3">Min. Koreksi</th>
                      <th className="px-3 py-3">Rata-rata NKP Akhir</th>
                      <th className="px-3 py-3">NKP Akhir Sangat Istimewa</th>
                      <th
                        className="px-3 py-3"
                        title="Jumlah pegawai dengan status akhir yang berbeda dari status awal"
                      >
                        Gap Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {analysis.units.map((unit) => {
                      const expanded = expandedUnits.includes(unit.label);
                      return (
                        <Fragment key={unit.label}>
                          <tr className="bg-slate-800/40 hover:bg-slate-800/70">
                            <td className="sticky left-0 bg-surface-800 px-3 py-3 font-medium">
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedUnits((current) => expanded
                                    ? current.filter((value) => value !== unit.label)
                                    : [...current, unit.label]);
                                }}
                                aria-expanded={expanded}
                                disabled={unit.children.length === 0}
                                className="mr-2 text-sky-300 disabled:text-slate-600"
                                aria-label={`${expanded ? 'Tutup' : 'Buka'} rincian ${unit.label}`}
                              >
                                {expanded ? '−' : '+'}
                              </button>
                              {unit.label}
                            </td>
                            <UnitMetricCells metrics={unit} />
                          </tr>
                          {expanded && unit.children.map((child) => (
                            <tr key={`${unit.label}-${child.label}`} className="hover:bg-slate-800/40">
                              <td className="sticky left-0 bg-surface-900 px-3 py-3 pl-10 text-slate-300">
                                {child.label}
                              </td>
                              <UnitMetricCells metrics={child} />
                            </tr>
                          ))}
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
              <button
                type="button"
                onClick={clearRecordFilters}
                disabled={
                  !recordSearch
                  && !Object.values(recordFilterDrafts).some((value) => value?.trim())
                }
                className="btn-secondary disabled:opacity-50"
              >
                Bersihkan filter
              </button>
              <button
                type="button"
                onClick={() => void exportRecords()}
                disabled={!recordData?.period || recordsExportBusy}
                className="btn-secondary disabled:opacity-50"
              >
                {recordsExportBusy ? 'Mengekspor…' : 'Unduh Excel'}
              </button>
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
                      {RECORD_COLUMNS.map((column) => {
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
                      {RECORD_COLUMNS.map((column) => (
                        <th key={column.key} className="px-2 py-2">
                          <input
                            type="search"
                            value={recordFilterDrafts[column.key] ?? ''}
                            onChange={(event) => updateRecordFilter(column.key, event.target.value)}
                            maxLength={100}
                            className="input w-36 px-2 py-1 text-xs"
                            aria-label={`Filter ${column.label}`}
                            placeholder={`Filter ${column.label}`}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {recordData.records.length ? (
                      recordData.records.map((record) => (
                        <tr key={record.nip} className="hover:bg-slate-800/50">
                          {RECORD_COLUMNS.map((column) => (
                            <td key={column.key} className="max-w-64 px-3 py-2.5 text-slate-300">
                              {formatRecordValue(record[column.key])}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={RECORD_COLUMNS.length} className="px-4 py-8 text-center text-slate-400">
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
    </main>
  );
}
