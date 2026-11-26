import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import * as apiClient from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useMenuAccess } from '../contexts/MenuAccessContext';
import type { MenuAccessKey, PltPlhMonitoringRecord } from '../types';

type FeatureGroup = 'Analytics & Insight' | 'Operasional' | 'Administrasi';
type FeatureStatus = 'ready' | 'beta' | 'experimental' | 'dev';
type FeatureIconName =
  | 'analytics'
  | 'insight'
  | 'dashboard'
  | 'people'
  | 'candidates'
  | 'document'
  | 'performance'
  | 'folder'
  | 'transfer'
  | 'fragment'
  | 'admin';

type Feature = {
  key: MenuAccessKey;
  title: string;
  subtitle: string;
  group: FeatureGroup;
  status: FeatureStatus;
  icon: FeatureIconName;
  path?: string;
  placeholder?: boolean;
  featured?: boolean;
  isNew?: boolean;
};

const features: Feature[] = [
  {
    key: 'analytics',
    title: 'PBN Analytics',
    subtitle: 'Unggah, bersihkan, ekspor, dan buat bahan mutasi secara otomatis',
    group: 'Analytics & Insight',
    status: 'ready',
    icon: 'analytics',
    path: '/pbn-analytics',
    featured: true,
  },
  {
    key: 'analisis-kinerja',
    title: 'Analisis Kinerja DJPb',
    subtitle: 'Dasbor skor kinerja pegawai lintas triwulan, perbandingan unit & koreksi E-PRIDE',
    group: 'Analytics & Insight',
    status: 'ready',
    icon: 'performance',
    path: '/analisis-kinerja',
    featured: true,
  },
  {
    key: 'insights-beta',
    title: 'Insight Hub Beta',
    subtitle: 'Dasbor demografi & distribusi pegawai langsung dari basis data PBN',
    group: 'Analytics & Insight',
    status: 'beta',
    icon: 'dashboard',
    path: '/insights-beta',
  },
  {
    key: 'analisis-mutasi',
    title: 'Analisis Mutasi/Promosi',
    subtitle: 'Eksplorasi kandidat mutasi, Talent Finder & pemetaan kategori eselon',
    group: 'Analytics & Insight',
    status: 'experimental',
    icon: 'transfer',
    path: '/analisis-mutasi',
  },
  {
    key: 'fragment-petikan',
    title: 'Fragment Petikan',
    subtitle: 'Pecah PDF menjadi fragment halaman bebas, tentukan teks nama, dan abaikan halaman tertentu',
    group: 'Operasional',
    status: 'experimental',
    icon: 'fragment',
    path: '/fragment-petikan',
  },
  {
    key: 'nd-undangan',
    title: 'Generate ND Undangan Pelantikan',
    subtitle: 'Proses multi-sheet roster, pencocokan NIP, dan unduh paket DOCX/ZIP otomatis',
    group: 'Operasional',
    status: 'ready',
    icon: 'document',
    path: '/undangan-pelantikan',
    featured: true,
  },
  {
    key: 'penyusunan-kandidat',
    title: 'Penyusunan Kandidat',
    subtitle: 'Pilih kandidat pegawai, simpan pertimbangan, dan hasilkan profil PPTX Single atau Batch',
    group: 'Operasional',
    status: 'ready',
    icon: 'candidates',
    path: '/penyusunan-kandidat',
    featured: true,
    isNew: true,
  },
  {
    key: 'plt-plh',
    title: 'Manajemen Plt./Plh.',
    subtitle: 'Pemantauan masa tugas penunjukan Plt./Plh. pejabat & pengingat jatuh tempo',
    group: 'Operasional',
    status: 'ready',
    icon: 'people',
    path: '/manajemen-plt-plh',
  },
  {
    key: 'progress-bahan',
    title: 'Bahan Pendukung MPK',
    subtitle: 'Pustaka bahan rapat dan pemantauan progres kelengkapan dokumen',
    group: 'Operasional',
    status: 'dev',
    icon: 'folder',
    placeholder: true,
  },
  {
    key: 'simulasi-mutasi',
    title: 'Simulasi Mutasi',
    subtitle: 'Simulasi skenario pergeseran dan proyeksi formasi DJPb',
    group: 'Operasional',
    status: 'dev',
    icon: 'transfer',
    placeholder: true,
  },
  {
    key: 'admin',
    title: 'Admin',
    subtitle: 'Pengelolaan akun pengguna, hak akses menu, dan pemeliharaan basis data',
    group: 'Administrasi',
    status: 'ready',
    icon: 'admin',
    path: '/admin',
  },
];

