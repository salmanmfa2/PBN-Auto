import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { splitFragmentPetikanPdf } from '../services/api';

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

export default function FragmentPetikanPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pagesPerFragment, setPagesPerFragment] = useState<2 | 3>(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const splitPdf = async () => {
    if (!file) {
      setError('Pilih PDF terlebih dahulu.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const blob = await splitFragmentPetikanPdf(file, pagesPerFragment);
      downloadBlob(blob, 'fragment-petikan.zip');
      setNotice('ZIP fragment berhasil dibuat dan diproses untuk unduhan.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <main className="min-h-screen bg-surface-950 px-4 pb-12 pt-24 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-200">
            ← Menu utama
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">Fragment Petikan</h1>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
              Experimental
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Pecah PDF menjadi fragment per 2 atau 3 halaman. Nama file dicari dari teks pertama
            setelah <span className="font-mono text-slate-300">Sdr.</span> sampai
            {' '}<span className="font-mono text-slate-300">(NIP</span>.
          </p>
        </header>

        <section className="card space-y-5 p-5">
          <div className="grid gap-4 md:grid-cols-[1fr_240px]">
            <label className="block text-sm text-slate-300">
              PDF sumber
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,application/pdf"
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setFile(selected);
                  setError(null);
                  setNotice(null);
                }}
                className="mt-2 block w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm file:mr-4 file:border-0 file:bg-brand-500 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
              />
            </label>

            <label className="block text-sm text-slate-300">
              Halaman per fragment
              <select
                value={pagesPerFragment}
                onChange={(event) => setPagesPerFragment(event.target.value === '3' ? 3 : 2)}
                className="input mt-2"
              >
                <option value={2}>2 halaman</option>
                <option value={3}>3 halaman</option>
              </select>
            </label>
          </div>

          {file && (
            <div className="rounded-lg border border-surface-700 bg-surface-950 p-3 text-sm">
              <p className="font-medium text-slate-200">{file.name}</p>
              <p className="mt-1 text-xs text-slate-400">
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-lg border border-rose-700/50 bg-rose-950/20 p-3 text-sm text-rose-200">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="rounded-lg border border-emerald-700/50 bg-emerald-950/20 p-3 text-sm text-emerald-200">
              {notice}
            </div>
          )}

          <button
            type="button"
            onClick={() => void splitPdf()}
            disabled={!file || busy}
            className="btn-primary disabled:cursor-not-allowed"
          >
            {busy ? 'Memproses PDF…' : 'Potong & Unduh ZIP'}
          </button>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Aturan penamaan</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-400">
            <li>Fragment diberi nomor urut: <span className="font-mono text-slate-300">1</span>, <span className="font-mono text-slate-300">2</span>, dst.</li>
            <li>Nama diambil dari teks pertama antara <span className="font-mono text-slate-300">Sdr.</span> dan <span className="font-mono text-slate-300">(NIP</span> dalam tiap fragment.</li>
            <li>Format akhir: <span className="font-mono text-slate-300">1_Nama Yang Ditemukan_Petikan.pdf</span>.</li>
            <li>Jika teks tidak ditemukan, nama fallback adalah <span className="font-mono text-slate-300">Tanpa Nama</span>.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
