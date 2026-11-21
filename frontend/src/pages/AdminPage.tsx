import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import * as apiClient from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type {
  AssignableAuthLevel,
  AdminUserUpdatePayload,
  AuthLevel,
  AuthUser,
  DatabaseMaintenanceResult,
  DatabaseMaintenancePreview,
  DatabaseMaintenanceTarget,
  MenuAccessKey,
  MenuAccessPolicy,
  UserFeedback,
  PbnOpenDataSourceSyncStatus,
} from '../types';
import { Spinner } from '../components/Spinner';
import { useMenuAccess } from '../contexts/MenuAccessContext';

type UserForm = {
  user: string;
  name: string;
  auth_level: AssignableAuthLevel;
  password: string;
  is_active: boolean;
};

type AdminTab = 'accounts' | 'feedback' | 'datasource';

const emptyForm: UserForm = {
  user: '',
  name: '',
  auth_level: 1,
  password: '',
  is_active: true,
};

const menuAccessLabels: Record<MenuAccessKey, string> = {
  analytics: 'PBN Analytics',
  insights: 'Insight Hub',
  'insights-beta': 'Insight Hub Beta',
  'analisis-kinerja': 'Analisis Kinerja DJPb',
  'analisis-mutasi': 'Analisis Mutasi/Promosi',
  'fragment-petikan': 'Fragment Petikan',
  'plt-plh': 'Manajemen Plt./Plh.',
  'nd-undangan': 'Generate ND Undangan Pelantikan',
  'progress-bahan': 'Bahan Pendukung MPK',
  'simulasi-mutasi': 'Simulasi Mutasi',
  admin: 'Admin',
};

const minimumEditLevel: Partial<Record<MenuAccessKey, number>> = {
  'analisis-kinerja': 1,
  'fragment-petikan': 1,
  'plt-plh': 1,
  'nd-undangan': 1,
};

const accessLevels = [
  { value: 0, label: 'Guest' },
  { value: 1, label: 'User' },
  { value: 2, label: 'Special User' },
  { value: 3, label: 'Super Admin' },
];

function authLevelLabel(level: AuthLevel): string {
  if (level === 4) return 'God User';
  if (level === 3) return 'Super Admin';
  if (level === 2) return 'Special User';
  return 'User';
}

function RoleBadge({ level }: { level: AuthLevel }) {
  if (level === 4) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        4 · God User
      </span>
    );
  }
  if (level === 3) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/15 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
        3 · Super Admin
      </span>
    );
  }
  if (level === 2) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-0.5 text-xs font-medium text-indigo-300">
        2 · Special User
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-slate-600/60 bg-slate-800/80 px-2.5 py-0.5 text-xs font-medium text-slate-300">
      1 · User
    </span>
  );
}

function formatFeedbackDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}

function formatSourceSyncDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}

