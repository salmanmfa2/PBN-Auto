import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import MutationTalentFinder from '../components/MutationTalentFinder';
import * as apiClient from '../services/api';
import { useMenuAccess } from '../contexts/MenuAccessContext';
import type {
  CandidatePreparationCandidate,
  CandidatePreparationCandidateUpdatePayload,
  CandidatePreparationOutputStyle,
  CandidatePreparationPriority,
  CandidatePreparationWorkspace,
  CandidatePreparationWorkspacePayload,
  MutationTalentFinderEmployee,
} from '../types';

const ELIGIBLE_ESELON_IDS = [2, 3, 4, 6];
const PRIORITY_ORDER: Record<CandidatePreparationPriority, number> = {
  high: 0,
  med: 1,
  low: 2,
};

type WorkspaceFormState = CandidatePreparationWorkspacePayload;

type ConfirmAction =
  | { type: 'delete-workspace'; workspace: CandidatePreparationWorkspace }
  | { type: 'remove-candidate'; candidate: CandidatePreparationCandidate };

function todayInputValue(): string {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
}

function emptyWorkspaceForm(): WorkspaceFormState {
  return {
    workspace_name: '',
    target_jabatan: '',
    date: todayInputValue(),
    priority: 'med',
    output_style: 'Single',
  };
}

