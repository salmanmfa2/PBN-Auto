import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const {
    mode,
    isLoading,
    initializationError,
    sessionExpired,
    logoutError,
    login,
    register,
    continueAsGuest,
  } = useAuth();
  const navigate = useNavigate();
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) {
    return (
      <main className="login-page flex min-h-screen items-center justify-center bg-surface-950 px-4 text-sm text-slate-400">
        <div className="flex items-center gap-2.5 rounded-2xl border border-slate-800 bg-slate-900/80 px-5 py-3.5 shadow-lg">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="size-4 animate-spin text-brand-400"
          >
            <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.36-6.36-2.12 2.12M7.76 16.24l-2.12 2.12m12.72 0-2.12-2.12M7.76 7.76 5.64 5.64" />
          </svg>
          <span>Memeriksa sesi…</span>
        </div>
      </main>
    );
  }
  if (mode) return <Navigate to="/" replace />;

  const switchMode = (registerMode: boolean) => {
    setError(null);
    setIsRegistering(registerMode);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (isRegistering && /\s/.test(username)) {
      setError('Username tidak boleh mengandung spasi.');
      return;
    }
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

  const alertMessage = error ?? (logoutError
    ? `Logout server gagal; sesi lokal sudah dihapus: ${logoutError}`
    : sessionExpired
      ? 'Sesi Anda telah berakhir. Silakan masuk kembali.'
      : initializationError
        ? `Sesi tidak dapat diverifikasi: ${initializationError}`
        : null);

  return (
    <main className="login-page relative isolate flex min-h-screen items-center justify-center bg-surface-950 px-4 py-12 text-slate-100 sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_75%_45%_at_50%_-5%,rgba(14,165,233,0.14),transparent)]"
      />

      <div className="login-shell grid w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl lg:grid-cols-[1.05fr_1fr]">
        {/* Institutional Brand & Capability Panel */}
        <aside className="login-aside hidden flex-col justify-between border-r border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950/35 p-8 lg:flex">
          <div>
            <div className="inline-flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl border border-brand-500/35 bg-brand-500/15 text-brand-300 shadow-xs">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-5"
                >
                  <path d="M12 3 4 7v6c0 5 3.4 7.8 8 9 4.6-1.2 8-4 8-9V7l-8-4Z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-300">
                  MPK Workspace
                </p>
                <p className="text-sm font-semibold text-slate-200">Mutasi Pejabat</p>
              </div>
            </div>

            <h2 className="mt-8 text-2xl font-bold leading-snug tracking-tight">
              Pusat Pengelolaan Data &amp; Administrasi Mutasi Pejabat
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Kelola analisis pegawai, penyusunan agenda pelantikan, dan pembuatan dokumen nota dinas dalam satu ruang kerja terintegrasi.
            </p>

            <ul className="mt-7 space-y-3.5 text-xs text-slate-300">
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-brand-500/30 bg-brand-500/15 text-brand-300">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-3">
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </span>
                <span>Simpan riwayat agenda dan konfigurasi pilihan pegawai per akun pembuat.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-brand-500/30 bg-brand-500/15 text-brand-300">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-3">
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </span>
                <span>Akses berjenjang untuk mode Guest, User (level 1), dan Admin.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-brand-500/30 bg-brand-500/15 text-brand-300">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-3">
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </span>
                <span>Pemrosesan dokumen operasional tanpa menyimpan file unggahan mentah.</span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-800/90 bg-slate-950/45 px-4 py-3 text-xs text-slate-400">
            Gunakan akun terdaftar untuk menyimpan perubahan, atau masuk sebagai <span className="font-semibold text-slate-200">Guest</span> untuk akses baca cepat.
          </div>
        </aside>

        {/* Authentication Form Section */}
        <section className="p-6 sm:p-8">
          <div className="lg:hidden">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">
              MPK Workspace Mutasi Pejabat
            </p>
          </div>

          {/* Segmented Mode Switcher */}
          <div
            role="tablist"
            aria-label="Mode autentikasi"
            className="login-tabs mt-1 grid grid-cols-2 rounded-xl border border-slate-800 bg-slate-950/70 p-1 lg:mt-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!isRegistering}
              onClick={() => switchMode(false)}
              className={`rounded-lg py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                !isRegistering
                  ? 'login-tab-active bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isRegistering}
              onClick={() => switchMode(true)}
              className={`rounded-lg py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                isRegistering
                  ? 'login-tab-active bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Daftar Akun
            </button>
          </div>

          <div className="mt-6">
            <h1 className="text-2xl font-bold tracking-tight">
              {isRegistering ? 'Buat akun User' : 'Masuk ke Workspace'}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-slate-400">
              {isRegistering
                ? 'Akun baru langsung mendapat akses User (level 1).'
                : 'Masuk dengan kredensial akun Anda atau lanjut sebagai Guest.'}
            </p>
          </div>

          {alertMessage && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-200"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 size-4 shrink-0 text-rose-400"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4m0 4h.01" />
              </svg>
              <span>{alertMessage}</span>
            </div>
          )}

          <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              User
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M5 20a7 7 0 0 1 14 0" />
                  </svg>
                </span>
                <input
                  required
                  minLength={3}
                  maxLength={80}
                  pattern={isRegistering ? '[^\\s]+' : undefined}
                  title={isRegistering ? 'Username tidak boleh mengandung spasi' : undefined}
                  autoComplete="username"
                  placeholder="Masukkan username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="input pl-9 normal-case"
                />
              </div>
            </label>

            {isRegistering && (
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Nama
                <div className="relative mt-1.5">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <path d="M7 9h6M7 13h10M7 17h4" />
                    </svg>
                  </span>
                  <input
                    required
                    maxLength={200}
                    autoComplete="name"
                    placeholder="Nama lengkap"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="input pl-9 normal-case"
                  />
                </div>
              </label>
            )}

            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Password
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                    <rect x="4" y="11" width="16" height="9" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                </span>
                <input
                  required
                  minLength={4}
                  maxLength={255}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isRegistering ? 'new-password' : 'current-password'}
                  placeholder="Masukkan password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="input pl-9 pr-10 normal-case"
                />
                <button
                  type="button"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute inset-y-0 right-2 flex items-center rounded-lg px-1.5 text-slate-400 transition hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  {showPassword ? (
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                      <path d="M3 3l18 18" />
                      <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83" />
                      <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.17 4.19" />
                      <path d="M6.61 6.61A17.6 17.6 0 0 0 2 12s3.6 7 10 7a10.7 10.7 0 0 0 5.39-1.61" />
                    </svg>
                  ) : (
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full justify-center py-2.5 text-sm font-semibold shadow-sm"
            >
              {isSubmitting ? 'Memproses…' : isRegistering ? 'Daftar sebagai User' : 'Masuk'}
            </button>
          </form>

          {!isRegistering && (
            <>
              <div className="my-4 flex items-center gap-3">
                <span className="login-divider-line h-px flex-1 bg-slate-800" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  atau
                </span>
                <span className="login-divider-line h-px flex-1 bg-slate-800" />
              </div>

              <button
                type="button"
                onClick={() => {
                  continueAsGuest();
                  navigate('/', { replace: true });
                }}
                className="btn-secondary w-full justify-center py-2.5 text-sm font-medium"
              >
                Lanjut sebagai Guest
              </button>
            </>
          )}

          <p className="mt-6 text-center text-sm text-slate-400">
            {isRegistering ? 'Sudah punya akun?' : 'Belum punya akun?'}{' '}
            <button
              type="button"
              onClick={() => switchMode(!isRegistering)}
              className="font-semibold text-brand-300 transition hover:text-brand-200 focus-visible:outline-none focus-visible:underline"
            >
              {isRegistering ? 'Masuk' : 'Daftar'}
            </button>
          </p>
        </section>
      </div>
    </main>
  );
}