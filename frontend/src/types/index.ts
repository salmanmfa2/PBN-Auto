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

export type AuthLevel = 1 | 2 | 3 | 4;
export type AssignableAuthLevel = AuthLevel;

export interface AuthUser {
  user: string;
  name: string;
  auth_level: AuthLevel;
  is_active: boolean;
  created_at: string;
}

export type MenuAccessKey =
  | 'analytics'
  | 'insights'
  | 'insights-beta'
  | 'analisis-kinerja'
  | 'analisis-mutasi'
  | 'fragment-petikan'
  | 'plt-plh'
  | 'nd-undangan'
  | 'progress-bahan'
  | 'simulasi-mutasi'
  | 'admin';

export interface MenuAccessPolicy {
  menu_key: MenuAccessKey;
  view_level: number;
  edit_level: number;
}

export type MutationEselonChoice = 'Administrator' | 'Pengawas';

export interface MutationWorkspace {
  id: string;
  eselon_choice: MutationEselonChoice;
  title: string;
  description: string;
  tmt: string | null;
  status: 'Aktif' | 'Inaktif';
  dataset_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MutationWorkspaceDatasetState {
  raw_preview: DatasetPreview;
  preview: DatasetPreview;
  auto_clean_mode: string | null;
}

export type MutationCategory =
  | 'Mutasi'
  | 'Perpindahan dari Fungsional'
  | 'Promosi'
  | 'Demosi';

export interface MutationCategorySelection {
  row_index: number;
  category: MutationCategory | null;
}

export interface MutationLookupEmployee {
  nip: string;
  nama: string;
  jabatan: string;
  unit_eselon_ii: string;
  unit_eselon_iii: string;
  unit_eselon_iv: string;
  eselon: string;
  eselon_id: number | null;
  kategori: MutationCategory | null;
  masa_jabatan: string | null;
}

export interface MutationLookupResponse {
  matched_count: number;
  unmatched_count: number;
  invalid_count: number;
  matches: Record<string, MutationLookupEmployee>;
}

export interface MutationWorkspaceDatasetAnalysis extends MutationLookupResponse {
  preview: DatasetPreview;
}

export interface MutationTalentFinderOption {
  id: number;
  label: string;
}

export interface MutationTalentFinderFilterOptions {
  eselon: MutationTalentFinderOption[];
  rumpun: MutationTalentFinderOption[];
}

export interface MutationTalentFinderSearchRequest {
  eselon_ids: number[];
  name: string;
  rumpun_ids: number[];
  page: number;
  page_size: number;
  sort_by: MutationTalentFinderSortField;
  sort_order: 'asc' | 'desc';
}

export type MutationTalentFinderSortField =
  | 'nama'
  | 'eselon'
  | 'usia'
  | 'jabatan'
  | 'pendidikan'
  | 'jurusan'
  | 'universitas'
  | 'homebase'
  | 'lama_jabatan'
  | 'lama_eselon';

export interface MutationTalentFinderCountResponse {
  total: number;
}

export interface MutationTalentFinderEmployee {
  employee_id: number;
  nama: string;
  eselon: string;
  usia: number | null;
  jabatan: string;
  pendidikan: string;
  jurusan: string;
  universitas: string;
  lama_eselon: string | null;
  lama_jabatan: string | null;
  homebase: string;
}

export interface MutationTalentFinderSearchResponse {
  total: number;
  page: number;
  page_size: number;
  employees: MutationTalentFinderEmployee[];
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
  'Analisis Mutasi/Promosi',
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
  auth_level: AssignableAuthLevel;
}

export interface AdminUserUpdatePayload {
  name: string;
  auth_level: AssignableAuthLevel;
  password?: string;
  is_active: boolean;
}

export interface PbnOpenCsvValidation {
  filename: string;
  columns: string[];
  row_count: number;
}

export interface PbnOpenDataSourceSyncStatus {
  last_synced_at: string | null;
  synced_by_user: string | null;
  synced_by_name: string | null;
}

export type DatabaseMaintenanceOperation = 'replace' | 'sync' | 'reference';

export interface DatabaseMaintenanceTarget {
  key: string;
  table_name: string;
  label: string;
  operation: DatabaseMaintenanceOperation;
  source_table: string | null;
}

export interface DatabaseMaintenancePreview {
  target_key: string;
  table_name: string;
  operation: DatabaseMaintenanceOperation;
  filename?: string;
  source_table?: string | null;
  columns?: string[];
  row_count: number;
  current_row_count: number;
  inserted_count: number;
  updated_count: number;
  deleted_count: number;
}

export interface DatabaseMaintenanceResult {
  message?: string;
  row_count: number;
  inserted_count: number;
  updated_count: number;
  deleted_count: number;
}

export type PerformanceGroupBy = 'overall' | 'unit_eselon_ii' | 'eselon_level' | 'unit_and_eselon';

export interface PerformanceDatasetStatus {
  period: string;
  row_count: number;
  uploaded_at: string;
  uploaded_by_user: string;
  uploaded_by_name: string;
}

export interface PerformancePeriodOption {
  period: string;
  row_count: number;
}

export type PerformanceEmployeeSource = 'fetch_pbnopen' | 'dt_employee_q2_2026';

export interface PerformanceUploadValidation {
  period: string;
  row_count: number;
  unidentified_count: number;
  normalized_penalty_count: number;
}

export interface PerformanceCorrectionSourceYear {
  year: number;
  available_tw: number[];
}

export interface PerformanceCorrectionSourceRow {
  form_id: string;
  id_unit: string;
  submitted_at: string | null;
}

export interface PerformanceCorrectionConflictCandidate {
  value: string;
  sources: PerformanceCorrectionSourceRow[];
}

export interface PerformanceCorrectionConflict {
  nip: string;
  candidates: PerformanceCorrectionConflictCandidate[];
}

export interface PerformanceCorrectionSyncPreview {
  period: string;
  source_year: number;
  source_tw: number;
  row_count: number;
  source_row_count: number;
  source_nip_count: number;
  matched_count: number;
  unmatched_count: number;
  duplicate_nip_group_count: number;
  ignored_unit_row_count: number;
  source_only_nip_count: number;
  conflicts: PerformanceCorrectionConflict[];
}

export interface PerformanceCorrectionSyncResult extends PerformanceCorrectionSyncPreview {
  resolved_conflict_count: number;
}

export interface PerformanceCorrectionEditRequest {
  period: string;
  nip: string;
  nilai_koreksi: number;
}

export interface PerformanceCorrectionEditResult {
  period: string;
  nip: string;
  nilai_koreksi: number | null;
  nkp_akhir: number | null;
  status: string;
  changed: boolean;
}

export interface PerformanceCorrectionBatchResult {
  period: string;
  input_count: number;
  updated_count: number;
  unchanged_count: number;
}

export interface PerformanceCorrectionEditLog {
  id: number;
  period: string;
  nip: string;
  employee_name: string;
  old_value: number | null;
  new_value: number;
  edited_by_user: string;
  edited_by_name: string;
  edited_at: string;
}

export interface PerformanceCorrectionEditLogPage {
  page: number;
  page_size: number;
  total: number;
  records: PerformanceCorrectionEditLog[];
}

export interface PerformanceHistogramBin {
  start: number;
  end: number;
  label: string;
  count: number;
}

export interface PerformanceCorrectionStats {
  count: number;
  positive_count: number;
  negative_count: number;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
}

export interface PerformanceMetricComparison {
  current: number | null;
  previous: number | null;
  delta: number | null;
  percentage_change: number | null;
}

export interface PerformanceAnalysisGroup {
  label: string;
  employee_count: number;
  hukdis_count: number;
  dampak_pelanggaran_count: number;
  dampak_perilaku_count: number;
  correction: PerformanceCorrectionStats;
  histogram: PerformanceHistogramBin[];
  status_counts: Record<string, number>;
}

export interface PerformanceAnalysisResponse {
  dataset: PerformanceDatasetStatus | null;
  group_by: PerformanceGroupBy;
  total_employees: number;
  groups: PerformanceAnalysisGroup[];
}

export interface PerformanceUnitMetrics {
  label: string;
  unit_kerja_id: number | null;
  nkp_awal_status_counts: Record<string, number>;
  nkp_perhitungan_status_counts: Record<string, number>;
  nkp_akhir_status_counts: Record<string, number>;
  employee_count: number;
  average_npk: number | null;
  average_nhk: number | null;
  average_nkp_awal: number | null;
  nkp_perhitungan_sangat_istimewa_count: number;
  nkp_perhitungan_sangat_istimewa_percentage: number;
  hukdis_count: number;
  dampak_pelanggaran_count: number;
  dampak_perilaku_count: number;
  correction: PerformanceCorrectionStats;
  average_nkp_akhir: number | null;
  nkp_akhir_sangat_istimewa_count: number;
  nkp_akhir_sangat_istimewa_percentage: number;
  status_gap_count: number;
  comparison: Record<string, PerformanceMetricComparison>;
}

export type PerformanceUnitEselonIVSummary = PerformanceUnitMetrics;

export interface PerformanceUnitEselonIIISummary extends PerformanceUnitMetrics {
  children: PerformanceUnitEselonIVSummary[];
}

export interface PerformanceUnitSummary extends PerformanceUnitMetrics {
  children: PerformanceUnitEselonIIISummary[];
}

export interface PerformanceDashboardResponse {
  dataset: PerformanceDatasetStatus | null;
  previous_period: string | null;
  available_periods: PerformancePeriodOption[];
  total_employees: number;
  unit_eselon_ii_options: string[];
  unit_eselon_iii_options: string[];
  unit_eselon_iv_options: string[];
  eselon_options: string[];
  overview: PerformanceAnalysisGroup;
  overview_previous: PerformanceAnalysisGroup | null;
  overview_comparison: Record<string, PerformanceMetricComparison>;
  units: PerformanceUnitSummary[];
}

export interface PerformanceInsight {
  content: string;
  updated_at: string | null;
  updated_by_name: string | null;
}

export interface PerformanceRecord {
  nama: string;
  nip: string;
  unit_eselon_ii: string;
  unit_eselon_iii: string;
  unit_eselon_iv: string;
  eselon: string;
  nhk: number | null;
  npk: number | null;
  nhk_kalibrasi: number | null;
  npk_kalibrasi: number | null;
  nkp_awal: number | null;
  rating_hasil_kerja_awal: string | null;
  rating_perilaku_kerja_awal: string | null;
  predikat_kinerja_awal: string | null;
  nilai_hukuman_disiplin: number | null;
  nilai_dampak_pelanggaran_disiplin: number | null;
  nilai_dampak_perilaku: number | null;
  nilai_koreksi: number | null;
  nko: number | null;
  nkp_perhitungan: number | null;
  status_nkp_perhitungan: string;
  nkp_akhir: number | null;
  rating_hasil_kerja: string | null;
  rating_perilaku_kerja: string | null;
  predikat_kinerja: string | null;
  status: string;
}

export interface PerformanceRecordsResponse {
  period: string | null;
  page: number;
  page_size: number;
  total: number;
  records: PerformanceRecord[];
  filter_options: Partial<Record<keyof PerformanceRecord, string[]>>;
  numeric_ranges: Partial<Record<keyof PerformanceRecord, [number | null, number | null]>>;
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
export type PelantikanWorkflowMode = 'single_sheet' | 'all_sheets';
export type PelantikanImportStrategy =
  | 'single_sheet'
  | 'all_sheets'
  | 'selected_sheets'
  | 'isolated_sheets';

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
  workflow_mode: PelantikanWorkflowMode;
  import_strategy: PelantikanImportStrategy;
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
  source_sheet: string | null;
  source_row_number: number | null;
  source_nama_nip: string | null;
  source_jabatan_saat_ini: string | null;
  source_usul_jabatan_baru: string | null;
  nip: string | null;
  nama: string;
  jabatan: string;
  unit_eselon_ii: string;
  unit_kerja_id: number | null;
  unit_city: string;
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
  processed_sheets: string[];
  skipped_sheets: string[];
  duplicate_count: number;
}

export interface PelantikanPersonChoice {
  id: number;
  selected: boolean;
  modality: PelantikanModality | null;
}
