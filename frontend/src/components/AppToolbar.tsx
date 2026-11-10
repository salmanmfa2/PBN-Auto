import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import * as apiClient from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { ThemeName } from '../types';

type ToolbarDialog = 'patch' | 'unfixed' | 'api' | 'game' | null;
type ApiTestState = 'idle' | 'checking' | 'online' | 'offline';

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'Asia/Jakarta',
});

const THEME_STORAGE_KEY = 'pbn.theme.guest';
const themeOptions: Array<{ value: ThemeName; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

function getAuthorityLabel(authLevel: number): string {
  if (authLevel === 3) return 'Super Admin · Level 3';
  if (authLevel === 2) return 'Admin · Level 2';
  return 'User · Level 1';
}

function applyDocumentTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'light' ? '#f8fafc' : '#0f172a');
}

export function AppToolbar() {
  const navigate = useNavigate();
  const { mode, user, logout } = useAuth();
  const [currentTime, setCurrentTime] = useState(() => dateTimeFormatter.format(new Date()));
  const [activeDialog, setActiveDialog] = useState<ToolbarDialog>(null);
  const [apiTestState, setApiTestState] = useState<ApiTestState>('idle');
  const [apiDiagnostics, setApiDiagnostics] = useState<apiClient.ApiDiagnostic[]>([]);
  const [apiElapsedMs, setApiElapsedMs] = useState<number | null>(null);
  const [theme, setTheme] = useState<ThemeName>('default');
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [showExtraTools, setShowExtraTools] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const toolbarRef = useRef<HTMLElement>(null);
  const themeRequestId = useRef(0);
  const dragOrigin = useRef<{ pointerX: number; pointerY: number; left: number; top: number } | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState<{ left: number | null; top: number }>({
    left: null,
    top: 12,
  });

  const clampPosition = (left: number, top: number) => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return { left, top };

    return {
      left: Math.max(8, Math.min(window.innerWidth - toolbar.offsetWidth - 8, left)),
      top: Math.max(8, Math.min(window.innerHeight - toolbar.offsetHeight - 8, top)),
    };
  };

  const snapToNearestEdge = (left: number, top: number) => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return { left, top };
    const position = clampPosition(left, top);
    const right = window.innerWidth - toolbar.offsetWidth - 8;
    const bottom = window.innerHeight - toolbar.offsetHeight - 8;
    const candidates = [
      { distance: position.left - 8, left: 8, top: position.top },
      { distance: right - position.left, left: right, top: position.top },
      { distance: position.top - 8, left: position.left, top: 8 },
      { distance: bottom - position.top, left: position.left, top: bottom },
    ];
    const nearest = candidates.reduce((closest, candidate) =>
      candidate.distance < closest.distance ? candidate : closest);
    return clampPosition(nearest.left, nearest.top);
  };

  const handleDragStart = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = toolbarRef.current?.getBoundingClientRect();
    if (!bounds) return;
    dragOrigin.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      left: bounds.left,
      top: bounds.top,
    };
    setIsDragging(true);
  };

  const handleDragMove = (event: PointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin) return;
    setToolbarPosition(clampPosition(
      origin.left + event.clientX - origin.pointerX,
      origin.top + event.clientY - origin.pointerY,
    ));
  };

  const handleDragEnd = (event: PointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (origin) {
      const bounds = toolbarRef.current?.getBoundingClientRect();
      const position = event.type === 'pointerup'
        ? clampPosition(
          origin.left + event.clientX - origin.pointerX,
          origin.top + event.clientY - origin.pointerY,
        )
        : bounds ? clampPosition(bounds.left, bounds.top) : null;
      if (position) setToolbarPosition(snapToNearestEdge(position.left, position.top));
    }
    dragOrigin.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
  };

  const handlePositionKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const movement = event.shiftKey ? 40 : 16;
    const offsets: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -movement, y: 0 },
      ArrowRight: { x: movement, y: 0 },
      ArrowUp: { x: 0, y: -movement },
      ArrowDown: { x: 0, y: movement },
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const bounds = toolbarRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setToolbarPosition(clampPosition(bounds.left + offset.x, bounds.top + offset.y));
  };

  useEffect(() => {
    const keepToolbarInView = () => {
      const bounds = toolbarRef.current?.getBoundingClientRect();
      if (bounds && toolbarPosition.left !== null) {
        setToolbarPosition(snapToNearestEdge(bounds.left, bounds.top));
      }
    };
    window.addEventListener('resize', keepToolbarInView);
    return () => window.removeEventListener('resize', keepToolbarInView);
  }, [toolbarPosition.left]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(dateTimeFormatter.format(new Date()));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const requestId = ++themeRequestId.current;
    const applyTheme = (nextTheme: ThemeName) => {
      setTheme(nextTheme);
      applyDocumentTheme(nextTheme);
    };

    setThemeError(null);
    if (mode === 'user') {
      apiClient.getThemePreference()
        .then((savedTheme) => {
          if (active && requestId === themeRequestId.current) applyTheme(savedTheme);
        })
        .catch((error: unknown) => {
          if (!active || requestId !== themeRequestId.current) return;
          applyTheme('default');
          setThemeError(`Could not load your saved appearance: ${error instanceof Error ? error.message : String(error)}`);
          setThemeMenuOpen(true);
        });
    } else if (mode === 'guest') {
      try {
        const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
        const validTheme = themeOptions.find((option) => option.value === savedTheme)?.value ?? 'default';
        applyTheme(validTheme);
      } catch (error) {
        setThemeError(`Could not load your saved appearance: ${error instanceof Error ? error.message : String(error)}`);
        setThemeMenuOpen(true);
        applyTheme('default');
      }
    }

    return () => {
      active = false;
    };
  }, [mode, user?.user]);

  useEffect(() => {
    if (!activeDialog) {
      return;
    }

    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveDialog(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDialog]);

  const runApiTest = async () => {
    setApiTestState('checking');
    setApiDiagnostics([]);
    setApiElapsedMs(null);
    setActiveDialog('api');
    const startedAt = performance.now();
    try {
      const results = await apiClient.runApiDiagnostics();
      setApiDiagnostics(results);
      setApiElapsedMs(performance.now() - startedAt);
      setApiTestState(results.every((result) => result.passed) ? 'online' : 'offline');
    } catch (error) {
      setApiDiagnostics([{
        id: 'api',
        label: 'Pengujian API',
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
      }]);
      setApiElapsedMs(performance.now() - startedAt);
      setApiTestState('offline');
    }
  };

  const handleAccountAction = async () => {
    await logout();
    navigate('/login');
  };

  const handleThemeChange = async (nextTheme: ThemeName) => {
    themeRequestId.current += 1;
    setTheme(nextTheme);
    applyDocumentTheme(nextTheme);
    setThemeError(null);
    setThemeSaving(true);
    try {
      if (mode === 'user') {
        await apiClient.updateThemePreference(nextTheme);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      }
      setThemeMenuOpen(false);
    } catch (error) {
      setThemeError(`Could not save your appearance: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setThemeSaving(false);
    }
  };

  const toggleExtraTools = () => {
    setShowExtraTools((visible) => !visible);
  };

  const dialogTitle = activeDialog === 'patch'
    ? 'Patch Notes'
    : activeDialog === 'unfixed'
      ? 'Catatan Staging'
      : activeDialog === 'api'
        ? 'Uji Fungsi & Koneksi API'
        : 'Mini Game · Snake';

  return (
    <>
      <aside
        ref={toolbarRef}
        className={`fixed z-50 flex max-w-[calc(100vw-1rem)] flex-wrap items-center gap-2 rounded-xl border border-surface-700 bg-surface-800/95 px-2.5 py-2 shadow-lg backdrop-blur motion-reduce:transition-none ${
          isDragging ? '' : 'transition-[left,top] duration-200 ease-out'
        }`}
        style={{
          left: toolbarPosition.left ?? undefined,
          right: toolbarPosition.left === null ? 12 : undefined,
          top: toolbarPosition.top,
        }}
      >
        <div
          role="group"
          tabIndex={0}
          aria-label="Toolbar position. Drag to move, or use arrow keys; hold Shift to move farther."
          onKeyDown={handlePositionKeyDown}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] cursor-grab touch-none select-none items-center gap-x-3 border-r border-slate-700 pr-2.5 active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          title={`Drag to move; use arrow keys to reposition. ${user ? `${user.name} · ${getAuthorityLabel(user.auth_level)}` : 'Guest'}`}
        >
          <div className="min-w-0 text-left">
            <p className="truncate text-xs font-semibold text-slate-200">{user?.name ?? 'Guest'}</p>
            <p className="truncate text-[10px] font-medium text-slate-500">
              {user ? getAuthorityLabel(user.auth_level) : 'Guest access'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Waktu · WIB</p>
            <p className="whitespace-nowrap text-xs font-semibold tabular-nums text-slate-200">{currentTime}</p>
          </div>
        </div>
        <div className="relative">
          <button
            type="button"
            title={`Appearance: ${theme}`}
            aria-label="Choose appearance theme"
            aria-expanded={themeMenuOpen}
            aria-controls={themeMenuOpen ? 'app-toolbar-theme-options' : undefined}
            onClick={() => setThemeMenuOpen((open) => !open)}
            className="rounded-lg p-2 text-slate-300 transition hover:bg-surface-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v2m0 14v2M3 12h2m14 0h2m-3.64-6.36l-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0l-1.42-1.42M7.06 7.06L5.64 5.64M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </button>
          {themeMenuOpen && (
            <div
              id="app-toolbar-theme-options"
              className="absolute right-0 top-full z-[55] mt-2 w-44 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-xl"
              role="group"
              aria-label="Appearance theme"
            >
              <p className="px-2 py-1 text-xs font-semibold text-slate-400">Appearance</p>
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={themeSaving}
                  aria-pressed={theme === option.value}
                  onClick={() => void handleThemeChange(option.value)}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-surface-700 disabled:opacity-50 ${
                    theme === option.value ? 'bg-surface-700 text-slate-100' : 'text-slate-300'
                  }`}
                >
                  {option.label}
                  {theme === option.value && <span aria-hidden="true">✓</span>}
                </button>
              ))}
              {themeSaving && <p role="status" className="px-2 pt-2 text-xs text-slate-400">Saving…</p>}
              {themeError && (
                <p role="alert" className="px-2 pt-2 text-xs text-rose-300">{themeError}</p>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          title={showExtraTools ? 'Hide extra toolbar tools' : 'Show extra toolbar tools'}
          aria-label={showExtraTools ? 'Hide extra toolbar tools' : 'Show extra toolbar tools'}
          aria-controls={showExtraTools ? 'app-toolbar-extra-tools' : undefined}
          aria-expanded={showExtraTools}
          onClick={toggleExtraTools}
          className="rounded-lg p-2 text-slate-300 transition hover:bg-surface-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            {showExtraTools
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" />}
          </svg>
        </button>
        {showExtraTools && (
          <div id="app-toolbar-extra-tools" className="flex items-center gap-1" role="group" aria-label="Extra toolbar tools">
            <button
              type="button"
              title="Patch Notes"
              aria-label="Buka Patch Notes"
              onClick={() => setActiveDialog('patch')}
              className="rounded-lg p-2 text-slate-300 transition hover:bg-surface-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 3.75h7l4.25 4.5v12A.75.75 0 0117.5 21h-10a.75.75 0 01-.75-.75v-16A.75.75 0 017.5 3.5h6.25M14 3.75v4.5h4.25M9 12h6m-6 3.5h6" />
              </svg>
            </button>
            <button
              type="button"
              title="Catatan Staging"
              aria-label="Buka catatan staging"
              onClick={() => setActiveDialog('unfixed')}
              className="rounded-lg p-2 text-amber-300 transition hover:bg-surface-700 hover:text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4m0 4h.01M10.3 3.95L2.8 17a2 2 0 001.73 3h14.94a2 2 0 001.73-3l-7.5-13.05a2 2 0 00-3.4 0z" />
              </svg>
            </button>
            <button
              type="button"
              title="Main Snake"
              aria-label="Buka mini game Snake"
              onClick={() => setActiveDialog('game')}
              className="rounded-lg p-2 text-emerald-300 transition hover:bg-surface-700 hover:text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 8h8a4 4 0 014 4v3a2 2 0 01-3.2 1.6L14 14h-4l-2.8 2.6A2 2 0 014 15v-3a4 4 0 014-4zM8 11v4m-2-2h4m6-1h.01M18 14h.01" />
              </svg>
            </button>
            <button
              type="button"
              title={apiTestState === 'checking' ? 'Menguji API…' : 'API Test'}
              aria-label="Uji koneksi API"
              aria-busy={apiTestState === 'checking'}
              onClick={() => void runApiTest()}
              disabled={apiTestState === 'checking'}
              className={`rounded-lg p-2 transition hover:bg-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:cursor-wait disabled:opacity-50 ${
                apiTestState === 'online' ? 'text-emerald-300' : apiTestState === 'offline' ? 'text-rose-300' : 'text-slate-300 hover:text-white'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8.5 5.5a5 5 0 017 0m-10 3a9 9 0 0113 0m-16 3a13 13 0 0119 0M12 18h.01M12 14.5a3.5 3.5 0 00-2.47 1.03" />
              </svg>
            </button>
            {user && user.auth_level >= 2 && (
              <button
                type="button"
                title="Ruang Admin"
                aria-label="Buka Ruang Admin"
                onClick={() => navigate('/admin')}
                className="rounded-lg p-2 text-amber-300 transition hover:bg-surface-700 hover:text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3l8 3v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3zm-3 9l2 2 4-4" />
                </svg>
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          title={mode === 'guest' ? 'Masuk atau daftar' : 'Keluar'}
          aria-label={mode === 'guest' ? 'Masuk atau daftar' : `Keluar dari akun ${user?.user ?? ''}`}
          onClick={() => void handleAccountAction()}
          className="rounded-lg p-2 text-slate-300 transition hover:bg-surface-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            {mode === 'guest' ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4m-4-4l4-5-4-5m4 5H3" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4m4-4l-4-5 4-5m-4 5h12" />
            )}
          </svg>
        </button>
      </aside>

      {activeDialog && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setActiveDialog(null);
            }
          }}
        >
          <section
            className={`w-full rounded-2xl border border-slate-700 bg-slate-900 p-6 text-left shadow-2xl ${
              activeDialog === 'game' ? 'max-w-3xl' : 'max-w-lg'
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-toolbar-dialog-title"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 id="app-toolbar-dialog-title" className="text-xl font-semibold text-white">{dialogTitle}</h2>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setActiveDialog(null)}
                aria-label={`Tutup ${dialogTitle}`}
                className="rounded-md px-2 py-1 text-slate-400 transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                ×
              </button>
            </div>
            {activeDialog === 'game' ? (
              <iframe
                title="Mini Game Snake"
                src={apiClient.getSnakeGameUrl()}
                sandbox="allow-scripts allow-same-origin"
                className="h-[min(76vh,760px)] w-full rounded-xl border border-slate-800 bg-slate-950"
              />
            ) : activeDialog === 'api' ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-400">
                  Memeriksa koneksi, endpoint tiap menu, dan akses data tanpa mengubah data.
                </p>
                {apiTestState === 'checking' ? (
                  <p role="status" className="animate-pulse text-sm text-slate-300">
                    Menjalankan pemeriksaan…
                  </p>
                ) : (
                  <>
                    <ul className="space-y-2" aria-label="Hasil pemeriksaan API">
                      {apiDiagnostics.map((result) => (
                        <li
                          key={result.id}
                          className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2.5"
                        >
                          <span
                            aria-hidden="true"
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                              result.passed
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-rose-500/15 text-rose-300'
                            }`}
                          >
                            {result.passed ? '✓' : '×'}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-slate-100">{result.label}</span>
                            <span className={`block break-words text-xs ${result.passed ? 'text-slate-400' : 'text-rose-300'}`}>
                              {result.detail}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p
                      role="status"
                      className={`border-t border-slate-800 pt-3 text-sm font-semibold ${
                        apiTestState === 'online' ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {apiTestState === 'online' ? 'Semua pemeriksaan berhasil' : 'Ada pemeriksaan yang gagal'}
                      {apiElapsedMs !== null && (
                        <span className="ml-1 font-normal text-slate-300">
                          · selesai dalam {apiElapsedMs < 1000
                            ? `${Math.round(apiElapsedMs)} ms`
                            : `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(apiElapsedMs / 1000)} detik`}
                        </span>
                      )}
                    </p>
                  </>
                )}
              </div>
            ) : activeDialog === 'patch' ? (
              <div className="space-y-5 text-sm leading-relaxed text-slate-300">
                <section>
                  <h3 className="font-semibold text-brand-300">Versi 1.1.0 · 2 November 2026</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>Pilihan template PowerPoint 3 baris dan 4 baris untuk Sitasi Es.III.</li>
                    <li>Staging dan penggabungan PPTX Sitasi Es.III/Es.IV sesuai urutan dengan layout template masing-masing.</li>
                    <li>Perataan kolom PowerPoint, penyempurnaan pembersihan Sitasi Es.III, dan tombol ekspor yang lebih ringkas.</li>
                    <li>Pemeriksaan update desktop dan pengunduhan runtime backend secara terpisah.</li>
                  </ul>
                </section>
                <section>
                  <h3 className="font-semibold text-brand-300">Pembaruan web 1.2</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li><strong>Generate Bahan Baperjakat</strong> menggabungkan template 4 orang untuk kategori Mutasi dan template 3 orang untuk kategori Promosi.</li>
                    <li>Akun web dengan peran Guest, User, Admin, dan Super Admin; sesi login berlaku satu jam dan workspace Admin menyediakan pengelolaan akun.</li>
                    <li>Manajemen Plt./Plh. web dengan monitoring, status masa kerja, notifikasi, dan ekspor Excel yang dibatasi berdasarkan peran.</li>
                    <li>Menu Generate ND Undangan Pelantikan dan Analisis Kinerja DJPb tersedia sebagai placeholder “On development”.</li>
                    <li>Toolbar memiliki jam WIB yang dapat digeser, pilihan tema Default/Dark/Light tersimpan per pengguna, serta kontrol tampil/sembunyikan untuk tombol utilitas.</li>
                    <li>Groq chat web dengan format Markdown, tombol hapus percakapan, dan instruksi agar tidak mengarang fitur yang belum dikonfirmasi.</li>
                    <li>Fitur akun, monitoring, menu tambahan, preferensi pengguna, dan chat ini khusus web; desktop tetap hanya memiliki menu PBN Analytics dan Insight Hub tanpa login.</li>
                  </ul>
                </section>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-slate-300">
                Proses Staging telah diperbaiki pada update 1.2.0.
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
