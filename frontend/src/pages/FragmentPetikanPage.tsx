import { useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { splitFragmentPetikanPdf } from '../services/api';

const DEFAULT_START_MARKER = 'Sdr.';
const DEFAULT_END_MARKER = '(NIP';
const PAGE_PRESETS = [1, 2, 3, 4] as const;

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function FragmentPetikanPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pagesPerFragment, setPagesPerFragment] = useState(2);
  const [startMarker, setStartMarker] = useState(DEFAULT_START_MARKER);
  const [endMarker, setEndMarker] = useState(DEFAULT_END_MARKER);
  const [ignoredPages, setIgnoredPages] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const selectPdfFile = (selected: File | null) => {
    setError(null);
    setNotice(null);
    setWarning(null);
    if (!selected) {
      setFile(null);
      return;
    }
    const isPdf = selected.type === 'application/pdf' || selected.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setError('Format file harus berupa PDF (.pdf).');
      return;
    }
    setFile(selected);
  };

  const clearSelectedFile = () => {
    setFile(null);
    setError(null);
    setNotice(null);
    setWarning(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (busy) return;
    const dropped = event.dataTransfer.files?.[0] ?? null;
    selectPdfFile(dropped);
  };

  const isCustomMarkers = startMarker !== DEFAULT_START_MARKER || endMarker !== DEFAULT_END_MARKER;

  const splitPdf = async () => {
    if (!file) {
      setError('Pilih PDF terlebih dahulu.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setWarning(null);
    try {
      const result = await splitFragmentPetikanPdf(
        file,
        pagesPerFragment,
        startMarker,
        endMarker,
        ignoredPages,
      );
      downloadBlob(result.blob, 'fragment-petikan.zip');
      const warnings: string[] = [];
      if (result.leftoverPageCount > 0) {
        warnings.push(
          `${result.leftoverPageCount} halaman tersisa dan diproses sebagai fragment terakhir.`,
        );
      }
      if (result.ignoredPageCount > 0) {
        warnings.push(`${result.ignoredPageCount} halaman diabaikan.`);
      }
      setNotice(
        `ZIP ${result.fragmentCount} fragment berhasil dibuat dan diproses untuk unduhan.`,
      );
      if (warnings.length) {
        setWarning(warnings.join(' '));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <main className="fragment-page relative isolate min-h-screen bg-surface-950 px-4 pb-14 pt-24 text-slate-100 sm:px-6 lg:pt-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_40%_at_50%_-5%,rgba(14,165,233,0.10),transparent)]"
      />

      <div className="mx-auto max-w-6xl space-y-6">
        {/* Page Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <Link
              to="/"
              className="mt-1 inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2 text-xs font-medium text-brand-300 transition hover:bg-slate-800 hover:text-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
              >
                <path d="M19 12H5m0 0 6 6m-6-6 6-6" />
              </svg>
              <span>Menu utama</span>
            </Link>

            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/15 text-brand-300">
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
                <circle cx="6" cy="6" r="2.5" />
                <circle cx="6" cy="18" r="2.5" />
                <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
              </svg>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
                Operasional · Utilitas PDF
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Fragment Petikan</h1>
                <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                  Experimental
                </span>
              </div>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-400">
                Pecah dokumen PDF gabungan menjadi file petikan individual sesuai jumlah halaman per fragment, dengan penamaan otomatis dari teks di antara penanda awal dan akhir.
              </p>
            </div>
          </div>
        </header>

        {/* Main Two-Column Grid */}
        <div className="grid items-start gap-6 lg:grid-cols-[1.35fr_0.85fr]">
          {/* Left Column: Upload & Split Parameters */}
          <section className="frag-panel space-y-6 rounded-2xl border border-slate-800 bg-slate-900/75 p-5 sm:p-6">
            {/* Step 1: Source PDF Dropzone */}
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  1. Dokumen PDF Sumber
                </span>
                {file && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={clearSelectedFile}
                    className="text-xs font-medium text-rose-300 transition hover:text-rose-200 disabled:opacity-50"
                  >
                    Hapus file
                  </button>
                )}
              </div>

              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!busy) setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`frag-dropzone relative rounded-2xl border-2 border-dashed p-5 transition ${
                  isDragging
                    ? 'border-brand-400 bg-brand-500/10'
                    : 'border-slate-700/90 bg-slate-950/50 hover:border-brand-500/50'
                }`}
              >
                <input
                  ref={fileInput}
                  id="fragment-pdf-input"
                  type="file"
                  accept=".pdf,application/pdf"
                  disabled={busy}
                  onChange={(event) => selectPdfFile(event.target.files?.[0] ?? null)}
                  className="sr-only"
                />

                {!file ? (
                  <label
                    htmlFor="fragment-pdf-input"
                    className="flex cursor-pointer flex-col items-center justify-center py-3 text-center"
                  >
                    <div className="flex size-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-brand-300">
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
                        <path d="M12 16V4m0 0-4 4m4-4 4 4" />
                        <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                      </svg>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-200">
                      Tarik &amp; lepas PDF di sini, atau{' '}
                      <span className="text-brand-300 underline decoration-brand-400/60 underline-offset-2">
                        pilih file
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Hanya mendukung dokumen format <span className="font-mono text-slate-300">.pdf</span>
                    </p>
                  </label>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/15 font-mono text-xs font-bold text-rose-300">
                        PDF
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-100" title={file.name}>
                          {file.name}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-slate-400">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>

                    <label
                      htmlFor="fragment-pdf-input"
                      className="btn-secondary cursor-pointer !rounded-xl !px-3 !py-1.5 text-xs font-semibold"
                    >
                      Ganti PDF
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Split & Naming Parameters */}
            <div className="space-y-4 border-t border-slate-800 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  2. Parameter Pemotongan &amp; Penanda Nama
                </span>
                {isCustomMarkers && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setStartMarker(DEFAULT_START_MARKER);
                      setEndMarker(DEFAULT_END_MARKER);
                    }}
                    className="text-xs font-medium text-brand-300 transition hover:text-brand-200 disabled:opacity-50"
                  >
                    Reset penanda default
                  </button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Halaman per fragment
                  <input
                    type="number"
                    min={1}
                    step={1}
                    disabled={busy}
                    value={pagesPerFragment}
                    onChange={(event) => setPagesPerFragment(Math.max(1, Number.parseInt(event.target.value, 10) || 1))}
                    className="input mt-1.5 font-mono normal-case"
                  />
                </label>

                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Preset cepat
                  </span>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {PAGE_PRESETS.map((preset) => {
                      const active = pagesPerFragment === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          disabled={busy}
                          onClick={() => setPagesPerFragment(preset)}
                          className={`h-10 min-w-10 rounded-xl border px-3 font-mono text-xs font-semibold transition ${
                            active
                              ? 'border-sky-400 bg-sky-500 text-white shadow-xs'
                              : 'border-slate-700 bg-slate-950/70 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {preset} hal
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Teks awal nama
                  <input
                    type="text"
                    disabled={busy}
                    value={startMarker}
                    onChange={(event) => setStartMarker(event.target.value)}
                    placeholder="Contoh: Sdr."
                    className="input mt-1.5 font-mono normal-case"
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Teks akhir nama
                  <input
                    type="text"
                    disabled={busy}
                    value={endMarker}
                    onChange={(event) => setEndMarker(event.target.value)}
                    placeholder="Contoh: (NIP"
                    className="input mt-1.5 font-mono normal-case"
                  />
                </label>
              </div>

              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Halaman yang diabaikan <span className="font-normal normal-case text-slate-500">(opsional)</span>
                <input
                  type="text"
                  disabled={busy}
                  value={ignoredPages}
                  onChange={(event) => setIgnoredPages(event.target.value)}
                  placeholder="Contoh: 1,3-5"
                  className="input mt-1.5 font-mono normal-case"
                />
                <span className="mt-1.5 block text-xs font-normal normal-case text-slate-400">
                  Gunakan nomor halaman PDF, dipisahkan koma; rentang ditulis dengan tanda minus (misal <code className="font-mono text-slate-300">1, 3-5</code>).
                </span>
              </label>
            </div>

            {/* Feedback Banners */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
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
                <span>{error}</span>
              </div>
            )}

            {warning && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-0.5 size-4 shrink-0 text-amber-400"
                >
                  <path d="M12 3 2 20h20L12 3Z" />
                  <path d="M12 9v4m0 4h.01" />
                </svg>
                <span>Peringatan: {warning}</span>
              </div>
            )}

            {notice && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-0.5 size-4 shrink-0 text-emerald-400"
                >
                  <path d="m5 12 4 4L19 6" />
                </svg>
                <span>{notice}</span>
              </div>
            )}

            {/* Primary Action Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-5">
              <span className="text-xs text-slate-400">
                Output dikemas otomatis ke <span className="font-mono text-slate-300">fragment-petikan.zip</span>
              </span>

              <button
                type="button"
                onClick={() => void splitPdf()}
                disabled={!file || busy}
                className="btn-primary inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold shadow-sm disabled:cursor-not-allowed"
              >
                {busy ? (
                  <>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="size-4 animate-spin"
                    >
                      <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.36-6.36-2.12 2.12M7.76 16.24l-2.12 2.12m12.72 0-2.12-2.12M7.76 7.76 5.64 5.64" />
                    </svg>
                    <span>Memproses PDF…</span>
                  </>
                ) : (
                  <>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4"
                    >
                      <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
                      <path d="M5 16v4h14v-4" />
                    </svg>
                    <span>Potong &amp; Unduh ZIP</span>
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Right Column: Live Simulation & Naming Reference */}
          <aside className="space-y-6">
            {/* Live Extraction Simulator */}
            <section className="frag-panel rounded-2xl border border-slate-800 bg-slate-900/75 p-5 sm:p-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                Simulasi Pola Penamaan
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Pratinjau ekstraksi teks berdasarkan konfigurasi penanda saat ini.
              </p>

              <div className="frag-subpanel mt-4 space-y-3 rounded-xl border border-slate-800 bg-slate-950/65 p-4 text-xs">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Contoh Teks di PDF
                  </span>
                  <p className="mt-1.5 rounded-lg border border-slate-800/90 bg-slate-900/75 px-3 py-2 font-mono text-slate-300">
                    …{' '}
                    <span className="rounded bg-sky-500/20 px-1 text-sky-300">
                      {startMarker || '∅'}
                    </span>{' '}
                    <span className="font-semibold text-emerald-300">Budi Santoso</span>{' '}
                    <span className="rounded bg-sky-500/20 px-1 text-sky-300">
                      {endMarker || '∅'}
                    </span>{' '}
                    19850101…
                  </p>
                </div>

                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Hasil Nama File Fragment
                  </span>
                  <p className="mt-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 font-mono font-semibold text-emerald-200">
                    1_Budi Santoso_Petikan.pdf
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 font-mono text-[11px] text-slate-300">
                    {pagesPerFragment} halaman / fragment
                  </span>
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 font-mono text-[11px] text-slate-300">
                    {ignoredPages.trim() ? `Abaikan: ${ignoredPages.trim()}` : 'Semua halaman diproses'}
                  </span>
                </div>
              </div>
            </section>

            {/* Naming & Splitting Rules */}
            <section className="frag-panel rounded-2xl border border-slate-800 bg-slate-900/75 p-5 sm:p-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                Aturan Penamaan &amp; Pemotongan
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-400" />
                  <span>
                    Fragment diberi nomor urut: <span className="font-mono text-slate-200">1</span>,{' '}
                    <span className="font-mono text-slate-200">2</span>, dst.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-400" />
                  <span>
                    Nama diambil dari kemunculan teks pertama di antara penanda awal dan penanda akhir pada tiap fragment.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-400" />
                  <span>
                    Format akhir file: <span className="font-mono text-slate-200">1_Nama Yang Ditemukan_Petikan.pdf</span>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-400" />
                  <span>
                    Jika teks tidak ditemukan di antara penanda, nama fallback menjadi{' '}
                    <span className="font-mono text-slate-200">Tanpa Nama</span>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-400" />
                  <span>
                    Halaman tersisa setelah pembagian tetap diproses sebagai fragment terakhir dan dilaporkan sebagai peringatan.
                  </span>
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}