import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import * as apiClient from '../services/api';
import type {
  PelantikanAgendaDetail,
  PelantikanAgendaFields,
  PelantikanAgendaPerson,
  PelantikanAgendaSummary,
  PelantikanModality,
  PelantikanPersonChoice,
} from '../types';

const emptyFields: PelantikanAgendaFields = {
  tanggal_pelantikan: '',
  nd_undangan_pelantikan: '',
  tanggal_nd_undangan_pelantikan: '',
  jam_pelantikan: '09:00',
  dresscode: '',
  level_jabatan: '',
};

type ChoiceState = Record<number, { selected: boolean; modality: PelantikanModality | null }>;
type DocumentPreviewGroup = {
  key: string;
  unit: string;
  modality: PelantikanModality;
  people: PelantikanAgendaPerson[];
};

function agendaFields(agenda: PelantikanAgendaDetail): PelantikanAgendaFields {
  return {
    tanggal_pelantikan: agenda.tanggal_pelantikan.slice(0, 10),
    nd_undangan_pelantikan: agenda.nd_undangan_pelantikan,
    tanggal_nd_undangan_pelantikan: agenda.tanggal_nd_undangan_pelantikan.slice(0, 10),
    jam_pelantikan: agenda.jam_pelantikan,
    dresscode: agenda.dresscode,
    level_jabatan: agenda.level_jabatan,
  };
}

function choicesFromAgenda(agenda: PelantikanAgendaDetail): ChoiceState {
  return Object.fromEntries(agenda.people.map((person) => [
    person.id,
    {
      selected: !isPendamping(person) && person.selected,
      modality: isPendamping(person) ? null : person.modality,
    },
  ]));
}

function isPendamping(person: Pick<PelantikanAgendaPerson, 'source_no'>): boolean {
  return person.source_no?.toLowerCase().includes('pendamping') ?? false;
}

