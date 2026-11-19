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
  PltPlhEmployeeOption,
  PltPlhRecordFields,
  AdminUserPayload,
  AdminUserUpdatePayload,
  AuthRegistrationPayload,
  AuthSessionResponse,
  AuthUser,
  MenuAccessPolicy,
  MutationWorkspace,
  MutationLookupResponse,
  PbnOpenCsvValidation,
  PbnOpenDataSourceSyncStatus,
  DatabaseMaintenanceTarget,
  DatabaseMaintenancePreview,
  DatabaseMaintenanceResult,
  PerformanceAnalysisResponse,
  PerformanceDashboardResponse,
  PerformanceGroupBy,
  PerformanceInsight,
  PerformanceRecord,
  PerformanceRecordsResponse,
  PerformanceEmployeeSource,
  PerformanceCorrectionSyncPreview,
  PerformanceCorrectionSyncResult,
  PerformanceCorrectionSourceYear,
  PerformanceCorrectionEditRequest,
  PerformanceCorrectionEditResult,
  PerformanceCorrectionEditLogPage,
  PerformanceCorrectionBatchResult,
  PerformanceUploadValidation,
  ThemeName,
  ChatMessage,
  ChatResponse,
  FeedbackSubmitPayload,
  UserFeedback,
  PelantikanAgenda,
  PelantikanAgendaDetail,
  PelantikanAgendaFields,
  PelantikanAgendaSummary,
  PelantikanImportStrategy,
  PelantikanAgendaUploadResult,
  PelantikanPersonChoice,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:8000`;

export function getSnakeGameUrl(): string {
  return new URL('/games/snake', BASE_URL).toString();
}

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60_000,
});

export const AUTH_TOKEN_STORAGE_KEY = 'pbn.auth.token';
export const AUTH_GUEST_STORAGE_KEY = 'pbn.auth.guest';
export const AUTH_SESSION_EXPIRED_EVENT = 'pbn:auth-session-expired';

function dispatchSessionExpiredEvent(): void {
  if (window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)) {
    window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
  }
}

function verifySessionAfterForbiddenResponse(): void {
  const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (!token) return;

  void axios.get<AuthUser>('/auth/me', {
    baseURL: BASE_URL,
    timeout: 60_000,
    headers: { Authorization: `Bearer ${token}` },
  }).then(
    () => undefined,
    (error: unknown) => {
      if (
        axios.isAxiosError(error) &&
        (error.response?.status === 401 || error.response?.status === 403)
      ) {
        dispatchSessionExpiredEvent();
      }
    },
  );
}

api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError<{ detail?: unknown }>(error)) {
      const status = error.response?.status;
      const detail = error.response?.data?.detail;
      const isExpiredSession =
        status === 401 ||
        (status === 403 &&
          typeof detail === 'string' &&
          /session (expired|invalid)|authentication is required/i.test(detail));

      if (isExpiredSession) {
        dispatchSessionExpiredEvent();
      } else if (status === 403) {
        verifySessionAfterForbiddenResponse();
      }
    }

    return Promise.reject(error);
  },
);

export async function login(user: string, password: string): Promise<AuthSessionResponse> {
  const { data } = await api.post<AuthSessionResponse>('/auth/login', { user, password });
  return data;
}

export async function register(payload: AuthRegistrationPayload): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>('/auth/register', payload);
  return data;
}

export async function getCurrentUser(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me');
  return data;
}

export async function getMenuAccessSettings(): Promise<MenuAccessPolicy[]> {
  const { data } = await api.get<{ policies: MenuAccessPolicy[] }>('/menu-access');
  return data.policies;
}

export async function listMutationWorkspaces(): Promise<MutationWorkspace[]> {
  const { data } = await api.get<MutationWorkspace[]>('/mutation-analysis/workspaces');
  return data;
}

export async function createMutationWorkspace(payload: {
  eselon_choice: 'Administrator' | 'Pengawas';
  title: string;
  tmt: string;
  description: string;
  status: 'Aktif' | 'Inaktif';
}): Promise<MutationWorkspace> {
  const { data } = await api.post<MutationWorkspace>(
    '/mutation-analysis/workspaces',
    payload,
  );
  return data;
}

export async function updateMutationWorkspace(
  workspaceId: string,
  payload: {
    title: string;
    tmt: string;
    description: string;
    status: 'Aktif' | 'Inaktif';
  },
): Promise<MutationWorkspace> {
  const { data } = await api.put<MutationWorkspace>(
    `/mutation-analysis/workspaces/${encodeURIComponent(workspaceId)}`,
    payload,
  );
  return data;
}

export async function assignMutationWorkspaceDataset(
  workspaceId: string,
  datasetId: string,
): Promise<MutationWorkspace> {
  const { data } = await api.put<MutationWorkspace>(
    `/mutation-analysis/workspaces/${encodeURIComponent(workspaceId)}/dataset`,
    { dataset_id: datasetId },
  );
  return data;
}

export async function deleteMutationWorkspace(workspaceId: string): Promise<void> {
  await api.delete(`/mutation-analysis/workspaces/${encodeURIComponent(workspaceId)}`);
}

export async function lookupMutationNips(nips: string[]): Promise<MutationLookupResponse> {
  const { data } = await api.post<MutationLookupResponse>(
    '/mutation-analysis/lookup-nips',
    { nips },
  );
  return data;
}

export async function updateMenuAccessSettings(
  policies: MenuAccessPolicy[],
): Promise<MenuAccessPolicy[]> {
  const { data } = await api.put<{ policies: MenuAccessPolicy[] }>('/menu-access', { policies });
  return data.policies;
}

export async function getThemePreference(): Promise<ThemeName> {
  const { data } = await api.get<{ theme: ThemeName }>('/auth/preferences/theme');
  return data.theme;
}

export async function updateThemePreference(theme: ThemeName): Promise<void> {
  await api.put('/auth/preferences/theme', { theme });
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export async function listAdminUsers(): Promise<AuthUser[]> {
  const { data } = await api.get<AuthUser[]>('/admin/users');
  return data;
}

export async function createAdminUser(payload: AdminUserPayload): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>('/admin/users', payload);
  return data;
}

export async function updateAdminUser(
  username: string,
  payload: AdminUserUpdatePayload,
): Promise<AuthUser> {
  const { data } = await api.put<AuthUser>(
    `/admin/users/${encodeURIComponent(username)}`,
    payload,
  );
  return data;
}

export async function deleteAdminUser(username: string): Promise<void> {
  await api.delete(`/admin/users/${encodeURIComponent(username)}`);
}

export async function submitUserFeedback(payload: FeedbackSubmitPayload): Promise<UserFeedback> {
  const { data } = await api.post<UserFeedback>('/feedback', payload);
  return data;
}

export async function listAdminFeedback(): Promise<UserFeedback[]> {
  const { data } = await api.get<UserFeedback[]>('/feedback');
  return data;
}

export async function deleteAdminFeedback(feedbackId: number): Promise<void> {
  await api.delete(`/feedback/${feedbackId}`);
}

export async function clearAdminFeedback(): Promise<{ deleted_count: number }> {
  const { data } = await api.delete<{ deleted_count: number }>('/feedback');
  return data;
}

export async function validatePbnOpenCsv(file: File): Promise<PbnOpenCsvValidation> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<PbnOpenCsvValidation>('/admin/pbnopen-data-source/validate', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getPbnOpenDataSourceSyncStatus(): Promise<PbnOpenDataSourceSyncStatus> {
  const { data } = await api.get<PbnOpenDataSourceSyncStatus>(
    '/admin/pbnopen-data-source/status',
  );
  return data;
}

export async function replacePbnOpenCsv(file: File): Promise<{ message: string; row_count: number }> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<{ message: string; row_count: number }>(
    '/admin/pbnopen-data-source/replace',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

export async function syncDtEmployeeFromPbnOpen(): Promise<{ message: string; row_count: number }> {
  try {
    const { data } = await api.post<{ message: string; row_count: number }>(
      '/admin/dt-employee/sync',
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError<{ detail?: unknown }>(error)) {
      const detail = error.response?.data.detail;
      if (typeof detail === 'string') throw new Error(detail);
    }
    throw error;
  }
}

function getAdminDatabaseError(error: unknown): Error {
  if (axios.isAxiosError<{ detail?: unknown }>(error)) {
    const detail = error.response?.data.detail;
    if (typeof detail === 'string') return new Error(detail);
  }
  return error instanceof Error ? error : new Error(String(error));
}

export async function getDatabaseMaintenanceTargets(): Promise<DatabaseMaintenanceTarget[]> {
  try {
    const { data } = await api.get<{ tables: DatabaseMaintenanceTarget[] }>(
      '/admin/database/tables',
    );
    return data.tables;
  } catch (error) {
    throw getAdminDatabaseError(error);
  }
}

export async function previewDatabaseMaintenanceCsv(
  targetKey: string,
  file: File,
): Promise<DatabaseMaintenancePreview> {
  const form = new FormData();
  form.append('file', file);
  try {
    const { data } = await api.post<DatabaseMaintenancePreview>(
      `/admin/database/${encodeURIComponent(targetKey)}/preview`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data;
  } catch (error) {
    throw getAdminDatabaseError(error);
  }
}

export async function applyDatabaseMaintenanceCsv(
  targetKey: string,
  file: File,
): Promise<DatabaseMaintenanceResult> {
  const form = new FormData();
  form.append('file', file);
  try {
    const { data } = await api.post<DatabaseMaintenanceResult>(
      `/admin/database/${encodeURIComponent(targetKey)}/apply`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data;
  } catch (error) {
    throw getAdminDatabaseError(error);
  }
}

export async function previewDatabaseEmployeeSync(
  targetKey: string,
): Promise<DatabaseMaintenancePreview> {
  try {
    const { data } = await api.post<DatabaseMaintenancePreview>(
      `/admin/database/${encodeURIComponent(targetKey)}/sync/preview`,
    );
    return data;
  } catch (error) {
    throw getAdminDatabaseError(error);
  }
}

export async function syncDatabaseEmployeeTable(
  targetKey: string,
): Promise<DatabaseMaintenanceResult> {
  try {
    const { data } = await api.post<DatabaseMaintenanceResult>(
      `/admin/database/${encodeURIComponent(targetKey)}/sync`,
    );
    return data;
  } catch (error) {
    throw getAdminDatabaseError(error);
  }
}

function getPerformanceRequestError(error: unknown): Error {
  if (axios.isAxiosError<{ detail?: unknown }>(error)) {
    const detail = error.response?.data.detail;
    if (typeof detail === 'string') return new Error(detail);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function createPerformanceUpload(
  file: File,
  period: string,
  employeeSource?: PerformanceEmployeeSource,
): FormData {
  const form = new FormData();
  form.append('file', file);
  form.append('period', period);
  if (employeeSource !== undefined) {
    form.append('employee_source', employeeSource);
  }
  return form;
}

export async function getPerformanceAnalysis(
  groupBy: PerformanceGroupBy,
  period?: string,
): Promise<PerformanceAnalysisResponse> {
  try {
    const { data } = await api.get<PerformanceAnalysisResponse>(
      '/performance/analysis',
      { params: { group_by: groupBy, period } },
    );
    return data;
  } catch (error) {
    throw getPerformanceRequestError(error);
  }
}

export async function getPerformanceDashboard(
  unitEselonII: string,
  eselons: string[],
  period?: string,
  unitEselonIII?: string,
  unitEselonIV?: string,
): Promise<PerformanceDashboardResponse> {
  try {
    const { data } = await api.get<PerformanceDashboardResponse>(
      '/performance/dashboard',
      {
        params: {
          unit_eselon_ii: unitEselonII || undefined,
          unit_eselon_iii: unitEselonIII || undefined,
          unit_eselon_iv: unitEselonIV || undefined,
          eselon: eselons,
          period,
        },
        paramsSerializer: { indexes: null },
      },
    );
    return data;
  } catch (error) {
    throw getPerformanceRequestError(error);
  }
}

export async function deletePerformanceDatasetPeriod(period: string): Promise<void> {
  try {
    await api.delete(`/performance/datasets/${encodeURIComponent(period)}`);
  } catch (error) {
    throw getPerformanceRequestError(error);
  }
}

export async function getPerformanceInsight(): Promise<PerformanceInsight> {
  try {
    const { data } = await api.get<PerformanceInsight>('/performance/insight');
    return data;
  } catch (error) {
    throw getPerformanceRequestError(error);
  }
}

export async function updatePerformanceInsight(content: string): Promise<PerformanceInsight> {
  try {
    const { data } = await api.put<PerformanceInsight>('/performance/insight', { content });
    return data;
  } catch (error) {
    throw getPerformanceRequestError(error);
  }
}

export async function downloadPerformanceUnitAnalysis(period?: string): Promise<Blob> {
  try {
    const { data } = await api.get<Blob>(
      '/performance/exports/unit-eselon-ii',
      { params: { period }, responseType: 'blob' },
    );
    return data;
  } catch (error) {
    throw getPerformanceRequestError(error);
  }
}

export async function downloadPerformanceRecordsExcel(
  search: string,
  filters: Record<string, string> = {},
  sortBy: keyof PerformanceRecord = 'nama',
  sortOrder: 'asc' | 'desc' = 'asc',
  period?: string,
): Promise<Blob> {
  try {
    const { data } = await api.get<Blob>(
      '/performance/exports/records',
      {
        params: {
          search,
          filters: JSON.stringify(filters),
          sort_by: sortBy,
          sort_order: sortOrder,
          period,
        },
        responseType: 'blob',
      },
    );
    return data;
  } catch (error) {
    throw getPerformanceRequestError(error);
  }
}

export async function getPerformanceRecords(
  page: number,
  pageSize: number,
  search: string,
  filters: Record<string, string> = {},
  sortBy: keyof PerformanceRecord = 'nama',
  sortOrder: 'asc' | 'desc' = 'asc',
  period?: string,
): Promise<PerformanceRecordsResponse> {
  try {
    const { data } = await api.get<PerformanceRecordsResponse>(
      '/performance/records',
      {
        params: {
          page,
          page_size: pageSize,
          search,
          filters: JSON.stringify(filters),
          sort_by: sortBy,
          sort_order: sortOrder,
          period,
        },
      },
    );
    return data;
  } catch (error) {
    throw getPerformanceRequestError(error);
  }
}

export async function updatePerformanceCorrection(
  request: PerformanceCorrectionEditRequest,
): Promise<PerformanceCorrectionEditResult> {
  try {
    const { data } = await api.post<PerformanceCorrectionEditResult>(
      '/performance/corrections/manual',
      request,
    );
    return data;
  } catch (error) {
    throw getPerformanceRequestError(error);
  }
}

export async function downloadPerformanceCorrectionBatchTemplate(): Promise<Blob> {
  try {
    const { data } = await api.get<Blob>(
      '/performance/corrections/batch-template',
      { responseType: 'blob' },
    );
    return data;
  } catch (error) {
    throw getPerformanceRequestError(error);
  }
}

export async function batchUpdatePerformanceCorrections(
  file: File,
  period: string,
): Promise<PerformanceCorrectionBatchResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('period', period);
  try {
    const { data } = await api.post<PerformanceCorrectionBatchResult>(
      '/performance/corrections/batch',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data;
  } catch (error) {
    throw getPerformanceRequestError(error);
  }
}

export async function getPerformanceCorrectionEditLog(
  page: number,
  pageSize: number,
): Promise<PerformanceCorrectionEditLogPage> {
  try {
    const { data } = await api.get<PerformanceCorrectionEditLogPage>(
      '/performance/corrections/edit-log',
      { params: { page, page_size: pageSize } },
    );
    return data;
  } catch (error) {
    throw getPerformanceRequestError(error);
  }
}

export async function undoPerformanceCorrectionEdit(
  logId: number,
): Promise<PerformanceCorrectionEditResult> {
  try {
    const { data } = await api.post<PerformanceCorrectionEditResult>(
      `/performance/corrections/edit-log/${logId}/undo`,
    );
    return data;
  } catch (error) {
    throw getPerformanceRequestError(error);
  }
}

export async function validatePerformanceFullData(
  file: File,
  period: string,
  employeeSource: PerformanceEmployeeSource,
): Promise<PerformanceUploadValidation> {
  try {
    const { data } = await api.post<PerformanceUploadValidation>(
      '/performance/full-data/validate',
      createPerformanceUpload(file, period, employeeSource),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data;
  } catch (error) {
    throw getPerformanceRequestError(error);
  }
}

export async function replacePerformanceFullData(
  file: File,
  period: string,
  employeeSource: PerformanceEmployeeSource,
): Promise<PerformanceUploadValidation> {
  try {
    const { data } = await api.post<PerformanceUploadValidation>(
      '/performance/full-data/replace',
      createPerformanceUpload(file, period, employeeSource),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data;
  } catch (error) {
    throw getPerformanceRequestError(error);
  }
}

export async function syncPerformanceCorrections(
  period: string,
  sourceYear: number,
  sourceTw: number,
  conflictResolutions: Record<string, string>,
): Promise<PerformanceCorrectionSyncResult> {
  try {
    const { data } = await api.post<PerformanceCorrectionSyncResult>(
      '/performance/adjustments/sync',
      { conflict_resolutions: conflictResolutions },
      { params: { period, source_year: sourceYear, source_tw: sourceTw } },
    );
    return data;
  } catch (error) {
    throw getPerformanceRequestError(error);
  }
}

export async function getPerformanceCorrectionSourcePeriods(): Promise<PerformanceCorrectionSourceYear[]> {
  try {
    const { data } = await api.get<PerformanceCorrectionSourceYear[]>(
      '/performance/adjustments/source-periods',
    );
    return data;
  } catch (error) {
    throw getPerformanceRequestError(error);
  }
}

export async function checkPerformanceCorrections(
  period: string,
  sourceYear: number,
  sourceTw: number,
): Promise<PerformanceCorrectionSyncPreview> {
  try {
    const { data } = await api.post<PerformanceCorrectionSyncPreview>(
      '/performance/adjustments/check',
      null,
      { params: { period, source_year: sourceYear, source_tw: sourceTw } },
    );
    return data;
  } catch (error) {
    throw getPerformanceRequestError(error);
  }
}

export async function sendChatMessage(messages: ChatMessage[]): Promise<ChatResponse> {
  try {
    const { data } = await api.post<ChatResponse>('/chat', { messages });
    return data;
  } catch (error) {
    if (axios.isAxiosError<{ detail?: string }>(error) && error.response) {
      throw new Error(error.response.data.detail ?? error.message);
    }
    throw error;
  }
}

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
      diagnostic('insights-beta', 'Insight Hub Beta', false, error),
      diagnostic('plt-plh', 'Manajemen Plt./Plh.', false, error),
      diagnostic('pelantikan', 'Undangan Pelantikan', false, error),
      diagnostic('feedback', 'Feedback', false, error),
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
        { path: '/export/powerpoint/baperjakat/{dataset_id}', method: 'post' },
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
      id: 'insights-beta',
      label: 'Insight Hub Beta',
      routes: [
        { path: '/insights-beta/pbn/dashboard', method: 'post' },
        { path: '/insights-beta/pbn/dashboard/people', method: 'post' },
        { path: '/admin/pbnopen-data-source/validate', method: 'post' },
        { path: '/admin/pbnopen-data-source/replace', method: 'post' },
        { path: '/admin/pbnopen-data-source/status', method: 'get' },
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
      id: 'pelantikan',
      label: 'Undangan Pelantikan',
      routes: [
        { path: '/undangan-pelantikan/agendas', method: 'get' },
        { path: '/undangan-pelantikan/agendas', method: 'post' },
        { path: '/undangan-pelantikan/agendas/{agenda_id}', method: 'get' },
        { path: '/undangan-pelantikan/agendas/{agenda_id}', method: 'put' },
        { path: '/undangan-pelantikan/agendas/{agenda_id}', method: 'delete' },
        { path: '/undangan-pelantikan/agendas/{agenda_id}/upload', method: 'post' },
        { path: '/undangan-pelantikan/agendas/{agenda_id}/upload-sheets', method: 'post' },
        { path: '/undangan-pelantikan/agendas/{agenda_id}/upload-all-sheets', method: 'post' },
        { path: '/undangan-pelantikan/agendas/{agenda_id}/sheets', method: 'post' },
        { path: '/undangan-pelantikan/agendas/{agenda_id}/people', method: 'put' },
        { path: '/undangan-pelantikan/agendas/{agenda_id}/generate', method: 'post' },
        { path: '/undangan-pelantikan/agendas/{agenda_id}/generate-selected', method: 'post' },
      ],
    },
    {
      id: 'feedback',
      label: 'Feedback',
      routes: [
        { path: '/feedback', method: 'post' },
        { path: '/feedback', method: 'get' },
        { path: '/feedback', method: 'delete' },
        { path: '/feedback/{feedback_id}', method: 'delete' },
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

export async function searchPltPlhEmployees(query: string): Promise<PltPlhEmployeeOption[]> {
  const { data } = await api.get<PltPlhEmployeeOption[]>('/plt-plh/employees', {
    params: { q: query },
  });
  return data;
}

export async function getPltPlhNotifications(): Promise<PltPlhMonitoringRecord[]> {
  const { data } = await api.get<PltPlhMonitoringRecord[]>('/plt-plh/notifications');
  return data;
}

export async function createPltPlhRecord(fields: PltPlhRecordFields): Promise<PltPlhMonitoringRecord> {
  const { data } = await api.post<PltPlhMonitoringRecord>('/plt-plh/records', fields);
  return data;
}

export async function updatePltPlhRecord(
  recordId: number,
  fields: PltPlhRecordFields,
): Promise<PltPlhMonitoringRecord> {
  const { data } = await api.put<PltPlhMonitoringRecord>(`/plt-plh/records/${recordId}`, fields);
  return data;
}

export async function setPltPlhRecordActive(
  recordId: number,
  isActive: boolean,
): Promise<PltPlhMonitoringRecord> {
  const { data } = await api.patch<PltPlhMonitoringRecord>(`/plt-plh/records/${recordId}/active`, {
    is_active: isActive,
  });
  return data;
}

export async function deletePltPlhRecord(recordId: number): Promise<void> {
  await api.delete(`/plt-plh/records/${recordId}`);
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
  return uploadDataset('/upload', file, onProgress);
}

export async function uploadMutationWorkspaceFile(
  workspaceId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<DatasetPreview> {
  return uploadDataset(
    `/mutation-analysis/workspaces/${encodeURIComponent(workspaceId)}/upload`,
    file,
    onProgress,
  );
}

async function uploadDataset(
  path: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<DatasetPreview> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<DatasetPreview>(path, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    },
  });
  return data;
}

export async function listPelantikanAgendas(): Promise<PelantikanAgendaSummary[]> {
  const { data } = await api.get<PelantikanAgendaSummary[]>('/undangan-pelantikan/agendas');
  return data;
}

export async function createPelantikanAgenda(
  payload: PelantikanAgendaFields,
  workflowMode: 'single_sheet' | 'all_sheets' = 'single_sheet',
): Promise<PelantikanAgenda> {
  const { data } = await api.post<PelantikanAgenda>('/undangan-pelantikan/agendas', {
    ...payload,
    workflow_mode: workflowMode,
  });
  return data;
}

export async function getPelantikanAgenda(agendaId: string): Promise<PelantikanAgendaDetail> {
  const { data } = await api.get<PelantikanAgendaDetail>(
    `/undangan-pelantikan/agendas/${encodeURIComponent(agendaId)}`,
  );
  return data;
}

export async function updatePelantikanAgenda(
  agendaId: string,
  payload: PelantikanAgendaFields,
): Promise<PelantikanAgenda> {
  const { data } = await api.put<PelantikanAgenda>(
    `/undangan-pelantikan/agendas/${encodeURIComponent(agendaId)}`,
    payload,
  );
  return data;
}

export async function uploadPelantikanExcel(
  agendaId: string,
  file: File,
  sheetName?: string,
): Promise<PelantikanAgendaUploadResult> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<PelantikanAgendaUploadResult>(
    `/undangan-pelantikan/agendas/${encodeURIComponent(agendaId)}/upload`,
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: sheetName ? { sheet_name: sheetName } : undefined,
    },
  );
  return data;
}

export async function uploadPelantikanExcelAllSheets(
  agendaId: string,
  file: File,
): Promise<PelantikanAgendaUploadResult> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<PelantikanAgendaUploadResult>(
    `/undangan-pelantikan/agendas/${encodeURIComponent(agendaId)}/upload-all-sheets`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

export async function uploadPelantikanExcelWithStrategy(
  agendaId: string,
  file: File,
  importStrategy: PelantikanImportStrategy,
  sheetNames: string[] = [],
): Promise<PelantikanAgendaUploadResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('import_strategy', importStrategy);
  sheetNames.forEach((sheetName) => form.append('sheet_names', sheetName));
  const { data } = await api.post<PelantikanAgendaUploadResult>(
    `/undangan-pelantikan/agendas/${encodeURIComponent(agendaId)}/upload-sheets`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

export async function listPelantikanWorkbookSheets(
  agendaId: string,
  file: File,
): Promise<string[]> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<string[]>(
    `/undangan-pelantikan/agendas/${encodeURIComponent(agendaId)}/sheets`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

export async function savePelantikanPeople(
  agendaId: string,
  people: PelantikanPersonChoice[],
): Promise<PelantikanAgendaDetail> {
  const { data } = await api.put<PelantikanAgendaDetail>(
    `/undangan-pelantikan/agendas/${encodeURIComponent(agendaId)}/people`,
    { people },
  );
  return data;
}

export async function generatePelantikanDocuments(agendaId: string): Promise<Blob> {
  const { data } = await api.post<Blob>(
    `/undangan-pelantikan/agendas/${encodeURIComponent(agendaId)}/generate`,
    undefined,
    { responseType: 'blob' },
  );
  return data;
}

export async function generateSelectedPelantikanDocuments(
  agendaId: string,
  personIds: number[],
): Promise<Blob> {
  const { data } = await api.post<Blob>(
    `/undangan-pelantikan/agendas/${encodeURIComponent(agendaId)}/generate-selected`,
    { person_ids: personIds },
    { responseType: 'blob' },
  );
  return data;
}

export async function generatePelantikanAppendix(agendaId: string): Promise<Blob> {
  const { data } = await api.post<Blob>(
    `/undangan-pelantikan/agendas/${encodeURIComponent(agendaId)}/appendix`,
    undefined,
    { responseType: 'blob' },
  );
  return data;
}

export async function exportPelantikanMonitoring(agendaId: string): Promise<Blob> {
  const { data } = await api.get<Blob>(
    `/undangan-pelantikan/agendas/${encodeURIComponent(agendaId)}/monitoring-export`,
    { responseType: 'blob' },
  );
  return data;
}

export async function deletePelantikanAgenda(agendaId: string): Promise<void> {
  await api.delete(`/undangan-pelantikan/agendas/${encodeURIComponent(agendaId)}`);
}

export function downloadPelantikanDocuments(blob: Blob, filename: string): void {
  downloadBlob(blob, filename);
}

export function downloadPelantikanAppendix(blob: Blob, filename: string): void {
  downloadBlob(blob, filename);
}

export function downloadPelantikanMonitoring(blob: Blob, filename: string): void {
  downloadBlob(blob, filename);
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

export async function getPbnOpenDatabaseDashboard(
  filters: PbnDashboardFilters
): Promise<PbnDashboardResponse> {
  const { data } = await api.post<PbnDashboardResponse>(
    '/insights-beta/pbn/dashboard',
    filters
  );
  return data;
}

export async function getPbnOpenDatabaseDashboardPeople(
  filters: PbnDashboardFilters
): Promise<PbnDashboardPeopleResponse> {
  const { data } = await api.post<PbnDashboardPeopleResponse>(
    '/insights-beta/pbn/dashboard/people',
    filters
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

export function generateBaperjakatPowerPoint(
  datasetId: string,
  sheetName: string,
  filters: Record<string, string[]> = {},
): Promise<Blob> {
  return requestFilteredExport(
    `/export/powerpoint/baperjakat/${datasetId}`,
    { sheet_name: sheetName },
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
