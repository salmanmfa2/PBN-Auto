import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import * as apiClient from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { AdminUserUpdatePayload, AuthLevel, AuthUser } from '../types';
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

export default function AdminPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [isLoading, setIsLoading] = useState(currentUser?.auth_level === 3);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);

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

  useEffect(() => {
    void refreshUsers();
  }, [currentUser?.auth_level]);

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
            Admin dapat mengelola record Manajemen Plt./Plh. Data pegawai besar dari Excel/CSV ditujukan untuk Insight Hub,
            bukan monitoring Plt./Plh.; integrasi sumber tersebut belum diaktifkan.
          </p>
          <Link to="/manajemen-plt-plh" className="btn-secondary mt-4 inline-flex">
            Buka Manajemen Plt./Plh.
          </Link>
        </section>

        {currentUser?.auth_level === 3 ? (
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
        ) : (
          <section className="card p-5">
            <h2 className="font-semibold">Manajemen Akun</h2>
            <p className="mt-2 text-sm text-slate-400">
              Pengelolaan akun hanya tersedia untuk Super Admin (level 3).
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
