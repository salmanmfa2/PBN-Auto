import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMenuAccess } from '../contexts/MenuAccessContext';
import * as apiClient from '../services/api';
import type {
  PelantikanAgendaDetail,
  PelantikanAgendaFields,
  PelantikanAgendaPerson,
  PelantikanAgendaSummary,
  PelantikanImportStrategy,
  PelantikanModality,
  PelantikanPersonChoice,
  PelantikanWorkflowMode,
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
type MatchingFilter = 'all' | 'matched' | 'duplicate' | 'not_found' | 'missing_nip' | 'pendamping';
type ModalityFilter = 'all' | 'daring' | 'luring' | 'unselected';
type DocumentPreviewGroup = {
  key: string;
  unit: string;
  unitKerjaId: number | null;
  sourceSheet: string | null;
  people: PelantikanAgendaPerson[];
  modalityCounts: Record<PelantikanModality, number>;
};
type DownloadableDocumentGroup = {
  key: string;
  unit: string;
  modality: PelantikanModality;
  personIds: number[];
  count: number;
};
const rosterColumnWidths = {
  select: 72,
  number: 72,
  source: 140,
  sourceName: 200,
  sourcePosition: 190,
  proposedPosition: 190,
  nip: 130,
  name: 190,
  databasePosition: 220,
  unit: 220,
  city: 110,
  matching: 180,
  modality: 176,
} as const;
type RosterColumnKey = keyof typeof rosterColumnWidths;
type RosterColumnWidths = Record<RosterColumnKey, number>;
const rosterColumnKeys = Object.keys(rosterColumnWidths) as RosterColumnKey[];
const rosterColumnMinWidths: RosterColumnWidths = {
  select: 56,
  number: 56,
  source: 80,
  sourceName: 90,
  sourcePosition: 100,
  proposedPosition: 100,
  nip: 120,
  name: 90,
  databasePosition: 100,
  unit: 100,
  city: 64,
  matching: 176,
  modality: 176,
};
const liteRosterColumns = new Set<RosterColumnKey>([
  'select',
  'number',
  'sourceName',
  'sourcePosition',
  'proposedPosition',
  'city',
  'matching',
  'modality',
]);
const liteColumnExpansionWeights: Partial<Record<RosterColumnKey, number>> = {
  sourceName: 0.2,
  sourcePosition: 0.4,
  proposedPosition: 0.4,
};
const rosterColumnWidthsStorageKey = 'pbn.pelantikan.roster-column-widths';
const maxRosterColumnWidth = 640;

function isRosterColumnWidths(value: unknown): value is RosterColumnWidths {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const widths = value as Partial<Record<RosterColumnKey, unknown>>;
  return rosterColumnKeys.every((key) => {
    const width = widths[key];
    return typeof width === 'number'
      && Number.isFinite(width)
      && width >= rosterColumnMinWidths[key]
      && width <= maxRosterColumnWidth;
  });
}

function getBaseColumnWidth(
  column: RosterColumnKey,
  desiredDisplayWidth: number,
  widths: RosterColumnWidths,
  visibleColumns: RosterColumnKey[],
  containerWidth: number,
  isLiteView: boolean,
): number {
  const expansionWeight = isLiteView ? liteColumnExpansionWeights[column] : undefined;
  const baseTableWidth = visibleColumns.reduce((total, key) => total + widths[key], 0);
  const extraWidth = containerWidth - baseTableWidth;
  if (!expansionWeight || extraWidth <= 0) return desiredDisplayWidth;

  const otherColumnsWidth = baseTableWidth - widths[column];
  const widthAtFullTableBoundary = containerWidth - otherColumnsWidth;
  if (desiredDisplayWidth >= widthAtFullTableBoundary) return desiredDisplayWidth;

  return (
    desiredDisplayWidth - expansionWeight * widthAtFullTableBoundary
  ) / (1 - expansionWeight);
}

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
  return ['matched', 'duplicate'].includes(person.lookup_status)
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

function daysUntilPelantikan(value: string): number {
  let todayYear = 0;
  let todayMonth = 0;
  let todayDay = 0;
  const todayParts = new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
  }).formatToParts(new Date());

  for (const part of todayParts) {
    if (part.type === 'year') todayYear = Number(part.value);
    if (part.type === 'month') todayMonth = Number(part.value);
    if (part.type === 'day') todayDay = Number(part.value);
  }

  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const targetDate = Date.UTC(year, month - 1, day);
  const jakartaToday = Date.UTC(todayYear, todayMonth - 1, todayDay);
  return Math.round((targetDate - jakartaToday) / 86_400_000);
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

