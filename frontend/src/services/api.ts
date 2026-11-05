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
  PltPlhMonitoringRecord,
  PltPlhRecordFields,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:8000`;

export function getSnakeGameUrl(): string {
  return new URL('/games/snake', BASE_URL).toString();
}

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60_000,
});

export type ApiDiagnostic = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

type OpenApiDocument = {
  paths?: Record<string, Record<string, unknown>>;
};

function hasRoutes(
  document: OpenApiDocument,
  routes: Array<{ path: string; method: string }>,
): boolean {
  return routes.every(({ path, method }) =>
    Object.keys(document.paths?.[path] ?? {}).some((key) => key.toLowerCase() === method),
  );
}

function diagnostic(
  id: string,
  label: string,
  passed: boolean,
  detail: string,
): ApiDiagnostic {
  return { id, label, passed, detail };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runApiDiagnostics(): Promise<ApiDiagnostic[]> {
  const [healthResult, openApiResult, datasetsResult, pltPlhResult] = await Promise.allSettled([
    api.get<{ status: string }>('/health', { timeout: 10_000 }),
    api.get<OpenApiDocument>('/openapi.json', { timeout: 10_000 }),
    getStoredDatasets(),
    Promise.all([getPltPlhRecords(), getPltPlhNotifications()]),
  ]);

  const diagnostics: ApiDiagnostic[] = [];

  if (healthResult.status === 'fulfilled' && healthResult.value.data.status === 'ok') {
    diagnostics.push(diagnostic('api', 'Koneksi API', true, 'API merespons normal.'));
  } else {
    diagnostics.push(diagnostic(
      'api',
      'Koneksi API',
      false,
      healthResult.status === 'rejected'
        ? describeError(healthResult.reason)
        : `Status API tidak sesuai: ${healthResult.value.data.status || 'kosong'}.`,
    ));
  }

  if (openApiResult.status === 'rejected') {
    const error = describeError(openApiResult.reason);
    diagnostics.push(
      diagnostic('cleaning', 'PBN Analytics · Cleaning', false, error),
      diagnostic('dataset', 'PBN Analytics · Dataset & Export', false, error),
      diagnostic('insights', 'Insight Hub', false, error),
      diagnostic('plt-plh', 'Manajemen Plt./Plh.', false, error),
    );
    return diagnostics;
  }

  const openApi = openApiResult.value.data;
  const routeGroups = [
    {
      id: 'cleaning',
      label: 'PBN Analytics · Cleaning',
      routes: [
        { path: '/upload', method: 'post' },
        { path: '/clean/recommend-method/{dataset_id}', method: 'get' },
        { path: '/clean/remove-columns', method: 'post' },
        { path: '/clean/rename-columns', method: 'post' },
        { path: '/clean/remove-duplicates', method: 'post' },
        { path: '/clean/delete-rows', method: 'post' },
        { path: '/clean/use-first-row-as-header', method: 'post' },
        { path: '/clean/apply-auto-clean', method: 'post' },
        { path: '/clean/history/{dataset_id}', method: 'get' },
      ],
    },
    {
      id: 'dataset',
      label: 'PBN Analytics · Dataset & Export',
      routes: [
        { path: '/dataset/{dataset_id}', method: 'get' },
        { path: '/export/csv/{dataset_id}', method: 'get' },
        { path: '/export/csv/{dataset_id}', method: 'post' },
        { path: '/export/excel/{dataset_id}', method: 'get' },
        { path: '/export/excel/{dataset_id}', method: 'post' },
        { path: '/export/powerpoint/{dataset_id}', method: 'get' },
        { path: '/export/powerpoint/{dataset_id}', method: 'post' },
        { path: '/export/powerpoint/merge', method: 'post' },
        { path: '/stored-datasets', method: 'get' },
      ],
    },
    {
      id: 'insights',
      label: 'Insight Hub',
      routes: [
        { path: '/insights/pbn/dashboard/{dataset_id}', method: 'post' },
        { path: '/insights/pbn/dashboard/{dataset_id}/people', method: 'post' },
      ],
    },
    {
      id: 'plt-plh',
      label: 'Manajemen Plt./Plh.',
      routes: [
        { path: '/plt-plh/records', method: 'get' },
        { path: '/plt-plh/notifications', method: 'get' },
        { path: '/plt-plh/records/export', method: 'get' },
        { path: '/plt-plh/records', method: 'post' },
        { path: '/plt-plh/records/{record_id}', method: 'put' },
        { path: '/plt-plh/records/{record_id}/active', method: 'patch' },
        { path: '/plt-plh/records/{record_id}', method: 'delete' },
      ],
    },
    {
      id: 'games',
      label: 'Mini Game · Snake',
      routes: [{ path: '/games/snake', method: 'get' }],
    },
  ];

  diagnostics.push(...routeGroups.map(({ id, label, routes }) => {
    const passed = hasRoutes(openApi, routes);
    return diagnostic(
      id,
      label,
      passed,
      passed ? `${routes.length} endpoint tersedia.` : 'Ada endpoint yang belum terdaftar.',
    );
  }));

  diagnostics.push(
    datasetsResult.status === 'fulfilled'
      ? diagnostic('stored-data', 'Database · Riwayat Dataset', true, `${datasetsResult.value.length} riwayat berhasil dimuat.`)
      : diagnostic('stored-data', 'Database · Riwayat Dataset', false, describeError(datasetsResult.reason)),
    pltPlhResult.status === 'fulfilled'
      ? diagnostic('plt-plh-data', 'Database · Data Plt./Plh.', true, 'Data monitoring berhasil dimuat.')
      : diagnostic('plt-plh-data', 'Database · Data Plt./Plh.', false, describeError(pltPlhResult.reason)),
  );

  return diagnostics;
}

export async function getPltPlhRecords(): Promise<PltPlhMonitoringRecord[]> {
  const { data } = await api.get<PltPlhMonitoringRecord[]>('/plt-plh/records');
  return data;
}

export async function getPltPlhNotifications(): Promise<PltPlhMonitoringRecord[]> {
  const { data } = await api.get<PltPlhMonitoringRecord[]>('/plt-plh/notifications');
  return data;
}

export async function createPltPlhRecord(
  fields: PltPlhRecordFields,
  editPassword: string,
): Promise<PltPlhMonitoringRecord> {
  const { data } = await api.post<PltPlhMonitoringRecord>('/plt-plh/records', {
    ...fields,
    edit_password: editPassword,
  });
  return data;
}

export async function updatePltPlhRecord(
  recordId: number,
  fields: PltPlhRecordFields,
  editPassword: string,
): Promise<PltPlhMonitoringRecord> {
  const { data } = await api.put<PltPlhMonitoringRecord>(`/plt-plh/records/${recordId}`, {
    ...fields,
    edit_password: editPassword,
  });
  return data;
}

export async function setPltPlhRecordActive(
  recordId: number,
  isActive: boolean,
  editPassword: string,
): Promise<PltPlhMonitoringRecord> {
  const { data } = await api.patch<PltPlhMonitoringRecord>(`/plt-plh/records/${recordId}/active`, {
    is_active: isActive,
    edit_password: editPassword,
  });
  return data;
}

export async function deletePltPlhRecord(recordId: number, editPassword: string): Promise<void> {
  await api.delete(`/plt-plh/records/${recordId}`, { data: { edit_password: editPassword } });
}

export async function downloadPltPlhRecords(): Promise<void> {
  const { data } = await api.get<Blob>('/plt-plh/records/export', { responseType: 'blob' });
  downloadBlob(data, 'manajemen_plt_plh.xlsx');
}

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

export function downloadCombinedPowerPoint(
  presentation: Blob,
  filename = 'sitasi_profiles_combined.pptx',
): void {
  downloadBlob(presentation, filename);
}