const groups: FeatureGroup[] = ['Analytics & Insight', 'Operasional', 'Administrasi'];
const featureKeys = new Set<string>(features.map((feature) => feature.key));
const FAVORITES_STORAGE_KEY = 'pbn.landing.favorites';
const RECENT_STORAGE_KEY = 'pbn.landing.recent';

function getWibGreeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Jakarta',
  }).format(new Date()));

  if (hour >= 4 && hour < 11) return 'Selamat pagi';
  if (hour >= 11 && hour < 15) return 'Selamat siang';
  if (hour >= 15 && hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function getWibDateLabel(): string {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date());
}

function readStoredKeys(storageKey: string): { keys: string[]; error: string | null } {
  try {
    const storedValue = window.localStorage.getItem(storageKey);
    if (!storedValue) return { keys: [], error: null };

    const parsed: unknown = JSON.parse(storedValue);
    if (!Array.isArray(parsed)) {
      throw new Error('Format preferensi tidak valid.');
    }

    const keys = parsed
      .filter((key): key is string => typeof key === 'string')
      .map((key) => (key === 'nd-undangan-experimental' ? 'nd-undangan' : key))
      .filter((key) => featureKeys.has(key));
    return { keys: [...new Set(keys)], error: null };
  } catch (error) {
    return {
      keys: [],
      error: `Preferensi menu tidak dapat dimuat: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function FeatureIcon({ name, className }: { name: FeatureIconName; className?: string }) {
  const paths: Record<FeatureIconName, ReactNode> = {
    analytics: (
      <>
        <path d="M4 19.5h16M6.5 16V10m5.5 6V5m5.5 11v-4" />
        <path d="M5 8.5l5-4 5 4 4-3" />
      </>
    ),
    insight: (
      <>
        <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
        <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15zM5 2l.7 2.3L8 5l-2.3.7L5 8l-.7-2.3L2 5l2.3-.7L5 2z" />
      </>
    ),
    dashboard: (
      <>
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="5" rx="1.5" />
        <rect x="13" y="10" width="8" height="11" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
      </>
    ),
    people: (
      <>
        <path d="M16 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </>
    ),
    candidates: (
      <>
        <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M16 11l2 2 4-4" />
      </>
    ),
    document: (
      <>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6M8 13h8M8 17h8" />
      </>
    ),
    performance: (
      <>
        <path d="M4 19.5h16M6.5 16v-3m5.5 3V6m5.5 10V9" />
        <path d="M5 9l5-4 5 2 4-4" />
      </>
    ),
    folder: (
      <path d="M3 6a2 2 0 012-2h5l2 2h7a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V6zM3 9h18" />
    ),
    transfer: (
      <>
        <path d="M7 7h13l-3-3M17 17H4l3 3" />
        <path d="M20 7l-3 3M4 17l3-3" />
      </>
    ),
    fragment: (
      <>
        <path d="M6 2h9l4 4v16H6zM15 2v5h5" />
        <path d="M9 11h7M9 15h7M9 19h4" />
        <path d="M3 7v10" />
      </>
    ),
    admin: (
      <>
        <path d="M12 3l8 3v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
  };

  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function StatusBadge({ feature }: { feature: Feature }) {
  if (feature.status === 'beta') {
    return (
      <span className="landing-status-badge landing-status-badge-beta badge shrink-0 border border-brand-500/30 bg-brand-500/10 text-sky-300">
        Beta
      </span>
    );
  }
  if (feature.status === 'experimental') {
    return (
      <span className="landing-status-badge landing-status-badge-exp badge shrink-0 border border-amber-500/30 bg-amber-500/10 text-amber-300">
        Eksperimental
      </span>
    );
  }
  if (feature.status === 'dev') {
    return (
      <span className="landing-status-badge landing-status-badge-dev badge shrink-0 border border-surface-700 bg-surface-800 text-slate-400">
        Roadmap v2.0
      </span>
    );
  }
  if (feature.status === 'ready') {
    return (
      <span className="landing-status-badge landing-status-badge-ready badge shrink-0 gap-1.5 border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Operational
      </span>
    );
  }
  return null;
}

function QuickAccessChip({
  feature,
  tag,
  onOpen,
}: {
  feature: Feature;
  tag: 'Recent' | 'Pinned';
  onOpen: (feature: Feature) => void;
}) {
  const isPinned = tag === 'Pinned';
  return (
    <button
      type="button"
      onClick={() => onOpen(feature)}
      className="landing-quick-chip group inline-flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-surface-700/80 bg-surface-800/30 py-1.5 pl-1.5 pr-3 text-left transition-colors hover:border-brand-500/50 hover:bg-surface-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 motion-reduce:transition-none"
    >
      <span className="landing-feature-icon flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-800 text-slate-300 transition-colors group-hover:text-sky-300">
        <FeatureIcon name={feature.icon} className="h-3.5 w-3.5" />
      </span>
      <span className="truncate text-sm text-slate-100">{feature.title}</span>
      <span className="sr-only">{isPinned ? 'Disematkan' : 'Terakhir dibuka'}</span>
      <svg
        className={`h-3.5 w-3.5 shrink-0 ${isPinned ? 'text-amber-300' : 'text-slate-400'}`}
        fill={isPinned ? 'currentColor' : 'none'}
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {isPinned ? (
          <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </>
        )}
      </svg>
    </button>
  );
}

function FeatureRow({
  feature,
  notificationCount,
  isFavorite,
  isLocked,
  onOpen,
  onToggleFavorite,
}: {
  feature: Feature;
  notificationCount: number;
  isFavorite: boolean;
  isLocked: boolean;
  onOpen: (feature: Feature) => void;
  onToggleFavorite: (feature: Feature) => void;
}) {
  const isDev = feature.status === 'dev';
  const iconTone = isDev
    ? 'border-surface-700/70 bg-surface-800/50 text-slate-500'
    : feature.featured
      ? 'border-brand-500/50 bg-brand-500/20 text-sky-200'
      : 'border-surface-700 bg-surface-800 text-slate-300';

  return (
    <li className="group/row relative">
      <button
        type="button"
        onClick={() => onOpen(feature)}
        className="flex w-full items-center gap-4 py-3.5 pl-4 pr-16 text-left transition-colors hover:bg-surface-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 motion-reduce:transition-none"
      >
        <span className={`landing-feature-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${iconTone}`}>
          <FeatureIcon name={feature.icon} className="h-5 w-5" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`text-sm font-semibold leading-snug ${isDev ? 'text-slate-300' : 'text-slate-100'}`}>
              {feature.title}
            </span>
            <StatusBadge feature={feature} />
            {feature.isNew && (
              <span className="landing-status-badge landing-status-badge-new badge shrink-0 border border-sky-400/40 bg-sky-500/15 text-sky-200">
                New
              </span>
            )}
            {feature.key === 'plt-plh' && notificationCount > 0 && (
              <span
                className="badge border border-amber-500/30 bg-amber-500/15 text-amber-300"
                aria-label={`${notificationCount} notifikasi`}
              >
                {notificationCount} perhatian
              </span>
            )}
          </span>
          <span className="mt-0.5 line-clamp-2 block max-w-2xl text-xs leading-relaxed text-slate-400">
            {feature.subtitle}
          </span>
        </span>

        {isLocked ? (
          <span title="Akses terbatas sesuai kebijakan peran" className="shrink-0 text-slate-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 018 0v3" />
            </svg>
            <span className="sr-only">Akses terbatas</span>
          </span>
        ) : (
          <svg
            className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-hover/row:translate-x-0.5 group-hover/row:text-sky-300 motion-reduce:transition-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        )}
      </button>

      <button
        type="button"
        onClick={() => onToggleFavorite(feature)}
        aria-label={isFavorite ? `Lepas sematan ${feature.title}` : `Sematkan ${feature.title}`}
        aria-pressed={isFavorite}
        title={isFavorite ? 'Lepas sematan' : 'Sematkan menu'}
        className={`absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
          isFavorite
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            : 'border-transparent text-slate-400 hover:border-surface-700 hover:bg-surface-800 hover:text-slate-200'
        }`}
      >
        <svg
          className="h-4 w-4"
          fill={isFavorite ? 'currentColor' : 'none'}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3z" />
        </svg>
      </button>
    </li>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canView, isLoading: isLoadingMenuAccess, error: menuAccessError, showNoAuth, reload } = useMenuAccess();
  const [notifications, setNotifications] = useState<PltPlhMonitoringRecord[]>([]);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [developmentMenu, setDevelopmentMenu] = useState<string | null>(null);
  const [passcodeFeature, setPasscodeFeature] = useState<Feature | null>(null);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<'ALL' | FeatureGroup>('ALL');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [initialPreferences] = useState(() => ({
    favorites: readStoredKeys(FAVORITES_STORAGE_KEY),
    recent: readStoredKeys(RECENT_STORAGE_KEY),
  }));
  const [favoriteKeys, setFavoriteKeys] = useState(initialPreferences.favorites.keys);
  const [recentKeys, setRecentKeys] = useState(initialPreferences.recent.keys);
  const [storageError, setStorageError] = useState<string | null>(
    initialPreferences.favorites.error ?? initialPreferences.recent.error,
  );

  useEffect(() => {
    apiClient.getPltPlhNotifications()
      .then(setNotifications)
      .catch((error: unknown) => {
        setNotificationError(error instanceof Error ? error.message : String(error));
      });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (passcodeFeature) {
          setPasscodeFeature(null);
          setPasscodeInput('');
          setPasscodeError(null);
          return;
        }
        if (developmentMenu) {
          setDevelopmentMenu(null);
          return;
        }
        if (searchQuery) {
          setSearchQuery('');
          return;
        }
      }

      const target = event.target;
      const isEditable = target instanceof HTMLElement
        && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (event.key === '/' && !event.altKey && !event.ctrlKey && !event.metaKey && !isEditable) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [developmentMenu, passcodeFeature, searchQuery]);

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase('id-ID');
  const visibleFeatures = features.filter((feature) => {
    const matchesGroup = selectedGroup === 'ALL' || feature.group === selectedGroup;
    const matchesQuery = !normalizedQuery
      || `${feature.title} ${feature.subtitle} ${feature.group}`.toLocaleLowerCase('id-ID').includes(normalizedQuery);
    return matchesGroup && matchesQuery;
  });

  const visibleRecent = recentKeys
    .map((key) => features.find((feature) => feature.key === key))
    .filter((feature): feature is Feature => Boolean(feature));
  const visibleFavorites = features.filter((feature) => favoriteKeys.includes(feature.key));
  const operationalCount = features.filter((f) => f.status !== 'dev').length;

  const persistKeys = (storageKey: string, keys: string[]) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(keys));
      setStorageError(null);
    } catch (error) {
      setStorageError(`Preferensi menu tidak dapat disimpan: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const openFeature = (feature: Feature) => {
    if (isLoadingMenuAccess || menuAccessError) return;
    if (!canView(feature.key)) {
      showNoAuth();
      return;
    }
    if (feature.placeholder) {
      setDevelopmentMenu(feature.title);
      return;
    }
    if (!feature.path) return;

    if (feature.key === 'analisis-mutasi' && user?.auth_level !== 4) {
      setPasscodeFeature(feature);
      setPasscodeInput('');
      setPasscodeError(null);
      return;
    }

    openVerifiedFeature(feature);
  };

  const openVerifiedFeature = (feature: Feature) => {
    if (!feature.path) return;
    const nextRecent = [feature.key, ...recentKeys.filter((key) => key !== feature.key)].slice(0, 3);
    setRecentKeys(nextRecent);
    persistKeys(RECENT_STORAGE_KEY, nextRecent);
    navigate(feature.path);
  };

  const toggleFavorite = (feature: Feature) => {
    const nextFavorites = favoriteKeys.includes(feature.key)
      ? favoriteKeys.filter((key) => key !== feature.key)
      : [...favoriteKeys, feature.key];
    setFavoriteKeys(nextFavorites);
    persistKeys(FAVORITES_STORAGE_KEY, nextFavorites);
  };

  const greetingName = user?.name?.trim() || 'Guest';

  const isFiltered = Boolean(normalizedQuery) || selectedGroup !== 'ALL';

  return (
    <main className="landing-page relative isolate min-h-screen overflow-hidden bg-surface-900 px-4 pb-16 pt-24 text-slate-100 sm:px-6 sm:pt-28">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_40%_at_15%_-10%,rgba(14,165,233,0.12),transparent)]"
        aria-hidden="true"
      />

      <div className="mx-auto w-full max-w-5xl">
        <header className="landing-hero mb-8">
          <h1 className="break-words text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
            {getWibGreeting()}, {greetingName}
          </h1>
          <p className="mt-2 text-base text-slate-400">{getWibDateLabel()}</p>

          <div className="mt-6">
            <div className="relative">
              <label htmlFor="landing-search" className="sr-only">Cari menu berdasarkan nama atau deskripsi</label>
              <svg
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="M20 20l-4-4" />
              </svg>
              <input
                id="landing-search"
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Cari modul, analisis, atau dokumen"
                className="input h-12 pl-12 pr-14 text-base focus-visible:ring-2 focus-visible:ring-brand-400"
              />
              {!searchQuery && (
                <kbd className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded border border-surface-700 bg-surface-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-400">
                  /
                </kbd>
              )}
            </div>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div role="group" aria-label="Filter kategori menu" className="flex flex-wrap gap-1.5">
                {(['ALL', ...groups] as const).map((tab) => {
                  const active = selectedGroup === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedGroup(tab)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 motion-reduce:transition-none ${
                        active
                          ? 'bg-brand-500/15 text-sky-200 ring-1 ring-inset ring-brand-500/40'
                          : 'text-slate-400 hover:bg-surface-800 hover:text-slate-200'
                      }`}
                    >
                      {tab === 'ALL' ? 'Semua modul' : tab}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400" aria-live="polite">
                {isFiltered
                  ? `${visibleFeatures.length} modul ditemukan`
                  : `${operationalCount} dari ${features.length} modul aktif`}
              </p>
            </div>
          </div>
        </header>

        {notifications.length > 0 && (
          <button
            type="button"
            onClick={() => openFeature(features.find((feature) => feature.key === 'plt-plh')!)}
            className="mb-6 flex w-full items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left transition-colors hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v4m0 4h.01M10.3 3.95L2.8 17a2 2 0 001.73 3h14.94a2 2 0 001.73-3l-7.5-13.05a2 2 0 00-3.4 0z" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-100">Manajemen Plt./Plh. perlu tindak lanjut</span>
              <span className="mt-0.5 block text-xs text-slate-300">
                {notifications.length} penugasan mendekati atau melewati jatuh tempo
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-amber-300" aria-hidden="true">
              Buka
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </span>
          </button>
        )}

        {notificationError && (
          <div role="alert" className="mb-4 rounded-lg border border-brand-500/40 bg-surface-800 px-4 py-3 text-sm text-slate-200">
            Notifikasi Plt./Plh. tidak dapat dimuat: {notificationError}
          </div>
        )}
        {menuAccessError && (
          <div role="alert" className="mb-4 rounded-lg border border-rose-700/50 bg-surface-800 px-4 py-3 text-sm text-rose-200">
            Izin menu tidak dapat dimuat: {menuAccessError}
            <button className="ml-3 underline" onClick={() => void reload()} type="button">Coba lagi</button>
          </div>
        )}
        {storageError && (
          <div role="alert" className="mb-4 rounded-lg border border-brand-500/40 bg-surface-800 px-4 py-3 text-sm text-slate-200">
            {storageError}
          </div>
        )}

        {!normalizedQuery && selectedGroup === 'ALL' && (visibleFavorites.length > 0 || visibleRecent.length > 0) && (
          <section aria-label="Akses cepat" className="landing-quick-section mb-8">
            <h2 className="mb-2.5 text-sm font-semibold text-slate-200">Akses cepat</h2>
            <div className="flex flex-wrap gap-2">
              {visibleFavorites.map((feature) => (
                <QuickAccessChip key={`fav-${feature.key}`} feature={feature} tag="Pinned" onOpen={openFeature} />
              ))}
              {visibleRecent
                .filter((recent) => !favoriteKeys.includes(recent.key))
                .map((feature) => (
                  <QuickAccessChip key={`rec-${feature.key}`} feature={feature} tag="Recent" onOpen={openFeature} />
                ))}
            </div>
          </section>
        )}

        {visibleFeatures.length === 0 ? (
          <div className="rounded-xl border border-dashed border-surface-700 px-5 py-12 text-center">
            <p className="text-sm font-medium text-slate-200">
              Tidak ada modul yang cocok{searchQuery.trim() ? ` dengan “${searchQuery.trim()}”` : ''}.
            </p>
            <p className="mt-1 text-xs text-slate-400">Coba kata kunci lain atau tampilkan semua modul.</p>
            <button
              type="button"
              className="btn-secondary mt-4"
              onClick={() => {
                setSearchQuery('');
                setSelectedGroup('ALL');
              }}
            >
              Tampilkan semua modul
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => {
              const groupFeatures = visibleFeatures.filter((feature) => feature.group === group);
              if (groupFeatures.length === 0) return null;
              const headingId = `group-${group.replace(/\W+/g, '-').toLowerCase()}`;

              return (
                <section key={group} aria-labelledby={headingId}>
                  <div className="mb-2.5 flex items-baseline justify-between gap-3">
                    <h2 id={headingId} className="text-sm font-semibold text-slate-200">{group}</h2>
                    <span className="text-xs text-slate-400">{groupFeatures.length} modul</span>
                  </div>

                  <ul className="landing-card-surface divide-y divide-surface-800 overflow-hidden rounded-xl border border-surface-700/70 bg-surface-800/30">
                    {groupFeatures.map((feature) => (
                      <FeatureRow
                        key={feature.key}
                        feature={feature}
                        notificationCount={notifications.length}
                        isFavorite={favoriteKeys.includes(feature.key)}
                        isLocked={!isLoadingMenuAccess && !menuAccessError && !canView(feature.key)}
                        onOpen={openFeature}
                        onToggleFavorite={toggleFavorite}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        <p className="mt-12 text-xs text-slate-400">MPK Workspace v1.5.2</p>
      </div>

      {/* Experimental Passcode Modal */}
      {passcodeFeature && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPasscodeFeature(null);
              setPasscodeInput('');
              setPasscodeError(null);
            }
          }}
        >
          <section
            className="w-full max-w-sm rounded-2xl border border-surface-700 bg-surface-900 p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mutasi-passcode-title"
          >
            <h2 id="mutasi-passcode-title" className="text-lg font-semibold text-slate-100">
              Akses eksperimental
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Masukkan passcode untuk membuka Analisis Mutasi/Promosi.
            </p>
            <form
              className="mt-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (passcodeInput !== '1234') {
                  setPasscodeError('Passcode tidak sesuai.');
                  return;
                }
                const feature = passcodeFeature;
                setPasscodeFeature(null);
                setPasscodeInput('');
                setPasscodeError(null);
                openVerifiedFeature(feature);
              }}
            >
              <label className="block text-sm text-slate-300" htmlFor="mutasi-passcode">
                Passcode
              </label>
              <input
                id="mutasi-passcode"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={passcodeInput}
                onChange={(event) => {
                  setPasscodeInput(event.target.value);
                  setPasscodeError(null);
                }}
                className="input mt-2"
              />
              {passcodeError && (
                <p className="mt-2 text-sm text-rose-300" role="alert">{passcodeError}</p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-surface-700 px-4 py-2 text-sm text-slate-300 hover:bg-surface-800"
                  onClick={() => {
                    setPasscodeFeature(null);
                    setPasscodeInput('');
                    setPasscodeError(null);
                  }}
                >
                  Batal
                </button>
                <button type="submit" className="btn-primary">
                  Buka
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* v2.0 Roadmap Placeholder Modal */}
      {developmentMenu && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDevelopmentMenu(null);
          }}
        >
          <section
            className="w-full max-w-sm rounded-2xl border border-surface-700 bg-surface-900 p-6 text-center shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="landing-development-title"
          >
            <span className="mx-auto mb-3 inline-flex rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-sky-300">
              Direncanakan rilis v2.0
            </span>
            <h2 id="landing-development-title" className="text-lg font-semibold text-slate-100">
              {developmentMenu}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Modul ini sedang dalam tahap perancangan alur kerja dan dijadwalkan rilis pada pembaruan versi 2.0.
            </p>
            <button
              type="button"
              onClick={() => setDevelopmentMenu(null)}
              className="btn-secondary mt-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              autoFocus
            >
              Tutup
            </button>
          </section>
        </div>
      )}
    </main>
  );
}