export default function PelantikanAgendaPage({
  workflowMode = 'all_sheets',
}: {
  workflowMode?: PelantikanWorkflowMode;
}) {
  const { agendaId } = useParams<{ agendaId: string }>();
  const navigate = useNavigate();
  const agendaBasePath = '/undangan-pelantikan';
  const { user, logout } = useAuth();
  const { canEdit } = useMenuAccess();
  const canEditAgenda = canEdit('nd-undangan');
  const [agendas, setAgendas] = useState<PelantikanAgendaSummary[]>([]);
  const [agenda, setAgenda] = useState<PelantikanAgendaDetail | null>(null);
  const [fields, setFields] = useState(emptyFields);
  const [choices, setChoices] = useState<ChoiceState>({});
  const [excludedDocumentKeys, setExcludedDocumentKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [choicesDirty, setChoicesDirty] = useState(false);
  const [isLiteView, setIsLiteView] = useState(false);
  const [matchingFilter, setMatchingFilter] = useState<MatchingFilter>('all');
  const [modalityFilter, setModalityFilter] = useState<ModalityFilter>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingAppendix, setIsGeneratingAppendix] = useState(false);
  const [isExportingMonitoring, setIsExportingMonitoring] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingAgenda, setIsEditingAgenda] = useState(false);
  const [deletingHistoryAgendaId, setDeletingHistoryAgendaId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [importStrategy, setImportStrategy] = useState<PelantikanImportStrategy>('all_sheets');
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [columnWidthError, setColumnWidthError] = useState<string | null>(null);
  const [columnWidths, setColumnWidths] = useState<RosterColumnWidths>(() => ({ ...rosterColumnWidths }));
  const [rosterTableElement, setRosterTableElement] = useState<HTMLDivElement | null>(null);
  const [rosterTableContainerWidth, setRosterTableContainerWidth] = useState(0);
  const columnWidthsRef = useRef<RosterColumnWidths>({ ...rosterColumnWidths });
  const columnResizeRef = useRef<{
    column: RosterColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);
  const activeWorkflowMode = agenda?.workflow_mode ?? workflowMode;
  const visibleRosterColumnKeys = useMemo(
    () => rosterColumnKeys.filter((key) => !isLiteView || liteRosterColumns.has(key)),
    [isLiteView],
  );
  const visibleRosterColumnWidths = useMemo(() => {
    const widths = { ...columnWidths };
    if (!isLiteView || rosterTableContainerWidth <= 0) return widths;

    const baseWidth = visibleRosterColumnKeys.reduce(
      (total, key) => total + columnWidths[key],
      0,
    );
    const extraWidth = Math.max(0, rosterTableContainerWidth - baseWidth);
    widths.sourceName += extraWidth * 0.2;
    widths.sourcePosition += extraWidth * 0.4;
    widths.proposedPosition += (
      extraWidth
      - extraWidth * 0.2
      - extraWidth * 0.4
    );
    return widths;
  }, [columnWidths, isLiteView, rosterTableContainerWidth, visibleRosterColumnKeys]);
  const visibleRosterTableWidth = visibleRosterColumnKeys.reduce(
    (total, key) => total + visibleRosterColumnWidths[key],
    0,
  );

  useEffect(() => {
    if (!rosterTableElement) return;
    const updateWidth = () => setRosterTableContainerWidth(rosterTableElement.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(rosterTableElement);
    return () => observer.disconnect();
  }, [rosterTableElement]);

  useEffect(() => {
    try {
      const storedWidths = window.localStorage.getItem(rosterColumnWidthsStorageKey);
      if (!storedWidths) return;
      const parsed: unknown = JSON.parse(storedWidths);
      if (!isRosterColumnWidths(parsed)) {
        throw new Error('Format lebar kolom tidak valid.');
      }
      columnWidthsRef.current = parsed;
      setColumnWidths(parsed);
    } catch (storageError) {
      setColumnWidthError(
        `Lebar kolom tersimpan tidak dapat dimuat: ${
          storageError instanceof Error ? storageError.message : String(storageError)
        }`,
      );
    }
  }, []);

  const persistColumnWidths = (widths: RosterColumnWidths) => {
    try {
      window.localStorage.setItem(rosterColumnWidthsStorageKey, JSON.stringify(widths));
      setColumnWidthError(null);
    } catch (storageError) {
      setColumnWidthError(
        `Lebar kolom tidak dapat disimpan: ${
          storageError instanceof Error ? storageError.message : String(storageError)
        }`,
      );
    }
  };

  const startColumnResize = (
    column: RosterColumnKey,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    columnResizeRef.current = {
      column,
      startX: event.clientX,
      startWidth: visibleRosterColumnWidths[column],
    };
  };

  const moveColumnResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = columnResizeRef.current;
    if (!resize) return;
    const desiredDisplayWidth = resize.startWidth + event.clientX - resize.startX;
    const baseWidth = getBaseColumnWidth(
      resize.column,
      desiredDisplayWidth,
      columnWidthsRef.current,
      visibleRosterColumnKeys,
      rosterTableContainerWidth,
      isLiteView,
    );
    const width = Math.min(
      maxRosterColumnWidth,
      Math.max(
        rosterColumnMinWidths[resize.column],
        Math.round(baseWidth),
      ),
    );
    const nextWidths = { ...columnWidthsRef.current, [resize.column]: width };
    columnWidthsRef.current = nextWidths;
    setColumnWidths(nextWidths);
  };

  const finishColumnResize = () => {
    if (!columnResizeRef.current) return;
    columnResizeRef.current = null;
    persistColumnWidths(columnWidthsRef.current);
  };

  const handleColumnResizeKeyDown = (
    column: RosterColumnKey,
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 12 : -12;
    const baseWidth = getBaseColumnWidth(
      column,
      visibleRosterColumnWidths[column] + delta,
      columnWidthsRef.current,
      visibleRosterColumnKeys,
      rosterTableContainerWidth,
      isLiteView,
    );
    const width = Math.min(
      maxRosterColumnWidth,
      Math.max(rosterColumnMinWidths[column], Math.round(baseWidth)),
    );
    const nextWidths = { ...columnWidthsRef.current, [column]: width };
    columnWidthsRef.current = nextWidths;
    setColumnWidths(nextWidths);
    persistColumnWidths(nextWidths);
  };

  const columnResizeHandle = (column: RosterColumnKey, label: string) => (
    <div
      role="separator"
      aria-label={`Ubah lebar kolom ${label}`}
      aria-orientation="vertical"
      aria-valuemin={rosterColumnMinWidths[column]}
      aria-valuemax={Math.max(
        maxRosterColumnWidth,
        Math.round(visibleRosterColumnWidths[column]),
      )}
      aria-valuenow={Math.round(visibleRosterColumnWidths[column])}
      tabIndex={0}
      title={`Tarik untuk mengubah lebar kolom ${label}; gunakan tombol panah kiri/kanan.`}
      onPointerDown={(event) => startColumnResize(column, event)}
      onPointerMove={moveColumnResize}
      onPointerUp={finishColumnResize}
      onPointerCancel={finishColumnResize}
      onLostPointerCapture={finishColumnResize}
      onKeyDown={(event) => handleColumnResizeKeyDown(column, event)}
      className="absolute right-0 top-0 z-10 h-full w-2 touch-none cursor-col-resize border-r-2 border-transparent hover:border-brand-400 focus-visible:border-brand-400 focus-visible:outline-none"
    />
  );

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
        setExcludedDocumentKeys(new Set());
        setImportStrategy(loadedAgenda.import_strategy);
        setChoicesDirty(loadedAgenda.people.some((person) => isPendamping(person) && person.selected));
        setIsEditingAgenda(false);
      } else {
        const loadedAgendas = await apiClient.listPelantikanAgendas();
        if (!active()) return;
        setAgendas(loadedAgendas);
        setAgenda(null);
        setImportStrategy('all_sheets');
        setIsEditingAgenda(false);
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
  const visiblePeople = useMemo(
    () => (agenda?.people ?? []).filter((person) => {
      const choice = choices[person.id] ?? { selected: false, modality: null };
      if (matchingFilter === 'pendamping') {
        if (!isPendamping(person)) return false;
      } else if (
        matchingFilter !== 'all'
        && (isPendamping(person) || person.lookup_status !== matchingFilter)
      ) {
        return false;
      }

      if (modalityFilter === 'unselected') return !choice.selected;
      if (modalityFilter !== 'all') {
        return choice.selected && choice.modality === modalityFilter;
      }
      return true;
    }),
    [agenda?.people, choices, matchingFilter, modalityFilter],
  );
  const selectableCount = visiblePeople.filter(isSelectablePerson).length;
  const selectedSelectableCount = visiblePeople.filter(
    (person) => isSelectablePerson(person) && choices[person.id]?.selected,
  ).length;
  const previewGroups = useMemo(() => {
    const groups = new Map<string, DocumentPreviewGroup>();
    const isolateSheets = agenda?.workflow_mode === 'all_sheets'
      && agenda.import_strategy === 'isolated_sheets';
    for (const person of agenda?.people ?? []) {
      const choice = choices[person.id];
      if (!choice?.selected || !choice.modality || !isSelectablePerson(person)) continue;
      const unit = person.unit_eselon_ii.trim();
      const sourceSheet = isolateSheets ? person.source_sheet ?? 'Sheet' : null;
      const key = `${sourceSheet ?? ''}\u0000${unit.toLowerCase()}`;
      const group = groups.get(key);
      if (group) {
        group.people.push(person);
        group.modalityCounts[choice.modality] += 1;
      } else {
        groups.set(key, {
          key,
          unit,
          unitKerjaId: person.unit_kerja_id,
          sourceSheet,
          people: [person],
          modalityCounts: {
            daring: choice.modality === 'daring' ? 1 : 0,
            luring: choice.modality === 'luring' ? 1 : 0,
          },
        });
      }
    }
    return Array.from(groups.values()).sort((left, right) => (
      (left.unitKerjaId ?? Number.MAX_SAFE_INTEGER)
        - (right.unitKerjaId ?? Number.MAX_SAFE_INTEGER)
      || left.unit.localeCompare(right.unit, 'id')
      || (left.sourceSheet ?? '').localeCompare(right.sourceSheet ?? '', 'id')
    ));
  }, [agenda?.import_strategy, agenda?.people, agenda?.workflow_mode, choices]);
  const downloadableDocumentGroups = useMemo(() => {
    const groups: DownloadableDocumentGroup[] = [];
    for (const group of previewGroups) {
      for (const modality of ['daring', 'luring'] as const) {
        const people = group.people.filter(
          (person) => choices[person.id]?.modality === modality,
        );
        if (people.length === 0) continue;
        groups.push({
          key: `${group.key}\u0000${modality}`,
          unit: group.unit,
          modality,
          personIds: people.map((person) => person.id),
          count: people.length,
        });
      }
    }
    return groups;
  }, [choices, previewGroups]);
  const selectedDownloadGroups = downloadableDocumentGroups.filter(
    (group) => !excludedDocumentKeys.has(group.key),
  );
  const selectedDownloadPersonIds = selectedDownloadGroups.flatMap(
    (group) => group.personIds,
  );
  const matchedCount = agenda?.people.filter((person) => person.lookup_status === 'matched').length ?? 0;
  const duplicateCount = agenda?.people.filter((person) => person.lookup_status === 'duplicate').length ?? 0;
  const unmatchedCount = (agenda?.people.length ?? 0) - matchedCount - duplicateCount;
  const visibleError = error ?? columnWidthError;

  const updateFields = (key: keyof PelantikanAgendaFields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
  };

  const createAgenda = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const created = await apiClient.createPelantikanAgenda(fields, workflowMode);
      setIsCreateModalOpen(false);
      navigate(`${agendaBasePath}/${created.id}`);
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
      setIsEditingAgenda(false);
      setNotice('Detail agenda berhasil disimpan.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const uploadWorkbook = async () => {
    if (!agendaId || !selectedFile || isEditingAgenda) return;
    setError(null);
    setNotice(null);
    setIsUploading(true);
    try {
      await apiClient.updatePelantikanAgenda(agendaId, fields);
      const result = activeWorkflowMode === 'all_sheets'
        ? await apiClient.uploadPelantikanExcelWithStrategy(
          agendaId,
          selectedFile,
          importStrategy,
          importStrategy === 'selected_sheets'
            ? availableSheets.filter((sheet) => selectedSheets.includes(sheet))
            : importStrategy === 'single_sheet' && selectedSheet
              ? [selectedSheet]
              : [],
        )
        : await apiClient.uploadPelantikanExcel(
          agendaId,
          selectedFile,
          selectedSheet || undefined,
        );
      const refreshed = await apiClient.getPelantikanAgenda(agendaId);
      setAgenda(refreshed);
      setChoices(choicesFromAgenda(refreshed));
      setExcludedDocumentKeys(new Set());
      setImportStrategy(refreshed.import_strategy);
      setChoicesDirty(false);
      const importedSheets = activeWorkflowMode === 'all_sheets'
        ? `${result.processed_sheets.length} sheet roster ${
          importStrategy === 'isolated_sheets' ? 'diproses terpisah' : 'diproses'
        } (${result.processed_sheets.join(', ')})`
        : `sheet “${result.selected_sheet}” diproses`;
      const duplicateNotice = result.duplicate_count
        ? ` ${result.duplicate_count} baris NIP duplikat ditandai; kemunculan pertama yang dapat dipilih.`
        : '';
      const skippedNotice = result.skipped_sheets.length
        ? ` Sheet dilewati: ${result.skipped_sheets.join(', ')}.`
        : '';
      setNotice(`${result.row_count} baris pegawai dari ${importedSheets}.${duplicateNotice}${skippedNotice}`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setIsUploading(false);
    }
  };

  const chooseWorkbookSheet = async (fileToInspect = selectedFile) => {
    if (!agendaId || !fileToInspect || isEditingAgenda) return;
    setError(null);
    setNotice(null);
    setAvailableSheets([]);
    setSelectedSheet('');
    setSelectedSheets([]);
    setIsLoadingSheets(true);
    try {
      const sheets = await apiClient.listPelantikanWorkbookSheets(agendaId, fileToInspect);
      setAvailableSheets(sheets);
      setSelectedSheet(
        activeWorkflowMode === 'single_sheet'
          ? sheets.length === 1 ? sheets[0] : ''
          : importStrategy === 'single_sheet' && sheets.length === 1
            ? sheets[0]
            : '',
      );
      setNotice(activeWorkflowMode === 'all_sheets'
        ? `${sheets.length} sheet ditemukan. ${
          importStrategy === 'isolated_sheets'
            ? 'Masing-masing akan diproses terpisah.'
            : importStrategy === 'selected_sheets'
              ? 'Pilih sheet yang ingin digabung.'
              : importStrategy === 'single_sheet'
                ? 'Pilih satu sheet untuk diproses.'
                : 'Semua sheet akan digabung.'
        }`
        : sheets.length === 1
          ? `Workbook memiliki satu sheet: “${sheets[0]}”.`
          : `Ditemukan ${sheets.length} sheet. Pilih sheet yang akan diproses.`);
    } catch (sheetError) {
      setAvailableSheets([]);
      setSelectedSheet('');
      setError(sheetError instanceof Error ? sheetError.message : String(sheetError));
    } finally {
      setIsLoadingSheets(false);
    }
  };

  const changeChoice = (
    personId: number,
    selected: boolean,
    modality?: PelantikanModality | null,
  ) => {
    const person = agenda?.people.find((item) => item.id === personId);
    if (selected && (!person || !isSelectablePerson(person))) return;
    const nip = person?.nip?.trim();
    if (
      selected
      && person
      && nip
      && agenda?.people.some((other) => (
        other.id !== personId
        && other.nip?.trim() === nip
        && choices[other.id]?.selected
      ))
    ) {
      window.alert('NIP yang sama sudah dipilih pada baris lain. Pilih salah satu baris saja.');
      return;
    }
    setChoices((current) => ({
      ...current,
      [personId]: {
        selected,
        modality: selected
          ? modality ?? current[personId]?.modality ?? 'daring'
          : current[personId]?.modality ?? null,
      },
    }));
    setChoicesDirty(true);
    setNotice(null);
  };

  const toggleDocumentDownload = (key: string) => {
    setExcludedDocumentKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAllSelectable = () => {
    if (!agenda) return;
    const next = { ...choices };
    let changed = false;
    let skippedDuplicateRows = 0;
    for (const person of visiblePeople) {
      if (!isSelectablePerson(person)) continue;
      const current = next[person.id] ?? { selected: false, modality: null };
      if (!current.selected) {
        const nip = person.nip?.trim();
        const duplicateAlreadySelected = Boolean(nip) && agenda.people.some((other) => (
          other.id !== person.id
          && other.nip?.trim() === nip
          && next[other.id]?.selected
        ));
        if (duplicateAlreadySelected) {
          skippedDuplicateRows += 1;
          continue;
        }
        next[person.id] = { selected: true, modality: current.modality ?? 'daring' };
        changed = true;
      }
    }
    if (changed) {
      setChoices(next);
      setChoicesDirty(true);
      setNotice(null);
    }
    if (skippedDuplicateRows > 0) {
      window.alert(
        `${skippedDuplicateRows} baris tidak dipilih karena NIP yang sama sudah dipilih. Pilih salah satu baris saja.`,
      );
    }
  };

  const deselectAllSelectable = () => {
    if (!agenda || selectedSelectableCount === 0) return;
    const next = { ...choices };
    for (const person of visiblePeople) {
      if (!isSelectablePerson(person) || !next[person.id]?.selected) continue;
      next[person.id] = { selected: false, modality: next[person.id]?.modality ?? null };
    }
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
        modality: choice.modality,
      }));
      const updated = await apiClient.savePelantikanPeople(agendaId, payload);
      setAgenda(updated);
      setChoices(choicesFromAgenda(updated));
      setExcludedDocumentKeys(new Set());
      setChoicesDirty(false);
      setNotice('Pilihan pegawai berhasil disimpan.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const generateDocuments = async () => {
    if (!agendaId || choicesDirty || selectedDownloadGroups.length === 0) return;
    setError(null);
    setNotice(null);
    setIsGenerating(true);
    try {
      const blob = await apiClient.generateSelectedPelantikanDocuments(
        agendaId,
        selectedDownloadPersonIds,
      );
      const isSingleDocx = blob.type
        === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const extension = isSingleDocx ? 'docx' : 'zip';
      apiClient.downloadPelantikanDocuments(
        blob,
        `undangan_pelantikan_${agenda?.tanggal_pelantikan}.${extension}`,
      );
      setIsPreviewOpen(false);
      setNotice(
        isSingleDocx
          ? 'Dokumen ND berhasil dibuat dan diunduh.'
          : 'Dokumen ND berhasil dibuat sebagai ZIP dan diunduh.',
      );
      const refreshed = await apiClient.getPelantikanAgenda(agendaId);
      setAgenda(refreshed);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : String(generationError));
    } finally {
      setIsGenerating(false);
    }
  };

  const generateAppendix = async () => {
    if (!agendaId || choicesDirty || isGeneratingAppendix) return;
    setError(null);
    setNotice(null);
    setIsGeneratingAppendix(true);
    try {
      const blob = await apiClient.generatePelantikanAppendix(agendaId);
      apiClient.downloadPelantikanAppendix(
        blob,
        `lampiran_nd_pengantar_${agenda?.tanggal_pelantikan}.docx`,
      );
      setNotice('Lampiran ND Pengantar berhasil dibuat dan diunduh.');
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : String(generationError));
    } finally {
      setIsGeneratingAppendix(false);
    }
  };

  const exportMonitoring = async () => {
    if (!agendaId || choicesDirty) return;
    setError(null);
    setIsExportingMonitoring(true);
    try {
      const blob = await apiClient.exportPelantikanMonitoring(agendaId);
      apiClient.downloadPelantikanMonitoring(
        blob,
        `monitoring_pelantikan_${agenda?.tanggal_pelantikan}.xlsx`,
      );
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setIsExportingMonitoring(false);
    }
  };

  const deleteAgenda = async () => {
    if (!agendaId || !window.confirm('Hapus agenda ini beserta riwayat pegawainya?')) return;
    setError(null);
    setIsDeleting(true);
    try {
      await apiClient.deletePelantikanAgenda(agendaId);
      navigate(agendaBasePath);
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

  const navigateBack = () => {
    if (agendaId) {
      if (isEditingAgenda && !window.confirm('Batalkan perubahan detail agenda yang belum disimpan?')) return;
      navigate(agendaBasePath);
      return;
    }
    navigate('/');
  };

  if (!user) {
    return (
      <main className="pelantikan-page min-h-screen bg-surface-950 px-4 pb-12 pt-28 text-slate-100">
        <section className="pel-panel mx-auto max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6">
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
      <main className="pelantikan-page min-h-screen bg-surface-950 px-4 pb-12 pt-28 text-slate-100">
        <section className="pel-panel mx-auto max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h1 className="text-xl font-semibold">Agenda tidak tersedia</h1>
          <p className="mt-2 text-sm text-slate-400">
            {error ?? 'Agenda tidak ditemukan atau bukan milik akun ini.'}
          </p>
          <button
            type="button"
            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            onClick={() => navigate(agendaBasePath)}
            aria-label="Kembali ke riwayat agenda"
            title="Kembali ke riwayat agenda"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
              <path d="M19 12H5m0 0 6 6m-6-6 6-6" />
            </svg>
            <span>Kembali ke riwayat agenda</span>
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="pelantikan-page relative isolate min-h-screen bg-surface-950 px-4 pb-14 pt-24 text-slate-100 sm:px-6 lg:pt-28">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_40%_at_50%_-5%,rgba(14,165,233,0.10),transparent)]"
        aria-hidden="true"
      />

      <div className="mx-auto w-full max-w-[1800px]">
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <button
              type="button"
              onClick={navigateBack}
              aria-label={agendaId ? 'Kembali ke riwayat agenda' : 'Kembali ke menu utama'}
              title={agendaId ? 'Kembali ke riwayat agenda' : 'Kembali ke menu utama'}
              className="mt-1 inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2 text-xs font-medium text-brand-300 transition hover:bg-slate-800 hover:text-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                <path d="M19 12H5m0 0 6 6m-6-6 6-6" />
              </svg>
              <span>{agendaId ? 'Riwayat agenda' : 'Menu utama'}</span>
            </button>

            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/15 text-brand-300">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5">
                <path d="M7 3h7l5 5v13H7z" />
                <path d="M14 3v5h5M10 13h6M10 17h4" />
              </svg>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
                Operasional
              </p>
              <h1 className="mt-0.5 text-2xl font-bold tracking-tight sm:text-3xl">
                Generate ND Undangan Pelantikan
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-400">
                {activeWorkflowMode === 'all_sheets'
                  ? 'Impor seluruh sheet roster dari workbook, periksa hasil pencocokan NIP dan sumber sheet, lalu pilih pegawai Daring atau Luring. Sheet kosong/tidak valid dilewati dengan pemberitahuan; dokumen tetap dikelompokkan per Unit Eselon II dan moda.'
                  : 'Buat agenda, unggah satu sheet workbook Excel, periksa hasil pencocokan NIP, lalu pilih pegawai Daring atau Luring. Dokumen dibuat per Unit Eselon II dan tidak menyimpan file sumber maupun hasil unduhan.'}
              </p>
            </div>
          </div>

          {!agendaId && canEditAgenda && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setIsCreateModalOpen(true);
              }}
              className="btn-primary inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold shadow-sm"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Buat agenda</span>
            </button>
          )}
        </header>

        {(visibleError || notice) && (
          <div
            role={visibleError ? 'alert' : 'status'}
            className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
              visibleError
                ? 'border-rose-500/35 bg-rose-500/10 text-rose-200'
                : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
            }`}
          >
            {visibleError ?? notice}
          </div>
        )}

        {isLoading ? (
          <div className="pel-panel rounded-2xl border border-slate-800 bg-slate-900/75 p-10 text-center text-sm text-slate-400">
            Memuat agenda…
          </div>
        ) : agendaId ? (
          <div className="space-y-6">
            {/* AGENDA DETAIL CARD */}
            <section className="pel-panel rounded-2xl border border-slate-800 bg-slate-900/75 p-5 sm:p-6">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-lg font-bold">Detail Agenda</h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Parameter surat dinas, jadwal pelaksanaan, dan ketentuan pakaian pelantikan.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!isEditingAgenda && canEditAgenda && (
                    <button
                      type="button"
                      onClick={() => setIsEditingAgenda(true)}
                      aria-label="Edit detail agenda"
                      title="Edit detail agenda"
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/70 px-3 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                        <path d="m14 5 5 5M4 20l4.5-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z" />
                      </svg>
                      <span>Edit</span>
                    </button>
                  )}
                  {canEditAgenda && (
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => void deleteAgenda()}
                      aria-label={isDeleting ? 'Menghapus agenda' : 'Hapus agenda'}
                      title={isDeleting ? 'Menghapus agenda' : 'Hapus agenda'}
                      className="inline-flex size-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/70 text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-500/15 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                        <path d="M4 7h16m-10 4v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              {isEditingAgenda ? (
                <form onSubmit={(event) => void saveAgenda(event)}>
                  <fieldset disabled={!canEditAgenda || isSaving}>
                    <AgendaFields fields={fields} onChange={updateFields} />
                  </fieldset>
                  <div className="mt-5 flex justify-end gap-2 border-t border-slate-800 pt-4">
                    <button
                      type="button"
                      disabled={!canEditAgenda || isSaving}
                      onClick={() => {
                        if (agenda) setFields(agendaFields(agenda));
                        setIsEditingAgenda(false);
                        setColumnWidthError(null);
                        setNotice(null);
                      }}
                      aria-label="Batalkan edit agenda"
                      title="Batalkan edit agenda"
                      className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-4">
                        <path d="m6 6 12 12M18 6 6 18" />
                      </svg>
                      <span>Batal</span>
                    </button>
                    <button
                      type="submit"
                      disabled={!canEditAgenda || isSaving}
                      aria-label={isSaving ? 'Menyimpan detail agenda' : 'Simpan detail agenda'}
                      title={isSaving ? 'Menyimpan detail agenda' : 'Simpan detail agenda'}
                      className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSaving ? (
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-4 animate-spin">
                          <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.36-6.36-2.12 2.12M7.76 16.24l-2.12 2.12m12.72 0-2.12-2.12M7.76 7.76 5.64 5.64" />
                        </svg>
                      ) : (
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                          <path d="m5 12 4 4L19 6" />
                        </svg>
                      )}
                      <span>{isSaving ? 'Menyimpan…' : 'Simpan perubahan'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    {
                      label: 'Hari dan tanggal pelantikan',
                      value: agenda?.tanggal_pelantikan
                        ? `${agenda.hari_pelantikan}, ${formatDate(agenda.tanggal_pelantikan)}`
                        : '—',
                      mono: false,
                    },
                    {
                      label: 'Nomor ND undangan',
                      value: agenda?.nd_undangan_pelantikan || '—',
                      mono: true,
                    },
                    {
                      label: 'Tanggal ND undangan',
                      value: agenda?.tanggal_nd_undangan_pelantikan
                        ? formatDate(agenda.tanggal_nd_undangan_pelantikan)
                        : '—',
                      mono: false,
                    },
                    {
                      label: 'Jam pelantikan',
                      value: agenda?.jam_pelantikan ? `${agenda.jam_pelantikan} WIB` : '—',
                      mono: true,
                    },
                    {
                      label: 'Dresscode',
                      value: agenda?.dresscode || '—',
                      mono: false,
                    },
                    {
                      label: 'Level jabatan',
                      value: agenda?.level_jabatan || '—',
                      mono: false,
                    },
                  ].map((detail) => (
                    <div
                      key={detail.label}
                      className="pel-subpanel rounded-xl border border-slate-800/90 bg-slate-950/45 px-4 py-3"
                    >
                      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        {detail.label}
                      </dt>
                      <dd className={`mt-1 text-sm font-medium text-slate-100 ${detail.mono ? 'font-mono' : ''}`}>
                        {detail.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>

            {/* WORKBOOK UPLOAD CARD */}
            <section className="pel-panel rounded-2xl border border-slate-800 bg-slate-900/75 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Unggah dan Cocokkan Pegawai</h2>
                  <p className="mt-1 max-w-4xl text-xs leading-relaxed text-slate-400">
                    Baris ketiga digunakan sebagai header. Baris tanpa isi pada kolom Nama/NIP dilewati,
                    lalu NIP diambil dari baris terakhir kolom tersebut. Kolom No, Nama/NIP,
                    Jabatan Saat ini, dan Usul Jabatan Baru hanya menjadi referensi pratinjau; dokumen
                    memakai Jabatan saat ini dari database.
                    {activeWorkflowMode === 'all_sheets'
                      ? ' Semua sheet diperiksa; sheet kosong atau tanpa kolom roster wajib dilewati dan dilaporkan.'
                      : ''}
                  </p>
                </div>
                {agenda?.uploaded_filename && (
                  <span className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300">
                    File terakhir: <span className="font-medium text-slate-100">{agenda.uploaded_filename}</span>
                    {agenda.uploaded_sheet ? ` · Sheet: ${agenda.uploaded_sheet}` : ''}
                  </span>
                )}
              </div>

              <div className="pel-subpanel mt-4 rounded-xl border border-slate-800 bg-slate-950/45 p-4">
                {activeWorkflowMode === 'all_sheets' && (
                  <div className="mb-4 max-w-xl">
                    <label htmlFor="experimental-import-strategy" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Cara memproses sheet
                    </label>
                    <select
                      id="experimental-import-strategy"
                      value={importStrategy}
                      onChange={(event) => {
                        const nextStrategy = event.target.value as PelantikanImportStrategy;
                        setImportStrategy(nextStrategy);
                        setSelectedSheet(
                          nextStrategy === 'single_sheet' && availableSheets.length === 1
                            ? availableSheets[0]
                            : '',
                        );
                        setSelectedSheets([]);
                        setNotice(null);
                      }}
                      disabled={!canEditAgenda || isUploading || isLoadingSheets || isEditingAgenda}
                      className="input w-full"
                    >
                      <option value="all_sheets">Gabungkan semua sheet roster</option>
                      <option value="selected_sheets">Pilih beberapa sheet lalu gabungkan</option>
                      <option value="isolated_sheets">Proses semua sheet secara terpisah</option>
                      <option value="single_sheet">Pilih dan proses satu sheet</option>
                    </select>
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    aria-label="Pilih workbook Excel"
                    disabled={!canEditAgenda || isLoadingSheets || isUploading || isEditingAgenda}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      event.currentTarget.value = '';
                      setSelectedFile(file);
                      setAvailableSheets([]);
                      setSelectedSheet('');
                      setError(null);
                      setNotice(null);
                      if (file) void chooseWorkbookSheet(file);
                    }}
                    className="block min-w-0 flex-1 text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3.5 file:py-2 file:text-xs file:font-semibold file:text-slate-100 hover:file:bg-slate-700"
                  />
                  {activeWorkflowMode === 'single_sheet' && (
                    <button
                      type="button"
                      disabled={!canEditAgenda || !selectedFile || isLoadingSheets || isUploading || isSaving || isEditingAgenda}
                      onClick={() => void chooseWorkbookSheet()}
                      className="btn-secondary shrink-0"
                    >
                      {isLoadingSheets ? 'Membaca sheet…' : 'Pilih sheet'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={
                      !selectedFile
                      || !availableSheets.length
                      || (activeWorkflowMode === 'single_sheet' && availableSheets.length > 1 && !selectedSheet)
                      || (activeWorkflowMode === 'all_sheets'
                        && importStrategy === 'selected_sheets'
                        && selectedSheets.length === 0)
                      || (activeWorkflowMode === 'all_sheets'
                        && importStrategy === 'single_sheet'
                        && !selectedSheet)
                      || isLoadingSheets
                      || isUploading
                      || isSaving
                      || isEditingAgenda
                      || !canEditAgenda
                    }
                    onClick={() => void uploadWorkbook()}
                    className="btn-primary shrink-0"
                  >
                    {isUploading
                      ? 'Memproses…'
                      : activeWorkflowMode === 'single_sheet'
                        ? 'Unggah dan cocokkan'
                        : importStrategy === 'selected_sheets'
                          ? 'Gabungkan sheet pilihan'
                          : importStrategy === 'isolated_sheets'
                            ? 'Proses sheet terpisah'
                            : importStrategy === 'single_sheet'
                              ? 'Proses satu sheet'
                              : 'Gabungkan semua sheet'}
                  </button>
                </div>

                {selectedFile && (
                  <p className="mt-2.5 text-xs text-slate-400">
                    Workbook dipilih: <span className="font-mono text-slate-200">{selectedFile.name}</span>
                  </p>
                )}

                {activeWorkflowMode === 'single_sheet' && availableSheets.length > 0 && (
                  <div className="mt-4 max-w-xl">
                    <label htmlFor="pelantikan-sheet" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Sheet workbook
                    </label>
                    <select
                      id="pelantikan-sheet"
                      value={selectedSheet}
                      onChange={(event) => setSelectedSheet(event.target.value)}
                      disabled={!canEditAgenda || isUploading || isLoadingSheets || isEditingAgenda}
                      className="input w-full"
                    >
                      {availableSheets.length > 1 && <option value="">Pilih sheet yang akan diproses</option>}
                      {availableSheets.map((sheet) => (
                        <option key={sheet} value={sheet}>{sheet}</option>
                      ))}
                    </select>
                  </div>
                )}

                {activeWorkflowMode === 'all_sheets'
                  && importStrategy === 'selected_sheets'
                  && availableSheets.length > 0 && (
                  <fieldset className="mt-4 max-w-xl">
                    <legend className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Sheet yang digabung
                    </legend>
                    <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                      {availableSheets.map((sheet) => (
                        <label key={sheet} className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-200">
                          <input
                            type="checkbox"
                            checked={selectedSheets.includes(sheet)}
                            onChange={(event) => setSelectedSheets((current) => (
                              event.target.checked
                                ? [...current, sheet]
                                : current.filter((selected) => selected !== sheet)
                            ))}
                            disabled={!canEditAgenda || isUploading || isLoadingSheets}
                            className="size-4 accent-cyan-500"
                          />
                          <span>{sheet}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}

                {activeWorkflowMode === 'all_sheets'
                  && importStrategy === 'single_sheet'
                  && availableSheets.length > 0 && (
                  <div className="mt-4 max-w-xl">
                    <label htmlFor="experimental-single-sheet" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Sheet workbook
                    </label>
                    <select
                      id="experimental-single-sheet"
                      value={selectedSheet}
                      onChange={(event) => setSelectedSheet(event.target.value)}
                      disabled={!canEditAgenda || isUploading || isLoadingSheets}
                      className="input w-full"
                    >
                      {availableSheets.length > 1 && <option value="">Pilih satu sheet</option>}
                      {availableSheets.map((sheet) => (
                        <option key={sheet} value={sheet}>{sheet}</option>
                      ))}
                    </select>
                  </div>
                )}

                {activeWorkflowMode === 'all_sheets'
                  && ['all_sheets', 'isolated_sheets'].includes(importStrategy)
                  && availableSheets.length > 0 && (
                  <p className="mt-3 text-xs text-slate-400">
                    {importStrategy === 'isolated_sheets'
                      ? `Semua ${availableSheets.length} sheet roster diproses terpisah; peserta dari sheet berbeda tidak digabung dalam dokumen yang sama.`
                      : `Semua ${availableSheets.length} sheet akan diperiksa dan sheet roster valid digabungkan.`}
                  </p>
                )}
              </div>
            </section>

            {/* ROSTER TABLE SECTION */}
            {agenda && agenda.people.length > 0 && (
              <section className="pel-panel overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/75">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 p-5 sm:p-6">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-lg font-bold">Daftar Pegawai</h2>
                      <span className="rounded-full border border-brand-500/30 bg-brand-500/15 px-2.5 py-0.5 font-mono text-xs font-semibold text-brand-200">
                        {selectedCount} dipilih
                      </span>
                    </div>
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>
                        Menampilkan <strong className="text-slate-200">{visiblePeople.length}</strong> dari {agenda.people.length} baris
                      </span>
                      <span>·</span>
                      <span className="text-emerald-300">{matchedCount} cocok</span>
                      {duplicateCount > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-amber-300">{duplicateCount} NIP duplikat (pilih salah satu)</span>
                        </>
                      )}
                      {unmatchedCount > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-amber-300">{unmatchedCount} perlu diperiksa</span>
                        </>
                      )}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Tarik batas kanan judul kolom untuk mengatur lebarnya.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {choicesDirty && (
                      <span className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200">
                        Ada pilihan belum disimpan
                      </span>
                    )}

                    <div role="group" aria-label="Aksi pegawai" className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-950/60 p-1">
                      <button
                        type="button"
                        aria-pressed={isLiteView}
                        onClick={() => setIsLiteView((current) => !current)}
                        title={isLiteView ? 'Matikan Lite View' : 'Aktifkan Lite View'}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                          isLiteView
                            ? 'bg-brand-500/20 text-brand-200'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                          <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        <span>Lite View</span>
                        <span className="sr-only">{isLiteView ? 'aktif' : 'nonaktif'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const defaults = { ...rosterColumnWidths };
                          columnWidthsRef.current = defaults;
                          setColumnWidths(defaults);
                          setError(null);
                          persistColumnWidths(defaults);
                        }}
                        aria-label="Atur ulang lebar kolom"
                        title="Atur ulang lebar kolom"
                        className="size-8 rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-4">
                          <path d="M4 7v5h5M20 17v-5h-5" />
                          <path d="M5.5 12a7 7 0 0 1 12-4.9L20 9m-1.5 3a7 7 0 0 1-12 4.9L4 15" />
                        </svg>
                      </button>

                      <button
                        type="button"
                        disabled={!canEditAgenda || !selectableCount || selectedSelectableCount >= selectableCount || isSaving}
                        onClick={selectAllSelectable}
                        aria-label="Pilih semua pegawai yang dapat dipilih; satu baris per NIP"
                        title="Pilih semua pegawai yang dapat dipilih; satu baris per NIP"
                        className="size-8 rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-4">
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
                        disabled={!canEditAgenda || selectedSelectableCount === 0 || isSaving}
                        onClick={deselectAllSelectable}
                        aria-label="Batalkan semua pilihan pegawai"
                        title="Batalkan semua pilihan pegawai"
                        className="size-8 rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-4">
                          <path d="M4 6.5h16M4 12h16M4 17.5h16" />
                          <path d="m8 4 8 16" />
                        </svg>
                      </button>

                      <button
                        type="button"
                        disabled={!canEditAgenda || !choicesDirty || isSaving}
                        onClick={() => void saveChoices()}
                        aria-label={isSaving ? 'Menyimpan pilihan' : 'Simpan pilihan'}
                        title={isSaving ? 'Menyimpan pilihan' : 'Simpan pilihan'}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-40 ${
                          choicesDirty
                            ? 'bg-sky-500 text-white shadow-xs hover:bg-sky-400'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-brand-300'
                        }`}
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                          <path d="M6 3.75h8.5L19 8.25v11.5a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-15a1 1 0 0 1 1-1Z" />
                          <path d="M14 4v5h5" />
                          <path d="m8 15 2.25 2.25L16 11.5" />
                        </svg>
                        <span>{isSaving ? 'Menyimpan…' : 'Simpan'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={selectedCount === 0}
                        onClick={() => setIsPreviewOpen(true)}
                        aria-label="Pratinjau dokumen"
                        title="Pratinjau dokumen"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-brand-200 transition hover:bg-slate-800 hover:text-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                          <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        <span>Pratinjau ND</span>
                      </button>

                      <button
                        type="button"
                        disabled={choicesDirty || isExportingMonitoring}
                        onClick={() => void exportMonitoring()}
                        aria-label={isExportingMonitoring ? 'Membuat file monitoring Excel' : 'Unduh monitoring pelantikan Excel'}
                        title={choicesDirty ? 'Simpan pilihan terlebih dahulu' : 'Unduh monitoring pelantikan'}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-emerald-300 transition hover:bg-slate-800 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isExportingMonitoring ? (
                          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4 animate-pulse">
                            <path d="M7 3.75h7.5L19 8.25v11.5a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-15a1 1 0 0 1 1-1Z" />
                            <path d="M14 4v5h5M8 13h8M8 16h8" />
                          </svg>
                        ) : (
                          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                            <path d="M7 3.75h7.5L19 8.25v11.5a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-15a1 1 0 0 1 1-1Z" />
                            <path d="M14 4v5h5M12 12v6m0 0-2.5-2.5M12 18l2.5-2.5" />
                          </svg>
                        )}
                        <span>Monitoring</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div ref={setRosterTableElement} className="max-h-[70vh] overflow-auto">
                  <table
                    className="table-fixed border-collapse text-left text-sm"
                    style={{ width: `${visibleRosterTableWidth}px` }}
                  >
                    <colgroup>
                      {visibleRosterColumnKeys.map((key) => (
                        <col key={key} style={{ width: `${visibleRosterColumnWidths[key]}px` }} />
                      ))}
                    </colgroup>
                    <thead className="pel-table-head bg-slate-950 text-[11px] uppercase tracking-wider text-slate-300">
                      <tr>
                        <th className="pel-table-head sticky top-0 z-20 bg-slate-950 px-4 py-3.5">Pilih{columnResizeHandle('select', 'Pilih')}</th>
                        <th className="pel-table-head sticky top-0 z-20 bg-slate-950 px-4 py-3.5">No{columnResizeHandle('number', 'No')}</th>
                        {!isLiteView && (
                          <th className="pel-table-head sticky top-0 z-20 bg-slate-950 px-4 py-3.5">Sheet sumber{columnResizeHandle('source', 'Sheet sumber')}</th>
                        )}
                        <th className="pel-table-head sticky top-0 z-20 bg-slate-950 px-4 py-3.5">Nama/NIP{columnResizeHandle('sourceName', 'Nama/NIP')}</th>
                        <th className="pel-table-head sticky top-0 z-20 bg-slate-950 px-4 py-3.5">Jabatan Saat ini/Grade{columnResizeHandle('sourcePosition', 'Jabatan Saat ini/Grade')}</th>
                        <th className="pel-table-head sticky top-0 z-20 bg-slate-950 px-4 py-3.5">Usul Jabatan Baru/Grade{columnResizeHandle('proposedPosition', 'Usul Jabatan Baru/Grade')}</th>
                        {!isLiteView && (
                          <>
                            <th className="pel-table-head sticky top-0 z-20 bg-slate-950 px-4 py-3.5">NIP database{columnResizeHandle('nip', 'NIP database')}</th>
                            <th className="pel-table-head sticky top-0 z-20 bg-slate-950 px-4 py-3.5">Nama database{columnResizeHandle('name', 'Nama database')}</th>
                            <th className="pel-table-head sticky top-0 z-20 bg-slate-950 px-4 py-3.5">Jabatan database{columnResizeHandle('databasePosition', 'Jabatan database')}</th>
                            <th className="pel-table-head sticky top-0 z-20 bg-slate-950 px-4 py-3.5">Unit Eselon II{columnResizeHandle('unit', 'Unit Eselon II')}</th>
                          </>
                        )}
                        <th className="pel-table-head sticky top-0 z-20 bg-slate-950 px-4 py-3.5">Kota{columnResizeHandle('city', 'Kota')}</th>
                        <th className="pel-table-head sticky top-0 z-20 bg-slate-950 px-4 py-3.5">
                          Pencocokan
                          <select
                            aria-label="Filter pencocokan"
                            value={matchingFilter}
                            onChange={(event) => setMatchingFilter(event.target.value as MatchingFilter)}
                            className="input mt-2 block w-36 px-2 py-1 text-[11px] font-normal normal-case tracking-normal"
                          >
                            <option value="all">Semua</option>
                            <option value="matched">Cocok</option>
                            <option value="duplicate">NIP duplikat</option>
                            <option value="not_found">Tidak ditemukan</option>
                            <option value="missing_nip">NIP kosong</option>
                            <option value="pendamping">Pendamping</option>
                          </select>
                          {columnResizeHandle('matching', 'Pencocokan')}
                        </th>
                        <th className="pel-table-head sticky top-0 z-20 bg-slate-950 px-4 py-3.5">
                          Pelantikan
                          <select
                            aria-label="Filter pelantikan"
                            value={modalityFilter}
                            onChange={(event) => setModalityFilter(event.target.value as ModalityFilter)}
                            className="input mt-2 block w-36 px-2 py-1 text-[11px] font-normal normal-case tracking-normal"
                          >
                            <option value="all">Semua</option>
                            <option value="unselected">Belum dipilih</option>
                            <option value="daring">Daring</option>
                            <option value="luring">Luring</option>
                          </select>
                          {columnResizeHandle('modality', 'Pelantikan')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {visiblePeople.length === 0 ? (
                        <tr>
                          <td colSpan={visibleRosterColumnKeys.length} className="px-4 py-8 text-center text-slate-400">
                            Tidak ada baris yang sesuai dengan filter.
                          </td>
                        </tr>
                      ) : visiblePeople.map((person) => {
                        const choice = choices[person.id] ?? { selected: false, modality: null };
                        const pendamping = isPendamping(person);
                        const canSelect = isSelectablePerson(person);
                        const modality = choice.modality ?? 'daring';
                        const isLuring = modality === 'luring';
                        const modalityLabel = isLuring ? 'Luring' : 'Daring';
                        const nextModality = isLuring ? 'daring' : 'luring';
                        const nextModalityLabel = isLuring ? 'Daring' : 'Luring';
                        return (
                          <tr
                            key={person.id}
                            className={`align-top transition-colors ${
                              pendamping
                                ? 'bg-rose-950/10 opacity-75'
                                : choice.selected
                                  ? 'bg-sky-950/15 hover:bg-slate-800/45'
                                  : 'hover:bg-slate-800/45'
                            }`}
                          >
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                aria-label={`Pilih ${person.nama || `baris ${person.row_number}`}`}
                                checked={choice.selected}
                                disabled={!canEditAgenda || !canSelect}
                                onChange={(event) => changeChoice(person.id, event.target.checked)}
                                className="mt-1 size-4 accent-cyan-500 disabled:opacity-40"
                              />
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-300">{person.source_no || '—'}</td>
                            {!isLiteView && (
                              <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-300">
                                {person.source_sheet
                                  ? `${person.source_sheet} · baris ${person.source_row_number ?? person.row_number}`
                                  : '—'}
                              </td>
                            )}
                            <td className="max-w-72 whitespace-normal px-4 py-3 font-medium text-slate-100">{person.source_nama_nip || '—'}</td>
                            <td className="max-w-72 whitespace-normal px-4 py-3 text-slate-300">{person.source_jabatan_saat_ini || '—'}</td>
                            <td className="max-w-72 whitespace-normal px-4 py-3 text-slate-300">{person.source_usul_jabatan_baru || '—'}</td>
                            {!isLiteView && (
                              <>
                                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-300">{person.nip || '—'}</td>
                                <td className="max-w-64 whitespace-normal px-4 py-3 font-medium text-slate-100">{person.nama || '—'}</td>
                                <td className="max-w-72 whitespace-normal px-4 py-3 text-slate-300">{person.jabatan || '—'}</td>
                                <td className="max-w-72 whitespace-normal px-4 py-3 text-slate-300">{person.unit_eselon_ii || '—'}</td>
                              </>
                            )}
                            <td className="whitespace-nowrap px-4 py-3 text-slate-300">{person.unit_city || '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
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
                              <button
                                type="button"
                                role="switch"
                                aria-checked={isLuring}
                                aria-label={`Modus pelantikan ${person.nama || `baris ${person.row_number}`}: ${modalityLabel}. Klik untuk mengubah ke ${nextModalityLabel}.`}
                                title={`Ubah ke ${nextModalityLabel}`}
                                disabled={!canEditAgenda || !choice.selected || !canSelect}
                                onClick={() => changeChoice(
                                  person.id,
                                  true,
                                  nextModality,
                                )}
                                className="disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <span className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-sm">
                                  <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
                                    isLuring
                                      ? 'border-amber-400 bg-amber-500/40'
                                      : 'border-brand-400 bg-brand-500/40'
                                  }`}>
                                    <span className={`absolute left-0.5 size-4 rounded-full bg-white shadow transition-transform ${
                                      isLuring ? 'translate-x-6' : 'translate-x-0'
                                    }`} />
                                  </span>
                                  <span className={`font-semibold ${
                                    isLuring ? 'text-amber-200' : 'text-brand-200'
                                  }`}>{modalityLabel}</span>
                                </span>
                              </button>
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
          /* AGENDA HISTORY LIST VIEW */
          <section className="pel-panel rounded-2xl border border-slate-800 bg-slate-900/75 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold">Riwayat Agenda</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Daftar agenda pelantikan yang dibuat oleh akun Anda.
                </p>
              </div>
              <span className="rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 font-mono text-xs font-semibold text-slate-200">
                {agendas.length} agenda
              </span>
            </div>

            {agendas.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-700 p-8 text-center">
                <p className="text-sm text-slate-400">Belum ada agenda pelantikan yang dibuat.</p>
                {canEditAgenda && (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setIsCreateModalOpen(true);
                    }}
                    className="btn-primary mt-4"
                  >
                    Buat agenda pertama
                  </button>
                )}
              </div>
            ) : (
              <ul className="mt-5 grid gap-4 md:grid-cols-2">
                {agendas.map((item) => {
                  const daysUntil = daysUntilPelantikan(item.tanggal_pelantikan);
                  const selectionPct = item.people_count > 0
                    ? Math.min(100, Math.round((item.selected_count / item.people_count) * 100))
                    : 0;
                  return (
                    <li key={item.id}>
                      <div className="pel-card group flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/55 transition hover:border-brand-500/50 hover:shadow-md">
                        <button
                          type="button"
                          onClick={() => navigate(`${agendaBasePath}/${item.id}`)}
                          className="w-full flex-1 p-5 text-left transition group-hover:bg-slate-950/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-base font-bold text-slate-100 group-hover:text-brand-200">
                              {formatDate(item.tanggal_pelantikan)}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                  item.status === 'generated'
                                    ? 'border-sky-500/35 bg-sky-500/15 text-sky-300'
                                    : item.status === 'ready'
                                      ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300'
                                      : 'border-slate-700 bg-slate-800/80 text-slate-300'
                                }`}
                              >
                                {item.status === 'generated'
                                  ? 'Sudah dibuat'
                                  : item.status === 'ready'
                                    ? 'Siap diproses'
                                    : 'Draft'}
                              </span>
                              <span
                                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                  daysUntil < 0
                                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                }`}
                              >
                                {daysUntil < 0
                                  ? 'Berakhir'
                                  : daysUntil === 0
                                    ? 'Hari ini'
                                    : `${daysUntil} Hari menuju pelantikan`}
                              </span>
                            </div>
                          </div>

                          <p className="mt-2.5 font-mono text-sm font-medium text-slate-200">
                            {item.nd_undangan_pelantikan}
                          </p>

                          <div className="mt-4">
                            <div className="flex items-center justify-between text-xs text-slate-400">
                              <span>
                                <strong className="font-mono text-slate-200">{item.selected_count}</strong> dari{' '}
                                <span className="font-mono">{item.people_count}</span> pegawai dipilih
                              </span>
                              <span className="font-mono text-[11px]">{selectionPct}%</span>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                              <div
                                className="h-full rounded-full bg-sky-400 transition-[width] duration-300"
                                style={{ width: `${selectionPct}%` }}
                              />
                            </div>
                          </div>
                        </button>

                        {canEditAgenda && (
                          <div className="flex items-center justify-between border-t border-slate-800/90 bg-slate-900/40 px-4 py-2">
                            <span className="text-[11px] text-slate-500">Klik kartu untuk mengelola</span>
                            <button
                              type="button"
                              disabled={deletingHistoryAgendaId !== null}
                              onClick={() => void deleteHistoryAgenda(item)}
                              aria-label={`Hapus agenda ${item.nd_undangan_pelantikan}`}
                              title="Hapus agenda"
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-rose-400 transition hover:bg-rose-500/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="size-3.5"
                              >
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="m19 6-1 14H6L5 6" />
                                <path d="M10 11v5M14 11v5" />
                              </svg>
                              <span>Hapus</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* CREATE AGENDA MODAL */}
        {!agendaId && isCreateModalOpen && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-xs"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsCreateModalOpen(false);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-agenda-title"
              className="pel-modal my-auto w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6"
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h2 id="create-agenda-title" className="text-lg font-bold">Buat Agenda Pelantikan</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Isi detail surat dinas dan jadwal pelaksanaan sebelum mengunggah workbook Excel.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  aria-label="Tutup formulir agenda"
                  className="flex size-8 items-center justify-center rounded-xl border border-slate-700 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
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
                <fieldset disabled={!canEditAgenda || isSaving}>
                  <AgendaFields fields={fields} onChange={updateFields} autoFocus />
                </fieldset>
                <div className="mt-6 flex justify-end gap-3 border-t border-slate-800 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="btn-secondary"
                  >
                    Batal
                  </button>
                  <button type="submit" disabled={!canEditAgenda || isSaving} className="btn-primary">
                    {isSaving ? 'Menyimpan…' : 'Buat agenda'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {/* DOCUMENT PREVIEW & DOWNLOAD MODAL */}
        {agendaId && agenda && isPreviewOpen && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-xs"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsPreviewOpen(false);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="document-preview-title"
              className="pel-modal my-auto flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6"
            >
              <header className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h2 id="document-preview-title" className="text-lg font-bold">Pratinjau Dokumen ND</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Pilih dokumen per Unit Eselon II dan moda. Satu dokumen diunduh sebagai DOCX; beberapa dokumen digabung dalam ZIP.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  aria-label="Tutup pratinjau"
                  title="Tutup pratinjau"
                  className="flex size-8 items-center justify-center rounded-xl border border-slate-700 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-4">
                    <path d="m6 6 12 12M18 6 6 18" />
                  </svg>
                </button>
              </header>

              {choicesDirty && (
                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  Pilihan belum disimpan. Simpan pilihan sebelum membuat dokumen.
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

              <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {previewGroups.length === 0 ? (
                  <p className="pel-subpanel rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">
                    Belum ada pegawai cocok yang dipilih untuk dokumen.
                  </p>
                ) : (
                  previewGroups.map((group) => (
                    <div key={group.key} className="pel-subpanel overflow-hidden rounded-xl border border-slate-700 bg-slate-950/60">
                      <details>
                        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 bg-slate-950/70 p-4 text-left transition hover:bg-slate-900">
                          <span className="min-w-0">
                            <span className="block font-bold text-brand-300">{group.unit}</span>
                            {group.sourceSheet && (
                              <span className="mt-1 block text-xs text-slate-400">
                                Sheet: {group.sourceSheet}
                              </span>
                            )}
                            <span className="mt-1.5 flex flex-wrap gap-1.5">
                              {group.modalityCounts.daring > 0 && (
                                <span className="inline-flex rounded-full border border-brand-500/30 bg-brand-500/10 px-2.5 py-0.5 text-xs font-semibold text-brand-200">
                                  Daring · {group.modalityCounts.daring} pegawai
                                </span>
                              )}
                              {group.modalityCounts.luring > 0 && (
                                <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-200">
                                  Luring · {group.modalityCounts.luring} pegawai
                                </span>
                              )}
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
                                {person.jabatan && <span className="mt-0.5 block text-xs font-normal text-slate-400">{person.jabatan}</span>}
                              </span>
                              <span className="flex items-center gap-2 whitespace-nowrap">
                                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                  choices[person.id]?.modality === 'luring'
                                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                                    : 'border-brand-500/30 bg-brand-500/10 text-brand-200'
                                }`}>
                                  {choices[person.id]?.modality === 'luring' ? 'Luring' : 'Daring'}
                                </span>
                                <span className="font-mono text-xs text-slate-300">{person.nip}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                      <div className="flex flex-wrap items-center gap-4 border-t border-slate-800 px-4 py-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Dokumen:</span>
                        {(['daring', 'luring'] as const).map((modality) => {
                          const count = group.modalityCounts[modality];
                          if (count === 0) return null;
                          const key = `${group.key}\u0000${modality}`;
                          const label = modality === 'daring' ? 'Daring' : 'Luring';
                          return (
                            <label key={key} className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-200 sm:text-sm">
                              <input
                                type="checkbox"
                                checked={!excludedDocumentKeys.has(key)}
                                disabled={!canEditAgenda || choicesDirty || isGenerating}
                                onChange={() => toggleDocumentDownload(key)}
                                aria-label={`Sertakan dokumen ${label} untuk ${group.unit}`}
                                className="size-4 rounded border-slate-600 bg-slate-900 accent-brand-400"
                              />
                              <span>{label} · {count} pegawai</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
                <span className="text-xs text-slate-400">
                  {selectedDownloadGroups.length} dokumen terpilih ({selectedDownloadPersonIds.length} pegawai)
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!canEditAgenda || !choicesDirty || isSaving}
                    onClick={() => void saveChoices()}
                    aria-label={isSaving ? 'Menyimpan pilihan' : 'Simpan pilihan'}
                    title={isSaving ? 'Menyimpan pilihan' : 'Simpan pilihan'}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                      <path d="M6 3.75h8.5L19 8.25v11.5a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-15a1 1 0 0 1 1-1Z" />
                      <path d="M14 4v5h5" />
                      <path d="m8 15 2.25 2.25L16 11.5" />
                    </svg>
                    <span>Simpan pilihan</span>
                  </button>

                  <button
                    type="button"
                    disabled={
                      previewGroups.length === 0
                      || !canEditAgenda
                      || choicesDirty
                      || isGenerating
                      || isGeneratingAppendix
                    }
                    onClick={() => void generateAppendix()}
                    aria-label={isGeneratingAppendix ? 'Membuat Lampiran ND Pengantar' : 'Cetak Lampiran ND Pengantar'}
                    title={
                      choicesDirty
                        ? 'Simpan pilihan terlebih dahulu'
                        : isGeneratingAppendix
                          ? 'Membuat Lampiran ND Pengantar'
                          : 'Cetak Lampiran ND Pengantar'
                    }
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25 hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isGeneratingAppendix ? (
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4 animate-pulse">
                        <path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                        <path d="M7 14h10v7H7zM17 11h.01" />
                      </svg>
                    ) : (
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                        <path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                        <path d="M7 14h10v7H7zM17 11h.01" />
                      </svg>
                    )}
                    <span>{isGeneratingAppendix ? 'Membuat lampiran…' : 'Lampiran ND Pengantar'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={
                      selectedDownloadGroups.length === 0
                      || !canEditAgenda
                      || choicesDirty
                      || isGenerating
                      || isGeneratingAppendix
                    }
                    onClick={() => void generateDocuments()}
                    aria-label={isGenerating
                      ? 'Membuat dan mengunduh dokumen'
                      : `Buat dan unduh ${selectedDownloadGroups.length} dokumen`}
                    title={isGenerating
                      ? 'Membuat dan mengunduh dokumen'
                      : `Buat dan unduh ${selectedDownloadGroups.length} dokumen`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-sky-500 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                      <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
                      <path d="M5 16v4h14v-4" />
                    </svg>
                    <span>
                      {isGenerating
                        ? 'Mengunduh…'
                        : `Unduh ${selectedDownloadGroups.length} Dokumen`}
                    </span>
                  </button>
                </div>
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
  const levelOptions = ['Administrator', 'Tinggi Pratama'];
  const presetDresscodes = ['Wastra Nusantara', 'PSL Lengkap'];
  const [isOtherDresscode, setIsOtherDresscode] = useState(
    Boolean(fields.dresscode) && !presetDresscodes.includes(fields.dresscode),
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
        Tanggal pelantikan
        <input
          required
          type="date"
          autoFocus={autoFocus}
          value={fields.tanggal_pelantikan}
          onChange={(event) => onChange('tanggal_pelantikan', event.target.value)}
          className={`${inputClass} normal-case`}
        />
      </label>
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
        Jam pelantikan
        <input
          required
          type="time"
          value={fields.jam_pelantikan}
          onChange={(event) => onChange('jam_pelantikan', event.target.value)}
          className={`${inputClass} normal-case`}
        />
      </label>
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 sm:col-span-2">
        Nomor ND undangan pelantikan
        <input
          required
          maxLength={255}
          value={fields.nd_undangan_pelantikan}
          onChange={(event) => onChange('nd_undangan_pelantikan', event.target.value)}
          className={`${inputClass} normal-case`}
        />
      </label>
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
        Tanggal ND undangan
        <input
          required
          type="date"
          value={fields.tanggal_nd_undangan_pelantikan}
          onChange={(event) => onChange('tanggal_nd_undangan_pelantikan', event.target.value)}
          className={`${inputClass} normal-case`}
        />
      </label>
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
        Level jabatan
        <select
          required
          value={fields.level_jabatan}
          onChange={(event) => onChange('level_jabatan', event.target.value)}
          className={`${inputClass} normal-case`}
        >
          <option value="" disabled>Pilih level jabatan</option>
          {fields.level_jabatan && !levelOptions.includes(fields.level_jabatan) && (
            <option value={fields.level_jabatan}>{fields.level_jabatan} (saat ini)</option>
          )}
          <option value="Administrator">Administrator</option>
          <option value="Tinggi Pratama">Tinggi Pratama</option>
        </select>
      </label>
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 sm:col-span-2">
        Dresscode
        <select
          required
          value={isOtherDresscode ? 'other' : fields.dresscode}
          onChange={(event) => {
            if (event.target.value === 'other') {
              setIsOtherDresscode(true);
              if (presetDresscodes.includes(fields.dresscode)) onChange('dresscode', '');
              return;
            }
            setIsOtherDresscode(false);
            onChange('dresscode', event.target.value);
          }}
          className={`${inputClass} normal-case`}
        >
          <option value="" disabled>Pilih dresscode</option>
          <option value="Wastra Nusantara">Wastra Nusantara</option>
          <option value="PSL Lengkap">PSL Lengkap</option>
          <option value="other">Lainnya (isi sendiri)</option>
        </select>
      </label>
      {isOtherDresscode && (
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 sm:col-span-2">
          Dresscode lainnya
          <input
            required
            maxLength={1000}
            value={fields.dresscode}
            onChange={(event) => onChange('dresscode', event.target.value)}
            className={`${inputClass} normal-case`}
            placeholder="Masukkan dresscode"
          />
        </label>
      )}
    </div>
  );
}