import { useNavigate } from 'react-router-dom';
import { useRef, useState, type ReactNode } from 'react';
import * as apiClient from '../services/api';
import { useDataset } from '../hooks/useDataset';
import { UploadZone } from '../features/upload/UploadZone';
import { StoredRuns } from '../features/upload/StoredRuns';
import { ColumnManager } from '../features/cleaning/ColumnManager';
import { DuplicateRemover } from '../features/cleaning/DuplicateRemover';
import { DataTable } from '../features/cleaning/DataTable';
import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';

const SIDEBAR_MIN_WIDTH = 256;
const SIDEBAR_MAX_WIDTH = 560;

function ActionTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-600 bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
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
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [sitasiEsiiiTemplate, setSitasiEsiiiTemplate] = useState<'standard' | 'three-row'>('standard');
  const [stagedPowerPoints, setStagedPowerPoints] = useState<StagedPowerPoint[]>([]);
  const [isStagingPowerPoint, setIsStagingPowerPoint] = useState(false);
  const [isCombiningPowerPoints, setIsCombiningPowerPoints] = useState(false);
  const [powerPointStagingError, setPowerPointStagingError] = useState<string | null>(null);
  const nextStagedPowerPointId = useRef(1);
  const autoCleanOptions = [
    'PBN Open',
    'PBN Open + Edu',
    'PBN Open + Edu + HB',
    'Sitasi Pelaksana',
    'Sitasi Es.IV',
    'Sitasi Es.III',
    'Sitasi Es.III (Lite)',
  ];

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
    } catch (stageError) {
      setPowerPointStagingError((stageError as Error).message);
    } finally {
      setIsStagingPowerPoint(false);
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
  const canDownloadProfiles = activeAutoCleanMode === 'Sitasi Es.III' || activeAutoCleanMode === 'Sitasi Es.III (Lite)' || activeAutoCleanMode === 'Sitasi Es.IV';
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

  return (
    <div className="min-h-screen flex flex-col bg-surface-900 text-slate-100">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-surface-800 border-b border-surface-700 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
          >
            Back
          </button>
          <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-100">PBN Analytics</h1>
            <p className="text-xs text-slate-500 hidden sm:block">Upload · Clean · Export · Visualize · Analysis </p>
          </div>
        </div>
        {hasData && (
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-4 text-xs text-slate-400">
              <span><span className="text-slate-200 font-semibold">{preview.row_count.toLocaleString()}</span> rows</span>
              <span><span className="text-slate-200 font-semibold">{preview.column_count}</span> columns</span>
              <span className="font-mono text-slate-500 text-xs">{preview.dataset_id.slice(0, 8)}…</span>
            </div>
            {isBusy && <Spinner size="sm" label="Processing…" />}
          </div>
        )}
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className="shrink-0 bg-surface-800 border-r border-surface-700 flex flex-col overflow-y-auto"
          style={{ flexBasis: sidebarWidth, width: sidebarWidth }}
        >
          <div className="flex flex-col gap-4 p-4">
            <section className="card p-4">
              <p className="section-title mb-3">Upload File</p>
              {!hasData && (
                <>
                <button
                  type="button"
                  onClick={() => setActiveGuide('pbn')}
                  className="mb-3 text-left text-xs text-brand-400 underline decoration-brand-400/60 underline-offset-2 hover:text-brand-300"
                >
                  Cara Penggunaan (Instant PBN Open)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveGuide('sitasi')}
                  className="mb-3 block text-left text-xs text-brand-400 underline decoration-brand-400/60 underline-offset-2 hover:text-brand-300"
                >
                  Cara Clean dan Generate PPT SITASI
                </button>
                </>
              )}
              <UploadZone onFile={upload} isUploading={status === 'uploading'} progress={uploadProgress} />
            </section>
            {!hasData && (
              <StoredRuns
                runs={storedRuns}
                isLoading={isLoadingHistory}
                error={historyError}
                onRestore={restoreRun}
                onDelete={deleteRun}
                onRefresh={() => void refreshStoredRuns()}
              />
            )}
            {hasData && (
              <section className="card p-4">
                <p className="section-title mb-3">Dataset Info</p>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="run-name" className="mb-1.5 block text-xs font-medium text-slate-400">Cleaning sequence</label>
                    <div className="flex gap-2">
                      <input
                        id="run-name"
                        value={runName}
                        maxLength={255}
                        onChange={(event) => setRunName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void saveRunName();
                        }}
                        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                      />
                      <button
                        type="button"
                        onClick={() => void saveRunName()}
                        disabled={isBusy || !runName.trim()}
                        className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-surface-900 rounded-lg p-2.5 text-center">
                      <p className="text-xl font-bold text-brand-400">{preview.row_count.toLocaleString()}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Rows</p>
                    </div>
                    <div className="bg-surface-900 rounded-lg p-2.5 text-center">
                      <p className="text-xl font-bold text-brand-400">{preview.column_count}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Columns</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {preview.sheets.map((sheet) => (
                      <button
                        key={sheet.name}
                        type="button"
                        onClick={() => selectSheet(sheet.name)}
                        className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                          sheet.name === preview.selected_sheet
                            ? 'bg-brand-500 text-white'
                            : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {sheet.name}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}
            {hasData && (
              <section className="card p-4">
                <p className="section-title mb-3">Auto Clean</p>
                {recommendationStatus === 'checking' && (
                  <p className="mb-3 rounded-lg border border-slate-700 bg-surface-900 px-3 py-2 text-xs text-slate-400">
                    Checking the uploaded sheet against available cleaning templates…
                  </p>
                )}
                {recommendationStatus === 'error' && (
                  <p role="alert" className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                    Could not verify the cleaning format: {recommendationError}
                  </p>
                )}
                {recommendationStatus === 'done' && cleaningRecommendation && (
                  <div className="mb-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3">
                    {cleaningRecommendation.recommended_mode ? (
                      <>
                        <p className="text-xs font-semibold text-sky-200">
                          Recommended method: {cleaningRecommendation.recommended_mode}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">{cleaningRecommendation.reason}</p>
                        <button
                          type="button"
                          onClick={() => {
                            const mode = cleaningRecommendation.recommended_mode;
                            if (mode) setAutoCleanMode(mode);
                          }}
                          className="mt-2 rounded-md bg-sky-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-400"
                        >
                          Select recommendation
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-semibold text-amber-200">No unique method recommendation</p>
                        <p className="mt-1 text-xs text-slate-400">{cleaningRecommendation.reason}</p>
                      </>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={autoCleanMode}
                    onChange={(e) => setAutoCleanMode(e.target.value)}
                    className="min-w-0 flex-1 basis-40 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {autoCleanOptions.map((option) => (
                      <option key={option} value={option} className="bg-slate-950 text-slate-100">
                        {option}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label="Apply selected cleaning method"
                    title="Apply selected cleaning method"
                    disabled={isBusy || !['PBN Open', 'PBN Open + Edu', 'PBN Open + Edu + HB', 'Sitasi Es.IV', 'Sitasi Es.III', 'Sitasi Es.III (Lite)'].includes(autoCleanMode)}
                    onClick={() => applyAutoClean(autoCleanMode)}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white transition hover:bg-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </section>
            )}
            {hasData && (
              <section className="card p-4">
                <p className="section-title mb-3">Row Manipulation</p>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-200">Delete Rows</p>
                    <div className="space-y-3">
                      <div className="grid gap-2">
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min={1}
                            placeholder="Rows"
                            value={firstCount}
                            onChange={(e) => setFirstCount(e.target.value)}
                            className="w-1/2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                          />
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => deleteRows('first', Number(firstCount))}
                            className="w-1/2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-400 disabled:opacity-50"
                          >
                            Delete first
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min={1}
                            placeholder="Rows"
                            value={lastCount}
                            onChange={(e) => setLastCount(e.target.value)}
                            className="w-1/2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                          />
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => deleteRows('last', Number(lastCount))}
                            className="w-1/2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-400 disabled:opacity-50"
                          >
                            Delete last
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min={1}
                            placeholder="Row #"
                            value={customRow}
                            onChange={(e) => setCustomRow(e.target.value)}
                            className="w-1/2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
                          />
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => deleteRows('custom', undefined, Number(customRow))}
                            className="w-1/2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-400 disabled:opacity-50"
                          >
                            Delete row
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-200">Header Row</p>
                    <ActionTooltip label="Make the first row the column headers">
                      <button
                        type="button"
                        aria-label="Make the first row the column headers"
                        title="Make the first row the column headers"
                        disabled={isBusy}
                        onClick={useFirstRowAsHeader}
                        className="w-full rounded-lg bg-brand-500 px-3 py-2 text-left text-sm font-semibold text-white transition hover:bg-brand-400 disabled:opacity-50"
                      >
                        Use first row
                      </button>
                    </ActionTooltip>
                  </div>
                </div>
              </section>
            )}
            {hasData && (
              <section className="card p-4">
                <ColumnManager columns={preview.columns} onApplyRemove={applyRemoveColumns} onApplyRename={applyRenameColumns} isLoading={isBusy} />
              </section>
            )}
            {hasData && (
              <section className="card p-4">
                <DuplicateRemover columns={preview.columns} onApply={applyRemoveDuplicates} isLoading={isBusy} stats={dupStats} />
              </section>
            )}
          </div>
        </aside>
        <div
          role="separator"
          aria-label="Resize analytics sidebar"
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={maxSidebarWidth}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
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
          className="w-2 shrink-0 cursor-col-resize bg-surface-700 transition-colors hover:bg-brand-500 focus-visible:outline-none focus-visible:bg-brand-500"
          style={{ touchAction: 'none' }}
        />

        {/* Main */}
        <main className="min-w-0 flex-1 flex flex-col overflow-hidden">
          {error && (
            <div className="px-6 pt-4">
              <ErrorBanner message={error} onDismiss={clearError} />
            </div>
          )}
          {!hasData && status !== 'uploading' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-surface-800 flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-300">No dataset loaded</h2>
                <p className="text-sm text-slate-500 mt-1">Upload a CSV or Excel file to get started.</p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center text-xs text-slate-600">
                {['.csv', '.xlsx', '.xls'].map(ext => <span key={ext} className="badge bg-surface-800">{ext}</span>)}
              </div>
            </div>
          )}
          {!hasData && status === 'uploading' && (
            <div className="flex flex-1 items-center justify-center">
              <Spinner label="Parsing your file…" />
            </div>
          )}
          {hasData && (
            <div className="flex-1 overflow-hidden p-4 pb-0">
              <DataTable
                preview={preview}
                filters={tableFilters}
                onFilterChange={handleColumnFilter}
                onClearFilter={handleClearColumnFilter}
                onResetFilters={handleResetFilters}
              />
            </div>
          )}
          {/* Action bar */}
          {hasData && (
            <div className="flex items-center gap-3 px-4 py-3 bg-surface-800 border-t border-surface-700 shrink-0 flex-wrap">
              <button onClick={reset} className="btn-ghost text-xs" disabled={isBusy}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Reset
              </button>
              <div className="flex-1" />
              {isBusy && <Spinner size="sm" label="Applying…" />}
              {activeAutoCleanMode === 'PBN Open + Edu + HB' && preview && (
                <ActionTooltip label="Open Insights dashboard">
                  <button
                    type="button"
                    aria-label="Open Insights dashboard"
                    onClick={() => navigate(`/insights?dataset_id=${encodeURIComponent(preview.dataset_id)}&sheet_name=${encodeURIComponent(preview.selected_sheet)}`)}
                    disabled={isBusy}
                    className="btn-primary !px-3 !py-2 text-xs"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 14l4-4 4 4 6-7" />
                    </svg>
                    Insights
                  </button>
                </ActionTooltip>
              )}
              <ActionTooltip label="Download filtered data as CSV">
                <button
                  type="button"
                  aria-label="Download filtered data as CSV"
                  onClick={handleDownloadCsv}
                  disabled={isBusy}
                  className="btn-secondary !px-3 !py-2 text-xs"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  CSV
                </button>
              </ActionTooltip>
              <ActionTooltip label="Download filtered data as Excel">
                <button
                  type="button"
                  aria-label="Download filtered data as Excel"
                  onClick={handleDownloadExcel}
                  disabled={isBusy}
                  className="btn-secondary !px-3 !py-2 text-xs"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Excel
                </button>
              </ActionTooltip>
              {canDownloadProfiles && (
                <>
                  {activeAutoCleanMode === 'Sitasi Es.III' && (
                    <label className="flex items-center gap-2 text-xs text-slate-400">
                      <span>Template</span>
                      <select
                        aria-label="Sitasi Es.III PowerPoint template"
                        value={sitasiEsiiiTemplate}
                        onChange={(event) => setSitasiEsiiiTemplate(
                          event.target.value === 'three-row' ? 'three-row' : 'standard'
                        )}
                        disabled={isBusy}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-50"
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
                      className="btn-secondary !px-3 !py-2 text-xs"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 3h8l5 5v13H7a2 2 0 01-2-2V5a2 2 0 012-2zm8 0v5h5M9 13h6m-6 4h6" />
                      </svg>
                      PPTX
                    </button>
                  </ActionTooltip>
                  <ActionTooltip label={isStagingPowerPoint ? 'Generating filtered slides' : 'Add filtered slides to staging'}>
                    <button
                      type="button"
                      aria-label={isStagingPowerPoint ? 'Generating filtered slides' : 'Add filtered slides to staging'}
                      onClick={() => void handleStagePowerPoint()}
                      disabled={isBusy || isStagingPowerPoint || isCombiningPowerPoints}
                      className="btn-secondary !px-3 !py-2 text-xs"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H5a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-3M8 5a2 2 0 012-2h3l5 5v1M8 5v3a2 2 0 002 2h3M21 3v6m-3-3h6" />
                      </svg>
                      {isStagingPowerPoint ? 'Wait' : 'Stage'}
                    </button>
                  </ActionTooltip>
                </>
              )}
            </div>
          )}
        </main>
      </div>
      {(stagedPowerPoints.length > 0 || powerPointStagingError) && (
        <section className="fixed bottom-20 right-4 z-40 w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-surface-700 bg-surface-800 p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                PowerPoint staging ({stagedPowerPoints.length})
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Generated slides are held in this browser session, not as table data.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStagedPowerPoints([])}
              disabled={isCombiningPowerPoints || isStagingPowerPoint}
              className="text-xs text-slate-400 hover:text-slate-100 disabled:opacity-50"
            >
              Clear
            </button>
          </div>
          <ol className="mb-3 max-h-48 space-y-2 overflow-y-auto">
            {stagedPowerPoints.map((staged, index) => (
              <li key={staged.id} className="flex items-center gap-2 rounded-lg bg-surface-900 p-2">
                <span className="w-5 shrink-0 text-xs text-slate-500">{index + 1}.</span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-200" title={staged.label}>
                  {staged.label}
                </span>
                <button
                  type="button"
                  aria-label={`Move staged presentation ${index + 1} up`}
                  onClick={() => moveStagedPowerPoint(index, -1)}
                  disabled={index === 0 || isCombiningPowerPoints || isStagingPowerPoint}
                  className="rounded px-1.5 py-1 text-xs text-slate-300 hover:bg-surface-700 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move staged presentation ${index + 1} down`}
                  onClick={() => moveStagedPowerPoint(index, 1)}
                  disabled={index === stagedPowerPoints.length - 1 || isCombiningPowerPoints || isStagingPowerPoint}
                  className="rounded px-1.5 py-1 text-xs text-slate-300 hover:bg-surface-700 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove staged presentation ${index + 1}`}
                  onClick={() => setStagedPowerPoints((stagedItems) => stagedItems.filter((item) => item.id !== staged.id))}
                  disabled={isCombiningPowerPoints || isStagingPowerPoint}
                  className="rounded px-1.5 py-1 text-xs text-rose-300 hover:bg-surface-700 disabled:opacity-30"
                >
                  Remove
                </button>
              </li>
            ))}
          </ol>
          {powerPointStagingError && (
            <p role="alert" className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
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
              className="w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCombiningPowerPoints ? 'Combining…' : 'Combine & Download'}
            </button>
          </ActionTooltip>
        </section>
      )}
      {activeGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guide-title"
          onMouseDown={() => setActiveGuide(null)}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-surface-700 bg-surface-800 p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 id="guide-title" className="text-base font-semibold text-slate-100">
                {activeGuide === 'pbn' ? 'Cara Penggunaan (Instant PBN Open)' : 'Cara Clean dan Generate PPT SITASI'}
              </h2>
              <button
                type="button"
                onClick={() => setActiveGuide(null)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-surface-700 hover:text-slate-100"
                aria-label="Tutup panduan"
                title="Tutup"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {activeGuide === 'pbn' ? (
              <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-300">
                <li><strong>Copy Loaded Data</strong> dari <strong>PBN Open</strong> ke Excel kosong dan Save.</li>
                <li>Masuk ke <strong>Aplikasi PBN Cleaner</strong>.</li>
                <li>Upload file yang sudah di-save pada tahap 1.</li>
                <li>
                  Pilih Cleaning Method sesuai dengan query PBN Open.
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
                    <li><strong className="text-slate-300">PBN Open</strong> - Tanpa tambahan query.</li>
                    <li><strong className="text-slate-300">PBN Open + Edu</strong> - Jika menyalakan query "Detil Pendidikan Terakhir".</li>
                    <li><strong className="text-slate-300">PBN Open + Edu + HB</strong> - Jika menyalakan query "Detil Pendidikan Terakhir" dan "Tujuan Pensiun/Homebase".</li>
                  </ul>
                </li>
              </ol>
            ) : (
              <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-300">
                <li>Download data format Excel dari Sitasi.</li>
                <li>Buka file dan pilih <strong>Save As</strong> dengan format <strong>.xlsx</strong>, tanpa mengubah apa pun.</li>
                <li>Masuk ke <strong>Aplikasi PBN Cleaner</strong>.</li>
                <li>Upload file yang disimpan pada tahap 2.</li>
                <li>Pilih Cleaning Method (<strong>Sitasi Es.III</strong>/<strong>Sitasi Es.III (Lite)</strong>/<strong>Sitasi Es.IV</strong>) sesuai kebutuhan.</li>
                <li>Pilih tombol <strong>Download Profiles PPTX</strong> di bawah.</li>
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
