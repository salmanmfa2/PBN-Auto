import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import * as apiClient from '../services/api';
import { useAuth } from '../contexts/AuthContext';
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

function statusClass(status: PltPlhMonitoringRecord['status']): string {
  switch (status) {
    case 'Inaktif':
      return 'border-slate-600 bg-slate-700/60 text-slate-300';
    case 'Aktif':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'Mendekati 6 Bulan':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'Lebih dari 6 Bulan':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
  }
}

export default function PltPlhManagementPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManageRecords = (user?.auth_level ?? 0) >= 2;
  const [records, setRecords] = useState<PltPlhMonitoringRecord[]>([]);
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

  const notifications = records.filter((record) =>
    record.status === 'Mendekati 6 Bulan' || record.status === 'Lebih dari 6 Bulan');

  return (
    <div className="min-h-screen bg-surface-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-700 bg-surface-800 px-5 pb-4 pt-[4.5rem] xl:pr-[360px] xl:pt-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
          >
            Menu
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2zM8 7h8M8 11h8" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold">Manajemen Plt./Plh.</h1>
            <p className="text-xs text-slate-500">Monitoring pejabat pelaksana tugas dan harian</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{records.length} data</span>
          <div className="relative" ref={ndMenuRef}>
            <button
              type="button"
              onClick={() => setIsNdMenuOpen((isOpen) => !isOpen)}
              aria-haspopup="menu"
              aria-expanded={isNdMenuOpen}
              className="btn-secondary"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 3.75h7l4.25 4.5v12A.75.75 0 0117.5 21h-10a.75.75 0 01-.75-.75v-16A.75.75 0 017.5 3.5h6.25M14 3.75v4.5h4.25M9 12h6m-6 3.5h6" />
              </svg>
              Susun ND Plt.
              <svg className={`h-3.5 w-3.5 transition-transform ${isNdMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isNdMenuOpen && (
              <div
                role="menu"
                aria-label="Pilihan Susun ND Plt."
                className="absolute right-0 z-30 mt-2 min-w-48 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl"
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
                    className="block w-full px-4 py-2.5 text-left text-sm text-slate-200 transition hover:bg-slate-800 focus:bg-slate-800 focus:outline-none"
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
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
              className="btn-primary p-2.5"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14" />
              </svg>
            </button>
          )}
          <button
            type="button"
            title={isExporting ? 'Mengekspor Excel…' : 'Export Excel'}
            aria-label={isExporting ? 'Mengekspor Excel' : 'Export Excel'}
            aria-busy={isExporting}
            onClick={() => void exportRecords()}
            disabled={isExporting}
            className="btn-secondary p-2.5"
          >
            {isExporting ? (
              <Spinner size="sm" label="Mengekspor…" />
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 3.75h7l4.25 4.5v5.25M14 3.75v4.5h4.25M8 12H5.75A1.75 1.75 0 004 13.75v5.5C4 20.216 4.784 21 5.75 21h7.5A1.75 1.75 0 0015 19.25V17m-3-3l3 3 3-3m-3 3V9" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16h.01M10 16h.01M7 18.5h.01M10 18.5h.01" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl space-y-5 p-4 md:p-6">
        {notifications.length > 0 && (
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4" aria-live="polite">
            <h2 className="font-semibold text-amber-200">Perlu perhatian ({notifications.length})</h2>
            <ul className="mt-2 space-y-1 text-sm text-amber-100/90">
              {notifications.map((record) => (
                <li key={record.id}>
                  {record.pejabat_pengganti} — {record.jabatan_kosong}: {record.status} ({record.masa_kerja})
                </li>
              ))}
            </ul>
          </section>
        )}

        {loadError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-700/60 bg-rose-900/30 px-4 py-3 text-sm text-rose-200">
            <span>Gagal memuat data: {loadError}</span>
            <button type="button" onClick={() => void refreshRecords()} className="btn-secondary">Coba lagi</button>
          </div>
        )}
        {actionError && (
          <div role="alert" className="rounded-lg border border-rose-700/60 bg-rose-900/30 px-4 py-3 text-sm text-rose-200">
            {actionError}
          </div>
        )}

        <section className="card overflow-hidden">
          <div className="border-b border-slate-700 px-5 py-4">
            <h2 className="font-semibold">Monitoring Record</h2>
          </div>
          {isLoading ? (
            <div className="flex justify-center p-10"><Spinner label="Memuat data…" /></div>
          ) : records.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-400">Belum ada data monitoring.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3">No.</th>
                    <th className="px-4 py-3">Jabatan Kosong</th>
                    <th className="px-4 py-3">Pejabat Pengganti</th>
                    <th className="px-4 py-3">Jabatan Definitif Pengganti</th>
                    <th className="px-4 py-3">Nomor Surat</th>
                    <th className="px-4 py-3">TMT</th>
                    <th className="px-4 py-3">Masa Kerja</th>
                    <th className="px-4 py-3">Status</th>
                    {canManageRecords && <th className="px-4 py-3">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {records.map((record, index) => (
                    <tr key={record.id} className={record.is_active ? 'hover:bg-slate-800/50' : 'bg-slate-900/40 text-slate-500'}>
                      <td className="px-4 py-3 tabular-nums">{index + 1}</td>
                      <td className="max-w-56 whitespace-normal px-4 py-3">{record.jabatan_kosong}</td>
                      <td className="max-w-48 whitespace-normal px-4 py-3">{record.pejabat_pengganti}</td>
                      <td className="max-w-56 whitespace-normal px-4 py-3">{record.jabatan_definitif_pengganti}</td>
                      <td className="max-w-48 whitespace-normal px-4 py-3">{record.nomor_surat}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatDate(record.tmt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{record.masa_kerja}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(record.status)}`}>
                          {record.status}
                        </span>
                      </td>
                      {canManageRecords && <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="Edit record"
                            aria-label={`Edit record ${record.id}`}
                            onClick={() => startEditing(record)}
                            className="rounded-md p-2 text-sky-300 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
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
                            className={`rounded-md p-2 hover:bg-slate-700 focus:outline-none focus:ring-2 ${
                              record.is_active
                                ? 'text-amber-300 focus:ring-amber-400'
                                : 'text-emerald-300 focus:ring-emerald-400'
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
                            className="rounded-md p-2 text-rose-300 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-400"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3" />
                            </svg>
                          </button>
                        </div>
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {isFormOpen && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !isSaving) resetForm();
            }}
          >
            <section
              className="my-auto w-full max-w-3xl rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="plt-plh-form-title"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 id="plt-plh-form-title" className="text-base font-semibold">
                    {editingRecordId === null ? 'Tambah Monitoring' : 'Edit Monitoring'}
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">Masa Kerja dan Status dihitung otomatis dari TMT.</p>
                </div>
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isSaving}
                  aria-label="Tutup form"
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-50"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {actionError && (
                <div role="alert" className="mb-4 rounded-lg border border-rose-700/60 bg-rose-900/30 px-4 py-3 text-sm text-rose-200">
                  {actionError}
                </div>
              )}
              <form onSubmit={(event) => void submitRecord(event)} className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-300">
              Jabatan Kosong
              <input
                required
                maxLength={2000}
                value={fields.jabatan_kosong}
                onChange={(event) => setFields({ ...fields, jabatan_kosong: event.target.value })}
                className="input mt-1.5"
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
              <label className="text-sm text-slate-300">
                Pejabat Pengganti
                <input
                  required
                  maxLength={2000}
                  placeholder="Cari nama atau NIP"
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
                  className="input mt-1.5"
                />
              </label>
              {fields.pejabat_pengganti_nip && (
                <p className="mt-1 text-xs text-slate-500">NIP terpilih: {fields.pejabat_pengganti_nip}</p>
              )}
              {isEmployeeSearchActive && employeeSearchQuery.trim().length >= 2 && (
                <ul
                  id="plt-plh-employee-options"
                  role="listbox"
                  aria-label="Hasil pencarian Pejabat Pengganti"
                  className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl"
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
                          className={`w-full rounded-md px-3 py-2 text-left transition ${
                            activeEmployeeIndex === index
                              ? 'bg-slate-800'
                              : 'hover:bg-slate-800'
                          }`}
                        >
                          <span className="block text-sm text-slate-100">{employee.nama} · {employee.nip}</span>
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
            <label className="text-sm text-slate-300">
              Jabatan Definitif Pengganti
              <span className="mt-1 block text-xs text-slate-500">
                Terisi dari database saat pejabat dipilih; masih dapat disesuaikan.
              </span>
              <input
                required
                maxLength={2000}
                value={fields.jabatan_definitif_pengganti}
                onChange={(event) => setFields({ ...fields, jabatan_definitif_pengganti: event.target.value })}
                className="input mt-1.5"
              />
            </label>
            <label className="text-sm text-slate-300">
              Nomor Surat
              <input
                required
                maxLength={2000}
                value={fields.nomor_surat}
                onChange={(event) => setFields({ ...fields, nomor_surat: event.target.value })}
                className="input mt-1.5"
              />
            </label>
            <label className="text-sm text-slate-300">
              TMT
              <input
                required
                type="date"
                max={todayForDateInput()}
                value={fields.tmt}
                onChange={(event) => setFields({ ...fields, tmt: event.target.value })}
                className="input mt-1.5"
              />
            </label>
            <div className="flex flex-wrap items-center justify-end gap-2 md:col-span-2">
              <button type="button" onClick={resetForm} disabled={isSaving} className="btn-secondary">Batal</button>
              <button type="submit" disabled={isSaving} className="btn-primary">
                {isSaving ? <Spinner size="sm" label="Menyimpan…" /> : editingRecordId === null ? 'Tambah Record' : 'Simpan Perubahan'}
              </button>
            </div>
              </form>
            </section>
          </div>
        )}

      </main>

      {isDevelopmentDialogOpen && (
        <div
          className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/75 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsDevelopmentDialogOpen(false);
          }}
        >
          <section
            className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-6 text-center shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plt-plh-development-title"
          >
            <h2 id="plt-plh-development-title" className="text-lg font-semibold text-white">
              On development
            </h2>
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

      {pendingAction && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingAction(null);
          }}
        >
          <section
            className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plt-plh-confirm-title"
          >
            <h2 id="plt-plh-confirm-title" className="text-lg font-semibold">
              {pendingAction.kind === 'delete' ? 'Hapus monitoring record?' : pendingAction.nextActive ? 'Aktifkan record?' : 'Deaktivasi record?'}
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              {pendingAction.record.pejabat_pengganti} — {pendingAction.record.jabatan_kosong}
            </p>
            <form onSubmit={(event) => void runPendingAction(event)} className="mt-4 space-y-4">
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setPendingAction(null)} disabled={isSaving} className="btn-secondary">Batal</button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className={pendingAction.kind === 'delete' ? 'btn-danger' : 'btn-primary'}
                >
                  {isSaving ? 'Memproses…' : 'Konfirmasi'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
