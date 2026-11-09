// ─── Dataset Types ─────────────────────────────────────────────────────────

export interface SheetPreview {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  column_count: number;
}

export interface DatasetPreview {
  dataset_id: string;
  selected_sheet: string;
  sheets: SheetPreview[];
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  column_count: number;
  cleaning_warnings?: string[];
}

export interface StoredDatasetRun {
  dataset_id: string;
  run_name: string;
  original_filename: string;
  latest_version: number;
  updated_at: string;
}

export type PltPlhStatus = 'Inaktif' | 'Aktif' | 'Mendekati 6 Bulan' | 'Lebih dari 6 Bulan';

export interface PltPlhMonitoringRecord {
  id: number;
  jabatan_kosong: string;
  pejabat_pengganti: string;
  jabatan_definitif_pengganti: string;
  nomor_surat: string;
  tmt: string;
  masa_kerja_tahun: number;
  masa_kerja_bulan: number;
  masa_kerja: string;
  status: PltPlhStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PltPlhRecordFields {
  jabatan_kosong: string;
  pejabat_pengganti: string;
  jabatan_definitif_pengganti: string;
  nomor_surat: string;
  tmt: string;
}

export type AuthLevel = 1 | 2 | 3;

export interface AuthUser {
  user: string;
  name: string;
  auth_level: AuthLevel;
  is_active: boolean;
  created_at: string;
}

export interface AuthSessionResponse {
  token: string;
  user: AuthUser;
}

export type ThemeName = 'default' | 'dark' | 'light';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  message: string;
}

export interface AuthRegistrationPayload {
  user: string;
  name: string;
  password: string;
}

export interface AdminUserPayload extends AuthRegistrationPayload {
  auth_level: AuthLevel;
}

export interface AdminUserUpdatePayload {
  name: string;
  auth_level: AuthLevel;
  password?: string;
  is_active: boolean;
}

export interface PbnOpenCsvValidation {
  filename: string;
  columns: string[];
  row_count: number;
}

export interface CleaningMethodRecommendation {
  dataset_id: string;
  sheet_name: string;
  recommended_mode: string | null;
  template_name: string | null;
  confidence: 'high' | 'ambiguous' | 'none';
  reason: string;
}

export interface PbnDashboardFilters {
  age_min?: number;
  age_max?: number;
  tenure_min?: number;
  tenure_max?: number;
  eselon: string[];
  education: string[];
  region: string[];
  unit: string[];
  rumpun: string[];
}

export interface PbnDashboardCount {
  label: string;
  count: number;
  percentage: number;
}

export interface PbnDashboardResponse {
  dataset_id: string;
  sheet_name: string;
  total_employees: number;
  sex_distribution: PbnDashboardCount[];
  age_group_distribution: PbnDashboardCount[];
  region_distribution: PbnDashboardCount[];
  education_level_distribution: PbnDashboardCount[];
  education_group_distribution: PbnDashboardCount[];
  unit_distribution: PbnDashboardCount[];
  religion_distribution: PbnDashboardCount[];
  available_filters: {
    age: { min: number; max: number };
    tenure: { min: number; max: number };
    eselon: string[];
    education: string[];
    region: string[];
    unit: string[];
    rumpun: string[];
  };
}

export interface PbnDashboardPeopleResponse {
  dataset_id: string;
  sheet_name: string;
  people: Array<{
    index: number;
    Nama: string | null;
    Eselon: string | null;
    Jabatan: string | null;
    'Pendidikan Terakhir (Th.)': string | null;
    Jurusan: string | null;
    'Universitas/Sekolah Tinggi': string | null;
  }>;
}

export interface RemoveDuplicatesResponse {
  dataset_id: string;
  original_rows: number;
  removed_rows: number;
  remaining_rows: number;
  preview: DatasetPreview;
}

// ─── API Payloads ───────────────────────────────────────────────────────────

export interface RemoveColumnsPayload {
  dataset_id: string;
  columns_to_keep: string[];
  sheet_name?: string;
}

export interface RenameColumnsPayload {
  dataset_id: string;
  rename_map: Record<string, string>;
  sheet_name?: string;
}

export interface RemoveDuplicatesPayload {
  dataset_id: string;
  columns: string[];
  sheet_name?: string;
}

export interface DeleteRowsPayload {
  dataset_id: string;
  mode: 'first' | 'last' | 'custom';
  count?: number;
  row?: number;
  sheet_name?: string;
}

export interface UseFirstRowAsHeaderPayload {
  dataset_id: string;
  sheet_name?: string;
}

export interface AutoCleanPayload {
  dataset_id: string;
  mode: string;
  sheet_name?: string;
}

// ─── UI State ───────────────────────────────────────────────────────────────

export type AppStatus =
  | 'idle'
  | 'uploading'
  | 'ready'
  | 'cleaning'
  | 'error';

export interface ColumnRenameEntry {
  original: string;
  current: string;
  renamed: string;
}
