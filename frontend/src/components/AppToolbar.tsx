import { useEffect, useRef, useState } from 'react';
import * as apiClient from '../services/api';

type ToolbarDialog = 'patch' | 'unfixed' | 'api' | 'game' | null;
type ApiTestState = 'idle' | 'checking' | 'online' | 'offline';

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'Asia/Jakarta',
});

export function AppToolbar() {
  const [currentTime, setCurrentTime] = useState(() => dateTimeFormatter.format(new Date()));
  const [activeDialog, setActiveDialog] = useState<ToolbarDialog>(null);
  const [apiTestState, setApiTestState] = useState<ApiTestState>('idle');
  const [apiDiagnostics, setApiDiagnostics] = useState<apiClient.ApiDiagnostic[]>([]);
  const [apiElapsedMs, setApiElapsedMs] = useState<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(dateTimeFormatter.format(new Date()));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

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

  const dialogTitle = activeDialog === 'patch'
    ? 'Patch Notes'
    : activeDialog === 'unfixed'
      ? 'Catatan yang Belum Diperbaiki'
      : activeDialog === 'api'
        ? 'Uji Fungsi & Koneksi API'
        : 'Mini Game · Snake';

  return (
    <>
      <aside className="z-40 flex items-center gap-2 rounded-xl border border-surface-700 bg-surface-800/95 px-2.5 py-2 shadow-lg backdrop-blur">
        <div className="min-w-0 border-r border-slate-700 pr-2.5 text-right">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Waktu saat ini · WIB</p>
          <p className="whitespace-nowrap text-xs font-semibold tabular-nums text-slate-200">{currentTime}</p>
        </div>
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
          title="Catatan yang Belum Diperbaiki"
          aria-label="Buka catatan yang belum diperbaiki"
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
                  <h3 className="font-semibold text-brand-300">Pembaruan web 1.1.1</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li><strong>Generate Bahan Baperjakat</strong> menggabungkan template 4 orang untuk kategori Mutasi dan template 3 orang untuk kategori Promosi.</li>
                    <li>Topbar menampilkan waktu WIB, catatan pembaruan, catatan yang belum diperbaiki, dan API Test.</li>
                    <li>Pembaruan ini hanya untuk versi web dan belum disinkronkan ke desktop.</li>
                  </ul>
                </section>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-slate-300">
                Fungsi <em>Staging</em> dalam proses penyempurnaan, Klik &quot;Repair&quot; ketika diminta PPTX dan tambahkan header title manual yang hilang dalam proses staging. Mohon Maaf atas Ketidaknyamanannya
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