function displayDate(value: string): string {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function errorMessage(error: unknown): string {
  if (
    typeof error === 'object'
    && error !== null
    && 'response' in error
  ) {
    const response = (error as { response?: { data?: unknown } }).response;
    const data = response?.data;
    if (typeof data === 'object' && data !== null && 'detail' in data) {
      const detail = (data as { detail?: unknown }).detail;
      if (typeof detail === 'string') return detail;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

function sortWorkspaces(
  workspaces: CandidatePreparationWorkspace[],
): CandidatePreparationWorkspace[] {
  return [...workspaces].sort((left, right) => (
    PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
    || right.updated_at.localeCompare(left.updated_at)
  ));
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isEligible(candidate: CandidatePreparationCandidate): boolean {
  return candidate.eselon_id !== null
    && ELIGIBLE_ESELON_IDS.includes(candidate.eselon_id);
}

function PriorityBadge({ priority }: { priority: CandidatePreparationPriority }) {
  const styles: Record<CandidatePreparationPriority, string> = {
    high: 'border-rose-500/30 bg-rose-500/15 text-rose-300',
    med: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
    low: 'border-surface-600 bg-surface-800 text-slate-300',
  };
  const labels: Record<CandidatePreparationPriority, string> = {
    high: 'High',
    med: 'Medium',
    low: 'Low',
  };
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[priority]}`}>
      {labels[priority]}
    </span>
  );
}

export default function CandidatePreparationPage() {
  const navigate = useNavigate();
  const { canEdit } = useMenuAccess();
  const canEditWorkspaces = canEdit('penyusunan-kandidat');

  const [workspaces, setWorkspaces] = useState<CandidatePreparationWorkspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [workspaceFilter, setWorkspaceFilter] = useState('');
  const [candidates, setCandidates] = useState<CandidatePreparationCandidate[]>([]);

  // Modal states
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceFormState>(emptyWorkspaceForm);

  const [isFinderModalOpen, setIsFinderModalOpen] = useState(false);

  const [candidateEditCandidate, setCandidateEditCandidate] =
    useState<CandidatePreparationCandidate | null>(null);
  const [candidateEditDraft, setCandidateEditDraft] =
    useState<CandidatePreparationCandidateUpdatePayload | null>(null);

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  // Async & feedback states
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
  const [isSavingCandidate, setIsSavingCandidate] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  );
  const selectedEmployeeIds = useMemo(
    () => new Set(candidates.map((candidate) => candidate.employee_id)),
    [candidates],
  );
  const filteredWorkspaces = useMemo(() => {
    const query = workspaceFilter.trim().toLocaleLowerCase('id-ID');
    if (!query) return workspaces;
    return workspaces.filter((workspace) => (
      `${workspace.workspace_name} ${workspace.target_jabatan}`
        .toLocaleLowerCase('id-ID')
        .includes(query)
    ));
  }, [workspaces, workspaceFilter]);

  const loadWorkspaces = useCallback(async () => {
    setIsLoadingWorkspaces(true);
    setError(null);
    try {
      const results = sortWorkspaces(await apiClient.listCandidatePreparationWorkspaces());
      setWorkspaces(results);
      setActiveWorkspaceId((current) => (
        current && results.some((workspace) => workspace.id === current)
          ? current
          : results[0]?.id ?? null
      ));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoadingWorkspaces(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setCandidates([]);
      setIsLoadingCandidates(false);
      return;
    }

    let active = true;
    setCandidates([]);
    setIsLoadingCandidates(true);
    setError(null);
    void apiClient.listCandidatePreparationCandidates(activeWorkspaceId)
      .then((result) => {
        if (active) setCandidates(result);
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setIsLoadingCandidates(false);
      });

    return () => {
      active = false;
    };
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (confirmAction && !isDeleting) {
        setConfirmAction(null);
        return;
      }
      if (candidateEditCandidate && !isSavingCandidate) {
        setCandidateEditCandidate(null);
        setCandidateEditDraft(null);
        return;
      }
      if (isFinderModalOpen) {
        setIsFinderModalOpen(false);
        return;
      }
      if (isWorkspaceModalOpen && !isSavingWorkspace) {
        setIsWorkspaceModalOpen(false);
        setEditingWorkspaceId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    confirmAction,
    candidateEditCandidate,
    isDeleting,
    isFinderModalOpen,
    isSavingCandidate,
    isSavingWorkspace,
    isWorkspaceModalOpen,
  ]);

  const openCreateWorkspaceModal = () => {
    setEditingWorkspaceId(null);
    setWorkspaceForm(emptyWorkspaceForm());
    setError(null);
    setIsWorkspaceModalOpen(true);
  };

  const openEditWorkspaceModal = (workspace: CandidatePreparationWorkspace) => {
    setEditingWorkspaceId(workspace.id);
    setWorkspaceForm({
      workspace_name: workspace.workspace_name,
      target_jabatan: workspace.target_jabatan,
      date: workspace.date.slice(0, 10),
      priority: workspace.priority,
      output_style: workspace.output_style,
    });
    setError(null);
    setIsWorkspaceModalOpen(true);
  };

  const closeWorkspaceModal = () => {
    if (isSavingWorkspace) return;
    setIsWorkspaceModalOpen(false);
    setEditingWorkspaceId(null);
  };

  const handleWorkspaceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingWorkspace(true);
    setError(null);
    setNotice(null);
    try {
      if (editingWorkspaceId) {
        const updated = await apiClient.updateCandidatePreparationWorkspace(
          editingWorkspaceId,
          workspaceForm,
        );
        setWorkspaces((current) => sortWorkspaces(
          current.map((workspace) => (
            workspace.id === updated.id ? updated : workspace
          )),
        ));
        setActiveWorkspaceId(updated.id);
        setNotice('Workspace berhasil diperbarui.');
      } else {
        const created = await apiClient.createCandidatePreparationWorkspace(workspaceForm);
        setWorkspaces((current) => sortWorkspaces([created, ...current]));
        setActiveWorkspaceId(created.id);
        setWorkspaceForm(emptyWorkspaceForm());
        setNotice('Workspace baru berhasil dibuat.');
      }
      setIsWorkspaceModalOpen(false);
      setEditingWorkspaceId(null);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setIsSavingWorkspace(false);
    }
  };

  const executeConfirmAction = async () => {
    if (!confirmAction || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    setNotice(null);
    try {
      if (confirmAction.type === 'delete-workspace') {
        const target = confirmAction.workspace;
        await apiClient.deleteCandidatePreparationWorkspace(target.id);
        const remaining = workspaces.filter((item) => item.id !== target.id);
        setWorkspaces(remaining);
        if (activeWorkspaceId === target.id) {
          setActiveWorkspaceId(remaining[0]?.id ?? null);
        }
        setNotice(`Workspace "${target.workspace_name}" berhasil dihapus.`);
      } else if (activeWorkspaceId) {
        const target = confirmAction.candidate;
        await apiClient.removeCandidatePreparationCandidate(
          activeWorkspaceId,
          target.employee_id,
        );
        setCandidates((current) => current.filter(
          (item) => item.employee_id !== target.employee_id,
        ));
        setNotice(`${target.nama || 'Kandidat'} dihapus dari workspace.`);
      }
      setConfirmAction(null);
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setIsDeleting(false);
    }
  };

  const addCandidate = async (employee: MutationTalentFinderEmployee) => {
    if (!activeWorkspaceId || isSavingCandidate) return;
    setIsSavingCandidate(true);
    setError(null);
    setNotice(null);
    try {
      const added = await apiClient.addCandidatePreparationCandidate(
        activeWorkspaceId,
        employee.employee_id,
      );
      setCandidates((current) => [...current, added].sort(
        (left, right) => left.sort_order - right.sort_order,
      ));
      setNotice(`${added.nama || employee.nama} ditambahkan ke workspace.`);
    } catch (addError) {
      setError(errorMessage(addError));
    } finally {
      setIsSavingCandidate(false);
    }
  };

  const openCandidateEditModal = (candidate: CandidatePreparationCandidate) => {
    setCandidateEditCandidate(candidate);
    setCandidateEditDraft({
      consideration: candidate.consideration,
      nip: candidate.nip,
      nama: candidate.nama,
      eselon_id: candidate.eselon_id,
      eselon: candidate.eselon,
      jabatan: candidate.jabatan,
      unit_eselon_ii: candidate.unit_eselon_ii,
      unit_eselon_iii: candidate.unit_eselon_iii,
      gol: candidate.gol,
      pangkat: candidate.pangkat,
      pendidikan: candidate.pendidikan,
      jurusan: candidate.jurusan,
      universitas: candidate.universitas,
      tmt_jabatan: candidate.tmt_jabatan,
      tanggal_lahir: candidate.tanggal_lahir,
      riwayat_jabatan: candidate.riwayat_jabatan,
    });
    setError(null);
  };

  const handleSaveCandidateEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeWorkspaceId || !candidateEditCandidate || !candidateEditDraft || isSavingCandidate) return;
    setIsSavingCandidate(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await apiClient.updateCandidatePreparationCandidate(
        activeWorkspaceId,
        candidateEditCandidate.employee_id,
        candidateEditDraft,
      );
      setCandidates((current) => current.map((item) => (
        item.employee_id === updated.employee_id ? updated : item
      )));
      setCandidateEditCandidate(null);
      setCandidateEditDraft(null);
      setNotice(`Data kandidat ${updated.nama || 'kandidat'} tersimpan sebagai tahap ekspor.`);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setIsSavingCandidate(false);
    }
  };

  const exportWorkspace = async () => {
    if (!activeWorkspace || candidates.length === 0 || isExporting) return;
    setIsExporting(true);
    setError(null);
    setNotice(null);
    try {
      const content = await apiClient.exportCandidatePreparationWorkspace(activeWorkspace.id);
      const filename = activeWorkspace.output_style === 'Batch'
        ? 'candidate_profiles_batch.pptx'
        : 'candidate_profiles_single.pptx';
      downloadBlob(content, filename);
      setNotice('PPTX kandidat berhasil diunduh.');
    } catch (exportError) {
      setError(errorMessage(exportError));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <main className="min-h-screen bg-surface-950 px-4 pb-16 pt-24 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-[1728px] space-y-6">
        {/* Top Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-800 pb-5">
          <div>
            <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-2 text-xs text-slate-400">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="transition hover:text-sky-300"
              >
                Beranda
              </button>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300">Penyusunan Kandidat</span>
            </nav>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-slate-50">
                Penyusunan Kandidat
              </h1>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                Operational
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Kelola workspace jabatan target, kurasi kandidat melalui Talent Finder, catat pertimbangan, dan ekspor profil PPTX.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void loadWorkspaces()}
              disabled={isLoadingWorkspaces}
              className="inline-flex items-center gap-2 rounded-xl border border-surface-700 bg-surface-900 px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:bg-surface-800 disabled:opacity-50"
            >
              <svg className={`h-4 w-4 ${isLoadingWorkspaces ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M5.6 15A8 8 0 0019 13M18.4 9A8 8 0 005 11" />
              </svg>
              {isLoadingWorkspaces ? 'Memuat…' : 'Muat ulang'}
            </button>

            {canEditWorkspaces && (
              <button
                type="button"
                onClick={openCreateWorkspaceModal}
                className="btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
                </svg>
                Workspace Baru
              </button>
            )}
          </div>
        </header>

        {/* Feedback Banners */}
        {error && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Tutup pesan kesalahan"
              className="rounded-lg p-1 text-rose-300 hover:bg-rose-900/40"
            >
              ✕
            </button>
          </div>
        )}
        {notice && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Tutup notifikasi"
              className="rounded-lg p-1 text-emerald-300 hover:bg-emerald-900/40"
            >
              ✕
            </button>
          </div>
        )}

        {/* Main Two-Column Layout */}
        <div className="grid gap-6 xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
          {/* Left Sidebar: Workspace Directory */}
          <aside className="space-y-3">
            <section className="rounded-2xl border border-surface-700/80 bg-surface-900 p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-100">Workspace Saya</h2>
                <span className="rounded-full border border-surface-700 bg-surface-800 px-2.5 py-0.5 text-xs font-medium text-slate-300">
                  {workspaces.length}
                </span>
              </div>

              {workspaces.length > 3 && (
                <div className="mb-3">
                  <input
                    type="search"
                    value={workspaceFilter}
                    onChange={(event) => setWorkspaceFilter(event.target.value)}
                    placeholder="Filter workspace atau jabatan…"
                    className="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none"
                  />
                </div>
              )}

              {isLoadingWorkspaces ? (
                <p role="status" className="py-6 text-center text-sm text-slate-400">
                  Memuat daftar workspace…
                </p>
              ) : filteredWorkspaces.length === 0 ? (
                <div className="rounded-xl border border-dashed border-surface-700 bg-surface-950/60 p-5 text-center">
                  <p className="text-sm text-slate-400">
                    {workspaces.length === 0 ? 'Belum ada workspace.' : 'Tidak ada workspace yang cocok.'}
                  </p>
                  {workspaces.length === 0 && canEditWorkspaces && (
                    <button
                      type="button"
                      onClick={openCreateWorkspaceModal}
                      className="btn-secondary mt-3 text-xs"
                    >
                      + Buat Workspace Pertama
                    </button>
                  )}
                </div>
              ) : (
                <ul className="max-h-[calc(100vh-17rem)] space-y-2.5 overflow-y-auto pr-0.5">
                  {filteredWorkspaces.map((workspace) => {
                    const isActive = workspace.id === activeWorkspaceId;
                    return (
                      <li
                        key={workspace.id}
                        className={`rounded-xl border transition ${
                          isActive
                            ? 'border-brand-500/60 bg-brand-500/10 shadow-sm'
                            : 'border-surface-700/80 bg-surface-950/80 hover:border-surface-600 hover:bg-surface-800/70'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveWorkspaceId(workspace.id)}
                          className="w-full p-3.5 text-left"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="line-clamp-1 text-sm font-semibold text-slate-100">
                              {workspace.workspace_name}
                            </span>
                            <PriorityBadge priority={workspace.priority} />
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">
                            {workspace.target_jabatan}
                          </p>
                          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                            <span>{displayDate(workspace.date)}</span>
                            <span className="rounded border border-surface-700 bg-surface-900 px-1.5 py-0.5 text-slate-300">
                              {workspace.output_style}
                            </span>
                          </div>
                        </button>

                        {canEditWorkspaces && (
                          <div className="flex items-center justify-end gap-3 border-t border-surface-800/80 px-3.5 py-2">
                            <button
                              type="button"
                              onClick={() => openEditWorkspaceModal(workspace)}
                              className="text-xs font-medium text-slate-400 transition hover:text-sky-300"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmAction({ type: 'delete-workspace', workspace })}
                              className="text-xs font-medium text-rose-400 transition hover:text-rose-300"
                            >
                              Hapus
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </aside>

          {/* Right Main Workspace Canvas */}
          <section className="min-w-0 space-y-5">
            {!activeWorkspace ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-surface-700 bg-surface-900/50 px-6 py-16 text-center">
                <h2 className="text-base font-semibold text-slate-200">Belum ada workspace dipilih</h2>
                <p className="mt-1.5 max-w-md text-sm text-slate-400">
                  Pilih workspace di panel kiri atau buat workspace baru untuk mulai menyusun daftar kandidat.
                </p>
                {canEditWorkspaces && (
                  <button
                    type="button"
                    onClick={openCreateWorkspaceModal}
                    className="btn-primary mt-5 inline-flex items-center gap-2"
                  >
                    + Workspace Baru
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Active Workspace Summary & Actions Card */}
                <section className="rounded-2xl border border-surface-700/80 bg-surface-900 p-5 shadow-sm">
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="truncate text-xl font-bold text-slate-50">
                          {activeWorkspace.workspace_name}
                        </h2>
                        <PriorityBadge priority={activeWorkspace.priority} />
                        <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                          {activeWorkspace.output_style} ·{' '}
                          {activeWorkspace.output_style === 'Batch'
                            ? '2 kandidat / slide'
                            : '1 kandidat / slide'}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-slate-300">
                        <span className="text-slate-500">Target Jabatan:</span>{' '}
                        {activeWorkspace.target_jabatan}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Tanggal dokumen: {displayDate(activeWorkspace.date)} · {candidates.length} kandidat terpilih
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      {canEditWorkspaces && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditWorkspaceModal(activeWorkspace)}
                            className="rounded-xl border border-surface-700 bg-surface-950 px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:bg-surface-800 hover:text-slate-100"
                          >
                            Edit Info
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsFinderModalOpen(true)}
                            className="inline-flex items-center gap-2 rounded-xl border border-brand-500/40 bg-brand-500/15 px-4 py-2 text-sm font-semibold text-sky-200 transition hover:bg-brand-500/25"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
                            </svg>
                            Tambah Kandidat
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => void exportWorkspace()}
                        disabled={isExporting || candidates.length === 0}
                        className="btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                        </svg>
                        {isExporting ? 'Membuat PPTX…' : 'Ekspor PPTX'}
                      </button>
                    </div>
                  </div>
                </section>

                {/* Curated Shortlist Section */}
                <section className="space-y-4 rounded-2xl border border-surface-700/80 bg-surface-900 p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-800 pb-4">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h3 className="text-base font-semibold text-slate-100">Kandidat Terpilih</h3>
                        <span className="rounded-full border border-surface-700 bg-surface-800 px-2.5 py-0.5 text-xs font-semibold text-slate-200">
                          {candidates.length}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        Urutan kandidat dipertahankan pada slide PPTX saat diekspor.
                      </p>
                    </div>

                    {isLoadingCandidates && (
                      <span role="status" className="text-xs text-slate-400">
                        Memuat kandidat…
                      </span>
                    )}
                  </div>

                  {!isLoadingCandidates && candidates.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-surface-700 bg-surface-950/60 px-6 py-12 text-center">
                      <p className="text-sm font-medium text-slate-200">
                        Belum ada kandidat di workspace ini
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Buka Talent Finder untuk mencari dan menambahkan pegawai yang memenuhi syarat.
                      </p>
                      {canEditWorkspaces && (
                        <button
                          type="button"
                          onClick={() => setIsFinderModalOpen(true)}
                          className="btn-primary mt-4 inline-flex items-center gap-2 text-sm"
                        >
                          + Pilih Kandidat dari Talent Finder
                        </button>
                      )}
                    </div>
                  ) : (
                    <ol className="space-y-3">
                      {candidates.map((candidate, index) => {
                        const eligible = isEligible(candidate);
                        const hasConsideration = candidate.consideration.trim().length > 0;

                        return (
                          <li
                            key={candidate.employee_id}
                            className="rounded-xl border border-surface-700/80 bg-surface-950/90 p-4 transition hover:border-surface-600"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex min-w-0 gap-3.5">
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-brand-500/30 bg-brand-500/10 text-xs font-bold text-sky-300">
                                  #{index + 1}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="text-sm font-semibold text-slate-100">
                                      {candidate.nama || `Pegawai ${candidate.employee_id}`}
                                    </h4>
                                    <span className="rounded border border-surface-700 bg-surface-900 px-2 py-0.5 font-mono text-[11px] text-slate-300">
                                      {candidate.nip || 'NIP tidak tersedia'}
                                    </span>
                                    {!eligible && (
                                      <span className="rounded-full border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-300">
                                        Eselon tidak memenuhi syarat
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 text-sm text-slate-300">
                                    {candidate.jabatan || 'Jabatan tidak tersedia'}
                                  </p>
                                  <p className="mt-0.5 text-xs text-slate-500">
                                    {candidate.eselon || 'Eselon tidak tersedia'}
                                    {candidate.unit_eselon_ii ? ` · ${candidate.unit_eselon_ii}` : ''}
                                  </p>
                                </div>
                              </div>

                              {canEditWorkspaces && (
                                <div className="flex shrink-0 items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isSavingCandidate}
                                    onClick={() => openCandidateEditModal(candidate)}
                                    className="rounded-lg border border-surface-700 bg-surface-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-brand-500/40 hover:bg-surface-800 hover:text-sky-200 disabled:opacity-50"
                                  >
                                    {hasConsideration ? 'Edit Data & Pertimbangan' : 'Atur Data & Pertimbangan'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isSavingCandidate}
                                    onClick={() => setConfirmAction({ type: 'remove-candidate', candidate })}
                                    className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs font-medium text-rose-400 transition hover:border-rose-500/30 hover:bg-rose-950/30 hover:text-rose-300 disabled:opacity-50"
                                  >
                                    Hapus
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Clean Read-Only Consideration Summary */}
                            <div className="mt-3 rounded-lg border border-surface-800 bg-surface-900/70 px-3.5 py-2.5">
                              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                Catatan Pertimbangan
                              </span>
                              {hasConsideration ? (
                                <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-200">
                                  {candidate.consideration}
                                </p>
                              ) : (
                                <p className="mt-1 text-xs italic text-slate-500">
                                  Belum ada catatan pertimbangan untuk kandidat ini.
                                </p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>
              </>
            )}
          </section>
        </div>
      </div>

      {/* POPUP 1: Create / Edit Workspace Modal */}
      {isWorkspaceModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeWorkspaceModal();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-modal-title"
            className="w-full max-w-lg rounded-2xl border border-surface-700 bg-surface-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-surface-800 pb-4">
              <div>
                <h2 id="workspace-modal-title" className="text-lg font-semibold text-slate-100">
                  {editingWorkspaceId ? 'Edit Workspace' : 'Workspace Baru'}
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Tentukan nama workspace, target jabatan, prioritas, dan format slide PPTX.
                </p>
              </div>
              <button
                type="button"
                onClick={closeWorkspaceModal}
                disabled={isSavingWorkspace}
                aria-label="Tutup dialog workspace"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-surface-800 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form className="mt-4 space-y-4" onSubmit={(event) => void handleWorkspaceSubmit(event)}>
              <label className="block text-sm font-medium text-slate-300">
                Workspace Name
                <input
                  required
                  autoFocus
                  maxLength={255}
                  placeholder="Contoh: Pengisian Jabatan Administrator Q4"
                  value={workspaceForm.workspace_name}
                  onChange={(event) => setWorkspaceForm((current) => ({
                    ...current,
                    workspace_name: event.target.value,
                  }))}
                  className="mt-1.5 w-full rounded-xl border border-surface-700 bg-surface-950 px-3.5 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none"
                />
              </label>

              <label className="block text-sm font-medium text-slate-300">
                Target Jabatan
                <input
                  required
                  maxLength={512}
                  placeholder="Contoh: Kepala Bagian Umum Kanwil DJPb"
                  value={workspaceForm.target_jabatan}
                  onChange={(event) => setWorkspaceForm((current) => ({
                    ...current,
                    target_jabatan: event.target.value,
                  }))}
                  className="mt-1.5 w-full rounded-xl border border-surface-700 bg-surface-950 px-3.5 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none"
                />
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block text-sm font-medium text-slate-300">
                  Date
                  <input
                    required
                    type="date"
                    value={workspaceForm.date}
                    onChange={(event) => setWorkspaceForm((current) => ({
                      ...current,
                      date: event.target.value,
                    }))}
                    className="mt-1.5 w-full rounded-xl border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-300">
                  Priority
                  <select
                    value={workspaceForm.priority}
                    onChange={(event) => setWorkspaceForm((current) => ({
                      ...current,
                      priority: event.target.value as CandidatePreparationPriority,
                    }))}
                    className="mt-1.5 w-full rounded-xl border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none"
                  >
                    <option value="high">High</option>
                    <option value="med">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>

                <label className="block text-sm font-medium text-slate-300">
                  Output Style
                  <select
                    value={workspaceForm.output_style}
                    onChange={(event) => setWorkspaceForm((current) => ({
                      ...current,
                      output_style: event.target.value as CandidatePreparationOutputStyle,
                    }))}
                    className="mt-1.5 w-full rounded-xl border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none"
                  >
                    <option value="Single">Single</option>
                    <option value="Batch">Batch</option>
                  </select>
                </label>
              </div>

              <p className="rounded-lg border border-surface-800 bg-surface-950/70 px-3 py-2 text-xs text-slate-400">
                Date hanya digunakan sebagai metadata dokumen. Perhitungan masa jabatan dan usia tetap menggunakan tanggal hari ini.
              </p>

              <div className="flex justify-end gap-2.5 border-t border-surface-800 pt-4">
                <button
                  type="button"
                  onClick={closeWorkspaceModal}
                  disabled={isSavingWorkspace}
                  className="rounded-xl border border-surface-700 px-4 py-2 text-sm text-slate-300 hover:bg-surface-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingWorkspace}
                  className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {isSavingWorkspace
                    ? 'Menyimpan…'
                    : editingWorkspaceId
                      ? 'Simpan Perubahan'
                      : 'Buat Workspace'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* POPUP 2: Talent Finder / Add Candidate Modal */}
      {isFinderModalOpen && activeWorkspace && canEditWorkspaces && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-xs sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsFinderModalOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="talent-finder-modal-title"
            className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-surface-700 bg-surface-900 shadow-2xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-800 px-6 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 id="talent-finder-modal-title" className="text-lg font-semibold text-slate-100">
                    Tambah Kandidat
                  </h2>
                  <span className="rounded-full border border-brand-500/30 bg-brand-500/15 px-2.5 py-0.5 text-xs font-medium text-sky-200">
                    {candidates.length} kandidat terpilih
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  Workspace: <span className="font-medium text-slate-200">{activeWorkspace.workspace_name}</span> · Target: {activeWorkspace.target_jabatan}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsFinderModalOpen(false)}
                  className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold"
                >
                  Selesai
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <MutationTalentFinder
                allowedEselonIds={ELIGIBLE_ESELON_IDS}
                onSelectEmployee={(employee) => void addCandidate(employee)}
                searchApi={apiClient.candidatePreparationTalentFinderApi}
                selectedEmployeeIds={selectedEmployeeIds}
                selectionDisabled={isSavingCandidate || isLoadingCandidates}
              />
            </div>
          </section>
        </div>
      )}

      {/* POPUP 3: Candidate staged profile and consideration */}
      {candidateEditCandidate && candidateEditDraft && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSavingCandidate) {
              setCandidateEditCandidate(null);
              setCandidateEditDraft(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="candidate-edit-modal-title"
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-surface-700 bg-surface-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-surface-800 pb-4">
              <div>
                <h2 id="candidate-edit-modal-title" className="text-lg font-semibold text-slate-100">
                  Tahap Data & Pertimbangan Kandidat
                </h2>
                <p className="mt-1 text-sm font-medium text-sky-300">
                  {candidateEditDraft.nama || `Pegawai ${candidateEditCandidate.employee_id}`}
                </p>
                <p className="text-xs text-slate-400">
                  Perubahan tersimpan untuk workspace ini. Ekspor menggunakan nilai yang ditahapkan, bukan pencarian database ulang.
                </p>
              </div>
              <button
                type="button"
                disabled={isSavingCandidate}
                onClick={() => {
                  setCandidateEditCandidate(null);
                  setCandidateEditDraft(null);
                }}
                aria-label="Tutup dialog data kandidat"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-surface-800 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form className="mt-4 space-y-4" onSubmit={(event) => void handleSaveCandidateEdit(event)}>
              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  ['nip', 'NIP'],
                  ['nama', 'Nama Gelar'],
                  ['jabatan', 'Jabatan'],
                  ['eselon', 'Eselon'],
                  ['unit_eselon_ii', 'Unit Eselon II'],
                  ['unit_eselon_iii', 'Unit Eselon III'],
                  ['gol', 'Gol'],
                  ['pangkat', 'Pangkat'],
                  ['pendidikan', 'Pendidikan Terakhir'],
                  ['jurusan', 'Jurusan'],
                  ['universitas', 'Universitas/Sekolah Tinggi'],
                  ['tmt_jabatan', 'TMT Jabatan'],
                  ['tanggal_lahir', 'Tanggal Lahir'],
                ] as const).map(([field, label]) => (
                  <label key={field} className="block text-sm font-medium text-slate-300">
                    {label}
                    <input
                      value={candidateEditDraft[field] ?? ''}
                      disabled={isSavingCandidate}
                      maxLength={field === 'nip' ? 32 : field === 'tmt_jabatan' || field === 'tanggal_lahir' ? 32 : 2000}
                      onChange={(event) => setCandidateEditDraft((current) => (
                        current ? { ...current, [field]: event.target.value } : current
                      ))}
                      className="mt-1.5 w-full rounded-xl border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none"
                    />
                  </label>
                ))}
              </div>

              <label className="block text-sm font-medium text-slate-300">
                Riwayat Jabatan (maks. 3 baris)
                <textarea
                  value={candidateEditDraft.riwayat_jabatan}
                  disabled={isSavingCandidate}
                  maxLength={20000}
                  rows={5}
                  onChange={(event) => setCandidateEditDraft((current) => (
                    current ? { ...current, riwayat_jabatan: event.target.value } : current
                  ))}
                  className="mt-1.5 w-full resize-y rounded-xl border border-surface-700 bg-surface-950 px-3.5 py-2.5 text-sm leading-relaxed text-slate-100 focus:border-brand-500 focus:outline-none"
                />
              </label>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="modal-consideration-textarea" className="text-sm font-medium text-slate-300">
                    Catatan Pertimbangan
                  </label>
                  <span className="text-xs text-slate-500">
                    {candidateEditDraft.consideration.length} / 5000
                  </span>
                </div>
                <textarea
                  id="modal-consideration-textarea"
                  maxLength={5000}
                  rows={5}
                  value={candidateEditDraft.consideration}
                  disabled={isSavingCandidate}
                  onChange={(event) => setCandidateEditDraft((current) => (
                    current ? { ...current, consideration: event.target.value } : current
                  ))}
                  className="w-full resize-y rounded-xl border border-surface-700 bg-surface-950 px-3.5 py-2.5 text-sm leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2.5 border-t border-surface-800 pt-4">
                <button
                  type="button"
                  disabled={isSavingCandidate}
                  onClick={() => {
                    setCandidateEditCandidate(null);
                    setCandidateEditDraft(null);
                  }}
                  className="rounded-xl border border-surface-700 px-4 py-2 text-sm text-slate-300 hover:bg-surface-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingCandidate}
                  className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {isSavingCandidate ? 'Menyimpan…' : 'Simpan Tahap Kandidat'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* POPUP 4: Destructive Confirmation Modal */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isDeleting) {
              setConfirmAction(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-action-title"
            className="w-full max-w-md rounded-2xl border border-surface-700 bg-surface-900 p-6 shadow-2xl"
          >
            <h2 id="confirm-action-title" className="text-lg font-semibold text-slate-100">
              {confirmAction.type === 'delete-workspace'
                ? 'Hapus Workspace?'
                : 'Hapus Kandidat dari Workspace?'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              {confirmAction.type === 'delete-workspace' ? (
                <>
                  Workspace <span className="font-semibold text-slate-100">“{confirmAction.workspace.workspace_name}”</span> beserta seluruh daftar kandidat dan pertimbangannya akan dihapus permanen.
                </>
              ) : (
                <>
                  Kandidat <span className="font-semibold text-slate-100">{confirmAction.candidate.nama || `Pegawai ${confirmAction.candidate.employee_id}`}</span> beserta catatan pertimbangannya akan dihapus dari workspace ini.
                </>
              )}
            </p>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmAction(null)}
                className="rounded-xl border border-surface-700 px-4 py-2 text-sm text-slate-300 hover:bg-surface-800"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void executeConfirmAction()}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
              >
                {isDeleting ? 'Menghapus…' : 'Ya, Hapus'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}