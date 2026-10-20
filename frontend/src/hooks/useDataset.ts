import { useState, useCallback, useEffect } from 'react';
import type { DatasetPreview, AppStatus, StoredDatasetRun } from '../types';
import * as api from '../services/api';

export function useDataset() {
  const [status, setStatus] = useState<AppStatus>('idle');
  const [preview, setPreview] = useState<DatasetPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dupStats, setDupStats] = useState<{
    original: number;
    removed: number;
    remaining: number;
  } | null>(null);
  const [runName, setRunName] = useState('');
  const [activeAutoCleanMode, setActiveAutoCleanMode] = useState<string | null>(null);
  const [storedRuns, setStoredRuns] = useState<StoredDatasetRun[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const refreshStoredRuns = useCallback(async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      setStoredRuns(await api.getStoredDatasets());
    } catch (err) {
      setHistoryError((err as Error).message);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void refreshStoredRuns();
  }, [refreshStoredRuns]);

  const clearError = useCallback(() => setError(null), []);

  const reset = useCallback(() => {
    setStatus('idle');
    setPreview(null);
    setError(null);
    setUploadProgress(0);
    setDupStats(null);
    setRunName('');
    setActiveAutoCleanMode(null);
  }, []);

  const upload = useCallback(async (file: File) => {
    setError(null);
    setStatus('uploading');
    setUploadProgress(0);
    try {
      const result = await api.uploadFile(file, setUploadProgress);
      setPreview(result);
      setRunName(file.name.replace(/\.[^/.]+$/, '') || 'Untitled run');
      setActiveAutoCleanMode(null);
      setDupStats(null);
      setStatus('ready');
      void refreshStoredRuns();
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }, []);

  const saveRunName = useCallback(async () => {
    if (!preview || !runName.trim()) return;
    setError(null);
    try {
      await api.updateStoredDatasetName(preview.dataset_id, runName.trim());
      setRunName(runName.trim());
      await refreshStoredRuns();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [preview, refreshStoredRuns, runName]);

  const restoreRun = useCallback(async (datasetId: string) => {
    setError(null);
    setStatus('cleaning');
    try {
      const result = await api.restoreStoredDataset(datasetId);
      setPreview(result);
      setDupStats(null);
      const restored = storedRuns.find((run) => run.dataset_id === datasetId);
      setRunName(restored?.run_name ?? '');
      setStatus('ready');
    } catch (err) {
      setError((err as Error).message);
      setStatus('idle');
    }
  }, [storedRuns]);

  const deleteRun = useCallback(async (datasetId: string) => {
    setHistoryError(null);
    try {
      await api.deleteStoredDataset(datasetId);
      setStoredRuns((runs) => runs.filter((run) => run.dataset_id !== datasetId));
    } catch (err) {
      setHistoryError((err as Error).message);
    }
  }, []);

  const applyRemoveColumns = useCallback(
    async (columnsToKeep: string[]) => {
      if (!preview) return;
      setError(null);
      setStatus('cleaning');
      try {
        const result = await api.removeColumns({
          dataset_id: preview.dataset_id,
          columns_to_keep: columnsToKeep,
          sheet_name: preview.selected_sheet,
        });
        setPreview(result);
        setStatus('ready');
      } catch (err) {
        setError((err as Error).message);
        setStatus('ready');
      }
    },
    [preview]
  );

  const applyRenameColumns = useCallback(
    async (renameMap: Record<string, string>) => {
      if (!preview) return;
      setError(null);
      setStatus('cleaning');
      try {
        const result = await api.renameColumns({
          dataset_id: preview.dataset_id,
          rename_map: renameMap,
          sheet_name: preview.selected_sheet,
        });
        setPreview(result);
        setStatus('ready');
      } catch (err) {
        setError((err as Error).message);
        setStatus('ready');
      }
    },
    [preview]
  );

  const applyRemoveDuplicates = useCallback(
    async (columns: string[]) => {
      if (!preview) return;
      setError(null);
      setStatus('cleaning');
      try {
        const result = await api.removeDuplicates({
          dataset_id: preview.dataset_id,
          columns,
          sheet_name: preview.selected_sheet,
        });
        setPreview(result.preview);
        setDupStats({
          original: result.original_rows,
          removed: result.removed_rows,
          remaining: result.remaining_rows,
        });
        setStatus('ready');
      } catch (err) {
        setError((err as Error).message);
        setStatus('ready');
      }
    },
    [preview]
  );

  const deleteRows = useCallback(
    async (mode: 'first' | 'last' | 'custom', count?: number, row?: number) => {
      if (!preview) return;
      setError(null);
      setStatus('cleaning');
      try {
        const result = await api.deleteRows({
          dataset_id: preview.dataset_id,
          mode,
          count,
          row,
          sheet_name: preview.selected_sheet,
        });
        setPreview(result);
        setStatus('ready');
      } catch (err) {
        setError((err as Error).message);
        setStatus('ready');
      }
    },
    [preview]
  );

  const useFirstRowAsHeader = useCallback(async () => {
    if (!preview) return;
    setError(null);
    setStatus('cleaning');
    try {
      const result = await api.useFirstRowAsHeader({
        dataset_id: preview.dataset_id,
        sheet_name: preview.selected_sheet,
      });
      setPreview(result);
      setStatus('ready');
    } catch (err) {
      setError((err as Error).message);
      setStatus('ready');
    }
  }, [preview]);

  const applyAutoClean = useCallback(
    async (mode: string) => {
      if (!preview) return;
      setError(null);
      setStatus('cleaning');
      try {
        const result = await api.applyAutoClean({
          dataset_id: preview.dataset_id,
          mode,
          sheet_name: preview.selected_sheet,
        });
        setPreview(result);
        setActiveAutoCleanMode(mode);
        setStatus('ready');
      } catch (err) {
        setError((err as Error).message);
        setStatus('ready');
      }
    },
    [preview]
  );

  const downloadCsv = useCallback(() => {
    if (preview) api.downloadCsv(preview.dataset_id, preview.selected_sheet);
  }, [preview]);

  const downloadExcel = useCallback(() => {
    if (preview) api.downloadExcel(preview.dataset_id, preview.selected_sheet);
  }, [preview]);

  const downloadPowerPoint = useCallback(() => {
    if (preview && activeAutoCleanMode) {
      api.downloadPowerPoint(preview.dataset_id, activeAutoCleanMode, preview.selected_sheet);
    }
  }, [activeAutoCleanMode, preview]);

  const selectSheet = useCallback(
    (sheetName: string) => {
      if (!preview) return;
      const target = preview.sheets.find((sheet) => sheet.name === sheetName);
      if (!target) return;

      setPreview({
        ...preview,
        selected_sheet: sheetName,
        columns: target.columns,
        rows: target.rows,
        row_count: target.row_count,
        column_count: target.column_count,
      });
    },
    [preview]
  );

  return {
    status,
    preview,
    error,
    uploadProgress,
    dupStats,
    runName,
    activeAutoCleanMode,
    setRunName,
    storedRuns,
    isLoadingHistory,
    historyError,
    clearError,
    reset,
    upload,
    saveRunName,
    restoreRun,
    deleteRun,
    refreshStoredRuns,
    applyRemoveColumns,
    applyRenameColumns,
    applyRemoveDuplicates,
    deleteRows,
    useFirstRowAsHeader,
    applyAutoClean,
    selectSheet,
    downloadCsv,
    downloadExcel,
    downloadPowerPoint,
  };
}
