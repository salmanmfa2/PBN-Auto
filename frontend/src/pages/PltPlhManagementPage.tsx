import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import * as apiClient from '../services/api';
import { useMenuAccess } from '../contexts/MenuAccessContext';
import type {
  PltPlhEmployeeOption,
  PltPlhMonitoringRecord,
  PltPlhRecordFields,
} from '../types';
import { Spinner } from '../components/Spinner';

type PendingAction = {
  kind: 'delete' | 'active';
  record: PltPlhMonitoringRecord;
  nextActive?: boolean;
} | null;

type StatusFilter = 'ALL' | PltPlhMonitoringRecord['status'];

const emptyFields: PltPlhRecordFields = {
  jabatan_kosong: '',
  pejabat_pengganti: '',
  pejabat_pengganti_nip: null,
  jabatan_definitif_pengganti: '',
  nomor_surat: '',
  tmt: '',
};

function todayForDateInput(): string {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${day}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00+07:00`));
}

function statusBadgeMeta(status: PltPlhMonitoringRecord['status']): {
  badge: string;
  dot: string;
} {
  switch (status) {
    case 'Inaktif':
      return {
        badge: 'border-slate-600/70 bg-slate-700/50 text-slate-300',
        dot: 'bg-slate-400',
      };
    case 'Aktif':
      return {
        badge: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
        dot: 'bg-emerald-400',
      };
    case 'Mendekati 6 Bulan':
      return {
        badge: 'border-amber-500/35 bg-amber-500/10 text-amber-300',
        dot: 'bg-amber-400 animate-pulse',
      };
    case 'Lebih dari 6 Bulan':
      return {
        badge: 'border-rose-500/35 bg-rose-500/10 text-rose-300',
        dot: 'bg-rose-400 animate-pulse',
      };
  }
}

export default function PltPlhManagementPage() {
  const navigate = useNavigate();
  const { canEdit } = useMenuAccess();
  const canManageRecords = canEdit('plt-plh');

  const [records, setRecords] = useState<PltPlhMonitoringRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [fields, setFields] = useState<PltPlhRecordFields>(emptyFields);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [employeeOptions, setEmployeeOptions] = useState<PltPlhEmployeeOption[]>([]);
  const [isEmployeeSearchActive, setIsEmployeeSearchActive] = useState(false);
  const [isSearchingEmployees, setIsSearchingEmployees] = useState(false);
  const [employeeSearchError, setEmployeeSearchError] = useState<string | null>(null);
  const [activeEmployeeIndex, setActiveEmployeeIndex] = useState(-1);
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isNdMenuOpen, setIsNdMenuOpen] = useState(false);
  const [isDevelopmentDialogOpen, setIsDevelopmentDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const ndMenuRef = useRef<HTMLDivElement>(null);

  const refreshRecords = async () => {
    setLoadError(null);
    try {
      setRecords(await apiClient.getPltPlhRecords());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshRecords();
  }, []);

  useEffect(() => {
    const query = employeeSearchQuery.trim();
    if (!isFormOpen || !isEmployeeSearchActive || query.length < 2) {
      setEmployeeOptions([]);
      setIsSearchingEmployees(false);
      setEmployeeSearchError(null);
      setActiveEmployeeIndex(-1);
      return;
    }

    let cancelled = false;
    setIsSearchingEmployees(true);
    setEmployeeSearchError(null);
    const timeoutId = window.setTimeout(() => {
      void apiClient.searchPltPlhEmployees(query)
        .then((options) => {
          if (cancelled) return;
          setEmployeeOptions(options);
          setActiveEmployeeIndex(-1);
        })
        .catch((error) => {
          if (cancelled) return;
          setEmployeeOptions([]);
          setEmployeeSearchError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (!cancelled) setIsSearchingEmployees(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [employeeSearchQuery, isEmployeeSearchActive, isFormOpen]);

  useEffect(() => {
    if (!isFormOpen || isSaving) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFormOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFormOpen, isSaving]);

  useEffect(() => {
    if (!isNdMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !ndMenuRef.current?.contains(event.target)) {
        setIsNdMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsNdMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNdMenuOpen]);

  useEffect(() => {
    if (!isDevelopmentDialogOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsDevelopmentDialogOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDevelopmentDialogOpen]);

  const resetForm = () => {
    setFields(emptyFields);
    setEmployeeSearchQuery('');
    setEmployeeOptions([]);
    setIsEmployeeSearchActive(false);
    setEmployeeSearchError(null);
    setActiveEmployeeIndex(-1);
    setEditingRecordId(null);
    setIsFormOpen(false);
  };

  const startEditing = (record: PltPlhMonitoringRecord) => {
    setFields({
      jabatan_kosong: record.jabatan_kosong,
      pejabat_pengganti: record.pejabat_pengganti,
      pejabat_pengganti_nip: record.pejabat_pengganti_nip,
      jabatan_definitif_pengganti: record.jabatan_definitif_pengganti,
      nomor_surat: record.nomor_surat,
      tmt: record.tmt.slice(0, 10),
    });
    setEmployeeSearchQuery(record.pejabat_pengganti);
    setEmployeeOptions([]);
    setIsEmployeeSearchActive(false);
    setEmployeeSearchError(null);
    setActiveEmployeeIndex(-1);
    setEditingRecordId(record.id);
    setActionError(null);
    setIsFormOpen(true);
  };

  const selectEmployee = (employee: PltPlhEmployeeOption) => {
    setFields((current) => ({
      ...current,
      pejabat_pengganti: employee.nama,
      pejabat_pengganti_nip: employee.nip,
      jabatan_definitif_pengganti: employee.jabatan_definitif_pengganti,
    }));
    setEmployeeSearchQuery(employee.nama);
    setEmployeeOptions([]);
    setIsEmployeeSearchActive(false);
    setEmployeeSearchError(null);
    setActiveEmployeeIndex(-1);
  };

  const submitRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError(null);
    setIsSaving(true);
    try {
      if (editingRecordId === null) {
        await apiClient.createPltPlhRecord(fields);
      } else {
        await apiClient.updatePltPlhRecord(editingRecordId, fields);
      }
      resetForm();
      await refreshRecords();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const runPendingAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingAction) return;
    setActionError(null);
    setIsSaving(true);
    try {
      if (pendingAction.kind === 'delete') {
        await apiClient.deletePltPlhRecord(pendingAction.record.id);
      } else {
        await apiClient.setPltPlhRecordActive(
          pendingAction.record.id,
          pendingAction.nextActive ?? false,
        );
      }
      setPendingAction(null);
      await refreshRecords();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const exportRecords = async () => {
    setActionError(null);
    setIsExporting(true);
    try {
      await apiClient.downloadPltPlhRecords();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExporting(false);
    }
  };

  const aktifCount = records.filter((r) => r.status === 'Aktif').length;
  const mendekatiCount = records.filter((r) => r.status === 'Mendekati 6 Bulan').length;
  const lebihCount = records.filter((r) => r.status === 'Lebih dari 6 Bulan').length;
  const inaktifCount = records.filter((r) => r.status === 'Inaktif').length;
  const notifications = records.filter(
    (record) => record.status === 'Mendekati 6 Bulan' || record.status === 'Lebih dari 6 Bulan',
  );

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase('id-ID');
  const filteredRecords = records.filter((record) => {
    const matchesStatus = statusFilter === 'ALL' || record.status === statusFilter;
    const matchesSearch = !normalizedQuery || [
      record.jabatan_kosong,
      record.pejabat_pengganti,
      record.pejabat_pengganti_nip ?? '',
      record.jabatan_definitif_pengganti,
      record.nomor_surat,
    ].join(' ').toLocaleLowerCase('id-ID').includes(normalizedQuery);
    return matchesStatus && matchesSearch;
  });

  const filterTabs: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: 'ALL', label: 'Semua', count: records.length },
    { key: 'Aktif', label: 'Aktif', count: aktifCount },
    { key: 'Mendekati 6 Bulan', label: 'Mendekati 6 Bulan', count: mendekatiCount },
    { key: 'Lebih dari 6 Bulan', label: 'Lebih dari 6 Bulan', count: lebihCount },
    { key: 'Inaktif', label: 'Inaktif', count: inaktifCount },
  ];

  return (
    <div className="plt-plh-page relative isolate min-h-screen bg-surface-950 text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_40%_at_50%_-5%,rgba(14,165,233,0.12),transparent)]"
        aria-hidden="true"
      />

      {/* Top Navigation & Command Bar */}
      <header className="plt-header border-b border-surface-700/80 bg-surface-900/85 px-5 pb-5 pt-[4.5rem] backdrop-blur-sm xl:pr-[420px] xl:pt-5">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
            >
              <span aria-hidden="true">←</span>
              <span>Menu</span>
            </button>

            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/15 text-sky-300">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="10" cy="7" r="4" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight sm:text-xl">Manajemen Plt./Plh.</h1>
                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300">
                  {records.length} penugasan
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                Pemantauan masa tugas pejabat pelaksana tugas dan pelaksana harian DJPb
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative" ref={ndMenuRef}>
              <button
                type="button"
                onClick={() => setIsNdMenuOpen((isOpen) => !isOpen)}
                aria-haspopup="menu"
                aria-expanded={isNdMenuOpen}
                className="btn-secondary rounded-xl"
              >
                <svg className="h-4 w-4 text-sky-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 3.75h7l4.25 4.5v12A.75.75 0 0117.5 21h-10a.75.75 0 01-.75-.75v-16A.75.75 0 017.5 3.5h6.25M14 3.75v4.5h4.25M9 12h6m-6 3.5h6" />
                </svg>
                <span>Susun ND Plt.</span>
                <svg className={`h-3.5 w-3.5 transition-transform ${isNdMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isNdMenuOpen && (
                <div
                  role="menu"
                  aria-label="Pilihan Susun ND Plt."
                  className="plt-modal absolute right-0 z-30 mt-2 min-w-52 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl"
                >
                  {['Mekanisme Plt.', 'PRIN Plt'].map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsNdMenuOpen(false);
                        setIsDevelopmentDialogOpen(true);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-3.5 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800 focus:bg-slate-800 focus:outline-none"
                    >
                      <span>{option}</span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">v2.0</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              title={isExporting ? 'Mengekspor Excel…' : 'Export Excel'}
              aria-label={isExporting ? 'Mengekspor Excel' : 'Export Excel'}
              aria-busy={isExporting}
              onClick={() => void exportRecords()}
              disabled={isExporting}
              className="btn-secondary rounded-xl"
            >
              {isExporting ? (
                <Spinner size="sm" label="Mengekspor…" />
              ) : (
                <>
                  <svg className="h-4 w-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 3.75h7l4.25 4.5v5.25M14 3.75v4.5h4.25M8 12H5.75A1.75 1.75 0 004 13.75v5.5C4 20.216 4.784 21 5.75 21h7.5A1.75 1.75 0 0015 19.25V17m-3-3l3 3 3-3m-3 3V9" />
                  </svg>
                  <span className="hidden sm:inline">Export Excel</span>
                </>
              )}
            </button>

            {canManageRecords && (
              <button
                type="button"
                title="Tambah Monitoring"
                aria-label="Tambah Monitoring"
                onClick={() => {
                  resetForm();
                  setActionError(null);
                  setIsFormOpen(true);
                }}
                className="btn-primary rounded-xl"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14" />
                </svg>
                <span>Tambah Monitoring</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl space-y-6 p-4 md:p-6">
        {/* KPI Telemetry Cards */}
        <section aria-label="Ringkasan status Plt./Plh." className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`plt-kpi-card rounded-2xl border p-4 text-left transition ${
              statusFilter === 'ALL'
                ? 'border-sky-500/50 bg-sky-500/10 ring-1 ring-sky-500/30'
                : 'border-slate-700/80 bg-slate-900/75 hover:border-slate-600'
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Penugasan</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-100">{records.length}</p>
            <p className="mt-1 text-xs text-slate-400">{inaktifCount} record nonaktif</p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'Aktif' ? 'ALL' : 'Aktif')}
            className={`plt-kpi-card rounded-2xl border p-4 text-left transition ${
              statusFilter === 'Aktif'
                ? 'border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                : 'border-slate-700/80 bg-slate-900/75 hover:border-slate-600'
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Aktif Normal</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-emerald-300">{aktifCount}</p>
            <p className="mt-1 text-xs text-slate-400">Masa tugas &lt; 5 bulan</p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'Mendekati 6 Bulan' ? 'ALL' : 'Mendekati 6 Bulan')}
            className={`plt-kpi-card rounded-2xl border p-4 text-left transition ${
              statusFilter === 'Mendekati 6 Bulan'
                ? 'border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/30'
                : 'border-slate-700/80 bg-slate-900/75 hover:border-slate-600'
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Mendekati 6 Bulan</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-amber-300">{mendekatiCount}</p>
            <p className="mt-1 text-xs text-slate-400">Perlu evaluasi perpanjangan</p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'Lebih dari 6 Bulan' ? 'ALL' : 'Lebih dari 6 Bulan')}
            className={`plt-kpi-card rounded-2xl border p-4 text-left transition ${
              statusFilter === 'Lebih dari 6 Bulan'
                ? 'border-rose-500/50 bg-rose-500/10 ring-1 ring-rose-500/30'
                : 'border-slate-700/80 bg-slate-900/75 hover:border-slate-600'
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Lebih dari 6 Bulan</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-rose-300">{lebihCount}</p>
            <p className="mt-1 text-xs text-slate-400">Melewati batas 6 bulan</p>
          </button>
        </section>

        {/* Attention Banner */}
        {notifications.length > 0 && (
          <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5" aria-live="polite">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.3 3.95L2.8 17a2 2 0 001.73 3h14.94a2 2 0 001.73-3l-7.5-13.05a2 2 0 00-3.4 0z" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-amber-200">
                  Perlu Perhatian ({notifications.length} penugasan)
                </h2>
                <ul className="mt-2 grid gap-1.5 text-xs text-amber-100/90 md:grid-cols-2">
                  {notifications.map((record) => (
                    <li
                      key={record.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-slate-950/25 px-3 py-1.5"
                    >
                      <span className="truncate font-medium">
                        {record.pejabat_pengganti} — <span className="font-normal opacity-90">{record.jabatan_kosong}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] font-semibold">
                        {record.masa_kerja}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* Alerts */}
        {loadError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-700/60 bg-rose-900/30 px-4 py-3 text-sm text-rose-200">
            <span>Gagal memuat data: {loadError}</span>
            <button type="button" onClick={() => void refreshRecords()} className="btn-secondary">Coba lagi</button>
          </div>
        )}
        {actionError && (
          <div role="alert" className="rounded-xl border border-rose-700/60 bg-rose-900/30 px-4 py-3 text-sm text-rose-200">
            {actionError}
          </div>
        )}

        {/* Main Monitoring Data Card */}
        <section className="plt-card card overflow-hidden rounded-2xl">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-700/80 px-5 py-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-base font-semibold">Daftar Monitoring Record</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Menampilkan {filteredRecords.length} dari {records.length} penugasan Plt./Plh.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative">
                <svg
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" strokeWidth={1.8} />
                  <path strokeLinecap="round" strokeWidth={1.8} d="M20 20l-4-4" />
                </svg>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Cari pejabat, NIP, jabatan, nomor..."
                  className="input w-full pl-9 sm:w-72"
                />
              </div>

              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter status monitoring">
                {filterTabs.map((tab) => {
                  const active = statusFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setStatusFilter(tab.key)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                        active
                          ? 'bg-sky-500 text-white shadow-sm'
                          : 'border border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-300'}`}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center p-12"><Spinner label="Memuat data…" /></div>
          ) : records.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-slate-300">Belum ada data monitoring Plt./Plh.</p>
              <p className="mt-1 text-xs text-slate-400">
                Klik tombol "Tambah Monitoring" di kanan atas untuk mencatat penugasan baru.
              </p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-slate-300">Tidak ada record yang sesuai filter.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                }}
                className="btn-secondary mt-3 text-xs"
              >
                Reset Filter
              </button>
            </div>
          ) : (
            <div className="max-h-[68vh] overflow-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="plt-table-head sticky top-0 z-10 bg-slate-900/95 text-xs uppercase tracking-wider text-slate-400 backdrop-blur-xs">
                  <tr>
                    <th className="px-4 py-3.5">No.</th>
                    <th className="px-4 py-3.5">Jabatan Kosong</th>
                    <th className="px-4 py-3.5">Pejabat Pengganti</th>
                    <th className="px-4 py-3.5">Jabatan Definitif Pengganti</th>
                    <th className="px-4 py-3.5">Nomor Surat</th>
                    <th className="px-4 py-3.5">TMT</th>
                    <th className="px-4 py-3.5">Masa Kerja</th>
                    <th className="px-4 py-3.5">Status</th>
                    {canManageRecords && <th className="px-4 py-3.5 text-right">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredRecords.map((record, index) => {
                    const statusStyle = statusBadgeMeta(record.status);
                    return (
                      <tr
                        key={record.id}
                        className={`transition-colors ${
                          record.is_active ? 'hover:bg-slate-800/45' : 'bg-slate-900/35 opacity-65'
                        }`}
                      >
                        <td className="px-4 py-3.5 font-mono text-xs tabular-nums text-slate-400">
                          {index + 1}
                        </td>
                        <td className="max-w-56 whitespace-normal px-4 py-3.5 font-medium text-slate-100">
                          {record.jabatan_kosong}
                        </td>
                        <td className="max-w-52 whitespace-normal px-4 py-3.5">
                          <p className="font-semibold text-slate-100">{record.pejabat_pengganti}</p>
                          {record.pejabat_pengganti_nip && (
                            <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                              NIP {record.pejabat_pengganti_nip}
                            </p>
                          )}
                        </td>
                        <td className="max-w-56 whitespace-normal px-4 py-3.5 text-xs leading-relaxed text-slate-300">
                          {record.jabatan_definitif_pengganti}
                        </td>
                        <td className="max-w-48 whitespace-normal px-4 py-3.5 font-mono text-xs text-slate-300">
                          {record.nomor_surat}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-300">
                          {formatDate(record.tmt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <span className="inline-flex rounded-md border border-slate-700/80 bg-slate-800/60 px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-slate-200">
                            {record.masa_kerja}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyle.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                            {record.status}
                          </span>
                        </td>
                        {canManageRecords && (
                          <td className="px-4 py-3.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                title="Edit record"
                                aria-label={`Edit record ${record.id}`}
                                onClick={() => startEditing(record)}
                                className="rounded-lg p-2 text-sky-300 transition hover:bg-sky-500/15 focus:outline-none focus:ring-2 focus:ring-sky-400"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16.862 4.487l2.651 2.651M4 20l4.5-1 11-11a1.875 1.875 0 00-2.65-2.65l-11 11L4 20z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                title={record.is_active ? 'Deaktivasi record' : 'Aktifkan record'}
                                aria-label={`${record.is_active ? 'Deaktivasi' : 'Aktifkan'} record ${record.id}`}
                                onClick={() => {
                                  setPendingAction({ kind: 'active', record, nextActive: !record.is_active });
                                  setActionError(null);
                                }}
                                className={`rounded-lg p-2 transition focus:outline-none focus:ring-2 ${
                                  record.is_active
                                    ? 'text-amber-300 hover:bg-amber-500/15 focus:ring-amber-400'
                                    : 'text-emerald-300 hover:bg-emerald-500/15 focus:ring-emerald-400'
                                }`}
                              >
                                {record.is_active ? (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v9m6.36-6.36a9 9 0 11-12.72 0" />
                                  </svg>
                                ) : (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 12l4 4L19 6" />
                                  </svg>
                                )}
                              </button>
                              <button
                                type="button"
                                title="Hapus record"
                                aria-label={`Hapus record ${record.id}`}
                                onClick={() => {
                                  setPendingAction({ kind: 'delete', record });
                                  setActionError(null);
                                }}
                                className="rounded-lg p-2 text-rose-300 transition hover:bg-rose-500/15 focus:outline-none focus:ring-2 focus:ring-rose-400"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ADD / EDIT MONITORING MODAL */}
        {isFormOpen && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-xs"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !isSaving) resetForm();
            }}
          >
            <section
              className="plt-modal my-auto w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="plt-plh-form-title"
            >
              <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h2 id="plt-plh-form-title" className="text-lg font-bold">
                    {editingRecordId === null ? 'Tambah Monitoring Plt./Plh.' : 'Edit Monitoring Plt./Plh.'}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Masa Kerja dan Status 6 bulan dihitung otomatis berdasarkan TMT.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isSaving}
                  aria-label="Tutup form"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-700 text-slate-400 transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-50"
                >
                  ×
                </button>
              </div>

              {actionError && (
                <div role="alert" className="mb-4 rounded-xl border border-rose-700/60 bg-rose-900/30 px-4 py-3 text-sm text-rose-200">
                  {actionError}
                </div>
              )}

              <form onSubmit={(event) => void submitRecord(event)} className="grid gap-4 md:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Jabatan Kosong
                  <input
                    required
                    maxLength={2000}
                    placeholder="Nama jabatan yang dirangkap"
                    value={fields.jabatan_kosong}
                    onChange={(event) => setFields({ ...fields, jabatan_kosong: event.target.value })}
                    className="input mt-1.5 normal-case"
                  />
                </label>

                <div
                  className="relative"
                  onBlur={(event) => {
                    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
                      setIsEmployeeSearchActive(false);
                    }
                  }}
                >
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Pejabat Pengganti
                    <input
                      required
                      maxLength={2000}
                      placeholder="Ketik nama atau NIP dari PBN Open..."
                      role="combobox"
                      aria-autocomplete="list"
                      aria-haspopup="listbox"
                      aria-expanded={isEmployeeSearchActive && employeeSearchQuery.trim().length >= 2}
                      aria-controls="plt-plh-employee-options"
                      aria-activedescendant={activeEmployeeIndex >= 0
                        ? `plt-plh-employee-option-${activeEmployeeIndex}`
                        : undefined}
                      autoComplete="off"
                      value={employeeSearchQuery}
                      onFocus={() => setIsEmployeeSearchActive(true)}
                      onChange={(event) => {
                        const value = event.target.value;
                        setEmployeeSearchQuery(value);
                        setIsEmployeeSearchActive(true);
                        setActiveEmployeeIndex(-1);
                        setFields((current) => ({
                          ...current,
                          pejabat_pengganti: value,
                          pejabat_pengganti_nip: null,
                          jabatan_definitif_pengganti: '',
                        }));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown' && employeeOptions.length > 0) {
                          event.preventDefault();
                          setActiveEmployeeIndex((current) => (current + 1) % employeeOptions.length);
                        } else if (event.key === 'ArrowUp' && employeeOptions.length > 0) {
                          event.preventDefault();
                          setActiveEmployeeIndex((current) => (
                            current <= 0 ? employeeOptions.length - 1 : current - 1
                          ));
                        } else if (event.key === 'Enter' && activeEmployeeIndex >= 0) {
                          event.preventDefault();
                          const employee = employeeOptions[activeEmployeeIndex];
                          if (employee) selectEmployee(employee);
                        } else if (event.key === 'Escape') {
                          setIsEmployeeSearchActive(false);
                        }
                      }}
                      className="input mt-1.5 normal-case"
                    />
                  </label>
                  {fields.pejabat_pengganti_nip && (
                    <p className="mt-1 font-mono text-xs text-emerald-300">
                      ✓ NIP terpilih: {fields.pejabat_pengganti_nip}
                    </p>
                  )}
                  {isEmployeeSearchActive && employeeSearchQuery.trim().length >= 2 && (
                    <ul
                      id="plt-plh-employee-options"
                      role="listbox"
                      aria-label="Hasil pencarian Pejabat Pengganti"
                      className="plt-modal absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl"
                    >
                      {isSearchingEmployees ? (
                        <li className="px-3 py-2 text-sm text-slate-400">Mencari pegawai…</li>
                      ) : employeeSearchError ? (
                        <li role="alert" className="px-3 py-2 text-sm text-rose-300">{employeeSearchError}</li>
                      ) : employeeOptions.length > 0 ? (
                        employeeOptions.map((employee, index) => (
                          <li key={employee.nip}>
                            <button
                              id={`plt-plh-employee-option-${index}`}
                              type="button"
                              role="option"
                              aria-selected={activeEmployeeIndex === index}
                              onClick={() => selectEmployee(employee)}
                              className={`w-full rounded-lg px-3 py-2 text-left transition ${
                                activeEmployeeIndex === index
                                  ? 'bg-sky-500/15 text-sky-200'
                                  : 'hover:bg-slate-800'
                              }`}
                            >
                              <span className="block text-sm font-medium text-slate-100">
                                {employee.nama} · <span className="font-mono text-xs text-slate-400">{employee.nip}</span>
                              </span>
                              <span className="mt-0.5 block text-xs text-slate-400">
                                {employee.jabatan_definitif_pengganti || 'Jabatan/unit belum tersedia'}
                              </span>
                            </button>
                          </li>
                        ))
                      ) : (
                        <li className="px-3 py-2 text-sm text-slate-400">Pegawai tidak ditemukan.</li>
                      )}
                    </ul>
                  )}
                </div>

                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 md:col-span-2">
                  Jabatan Definitif Pengganti
                  <span className="mt-0.5 block text-[11px] font-normal normal-case text-slate-400">
                    Terisi otomatis dari database saat pejabat dipilih; masih dapat disesuaikan secara manual.
                  </span>
                  <input
                    required
                    maxLength={2000}
                    value={fields.jabatan_definitif_pengganti}
                    onChange={(event) => setFields({ ...fields, jabatan_definitif_pengganti: event.target.value })}
                    className="input mt-1.5 normal-case"
                  />
                </label>

                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Nomor Surat
                  <input
                    required
                    maxLength={2000}
                    placeholder="Contoh: PRIN-123/PB/2026"
                    value={fields.nomor_surat}
                    onChange={(event) => setFields({ ...fields, nomor_surat: event.target.value })}
                    className="input mt-1.5 normal-case"
                  />
                </label>

                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  TMT (Terhitung Mulai Tanggal)
                  <input
                    required
                    type="date"
                    max={todayForDateInput()}
                    value={fields.tmt}
                    onChange={(event) => setFields({ ...fields, tmt: event.target.value })}
                    className="input mt-1.5 normal-case"
                  />
                </label>

                <div className="mt-2 flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-800 pt-4 md:col-span-2">
                  <button type="button" onClick={resetForm} disabled={isSaving} className="btn-secondary">
                    Batal
                  </button>
                  <button type="submit" disabled={isSaving} className="btn-primary">
                    {isSaving ? <Spinner size="sm" label="Menyimpan…" /> : editingRecordId === null ? 'Tambah Record' : 'Simpan Perubahan'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </main>

      {/* ROADMAP DIALOG */}
      {isDevelopmentDialogOpen && (
        <div
          className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsDevelopmentDialogOpen(false);
          }}
        >
          <section
            className="plt-modal w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plt-plh-development-title"
          >
            <span className="mx-auto mb-3 inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
              Planned for v2.0
            </span>
            <h2 id="plt-plh-development-title" className="text-lg font-bold text-white">
              On development
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Fitur pembuatan otomatis Mekanisme Plt. & PRIN Plt. sedang disiapkan untuk rilis berikutnya.
            </p>
            <button
              type="button"
              onClick={() => setIsDevelopmentDialogOpen(false)}
              className="btn-secondary mt-5"
              autoFocus
            >
              Tutup
            </button>
          </section>
        </div>
      )}

      {/* CONFIRMATION DIALOG */}
      {pendingAction && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingAction(null);
          }}
        >
          <section
            className="plt-modal w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plt-plh-confirm-title"
          >
            <h2 id="plt-plh-confirm-title" className="text-lg font-bold">
              {pendingAction.kind === 'delete'
                ? 'Hapus monitoring record?'
                : pendingAction.nextActive
                  ? 'Aktifkan record?'
                  : 'Deaktivasi record?'}
            </h2>
            <p className="plt-subpanel mt-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">
              <span className="font-semibold text-slate-100">{pendingAction.record.pejabat_pengganti}</span>
              <span className="block text-xs text-slate-400">{pendingAction.record.jabatan_kosong}</span>
            </p>
            <form onSubmit={(event) => void runPendingAction(event)} className="mt-5 flex justify-end gap-2.5">
              <button type="button" onClick={() => setPendingAction(null)} disabled={isSaving} className="btn-secondary">
                Batal
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className={pendingAction.kind === 'delete' ? 'btn-danger' : 'btn-primary'}
              >
                {isSaving ? 'Memproses…' : 'Konfirmasi'}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}