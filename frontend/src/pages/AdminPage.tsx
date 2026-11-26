import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react';
import { Link } from 'react-router-dom';
import * as apiClient from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type {
  AssignableAuthLevel,
  AdminUserUpdatePayload,
  AuthLevel,
  AuthUser,
  DatabaseMaintenanceResult,
  DatabaseMaintenancePreview,
  DatabaseMaintenanceTarget,
  MenuAccessKey,
  MenuAccessPolicy,
  UserFeedback,
  PbnOpenDataSourceSyncStatus,
  LegacyDatabaseUploadPreview,
} from '../types';
import { Spinner } from '../components/Spinner';
import { useMenuAccess } from '../contexts/MenuAccessContext';

type UserForm = {
  user: string;
  name: string;
  auth_level: AssignableAuthLevel;
  password: string;
  is_active: boolean;
};

type AdminTab = 'accounts' | 'feedback' | 'database' | 'auth-menu';
type UserStatusFilter = 'all' | 'active' | 'inactive';
type UserRoleFilter = 'all' | AuthLevel;

const emptyForm: UserForm = {
  user: '',
  name: '',
  auth_level: 1,
  password: '',
  is_active: true,
};

const menuAccessLabels: Record<MenuAccessKey, string> = {
  analytics: 'PBN Analytics',
  'insights-beta': 'Insight Hub Beta',
  'analisis-kinerja': 'Analisis Kinerja DJPb',
  'analisis-mutasi': 'Analisis Mutasi/Promosi',
  'penyusunan-kandidat': 'Penyusunan Kandidat',
  'fragment-petikan': 'Fragment Petikan',
  'plt-plh': 'Manajemen Plt./Plh.',
  'nd-undangan': 'Generate ND Undangan Pelantikan',
  'progress-bahan': 'Bahan Pendukung MPK',
  'simulasi-mutasi': 'Simulasi Mutasi',
  admin: 'Admin',
};

const accessLevels = [
  { value: 0, label: '0 · Guest' },
  { value: 1, label: '1 · User' },
  { value: 2, label: '2 · Special User' },
  { value: 3, label: '3 · Super Admin' },
];

function authLevelLabel(level: AuthLevel): string {
  if (level === 4) return 'God User';
  if (level === 3) return 'Super Admin';
  if (level === 2) return 'Special User';
  return 'User';
}

function accessLevelName(level: number): string {
  if (level === 0) return 'Guest';
  if (level === 1) return 'User';
  if (level === 2) return 'Special User';
  if (level === 3) return 'Super Admin';
  return 'God User';
}

function getInitials(name: string, username: string): string {
  const source = (name || username || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function RoleBadge({ level }: { level: AuthLevel }) {
  if (level === 4) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        4 · God User
      </span>
    );
  }
  if (level === 3) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/15 px-2.5 py-0.5 text-xs font-semibold text-sky-300">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
        3 · Super Admin
      </span>
    );
  }
  if (level === 2) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-0.5 text-xs font-medium text-indigo-300">
        2 · Special User
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-slate-600/60 bg-slate-800/80 px-2.5 py-0.5 text-xs font-medium text-slate-300">
      1 · User
    </span>
  );
}

function formatFeedbackDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}

function formatSourceSyncDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}

