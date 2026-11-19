import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataset } from '../hooks/useDataset';
import * as apiClient from '../services/api';
import type {
  DatasetPreview,
  MutationEselonChoice,
  MutationWorkspace,
  MutationLookupResponse,
} from '../types';

type WorkflowStep = 1 | 2 | 3;
type MutationWorkspaceTab = 'data-load' | 'overview' | 'employees' | 'talent-finder';
type MutationWorkspaceStatus = 'Aktif' | 'Inaktif';

const MUTATION_WORKSPACE_TABS: { id: MutationWorkspaceTab; label: string }[] = [
  { id: 'data-load', label: 'Data Load' },
  { id: 'overview', label: 'Overview' },
  { id: 'employees', label: 'Daftar Pegawai' },
  { id: 'talent-finder', label: 'Talent Finder' },
];

function getTodayDateInput(): string {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${day}`;
}

function formatWorkspaceDate(value: string | null): string {
  if (!value) return '—';
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID');
}

function normalizeLookupNip(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, '');
  const last18 = text.slice(-18);
  return /^\d{18}$/.test(last18) ? last18 : null;
}

function PreviewTable({
  title,
  preview,
  emptyMessage,
}: {
  title: string;
  preview: DatasetPreview | null;
  emptyMessage: string;
}) {
  if (!preview) {
    return (
      <section className="rounded-xl border border-surface-700 bg-surface-900 p-4">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <p className="mt-2 text-sm text-slate-400">{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-surface-700 bg-surface-900 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <span className="text-xs text-slate-400">
          {preview.row_count} baris · {preview.column_count} kolom
        </span>
      </div>
      {preview.rows.length === 0 ? (
        <p className="text-sm text-slate-400">Tidak ada baris untuk ditampilkan.</p>
      ) : (
        <div className="max-h-[420px] overflow-auto rounded-lg border border-surface-700">
          <table className="min-w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-surface-800">
              <tr>
                {preview.columns.map((column) => (
                  <th
                    key={column}
                    className="whitespace-nowrap border-b border-r border-surface-700 px-3 py-2 text-left font-semibold text-slate-300 last:border-r-0"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="odd:bg-surface-900 even:bg-surface-950/40">
                  {preview.columns.map((column) => (
                    <td
                      key={column}
                      className="max-w-64 whitespace-normal break-words border-b border-r border-surface-700 px-3 py-2 text-slate-300 last:border-r-0"
                    >
                      {row[column] === null || row[column] === undefined
                        ? ''
                        : String(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function MutationAnalysisPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<WorkflowStep>(1);
  const [eselonChoice, setEselonChoice] = useState<MutationEselonChoice | null>(null);
  const [workspaces, setWorkspaces] = useState<MutationWorkspace[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<MutationWorkspace | null>(null);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<MutationWorkspace | null>(null);
  const [workspaceTitle, setWorkspaceTitle] = useState('');
  const [workspaceTmt, setWorkspaceTmt] = useState(getTodayDateInput);
  const [workspaceDescription, setWorkspaceDescription] = useState('');
  const [workspaceStatus, setWorkspaceStatus] = useState<MutationWorkspaceStatus>('Aktif');
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<MutationWorkspaceTab>('data-load');
  const [rawPreview, setRawPreview] = useState<DatasetPreview | null>(null);
  const [approved, setApproved] = useState(false);
  const [showPreviewPopup, setShowPreviewPopup] = useState(false);
  const [lookupResult, setLookupResult] = useState<MutationLookupResponse | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const cleaningStarted = useRef(false);
  const activeWorkspaceId = useRef<string | null>(null);
  const lookupRequestId = useRef(0);
  const dataset = useDataset();

  const cleaningEselon = activeWorkspace?.eselon_choice ?? eselonChoice;
  const cleaningMode = cleaningEselon === 'Pengawas'
    ? 'Sitasi Es.IV'
    : 'Sitasi Es.III';
  const workspacePreview = activeWorkspace?.dataset_id === dataset.preview?.dataset_id
    ? dataset.preview
    : null;

  useEffect(() => {
    if (
      step === 3
      && activeWorkspace
      && workspacePreview
      && dataset.status === 'ready'
      && !rawPreview
      && !cleaningStarted.current
    ) {
      cleaningStarted.current = true;
      setRawPreview(workspacePreview);
      void dataset.applyAutoClean(cleaningMode);
    }
  }, [activeWorkspace, cleaningMode, dataset, rawPreview, step, workspacePreview]);

  useEffect(() => {
    if (
      !activeWorkspace
      || !workspacePreview
      || dataset.activeAutoCleanMode !== cleaningMode
      || lookupLoading
      || lookupResult
    ) {
      return;
    }
    const nameNipColumn = workspacePreview.columns.find((column) => {
      const normalized = column.replace(/[^a-z0-9]/gi, '').toLowerCase();
      return normalized === 'namenip';
    });
    const nipColumn = workspacePreview.columns.find((column) => (
      column.trim().toLowerCase() === 'nip'
    ));
    const lookupColumn = nipColumn ?? nameNipColumn;
    if (!lookupColumn) {
      setLookupResult({
        matched_count: 0,
        unmatched_count: 0,
        invalid_count: workspacePreview.rows.length,
        matches: {},
      });
      return;
    }
    const lookupValues = workspacePreview.rows.map((row) => {
      const value = row[lookupColumn];
      return normalizeLookupNip(value) ?? (value === null || value === undefined ? '' : String(value));
    });
    const nips = lookupValues;
    const requestId = ++lookupRequestId.current;
    setLookupLoading(true);
    void apiClient.lookupMutationNips(nips)
      .then((result) => {
        if (requestId === lookupRequestId.current) setLookupResult(result);
      })
      .catch((error: unknown) => {
        if (requestId === lookupRequestId.current) {
          setLookupResult({
            matched_count: 0,
            unmatched_count: nips.length,
            invalid_count: workspacePreview.rows.length - nips.length,
            matches: {},
          });
          setWorkspaceError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (requestId === lookupRequestId.current) setLookupLoading(false);
      });
  }, [
    activeWorkspace,
    cleaningMode,
    dataset.activeAutoCleanMode,
    dataset.preview,
    lookupLoading,
    lookupResult,
    workspacePreview,
  ]);

  useEffect(() => {
    if (!eselonChoice) return;
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    apiClient.listMutationWorkspaces()
      .then((items) => setWorkspaces(
        items.filter((item) => item.eselon_choice === eselonChoice),
      ))
      .catch((error: unknown) => {
        setWorkspaceError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setWorkspaceLoading(false));
  }, [eselonChoice]);

  const chooseEselon = (choice: MutationEselonChoice) => {
    setEselonChoice(choice);
    setActiveWorkspace(null);
    activeWorkspaceId.current = null;
    setStep(2);
  };

  const openDraft = (workspace: MutationWorkspace) => {
    activeWorkspaceId.current = workspace.id;
    cleaningStarted.current = false;
    lookupRequestId.current += 1;
    setRawPreview(null);
    setApproved(false);
    setShowPreviewPopup(false);
    setLookupResult(null);
    setLookupLoading(false);
    setWorkspaceError(null);
    dataset.reset();
    setActiveWorkspace(workspace);
    setActiveWorkspaceTab('data-load');
    setStep(3);
    if (workspace.dataset_id) void dataset.restoreRun(workspace.dataset_id);
  };

  const openCreateWorkspace = () => {
    setEditingWorkspace(null);
    setWorkspaceTitle('');
    setWorkspaceTmt(getTodayDateInput());
    setWorkspaceDescription('');
    setWorkspaceStatus('Aktif');
    setWorkspaceError(null);
    setShowCreateWorkspace(true);
  };

  const openEditWorkspace = (workspace: MutationWorkspace) => {
    setEditingWorkspace(workspace);
    setWorkspaceTitle(workspace.title);
    setWorkspaceTmt(workspace.tmt?.slice(0, 10) ?? getTodayDateInput());
    setWorkspaceDescription(workspace.description);
    setWorkspaceStatus(workspace.status);
    setWorkspaceError(null);
    setShowCreateWorkspace(true);
  };

  const saveWorkspace = async () => {
    if ((!eselonChoice && !editingWorkspace) || !workspaceTitle.trim() || !workspaceTmt) {
      setWorkspaceError('Judul dan TMT workspace wajib diisi.');
      return;
    }
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    try {
      const payload = {
        title: workspaceTitle.trim(),
        tmt: workspaceTmt,
        description: workspaceDescription.trim(),
        status: workspaceStatus,
      };
      if (editingWorkspace) {
        const updatedWorkspace = await apiClient.updateMutationWorkspace(
          editingWorkspace.id,
          payload,
        );
        setWorkspaces((items) => items.map((item) => (
          item.id === updatedWorkspace.id ? updatedWorkspace : item
        )));
      } else if (eselonChoice) {
        const workspace = await apiClient.createMutationWorkspace({
          ...payload,
          eselon_choice: eselonChoice,
        });
        setWorkspaces((items) => [workspace, ...items]);
      }
      setEditingWorkspace(null);
      setShowCreateWorkspace(false);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const deleteWorkspace = async (workspace: MutationWorkspace) => {
    if (!window.confirm(`Hapus workspace "${workspace.title}"?`)) return;
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    try {
      await apiClient.deleteMutationWorkspace(workspace.id);
      setWorkspaces((items) => items.filter((item) => item.id !== workspace.id));
      if (activeWorkspaceId.current === workspace.id) {
        activeWorkspaceId.current = null;
        setActiveWorkspace(null);
        setStep(2);
        setRawPreview(null);
        setApproved(false);
        setShowPreviewPopup(false);
        setLookupResult(null);
        setLookupLoading(false);
        cleaningStarted.current = false;
        dataset.reset();
      }
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file || !activeWorkspace) return;
    const workspace = activeWorkspace;
    cleaningStarted.current = false;
    lookupRequestId.current += 1;
    setRawPreview(null);
    setApproved(false);
    setShowPreviewPopup(false);
    setLookupResult(null);
    setLookupLoading(false);
    setWorkspaceError(null);
    dataset.reset();
    const uploaded = await dataset.upload(file, workspace.id);
    if (!uploaded) return;
    const updatedWorkspace = {
      ...workspace,
      dataset_id: uploaded.dataset_id,
    };
    setWorkspaces((items) => items.map((item) => (
      item.id === updatedWorkspace.id ? updatedWorkspace : item
    )));
    if (activeWorkspaceId.current === workspace.id) {
      setActiveWorkspace(updatedWorkspace);
    }
  };

  return (
    <main className="min-h-screen bg-surface-950 px-4 pb-12 pt-24 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-[1728px]">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="text-sm text-slate-400 hover:text-slate-200"
              >
                Beranda
              </button>
              <span className="text-slate-600">/</span>
              <span className="text-sm text-slate-300">Analisis Mutasi/Promosi</span>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                Experimental
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-slate-100">Analisis Mutasi/Promosi</h1>
          </div>
          {step > 1 && (
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setEselonChoice(null);
                setActiveWorkspace(null);
                activeWorkspaceId.current = null;
                setRawPreview(null);
                setApproved(false);
                setShowPreviewPopup(false);
                setLookupResult(null);
                lookupRequestId.current += 1;
                cleaningStarted.current = false;
                dataset.reset();
              }}
              className="rounded-lg border border-surface-700 px-3 py-2 text-sm text-slate-300 hover:bg-surface-800"
            >
              Mulai ulang
            </button>
          )}
        </header>

        <nav className="mb-6 grid grid-cols-3 gap-2" aria-label="Langkah alur">
          {[1, 2, 3].map((number) => (
            <button
              key={number}
              type="button"
              disabled={number > step}
              onClick={() => setStep(number as WorkflowStep)}
              className={`rounded-xl border px-3 py-3 text-sm ${
                step === number
                  ? 'border-brand-500/50 bg-brand-500/10 text-slate-100'
                  : number < step
                    ? 'border-surface-700 bg-surface-900 text-slate-300'
                    : 'border-surface-800 bg-surface-950 text-slate-600'
              }`}
            >
              Langkah {number}
            </button>
          ))}
        </nav>

        {step === 1 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-slate-200">Pilih level Eselon</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => chooseEselon('Administrator')}
                className="min-h-[220px] rounded-2xl border border-surface-700 bg-surface-900 p-8 text-left transition hover:border-brand-500/40 hover:bg-surface-800"
              >
                <span className="mb-5 inline-flex size-14 items-center justify-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-300">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-7">
                    <path d="M12 3 4.5 6v5.3c0 4.4 3.2 7.8 7.5 9.7 4.3-1.9 7.5-5.3 7.5-9.7V6L12 3Z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </span>
                <span className="block text-lg font-semibold text-slate-100">Administrator</span>
                <span className="mt-2 block text-sm text-slate-400">Menggunakan cleaning logic Sitasi Es.III</span>
              </button>
              <button
                type="button"
                onClick={() => chooseEselon('Pengawas')}
                className="min-h-[220px] rounded-2xl border border-surface-700 bg-surface-900 p-8 text-left transition hover:border-brand-500/40 hover:bg-surface-800"
              >
                <span className="mb-5 inline-flex size-14 items-center justify-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-300">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-7">
                    <circle cx="12" cy="8" r="3.5" />
                    <path d="M4.5 20c.5-4 3.3-6 7.5-6s7 2 7.5 6" />
                    <path d="M18 5.5h3m-1.5-1.5v3" />
                  </svg>
                </span>
                <span className="block text-lg font-semibold text-slate-100">Pengawas</span>
                <span className="mt-2 block text-sm text-slate-400">Menggunakan cleaning logic Sitasi Es.IV</span>
              </button>
            </div>
          </section>
        )}

        {step === 2 && eselonChoice && (
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-200">Workspace {eselonChoice}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {eselonChoice === 'Administrator' ? 'Eselon III · Sitasi Es.III' : 'Eselon IV · Sitasi Es.IV'}
                </p>
              </div>
              <button
                type="button"
                onClick={openCreateWorkspace}
                className="btn-primary"
              >
                + Add new workspace
              </button>
            </div>

            {workspaceError && (
              <div role="alert" className="mb-3 rounded-lg border border-rose-700/50 bg-rose-950/20 p-3 text-sm text-rose-200">
                {workspaceError}
              </div>
            )}
            {workspaceLoading ? (
              <div className="rounded-xl border border-surface-700 bg-surface-900 p-5 text-sm text-slate-400">
                Memuat workspace…
              </div>
            ) : workspaces.length === 0 ? (
              <div className="rounded-xl border border-surface-700 bg-surface-900 p-6 text-sm text-slate-400">
                Belum ada workspace untuk {eselonChoice}.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-surface-700">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-surface-900 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      {['No', 'Title', 'TMT', 'Date Created', 'Description', 'Status', 'Action'].map((column) => (
                        <th key={column} className="border-b border-surface-700 px-4 py-3 text-left font-semibold">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800">
                    {workspaces.map((workspace, index) => (
                      <tr key={workspace.id} className="bg-surface-950/60 hover:bg-surface-900/80">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-400">{index + 1}</td>
                        <td className="min-w-52 px-4 py-3">
                          <button
                            type="button"
                            onClick={() => openDraft(workspace)}
                            className="font-semibold text-slate-100 hover:text-brand-300"
                          >
                            {workspace.title}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-300">
                          {formatWorkspaceDate(workspace.tmt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                          {new Date(workspace.created_at).toLocaleString('id-ID')}
                        </td>
                        <td className="min-w-56 px-4 py-3 text-slate-400">
                          {workspace.description || '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            workspace.status === 'Aktif'
                              ? 'bg-emerald-500/10 text-emerald-300'
                              : 'bg-slate-700/70 text-slate-300'
                          }`}>
                            {workspace.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-label={`Edit workspace ${workspace.title}`}
                              title="Edit workspace"
                              onClick={() => openEditWorkspace(workspace)}
                              className="inline-flex size-9 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300 transition hover:border-sky-400/50 hover:bg-sky-500/20 hover:text-sky-200"
                            >
                              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              aria-label={`Hapus workspace ${workspace.title}`}
                              title="Hapus workspace"
                              onClick={() => void deleteWorkspace(workspace)}
                              disabled={workspaceLoading}
                              className="inline-flex size-9 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 transition hover:border-rose-400/50 hover:bg-rose-500/20 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                                <path d="M3 6h18" />
                                <path d="M8 6V3h8v3m-9 0 1 15h8l1-15" />
                                <path d="M10 10v7m4-7v7" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {showCreateWorkspace && (
              <div
                className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4"
                role="presentation"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setShowCreateWorkspace(false);
                }}
              >
                <section
                  className="w-full max-w-md rounded-xl border border-surface-700 bg-surface-900 p-6 shadow-2xl"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="create-workspace-title"
                >
                  <h3 id="create-workspace-title" className="text-lg font-semibold text-slate-100">
                    {editingWorkspace ? 'Edit workspace' : 'Tambah workspace'}
                  </h3>
                  <div className="mt-4 space-y-3">
                    <label className="block text-sm text-slate-300">
                      Judul
                      <input
                        type="text"
                        value={workspaceTitle}
                        onChange={(event) => setWorkspaceTitle(event.target.value)}
                        className="input mt-2"
                        autoFocus
                      />
                    </label>
                    <label className="block text-sm text-slate-300">
                      TMT
                      <input
                        type="date"
                        value={workspaceTmt}
                        onChange={(event) => setWorkspaceTmt(event.target.value)}
                        className="input mt-2"
                      />
                    </label>
                    <label className="block text-sm text-slate-300">
                      Deskripsi
                      <textarea
                        value={workspaceDescription}
                        onChange={(event) => setWorkspaceDescription(event.target.value)}
                        className="input mt-2 min-h-24 resize-y"
                      />
                    </label>
                    <label className="block text-sm text-slate-300">
                      Status
                      <select
                        value={workspaceStatus}
                        onChange={(event) => setWorkspaceStatus(
                          event.target.value === 'Inaktif' ? 'Inaktif' : 'Aktif',
                        )}
                        className="input mt-2"
                      >
                        <option value="Aktif">Aktif</option>
                        <option value="Inaktif">Inaktif</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateWorkspace(false);
                        setEditingWorkspace(null);
                      }}
                      className="rounded-lg border border-surface-700 px-4 py-2 text-sm text-slate-300 hover:bg-surface-800"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveWorkspace()}
                      disabled={workspaceLoading}
                      className="btn-primary"
                    >
                      {editingWorkspace ? 'Simpan perubahan' : 'Buat workspace'}
                    </button>
                  </div>
                </section>
              </div>
            )}
          </section>
        )}

        {step === 3 && eselonChoice && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-200">Workspace Draft</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {activeWorkspace?.title} · {eselonChoice} · {cleaningMode}
                </p>
              </div>
              {workspacePreview && (
                <span className="rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-xs text-slate-300">
                  Sheet: {workspacePreview.selected_sheet}
                </span>
              )}
            </div>

            <div
              role="tablist"
              aria-label="Analisis mutasi dan promosi"
              className="flex flex-wrap gap-2 border-b border-surface-700"
            >
              {MUTATION_WORKSPACE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`mutation-tab-${tab.id}`}
                  aria-selected={activeWorkspaceTab === tab.id}
                  aria-controls={`mutation-panel-${tab.id}`}
                  onClick={() => setActiveWorkspaceTab(tab.id)}
                  className={`rounded-t-lg border-b-2 px-4 py-3 text-sm font-medium transition ${
                    activeWorkspaceTab === tab.id
                      ? 'border-brand-400 bg-brand-500/10 text-brand-200'
                      : 'border-transparent text-slate-400 hover:bg-surface-800/60 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeWorkspaceTab === 'data-load' ? (
            <div
              id="mutation-panel-data-load"
              role="tabpanel"
              aria-labelledby="mutation-tab-data-load"
              className="space-y-4"
            >
            <section className="rounded-xl border border-surface-700 bg-surface-900 p-4">
              <label className="block text-sm font-medium text-slate-300" htmlFor="mutation-upload">
                Unggah CSV atau Excel
              </label>
              <input
                id="mutation-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = '';
                  void handleUpload(file);
                }}
                className="mt-3 block w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-slate-300 file:mr-4 file:border-0 file:bg-brand-500 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
              />
            </section>

            {workspaceError && (
              <div role="alert" className="rounded-xl border border-rose-700/50 bg-rose-950/20 p-4 text-sm text-rose-200">
                {workspaceError}
              </div>
            )}

            {dataset.error && (
              <div role="alert" className="rounded-xl border border-rose-700/50 bg-rose-950/20 p-4 text-sm text-rose-200">
                {dataset.error}
              </div>
            )}

            {(dataset.status === 'uploading' || dataset.status === 'cleaning') && (
              <div className="rounded-xl border border-surface-700 bg-surface-900 p-4 text-sm text-slate-300">
                {dataset.status === 'uploading' ? 'Mengunggah data…' : `Membersihkan data dengan ${cleaningMode}…`}
              </div>
            )}

            {rawPreview && (
              <button
                type="button"
                onClick={() => setShowPreviewPopup(true)}
                className="w-full rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-left text-sm font-semibold text-slate-200 hover:border-brand-500/50 hover:bg-brand-500/15"
              >
                Buka popup preview raw & cleaned
              </button>
            )}

            {workspacePreview && dataset.activeAutoCleanMode === cleaningMode && (
              <section className="rounded-xl border border-surface-700 bg-surface-900 p-4">
                <h3 className="text-sm font-semibold text-slate-200">Pengecekan lookup dt_employee</h3>
                {lookupLoading ? (
                  <p className="mt-2 text-sm text-slate-400">Memeriksa NIP pada basis data…</p>
                ) : lookupResult ? (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/20 p-3">
                      <p className="text-xs text-slate-400">Cocok</p>
                      <p className="mt-1 text-lg font-semibold text-emerald-300">{lookupResult.matched_count}</p>
                    </div>
                    <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3">
                      <p className="text-xs text-slate-400">Tidak ditemukan</p>
                      <p className="mt-1 text-lg font-semibold text-amber-300">{lookupResult.unmatched_count}</p>
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-surface-950 p-3">
                      <p className="text-xs text-slate-400">NIP tidak valid</p>
                      <p className="mt-1 text-lg font-semibold text-slate-200">{lookupResult.invalid_count}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">Menunggu hasil cleaning.</p>
                )}
              </section>
            )}

            {workspacePreview && dataset.activeAutoCleanMode === cleaningMode && (
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-500/30 bg-brand-500/10 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    {approved ? 'Data siap digunakan' : 'Persetujuan preview cleaned'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {approved
                      ? `${workspacePreview.row_count} baris berhasil dimuat sebagai tabel.`
                      : 'Periksa hasil pembersihan sebelum memuat tabel akhir.'}
                  </p>
                </div>
                {!approved ? (
                  <button
                    type="button"
                    onClick={() => setApproved(true)}
                    className="btn-primary"
                  >
                    Setujui & Muat Data
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setApproved(false)}
                    className="rounded-lg border border-surface-700 px-3 py-2 text-sm text-slate-300 hover:bg-surface-800"
                  >
                    Tinjau ulang
                  </button>
                )}
              </section>
            )}

            {approved && workspacePreview && (
              <PreviewTable
                title="Tabel data yang dimuat"
                preview={workspacePreview}
                emptyMessage="Data belum tersedia."
              />
            )}

            {showPreviewPopup && (
              <div
                className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-3 sm:p-6"
                role="presentation"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setShowPreviewPopup(false);
                }}
              >
                <section
                  className="flex max-h-[90vh] w-full max-w-[1728px] flex-col overflow-hidden rounded-2xl border border-surface-700 bg-surface-950 shadow-2xl"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="mutation-preview-title"
                >
                  <header className="flex items-center justify-between border-b border-surface-700 px-4 py-3 sm:px-6">
                    <h2 id="mutation-preview-title" className="text-base font-semibold text-slate-100">
                      Preview data awal & cleaned
                    </h2>
                    <button
                      type="button"
                      onClick={() => setShowPreviewPopup(false)}
                      className="rounded-lg border border-surface-700 px-3 py-2 text-sm text-slate-300 hover:bg-surface-800"
                    >
                      Tutup
                    </button>
                  </header>
                  <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto p-4 xl:grid-cols-2 sm:p-6">
                    <PreviewTable
                      title="Preview data awal"
                      preview={rawPreview}
                      emptyMessage="Belum ada data awal."
                    />
                    <PreviewTable
                      title={`Preview cleaned · ${cleaningMode}`}
                      preview={dataset.activeAutoCleanMode ? workspacePreview : null}
                      emptyMessage="Menunggu proses cleaning selesai."
                    />
                  </div>
                </section>
              </div>
            )}
            </div>
            ) : (
              <section
                id={`mutation-panel-${activeWorkspaceTab}`}
                role="tabpanel"
                aria-labelledby={`mutation-tab-${activeWorkspaceTab}`}
                className="rounded-xl border border-surface-700 bg-surface-900 p-8 text-center"
              >
                <h3 className="text-lg font-semibold text-slate-100">
                  {MUTATION_WORKSPACE_TABS.find((tab) => tab.id === activeWorkspaceTab)?.label}
                </h3>
                <p className="mt-2 text-sm text-slate-400">On development</p>
              </section>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
