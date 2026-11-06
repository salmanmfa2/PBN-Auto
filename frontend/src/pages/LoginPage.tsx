import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { mode, isLoading, initializationError, logoutError, login, register, continueAsGuest } = useAuth();
  const navigate = useNavigate();
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-surface-950 text-sm text-slate-400">Memeriksa sesi…</main>;
  }
  if (mode) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (isRegistering) await register(username, name, password);
      else await login(username, password);
      navigate('/', { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-950 px-4 py-10 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">PBN Auto</p>
        <h1 className="mt-2 text-2xl font-semibold">{isRegistering ? 'Buat akun User' : 'Masuk'}</h1>
        <p className="mt-2 text-sm text-slate-400">
          {isRegistering
            ? 'Akun baru langsung mendapat akses User (level 1).'
            : 'Masuk untuk menggunakan akun atau lanjut sebagai Guest.'}
        </p>

        {(error || initializationError || logoutError) && (
          <div role="alert" className="mt-4 rounded-lg border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-sm text-rose-200">
            {error ?? (logoutError
              ? `Logout server gagal; sesi lokal sudah dihapus: ${logoutError}`
              : `Sesi tidak dapat diverifikasi: ${initializationError}`)}
          </div>
        )}

        <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-4">
          <label className="block text-sm text-slate-300">
            User
            <input
              required
              minLength={3}
              maxLength={80}
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="input mt-1.5"
            />
          </label>
          {isRegistering && (
            <label className="block text-sm text-slate-300">
              Nama
              <input
                required
                maxLength={200}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="input mt-1.5"
              />
            </label>
          )}
          <label className="block text-sm text-slate-300">
            Password
            <input
              required
              minLength={4}
              maxLength={255}
              type="password"
              autoComplete={isRegistering ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input mt-1.5"
            />
          </label>
          <button type="submit" disabled={isSubmitting} className="btn-primary w-full justify-center">
            {isSubmitting ? 'Memproses…' : isRegistering ? 'Daftar sebagai User' : 'Masuk'}
          </button>
        </form>

        {!isRegistering && (
          <button
            type="button"
            onClick={() => {
              continueAsGuest();
              navigate('/', { replace: true });
            }}
            className="btn-secondary mt-3 w-full justify-center"
          >
            Lanjut sebagai Guest
          </button>
        )}

        <p className="mt-5 text-center text-sm text-slate-400">
          {isRegistering ? 'Sudah punya akun?' : 'Belum punya akun?'}{' '}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setIsRegistering((value) => !value);
            }}
            className="font-medium text-brand-300 hover:text-brand-200"
          >
            {isRegistering ? 'Masuk' : 'Daftar'}
          </button>
        </p>
      </section>
    </main>
  );
}
