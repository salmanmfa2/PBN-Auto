import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
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
    subtitle: 'Pecah PDF besar menjadi potongan 2 atau 3 halaman dengan nama file dari teks Sdr.',
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
      <span className="landing-status-badge landing-status-badge-beta badge shrink-0 gap-1.5 border border-brand-500/30 bg-brand-500/10 text-sky-300">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
        Beta
      </span>
    );
  }
  if (feature.status === 'experimental') {
    return (
      <span className="landing-status-badge landing-status-badge-exp badge shrink-0 gap-1.5 border border-amber-500/30 bg-amber-500/10 text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Experimental
      </span>
    );
  }
  if (feature.status === 'dev') {
    return (
      <span className="landing-status-badge landing-status-badge-dev badge shrink-0 border border-surface-700 bg-surface-800 text-slate-400">
        v2.0 Roadmap
      </span>
    );
  }
  if (feature.status === 'ready') {
    return (
      <span className="landing-status-badge landing-status-badge-ready badge shrink-0 gap-1.5 border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
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
  return (
    <button
      type="button"
      onClick={() => onOpen(feature)}
      className="landing-quick-chip group flex min-w-0 items-center gap-2.5 rounded-xl border border-surface-700/80 bg-surface-900/90 px-3 py-2.5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500/50 hover:bg-surface-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 motion-reduce:transition-none"
    >
      <span className="landing-feature-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-sky-300 transition-transform group-hover:scale-105">
        <FeatureIcon name={feature.icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-100">{feature.title}</span>
        <span className="block text-[11px] text-slate-400">{tag}</span>
      </span>
      <span className="text-xs text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-sky-400" aria-hidden="true">
        ↗
      </span>
    </button>
  );
}

function FeatureCard({
  feature,
  notificationCount,
  isFavorite,
  isLocked,
  index,
  onOpen,
  onToggleFavorite,
}: {
  feature: Feature;
  notificationCount: number;
  isFavorite: boolean;
  isLocked: boolean;
  index: number;
  onOpen: (feature: Feature) => void;
  onToggleFavorite: (feature: Feature) => void;
}) {
  const [spotlight, setSpotlight] = useState({ x: 0, y: 0, active: false });

  const handleMouseMove = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setSpotlight({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      active: true,
    });
  };

  const isDev = feature.status === 'dev';
  const borderFrame = isDev
    ? 'landing-card-frame-dev from-surface-700/60 via-surface-800/40 to-surface-700/60'
    : feature.featured
      ? 'landing-card-frame-active from-brand-500/50 via-sky-500/20 to-surface-700/60'
      : 'landing-card-frame-active from-brand-500/35 via-surface-700/40 to-brand-900/30';

  return (
    <article
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setSpotlight((prev) => ({ ...prev, active: false }))}
      className={`group/card relative animate-fade-in-up rounded-2xl bg-gradient-to-br p-px transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-950/30 motion-reduce:animate-none motion-reduce:transition-none motion-reduce:hover:transform-none ${borderFrame} ${isDev ? 'opacity-80 hover:opacity-100' : ''}`}
      style={{ animationDelay: `${index * 45}ms` }}
    >
      {/* Interactive cursor spotlight */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
        style={{
          opacity: spotlight.active ? 1 : 0,
          background: `radial-gradient(280px circle at ${spotlight.x}px ${spotlight.y}px, rgba(14, 165, 233, 0.14), transparent 70%)`,
        }}
        aria-hidden="true"
      />

      <div className="landing-card-surface relative flex h-full min-h-[132px] flex-col justify-between rounded-[15px] bg-surface-900/95 p-4">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => onOpen(feature)}
            className="group flex min-w-0 flex-1 items-start gap-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 rounded-lg"
          >
            <span
              className={`landing-feature-icon mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-transform duration-200 group-hover:scale-105 ${
                isDev
                  ? 'border-surface-700 bg-surface-800 text-slate-400'
                  : 'border-brand-500/25 bg-brand-500/10 text-sky-300'
              }`}
            >
              <FeatureIcon name={feature.icon} className="h-5 w-5" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold leading-snug text-slate-100 group-hover:text-sky-300 transition-colors">
                  {feature.title}
                </span>
                {isLocked && (
                  <span
                    title="Akses terbatas sesuai kebijakan peran"
                    className="inline-flex items-center rounded border border-surface-700 bg-surface-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400"
                  >
                    Restricted
                  </span>
                )}
              </span>
              <span className="mt-1.5 line-clamp-2 block text-xs leading-relaxed text-slate-400">
                {feature.subtitle}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => onToggleFavorite(feature)}
            aria-label={isFavorite ? `Lepas sematan ${feature.title}` : `Sematkan ${feature.title}`}
            aria-pressed={isFavorite}
            title={isFavorite ? 'Lepas sematan' : 'Sematkan menu'}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
              isFavorite
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                : 'border-transparent text-slate-500 hover:border-surface-700 hover:bg-surface-800 hover:text-slate-200'
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
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-surface-800/80 pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
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
          </div>

          <button
            type="button"
            onClick={() => onOpen(feature)}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition-colors group-hover/card:text-sky-300"
          >
            <span>{isDev ? 'Detail' : 'Buka modul'}</span>
            <svg
              className="h-3.5 w-3.5 transition-transform group-hover/card:translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </article>
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
  let animationIndex = 0;

  return (
    <main className="landing-page relative isolate min-h-screen overflow-hidden bg-surface-900 px-4 pb-16 pt-24 text-slate-100 sm:px-6 sm:pt-28">
      {/* Ambient Radial Glow & Subtle Grid */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(14,165,233,0.16),transparent)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage: 'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
        aria-hidden="true"
      />

      <div className="mx-auto w-full max-w-6xl">
        {/* Hero Command Header */}
        <header className="landing-hero mb-8 rounded-2xl border border-surface-700/80 bg-surface-900/75 p-6 shadow-lg backdrop-blur-sm sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-sky-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>MPK Workspace · v1.5.</span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-300">{getWibDateLabel()}</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl md:text-4xl">
                {getWibGreeting()}, <span className="text-sky-400">{greetingName}</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
                Pusat utilitas pembersihan dataset PBN, analisis skor kinerja DJPb, pemantauan Plt./Plh., dan otomasi dokumen pelantikan.
              </p>
            </div>

            {/* Live Workspace Telemetry Pills */}
            <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
              <div className="landing-telemetry-pill rounded-xl border border-surface-700/80 bg-surface-800/60 px-4 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Modul Aktif</p>
                <p className="mt-0.5 text-lg font-bold text-slate-100">
                  {operationalCount} <span className="text-xs font-normal text-slate-400">/ {features.length}</span>
                </p>
              </div>
              <div className="landing-telemetry-pill rounded-xl border border-surface-700/80 bg-surface-800/60 px-4 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Notifikasi Plt.</p>
                <p className={`mt-0.5 text-lg font-bold ${notifications.length > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {notifications.length} <span className="text-xs font-normal text-slate-400">record</span>
                </p>
              </div>
            </div>
          </div>

          {/* Search + Category Filter Bar */}
          <div className="mt-6 flex flex-col gap-3 border-t border-surface-800 pt-5 md:flex-row md:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Cari menu berdasarkan nama atau deskripsi</span>
              <svg
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
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
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Cari modul, analisis, atau dokumen..."
                className="input h-10 pl-10 pr-12 focus-visible:ring-2 focus-visible:ring-brand-400"
              />
              <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-surface-700 bg-surface-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-400">
                /
              </kbd>
            </label>

            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter kategori menu">
              {(['ALL', ...groups] as const).map((tab) => {
                const active = selectedGroup === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedGroup(tab)}
                    className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-sky-500 text-white shadow-sm'
                        : 'border border-surface-700 bg-surface-800/60 text-slate-300 hover:bg-surface-800'
                    }`}
                  >
                    {tab === 'ALL' ? 'Semua Modul' : tab}
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {/* Alerts */}
        {notifications.length > 0 && (
          <button
            type="button"
            onClick={() => openFeature(features.find((feature) => feature.key === 'plt-plh')!)}
            className="mb-6 flex w-full items-center gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-left transition hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v4m0 4h.01M10.3 3.95L2.8 17a2 2 0 001.73 3h14.94a2 2 0 001.73-3l-7.5-13.05a2 2 0 00-3.4 0z" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-100">Notifikasi Manajemen Plt./Plh.</span>
              <span className="mt-0.5 block text-xs text-slate-300">
                {notifications.length} penugasan memerlukan tindak lanjut — klik untuk membuka monitoring
              </span>
            </span>
            <span className="text-sm font-medium text-amber-300" aria-hidden="true">Lihat →</span>
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

        {/* Quick Access Bar (Pinned + Recent) */}
        {!normalizedQuery && selectedGroup === 'ALL' && (visibleFavorites.length > 0 || visibleRecent.length > 0) && (
          <section aria-label="Akses cepat" className="landing-quick-section mb-8 rounded-2xl border border-surface-700/70 bg-surface-900/50 p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Akses Cepat
              </h2>
              <span className="text-xs text-slate-500">
                {visibleFavorites.length} disematkan · {visibleRecent.length} terakhir dibuka
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
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

        {/* Categorized Bento Grid */}
        {visibleFeatures.length === 0 ? (
          <div className="rounded-2xl border border-surface-700 bg-surface-900 px-5 py-12 text-center">
            <p className="text-sm font-medium text-slate-200">Tidak ada menu yang cocok dengan "{searchQuery}".</p>
            <p className="mt-1 text-xs text-slate-400">Tekan Esc untuk menghapus pencarian atau pilih kategori lain.</p>
          </div>
        ) : (
          <div className="space-y-9">
            {groups.map((group) => {
              const groupFeatures = visibleFeatures.filter((feature) => feature.group === group);
              if (groupFeatures.length === 0) return null;

              return (
                <section key={group} aria-labelledby={`group-${group.replace(/\W+/g, '-').toLowerCase()}`}>
                  <div className="mb-3.5 flex items-center gap-3">
                    <h2
                      id={`group-${group.replace(/\W+/g, '-').toLowerCase()}`}
                      className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"
                    >
                      {group}
                    </h2>
                    <div className="h-px flex-1 bg-surface-800" />
                    <span className="text-xs text-slate-500">{groupFeatures.length} modul</span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {groupFeatures.map((feature) => {
                      const index = animationIndex;
                      animationIndex += 1;
                      const isLocked = !isLoadingMenuAccess && !menuAccessError && !canView(feature.key);

                      return (
                        <FeatureCard
                          key={feature.key}
                          feature={feature}
                          notificationCount={notifications.length}
                          isFavorite={favoriteKeys.includes(feature.key)}
                          isLocked={isLocked}
                          index={index}
                          onOpen={openFeature}
                          onToggleFavorite={toggleFavorite}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
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
              Experimental Access
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
              Planned for v2.0
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