export default function AdminPage() {
  const { user: currentUser } = useAuth();
  const { policies: menuPolicies, reload: reloadMenuPolicies } = useMenuAccess();
  const isGodUser = currentUser?.auth_level === 4;
  const canManageAccounts = (currentUser?.auth_level ?? 0) >= 3;

  const [activeTab, setActiveTab] = useState<AdminTab>(canManageAccounts ? 'accounts' : 'feedback');
  const [userSearch, setUserSearch] = useState('');
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [feedbackItems, setFeedbackItems] = useState<UserFeedback[]>([]);
  const [isLoading, setIsLoading] = useState(canManageAccounts);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState((currentUser?.auth_level ?? 1) >= 2);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearingFeedback, setIsClearingFeedback] = useState(false);
  const [deletingFeedbackId, setDeletingFeedbackId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);

  const [databaseFile, setDatabaseFile] = useState<File | null>(null);
  const [databasePreview, setDatabasePreview] = useState<DatabaseMaintenancePreview | null>(null);
  const [databaseTargets, setDatabaseTargets] = useState<DatabaseMaintenanceTarget[]>([]);
  const [selectedDatabaseTarget, setSelectedDatabaseTarget] = useState('fetch_pbnopen');
  const [isLoadingDatabaseTargets, setIsLoadingDatabaseTargets] = useState(false);
  const [sourceSyncStatus, setSourceSyncStatus] = useState<PbnOpenDataSourceSyncStatus | null>(null);
  const [isLoadingSourceSync, setIsLoadingSourceSync] = useState((currentUser?.auth_level ?? 0) >= 2);
  const [sourceSyncError, setSourceSyncError] = useState<string | null>(null);
  const [isPreviewingDatabaseChange, setIsPreviewingDatabaseChange] = useState(false);
  const [isApplyingDatabaseChange, setIsApplyingDatabaseChange] = useState(false);
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [databaseDialogError, setDatabaseDialogError] = useState<string | null>(null);
  const [databaseApplyFailed, setDatabaseApplyFailed] = useState(false);
  const databaseFileInput = useRef<HTMLInputElement>(null);

  const [showMenuAccessDialog, setShowMenuAccessDialog] = useState(false);
  const [menuAccessDraft, setMenuAccessDraft] = useState<MenuAccessPolicy[]>([]);
  const [isSavingMenuAccess, setIsSavingMenuAccess] = useState(false);
  const [menuAccessError, setMenuAccessError] = useState<string | null>(null);

  const openMenuAccessDialog = () => {
    setMenuAccessError(null);
    setMenuAccessDraft(menuPolicies.map((policy) => ({ ...policy })));
    setShowMenuAccessDialog(true);
  };

  const updateMenuAccessDraft = (
    menuKey: MenuAccessKey,
    field: 'view_level' | 'edit_level',
    level: number,
  ) => {
    setMenuAccessDraft((current) => current.map((policy) => {
      if (policy.menu_key !== menuKey) return policy;
      if (field === 'view_level') {
        return {
          ...policy,
          view_level: level,
          edit_level: Math.max(policy.edit_level, level, minimumEditLevel[menuKey] ?? 0),
        };
      }
      return {
        ...policy,
        edit_level: Math.max(level, policy.view_level, minimumEditLevel[menuKey] ?? 0),
      };
    }));
  };

  const saveMenuAccess = async () => {
    setMenuAccessError(null);
    setIsSavingMenuAccess(true);
    try {
      await apiClient.updateMenuAccessSettings(menuAccessDraft);
      await reloadMenuPolicies();
      setShowMenuAccessDialog(false);
      setNotice('Pengaturan akses menu berhasil disimpan.');
    } catch (saveError) {
      setMenuAccessError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSavingMenuAccess(false);
    }
  };

  const refreshUsers = useCallback(async () => {
    if ((currentUser?.auth_level ?? 0) < 3) return;
    setError(null);
    try {
      setUsers(await apiClient.listAdminUsers());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.auth_level]);

  const refreshFeedback = useCallback(async () => {
    if ((currentUser?.auth_level ?? 0) < 2) {
      setFeedbackItems([]);
      setIsLoadingFeedback(false);
      return;
    }

    setIsLoadingFeedback(true);
    try {
      setFeedbackItems(await apiClient.listAdminFeedback());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoadingFeedback(false);
    }
  }, [currentUser?.auth_level]);

  const refreshSourceSyncStatus = useCallback(async () => {
    if ((currentUser?.auth_level ?? 0) < 2) {
      setSourceSyncStatus(null);
      setIsLoadingSourceSync(false);
      return;
    }

    setIsLoadingSourceSync(true);
    setSourceSyncError(null);
    try {
      setSourceSyncStatus(await apiClient.getPbnOpenDataSourceSyncStatus());
    } catch (loadError) {
      setSourceSyncError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoadingSourceSync(false);
    }
  }, [currentUser?.auth_level]);

  const closeSourceDialog = useCallback(() => {
    if (databaseDialogError) setError(databaseDialogError);
    setShowSourceDialog(false);
  }, [databaseDialogError]);

  const openDatabaseDialog = (targetKey = 'fetch_pbnopen') => {
    setError(null);
    setDatabaseFile(null);
    setDatabasePreview(null);
    setDatabaseDialogError(null);
    setDatabaseApplyFailed(false);
    setSelectedDatabaseTarget(targetKey);
    setShowSourceDialog(true);
    if (!isGodUser) return;

    setIsLoadingDatabaseTargets(true);
    void apiClient.getDatabaseMaintenanceTargets()
      .then((targets) => {
        setDatabaseTargets(targets);
        if (!targets.some((target) => target.key === targetKey)) {
          setDatabaseDialogError(`The table '${targetKey}' is not available for maintenance.`);
        }
      })
      .catch((loadError: unknown) => {
        setDatabaseDialogError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => setIsLoadingDatabaseTargets(false));
  };

  const refreshDatabaseTargets = useCallback(async () => {
    if (!isGodUser) return;
    setIsLoadingDatabaseTargets(true);
    setDatabaseDialogError(null);
    setDatabasePreview(null);
    setDatabaseFile(null);
    setDatabaseApplyFailed(false);
    if (databaseFileInput.current) databaseFileInput.current.value = '';
    try {
      const targets = await apiClient.getDatabaseMaintenanceTargets();
      setDatabaseTargets(targets);
      if (
        !targets.some((target) => target.key === selectedDatabaseTarget)
        && targets.length > 0
      ) {
        setSelectedDatabaseTarget(targets[0].key);
      }
    } catch (loadError: unknown) {
      setDatabaseDialogError(
        loadError instanceof Error ? loadError.message : String(loadError),
      );
    } finally {
      setIsLoadingDatabaseTargets(false);
    }
  }, [isGodUser, selectedDatabaseTarget]);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  useEffect(() => {
    void refreshFeedback();
  }, [refreshFeedback]);

  useEffect(() => {
    void refreshSourceSyncStatus();
  }, [refreshSourceSyncStatus]);

  useEffect(() => {
    if (!showSourceDialog || isPreviewingDatabaseChange || isApplyingDatabaseChange) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSourceDialog();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSourceDialog, isPreviewingDatabaseChange, isApplyingDatabaseChange, closeSourceDialog]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingUser(null);
  };

  const submitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      if (editingUser) {
        const payload: AdminUserUpdatePayload = {
          name: form.name,
          auth_level: form.auth_level,
          is_active: form.is_active,
          ...(form.password ? { password: form.password } : {}),
        };
        await apiClient.updateAdminUser(editingUser, payload);
        setNotice(`Akun ${editingUser} berhasil diperbarui.`);
      } else {
        await apiClient.createAdminUser({
          user: form.user,
          name: form.name,
          auth_level: form.auth_level,
          password: form.password,
        });
        setNotice(`Akun ${form.user} berhasil dibuat.`);
      }
      resetForm();
      await refreshUsers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (account: AuthUser) => {
    if (account.auth_level === 4 && currentUser?.auth_level !== 4) return;
    setEditingUser(account.user);
    setForm({
      user: account.user,
      name: account.name,
      auth_level: account.auth_level,
      password: '',
      is_active: account.is_active,
    });
    setNotice(null);
    setError(null);
  };

  const removeUser = async (account: AuthUser) => {
    if (!window.confirm(`Hapus akun "${account.user}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    setError(null);
    setNotice(null);
    try {
      await apiClient.deleteAdminUser(account.user);
      setNotice(`Akun ${account.user} berhasil dihapus.`);
      await refreshUsers();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
  };

  const removeFeedback = async (item: UserFeedback) => {
    if (!window.confirm(`Hapus feedback untuk menu "${item.menu}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    setError(null);
    setNotice(null);
    setDeletingFeedbackId(item.id);
    try {
      await apiClient.deleteAdminFeedback(item.id);
      setFeedbackItems((current) => current.filter((feedback) => feedback.id !== item.id));
      setNotice('Feedback berhasil dihapus.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setDeletingFeedbackId(null);
    }
  };

  const clearFeedback = async () => {
    if (
      feedbackItems.length === 0
      || !window.confirm(`Hapus semua ${feedbackItems.length} feedback? Tindakan ini tidak dapat dibatalkan.`)
    ) return;
    setError(null);
    setNotice(null);
    setIsClearingFeedback(true);
    try {
      const result = await apiClient.clearAdminFeedback();
      setFeedbackItems([]);
      setNotice(`${result.deleted_count} feedback berhasil dihapus.`);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : String(clearError));
    } finally {
      setIsClearingFeedback(false);
    }
  };

  const previewDatabaseChange = async () => {
    const target = databaseTargets.find((item) => item.key === selectedDatabaseTarget);
    if (!target || (!databaseFile && target.operation !== 'sync')) return;
    setDatabaseDialogError(null);
    setNotice(null);
    setIsPreviewingDatabaseChange(true);
    try {
      let result: DatabaseMaintenancePreview;
      if (target.operation === 'sync') {
        result = await apiClient.previewDatabaseEmployeeSync(target.key);
      } else {
        if (!databaseFile) return;
        result = await apiClient.previewDatabaseMaintenanceCsv(target.key, databaseFile);
      }
      setDatabasePreview(result);
    } catch (previewError) {
      setDatabasePreview(null);
      setDatabaseDialogError(previewError instanceof Error ? previewError.message : String(previewError));
    } finally {
      setIsPreviewingDatabaseChange(false);
    }
  };

  const applyDatabaseChange = async () => {
    const target = databaseTargets.find((item) => item.key === selectedDatabaseTarget);
    if (!target || !databasePreview || (!databaseFile && target.operation !== 'sync')) return;
    setDatabaseDialogError(null);
    setNotice(null);
    setIsApplyingDatabaseChange(true);
    try {
      let result: DatabaseMaintenanceResult;
      if (target.operation === 'sync') {
        result = await apiClient.syncDatabaseEmployeeTable(target.key);
      } else {
        if (!databaseFile) return;
        result = await apiClient.applyDatabaseMaintenanceCsv(target.key, databaseFile);
      }
      setNotice(
        `Tabel ${target.table_name} berhasil diproses: ${result.row_count.toLocaleString()} baris; `
        + `${result.inserted_count.toLocaleString()} ditambahkan, `
        + `${result.updated_count.toLocaleString()} diperbarui, `
        + `${result.deleted_count.toLocaleString()} dihapus.`,
      );
      setShowSourceDialog(false);
      setDatabasePreview(null);
      setDatabaseFile(null);
      if (databaseFileInput.current) databaseFileInput.current.value = '';
      if (target.key === 'fetch_pbnopen') await refreshSourceSyncStatus();
    } catch (applyError) {
      setDatabaseApplyFailed(true);
      setDatabaseDialogError(applyError instanceof Error ? applyError.message : String(applyError));
    } finally {
      setIsApplyingDatabaseChange(false);
    }
  };

  const normalizedUserQuery = userSearch.trim().toLowerCase();
  const filteredUsers = users.filter((account) => (
    !normalizedUserQuery
    || `${account.user} ${account.name} ${authLevelLabel(account.auth_level)}`.toLowerCase().includes(normalizedUserQuery)
  ));
  const activeUsersCount = users.filter((account) => account.is_active).length;

  return (
    <main className="admin-page relative isolate min-h-screen bg-surface-950 px-4 pb-16 pt-24 text-slate-100 md:px-8">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_75%_40%_at_50%_-5%,rgba(14,165,233,0.12),transparent)]"
        aria-hidden="true"
      />

      <div className="mx-auto max-w-6xl space-y-6">
        {/* Control Deck Header */}
        <header className="admin-header rounded-2xl border border-slate-700/80 bg-slate-900/80 p-6 shadow-lg backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                <span>Administrasi Sistem</span>
              </div>
              <h1 className="mt-2.5 text-2xl font-bold tracking-tight sm:text-3xl">Admin Console</h1>
              <p className="mt-1 text-sm text-slate-400">
                Masuk sebagai <span className="font-medium text-slate-200">{currentUser?.name}</span> ·{' '}
                <span className="text-sky-300">{authLevelLabel(currentUser?.auth_level ?? 1)}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {isGodUser && (
                <button
                  type="button"
                  onClick={openMenuAccessDialog}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-500/20"
                >
                  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3l8 3v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4" />
                  </svg>
                  Set Auth Menu
                </button>
              )}
              <Link to="/" className="btn-secondary rounded-xl">
                ← Kembali ke Menu
              </Link>
            </div>
          </div>

          {/* Telemetry Overview Strip */}
          <div className="mt-6 grid grid-cols-1 gap-3 border-t border-slate-800 pt-5 sm:grid-cols-3">
            <div className="admin-subpanel rounded-xl border border-slate-700/80 bg-slate-950/50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Akun Terdaftar</p>
              <p className="mt-1 text-xl font-bold text-slate-100">
                {canManageAccounts ? users.length : '—'}{' '}
                {canManageAccounts && (
                  <span className="text-xs font-normal text-emerald-300">({activeUsersCount} aktif)</span>
                )}
              </p>
            </div>

            <div className="admin-subpanel rounded-xl border border-slate-700/80 bg-slate-950/50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Feedback Masuk</p>
              <p className="mt-1 text-xl font-bold text-slate-100">
                {feedbackItems.length}{' '}
                <span className="text-xs font-normal text-slate-400">pesan pengguna</span>
              </p>
            </div>

            <div className="admin-subpanel rounded-xl border border-slate-700/80 bg-slate-950/50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sync Sumber Pegawai</p>
              <p className="mt-1 truncate text-sm font-medium text-slate-200">
                {sourceSyncStatus?.last_synced_at
                  ? formatSourceSyncDate(sourceSyncStatus.last_synced_at)
                  : 'Belum ada riwayat sync'}
              </p>
            </div>
          </div>

          {/* Workspace Tabs */}
          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-800 pt-4" role="tablist" aria-label="Bagian Administrasi">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'accounts'}
              onClick={() => setActiveTab('accounts')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                activeTab === 'accounts'
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'border border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>Manajemen Akun</span>
              {canManageAccounts && (
                <span className={`rounded-full px-2 py-0.5 text-xs ${activeTab === 'accounts' ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-300'}`}>
                  {users.length}
                </span>
              )}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'feedback'}
              onClick={() => setActiveTab('feedback')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                activeTab === 'feedback'
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'border border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>Feedback Pengguna</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${activeTab === 'feedback' ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-300'}`}>
                {feedbackItems.length}
              </span>
            </button>

            {(currentUser?.auth_level ?? 0) >= 2 && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'datasource'}
                onClick={() => setActiveTab('datasource')}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                  activeTab === 'datasource'
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'border border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>Employee Data Source</span>
              </button>
            )}
          </div>
        </header>

        {/* Global Status Banner */}
        {(error || notice) && (
          <div
            role={error ? 'alert' : 'status'}
            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              error
                ? 'border-rose-700/50 bg-rose-900/20 text-rose-200'
                : 'border-emerald-700/50 bg-emerald-900/20 text-emerald-200'
            }`}
          >
            {error ?? notice}
          </div>
        )}

        {/* TAB 1: ACCOUNTS */}
        {activeTab === 'accounts' && (
          canManageAccounts ? (
            <div className="grid gap-6 lg:grid-cols-12">
              {/* Account Form Sidebar */}
              <section className="admin-card card h-fit p-5 lg:col-span-4">
                <div className="border-b border-slate-700/80 pb-3.5">
                  <h2 className="text-base font-semibold">
                    {editingUser ? `Edit Akun: @${editingUser}` : 'Tambah Akun Baru'}
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Level 1 User · Level 2 Special User · Level 3 Super Admin · Level 4 God User.
                  </p>
                </div>

                <form onSubmit={(event) => void submitUser(event)} className="mt-4 space-y-4">
                  {!editingUser && (
                    <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">
                      Username
                      <input
                        required
                        minLength={3}
                        maxLength={80}
                        placeholder="contoh: budi.santoso"
                        value={form.user}
                        onChange={(event) => setForm((value) => ({ ...value, user: event.target.value }))}
                        className="input mt-1.5 normal-case"
                      />
                    </label>
                  )}

                  <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">
                    Nama Lengkap
                    <input
                      required
                      maxLength={200}
                      placeholder="Nama tampilan pengguna"
                      value={form.name}
                      onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
                      className="input mt-1.5 normal-case"
                    />
                  </label>

                  <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">
                    Auth Level
                    <select
                      value={form.auth_level}
                      onChange={(event) => setForm((value) => ({ ...value, auth_level: Number(event.target.value) as AssignableAuthLevel }))}
                      className="input mt-1.5 normal-case"
                    >
                      <option value={1}>1 · User</option>
                      <option value={2}>2 · Special User</option>
                      <option value={3}>3 · Super Admin</option>
                      {currentUser?.auth_level === 4 && <option value={4}>4 · God User</option>}
                    </select>
                  </label>

                  <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">
                    {editingUser ? 'Password Baru (Opsional)' : 'Password'}
                    <input
                      required={!editingUser}
                      minLength={4}
                      maxLength={255}
                      type="password"
                      autoComplete="new-password"
                      placeholder={editingUser ? 'Kosongkan jika tidak diubah' : 'Minimal 4 karakter'}
                      value={form.password}
                      onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))}
                      className="input mt-1.5 normal-case"
                    />
                  </label>

                  {editingUser && (
                    <label className="flex items-center gap-2.5 rounded-lg border border-slate-700/80 bg-slate-900/40 px-3 py-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(event) => setForm((value) => ({ ...value, is_active: event.target.checked }))}
                        className="rounded border-slate-600"
                      />
                      Akun aktif (dapat login)
                    </label>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button type="submit" disabled={isSaving} className="btn-primary flex-1 justify-center">
                      {isSaving ? <Spinner size="sm" label="Menyimpan…" /> : editingUser ? 'Simpan Perubahan' : 'Buat Akun'}
                    </button>
                    {editingUser && (
                      <button type="button" onClick={resetForm} disabled={isSaving} className="btn-secondary">
                        Batal
                      </button>
                    )}
                  </div>
                </form>
              </section>

              {/* Account Directory Table */}
              <section className="admin-card card overflow-hidden lg:col-span-8">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/80 px-5 py-4">
                  <div>
                    <h2 className="text-base font-semibold">Daftar Akun Pengguna</h2>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Menampilkan {filteredUsers.length} dari {users.length} akun terdaftar.
                    </p>
                  </div>
                  <input
                    type="search"
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="Cari user, nama, atau role..."
                    className="input w-full sm:w-60"
                  />
                </div>

                <div className="overflow-x-auto">
                  {isLoading ? (
                    <div className="flex justify-center p-10"><Spinner label="Memuat akun…" /></div>
                  ) : (
                    <table className="w-full min-w-[600px] text-left text-sm">
                      <thead className="admin-table-head bg-slate-900/70 text-xs uppercase tracking-wider text-slate-400">
                        <tr>
                          <th className="px-5 py-3">Pengguna</th>
                          <th className="px-5 py-3">Peran</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {filteredUsers.map((account) => {
                          const isDisabled =
                            account.user === currentUser?.user
                            || (account.auth_level === 4 && currentUser?.auth_level !== 4);

                          return (
                            <tr key={account.user} className="transition-colors hover:bg-slate-800/40">
                              <td className="px-5 py-3.5">
                                <p className="font-medium text-slate-100">{account.name}</p>
                                <p className="font-mono text-xs text-slate-400">@{account.user}</p>
                              </td>
                              <td className="px-5 py-3.5">
                                <RoleBadge level={account.auth_level} />
                              </td>
                              <td className="px-5 py-3.5">
                                {account.is_active ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                    Aktif
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-300">
                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                                    Nonaktif
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                <div className="inline-flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => startEditing(account)}
                                    disabled={isDisabled}
                                    className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void removeUser(account)}
                                    disabled={isDisabled}
                                    className="btn-danger px-3 py-1.5 text-xs disabled:opacity-40"
                                  >
                                    Hapus
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredUsers.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-5 py-10 text-center text-slate-400">
                              Tidak ada akun yang cocok.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <section className="admin-card card p-6">
              <h2 className="font-semibold">Manajemen Akun</h2>
              <p className="mt-2 text-sm text-slate-400">
                Pengelolaan akun hanya tersedia untuk Super Admin (level 3) dan God User (level 4).
              </p>
            </section>
          )
        )}

        {/* TAB 2: FEEDBACK */}
        {activeTab === 'feedback' && (
          <section className="admin-card card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/80 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">Feedback Pengguna</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Masukan terbaru dari pengguna untuk menu dan fitur aplikasi.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void clearFeedback()}
                disabled={!feedbackItems.length || isLoadingFeedback || isClearingFeedback || deletingFeedbackId !== null}
                className="btn-danger text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isClearingFeedback ? <Spinner size="sm" label="Menghapus…" /> : 'Hapus Semua Feedback'}
              </button>
            </div>

            {isLoadingFeedback ? (
              <div className="flex justify-center p-10"><Spinner label="Memuat feedback…" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="admin-table-head bg-slate-900/70 text-xs uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-5 py-3">Dikirim</th>
                      <th className="px-5 py-3">Pengguna</th>
                      <th className="px-5 py-3">Menu</th>
                      <th className="px-5 py-3">Feedback</th>
                      <th className="px-5 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {feedbackItems.map((item) => (
                      <tr key={item.id} className="transition-colors hover:bg-slate-800/40">
                        <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-400">
                          {formatFeedbackDate(item.created_at)}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-200">
                          {item.submitted_by ?? <span className="italic text-slate-500">Akun dihapus</span>}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-300">
                            {item.menu}
                          </span>
                        </td>
                        <td className="max-w-md whitespace-pre-wrap break-words px-5 py-3.5 text-slate-200">
                          {item.feedback}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => void removeFeedback(item)}
                            disabled={isClearingFeedback || deletingFeedbackId !== null}
                            className="btn-danger px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingFeedbackId === item.id ? 'Menghapus…' : 'Hapus'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {feedbackItems.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-10 text-center text-slate-400">
                          Belum ada feedback pengguna.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TAB 3: EMPLOYEE DATA SOURCE */}
        {activeTab === 'datasource' && (currentUser?.auth_level ?? 0) >= 2 && (
          <section className="admin-card card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-700/80 pb-4">
              <div>
                <h2 className="text-base font-semibold">Employee Data Source & Pemeliharaan</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Status sinkronisasi tabel referensi pegawai <code>pbncleaner.fetch_pbnopen</code> dan <code>dt_employee</code>.
                </p>
              </div>

              {(currentUser?.auth_level ?? 0) >= 3 && (
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => openDatabaseDialog()}
                    disabled={isApplyingDatabaseChange || isPreviewingDatabaseChange}
                    className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Database Management
                  </button>
                  <button
                    type="button"
                    onClick={() => openDatabaseDialog('dt_employee')}
                    disabled={isApplyingDatabaseChange || isPreviewingDatabaseChange}
                    className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Sync dt_employee dari fetch_pbnopen
                  </button>
                </div>
              )}
            </div>

            <div className="admin-subpanel mt-5 rounded-xl border border-slate-700/80 bg-slate-900/50 p-5 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Re-sync Terakhir</p>
              {isLoadingSourceSync ? (
                <div className="mt-3"><Spinner size="sm" label="Memuat status sumber data…" /></div>
              ) : sourceSyncError ? (
                <p role="alert" className="mt-2 text-rose-300">{sourceSyncError}</p>
              ) : sourceSyncStatus?.last_synced_at ? (
                <div className="mt-2 space-y-1">
                  <p className="text-base font-semibold text-slate-100">
                    {formatSourceSyncDate(sourceSyncStatus.last_synced_at)}
                  </p>
                  <p className="text-slate-400">
                    Dilakukan oleh:{' '}
                    <span className="font-medium text-slate-200">
                      {sourceSyncStatus.synced_by_name || sourceSyncStatus.synced_by_user}
                    </span>
                    {sourceSyncStatus.synced_by_name && sourceSyncStatus.synced_by_user
                      ? ` (@${sourceSyncStatus.synced_by_user})`
                      : ''}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-slate-400">Belum ada catatan re-sync melalui aplikasi.</p>
              )}
            </div>
          </section>
        )}
      </div>

      {/* SET AUTH MENU DIALOG (GOD USER) */}
      {showMenuAccessDialog && isGodUser && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSavingMenuAccess) {
              setShowMenuAccessDialog(false);
            }
          }}
        >
          <section
            aria-labelledby="menu-access-title"
            aria-modal="true"
            className="admin-modal max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
            role="dialog"
          >
            <div className="border-b border-slate-800 pb-4">
              <h2 className="text-lg font-semibold" id="menu-access-title">Set Auth Menu</h2>
              <p className="mt-1 text-sm text-slate-400">
                Atur level minimum untuk melihat dan mengubah setiap menu. God User selalu memiliki akses penuh.
              </p>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="admin-table-head bg-slate-950/50 text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">Menu</th>
                    <th className="px-4 py-2.5">Minimum View</th>
                    <th className="px-4 py-2.5">Minimum Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {menuAccessDraft.map((policy) => {
                    const editMinimum = Math.max(
                      policy.view_level,
                      minimumEditLevel[policy.menu_key] ?? 0,
                    );
                    return (
                      <tr key={policy.menu_key} className="hover:bg-slate-800/30">
                        <th className="px-4 py-3 font-medium text-slate-200">
                          {menuAccessLabels[policy.menu_key]}
                        </th>
                        <td className="px-4 py-3">
                          <select
                            aria-label={`${menuAccessLabels[policy.menu_key]} minimum View`}
                            className="input min-w-36"
                            value={policy.view_level}
                            onChange={(event) => updateMenuAccessDraft(
                              policy.menu_key,
                              'view_level',
                              Number(event.target.value),
                            )}
                          >
                            {accessLevels.map((level) => (
                              <option key={level.value} value={level.value}>{level.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            aria-label={`${menuAccessLabels[policy.menu_key]} minimum Edit`}
                            className="input min-w-36"
                            value={policy.edit_level}
                            onChange={(event) => updateMenuAccessDraft(
                              policy.menu_key,
                              'edit_level',
                              Number(event.target.value),
                            )}
                          >
                            {accessLevels
                              .filter((level) => level.value >= editMinimum)
                              .map((level) => (
                                <option key={level.value} value={level.value}>{level.label}</option>
                              ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {menuAccessError && (
              <p className="mt-4 rounded-xl border border-rose-700/50 bg-rose-900/20 px-4 py-2.5 text-sm text-rose-200" role="alert">
                {menuAccessError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3 border-t border-slate-800 pt-4">
              <button
                className="btn-secondary"
                disabled={isSavingMenuAccess}
                onClick={() => setShowMenuAccessDialog(false)}
                type="button"
              >
                Batal
              </button>
              <button
                className="btn-primary disabled:opacity-50"
                disabled={isSavingMenuAccess || menuAccessDraft.length !== 9}
                onClick={() => void saveMenuAccess()}
                type="button"
              >
                {isSavingMenuAccess ? <Spinner size="sm" label="Menyimpan…" /> : 'Simpan Pengaturan'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* DATABASE MANAGEMENT DIALOG */}
      {showSourceDialog && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget
              && !isPreviewingDatabaseChange
              && !isApplyingDatabaseChange
            ) {
              closeSourceDialog();
            }
          }}
        >
          <section
            className="admin-modal w-full max-w-xl rounded-2xl border border-amber-500/40 bg-slate-900 p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="database-management-title"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
              <h2 id="database-management-title" className="text-lg font-semibold text-amber-200">
                Database Management
              </h2>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                Level 4 Only
              </span>
            </div>

            {!isGodUser ? (
              <p role="alert" className="mt-4 rounded-xl border border-rose-700/50 bg-rose-900/20 p-3.5 text-sm text-rose-200">
                You have no authority to view this page.
              </p>
            ) : isLoadingDatabaseTargets ? (
              <div className="flex justify-center py-10"><Spinner label="Memuat tabel database…" /></div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex items-end justify-between gap-3">
                  <label className="block flex-1 text-sm text-slate-300">
                    Tabel database
                    <select
                      value={selectedDatabaseTarget}
                      onChange={(event) => {
                        setSelectedDatabaseTarget(event.target.value);
                        setDatabaseFile(null);
                        setDatabasePreview(null);
                        setDatabaseDialogError(null);
                        setDatabaseApplyFailed(false);
                        if (databaseFileInput.current) databaseFileInput.current.value = '';
                      }}
                      className="input mt-1.5"
                    >
                      {databaseTargets.map((target) => (
                        <option key={target.key} value={target.key}>{target.label}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => void refreshDatabaseTargets()}
                    disabled={isLoadingDatabaseTargets}
                    className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 text-sm text-sky-200 transition hover:border-sky-400/50 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Refresh/sync daftar tabel database"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                      <path d="M20 11a8 8 0 1 0-2.34 5.66" />
                      <path d="M20 4v7h-7" />
                    </svg>
                    Refresh
                  </button>
                </div>

                {(() => {
                  const target = databaseTargets.find((item) => item.key === selectedDatabaseTarget);
                  if (!target) return null;
                  if (target.operation === 'sync') {
                    return (
                      <p className="admin-subpanel rounded-xl border border-slate-700/80 bg-slate-950/40 p-3.5 text-sm text-slate-400">
                        Sinkronkan <code>{target.table_name}</code> dari <code>{target.source_table}</code>.
                        NIP yang cocok mempertahankan <code>employee_id</code>; data baru ditambahkan dan data yang sudah tidak ada di sumber dihapus.
                      </p>
                    );
                  }
                  if (target.operation === 'reference') {
                    return (
                      <p className="admin-subpanel rounded-xl border border-slate-700/80 bg-slate-950/40 p-3.5 text-sm text-slate-400">
                        Unggah CSV untuk memperbarui <code>{target.table_name}</code> berdasarkan ID yang sudah ada.
                        ID yang masih dipakai tabel pegawai tidak dapat dihapus.
                      </p>
                    );
                  }
                  return (
                    <p className="admin-subpanel rounded-xl border border-slate-700/80 bg-slate-950/40 p-3.5 text-sm text-slate-400">
                      Unggah CSV UTF-8 untuk mengganti seluruh isi <code>pbncleaner.{target.table_name}</code>.
                      Tabel pegawai hanya dapat diubah melalui sinkronisasi.
                    </p>
                  );
                })()}

                {databaseTargets.find((item) => item.key === selectedDatabaseTarget)?.operation !== 'sync' && (
                  <>
                    <input
                      ref={databaseFileInput}
                      type="file"
                      accept=".csv,text/csv"
                      className="sr-only"
                      aria-label="Pilih CSV untuk tabel database"
                      onChange={(event) => {
                        setDatabaseFile(event.currentTarget.files?.[0] ?? null);
                        setDatabasePreview(null);
                        setDatabaseDialogError(null);
                        setDatabaseApplyFailed(false);
                        event.currentTarget.value = '';
                      }}
                    />
                    <div className="admin-subpanel flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-600 bg-slate-950/40 p-3.5">
                      <span className="truncate text-sm text-slate-300">
                        {databaseFile?.name ?? 'Belum ada file CSV dipilih'}
                      </span>
                      <button
                        type="button"
                        onClick={() => databaseFileInput.current?.click()}
                        disabled={isPreviewingDatabaseChange || isApplyingDatabaseChange}
                        className="btn-secondary shrink-0"
                      >
                        Pilih CSV
                      </button>
                    </div>
                  </>
                )}

                {databasePreview && (
                  <div className="admin-subpanel rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                    <p className="text-sm font-medium text-slate-200">
                      Pratinjau <code>{databasePreview.table_name}</code>
                      {databasePreview.filename ? ` · ${databasePreview.filename}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Tidak ada perubahan yang diterapkan sampai Anda memilih tombol konfirmasi.
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2.5 text-sm sm:grid-cols-4">
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <p className="text-[11px] uppercase text-slate-400">Di sumber</p>
                        <p className="mt-0.5 font-bold">{databasePreview.row_count.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <p className="text-[11px] uppercase text-slate-400">Ditambahkan</p>
                        <p className="mt-0.5 font-bold text-emerald-300">{databasePreview.inserted_count.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <p className="text-[11px] uppercase text-slate-400">Diperbarui</p>
                        <p className="mt-0.5 font-bold text-sky-300">{databasePreview.updated_count.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <p className="text-[11px] uppercase text-slate-400">Dihapus</p>
                        <p className="mt-0.5 font-bold text-rose-300">{databasePreview.deleted_count.toLocaleString()}</p>
                      </div>
                    </div>
                    {databasePreview.operation === 'replace' && (
                      <p className="mt-3 text-sm font-medium text-rose-200">
                        Seluruh {databasePreview.current_row_count.toLocaleString()} baris saat ini akan diganti.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {databaseDialogError && isGodUser && (
              <p role="alert" className="mt-4 rounded-xl border border-rose-700/50 bg-rose-900/20 px-4 py-2.5 text-sm text-rose-200">
                {databaseDialogError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={closeSourceDialog}
                disabled={isPreviewingDatabaseChange || isApplyingDatabaseChange}
                className="btn-secondary"
              >
                Batal
              </button>
              {isGodUser && !isLoadingDatabaseTargets && databaseTargets.length > 0 && (
                databasePreview ? (
                  <button
                    type="button"
                    onClick={() => void applyDatabaseChange()}
                    disabled={isApplyingDatabaseChange || databaseApplyFailed}
                    className="btn-danger disabled:opacity-50"
                  >
                    {isApplyingDatabaseChange
                      ? <Spinner size="sm" label="Menerapkan perubahan…" />
                      : databasePreview.operation === 'sync'
                        ? 'Ya, Sinkronkan'
                        : 'Ya, Terapkan Perubahan'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void previewDatabaseChange()}
                    disabled={
                      isPreviewingDatabaseChange
                      || (
                        databaseTargets.find((item) => item.key === selectedDatabaseTarget)?.operation !== 'sync'
                        && !databaseFile
                      )
                    }
                    className="btn-primary disabled:opacity-50"
                  >
                    {isPreviewingDatabaseChange
                      ? <Spinner size="sm" label="Memeriksa tabel…" />
                      : databaseTargets.find((item) => item.key === selectedDatabaseTarget)?.operation === 'sync'
                        ? 'Pratinjau Sinkronisasi'
                        : 'Pratinjau CSV'}
                  </button>
                )
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}