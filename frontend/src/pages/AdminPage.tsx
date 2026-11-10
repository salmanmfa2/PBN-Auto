import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import * as apiClient from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type {
  AdminUserUpdatePayload,
  AuthLevel,
  AuthUser,
  UserFeedback,
  PbnOpenCsvValidation,
} from '../types';
import { Spinner } from '../components/Spinner';

type UserForm = {
  user: string;
  name: string;
  auth_level: AuthLevel;
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

function authLevelLabel(level: AuthLevel): string {
  if (level === 3) return 'Super Admin';
  if (level === 2) return 'Admin';
  return 'User';
}

function formatFeedbackDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}

export default function AdminPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [feedbackItems, setFeedbackItems] = useState<UserFeedback[]>([]);
  const [isLoading, setIsLoading] = useState(currentUser?.auth_level === 3);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState((currentUser?.auth_level ?? 1) >= 2);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearingFeedback, setIsClearingFeedback] = useState(false);
  const [deletingFeedbackId, setDeletingFeedbackId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceValidation, setSourceValidation] = useState<PbnOpenCsvValidation | null>(null);
  const [isValidatingSource, setIsValidatingSource] = useState(false);
  const [isReplacingSource, setIsReplacingSource] = useState(false);
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [sourceDialogError, setSourceDialogError] = useState<string | null>(null);
  const [sourceReplaceFailed, setSourceReplaceFailed] = useState(false);
  const sourceFileInput = useRef<HTMLInputElement>(null);

  const refreshUsers = async () => {
    if (currentUser?.auth_level !== 3) return;
    setError(null);
    try {
      setUsers(await apiClient.listAdminUsers());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  };

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

  const closeSourceDialog = useCallback(() => {
    if (sourceDialogError) setError(sourceDialogError);
    setShowSourceDialog(false);
  }, [sourceDialogError]);

  useEffect(() => {
    void refreshUsers();
  }, [currentUser?.auth_level]);

  useEffect(() => {
    void refreshFeedback();
  }, [refreshFeedback]);

  useEffect(() => {
    if (!showSourceDialog || isValidatingSource || isReplacingSource) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSourceDialog();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSourceDialog, isValidatingSource, isReplacingSource, closeSourceDialog]);

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

  const validateSourceFile = async () => {
    if (!sourceFile) return;
    setSourceDialogError(null);
    setNotice(null);
    setIsValidatingSource(true);
    try {
      const result = await apiClient.validatePbnOpenCsv(sourceFile);
      setSourceValidation(result);
    } catch (validationError) {
      setSourceValidation(null);
      setSourceDialogError(validationError instanceof Error ? validationError.message : String(validationError));
    } finally {
      setIsValidatingSource(false);
    }
  };

  const confirmSourceReplacement = async () => {
    if (!sourceFile || !sourceValidation) return;
    setSourceDialogError(null);
    setNotice(null);
    setIsReplacingSource(true);
    try {
      const result = await apiClient.replacePbnOpenCsv(sourceFile);
      setNotice(`Sumber data Insight Hub Beta berhasil diganti dengan ${result.row_count} baris.`);
      setShowSourceDialog(false);
      setSourceValidation(null);
      setSourceFile(null);
      if (sourceFileInput.current) sourceFileInput.current.value = '';
    } catch (replaceError) {
      setSourceReplaceFailed(true);
      setSourceDialogError(replaceError instanceof Error ? replaceError.message : String(replaceError));
    } finally {
      setIsReplacingSource(false);
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
          <Link to="/" className="btn-secondary">Kembali ke Menu</Link>
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

        <section className="card p-5">
          <h2 className="font-semibold">Pengelolaan Data</h2>
          <p className="mt-2 text-sm text-slate-400">
            Admin dapat mengelola record Manajemen Plt./Plh. Penggantian sumber data Insight Hub Beta hanya tersedia untuk Super Admin.
          </p>
          <Link to="/manajemen-plt-plh" className="btn-secondary mt-4 inline-flex">
            Buka Manajemen Plt./Plh.
          </Link>
        </section>

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

        {currentUser?.auth_level === 3 ? (
          <>
            <section className="card p-5">
              <h2 className="font-semibold">Sumber Data Insight Hub Beta</h2>
              <p className="mt-2 text-sm text-slate-400">
                Unggah CSV untuk mengganti seluruh isi <code>pbncleaner.fetch_pbnopen</code>. Kolom harus cocok dengan tabel saat ini.
                Data lama baru dihapus setelah validasi berhasil dan Anda menyetujui konfirmasi berikutnya.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSourceFile(null);
                  setSourceValidation(null);
                  setSourceDialogError(null);
                  setSourceReplaceFailed(false);
                  setError(null);
                  setShowSourceDialog(true);
                }}
                className="btn-primary mt-4"
              >
                Unggah CSV Sumber Data
              </button>
            </section>

            <section className="card overflow-hidden">
              <div className="border-b border-slate-700 px-5 py-4">
                <h2 className="font-semibold">Manajemen Akun</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Level 1 User · Level 2 Admin · Level 3 Super Admin. Password saat ini disimpan sebagai teks biasa sesuai keputusan sementara.
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
                  onChange={(event) => setForm((value) => ({ ...value, auth_level: Number(event.target.value) as AuthLevel }))}
                  className="input mt-1.5"
                >
                  <option value={1}>1 · User</option>
                  <option value={2}>2 · Admin</option>
                  <option value={3}>3 · Super Admin</option>
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
                              disabled={account.user === currentUser.user}
                              className="btn-secondary px-3 py-1.5 disabled:opacity-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeUser(account)}
                              disabled={account.user === currentUser.user}
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
              Pengelolaan akun hanya tersedia untuk Super Admin (level 3).
            </p>
          </section>
        )}
      </div>
      {showSourceDialog && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isReplacingSource) {
              closeSourceDialog();
            }
          }}
        >
          <section
            className="w-full max-w-lg rounded-xl border border-amber-500/40 bg-slate-900 p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pbnopen-source-title"
          >
            <h2 id="pbnopen-source-title" className="text-lg font-semibold text-amber-200">
              {sourceValidation ? 'Kolom CSV cocok' : 'Unggah CSV Sumber Data'}
            </h2>
            {sourceValidation ? (
              <>
                <p className="mt-3 text-sm text-slate-300">
                  File <strong>{sourceValidation.filename}</strong> berisi {sourceValidation.row_count.toLocaleString()} baris dan{' '}
                  {sourceValidation.columns.length} kolom yang cocok dengan sumber data.
                </p>
                <p className="mt-3 rounded-lg border border-rose-700/50 bg-rose-900/20 p-3 text-sm text-rose-200">
                  Apakah Anda yakin ingin mengganti seluruh isi <code>pbncleaner.fetch_pbnopen</code>? Data yang ada akan dihapus.
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-slate-400">
                  Pilih CSV UTF-8 (maksimal 50 MB). Tidak ada perubahan data sebelum Anda mengonfirmasi penggantian.
                </p>
                <input
                  ref={sourceFileInput}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  aria-label="Pilih CSV sumber data Insight Hub Beta"
                  onChange={(event) => {
                    setSourceFile(event.currentTarget.files?.[0] ?? null);
                    setSourceValidation(null);
                    setSourceDialogError(null);
                    setSourceReplaceFailed(false);
                    event.currentTarget.value = '';
                  }}
                />
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => sourceFileInput.current?.click()}
                    disabled={isValidatingSource}
                    className="btn-secondary"
                  >
                    Pilih CSV
                  </button>
                  <span className="text-sm text-slate-300">
                    {sourceFile?.name ?? 'Belum ada file dipilih'}
                  </span>
                </div>
              </>
            )}
            {sourceDialogError && (
              <p role="alert" className="mt-4 rounded-lg border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-sm text-rose-200">
                {sourceDialogError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeSourceDialog}
                disabled={isValidatingSource || isReplacingSource}
                className="btn-secondary"
              >
                Batal
              </button>
              {sourceValidation ? (
                <button
                  type="button"
                  onClick={() => void confirmSourceReplacement()}
                  disabled={isReplacingSource || sourceReplaceFailed}
                  className="btn-danger disabled:opacity-50"
                >
                  {isReplacingSource ? <Spinner size="sm" label="Mengganti data…" /> : 'Ya, Ganti Seluruh Data'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void validateSourceFile()}
                  disabled={!sourceFile || isValidatingSource}
                  className="btn-primary disabled:opacity-50"
                >
                  {isValidatingSource ? <Spinner size="sm" label="Memeriksa kolom…" /> : 'Periksa Kolom CSV'}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