function isSelectablePerson(person: PelantikanAgendaPerson): boolean {
  return person.lookup_status === 'matched'
    && Boolean(person.unit_eselon_ii.trim())
    && !isPendamping(person);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00+07:00`));
}

function lookupLabel(status: string): string {
  switch (status) {
    case 'matched': return 'Cocok';
    case 'not_found': return 'Tidak ditemukan';
    case 'duplicate': return 'NIP duplikat';
    default: return 'NIP kosong';
  }
}

function lookupClass(status: string): string {
  return status === 'matched'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    : 'border-amber-500/30 bg-amber-500/10 text-amber-300';
}

export default function PelantikanAgendaPage() {
  const { agendaId } = useParams<{ agendaId: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [agendas, setAgendas] = useState<PelantikanAgendaSummary[]>([]);
  const [agenda, setAgenda] = useState<PelantikanAgendaDetail | null>(null);
  const [fields, setFields] = useState(emptyFields);
  const [choices, setChoices] = useState<ChoiceState>({});
  const [choicesDirty, setChoicesDirty] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingHistoryAgendaId, setDeletingHistoryAgendaId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPage = useCallback(async (active: () => boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      if (agendaId) {
        const loadedAgenda = await apiClient.getPelantikanAgenda(agendaId);
        if (!active()) return;
        setAgenda(loadedAgenda);
        setFields(agendaFields(loadedAgenda));
        setChoices(choicesFromAgenda(loadedAgenda));
        setChoicesDirty(loadedAgenda.people.some((person) => isPendamping(person) && person.selected));
      } else {
        const loadedAgendas = await apiClient.listPelantikanAgendas();
        if (!active()) return;
        setAgendas(loadedAgendas);
        setAgenda(null);
      }
    } catch (loadError) {
      if (active()) setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      if (active()) setIsLoading(false);
    }
  }, [agendaId]);

  useEffect(() => {
    let active = true;
    void loadPage(() => active);
    return () => {
      active = false;
    };
  }, [loadPage]);

  useEffect(() => {
    if (!isCreateModalOpen && !isPreviewOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCreateModalOpen(false);
        setIsPreviewOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreateModalOpen, isPreviewOpen]);

  const selectedCount = useMemo(
    () => Object.values(choices).filter((choice) => choice.selected).length,
    [choices],
  );
  const selectableCount = agenda?.people.filter(isSelectablePerson).length ?? 0;
  const previewGroups = useMemo(() => {
    const groups = new Map<string, DocumentPreviewGroup>();
    for (const person of agenda?.people ?? []) {
      const choice = choices[person.id];
      if (!choice?.selected || !choice.modality || !isSelectablePerson(person)) continue;
      const unit = person.unit_eselon_ii.trim();
      const key = `${unit.toLowerCase()}\u0000${choice.modality}`;
      const group = groups.get(key);
      if (group) {
        group.people.push(person);
      } else {
        groups.set(key, {
          key,
          unit,
          modality: choice.modality,
          people: [person],
        });
      }
    }
    return Array.from(groups.values());
  }, [agenda?.people, choices]);
  const matchedCount = agenda?.people.filter((person) => person.lookup_status === 'matched').length ?? 0;
  const unmatchedCount = (agenda?.people.length ?? 0) - matchedCount;

  const updateFields = (key: keyof PelantikanAgendaFields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
  };

  const createAgenda = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const created = await apiClient.createPelantikanAgenda(fields);
      setIsCreateModalOpen(false);
      navigate(`/undangan-pelantikan/${created.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const saveAgenda = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!agendaId) return;
    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      await apiClient.updatePelantikanAgenda(agendaId, fields);
      const refreshed = await apiClient.getPelantikanAgenda(agendaId);
      setAgenda(refreshed);
      setFields(agendaFields(refreshed));
      setNotice('Detail agenda berhasil disimpan.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const uploadWorkbook = async () => {
    if (!agendaId || !selectedFile) return;
    setError(null);
    setNotice(null);
    setIsUploading(true);
    try {
      await apiClient.updatePelantikanAgenda(agendaId, fields);
      const result = await apiClient.uploadPelantikanExcel(agendaId, selectedFile);
      const refreshed = await apiClient.getPelantikanAgenda(agendaId);
      setAgenda(refreshed);
      setChoices(choicesFromAgenda(refreshed));
      setChoicesDirty(false);
      setSelectedFile(null);
      setNotice(
        `${result.row_count} baris diproses dari sheet “${result.selected_sheet}”.`,
      );
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setIsUploading(false);
    }
  };

  const changeChoice = (
    personId: number,
    selected: boolean,
    modality?: PelantikanModality | null,
  ) => {
    const person = agenda?.people.find((item) => item.id === personId);
    if (selected && (!person || !isSelectablePerson(person))) return;
    setChoices((current) => ({
      ...current,
      [personId]: {
        selected,
        modality: selected
          ? modality ?? current[personId]?.modality ?? 'daring'
          : null,
      },
    }));
    setChoicesDirty(true);
    setNotice(null);
  };

  const selectAllMatched = () => {
    if (!agenda) return;
    const next = { ...choices };
    let changed = false;
    for (const person of agenda.people) {
      if (!isSelectablePerson(person)) continue;
      const current = next[person.id] ?? { selected: false, modality: null };
      if (!current.selected) {
        next[person.id] = { selected: true, modality: current.modality ?? 'daring' };
        changed = true;
      }
    }
    if (!changed) return;
    setChoices(next);
    setChoicesDirty(true);
    setNotice(null);
  };

  const saveChoices = async () => {
    if (!agendaId) return;
    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      const payload: PelantikanPersonChoice[] = Object.entries(choices).map(([id, choice]) => ({
        id: Number(id),
        selected: choice.selected,
        modality: choice.selected ? choice.modality : null,
      }));
      const updated = await apiClient.savePelantikanPeople(agendaId, payload);
      setAgenda(updated);
      setChoices(choicesFromAgenda(updated));
      setChoicesDirty(false);
      setNotice('Pilihan pegawai berhasil disimpan.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const generateDocuments = async () => {
    if (!agendaId || choicesDirty) return;
    setError(null);
    setNotice(null);
    setIsGenerating(true);
    try {
      const blob = await apiClient.generatePelantikanDocuments(agendaId);
      apiClient.downloadPelantikanDocuments(blob, `undangan_pelantikan_${agenda?.tanggal_pelantikan}.zip`);
      setIsPreviewOpen(false);
      setNotice('Dokumen ND berhasil dibuat dan diunduh.');
      const refreshed = await apiClient.getPelantikanAgenda(agendaId);
      setAgenda(refreshed);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : String(generationError));
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteAgenda = async () => {
    if (!agendaId || !window.confirm('Hapus agenda ini beserta riwayat pegawainya?')) return;
    setError(null);
    setIsDeleting(true);
    try {
      await apiClient.deletePelantikanAgenda(agendaId);
      navigate('/undangan-pelantikan');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setIsDeleting(false);
    }
  };

  const deleteHistoryAgenda = async (item: PelantikanAgendaSummary) => {
    if (!window.confirm(`Hapus agenda ${item.nd_undangan_pelantikan} beserta riwayat pegawainya?`)) return;
    setError(null);
    setNotice(null);
    setDeletingHistoryAgendaId(item.id);
    try {
      await apiClient.deletePelantikanAgenda(item.id);
      setAgendas((current) => current.filter((agendaItem) => agendaItem.id !== item.id));
      setNotice('Agenda berhasil dihapus dari riwayat.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setDeletingHistoryAgendaId(null);
    }
  };

  if (!user) {
    return (
      <main className="min-h-screen bg-surface-950 px-4 pb-12 pt-28 text-slate-100">
        <section className="mx-auto max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h1 className="text-xl font-semibold">Masuk diperlukan</h1>
          <p className="mt-2 text-sm text-slate-400">
            Fitur ini menyimpan agenda pada akun pembuat. Silakan masuk dengan akun User atau Admin.
          </p>
          <button
            type="button"
            className="btn-primary mt-5"
            onClick={() => void logout().then(() => navigate('/login', { replace: true }))}
          >
            Masuk dengan akun
          </button>
        </section>
      </main>
    );
  }

  if (!isLoading && agendaId && !agenda) {
    return (
      <main className="min-h-screen bg-surface-950 px-4 pb-12 pt-28 text-slate-100">
        <section className="mx-auto max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h1 className="text-xl font-semibold">Agenda tidak tersedia</h1>
          <p className="mt-2 text-sm text-slate-400">
            {error ?? 'Agenda tidak ditemukan atau bukan milik akun ini.'}
          </p>
          <button type="button" className="btn-primary mt-5" onClick={() => navigate('/undangan-pelantikan')}>
            Kembali ke riwayat
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-950 px-4 pb-12 pt-24 text-slate-100 sm:px-6 lg:pt-28">
      <div className="w-full max-w-[1800px]">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mb-5 text-sm text-brand-300 transition hover:text-brand-200"
        >
          ← Kembali ke menu utama
        </button>
        <header className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
            Operasional
          </p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
            Generate ND Undangan Pelantikan
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Buat agenda, unggah satu workbook Excel, periksa hasil pencocokan NIP, lalu pilih
            pegawai Daring atau Luring. Dokumen dibuat per Unit Eselon II dan tidak menyimpan
            file sumber maupun hasil unduhan.
          </p>
        </header>

        {(error || notice) && (
          <div
            role={error ? 'alert' : 'status'}
            className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
              error
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
            }`}
          >
            {error ?? notice}
          </div>
        )}

        {isLoading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">
            Memuat agenda…
          </div>
        ) : agendaId ? (
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Agenda pelantikan</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Hari pelantikan: <span className="font-medium text-slate-200">{agenda?.hari_pelantikan}</span>
                    {agenda?.tanggal_pelantikan ? `, ${formatDate(agenda.tanggal_pelantikan)}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => void deleteAgenda()}
                  className="btn-secondary text-rose-300 hover:border-rose-500/50 hover:text-rose-200"
                >
                  {isDeleting ? 'Menghapus…' : 'Hapus agenda'}
                </button>
              </div>
              <form onSubmit={(event) => void (agenda ? saveAgenda(event) : createAgenda(event))}>
                <AgendaFields fields={fields} onChange={updateFields} />
                <div className="mt-5 flex justify-end">
                  <button type="submit" disabled={isSaving} className="btn-primary">
                    {isSaving ? 'Menyimpan…' : 'Simpan detail agenda'}
                  </button>
                </div>
              </form>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Unggah dan cocokkan pegawai</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                Baris ketiga digunakan sebagai header. Baris tanpa isi pada kolom Nama/NIP dilewati,
                lalu NIP diambil dari baris terakhir kolom tersebut. Kolom No, Nama/NIP,
                Jabatan Saat ini, dan Usul Jabatan Baru tetap ditampilkan sebagai referensi.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  aria-label="Pilih workbook Excel"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  className="block min-w-0 flex-1 text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-200 hover:file:bg-slate-700"
                />
                <button
                  type="button"
                  disabled={!selectedFile || isUploading || isSaving}
                  onClick={() => void uploadWorkbook()}
                  className="btn-primary shrink-0"
                >
                  {isUploading ? 'Memproses…' : 'Unggah dan cocokkan'}
                </button>
              </div>
              {agenda?.uploaded_filename && (
                <p className="mt-3 text-xs text-slate-400">
                  File terakhir: <span className="text-slate-300">{agenda.uploaded_filename}</span>
                  {agenda.uploaded_sheet ? ` · Sheet: ${agenda.uploaded_sheet}` : ''}
                </p>
              )}
            </section>

            {agenda && agenda.people.length > 0 && (
              <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 p-5 sm:p-6">
                  <div>
                    <h2 className="text-lg font-semibold">Daftar pegawai</h2>
                    <p className="mt-1 text-sm text-slate-400">
                      {agenda.people.length} baris · {matchedCount} cocok · {unmatchedCount} perlu diperiksa
                    </p>
                  </div>
                  <div role="group" aria-label="Aksi pegawai" className="inline-flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-1">
                    {choicesDirty && (
                      <span className="self-center text-xs text-amber-300">Ada pilihan yang belum disimpan</span>
                    )}
                    <button
                      type="button"
                      disabled={!selectableCount || selectedCount >= selectableCount || isSaving}
                      onClick={selectAllMatched}
                      aria-label="Pilih semua pegawai cocok selain Pendamping"
                      title="Pilih semua pegawai cocok selain Pendamping"
                      className="size-9 rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-5">
                        <path d="m3.5 6.5 1.5 1.5 2.5-3" />
                        <path d="M11 7h9" />
                        <path d="m3.5 12.5 1.5 1.5 2.5-3" />
                        <path d="M11 13h9" />
                        <path d="m3.5 18.5 1.5 1.5 2.5-3" />
                        <path d="M11 19h9" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      disabled={!choicesDirty || isSaving}
                      onClick={() => void saveChoices()}
                      aria-label={isSaving ? 'Menyimpan pilihan' : 'Simpan pilihan'}
                      title={isSaving ? 'Menyimpan pilihan' : 'Simpan pilihan'}
                      className="size-9 rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-5">
                        <path d="M6 3.75h8.5L19 8.25v11.5a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-15a1 1 0 0 1 1-1Z" />
                        <path d="M14 4v5h5" />
                        <path d="m8 15 2.25 2.25L16 11.5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      disabled={selectedCount === 0}
                      onClick={() => setIsPreviewOpen(true)}
                      aria-label="Pratinjau dokumen"
                      title="Pratinjau dokumen"
                      className="size-9 rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-5">
                        <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="max-h-[70vh] overflow-auto">
                  <table className="min-w-[900px] w-full border-collapse text-left text-sm">
                    <thead className="sticky top-0 bg-slate-950 text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Pilih</th>
                        <th className="px-4 py-3">No</th>
                        <th className="px-4 py-3">Nama/NIP</th>
                        <th className="px-4 py-3">Jabatan Saat ini/Grade</th>
                        <th className="px-4 py-3">Usul Jabatan Baru/Grade</th>
                        <th className="px-4 py-3">NIP database</th>
                        <th className="px-4 py-3">Nama database</th>
                        <th className="px-4 py-3">Jabatan database</th>
                        <th className="px-4 py-3">Unit Eselon II</th>
                        <th className="px-4 py-3">Pencocokan</th>
                        <th className="px-4 py-3">Pelantikan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {agenda.people.map((person) => {
                        const choice = choices[person.id] ?? { selected: false, modality: null };
                        const pendamping = isPendamping(person);
                        const canSelect = isSelectablePerson(person);
                        return (
                          <tr key={person.id} className="align-top">
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                aria-label={`Pilih ${person.nama || `baris ${person.row_number}`}`}
                                checked={choice.selected}
                                disabled={!canSelect}
                                onChange={(event) => changeChoice(person.id, event.target.checked)}
                                className="mt-1 size-4 accent-cyan-500 disabled:opacity-40"
                              />
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-300">{person.source_no || '—'}</td>
                            <td className="max-w-72 whitespace-normal px-4 py-3 text-slate-100">{person.source_nama_nip || '—'}</td>
                            <td className="max-w-72 whitespace-normal px-4 py-3 text-slate-300">{person.source_jabatan_saat_ini || '—'}</td>
                            <td className="max-w-72 whitespace-normal px-4 py-3 text-slate-300">{person.source_usul_jabatan_baru || '—'}</td>
                            <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-300">{person.nip || '—'}</td>
                            <td className="max-w-64 whitespace-normal px-4 py-3 text-slate-100">{person.nama || '—'}</td>
                            <td className="max-w-72 whitespace-normal px-4 py-3 text-slate-300">{person.jabatan || '—'}</td>
                            <td className="max-w-72 whitespace-normal px-4 py-3 text-slate-300">{person.unit_eselon_ii || '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${
                                pendamping
                                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                                  : lookupClass(person.lookup_status)
                              }`}>
                                {pendamping
                                  ? 'Pendamping — dikecualikan'
                                  : person.lookup_status === 'matched' && !person.unit_eselon_ii.trim()
                                  ? 'Unit Eselon II kosong'
                                  : lookupLabel(person.lookup_status)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                aria-label={`Modus pelantikan ${person.nama || `baris ${person.row_number}`}`}
                                value={choice.modality ?? 'daring'}
                                disabled={!choice.selected || !canSelect}
                                onChange={(event) => changeChoice(
                                  person.id,
                                  true,
                                  event.target.value as PelantikanModality,
                                )}
                                className="input min-w-32 py-1.5 text-sm"
                              >
                                <option value="daring">Daring</option>
                                <option value="luring">Luring</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-slate-800 px-5 py-3 text-xs leading-5 text-slate-400">
                  Pegawai yang tidak ditemukan, NIP duplikat, atau tidak memiliki Unit Eselon II tidak dapat dipilih.
                  Baris Pendamping pada kolom No selalu dikecualikan. Jika NIP terduplikasi, hanya kemunculan
                  pertama yang dapat dipilih.
                </div>
              </section>
            )}
          </div>
        ) : (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Riwayat agenda</h2>
                <p className="mt-1 text-sm text-slate-400">Hanya agenda yang dibuat oleh akun ini.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
                  {agendas.length}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setIsCreateModalOpen(true);
                  }}
                  className="btn-primary"
                >
                  Buat agenda
                </button>
              </div>
            </div>
            {agendas.length === 0 ? (
              <p className="mt-6 rounded-xl border border-dashed border-slate-700 p-5 text-center text-sm text-slate-400">
                Belum ada agenda. Pilih “Buat agenda” untuk memulai.
              </p>
            ) : (
              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {agendas.map((item) => (
                  <li key={item.id}>
                    <div className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 transition hover:border-brand-500/50">
                      <button
                        type="button"
                        onClick={() => navigate(`/undangan-pelantikan/${item.id}`)}
                        className="w-full p-4 text-left transition group-hover:bg-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                      >
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-slate-100">{formatDate(item.tanggal_pelantikan)}</span>
                          <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
                            {item.status === 'generated' ? 'Sudah dibuat' : item.status === 'ready' ? 'Siap diproses' : 'Draft'}
                          </span>
                        </span>
                        <span className="mt-2 block text-sm text-slate-300">{item.nd_undangan_pelantikan}</span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {item.people_count} pegawai · {item.selected_count} dipilih
                        </span>
                      </button>
                      <div className="flex justify-end border-t border-slate-800 px-3 py-1.5">
                        <button
                          type="button"
                          disabled={deletingHistoryAgendaId !== null}
                          onClick={() => void deleteHistoryAgenda(item)}
                          aria-label={`Hapus agenda ${item.nd_undangan_pelantikan}`}
                          title="Hapus agenda"
                          className="rounded-md p-1.5 text-rose-400 transition hover:bg-rose-500/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
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
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="m19 6-1 14H6L5 6" />
                            <path d="M10 11v5M14 11v5" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {!agendaId && isCreateModalOpen && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/70 p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsCreateModalOpen(false);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-agenda-title"
              className="my-auto w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="create-agenda-title" className="text-lg font-semibold">Buat agenda pelantikan</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Isi detail surat dan jadwal sebelum mengunggah Excel.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  aria-label="Tutup formulir agenda"
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              <form className="mt-5" onSubmit={(event) => void createAgenda(event)}>
                {error && (
                  <div role="alert" className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {error}
                  </div>
                )}
                <AgendaFields fields={fields} onChange={updateFields} autoFocus />
                <div className="mt-5 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="btn-secondary"
                  >
                    Batal
                  </button>
                  <button type="submit" disabled={isSaving} className="btn-primary">
                    {isSaving ? 'Menyimpan…' : 'Buat agenda'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
        {agendaId && agenda && isPreviewOpen && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/70 p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsPreviewOpen(false);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="document-preview-title"
              className="my-auto flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6"
            >
              <header className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="document-preview-title" className="text-lg font-semibold">Pratinjau dokumen</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    Setiap Unit Eselon II dan moda akan menjadi satu dokumen. Buka grup untuk memeriksa daftar pegawainya.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  aria-label="Tutup pratinjau"
                  title="Tutup pratinjau"
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-4">
                    <path d="m6 6 12 12M18 6 6 18" />
                  </svg>
                </button>
              </header>

              {choicesDirty && (
                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  Pilihan belum disimpan. Simpan pilihan sebelum membuat ZIP.
                </div>
              )}
              {error && (
                <div role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </div>
              )}
              {!choicesDirty && notice && (
                <div role="status" className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {notice}
                </div>
              )}

              <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
                {previewGroups.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-sm text-slate-400">
                    Belum ada pegawai cocok yang dipilih untuk dokumen.
                  </p>
                ) : (
                  previewGroups.map((group) => (
                    <details key={group.key} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950/60">
                      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 bg-slate-950/70 p-4 text-left transition hover:bg-slate-900">
                        <span className="min-w-0">
                          <span className="block font-semibold text-brand-300">{group.unit}</span>
                          <span className="mt-1 inline-flex rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-xs font-medium text-brand-200">
                            {group.modality === 'daring' ? 'Daring' : 'Luring'} · {group.people.length} pegawai
                          </span>
                        </span>
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0 text-slate-400">
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </summary>
                      <ul className="divide-y divide-slate-800 border-t border-slate-800">
                        {group.people.map((person) => (
                          <li key={person.id} className="flex flex-wrap items-start justify-between gap-2 border-l-2 border-brand-500/40 bg-slate-900/40 px-4 py-3 text-sm">
                            <span className="min-w-0 font-medium text-slate-100">
                              {person.nama || person.source_nama_nip || `Baris ${person.row_number}`}
                              {person.jabatan && <span className="mt-1 block text-xs text-slate-400">{person.jabatan}</span>}
                            </span>
                            <span className="whitespace-nowrap font-mono text-xs text-slate-300">{person.nip}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))
                )}
              </div>

              <footer className="mt-5 flex justify-end gap-2 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  disabled={!choicesDirty || isSaving}
                  onClick={() => void saveChoices()}
                  aria-label={isSaving ? 'Menyimpan pilihan' : 'Simpan pilihan'}
                  title={isSaving ? 'Menyimpan pilihan' : 'Simpan pilihan'}
                  className="size-9 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 transition hover:bg-slate-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-5">
                    <path d="M6 3.75h8.5L19 8.25v11.5a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-15a1 1 0 0 1 1-1Z" />
                    <path d="M14 4v5h5" />
                    <path d="m8 15 2.25 2.25L16 11.5" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={previewGroups.length === 0 || choicesDirty || isGenerating}
                  onClick={() => void generateDocuments()}
                  aria-label={isGenerating ? 'Membuat dan mengunduh ZIP' : 'Buat dan unduh ZIP'}
                  title={isGenerating ? 'Membuat dan mengunduh ZIP' : 'Buat dan unduh ZIP'}
                  className="size-9 rounded-lg border border-brand-500/40 bg-brand-500/15 text-brand-200 transition hover:bg-brand-500/25 hover:text-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-5">
                    <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
                    <path d="M5 16v4h14v-4" />
                  </svg>
                </button>
              </footer>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function AgendaFields({
  fields,
  onChange,
  autoFocus = false,
}: {
  fields: PelantikanAgendaFields;
  onChange: (key: keyof PelantikanAgendaFields, value: string) => void;
  autoFocus?: boolean;
}) {
  const inputClass = 'input mt-1.5';
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm text-slate-300">
        Tanggal pelantikan
        <input
          required
          type="date"
          autoFocus={autoFocus}
          value={fields.tanggal_pelantikan}
          onChange={(event) => onChange('tanggal_pelantikan', event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="block text-sm text-slate-300">
        Jam pelantikan
        <input
          required
          type="time"
          value={fields.jam_pelantikan}
          onChange={(event) => onChange('jam_pelantikan', event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="block text-sm text-slate-300 sm:col-span-2">
        Nomor ND undangan pelantikan
        <input
          required
          maxLength={255}
          value={fields.nd_undangan_pelantikan}
          onChange={(event) => onChange('nd_undangan_pelantikan', event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="block text-sm text-slate-300">
        Tanggal ND undangan
        <input
          required
          type="date"
          value={fields.tanggal_nd_undangan_pelantikan}
          onChange={(event) => onChange('tanggal_nd_undangan_pelantikan', event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="block text-sm text-slate-300">
        Level jabatan
        <input
          required
          maxLength={255}
          value={fields.level_jabatan}
          onChange={(event) => onChange('level_jabatan', event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="block text-sm text-slate-300 sm:col-span-2">
        Dresscode
        <input
          required
          maxLength={1000}
          value={fields.dresscode}
          onChange={(event) => onChange('dresscode', event.target.value)}
          className={inputClass}
        />
      </label>
    </div>
  );
}
