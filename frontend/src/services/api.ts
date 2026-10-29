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
  async (err) => {
    const detail =
      err.response?.data?.detail ??
      err.message ??
      'An unexpected error occurred.';
    if (err.response?.data instanceof Blob) {
      const responseText = await err.response.data.text();
      try {
        const responseBody = JSON.parse(responseText) as { detail?: unknown };
        return Promise.reject(
          new Error(
            typeof responseBody.detail === 'string'
              ? responseBody.detail
              : responseText || err.message,
          )
        );
      } catch {
        return Promise.reject(new Error(responseText || err.message));
      }
    }
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

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function requestFilteredExport(
  path: string,
  params: Record<string, string>,
  filters?: Record<string, string[]>,
): Promise<Blob> {
  return api.post<Blob>(path, filters ?? {}, { params, responseType: 'blob' })
    .then(({ data }) => data);
}

function downloadFilteredExport(
  path: string,
  filename: string,
  params: Record<string, string>,
  filters?: Record<string, string[]>,
): void {
  void requestFilteredExport(path, params, filters)
    .then((blob) => downloadBlob(blob, filename));
}

export function downloadCsv(datasetId: string, sheetName: string, filters: Record<string, string[]> = {}): void {
  downloadFilteredExport(`/export/csv/${datasetId}`, 'cleaned_data.csv', { sheet_name: sheetName }, filters);
}

export function downloadExcel(datasetId: string, sheetName: string, filters: Record<string, string[]> = {}): void {
  downloadFilteredExport(`/export/excel/${datasetId}`, 'cleaned_data.xlsx', { sheet_name: sheetName }, filters);
}

export type SitasiEsIIITemplateVariant = 'standard' | 'three-row';

export function downloadPowerPoint(
  datasetId: string,
  mode: string,
  sheetName: string,
  filters: Record<string, string[]> = {},
  templateVariant: SitasiEsIIITemplateVariant = 'standard',
): void {
  const filename = mode === 'Sitasi Es.III' && templateVariant === 'three-row'
    ? 'sitasi_esiii_profiles_3_row.pptx'
    : 'sitasi_profiles.pptx';
  void generatePowerPoint(datasetId, mode, sheetName, filters, templateVariant)
    .then((blob) => downloadBlob(blob, filename));
}

export function generatePowerPoint(
  datasetId: string,
  mode: string,
  sheetName: string,
  filters: Record<string, string[]> = {},
  templateVariant: SitasiEsIIITemplateVariant = 'standard',
): Promise<Blob> {
  return requestFilteredExport(
    `/export/powerpoint/${datasetId}`,
    { mode, sheet_name: sheetName, template_variant: templateVariant },
    filters,
  );
}

export async function combinePowerPoints(presentations: Blob[]): Promise<Blob> {
  const form = new FormData();
  presentations.forEach((presentation, index) => {
    form.append('files', presentation, `staged-${index + 1}.pptx`);
  });
  const { data } = await api.post<Blob>('/export/powerpoint/merge', form, {
    responseType: 'blob',
    timeout: 120_000,
  });
  return data;
}

export function downloadCombinedPowerPoint(presentation: Blob): void {
  downloadBlob(presentation, 'sitasi_profiles_combined.pptx');
}
