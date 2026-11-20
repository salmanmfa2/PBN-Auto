import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as apiClient from '../services/api';
import { useDataset } from '../hooks/useDataset';
import { UploadZone } from '../features/upload/UploadZone';
import { StoredRuns } from '../features/upload/StoredRuns';
import { ColumnManager } from '../features/cleaning/ColumnManager';
import { DuplicateRemover } from '../features/cleaning/DuplicateRemover';
import { DataTable } from '../features/cleaning/DataTable';
import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';
import { useMenuAccess } from '../contexts/MenuAccessContext';

const SIDEBAR_DEFAULT_WIDTH = 304;
const SIDEBAR_MIN_WIDTH = 264;
const SIDEBAR_MAX_WIDTH = 560;

function ActionTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-100 opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

interface StagedPowerPoint {
  id: number;
  label: string;
  file: Blob;
}

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const { canEdit } = useMenuAccess();
  const canEditAnalytics = canEdit('analytics');
  const {
    status, preview, error, uploadProgress, dupStats,
    clearError, reset, upload, saveRunName, restoreRun, deleteRun, refreshStoredRuns,
    applyRemoveColumns, applyRenameColumns, applyRemoveDuplicates, deleteRows,
    useFirstRowAsHeader, applyAutoClean, selectSheet,
    runName, setRunName, activeAutoCleanMode, storedRuns, isLoadingHistory, historyError,
    cleaningRecommendation, recommendationStatus, recommendationError,
  } = useDataset();

  const [firstCount, setFirstCount] = useState('');
  const [lastCount, setLastCount] = useState('');
  const [customRow, setCustomRow] = useState('');
  const [autoCleanMode, setAutoCleanMode] = useState('PBN Open');
  const [activeGuide, setActiveGuide] = useState<'pbn' | 'sitasi' | null>(null);
  const [tableFilters, setTableFilters] = useState<Record<string, string[]>>({});
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(true);
  const [showUploadInWorkspace, setShowUploadInWorkspace] = useState(false);
  const [copiedDatasetId, setCopiedDatasetId] = useState(false);
  const [sitasiEsiiiTemplate, setSitasiEsiiiTemplate] = useState<'standard' | 'three-row'>('standard');
  const [stagedPowerPoints, setStagedPowerPoints] = useState<StagedPowerPoint[]>([]);
  const [isStagingCollapsed, setIsStagingCollapsed] = useState(false);
  const [isStagingPowerPoint, setIsStagingPowerPoint] = useState(false);
  const [isCombiningPowerPoints, setIsCombiningPowerPoints] = useState(false);
  const [powerPointStagingError, setPowerPointStagingError] = useState<string | null>(null);
  const [isGeneratingBahanBaperjakat, setIsGeneratingBahanBaperjakat] = useState(false);
  const [bahanBaperjakatError, setBahanBaperjakatError] = useState<string | null>(null);
  const nextStagedPowerPointId = useRef(1);

  const autoCleanOptions = [
    'PBN Open',
    'PBN Open + Edu',
    'PBN Open + Edu + HB',
    'Sitasi Pelaksana',
    'Sitasi Es.IV',
    'Sitasi Es.III',
  ];

  useEffect(() => {
    if (!activeGuide) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveGuide(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeGuide]);

  const handleCopyDatasetId = () => {
    if (!preview) return;
    void navigator.clipboard?.writeText(preview.dataset_id);
    setCopiedDatasetId(true);
    window.setTimeout(() => setCopiedDatasetId(false), 1500);
  };

  const handleDownloadCsv = () => {
    if (!preview) return;
    apiClient.downloadCsv(preview.dataset_id, preview.selected_sheet, tableFilters);
  };

  const handleDownloadExcel = () => {
    if (!preview) return;
    apiClient.downloadExcel(preview.dataset_id, preview.selected_sheet, tableFilters);
  };

  const handleDownloadPowerPoint = () => {
    if (!preview || !activeAutoCleanMode) return;
    apiClient.downloadPowerPoint(
      preview.dataset_id,
      activeAutoCleanMode,
      preview.selected_sheet,
      tableFilters,
      sitasiEsiiiTemplate,
    );
  };

  const handleStagePowerPoint = async () => {
    if (!preview || !activeAutoCleanMode) return;
    setPowerPointStagingError(null);
    setIsStagingPowerPoint(true);
    try {
      const file = await apiClient.generatePowerPoint(
        preview.dataset_id,
        activeAutoCleanMode,
        preview.selected_sheet,
        tableFilters,
        sitasiEsiiiTemplate,
      );
      const filterLabel = Object.entries(tableFilters)
        .map(([column, values]) => `${column}: ${values.join(', ')}`)
        .join(' · ');
      const templateLabel = activeAutoCleanMode === 'Sitasi Es.III'
        ? sitasiEsiiiTemplate === 'three-row'
          ? ' · 3-row template'
          : ' · 4-row template'
        : activeAutoCleanMode === 'Sitasi Es.IV'
          ? ' · 6 people per slide (default template)'
          : '';
      const id = nextStagedPowerPointId.current++;
      setStagedPowerPoints((staged) => [
        ...staged,
        {
          id,
          label: `${activeAutoCleanMode}${templateLabel}${filterLabel ? ` · ${filterLabel}` : ' · No filters'}`,
          file,
        },
      ]);
      setIsStagingCollapsed(false);
    } catch (stageError) {
      setPowerPointStagingError((stageError as Error).message);
    } finally {
      setIsStagingPowerPoint(false);
    }
  };

  const handleGenerateBahanBaperjakat = async () => {
    if (!preview || activeAutoCleanMode !== 'Sitasi Es.III') return;

    const categoryColumn = preview.columns.find((column) => column.trim().toLowerCase() === 'kategori');
    if (!categoryColumn) {
      setBahanBaperjakatError('Kolom Kategori tidak ditemukan pada sheet yang dipilih.');
      return;
    }

    setBahanBaperjakatError(null);
    setIsGeneratingBahanBaperjakat(true);
    const filtersWithoutCategory = Object.fromEntries(
      Object.entries(tableFilters).filter(([column]) => column.trim().toLowerCase() !== 'kategori'),
    );
    try {
      const presentation = await apiClient.generateBaperjakatPowerPoint(
        preview.dataset_id,
        preview.selected_sheet,
        filtersWithoutCategory,
      );
      apiClient.downloadCombinedPowerPoint(presentation, 'bahan_baperjakat.pptx');
    } catch (generationError) {
      setBahanBaperjakatError(
        generationError instanceof Error ? generationError.message : String(generationError),
      );
    } finally {
      setIsGeneratingBahanBaperjakat(false);
    }
  };

  const handleCombinePowerPoints = async () => {
    setPowerPointStagingError(null);
    setIsCombiningPowerPoints(true);
    try {
      const combinedFile = await apiClient.combinePowerPoints(
        stagedPowerPoints.map((staged) => staged.file),
      );
      apiClient.downloadCombinedPowerPoint(combinedFile);
    } catch (combineError) {
      setPowerPointStagingError((combineError as Error).message);
    } finally {
      setIsCombiningPowerPoints(false);
    }
  };

  const moveStagedPowerPoint = (index: number, offset: -1 | 1) => {
    setStagedPowerPoints((staged) => {
      const next = [...staged];
      const target = index + offset;
      if (target < 0 || target >= next.length) return staged;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const isBusy = status === 'uploading' || status === 'cleaning';
  const hasData = !!preview;
  const canDownloadProfiles = activeAutoCleanMode === 'Sitasi Es.III' || activeAutoCleanMode === 'Sitasi Es.IV';
  const activeFilterCount = Object.keys(tableFilters).length;
  const isApplicableCleanMode = [
    'PBN Open',
    'PBN Open + Edu',
    'PBN Open + Edu + HB',
    'Sitasi Es.IV',
    'Sitasi Es.III',
  ].includes(autoCleanMode);

  const maxSidebarWidth = Math.max(
    SIDEBAR_MIN_WIDTH,
    Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth * 0.5),
  );
  const resizeSidebar = (width: number) => {
    setSidebarWidth(Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), maxSidebarWidth));
  };

  const handleColumnFilter = (column: string, values: string[]) => {
    setTableFilters((prev) => ({ ...prev, [column]: values }));
  };

  const handleClearColumnFilter = (column: string) => {
    setTableFilters((prev) => {
      const next = { ...prev };
      delete next[column];
      return next;
    });
  };

  const handleResetFilters = () => setTableFilters({});

  const parsedFirst = Number(firstCount);
  const parsedLast = Number(lastCount);
  const parsedCustom = Number(customRow);

  return (
    <div className="analytics-page flex min-h-screen flex-col bg-surface-950 text-slate-100 lg:h-screen lg:overflow-hidden">
      {/* Workbench Header */}
      <header className="ana-header shrink-0 border-b border-slate-800 bg-slate-900/95 px-4 pb-3 pt-[4.5rem] backdrop-blur-xs sm:px-6 xl:pr-[360px] xl:pt-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              aria-label="Kembali ke menu utama"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-1.5 text-xs font-medium text-brand-300 transition hover:bg-slate-800 hover:text-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                <path d="M19 12H5m0 0 6 6m-6-6 6-6" />
              </svg>
              <span>Menu utama</span>
            </button>

            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen((open) => !open)}
              aria-expanded={isMobileSidebarOpen}
              aria-label="Toggle panel alat"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-800 lg:hidden"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-3.5">
                <path d="M4 6h16M4 12h10M4 18h14" />
              </svg>
              <span>{isMobileSidebarOpen ? 'Sembunyikan Panel' : 'Panel Alat'}</span>
            </button>

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-500/30 bg-brand-500/15 text-brand-300">
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight">PBN Analytics</h1>
                <span className="hidden rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-300 sm:inline-block">
                  Cleaner &amp; PPTX Studio
                </span>
              </div>
              <p className="hidden text-xs text-slate-400 sm:block">
                Upload · Clean · Export · Visualize · Analysis
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!hasData && (
              <div className="hidden items-center gap-2 md:flex">
                <button
                  type="button"
                  onClick={() => setActiveGuide('pbn')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-brand-500/50 hover:text-brand-200"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 text-brand-400">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M9.5 9a2.5 2.5 0 0 1 4.8.8c0 1.7-2.3 2.2-2.3 3.7M12 17h.01" />
                  </svg>
                  <span>Panduan PBN Open</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveGuide('sitasi')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-brand-500/50 hover:text-brand-200"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 text-sky-400">
                    <path d="M7 3h8l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
                    <path d="M15 3v5h5M9 13h6M9 17h4" />
                  </svg>
                  <span>Panduan PPT SITASI</span>
                </button>
              </div>
            )}

            {hasData && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {activeAutoCleanMode && (
                  <span className="rounded-full border border-sky-500/35 bg-sky-500/15 px-2.5 py-1 font-semibold text-sky-200">
                    {activeAutoCleanMode}
                  </span>
                )}
                <span className="rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 py-1 text-slate-300">
                  <strong className="font-mono text-slate-100">{preview.row_count.toLocaleString()}</strong> rows
                </span>
                <span className="rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 py-1 text-slate-300">
                  <strong className="font-mono text-slate-100">{preview.column_count}</strong> cols
                </span>
                <button
                  type="button"
                  onClick={handleCopyDatasetId}
                  title="Salin Dataset ID"
                  className="hidden items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 py-1 font-mono text-[11px] text-slate-400 transition hover:border-slate-700 hover:text-slate-200 md:inline-flex"
                >
                  <span>{copiedDatasetId ? 'Disalin!' : `${preview.dataset_id.slice(0, 8)}…`}</span>
                </button>
                {isBusy && <Spinner size="sm" label="Processing…" />}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Split Body */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Workbench Sidebar */}
        <aside
          className={`ana-sidebar shrink-0 flex-col border-b border-slate-800 bg-slate-900/85 lg:border-b-0 lg:border-r lg:overflow-y-auto ${
            isMobileSidebarOpen ? 'flex' : 'hidden lg:flex'
          }`}
          style={{ flexBasis: sidebarWidth, width: sidebarWidth, maxWidth: '100%' }}
        >
          <div className="flex flex-col gap-3.5 p-4">
            {/* Upload Section (Expanded when empty, collapsible pill when data is loaded) */}
            {!hasData ? (
              <section className="ana-panel rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    1. Upload Dataset
                  </p>
                  <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                    CSV / XLSX
                  </span>
                </div>
                <UploadZone
                  onFile={upload}
                  isUploading={status === 'uploading'}
                  progress={uploadProgress}
                  disabled={!canEditAnalytics}
                />
                <div className="mt-3 grid grid-cols-2 gap-2 md:hidden">
                  <button
                    type="button"
                    onClick={() => setActiveGuide('pbn')}
                    className="rounded-xl border border-slate-800 bg-slate-900/90 px-2.5 py-2 text-left text-[11px] font-medium text-brand-300 hover:bg-slate-800"
                  >
                    Panduan PBN Open →
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveGuide('sitasi')}
                    className="rounded-xl border border-slate-800 bg-slate-900/90 px-2.5 py-2 text-left text-[11px] font-medium text-sky-300 hover:bg-slate-800"
                  >
                    Panduan SITASI →
                  </button>
                </div>
              </section>
            ) : (
              <section className="ana-panel rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Sumber File
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowUploadInWorkspace((open) => !open)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-brand-300 transition hover:bg-slate-800"
                  >
                    {showUploadInWorkspace ? 'Tutup Upload' : 'Unggah File Baru'}
                  </button>
                </div>
                {showUploadInWorkspace && (
                  <div className="mt-3 border-t border-slate-800 pt-3">
                    <UploadZone
                      onFile={(file) => {
                        setShowUploadInWorkspace(false);
                        upload(file);
                      }}
                      isUploading={status === 'uploading'}
                      progress={uploadProgress}
                      disabled={!canEditAnalytics}
                    />
                  </div>
                )}
              </section>
            )}

            {!hasData && (
              <StoredRuns
                runs={storedRuns}
                isLoading={isLoadingHistory}
                error={historyError}
                onRestore={restoreRun}
                onDelete={deleteRun}
                onRefresh={() => void refreshStoredRuns()}
                canEdit={canEditAnalytics}
              />
            )}

            {hasData && (
              <>
                {/* Dataset Info & Sheet Switcher */}
                <section className="ana-panel rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Dataset Info
                    </p>
                    <span className="font-mono text-[11px] text-slate-500">
                      {preview.sheets.length} sheet
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label htmlFor="run-name" className="mb-1.5 block text-xs font-medium text-slate-400">
                        Nama cleaning sequence
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="run-name"
                          value={runName}
                          maxLength={255}
                          disabled={!canEditAnalytics}
                          onChange={(event) => setRunName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void saveRunName();
                          }}
                          placeholder="Contoh: PBN Open Q4"
                          className="input min-w-0 flex-1 py-1.5 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => void saveRunName()}
                          disabled={!canEditAnalytics || isBusy || !runName.trim()}
                          className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="ana-subpanel rounded-xl border border-slate-800/90 bg-slate-900/75 px-3 py-2.5 text-center">
                        <p className="font-mono text-lg font-bold text-brand-400">
                          {preview.row_count.toLocaleString()}
                        </p>
                        <p className="text-[11px] font-medium text-slate-400">Rows</p>
                      </div>
                      <div className="ana-subpanel rounded-xl border border-slate-800/90 bg-slate-900/75 px-3 py-2.5 text-center">
                        <p className="font-mono text-lg font-bold text-brand-400">
                          {preview.column_count}
                        </p>
                        <p className="text-[11px] font-medium text-slate-400">Columns</p>
                      </div>
                    </div>

                    {preview.sheets.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Active Sheet
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {preview.sheets.map((sheet) => {
                            const isActive = sheet.name === preview.selected_sheet;
                            return (
                              <button
                                key={sheet.name}
                                type="button"
                                onClick={() => selectSheet(sheet.name)}
                                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                                  isActive
                                    ? 'bg-sky-500 text-white shadow-xs'
                                    : 'border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800'
                                }`}
                              >
                                {sheet.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Auto Clean Section */}
                <section className="ana-panel rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Auto Clean Pipeline
                    </p>
                    {activeAutoCleanMode && (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        Applied
                      </span>
                    )}
                  </div>

                  {recommendationStatus === 'checking' && (
                    <p className="mb-3 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-400">
                      Memeriksa format sheet terhadap template cleaning…
                    </p>
                  )}

                  {recommendationStatus === 'error' && (
                    <p role="alert" className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                      Format cleaning tidak dapat diverifikasi: {recommendationError}
                    </p>
                  )}

                  {recommendationStatus === 'done' && cleaningRecommendation && (
                    <div className="mb-3 rounded-xl border border-sky-500/35 bg-sky-500/10 p-3">
                      {cleaningRecommendation.recommended_mode ? (
                        <>
                          <div className="flex items-center gap-1.5 text-xs font-bold text-sky-200">
                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 shrink-0 text-sky-400">
                              <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" />
                            </svg>
                            <span>Rekomendasi: {cleaningRecommendation.recommended_mode}</span>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-slate-300">
                            {cleaningRecommendation.reason}
                          </p>
                          <button
                            type="button"
                            disabled={!canEditAnalytics}
                            onClick={() => {
                              const mode = cleaningRecommendation.recommended_mode;
                              if (mode) setAutoCleanMode(mode);
                            }}
                            className="mt-2.5 inline-flex items-center gap-1 rounded-lg bg-sky-500 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-400 disabled:opacity-50"
                          >
                            Pilih rekomendasi
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-xs font-semibold text-amber-200">
                            Tidak ada rekomendasi metode tunggal
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-300">
                            {cleaningRecommendation.reason}
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Metode Auto Clean"
                      value={autoCleanMode}
                      disabled={!canEditAnalytics}
                      onChange={(e) => setAutoCleanMode(e.target.value)}
                      className="input min-w-0 flex-1 py-2 text-xs font-medium"
                    >
                      {autoCleanOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      aria-label="Apply selected cleaning method"
                      title="Apply selected cleaning method"
                      disabled={!canEditAnalytics || isBusy || !isApplicableCleanMode}
                      onClick={() => applyAutoClean(autoCleanMode)}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-sky-500 px-3 text-xs font-semibold text-white shadow-xs transition hover:bg-sky-400 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Terapkan</span>
                    </button>
                  </div>
                </section>

                {/* Row Manipulation Section */}
                <section className="ana-panel rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Row Manipulation
                  </p>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={1}
                          placeholder="Jumlah"
                          aria-label="Jumlah baris awal yang dihapus"
                          value={firstCount}
                          disabled={!canEditAnalytics}
                          onChange={(e) => setFirstCount(e.target.value)}
                          className="input w-24 shrink-0 py-1.5 font-mono text-xs"
                        />
                        <button
                          type="button"
                          disabled={!canEditAnalytics || isBusy || !firstCount || parsedFirst < 1}
                          onClick={() => deleteRows('first', parsedFirst)}
                          className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          Delete first
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={1}
                          placeholder="Jumlah"
                          aria-label="Jumlah baris akhir yang dihapus"
                          value={lastCount}
                          disabled={!canEditAnalytics}
                          onChange={(e) => setLastCount(e.target.value)}
                          className="input w-24 shrink-0 py-1.5 font-mono text-xs"
                        />
                        <button
                          type="button"
                          disabled={!canEditAnalytics || isBusy || !lastCount || parsedLast < 1}
                          onClick={() => deleteRows('last', parsedLast)}
                          className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          Delete last
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={1}
                          placeholder="Baris #"
                          aria-label="Nomor baris yang dihapus"
                          value={customRow}
                          disabled={!canEditAnalytics}
                          onChange={(e) => setCustomRow(e.target.value)}
                          className="input w-24 shrink-0 py-1.5 font-mono text-xs"
                        />
                        <button
                          type="button"
                          disabled={!canEditAnalytics || isBusy || !customRow || parsedCustom < 1}
                          onClick={() => deleteRows('custom', undefined, parsedCustom)}
                          className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          Delete row
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-slate-800/80 pt-3">
                      <ActionTooltip label="Jadikan baris pertama sebagai header kolom">
                        <button
                          type="button"
                          aria-label="Make the first row the column headers"
                          title="Make the first row the column headers"
                          disabled={!canEditAnalytics || isBusy}
                          onClick={useFirstRowAsHeader}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-brand-500/35 bg-brand-500/15 px-3 py-2 text-xs font-semibold text-brand-200 transition hover:bg-brand-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                            <path d="M12 19V5m0 0-5 5m5-5 5 5" />
                          </svg>
                          <span>Use first row as header</span>
                        </button>
                      </ActionTooltip>
                    </div>
                  </div>
                </section>

                {/* Column Manager */}
                <section className="ana-panel rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <ColumnManager
                    columns={preview.columns}
                    onApplyRemove={applyRemoveColumns}
                    onApplyRename={applyRenameColumns}
                    isLoading={isBusy}
                    disabled={!canEditAnalytics}
                  />
                </section>

                {/* Duplicate Remover */}
                <section className="ana-panel rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <DuplicateRemover
                    columns={preview.columns}
                    onApply={applyRemoveDuplicates}
                    isLoading={isBusy}
                    stats={dupStats}
                    disabled={!canEditAnalytics}
                  />
                </section>
              </>
            )}
          </div>
        </aside>

        {/* Precision Sidebar Resize Handle */}
        <div
          role="separator"
          aria-label="Resize analytics sidebar"
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={maxSidebarWidth}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          title="Tarik untuk mengubah lebar panel; klik ganda untuk reset"
          onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              resizeSidebar(event.clientX);
            }
          }}
          onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              resizeSidebar(sidebarWidth - 16);
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              resizeSidebar(sidebarWidth + 16);
            }
          }}
          className="ana-resizer group relative hidden w-1.5 shrink-0 cursor-col-resize bg-slate-800 transition-colors hover:bg-brand-500 focus-visible:bg-brand-500 focus-visible:outline-none lg:block"
          style={{ touchAction: 'none' }}
        >
          <span className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-500/70 transition-colors group-hover:bg-white" />
        </div>

        {/* Main Workspace Canvas */}
        <main className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_75%_40%_at_50%_0%,rgba(14,165,233,0.08),transparent)]"
          />

          {error && (
            <div className="px-4 pt-4 sm:px-6">
              <ErrorBanner message={error} onDismiss={clearError} />
            </div>
          )}

          {preview?.cleaning_warnings && preview.cleaning_warnings.length > 0 && (
            <div className="px-4 pt-4 sm:px-6">
              <div role="status" className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                <p className="font-semibold">Some date values could not be parsed and were preserved.</p>
                <ul className="mt-1 list-inside list-disc text-xs text-amber-100/85">
                  {preview.cleaning_warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            </div>
          )}

          {/* Guided Empty State */}
          {!hasData && status !== 'uploading' && (
            <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-6 sm:p-10">
              <div className="w-full max-w-2xl text-center">
                <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-brand-500/25 bg-brand-500/10 text-brand-300 shadow-inner">
                  <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>

                <h2 className="mt-5 text-xl font-bold tracking-tight">
                  Siap Membersihkan &amp; Menganalisis Dataset
                </h2>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-400">
                  Unggah file <span className="font-mono text-slate-200">.csv</span>,{' '}
                  <span className="font-mono text-slate-200">.xlsx</span>, atau{' '}
                  <span className="font-mono text-slate-200">.xls</span> di panel sebelah kiri, atau pulihkan riwayat pemrosesan sebelumnya.
                </p>

                {/* 3-Step Pipeline Overview */}
                <div className="mt-7 grid gap-3 text-left sm:grid-cols-3">
                  <div className="ana-panel rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
                    <span className="inline-flex size-6 items-center justify-center rounded-lg bg-brand-500/15 font-mono text-xs font-bold text-brand-300">
                      1
                    </span>
                    <h3 className="mt-2.5 text-xs font-bold uppercase tracking-wider text-slate-200">
                      Upload Workbook
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Deteksi otomatis struktur kolom dan pilih sheet yang ingin diolah.
                    </p>
                  </div>

                  <div className="ana-panel rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
                    <span className="inline-flex size-6 items-center justify-center rounded-lg bg-sky-500/15 font-mono text-xs font-bold text-sky-300">
                      2
                    </span>
                    <h3 className="mt-2.5 text-xs font-bold uppercase tracking-wider text-slate-200">
                      Auto Clean &amp; Filter
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Jalankan preset PBN Open / SITASI, hapus duplikat, dan filter baris.
                    </p>
                  </div>

                  <div className="ana-panel rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
                    <span className="inline-flex size-6 items-center justify-center rounded-lg bg-emerald-500/15 font-mono text-xs font-bold text-emerald-300">
                      3
                    </span>
                    <h3 className="mt-2.5 text-xs font-bold uppercase tracking-wider text-slate-200">
                      Export &amp; Slide PPTX
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Unduh CSV/Excel bersih atau susun slide profil SITASI &amp; Bahan Baperjakat.
                    </p>
                  </div>
                </div>

                {/* Quick Guide Triggers */}
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveGuide('pbn')}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-brand-500/50 hover:text-brand-200"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-brand-400">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M9.5 9a2.5 2.5 0 0 1 4.8.8c0 1.7-2.3 2.2-2.3 3.7M12 17h.01" />
                    </svg>
                    <span>Cara Penggunaan (Instant PBN Open)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveGuide('sitasi')}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-sky-500/50 hover:text-sky-200"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4 text-sky-400">
                      <path d="M7 3h8l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
                      <path d="M15 3v5h5M9 13h6M9 17h4" />
                    </svg>
                    <span>Cara Clean dan Generate PPT SITASI</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {!hasData && status === 'uploading' && (
            <div className="flex flex-1 items-center justify-center p-8">
              <Spinner label="Parsing your file…" />
            </div>
          )}

          {hasData && (
            <div className="min-h-0 flex-1 overflow-hidden p-4 pb-0">
              <DataTable
                preview={preview}
                filters={tableFilters}
                onFilterChange={handleColumnFilter}
                onClearFilter={handleClearColumnFilter}
                onResetFilters={handleResetFilters}
              />
            </div>
          )}

          {/* Bottom Export & Presentation Action Dock */}
          {hasData && (
            <div className="ana-bar flex shrink-0 flex-wrap items-center gap-2.5 border-t border-slate-800 bg-slate-900/95 px-4 py-3 backdrop-blur-xs">
              <button
                type="button"
                onClick={reset}
                disabled={isBusy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-50"
              >
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Reset</span>
              </button>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/20"
                >
                  <span>{activeFilterCount} filter aktif</span>
                  <span aria-hidden="true">×</span>
                </button>
              )}

              <div className="flex-1" />

              {isBusy && <Spinner size="sm" label="Applying…" />}

              {/* Data Export Cluster */}
              <div className="flex items-center gap-2">
                <ActionTooltip label="Download filtered data as CSV">
                  <button
                    type="button"
                    aria-label="Download filtered data as CSV"
                    onClick={handleDownloadCsv}
                    disabled={isBusy}
                    className="btn-secondary !rounded-xl !px-3 !py-2 text-xs font-semibold"
                  >
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>CSV</span>
                  </button>
                </ActionTooltip>

                <ActionTooltip label="Download filtered data as Excel">
                  <button
                    type="button"
                    aria-label="Download filtered data as Excel"
                    onClick={handleDownloadExcel}
                    disabled={isBusy}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>Excel</span>
                  </button>
                </ActionTooltip>
              </div>

              {/* SITASI PowerPoint Cluster */}
              {canDownloadProfiles && (
                <div className="flex flex-wrap items-center gap-2 border-l border-slate-800 pl-2.5">
                  {activeAutoCleanMode === 'Sitasi Es.III' && (
                    <ActionTooltip label="Gabungkan template 4 orang kategori Mutasi dan template 3 orang kategori Promosi">
                      <button
                        type="button"
                        aria-label="Generate Bahan Baperjakat"
                        onClick={() => void handleGenerateBahanBaperjakat()}
                        disabled={isBusy || isGeneratingBahanBaperjakat || isStagingPowerPoint || isCombiningPowerPoints}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isGeneratingBahanBaperjakat ? (
                          <Spinner size="sm" label="Membuat…" />
                        ) : (
                          <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 3.75h7l4.25 4.5v12A.75.75 0 0117.5 21h-10a.75.75 0 01-.75-.75v-16A.75.75 0 017.5 3.5h6.25M14 3.75v4.5h4.25M9 12h6m-6 3.5h6" />
                          </svg>
                        )}
                        <span>{isGeneratingBahanBaperjakat ? 'Wait' : 'Generate Bahan Baperjakat'}</span>
                      </button>
                    </ActionTooltip>
                  )}

                  {activeAutoCleanMode === 'Sitasi Es.III' && (
                    <label className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="hidden sm:inline">Template</span>
                      <select
                        aria-label="Sitasi Es.III PowerPoint template"
                        value={sitasiEsiiiTemplate}
                        onChange={(event) => setSitasiEsiiiTemplate(
                          event.target.value === 'three-row' ? 'three-row' : 'standard'
                        )}
                        disabled={isBusy}
                        className="input py-1.5 text-xs"
                      >
                        <option value="standard">4-row · 4 people</option>
                        <option value="three-row">3-row · 3 people</option>
                      </select>
                    </label>
                  )}

                  <ActionTooltip label="Download profile PowerPoint">
                    <button
                      type="button"
                      aria-label="Download profile PowerPoint"
                      onClick={handleDownloadPowerPoint}
                      disabled={isBusy}
                      className="btn-secondary !rounded-xl !px-3 !py-2 text-xs font-semibold"
                    >
                      <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 3h8l5 5v13H7a2 2 0 01-2-2V5a2 2 0 012-2zm8 0v5h5M9 13h6m-6 4h6" />
                      </svg>
                      <span>PPTX</span>
                    </button>
                  </ActionTooltip>

                  <ActionTooltip label={isStagingPowerPoint ? 'Generating filtered slides' : 'Add filtered slides to staging'}>
                    <button
                      type="button"
                      aria-label={isStagingPowerPoint ? 'Generating filtered slides' : 'Add filtered slides to staging'}
                      onClick={() => void handleStagePowerPoint()}
                      disabled={isBusy || isStagingPowerPoint || isCombiningPowerPoints || isGeneratingBahanBaperjakat}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-brand-500/40 bg-brand-500/15 px-3 py-2 text-xs font-semibold text-brand-200 transition hover:bg-brand-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H5a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-3M8 5a2 2 0 012-2h3l5 5v1M8 5v3a2 2 0 002 2h3M21 3v6m-3-3h6" />
                      </svg>
                      <span>{isStagingPowerPoint ? 'Wait' : 'Stage'}</span>
                    </button>
                  </ActionTooltip>
                </div>
              )}

              {bahanBaperjakatError && (
                <p role="alert" className="basis-full rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300">
                  Bahan Baperjakat gagal dibuat: {bahanBaperjakatError}
                </p>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Floating PowerPoint Staging Drawer */}
      {(stagedPowerPoints.length > 0 || powerPointStagingError) && (
        <section className="ana-drawer fixed bottom-20 right-4 z-40 w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-xs">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-lg bg-brand-500/20 font-mono text-xs font-bold text-brand-300">
                {stagedPowerPoints.length}
              </span>
              <h2 className="text-sm font-bold">
                PowerPoint staging ({stagedPowerPoints.length})
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsStagingCollapsed((collapsed) => !collapsed)}
                aria-label={isStagingCollapsed ? 'Perluas panel staging' : 'Kecilkan panel staging'}
                className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800"
              >
                {isStagingCollapsed ? 'Perluas' : 'Kecilkan'}
              </button>
              <button
                type="button"
                onClick={() => setStagedPowerPoints([])}
                disabled={isCombiningPowerPoints || isStagingPowerPoint}
                className="rounded-lg px-2 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>

          {!isStagingCollapsed && (
            <>
              <p className="mt-1.5 text-xs text-slate-400">
                Generated slides are held in this browser session, not as table data.
              </p>

              <ol className="my-3 max-h-48 space-y-2 overflow-y-auto pr-0.5">
                {stagedPowerPoints.map((staged, index) => (
                  <li
                    key={staged.id}
                    className="ana-subpanel flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-2.5"
                  >
                    <span className="w-5 shrink-0 font-mono text-xs font-semibold text-slate-500">
                      {index + 1}.
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-200" title={staged.label}>
                      {staged.label}
                    </span>
                    <button
                      type="button"
                      aria-label={`Move staged presentation ${index + 1} up`}
                      onClick={() => moveStagedPowerPoint(index, -1)}
                      disabled={index === 0 || isCombiningPowerPoints || isStagingPowerPoint}
                      className="rounded-lg px-1.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move staged presentation ${index + 1} down`}
                      onClick={() => moveStagedPowerPoint(index, 1)}
                      disabled={index === stagedPowerPoints.length - 1 || isCombiningPowerPoints || isStagingPowerPoint}
                      className="rounded-lg px-1.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove staged presentation ${index + 1}`}
                      onClick={() => setStagedPowerPoints((stagedItems) => stagedItems.filter((item) => item.id !== staged.id))}
                      disabled={isCombiningPowerPoints || isStagingPowerPoint}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/15 disabled:opacity-30"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ol>

              {powerPointStagingError && (
                <p role="alert" className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                  {powerPointStagingError}
                </p>
              )}

              <ActionTooltip label="Combine staged presentations in order and download">
                <button
                  type="button"
                  aria-label={isCombiningPowerPoints ? 'Combining staged presentations' : 'Combine staged presentations in order and download'}
                  title="Combine staged presentations in order and download"
                  onClick={() => void handleCombinePowerPoints()}
                  disabled={stagedPowerPoints.length < 2 || isCombiningPowerPoints || isStagingPowerPoint}
                  className="w-full rounded-xl bg-sky-500 px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCombiningPowerPoints ? 'Combining…' : 'Combine & Download'}
                </button>
              </ActionTooltip>
            </>
          )}
        </section>
      )}

      {/* Interactive Usage Guide Modal */}
      {activeGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guide-title"
          onMouseDown={() => setActiveGuide(null)}
        >
          <div
            className="ana-modal w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-brand-300">
                  Panduan Operasional
                </p>
                <h2 id="guide-title" className="mt-1 text-base font-bold">
                  {activeGuide === 'pbn' ? 'Cara Penggunaan (Instant PBN Open)' : 'Cara Clean dan Generate PPT SITASI'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveGuide(null)}
                className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-slate-700 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
                aria-label="Tutup panduan"
                title="Tutup"
              >
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Guide Switcher Pills */}
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-1">
              <button
                type="button"
                onClick={() => setActiveGuide('pbn')}
                className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                  activeGuide === 'pbn'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Instant PBN Open
              </button>
              <button
                type="button"
                onClick={() => setActiveGuide('sitasi')}
                className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                  activeGuide === 'sitasi'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                PPT SITASI
              </button>
            </div>

            <div className="mt-5">
              {activeGuide === 'pbn' ? (
                <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-300">
                  <li><strong>Copy Loaded Data</strong> dari <strong>PBN Open</strong> ke Excel kosong dan Save.</li>
                  <li>Masuk ke <strong>Aplikasi PBN Cleaner</strong>.</li>
                  <li>Upload file yang sudah di-save pada tahap 1.</li>
                  <li>
                    Pilih Cleaning Method sesuai dengan query PBN Open:
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-slate-400">
                      <li><strong className="text-slate-200">PBN Open</strong> — Tanpa tambahan query.</li>
                      <li><strong className="text-slate-200">PBN Open + Edu</strong> — Jika menyalakan query &ldquo;Detil Pendidikan Terakhir&rdquo;.</li>
                      <li><strong className="text-slate-200">PBN Open + Edu + HB</strong> — Jika menyalakan query &ldquo;Detil Pendidikan Terakhir&rdquo; dan &ldquo;Tujuan Pensiun/Homebase&rdquo;.</li>
                    </ul>
                  </li>
                </ol>
              ) : (
                <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-300">
                  <li>Download data format Excel dari Sitasi.</li>
                  <li>Buka file dan pilih <strong>Save As</strong> dengan format <strong>.xlsx</strong>, tanpa mengubah apa pun.</li>
                  <li>Masuk ke <strong>Aplikasi PBN Cleaner</strong>.</li>
                  <li>Upload file yang disimpan pada tahap 2.</li>
                  <li>Pilih Cleaning Method (<strong>Sitasi Es.III</strong> / <strong>Sitasi Es.IV</strong>) sesuai kebutuhan.</li>
                  <li>Pilih tombol <strong>PPTX</strong> atau <strong>Generate Bahan Baperjakat</strong> pada bilah bawah.</li>
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}