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
  pejabat_pengganti_nip: string | null;
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
  pejabat_pengganti_nip: string | null;
  jabatan_definitif_pengganti: string;
  nomor_surat: string;
  tmt: string;
}

export interface PltPlhEmployeeOption {
  nip: string;
  nama: string;
  jabatan_definitif_pengganti: string;
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

export const FEEDBACK_MENU_OPTIONS = [
  'Overall',
  'PBN Analytics',
  'Insight Hub',
  'Insight Hub Beta',
  'Analisis Kinerja DJPb',
  'Manajemen Plt./Plh.',
  'Generate ND Undangan Pelantikan',
  'Bahan Pendukung MPK',
  'Simulasi Mutasi',
  'Admin',
] as const;

export type FeedbackMenu = typeof FEEDBACK_MENU_OPTIONS[number];

export interface FeedbackSubmitPayload {
  menu: FeedbackMenu;
  feedback: string;
}

export interface UserFeedback {
  id: number;
  submitted_by: string | null;
  menu: FeedbackMenu;
  feedback: string;
  created_at: string;
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

export type PelantikanStatus = 'draft' | 'ready' | 'generated';
export type PelantikanLookupStatus = 'matched' | 'not_found' | 'missing_nip' | 'duplicate';
export type PelantikanModality = 'daring' | 'luring';

export interface PelantikanAgendaFields {
  tanggal_pelantikan: string;
  nd_undangan_pelantikan: string;
  tanggal_nd_undangan_pelantikan: string;
  jam_pelantikan: string;
  dresscode: string;
  level_jabatan: string;
}

export interface PelantikanAgenda extends PelantikanAgendaFields {
  id: string;
  hari_pelantikan: string;
  status: PelantikanStatus;
  uploaded_filename: string | null;
  uploaded_sheet: string | null;
  last_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PelantikanAgendaPerson {
  id: number;
  row_number: number;
  source_no: string | null;
  source_nama_nip: string | null;
  source_jabatan_saat_ini: string | null;
  source_usul_jabatan_baru: string | null;
  nip: string | null;
  nama: string;
  jabatan: string;
  unit_eselon_ii: string;
  eselon: string | null;
  lookup_status: PelantikanLookupStatus;
  selected: boolean;
  modality: PelantikanModality | null;
}

export interface PelantikanAgendaDetail extends PelantikanAgenda {
  people: PelantikanAgendaPerson[];
}

export interface PelantikanAgendaSummary extends PelantikanAgenda {
  people_count: number;
  selected_count: number;
}

export interface PelantikanAgendaUploadResult {
  selected_sheet: string;
  row_count: number;
  people: PelantikanAgendaPerson[];
}

export interface PelantikanPersonChoice {
  id: number;
  selected: boolean;
  modality: PelantikanModality | null;
}
