import axios from 'axios';
import type {
  DatasetPreview,
  RemoveColumnsPayload,
  RenameColumnsPayload,
  RemoveDuplicatesPayload,
  RemoveDuplicatesResponse,
  DeleteRowsPayload,
  UseFirstRowAsHeaderPayload,
  AutoCleanPayload,
  StoredDatasetRun,
  CleaningMethodRecommendation,
  PbnDashboardFilters,
  PbnDashboardPeopleResponse,
  PbnDashboardResponse,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:8000`;

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60_000,
});

// ─── Interceptors ───────────────────────────────────────────────────────────

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const detail =
      err.response?.data?.detail ??
      err.message ??
      'An unexpected error occurred.';
    return Promise.reject(new Error(typeof detail === 'string' ? detail : JSON.stringify(detail)));
  }
);

// ─── Upload ─────────────────────────────────────────────────────────────────

export async function uploadFile(
  file: File,
  onProgress?: (pct: number) => void
): Promise<DatasetPreview> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<DatasetPreview>('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    },
  });
  return data;
}

// ─── Dataset ────────────────────────────────────────────────────────────────

export async function getDataset(datasetId: string): Promise<DatasetPreview> {
  const { data } = await api.get<DatasetPreview>(`/dataset/${datasetId}`);
  return data;
}

export async function recommendCleaningMethod(
  datasetId: string,
  sheetName: string
): Promise<CleaningMethodRecommendation> {
  const { data } = await api.get<CleaningMethodRecommendation>(
    `/clean/recommend-method/${datasetId}`,
    { params: { sheet_name: sheetName } }
  );
  return data;
}

export async function getStoredDatasets(): Promise<StoredDatasetRun[]> {
  const { data } = await api.get<StoredDatasetRun[]>('/stored-datasets');
  return data;
}

export async function updateStoredDatasetName(datasetId: string, runName: string): Promise<void> {
  await api.put(`/stored-datasets/${datasetId}/name`, { run_name: runName });
}

export async function restoreStoredDataset(datasetId: string): Promise<DatasetPreview> {
  const { data } = await api.post<DatasetPreview>(`/stored-datasets/${datasetId}/restore`);
  return data;
}

export async function deleteStoredDataset(datasetId: string): Promise<void> {
  await api.delete(`/stored-datasets/${datasetId}`);
}

export async function getPbnDashboard(
  datasetId: string,
  sheetName: string,
  filters: PbnDashboardFilters
): Promise<PbnDashboardResponse> {
  const { data } = await api.post<PbnDashboardResponse>(
    `/insights/pbn/dashboard/${datasetId}`,
    filters,
    { params: { sheet_name: sheetName } }
  );
  return data;
}

export async function getPbnDashboardPeople(
  datasetId: string,
  sheetName: string,
  filters: PbnDashboardFilters
): Promise<PbnDashboardPeopleResponse> {
  const { data } = await api.post<PbnDashboardPeopleResponse>(
    `/insights/pbn/dashboard/${datasetId}/people`,
    filters,
    { params: { sheet_name: sheetName } }
  );
  return data;
}

// ─── Cleaning ───────────────────────────────────────────────────────────────

export async function removeColumns(
  payload: RemoveColumnsPayload
): Promise<DatasetPreview> {
  const { data } = await api.post<DatasetPreview>('/clean/remove-columns', payload);
  return data;
}

export async function renameColumns(
  payload: RenameColumnsPayload
): Promise<DatasetPreview> {
  const { data } = await api.post<DatasetPreview>('/clean/rename-columns', payload);
  return data;
}

export async function removeDuplicates(
  payload: RemoveDuplicatesPayload
): Promise<RemoveDuplicatesResponse> {
  const { data } = await api.post<RemoveDuplicatesResponse>(
    '/clean/remove-duplicates',
    payload
  );
  return data;
}

export async function deleteRows(
  payload: DeleteRowsPayload
): Promise<DatasetPreview> {
  const { data } = await api.post<DatasetPreview>('/clean/delete-rows', payload);
  return data;
}

export async function useFirstRowAsHeader(
  payload: UseFirstRowAsHeaderPayload
): Promise<DatasetPreview> {
  const { data } = await api.post<DatasetPreview>(
    '/clean/use-first-row-as-header',
    payload
  );
  return data;
}

export async function applyAutoClean(payload: AutoCleanPayload): Promise<DatasetPreview> {
  const { data } = await api.post<DatasetPreview>('/clean/apply-auto-clean', payload);
  return data;
}

// ─── Export ─────────────────────────────────────────────────────────────────

function downloadFilteredExport(path: string, filename: string, params: Record<string, string>, filters?: Record<string, string[]>): void {
  api.post<Blob>(path, filters ?? {}, { params, responseType: 'blob' }).then(({ data }) => {
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  });
}

export function downloadCsv(datasetId: string, sheetName: string, filters: Record<string, string[]> = {}): void {
  downloadFilteredExport(`/export/csv/${datasetId}`, 'cleaned_data.csv', { sheet_name: sheetName }, filters);
}

export function downloadExcel(datasetId: string, sheetName: string, filters: Record<string, string[]> = {}): void {
  downloadFilteredExport(`/export/excel/${datasetId}`, 'cleaned_data.xlsx', { sheet_name: sheetName }, filters);
}

export function downloadPowerPoint(datasetId: string, mode: string, sheetName: string, filters: Record<string, string[]> = {}): void {
  downloadFilteredExport(`/export/powerpoint/${datasetId}`, 'sitasi_profiles.pptx', { mode, sheet_name: sheetName }, filters);
}
