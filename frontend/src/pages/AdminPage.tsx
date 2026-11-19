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
  'plt-plh': 'Manajemen Plt./Plh.',
  'nd-undangan': 'Generate ND Undangan Pelantikan',
  'progress-bahan': 'Bahan Pendukung MPK',
  'simulasi-mutasi': 'Simulasi Mutasi',
  admin: 'Admin',
};
const minimumEditLevel: Partial<Record<MenuAccessKey, number>> = {
  'analisis-kinerja': 1,
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
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [feedbackItems, setFeedbackItems] = useState<UserFeedback[]>([]);
  const [isLoading, setIsLoading] = useState((currentUser?.auth_level ?? 0) >= 3);
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

  return (
    <main className="min-h-screen bg-surface-950 px-4 pb-10 pt-24 text-slate-100 md:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Ruang Kerja</p>
            <h1 className="mt-1 text-2xl font-semibold">Admin</h1>
            <p className="mt-1 text-sm text-slate-400">
              Masuk sebagai {currentUser?.name} · {authLevelLabel(currentUser?.auth_level ?? 1)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isGodUser && (
              <button
                type="button"
                onClick={openMenuAccessDialog}
                className="btn-secondary inline-flex items-center gap-2"
              >
                <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3l8 3v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4" />
                </svg>
                Set Auth Menu
              </button>
            )}
            <Link to="/" className="btn-secondary">Kembali ke Menu</Link>
          </div>
        </header>

        {(error || notice) && (
          <div
            role={error ? 'alert' : 'status'}
            className={`rounded-lg border px-4 py-3 text-sm ${
              error
                ? 'border-rose-700/50 bg-rose-900/20 text-rose-200'
                : 'border-emerald-700/50 bg-emerald-900/20 text-emerald-200'
            }`}
          >
            {error ?? notice}
          </div>
        )}

        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-700 px-5 py-4">
            <div>
              <h2 className="font-semibold">Feedback Pengguna</h2>
              <p className="mt-1 text-xs text-slate-400">
                Masukan terbaru dari pengguna untuk menu dan aplikasi.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void clearFeedback()}
              disabled={!feedbackItems.length || isLoadingFeedback || isClearingFeedback || deletingFeedbackId !== null}
              className="btn-danger disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isClearingFeedback ? <Spinner size="sm" label="Menghapus…" /> : 'Hapus Semua Feedback'}
            </button>
          </div>
          {isLoadingFeedback ? (
            <div className="flex justify-center p-8"><Spinner label="Memuat feedback…" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Dikirim</th>
                    <th className="px-5 py-3">Pengguna</th>
                    <th className="px-5 py-3">Menu</th>
                    <th className="px-5 py-3">Feedback</th>
                    <th className="px-5 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {feedbackItems.map((item) => (
                    <tr key={item.id}>
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-400">
                        {formatFeedbackDate(item.created_at)}
                      </td>
                      <td className="px-5 py-3 text-slate-300">{item.submitted_by ?? 'Akun dihapus'}</td>
                      <td className="px-5 py-3 text-slate-300">{item.menu}</td>
                      <td className="max-w-md whitespace-pre-wrap break-words px-5 py-3 text-slate-200">
                        {item.feedback}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => void removeFeedback(item)}
                          disabled={isClearingFeedback || deletingFeedbackId !== null}
                          className="btn-danger px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingFeedbackId === item.id ? 'Menghapus…' : 'Hapus'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {feedbackItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                        Belum ada feedback.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {(currentUser?.auth_level ?? 0) >= 2 && (
          <section className="card p-5">
              <h2 className="font-semibold">Employee Data Source</h2>
              <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-3 text-sm">
                <h3 className="font-medium text-slate-200">Re-sync terakhir</h3>
                {isLoadingSourceSync ? (
                  <div className="mt-2"><Spinner size="sm" label="Memuat status sumber data…" /></div>
                ) : sourceSyncError ? (
                  <p role="alert" className="mt-2 text-rose-300">{sourceSyncError}</p>
                ) : sourceSyncStatus?.last_synced_at ? (
                  <>
                    <p className="mt-2 text-slate-300">
                      {formatSourceSyncDate(sourceSyncStatus.last_synced_at)}
                    </p>
                    <p className="mt-1 text-slate-400">
                      Dilakukan oleh: {sourceSyncStatus.synced_by_name || sourceSyncStatus.synced_by_user}
                      {sourceSyncStatus.synced_by_name && sourceSyncStatus.synced_by_user
                        ? ` (@${sourceSyncStatus.synced_by_user})`
                        : ''}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-slate-400">Belum ada catatan re-sync melalui aplikasi.</p>
                )}
              </div>
              {(currentUser?.auth_level ?? 0) >= 3 && (
                <div className="mt-4 flex flex-wrap gap-3">
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
          </section>
        )}

        {(currentUser?.auth_level ?? 0) >= 3 ? (
          <>
            <section className="card overflow-hidden">
              <div className="border-b border-slate-700 px-5 py-4">
                <h2 className="font-semibold">Manajemen Akun</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Level 1 User · Level 2 Admin · Level 3 Super Admin · Level 4 God User.
                </p>
              </div>
            <form onSubmit={(event) => void submitUser(event)} className="grid gap-4 p-5 md:grid-cols-2">
              {!editingUser && (
                <label className="block text-sm text-slate-300">
                  User
                  <input
                    required
                    minLength={3}
                    maxLength={80}
                    value={form.user}
                    onChange={(event) => setForm((value) => ({ ...value, user: event.target.value }))}
                    className="input mt-1.5"
                  />
                </label>
              )}
              <label className="block text-sm text-slate-300">
                Nama
                <input
                  required
                  maxLength={200}
                  value={form.name}
                  onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
                  className="input mt-1.5"
                />
              </label>
              <label className="block text-sm text-slate-300">
                Auth level
                <select
                  value={form.auth_level}
                  onChange={(event) => setForm((value) => ({ ...value, auth_level: Number(event.target.value) as AssignableAuthLevel }))}
                  className="input mt-1.5"
                >
                  <option value={1}>1 · User</option>
                  <option value={2}>2 · Admin</option>
                  <option value={3}>3 · Super Admin</option>
                  {currentUser?.auth_level === 4 && <option value={4}>4 · God User</option>}
                </select>
              </label>
              <label className="block text-sm text-slate-300">
                {editingUser ? 'Password baru (opsional)' : 'Password'}
                <input
                  required={!editingUser}
                  minLength={4}
                  maxLength={255}
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))}
                  className="input mt-1.5"
                />
              </label>
              {editingUser && (
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(event) => setForm((value) => ({ ...value, is_active: event.target.checked }))}
                  />
                  Akun aktif
                </label>
              )}
              <div className="flex items-center gap-2 md:col-span-2">
                <button type="submit" disabled={isSaving} className="btn-primary">
                  {isSaving ? <Spinner size="sm" label="Menyimpan…" /> : editingUser ? 'Simpan Perubahan' : 'Buat Akun'}
                </button>
                {editingUser && (
                  <button type="button" onClick={resetForm} disabled={isSaving} className="btn-secondary">
                    Batal
                  </button>
                )}
              </div>
            </form>

            <div className="overflow-x-auto border-t border-slate-700">
              {isLoading ? (
                <div className="flex justify-center p-8"><Spinner label="Memuat akun…" /></div>
              ) : (
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-5 py-3">User</th>
                      <th className="px-5 py-3">Nama</th>
                      <th className="px-5 py-3">Level</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {users.map((account) => (
                      <tr key={account.user}>
                        <td className="px-5 py-3">{account.user}</td>
                        <td className="px-5 py-3">{account.name}</td>
                        <td className="px-5 py-3">{authLevelLabel(account.auth_level)}</td>
                        <td className="px-5 py-3">{account.is_active ? 'Aktif' : 'Nonaktif'}</td>
                        <td className="px-5 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEditing(account)}
                              disabled={
                                account.user === currentUser?.user
                                || (account.auth_level === 4 && currentUser?.auth_level !== 4)
                              }
                              className="btn-secondary px-3 py-1.5 disabled:opacity-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeUser(account)}
                              disabled={
                                account.user === currentUser?.user
                                || (account.auth_level === 4 && currentUser?.auth_level !== 4)
                              }
                              className="btn-danger px-3 py-1.5 disabled:opacity-50"
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">Belum ada akun.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            </section>
          </>
        ) : (
          <section className="card p-5">
            <h2 className="font-semibold">Manajemen Akun</h2>
            <p className="mt-2 text-sm text-slate-400">
              Pengelolaan akun hanya tersedia untuk Super Admin (level 3) dan God User (level 4).
            </p>
          </section>
        )}
      </div>
      {showMenuAccessDialog && isGodUser && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/75 p-4"
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
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6"
            role="dialog"
          >
            <h2 className="text-lg font-semibold" id="menu-access-title">Set Auth Menu</h2>
            <p className="mt-1 text-sm text-slate-400">
              Atur level minimum untuk melihat dan mengubah setiap menu. God User selalu memiliki akses penuh.
            </p>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Menu</th>
                    <th className="px-3 py-2">View</th>
                    <th className="px-3 py-2">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {menuAccessDraft.map((policy) => {
                    const editMinimum = Math.max(
                      policy.view_level,
                      minimumEditLevel[policy.menu_key] ?? 0,
                    );
                    return (
                      <tr key={policy.menu_key}>
                        <th className="px-3 py-3 font-medium text-slate-200">
                          {menuAccessLabels[policy.menu_key]}
                        </th>
                        <td className="px-3 py-3">
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
                        <td className="px-3 py-3">
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
              <p className="mt-4 rounded-lg border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-sm text-rose-200" role="alert">
                {menuAccessError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
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
                {isSavingMenuAccess ? <Spinner size="sm" label="Menyimpan…" /> : 'Simpan'}
              </button>
            </div>
          </section>
        </div>
      )}
      {showSourceDialog && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4"
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
            className="w-full max-w-xl rounded-xl border border-amber-500/40 bg-slate-900 p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="database-management-title"
          >
            <h2 id="database-management-title" className="text-lg font-semibold text-amber-200">
              Database Management
            </h2>
            {!isGodUser ? (
              <p role="alert" className="mt-4 rounded-lg border border-rose-700/50 bg-rose-900/20 p-3 text-sm text-rose-200">
                You have no authority to view this page.
              </p>
            ) : isLoadingDatabaseTargets ? (
              <div className="flex justify-center py-8"><Spinner label="Memuat tabel database…" /></div>
            ) : (
              <div className="mt-4 space-y-4">
                <label className="block text-sm text-slate-300">
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
                {(() => {
                  const target = databaseTargets.find((item) => item.key === selectedDatabaseTarget);
                  if (!target) return null;
                  if (target.operation === 'sync') {
                    return (
                      <p className="text-sm text-slate-400">
                        Sinkronkan <code>{target.table_name}</code> dari <code>{target.source_table}</code>.
                        NIP yang cocok mempertahankan <code>employee_id</code>; data baru ditambahkan dan data yang sudah tidak ada di sumber dihapus.
                      </p>
                    );
                  }
                  if (target.operation === 'reference') {
                    return (
                      <p className="text-sm text-slate-400">
                        Unggah CSV untuk memperbarui <code>{target.table_name}</code> berdasarkan ID yang sudah ada.
                        ID yang masih dipakai tabel pegawai tidak dapat dihapus.
                      </p>
                    );
                  }
                  return (
                    <p className="text-sm text-slate-400">
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
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => databaseFileInput.current?.click()}
                        disabled={isPreviewingDatabaseChange || isApplyingDatabaseChange}
                        className="btn-secondary"
                      >
                        Pilih CSV
                      </button>
                      <span className="text-sm text-slate-300">
                        {databaseFile?.name ?? 'Belum ada file dipilih'}
                      </span>
                    </div>
                  </>
                )}
                {databasePreview && (
                  <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4">
                    <p className="text-sm text-slate-200">
                      Pratinjau <code>{databasePreview.table_name}</code>
                      {databasePreview.filename ? ` · ${databasePreview.filename}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Tidak ada perubahan yang diterapkan sampai Anda memilih tombol konfirmasi.
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div><p className="text-xs text-slate-400">Di sumber</p><p>{databasePreview.row_count.toLocaleString()}</p></div>
                      <div><p className="text-xs text-slate-400">Ditambahkan</p><p>{databasePreview.inserted_count.toLocaleString()}</p></div>
                      <div><p className="text-xs text-slate-400">Diperbarui</p><p>{databasePreview.updated_count.toLocaleString()}</p></div>
                      <div><p className="text-xs text-slate-400">Dihapus</p><p>{databasePreview.deleted_count.toLocaleString()}</p></div>
                    </div>
                    {databasePreview.operation === 'replace' && (
                      <p className="mt-3 text-sm text-rose-200">
                        Seluruh {databasePreview.current_row_count.toLocaleString()} baris saat ini akan diganti.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {databaseDialogError && isGodUser && (
              <p role="alert" className="mt-4 rounded-lg border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-sm text-rose-200">
                {databaseDialogError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
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