export default function AdminPage() {
  const { user: currentUser } = useAuth();
  const { policies: menuPolicies, reload: reloadMenuPolicies } = useMenuAccess();

  const isGodUser = currentUser?.auth_level === 4;
  // Level 3 and Level 4 share full operational & database authority; only Set Auth Menu is Level 4 exclusive.
  const canManageAdmin = (currentUser?.auth_level ?? 0) >= 3;

  const hasUserSelectedTab = useRef(false);
  const [activeTab, setActiveTab] = useState<AdminTab>(canManageAdmin ? 'accounts' : 'feedback');

  useEffect(() => {
    if (!hasUserSelectedTab.current && canManageAdmin && activeTab === 'feedback') {
      setActiveTab('accounts');
    }
  }, [canManageAdmin, activeTab]);

  const selectTab = (tab: AdminTab) => {
    hasUserSelectedTab.current = true;
    setActiveTab(tab);
  };

  // Global status banners
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Accounts state & filters
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<UserRoleFilter>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<UserStatusFilter>('all');
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [isLoading, setIsLoading] = useState(canManageAdmin);
  const [isSaving, setIsSaving] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<UserForm>(emptyForm);

  // Feedback state & filters
  const [feedbackItems, setFeedbackItems] = useState<UserFeedback[]>([]);
  const [feedbackSearch, setFeedbackSearch] = useState('');
  const [feedbackMenuFilter, setFeedbackMenuFilter] = useState<string>('all');
  const [isLoadingFeedback, setIsLoadingFeedback] = useState((currentUser?.auth_level ?? 1) >= 2);
  const [isClearingFeedback, setIsClearingFeedback] = useState(false);
  const [deletingFeedbackId, setDeletingFeedbackId] = useState<number | null>(null);

  // Database maintenance & sync state
  const [databaseFile, setDatabaseFile] = useState<File | null>(null);
  const [isDraggingDatabaseCsv, setIsDraggingDatabaseCsv] = useState(false);
  const [databasePreview, setDatabasePreview] = useState<DatabaseMaintenancePreview | null>(null);
  const [databaseTargets, setDatabaseTargets] = useState<DatabaseMaintenanceTarget[]>([]);
  const [selectedDatabaseTarget, setSelectedDatabaseTarget] = useState('fetch_pbnopen');
  const [isLoadingDatabaseTargets, setIsLoadingDatabaseTargets] = useState(false);
  const [sourceSyncStatus, setSourceSyncStatus] = useState<PbnOpenDataSourceSyncStatus | null>(null);
  const [isLoadingSourceSync, setIsLoadingSourceSync] = useState((currentUser?.auth_level ?? 0) >= 2);
  const [sourceSyncError, setSourceSyncError] = useState<string | null>(null);
  const [isPreviewingDatabaseChange, setIsPreviewingDatabaseChange] = useState(false);
  const [isApplyingDatabaseChange, setIsApplyingDatabaseChange] = useState(false);
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [databaseDialogError, setDatabaseDialogError] = useState<string | null>(null);
  const [databaseApplyFailed, setDatabaseApplyFailed] = useState(false);
  const databaseFileInput = useRef<HTMLInputElement>(null);

  // Legacy database upload state
  const [legacyYear, setLegacyYear] = useState(String(new Date().getFullYear()));
  const [legacyQuarter, setLegacyQuarter] = useState('Q1');
  const [legacyFile, setLegacyFile] = useState<File | null>(null);
  const [isDraggingLegacyFile, setIsDraggingLegacyFile] = useState(false);
  const [legacyPreview, setLegacyPreview] = useState<LegacyDatabaseUploadPreview | null>(null);
  const [legacyBusy, setLegacyBusy] = useState(false);
  const [legacyError, setLegacyError] = useState<string | null>(null);
  const legacyFileInput = useRef<HTMLInputElement>(null);

  // Set Auth Menu (Top-level tab for Level 4)
  const [menuAccessDraft, setMenuAccessDraft] = useState<MenuAccessPolicy[]>([]);
  const [menuSearch, setMenuSearch] = useState('');
  const [isSavingMenuAccess, setIsSavingMenuAccess] = useState(false);
  const [menuAccessError, setMenuAccessError] = useState<string | null>(null);

  const modifiedMenuKeys = useMemo(() => {
    const originalMap = new Map(menuPolicies.map((p) => [p.menu_key, p]));
    const changed = new Set<MenuAccessKey>();
    for (const draft of menuAccessDraft) {
      const orig = originalMap.get(draft.menu_key);
      if (!orig || orig.view_level !== draft.view_level || orig.edit_level !== draft.edit_level) {
        changed.add(draft.menu_key);
      }
    }
    return changed;
  }, [menuPolicies, menuAccessDraft]);

  useEffect(() => {
    if (menuPolicies.length > 0 && modifiedMenuKeys.size === 0) {
      setMenuAccessDraft(menuPolicies.map((policy) => ({ ...policy })));
    }
  }, [menuPolicies, modifiedMenuKeys.size]);

  const resetMenuAccessDraft = () => {
    setMenuAccessError(null);
    setMenuAccessDraft(menuPolicies.map((policy) => ({ ...policy })));
  };

  const updateMenuAccessDraft = (
    menuKey: MenuAccessKey,
    field: 'view_level' | 'edit_level',
    level: number,
  ) => {
    setMenuAccessError(null);
    setMenuAccessDraft((current) =>
      current.map((policy) => {
        if (policy.menu_key !== menuKey) return policy;
        if (field === 'view_level') {
          return {
            ...policy,
            view_level: level,
            edit_level: Math.max(policy.edit_level, level),
          };
        }
        return {
          ...policy,
          edit_level: Math.max(level, policy.view_level),
        };
      }),
    );
  };

  const saveMenuAccess = async () => {
    setMenuAccessError(null);
    setNotice(null);
    setIsSavingMenuAccess(true);
    try {
      await apiClient.updateMenuAccessSettings(menuAccessDraft);
      await reloadMenuPolicies();
      setNotice(`Pengaturan akses menu berhasil disimpan (${modifiedMenuKeys.size} kebijakan diperbarui).`);
    } catch (saveError) {
      setMenuAccessError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSavingMenuAccess(false);
    }
  };

  const refreshUsers = useCallback(async () => {
    if ((currentUser?.auth_level ?? 0) < 3) return;
    setError(null);
    try {
      setUsers(await apiClient.listAdminUsers());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.auth_level]);

  const refreshFeedback = useCallback(async () => {
    if ((currentUser?.auth_level ?? 0) < 2) {
      setFeedbackItems([]);
      setIsLoadingFeedback(false);
      return;
    }

    setIsLoadingFeedback(true);
    try {
      setFeedbackItems(await apiClient.listAdminFeedback());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoadingFeedback(false);
    }
  }, [currentUser?.auth_level]);

  const refreshSourceSyncStatus = useCallback(async () => {
    if ((currentUser?.auth_level ?? 0) < 2) {
      setSourceSyncStatus(null);
      setIsLoadingSourceSync(false);
      return;
    }

    setIsLoadingSourceSync(true);
    setSourceSyncError(null);
    try {
      setSourceSyncStatus(await apiClient.getPbnOpenDataSourceSyncStatus());
    } catch (loadError) {
      setSourceSyncError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoadingSourceSync(false);
    }
  }, [currentUser?.auth_level]);

  const closeSourceDialog = useCallback(() => {
    if (databaseDialogError) setError(databaseDialogError);
    setShowSourceDialog(false);
  }, [databaseDialogError]);

  const openDatabaseDialog = (targetKey = 'fetch_pbnopen') => {
    setError(null);
    setDatabaseFile(null);
    setDatabasePreview(null);
    setDatabaseDialogError(null);
    setDatabaseApplyFailed(false);
    setSelectedDatabaseTarget(targetKey);
    setShowSourceDialog(true);
    if (!canManageAdmin) return;

    setIsLoadingDatabaseTargets(true);
    void apiClient
      .getDatabaseMaintenanceTargets()
      .then((targets) => {
        setDatabaseTargets(targets);
        if (!targets.some((target) => target.key === targetKey)) {
          setDatabaseDialogError(`The table '${targetKey}' is not available for maintenance.`);
        }
      })
      .catch((loadError: unknown) => {
        setDatabaseDialogError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => setIsLoadingDatabaseTargets(false));
  };

  const refreshDatabaseTargets = useCallback(async () => {
    if (!canManageAdmin) return;
    setIsLoadingDatabaseTargets(true);
    setDatabaseDialogError(null);
    setDatabasePreview(null);
    setDatabaseFile(null);
    setDatabaseApplyFailed(false);
    if (databaseFileInput.current) databaseFileInput.current.value = '';
    try {
      const targets = await apiClient.getDatabaseMaintenanceTargets();
      setDatabaseTargets(targets);
      if (
        !targets.some((target) => target.key === selectedDatabaseTarget)
        && targets.length > 0
      ) {
        setSelectedDatabaseTarget(targets[0].key);
      }
    } catch (loadError: unknown) {
      setDatabaseDialogError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoadingDatabaseTargets(false);
    }
  }, [canManageAdmin, selectedDatabaseTarget]);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  useEffect(() => {
    void refreshFeedback();
  }, [refreshFeedback]);

  useEffect(() => {
    void refreshSourceSyncStatus();
  }, [refreshSourceSyncStatus]);

  useEffect(() => {
    if (!showSourceDialog || isPreviewingDatabaseChange || isApplyingDatabaseChange) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSourceDialog();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSourceDialog, isPreviewingDatabaseChange, isApplyingDatabaseChange, closeSourceDialog]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingUser(null);
    setShowPassword(false);
  };

  const submitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!editingUser && /\s/.test(form.user)) {
      setError('Username tidak boleh mengandung spasi.');
      return;
    }
    setIsSaving(true);
    try {
      if (editingUser) {
        const payload: AdminUserUpdatePayload = {
          name: form.name,
          auth_level: form.auth_level,
          is_active: form.is_active,
          ...(form.password ? { password: form.password } : {}),
        };
        await apiClient.updateAdminUser(editingUser, payload);
        setNotice(`Akun ${editingUser} berhasil diperbarui.`);
      } else {
        await apiClient.createAdminUser({
          user: form.user,
          name: form.name,
          auth_level: form.auth_level,
          password: form.password,
        });
        setNotice(`Akun ${form.user} berhasil dibuat.`);
      }
      resetForm();
      await refreshUsers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (account: AuthUser) => {
    if (account.auth_level === 4 && currentUser?.auth_level !== 4) return;
    setEditingUser(account.user);
    setShowPassword(false);
    setForm({
      user: account.user,
      name: account.name,
      auth_level: account.auth_level,
      password: '',
      is_active: account.is_active,
    });
    setNotice(null);
    setError(null);
  };

  const removeUser = async (account: AuthUser) => {
    if (!window.confirm(`Hapus akun "${account.user}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    setError(null);
    setNotice(null);
    try {
      await apiClient.deleteAdminUser(account.user);
      if (editingUser === account.user) resetForm();
      setNotice(`Akun ${account.user} berhasil dihapus.`);
      await refreshUsers();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
  };

  const removeFeedback = async (item: UserFeedback) => {
    if (!window.confirm(`Hapus feedback untuk menu "${item.menu}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    setError(null);
    setNotice(null);
    setDeletingFeedbackId(item.id);
    try {
      await apiClient.deleteAdminFeedback(item.id);
      setFeedbackItems((current) => current.filter((feedback) => feedback.id !== item.id));
      setNotice('Feedback berhasil dihapus.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setDeletingFeedbackId(null);
    }
  };

  const clearFeedback = async () => {
    if (
      feedbackItems.length === 0
      || !window.confirm(`Hapus semua ${feedbackItems.length} feedback? Tindakan ini tidak dapat dibatalkan.`)
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    setIsClearingFeedback(true);
    try {
      const result = await apiClient.clearAdminFeedback();
      setFeedbackItems([]);
      setNotice(`${result.deleted_count} feedback berhasil dihapus.`);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : String(clearError));
    } finally {
      setIsClearingFeedback(false);
    }
  };

  const handleDatabaseFileSelect = (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setDatabaseDialogError('Format file harus berupa CSV (.csv).');
      return;
    }
    setDatabaseFile(file);
    setDatabasePreview(null);
    setDatabaseDialogError(null);
    setDatabaseApplyFailed(false);
  };

  const handleDatabaseDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingDatabaseCsv(false);
    if (isPreviewingDatabaseChange || isApplyingDatabaseChange) return;
    const dropped = event.dataTransfer.files?.[0] ?? null;
    handleDatabaseFileSelect(dropped);
  };

  const previewDatabaseChange = async () => {
    const target = databaseTargets.find((item) => item.key === selectedDatabaseTarget);
    if (!target || (!databaseFile && target.operation !== 'sync')) return;
    setDatabaseDialogError(null);
    setNotice(null);
    setIsPreviewingDatabaseChange(true);
    try {
      let result: DatabaseMaintenancePreview;
      if (target.operation === 'sync') {
        result = await apiClient.previewDatabaseEmployeeSync(target.key);
      } else {
        if (!databaseFile) return;
        result = await apiClient.previewDatabaseMaintenanceCsv(target.key, databaseFile);
      }
      setDatabasePreview(result);
    } catch (previewError) {
      setDatabasePreview(null);
      setDatabaseDialogError(previewError instanceof Error ? previewError.message : String(previewError));
    } finally {
      setIsPreviewingDatabaseChange(false);
    }
  };

  const applyDatabaseChange = async () => {
    const target = databaseTargets.find((item) => item.key === selectedDatabaseTarget);
    if (!target || !databasePreview || (!databaseFile && target.operation !== 'sync')) return;
    setDatabaseDialogError(null);
    setNotice(null);
    setIsApplyingDatabaseChange(true);
    try {
      let result: DatabaseMaintenanceResult;
      if (target.operation === 'sync') {
        result = await apiClient.syncDatabaseEmployeeTable(target.key);
      } else {
        if (!databaseFile) return;
        result = await apiClient.applyDatabaseMaintenanceCsv(target.key, databaseFile);
      }
      setNotice(
        `Tabel ${target.table_name} berhasil diproses: ${result.row_count.toLocaleString()} baris; `
          + `${result.inserted_count.toLocaleString()} ditambahkan, `
          + `${result.updated_count.toLocaleString()} diperbarui, `
          + `${result.deleted_count.toLocaleString()} dihapus.`,
      );
      setShowSourceDialog(false);
      setDatabasePreview(null);
      setDatabaseFile(null);
      if (databaseFileInput.current) databaseFileInput.current.value = '';
      if (target.key === 'fetch_pbnopen' || target.key === 'dt_employee') {
        await refreshSourceSyncStatus();
      }
    } catch (applyError) {
      setDatabaseApplyFailed(true);
      setDatabaseDialogError(applyError instanceof Error ? applyError.message : String(applyError));
    } finally {
      setIsApplyingDatabaseChange(false);
    }
  };

  const handleLegacyFileSelect = (file: File | null) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      setLegacyError('Format file harus berupa .csv, .xlsx, atau .xls.');
      return;
    }
    setLegacyFile(file);
    setLegacyPreview(null);
    setLegacyError(null);
  };

  const handleLegacyDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingLegacyFile(false);
    if (legacyBusy) return;
    const dropped = event.dataTransfer.files?.[0] ?? null;
    handleLegacyFileSelect(dropped);
  };

  const previewLegacyUpload = async () => {
    if (!legacyFile) return;
    const year = Number(legacyYear);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setLegacyError('Tahun legacy harus berupa angka antara 2000 dan 2100.');
      return;
    }
    const quarter = Number(legacyQuarter.replace('Q', ''));
    setLegacyBusy(true);
    setLegacyError(null);
    setNotice(null);
    try {
      const result = await apiClient.previewLegacyDatabaseUpload(year, quarter, legacyFile);
      setLegacyPreview(result);
    } catch (previewError) {
      setLegacyPreview(null);
      setLegacyError(previewError instanceof Error ? previewError.message : String(previewError));
    } finally {
      setLegacyBusy(false);
    }
  };

  const createLegacyUpload = async () => {
    if (!legacyFile || !legacyPreview) return;
    const year = Number(legacyYear);
    const quarter = Number(legacyQuarter.replace('Q', ''));
    setLegacyBusy(true);
    setLegacyError(null);
    setNotice(null);
    try {
      const result = await apiClient.createLegacyDatabaseUpload(year, quarter, legacyFile);
      setNotice(
        `Database legacy ${result.period} berhasil dibuat: `
          + `${result.row_count.toLocaleString()} baris pada ${result.source_table}, `
          + `${result.inserted_count.toLocaleString()} pegawai ditambahkan, `
          + `${result.updated_count.toLocaleString()} diperbarui, `
          + `${result.deleted_count.toLocaleString()} dihapus.`,
      );
      setLegacyPreview(null);
      setLegacyFile(null);
      if (legacyFileInput.current) legacyFileInput.current.value = '';
      await refreshDatabaseTargets();
    } catch (createError) {
      setLegacyError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setLegacyBusy(false);
    }
  };

  // Filtered collections
  const normalizedUserQuery = userSearch.trim().toLowerCase();
  const filteredUsers = useMemo(
    () =>
      users.filter((account) => {
        const matchesQuery =
          !normalizedUserQuery
          || `${account.user} ${account.name} ${authLevelLabel(account.auth_level)}`
            .toLowerCase()
            .includes(normalizedUserQuery);
        const matchesRole = userRoleFilter === 'all' || account.auth_level === userRoleFilter;
        const matchesStatus =
          userStatusFilter === 'all'
          || (userStatusFilter === 'active' && account.is_active)
          || (userStatusFilter === 'inactive' && !account.is_active);
        return matchesQuery && matchesRole && matchesStatus;
      }),
    [users, normalizedUserQuery, userRoleFilter, userStatusFilter],
  );

  const activeUsersCount = useMemo(
    () => users.filter((account) => account.is_active).length,
    [users],
  );

  const feedbackMenuOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of feedbackItems) {
      counts.set(item.menu, (counts.get(item.menu) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [feedbackItems]);

  const normalizedFeedbackQuery = feedbackSearch.trim().toLowerCase();
  const filteredFeedback = useMemo(
    () =>
      feedbackItems.filter((item) => {
        const matchesMenu = feedbackMenuFilter === 'all' || item.menu === feedbackMenuFilter;
        const matchesQuery =
          !normalizedFeedbackQuery
          || `${item.feedback} ${item.submitted_by ?? ''} ${item.menu}`
            .toLowerCase()
            .includes(normalizedFeedbackQuery);
        return matchesMenu && matchesQuery;
      }),
    [feedbackItems, feedbackMenuFilter, normalizedFeedbackQuery],
  );

  const normalizedMenuQuery = menuSearch.trim().toLowerCase();
  const filteredMenuPolicies = useMemo(
    () =>
      menuAccessDraft.filter((policy) => {
        if (!normalizedMenuQuery) return true;
        const label = menuAccessLabels[policy.menu_key] ?? policy.menu_key;
        return `${label} ${policy.menu_key}`.toLowerCase().includes(normalizedMenuQuery);
      }),
    [menuAccessDraft, normalizedMenuQuery],
  );

  const originalPolicyMap = useMemo(
    () => new Map(menuPolicies.map((policy) => [policy.menu_key, policy])),
    [menuPolicies],
  );

  return (
    <main className="admin-page relative isolate min-h-screen bg-surface-950 px-4 pb-16 pt-24 text-slate-100 md:px-8">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_75%_40%_at_50%_-5%,rgba(14,165,233,0.12),transparent)]"
        aria-hidden="true"
      />

      <div className="mx-auto max-w-7xl space-y-6">
        {/* Control Deck Header */}
        <header className="admin-header rounded-2xl border border-slate-700/80 bg-slate-900/80 p-6 shadow-lg backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                <span>Administrasi Sistem</span>
              </div>
              <h1 className="mt-2.5 text-2xl font-bold tracking-tight sm:text-3xl">Admin Console</h1>
              <p className="mt-1 text-sm text-slate-400">
                Masuk sebagai <span className="font-medium text-slate-200">{currentUser?.name}</span> ·{' '}
                <span className="text-sky-300">{authLevelLabel(currentUser?.auth_level ?? 1)}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link to="/" className="btn-secondary rounded-xl">
                ← Kembali ke Menu
              </Link>
            </div>
          </div>

          {/* Telemetry Overview Strip */}
          <div className="mt-6 grid grid-cols-1 gap-3 border-t border-slate-800 pt-5 sm:grid-cols-3">
            <div className="admin-subpanel rounded-xl border border-slate-700/80 bg-slate-950/50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Akun Terdaftar</p>
              <p className="mt-1 text-xl font-bold text-slate-100">
                {canManageAdmin ? users.length : '—'}{' '}
                {canManageAdmin && (
                  <span className="text-xs font-normal text-emerald-300">({activeUsersCount} aktif)</span>
                )}
              </p>
            </div>

            <div className="admin-subpanel rounded-xl border border-slate-700/80 bg-slate-950/50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Feedback Masuk</p>
              <p className="mt-1 text-xl font-bold text-slate-100">
                {feedbackItems.length}{' '}
                <span className="text-xs font-normal text-slate-400">pesan pengguna</span>
              </p>
            </div>

            <div className="admin-subpanel rounded-xl border border-slate-700/80 bg-slate-950/50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sync Sumber Pegawai</p>
              <p className="mt-1 truncate text-sm font-medium text-slate-200">
                {sourceSyncStatus?.last_synced_at
                  ? formatSourceSyncDate(sourceSyncStatus.last_synced_at)
                  : 'Belum ada riwayat sync'}
              </p>
            </div>
          </div>
        </header>

        {/* Global Status Banner */}
        {(error || notice) && (
          <div
            role={error ? 'alert' : 'status'}
            className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
              error
                ? 'border-rose-700/50 bg-rose-900/20 text-rose-200'
                : 'border-emerald-700/50 bg-emerald-900/20 text-emerald-200'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {error ? (
                <svg aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-7.5 13A1 1 0 003.65 18h16.7a1 1 0 00.86-1.5l-7.5-13a1 1 0 00-1.72 0z" />
                </svg>
              ) : (
                <svg aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              <span>{error ?? notice}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setNotice(null);
              }}
              aria-label="Tutup notifikasi"
              className="rounded-lg p-1 text-xs opacity-75 transition hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* Main Shell: Left Sidebar Navigation + Workspace */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* LEFT SIDEBAR */}
          <aside className="admin-card card p-3.5 lg:sticky lg:top-24 lg:col-span-3">
            <nav aria-label="Navigasi Admin Console" className="space-y-4">
              <div>
                <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Operasional
                </p>
                <div className="mt-2 flex flex-col gap-1">
                  <button
                    type="button"
                    aria-current={activeTab === 'accounts' ? 'page' : undefined}
                    onClick={() => selectTab('accounts')}
                    className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                      activeTab === 'accounts'
                        ? 'bg-sky-500 text-white shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4.13a4 4 0 11-8 0 4 4 0 018 0zm6 2a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>Manajemen Akun</span>
                    </span>
                    {canManageAdmin && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          activeTab === 'accounts'
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {users.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    aria-current={activeTab === 'feedback' ? 'page' : undefined}
                    onClick={() => selectTab('feedback')}
                    className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                      activeTab === 'feedback'
                        ? 'bg-sky-500 text-white shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 10h8m-8 4h5m-9 5l3.5-3H19a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2h1v3z" />
                      </svg>
                      <span>Feedback Pengguna</span>
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        activeTab === 'feedback'
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {feedbackItems.length}
                    </span>
                  </button>
                </div>
              </div>

              {((currentUser?.auth_level ?? 0) >= 2 || isGodUser) && (
                <div className="border-t border-slate-800 pt-4">
                  <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Sistem & Akses
                  </p>
                  <div className="mt-2 flex flex-col gap-1">
                    {(currentUser?.auth_level ?? 0) >= 2 && (
                      <button
                        type="button"
                        aria-current={activeTab === 'database' ? 'page' : undefined}
                        onClick={() => selectTab('database')}
                        className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                          activeTab === 'database'
                            ? 'bg-sky-500 text-white shadow-sm'
                            : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100'
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <ellipse cx="12" cy="5" rx="8" ry="3" strokeWidth={1.8} />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
                          </svg>
                          <span>Database & Sync</span>
                        </span>
                      </button>
                    )}

                    {isGodUser && (
                      <button
                        type="button"
                        aria-current={activeTab === 'auth-menu' ? 'page' : undefined}
                        onClick={() => selectTab('auth-menu')}
                        className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                          activeTab === 'auth-menu'
                            ? 'bg-amber-500 text-slate-950 shadow-sm'
                            : 'text-amber-200/90 hover:bg-amber-500/10 hover:text-amber-200'
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3l8 3v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4" />
                          </svg>
                          <span>Set Auth Menu</span>
                        </span>
                        {modifiedMenuKeys.size > 0 && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              activeTab === 'auth-menu'
                                ? 'bg-slate-950/20 text-slate-950'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {modifiedMenuKeys.size}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </nav>

            <div className="admin-subpanel mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
              <p className="font-semibold text-slate-300">Hak Akses Anda</p>
              <p className="mt-1 leading-relaxed">
                {isGodUser
                  ? 'Akses penuh ke akun, database, legacy upload, dan kebijakan menu.'
                  : canManageAdmin
                    ? 'Akses penuh ke manajemen akun, feedback, database, dan legacy upload.'
                    : 'Akses terbatas pada pemantauan feedback dan status sinkronisasi.'}
              </p>
            </div>
          </aside>

          {/* WORKSPACE CONTENT AREA */}
          <div className="space-y-6 lg:col-span-9">
            {/* TAB 1: ACCOUNTS */}
            {activeTab === 'accounts' && (
              canManageAdmin ? (
                <div className="grid gap-6 xl:grid-cols-12">
                  {/* Account Form Card */}
                  <section className="admin-card card h-fit p-5 xl:col-span-5">
                    <div className="flex items-start justify-between gap-2 border-b border-slate-700/80 pb-3.5">
                      <div>
                        <h2 className="text-base font-semibold">
                          {editingUser ? `Edit Akun: @${editingUser}` : 'Tambah Akun Baru'}
                        </h2>
                        <p className="mt-1 text-xs text-slate-400">
                          Level 1 User · Level 2 Special · Level 3 Super Admin{isGodUser ? ' · Level 4 God' : ''}.
                        </p>
                      </div>
                      {editingUser && (
                        <span className="rounded-full border border-sky-500/40 bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-medium text-sky-300">
                          Mode Edit
                        </span>
                      )}
                    </div>

                    <form onSubmit={(event) => void submitUser(event)} className="mt-4 space-y-4">
                      {!editingUser && (
                        <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">
                          Username
                          <input
                            required
                            minLength={3}
                            maxLength={80}
                            pattern="[^\s]+"
                            title="Username tidak boleh mengandung spasi"
                            placeholder="contoh: budi.santoso"
                            value={form.user}
                            onChange={(event) => setForm((value) => ({ ...value, user: event.target.value }))}
                            className="input mt-1.5 normal-case"
                          />
                        </label>
                      )}

                      <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">
                        Nama Lengkap
                        <input
                          required
                          maxLength={200}
                          placeholder="Nama tampilan pengguna"
                          value={form.name}
                          onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
                          className="input mt-1.5 normal-case"
                        />
                      </label>

                      <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">
                        Auth Level
                        <select
                          value={form.auth_level}
                          onChange={(event) =>
                            setForm((value) => ({
                              ...value,
                              auth_level: Number(event.target.value) as AssignableAuthLevel,
                            }))
                          }
                          className="input mt-1.5 normal-case"
                        >
                          <option value={1}>1 · User</option>
                          <option value={2}>2 · Special User</option>
                          <option value={3}>3 · Super Admin</option>
                          {isGodUser && <option value={4}>4 · God User</option>}
                        </select>
                      </label>

                      <div className="block text-xs font-medium uppercase tracking-wider text-slate-400">
                        <label htmlFor="admin-user-password">
                          {editingUser ? 'Password Baru (Opsional)' : 'Password'}
                        </label>
                        <div className="relative mt-1.5">
                          <input
                            id="admin-user-password"
                            required={!editingUser}
                            minLength={4}
                            maxLength={255}
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            placeholder={editingUser ? 'Kosongkan jika tidak diubah' : 'Minimal 4 karakter'}
                            value={form.password}
                            onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))}
                            className="input pr-16 normal-case"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="absolute inset-y-0 right-2.5 my-auto h-7 rounded px-2 text-[11px] font-medium text-slate-400 hover:text-slate-200"
                          >
                            {showPassword ? 'Sembunyi' : 'Lihat'}
                          </button>
                        </div>
                      </div>

                      {editingUser && (
                        <label className="flex items-center gap-2.5 rounded-lg border border-slate-700/80 bg-slate-900/40 px-3 py-2 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={(event) => setForm((value) => ({ ...value, is_active: event.target.checked }))}
                            className="rounded border-slate-600"
                          />
                          Akun aktif (dapat login)
                        </label>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <button type="submit" disabled={isSaving} className="btn-primary flex-1 justify-center">
                          {isSaving ? <Spinner size="sm" label="Menyimpan…" /> : editingUser ? 'Simpan Perubahan' : 'Buat Akun'}
                        </button>
                        {editingUser && (
                          <button type="button" onClick={resetForm} disabled={isSaving} className="btn-secondary">
                            Batal
                          </button>
                        )}
                      </div>
                    </form>
                  </section>

                  {/* Account Directory Table */}
                  <section className="admin-card card overflow-hidden xl:col-span-7">
                    <div className="space-y-3 border-b border-slate-700/80 px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h2 className="text-base font-semibold">Daftar Akun Pengguna</h2>
                          <p className="mt-0.5 text-xs text-slate-400">
                            Menampilkan {filteredUsers.length} dari {users.length} akun terdaftar.
                          </p>
                        </div>
                        {(userSearch || userRoleFilter !== 'all' || userStatusFilter !== 'all') && (
                          <button
                            type="button"
                            onClick={() => {
                              setUserSearch('');
                              setUserRoleFilter('all');
                              setUserStatusFilter('all');
                            }}
                            className="text-xs font-medium text-sky-400 hover:text-sky-300"
                          >
                            Reset Filter
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                        <input
                          type="search"
                          value={userSearch}
                          onChange={(event) => setUserSearch(event.target.value)}
                          placeholder="Cari username atau nama..."
                          aria-label="Cari username atau nama"
                          className="input sm:col-span-6"
                        />
                        <select
                          value={userRoleFilter}
                          onChange={(event) =>
                            setUserRoleFilter(
                              event.target.value === 'all' ? 'all' : (Number(event.target.value) as AuthLevel),
                            )
                          }
                          aria-label="Filter role akun"
                          className="input sm:col-span-3"
                        >
                          <option value="all">Semua Role</option>
                          <option value={1}>1 · User</option>
                          <option value={2}>2 · Special</option>
                          <option value={3}>3 · Super Admin</option>
                          <option value={4}>4 · God User</option>
                        </select>
                        <select
                          value={userStatusFilter}
                          onChange={(event) => setUserStatusFilter(event.target.value as UserStatusFilter)}
                          aria-label="Filter status akun"
                          className="input sm:col-span-3"
                        >
                          <option value="all">Semua Status</option>
                          <option value="active">Aktif</option>
                          <option value="inactive">Nonaktif</option>
                        </select>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      {isLoading ? (
                        <div className="flex justify-center p-10">
                          <Spinner label="Memuat akun…" />
                        </div>
                      ) : (
                        <table className="w-full min-w-[540px] text-left text-sm">
                          <thead className="admin-table-head bg-slate-900/70 text-xs uppercase tracking-wider text-slate-400">
                            <tr>
                              <th className="px-5 py-3">Pengguna</th>
                              <th className="px-4 py-3">Peran</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-5 py-3 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {filteredUsers.map((account) => {
                              const isDisabled =
                                account.user === currentUser?.user
                                || (account.auth_level === 4 && currentUser?.auth_level !== 4);
                              const isBeingEdited = editingUser === account.user;

                              return (
                                <tr
                                  key={account.user}
                                  className={`transition-colors ${
                                    isBeingEdited ? 'bg-sky-500/10' : 'hover:bg-slate-800/40'
                                  }`}
                                >
                                  <td className="px-5 py-3.5">
                                    <div className="flex items-center gap-3">
                                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200">
                                        {getInitials(account.name, account.user)}
                                      </span>
                                      <div className="min-w-0">
                                        <p className="truncate font-medium text-slate-100">
                                          {account.name}{' '}
                                          {account.user === currentUser?.user && (
                                            <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-normal text-slate-400">
                                              Anda
                                            </span>
                                          )}
                                        </p>
                                        <p className="truncate font-mono text-xs text-slate-400">@{account.user}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <RoleBadge level={account.auth_level} />
                                  </td>
                                  <td className="px-4 py-3.5">
                                    {account.is_active ? (
                                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                        Aktif
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-300">
                                        <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                                        Nonaktif
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-5 py-3.5 text-right">
                                    <div className="inline-flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => startEditing(account)}
                                        disabled={isDisabled}
                                        className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void removeUser(account)}
                                        disabled={isDisabled}
                                        className="btn-danger px-3 py-1.5 text-xs disabled:opacity-40"
                                      >
                                        Hapus
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {filteredUsers.length === 0 && (
                              <tr>
                                <td colSpan={4} className="px-5 py-10 text-center text-slate-400">
                                  Tidak ada akun yang cocok dengan filter saat ini.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </section>
                </div>
              ) : (
                <section className="admin-card card p-6">
                  <h2 className="font-semibold">Manajemen Akun</h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Pengelolaan akun hanya tersedia untuk Super Admin (level 3) dan God User (level 4).
                  </p>
                </section>
              )
            )}

            {/* TAB 2: FEEDBACK */}
            {activeTab === 'feedback' && (
              <section className="admin-card card overflow-hidden">
                <div className="space-y-3 border-b border-slate-700/80 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="text-base font-semibold">Feedback Pengguna</h2>
                      <p className="mt-0.5 text-xs text-slate-400">
                        Menampilkan {filteredFeedback.length} dari {feedbackItems.length} masukan pengguna.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {(feedbackSearch || feedbackMenuFilter !== 'all') && (
                        <button
                          type="button"
                          onClick={() => {
                            setFeedbackSearch('');
                            setFeedbackMenuFilter('all');
                          }}
                          className="btn-secondary text-xs"
                        >
                          Reset Filter
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void clearFeedback()}
                        disabled={
                          !feedbackItems.length
                          || isLoadingFeedback
                          || isClearingFeedback
                          || deletingFeedbackId !== null
                        }
                        className="btn-danger text-xs disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isClearingFeedback ? <Spinner size="sm" label="Menghapus…" /> : 'Hapus Semua Feedback'}
                      </button>
                    </div>
                  </div>

                  {/* Feedback Filter Bar */}
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                    <input
                      type="search"
                      value={feedbackSearch}
                      onChange={(event) => setFeedbackSearch(event.target.value)}
                      placeholder="Cari isi feedback atau pengirim..."
                      aria-label="Cari isi feedback atau pengirim"
                      className="input sm:col-span-7"
                    />
                    <select
                      value={feedbackMenuFilter}
                      onChange={(event) => setFeedbackMenuFilter(event.target.value)}
                      aria-label="Filter berdasarkan menu"
                      className="input sm:col-span-5"
                    >
                      <option value="all">Semua Menu ({feedbackItems.length})</option>
                      {feedbackMenuOptions.map(([menu, count]) => (
                        <option key={menu} value={menu}>
                          {menu} ({count})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {isLoadingFeedback ? (
                  <div className="flex justify-center p-10">
                    <Spinner label="Memuat feedback…" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="admin-table-head bg-slate-900/70 text-xs uppercase tracking-wider text-slate-400">
                        <tr>
                          <th className="px-5 py-3">Dikirim</th>
                          <th className="px-4 py-3">Pengguna</th>
                          <th className="px-4 py-3">Menu</th>
                          <th className="px-4 py-3">Feedback</th>
                          <th className="px-5 py-3 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {filteredFeedback.map((item) => (
                          <tr key={item.id} className="transition-colors hover:bg-slate-800/40">
                            <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-400">
                              {formatFeedbackDate(item.created_at)}
                            </td>
                            <td className="px-4 py-3.5 font-medium text-slate-200">
                              {item.submitted_by ?? <span className="italic text-slate-500">Akun dihapus</span>}
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="inline-flex rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-300">
                                {item.menu}
                              </span>
                            </td>
                            <td className="max-w-md whitespace-pre-wrap break-words px-4 py-3.5 text-slate-200">
                              {item.feedback}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => void removeFeedback(item)}
                                disabled={isClearingFeedback || deletingFeedbackId !== null}
                                className="btn-danger px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {deletingFeedbackId === item.id ? 'Menghapus…' : 'Hapus'}
                              </button>
                            </td>
                          </tr>
                        ))}
                        {filteredFeedback.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-5 py-10 text-center text-slate-400">
                              {feedbackItems.length === 0
                                ? 'Belum ada feedback pengguna.'
                                : 'Tidak ada feedback yang cocok dengan filter saat ini.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* TAB 3: CONSOLIDATED DATABASE & SYNC */}
            {activeTab === 'database' && (currentUser?.auth_level ?? 0) >= 2 && (
              <div className="space-y-6">
                {/* Part 1: Employee Data Source & Table Maintenance */}
                <section className="admin-card card p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-700/80 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold">Employee Data Source & Pemeliharaan Tabel</h2>
                        <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-300">
                          Live DB
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Kelola sinkronisasi tabel referensi pegawai <code>pbncleaner.fetch_pbnopen</code>,{' '}
                        <code>dt_employee</code>, dan tabel master lainnya.
                      </p>
                    </div>

                    {canManageAdmin && (
                      <div className="flex flex-wrap gap-2.5">
                        <button
                          type="button"
                          onClick={() => openDatabaseDialog('dt_employee')}
                          disabled={isApplyingDatabaseChange || isPreviewingDatabaseChange}
                          className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Sync dt_employee
                        </button>
                        <button
                          type="button"
                          onClick={() => openDatabaseDialog('fetch_pbnopen')}
                          disabled={isApplyingDatabaseChange || isPreviewingDatabaseChange}
                          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Database Management
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="admin-subpanel mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-700/80 bg-slate-900/50 p-5 text-sm">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Re-sync Terakhir (fetch_pbnopen)
                      </p>
                      {isLoadingSourceSync ? (
                        <div className="mt-3">
                          <Spinner size="sm" label="Memuat status sumber data…" />
                        </div>
                      ) : sourceSyncError ? (
                        <p role="alert" className="mt-2 text-rose-300">
                          {sourceSyncError}
                        </p>
                      ) : sourceSyncStatus?.last_synced_at ? (
                        <div className="mt-2 space-y-1">
                          <p className="flex items-center gap-2 text-base font-semibold text-slate-100">
                            <span className="h-2 w-2 rounded-full bg-emerald-400" />
                            {formatSourceSyncDate(sourceSyncStatus.last_synced_at)}
                          </p>
                          <p className="text-slate-400">
                            Dilakukan oleh:{' '}
                            <span className="font-medium text-slate-200">
                              {sourceSyncStatus.synced_by_name || sourceSyncStatus.synced_by_user}
                            </span>
                            {sourceSyncStatus.synced_by_name && sourceSyncStatus.synced_by_user
                              ? ` (@${sourceSyncStatus.synced_by_user})`
                              : ''}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-slate-400">Belum ada catatan re-sync melalui aplikasi.</p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => void refreshSourceSyncStatus()}
                      disabled={isLoadingSourceSync}
                      className="btn-secondary text-xs disabled:opacity-50"
                    >
                      Refresh Status
                    </button>
                  </div>
                </section>

                {/* Part 2: Legacy Database Upload (Level 3 & Level 4) */}
                {canManageAdmin && (
                  <section className="admin-card card p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-700/80 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-semibold">Legacy Database Upload (Arsip Triwulanan)</h2>
                          <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-medium text-indigo-300">
                            Snapshot Historis
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          Buat pasangan tabel PBN legacy dan pegawai untuk satu tahun serta triwulan. Tabel yang
                          sudah ada akan diganti setelah pratinjau dikonfirmasi.
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-5 lg:grid-cols-12">
                      {/* Step 1 & 2: Period & File Dropzone */}
                      <div className="admin-subpanel flex flex-col justify-between rounded-xl border border-slate-700/80 bg-slate-950/40 p-5 lg:col-span-6">
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              1. Tahun
                              <input
                                type="number"
                                min={2000}
                                max={2100}
                                value={legacyYear}
                                disabled={legacyBusy}
                                onChange={(event) => {
                                  setLegacyYear(event.target.value);
                                  setLegacyPreview(null);
                                  setLegacyError(null);
                                }}
                                className="input mt-1.5 normal-case"
                              />
                            </label>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                              2. Triwulan
                              <select
                                value={legacyQuarter}
                                disabled={legacyBusy}
                                onChange={(event) => {
                                  setLegacyQuarter(event.target.value);
                                  setLegacyPreview(null);
                                  setLegacyError(null);
                                }}
                                className="input mt-1.5 normal-case"
                              >
                                <option value="Q1">Triwulan I (Q1)</option>
                                <option value="Q2">Triwulan II (Q2)</option>
                                <option value="Q3">Triwulan III (Q3)</option>
                                <option value="Q4">Triwulan IV (Q4)</option>
                              </select>
                            </label>
                          </div>

                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                              3. File PBN Open (.csv / .xlsx / .xls)
                            </p>
                            <input
                              ref={legacyFileInput}
                              type="file"
                              accept=".csv,.xlsx,.xls,text/csv"
                              className="sr-only"
                              aria-label="Pilih file PBN legacy"
                              onChange={(event) => {
                                handleLegacyFileSelect(event.currentTarget.files?.[0] ?? null);
                                event.currentTarget.value = '';
                              }}
                            />

                            <div
                              onDragOver={(event) => {
                                event.preventDefault();
                                if (!legacyBusy) setIsDraggingLegacyFile(true);
                              }}
                              onDragLeave={() => setIsDraggingLegacyFile(false)}
                              onDrop={handleLegacyDrop}
                              className={`mt-2 rounded-xl border border-dashed p-4 transition ${
                                isDraggingLegacyFile
                                  ? 'border-sky-400 bg-sky-500/10'
                                  : 'border-slate-600 bg-slate-950/60 hover:border-slate-500'
                              }`}
                            >
                              {legacyFile ? (
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-slate-100">{legacyFile.name}</p>
                                    <p className="mt-0.5 text-xs text-slate-400">
                                      Ukuran: {formatFileSize(legacyFile.size)}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => legacyFileInput.current?.click()}
                                      disabled={legacyBusy}
                                      className="btn-secondary px-3 py-1.5 text-xs"
                                    >
                                      Ganti
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setLegacyFile(null);
                                        setLegacyPreview(null);
                                        setLegacyError(null);
                                      }}
                                      disabled={legacyBusy}
                                      className="btn-danger px-2.5 py-1.5 text-xs"
                                      aria-label="Hapus file legacy terpilih"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center py-3 text-center">
                                  <p className="text-sm text-slate-300">
                                    Seret & lepas file PBN Open di sini, atau
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => legacyFileInput.current?.click()}
                                    disabled={legacyBusy}
                                    className="btn-secondary mt-2.5 text-xs"
                                  >
                                    Pilih File dari Komputer
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {legacyError && (
                            <p
                              role="alert"
                              className="rounded-xl border border-rose-700/50 bg-rose-900/20 px-4 py-2.5 text-sm text-rose-200"
                            >
                              {legacyError}
                            </p>
                          )}
                        </div>

                        <div className="mt-5 flex flex-wrap justify-end gap-2.5 border-t border-slate-800 pt-4">
                          {legacyPreview && (
                            <button
                              type="button"
                              onClick={() => setLegacyPreview(null)}
                              disabled={legacyBusy}
                              className="btn-secondary"
                            >
                              Batal Pratinjau
                            </button>
                          )}
                          {legacyPreview ? (
                            <button
                              type="button"
                              onClick={() => void createLegacyUpload()}
                              disabled={legacyBusy}
                              className="btn-danger disabled:opacity-50"
                            >
                              {legacyBusy ? <Spinner size="sm" label="Membuat tabel…" /> : 'Konfirmasi & Buat Tabel'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void previewLegacyUpload()}
                              disabled={legacyBusy || !legacyFile}
                              className="btn-primary disabled:opacity-50"
                            >
                              {legacyBusy ? <Spinner size="sm" label="Memvalidasi…" /> : 'Validasi & Pratinjau'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Step 3: Rich Legacy Preview */}
                      <div className="admin-subpanel rounded-xl border border-slate-700/80 bg-slate-950/40 p-5 lg:col-span-6">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Pratinjau Target Database
                          </p>
                          {legacyPreview && (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                              Siap Diproses
                            </span>
                          )}
                        </div>

                        {legacyPreview ? (
                          <div className="mt-3 space-y-3.5 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3.5 py-2.5">
                              <span className="font-semibold text-slate-100">Periode {legacyPreview.period}</span>
                              <span className="rounded-md bg-sky-500/15 px-2.5 py-0.5 font-mono text-xs font-semibold text-sky-300">
                                {legacyPreview.row_count.toLocaleString()} baris valid
                              </span>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[11px] uppercase tracking-wider text-slate-400">
                                    Sumber PBN Open
                                  </p>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                      legacyPreview.source_table_exists
                                        ? 'bg-amber-500/15 text-amber-300'
                                        : 'bg-emerald-500/15 text-emerald-300'
                                    }`}
                                  >
                                    {legacyPreview.source_table_exists ? 'Timpa Tabel' : 'Tabel Baru'}
                                  </span>
                                </div>
                                <code className="mt-1.5 block break-all text-xs text-sky-300">
                                  {legacyPreview.source_table}
                                </code>
                                <p className="mt-1.5 text-xs text-slate-400">
                                  {legacyPreview.source_table_exists
                                    ? 'Tabel lama pada periode ini akan diganti.'
                                    : 'Tabel baru akan dibuat otomatis.'}
                                </p>
                              </div>

                              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[11px] uppercase tracking-wider text-slate-400">
                                    Tabel Pegawai Legacy
                                  </p>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                      legacyPreview.employee_table_exists
                                        ? 'bg-amber-500/15 text-amber-300'
                                        : 'bg-emerald-500/15 text-emerald-300'
                                    }`}
                                  >
                                    {legacyPreview.employee_table_exists ? 'Sinkron Ulang' : 'Tabel Baru'}
                                  </span>
                                </div>
                                <code className="mt-1.5 block break-all text-xs text-emerald-300">
                                  {legacyPreview.employee_table}
                                </code>
                                <p className="mt-1.5 text-xs text-slate-400">
                                  {legacyPreview.employee_table_exists
                                    ? 'Data pegawai lama akan disinkronkan ulang.'
                                    : 'Tabel pegawai baru akan dibuat.'}
                                </p>
                              </div>
                            </div>

                            {(legacyPreview.source_table_exists || legacyPreview.employee_table_exists) && (
                              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                                Perhatian: Salah satu atau kedua tabel untuk periode {legacyPreview.period} sudah ada dan
                                akan ditimpa saat Anda menekan tombol konfirmasi.
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="mt-4 flex flex-col justify-center rounded-xl border border-slate-800/80 bg-slate-900/30 p-5 text-sm text-slate-400">
                            <p className="font-medium text-slate-300">Belum ada pratinjau aktif</p>
                            <p className="mt-1 text-xs leading-relaxed">
                              Pilih tahun, triwulan, dan unggah file PBN Open lalu klik{' '}
                              <span className="font-semibold text-slate-200">Validasi & Pratinjau</span> untuk memeriksa
                              skema kolom, NIP, pemetaan referensi, serta target nama tabel sebelum menulis ke database.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* TAB 4: SET AUTH MENU (LEVEL 4 GOD USER ONLY) */}
            {activeTab === 'auth-menu' && isGodUser && (
              <section className="admin-card card overflow-hidden">
                <div className="space-y-3 border-b border-slate-700/80 px-6 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold">Set Auth Menu</h2>
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                          God User Only
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Atur level minimum untuk melihat (View) dan mengubah (Edit) setiap menu aplikasi. God User
                        selalu memiliki akses penuh.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      {modifiedMenuKeys.size > 0 && (
                        <button
                          type="button"
                          onClick={resetMenuAccessDraft}
                          disabled={isSavingMenuAccess}
                          className="btn-secondary text-xs disabled:opacity-50"
                        >
                          Reset Perubahan ({modifiedMenuKeys.size})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void saveMenuAccess()}
                        disabled={
                          isSavingMenuAccess
                          || modifiedMenuKeys.size === 0
                          || menuAccessDraft.length !== Object.keys(menuAccessLabels).length
                        }
                        className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSavingMenuAccess
                          ? <Spinner size="sm" label="Menyimpan…" />
                          : modifiedMenuKeys.size > 0
                            ? `Simpan ${modifiedMenuKeys.size} Perubahan`
                            : 'Simpan Pengaturan'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <input
                      type="search"
                      value={menuSearch}
                      onChange={(event) => setMenuSearch(event.target.value)}
                      placeholder="Cari nama menu atau key..."
                      aria-label="Cari nama menu atau key"
                      className="input w-full sm:w-72"
                    />
                    {modifiedMenuKeys.size > 0 && (
                      <span className="text-xs font-medium text-amber-300">
                        {modifiedMenuKeys.size} kebijakan menu memiliki perubahan belum disimpan.
                      </span>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="admin-table-head bg-slate-900/70 text-xs uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-6 py-3">Menu</th>
                        <th className="px-4 py-3">Minimum View</th>
                        <th className="px-4 py-3">Minimum Edit</th>
                        <th className="px-6 py-3 text-right">Status Kebijakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {filteredMenuPolicies.map((policy) => {
                        const editMinimum = Math.max(policy.view_level);
                        const isModified = modifiedMenuKeys.has(policy.menu_key);
                        const original = originalPolicyMap.get(policy.menu_key);

                        return (
                          <tr
                            key={policy.menu_key}
                            className={`transition-colors ${
                              isModified ? 'bg-amber-500/10' : 'hover:bg-slate-800/30'
                            }`}
                          >
                            <th className="px-6 py-3.5 font-medium text-slate-200">
                              <p>{menuAccessLabels[policy.menu_key]}</p>
                              <p className="font-mono text-[11px] font-normal text-slate-400">{policy.menu_key}</p>
                            </th>
                            <td className="px-4 py-3.5">
                              <select
                                aria-label={`${menuAccessLabels[policy.menu_key]} minimum View`}
                                className="input min-w-40"
                                value={policy.view_level}
                                onChange={(event) =>
                                  updateMenuAccessDraft(
                                    policy.menu_key,
                                    'view_level',
                                    Number(event.target.value),
                                  )
                                }
                              >
                                {accessLevels.map((level) => (
                                  <option key={level.value} value={level.value}>
                                    {level.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3.5">
                              <select
                                aria-label={`${menuAccessLabels[policy.menu_key]} minimum Edit`}
                                className="input min-w-40"
                                value={policy.edit_level}
                                onChange={(event) =>
                                  updateMenuAccessDraft(
                                    policy.menu_key,
                                    'edit_level',
                                    Number(event.target.value),
                                  )
                                }
                              >
                                {accessLevels
                                  .filter((level) => level.value >= editMinimum)
                                  .map((level) => (
                                    <option key={level.value} value={level.value}>
                                      {level.label}
                                    </option>
                                  ))}
                              </select>
                            </td>
                            <td className="px-6 py-3.5 text-right text-xs">
                              {isModified && original ? (
                                <div className="inline-flex flex-col items-end">
                                  <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 font-semibold text-amber-300">
                                    Diubah
                                  </span>
                                  <span className="mt-1 text-[11px] text-slate-400">
                                    Semula: V:{accessLevelName(original.view_level)} / E:
                                    {accessLevelName(original.edit_level)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-500">Tersimpan</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredMenuPolicies.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-10 text-center text-slate-400">
                            Tidak ada menu yang cocok dengan pencarian Anda.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {menuAccessError && (
                  <div className="px-6 pb-5 pt-3">
                    <p
                      className="rounded-xl border border-rose-700/50 bg-rose-900/20 px-4 py-2.5 text-sm text-rose-200"
                      role="alert"
                    >
                      {menuAccessError}
                    </p>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>

      {/* DATABASE MANAGEMENT DIALOG (LEVEL 3 & LEVEL 4) */}
      {showSourceDialog && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget
              && !isPreviewingDatabaseChange
              && !isApplyingDatabaseChange
            ) {
              closeSourceDialog();
            }
          }}
        >
          <section
            className="admin-modal w-full max-w-xl rounded-2xl border border-sky-500/40 bg-slate-900 p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="database-management-title"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
              <h2 id="database-management-title" className="text-lg font-semibold text-sky-200">
                Database Management
              </h2>
              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                Super Admin & God User
              </span>
            </div>

            {!canManageAdmin ? (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-rose-700/50 bg-rose-900/20 p-3.5 text-sm text-rose-200"
              >
                You have no authority to view this page.
              </p>
            ) : isLoadingDatabaseTargets ? (
              <div className="flex justify-center py-10">
                <Spinner label="Memuat tabel database…" />
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex items-end justify-between gap-3">
                  <label className="block flex-1 text-sm text-slate-300">
                    Tabel database
                    <select
                      value={selectedDatabaseTarget}
                      onChange={(event) => {
                        setSelectedDatabaseTarget(event.target.value);
                        setDatabaseFile(null);
                        setDatabasePreview(null);
                        setDatabaseDialogError(null);
                        setDatabaseApplyFailed(false);
                        if (databaseFileInput.current) databaseFileInput.current.value = '';
                      }}
                      className="input mt-1.5"
                    >
                      {databaseTargets.map((target) => (
                        <option key={target.key} value={target.key}>
                          {target.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => void refreshDatabaseTargets()}
                    disabled={isLoadingDatabaseTargets}
                    className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 text-sm text-sky-200 transition hover:border-sky-400/50 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Refresh/sync daftar tabel database"
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
                      <path d="M20 11a8 8 0 1 0-2.34 5.66" />
                      <path d="M20 4v7h-7" />
                    </svg>
                    Refresh
                  </button>
                </div>

                {(() => {
                  const target = databaseTargets.find((item) => item.key === selectedDatabaseTarget);
                  if (!target) return null;
                  if (target.operation === 'sync') {
                    return (
                      <p className="admin-subpanel rounded-xl border border-slate-700/80 bg-slate-950/40 p-3.5 text-sm text-slate-400">
                        Sinkronkan <code>{target.table_name}</code> dari <code>{target.source_table}</code>. NIP yang
                        cocok mempertahankan <code>employee_id</code>; data baru ditambahkan dan data yang sudah tidak
                        ada di sumber dihapus.
                      </p>
                    );
                  }
                  if (target.operation === 'reference') {
                    return (
                      <p className="admin-subpanel rounded-xl border border-slate-700/80 bg-slate-950/40 p-3.5 text-sm text-slate-400">
                        Unggah CSV untuk memperbarui <code>{target.table_name}</code> berdasarkan ID yang sudah ada. ID
                        yang masih dipakai tabel pegawai tidak dapat dihapus.
                      </p>
                    );
                  }
                  return (
                    <p className="admin-subpanel rounded-xl border border-slate-700/80 bg-slate-950/40 p-3.5 text-sm text-slate-400">
                      Unggah CSV UTF-8 untuk mengganti seluruh isi <code>pbncleaner.{target.table_name}</code>. Tabel
                      pegawai hanya dapat diubah melalui sinkronisasi.
                    </p>
                  );
                })()}

                {databaseTargets.find((item) => item.key === selectedDatabaseTarget)?.operation !== 'sync' && (
                  <>
                    <input
                      ref={databaseFileInput}
                      type="file"
                      accept=".csv,text/csv"
                      className="sr-only"
                      aria-label="Pilih CSV untuk tabel database"
                      onChange={(event) => {
                        handleDatabaseFileSelect(event.currentTarget.files?.[0] ?? null);
                        event.currentTarget.value = '';
                      }}
                    />
                    <div
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (!isPreviewingDatabaseChange && !isApplyingDatabaseChange) {
                          setIsDraggingDatabaseCsv(true);
                        }
                      }}
                      onDragLeave={() => setIsDraggingDatabaseCsv(false)}
                      onDrop={handleDatabaseDrop}
                      className={`admin-subpanel flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-3.5 transition ${
                        isDraggingDatabaseCsv
                          ? 'border-sky-400 bg-sky-500/10'
                          : 'border-slate-600 bg-slate-950/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-300">
                          {databaseFile ? databaseFile.name : 'Seret CSV ke sini atau pilih file'}
                        </p>
                        {databaseFile && (
                          <p className="text-xs text-slate-400">{formatFileSize(databaseFile.size)}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => databaseFileInput.current?.click()}
                        disabled={isPreviewingDatabaseChange || isApplyingDatabaseChange}
                        className="btn-secondary shrink-0"
                      >
                        {databaseFile ? 'Ganti CSV' : 'Pilih CSV'}
                      </button>
                    </div>
                  </>
                )}

                {databasePreview && (
                  <div className="admin-subpanel rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                    <p className="text-sm font-medium text-slate-200">
                      Pratinjau <code>{databasePreview.table_name}</code>
                      {databasePreview.filename ? ` · ${databasePreview.filename}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Tidak ada perubahan yang diterapkan sampai Anda memilih tombol konfirmasi.
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2.5 text-sm sm:grid-cols-4">
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <p className="text-[11px] uppercase text-slate-400">Di sumber</p>
                        <p className="mt-0.5 font-bold">{databasePreview.row_count.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <p className="text-[11px] uppercase text-slate-400">Ditambahkan</p>
                        <p className="mt-0.5 font-bold text-emerald-300">
                          {databasePreview.inserted_count.toLocaleString()}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <p className="text-[11px] uppercase text-slate-400">Diperbarui</p>
                        <p className="mt-0.5 font-bold text-sky-300">
                          {databasePreview.updated_count.toLocaleString()}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <p className="text-[11px] uppercase text-slate-400">Dihapus</p>
                        <p className="mt-0.5 font-bold text-rose-300">
                          {databasePreview.deleted_count.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {databasePreview.operation === 'replace' && (
                      <p className="mt-3 text-sm font-medium text-rose-200">
                        Seluruh {databasePreview.current_row_count.toLocaleString()} baris saat ini akan diganti.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {databaseDialogError && canManageAdmin && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-rose-700/50 bg-rose-900/20 px-4 py-2.5 text-sm text-rose-200"
              >
                {databaseDialogError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={closeSourceDialog}
                disabled={isPreviewingDatabaseChange || isApplyingDatabaseChange}
                className="btn-secondary"
              >
                Batal
              </button>
              {canManageAdmin && !isLoadingDatabaseTargets && databaseTargets.length > 0 && (
                databasePreview ? (
                  <button
                    type="button"
                    onClick={() => void applyDatabaseChange()}
                    disabled={isApplyingDatabaseChange || databaseApplyFailed}
                    className="btn-danger disabled:opacity-50"
                  >
                    {isApplyingDatabaseChange ? (
                      <Spinner size="sm" label="Menerapkan perubahan…" />
                    ) : databasePreview.operation === 'sync' ? (
                      'Ya, Sinkronkan'
                    ) : (
                      'Ya, Terapkan Perubahan'
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void previewDatabaseChange()}
                    disabled={
                      isPreviewingDatabaseChange
                      || (databaseTargets.find((item) => item.key === selectedDatabaseTarget)?.operation !== 'sync'
                        && !databaseFile)
                    }
                    className="btn-primary disabled:opacity-50"
                  >
                    {isPreviewingDatabaseChange ? (
                      <Spinner size="sm" label="Memeriksa tabel…" />
                    ) : databaseTargets.find((item) => item.key === selectedDatabaseTarget)?.operation === 'sync' ? (
                      'Pratinjau Sinkronisasi'
                    ) : (
                      'Pratinjau CSV'
                    )}
                  </button>
                )
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}