import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import * as apiClient from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { ThemeName } from '../types';
import {
  getLandingUiMode,
  LANDING_UI_CHANGED_EVENT,
  setSessionLandingUiMode,
  setLandingUiMode,
  type LandingUiMode,
} from '../utils/landingUi';

type ToolbarDialog = 'patch' | 'unfixed' | 'api' | 'game' | null;
type ApiTestState = 'idle' | 'checking' | 'online' | 'offline';

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'Asia/Jakarta',
});

const THEME_STORAGE_KEY = 'pbn.theme.guest';
const themeOptions: Array<{
  value: ThemeName;
  label: string;
  desc: string;
  swatchClass: string;
}> = [
  {
    value: 'default',
    label: 'Default',
    desc: 'Slate Navy',
    swatchClass: 'bg-slate-800 border-sky-400/60',
  },
  {
    value: 'dark',
    label: 'Dark',
    desc: 'Midnight',
    swatchClass: 'bg-slate-950 border-slate-600',
  },
  {
    value: 'light',
    label: 'Light',
    desc: 'Daylight',
    swatchClass: 'bg-slate-100 border-slate-400',
  },
];

const PATCH_NOTES = [
  {
    version: '1.5.0',
    label: '1.5.0',
    items: [
      'Analisis Mutasi/Promosi menyediakan workspace Administrator/Pengawas, alur unggah dan pembersihan data, klasifikasi yang dapat dikoreksi, serta penyimpanan dan pemulihan dataset.',
      'Talent Finder mencari pegawai berdasarkan Eselon, Rumpun, atau nama; hasil dimuat bertahap dengan pengurutan di server.',
      'Fragment Petikan mendukung jumlah halaman per fragmen yang ditentukan pengguna, pengabaian halaman, penanda nama yang dapat diatur, dan peringatan untuk sisa halaman.',
      'Toolbar menyediakan pilihan Legacy UI. Preferensi tersimpan untuk pengguna masuk; pilihan guest berlaku untuk sesi browser saat ini.',
      'Akun baru dan akun yang dikelola Admin menolak username yang mengandung whitespace. Toolbar menampilkan hitung mundur sesi dan menyediakan refresh token tanpa memasukkan ulang password.',
      'UI seluruh modul disempurnakan untuk memberikan pengalaman yang lebih konsisten.',
      'Menu Insight Hub lama dihapus; Insight Hub Beta tetap tersedia.',
      'Perbandingan Unit Eselon II menampilkan Pemberian Koreksi (%). Sinkronisasi pegawai juga mengenali nama Kanwil panjang dan memakai ID referensi kanonis yang sudah ada.',
      'Prototipe tab Jabatan tetap direncanakan dan tidak diaktifkan sampai pemetaan pegawai, unit, dan aturan periode dikonfirmasi.',
      'Layanan backend Kinerja dan Pelantikan dirapikan menjadi modul berdasarkan alur kerja.',
    ],
  },
  {
    version: '1.4.1',
    label: '1.4.1',
    items: [
      'Super Admin dapat menyinkronkan koreksi langsung dari EPRIDE, memilih tahun/TW sumber, melihat pratinjau, dan menangani konflik per NIP. Daftar periode diperbarui saat dialog Kelola Dataset dibuka.',
      'NKP Perhitungan disimpan per pegawai dengan bobot 70/30 atau 90/10. Status mengikuti skor yang dibulatkan ke dua desimal tampilan; migrasi startup mengisi skor lama dan memperbarui status tersimpan.',
      'Skor dan status NKP Perhitungan tersedia di Daftar Pegawai, Lite View, dan ekspor. Perbandingan unit kini menampilkan distribusi status NKP Perhitungan dan NKP Akhir.',
      'Gap Status menghitung jumlah NKP Akhir Sangat Istimewa dikurangi NKP Perhitungan Sangat Istimewa. Nilai positif berwarna hijau, nol memakai warna teks bawaan, dan nilai negatif merah; Gap Status tersedia di Lite View.',
      'Tabel Unit Eselon II dan Daftar Pegawai memiliki area gulir dengan tinggi terbatas dan header beku. Baris filter Daftar Pegawai tetap terlihat, di Full View maupun Lite View.',
      'Tombol Compare pada Overview kini menggunakan ikon timbangan.',
      'Akses View/Edit dapat diatur per menu oleh God User. Semua kartu menu tetap terlihat; akses tanpa izin menampilkan dialog No Auth dan tetap dibatasi pada route serta API. Admin Page memerlukan Super Admin secara default, dan Auth Level 2 ditampilkan sebagai Special User.',
    ],
  },
  {
    version: '1.4.0',
    label: '1.4.0',
    items: [
      'Generate ND menjadikan alur semua sheet sebagai menu utama, dengan impor gabungan/terpilih/terpisah, Lite View, lebar kolom tersimpan, dan tombol alih Daring/Luring. Pilihan moda awal mengikuti pemetaan unit.',
      'Pratinjau menampilkan kota serta filter pencocokan/moda; pilihan peserta mencegah NIP ganda. Tersedia ekspor monitoring Pelantikan ke Excel.',
      'Pratinjau Generate ND dapat memilih dokumen per Unit dan moda; satu dokumen diunduh sebagai DOCX, beberapa dokumen sebagai ZIP. Tersedia juga pembuatan lampiran ND Pengantar.',
      'Analisis Kinerja menyimpan beberapa triwulan dalam tab periode terpisah. Unggah ulang hanya mengganti triwulan yang sama, sementara periode lainnya tetap tersedia.',
      'Unit Eselon II dapat membandingkan metrik dan status NKP dengan triwulan kalender sebelumnya; Overview menampilkan persentase distribusi status.',
      'Filter pegawai menggunakan nilai yang tersedia di data dan rentang numerik. Form unggah/penyesuaian dipindahkan ke dialog ringkas; hasil dashboard di-cache dan diperbarui saat data berubah.',
      'Admin mendapat peran God User Level 4 untuk pratinjau dan pemeliharaan tabel sumber/referensi serta sinkronisasi pegawai; hanya Level 4 yang dapat memberikan peran ini, dan Super Admin Level 3 tidak mendapat akses database.',
    ],
  },
  {
    version: '1.3.0',
    label: '1.3.0',
    items: [
      'Analisis Kinerja DJPb kini dapat dilihat Guest dengan tab Overview, Unit Eselon II, dan Daftar Pegawai, termasuk drilldown Unit Eselon III dan ekspor Excel.',
      'Unggah/penyesuaian data kinerja dibatasi untuk Super Admin; NIP yang tidak cocok tetap disimpan sebagai Unidentified.',
      'Generate ND Undangan Pelantikan Experimental mendukung impor semua sheet, sheet terpilih, satu sheet, atau pengelompokan terpisah; menu standar tetap tersedia.',
      'Employee Data Source mencatat waktu/pelaku penggantian sumber dan menyediakan sinkronisasi terpisah ke dt_employee.',
      'Sesi kedaluwarsa mengarahkan pengguna ke login. Sitasi Es.III (Lite) dihapus; Sitasi Es.III standar tetap tersedia.',
    ],
  },
  {
    version: '1.2.1',
    label: '1.2.1',
    items: [
      'Generate ND Undangan Pelantikan dengan agenda tersimpan, pencocokan pegawai, pratinjau peserta, dan pembuatan dokumen.',
      'Manajemen Plt./Plh. dapat memilih pejabat pengganti dari PBN Open dan menyimpan NIP sebagai snapshot.',
      'Toolbar jam dapat menempel ke tepi layar terdekat setelah digeser.',
      'Launcher deployment jaringan mendeteksi alamat Wi-Fi/LAN secara otomatis dan menyesuaikan URL API serta CORS.',
    ],
  },
  {
    version: '1.2',
    label: '1.2.0',
    items: [
      'Generate Bahan Baperjakat menggabungkan template 4 orang untuk kategori Mutasi dan template 3 orang untuk kategori Promosi.',
      'Akun web dengan peran Guest, User, Admin, dan Super Admin; sesi login berlaku satu jam dan workspace Admin menyediakan pengelolaan akun.',
      'Manajemen Plt./Plh. web dengan monitoring, status masa kerja, notifikasi, dan ekspor Excel yang dibatasi berdasarkan peran.',
      'Menu Analisis Kinerja DJPb, Bahan Pendukung MPK, dan Simulasi Mutasi masih berstatus On development.',
      'Toolbar memiliki jam WIB yang dapat digeser, pilihan tema Default/Dark/Light tersimpan per pengguna, serta kontrol tampil/sembunyikan untuk tombol utilitas.',
      'Groq chat web dengan format Markdown, tombol hapus percakapan, dan instruksi agar tidak mengarang fitur yang belum dikonfirmasi.',
      'Fitur akun, monitoring, menu tambahan, preferensi pengguna, dan chat ini khusus web; desktop tetap hanya memiliki menu PBN Analytics dan Insight Hub tanpa login.',
    ],
  },
  {
    version: '1.1.0',
    label: '1.1.0',
    items: [
      'Pilihan template PowerPoint 3 baris dan 4 baris untuk Sitasi Es.III.',
      'Staging dan penggabungan PPTX Sitasi Es.III/Es.IV sesuai urutan dengan layout template masing-masing.',
      'Perataan kolom PowerPoint, penyempurnaan pembersihan Sitasi Es.III, dan tombol ekspor yang lebih ringkas.',
      'Pemeriksaan update desktop dan pengunduhan runtime backend secara terpisah.',
    ],
  },
] as const;

type PatchNoteVersion = (typeof PATCH_NOTES)[number]['version'];

function getAuthorityLabel(authLevel: number): string {
  if (authLevel === 4) return 'God User · Level 4';
  if (authLevel === 3) return 'Super Admin · Level 3';
  if (authLevel === 2) return 'Special User · Level 2';
  return 'User · Level 1';
}

function getInitials(name?: string): string {
  if (!name?.trim()) return 'G';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getAvatarAccent(authLevel?: number): string {
  if (authLevel === 4) return 'border-amber-400/50 bg-amber-500/15 text-amber-300';
  if (authLevel === 3) return 'border-sky-400/50 bg-sky-500/15 text-sky-300';
  if (authLevel === 2) return 'border-indigo-400/50 bg-indigo-500/15 text-indigo-300';
  return 'border-slate-600/70 bg-slate-700/60 text-slate-200';
}

function applyDocumentTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'light' ? '#f8fafc' : '#0f172a');
}

function ToolbarActionButton({
  tooltip,
  ariaLabel,
  onClick,
  disabled,
  ariaBusy,
  ariaExpanded,
  ariaControls,
  tone = 'default',
  children,
}: {
  tooltip: string;
  ariaLabel: string;
  onClick: () => void;
  disabled?: boolean;
  ariaBusy?: boolean;
  ariaExpanded?: boolean;
  ariaControls?: string;
  tone?: 'default' | 'amber' | 'emerald' | 'rose';
  children: ReactNode;
}) {
  const toneClasses: Record<'default' | 'amber' | 'emerald' | 'rose', string> = {
    default: 'text-slate-300 hover:bg-slate-700/80 hover:text-white focus:ring-brand-400',
    amber: 'text-amber-300 hover:bg-amber-500/15 hover:text-amber-200 focus:ring-amber-300',
    emerald: 'text-emerald-300 hover:bg-emerald-500/15 hover:text-emerald-200 focus:ring-emerald-400',
    rose: 'text-slate-300 hover:bg-rose-500/15 hover:text-rose-300 focus:ring-rose-400',
  };

  return (
    <div className="group/tip relative">
      <button
        type="button"
        title={tooltip}
        aria-label={ariaLabel}
        aria-busy={ariaBusy}
        aria-expanded={ariaExpanded}
        aria-controls={ariaControls}
        onClick={onClick}
        disabled={disabled}
        className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 disabled:cursor-wait disabled:opacity-50 ${toneClasses[tone]}`}
      >
        {children}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-[60] mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] font-medium text-slate-100 opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {tooltip}
      </span>
    </div>
  );
}

export function AppToolbar() {
  const navigate = useNavigate();
  const { mode, user, logout } = useAuth();
  const [currentTime, setCurrentTime] = useState(() => dateTimeFormatter.format(new Date()));
  const [sessionRemainingSeconds, setSessionRemainingSeconds] = useState<number | null>(null);
  const [sessionRefreshing, setSessionRefreshing] = useState(false);
  const [activeDialog, setActiveDialog] = useState<ToolbarDialog>(null);
  const [selectedPatchVersion, setSelectedPatchVersion] = useState<PatchNoteVersion>('1.5.0');
  const [apiTestState, setApiTestState] = useState<ApiTestState>('idle');
  const [apiDiagnostics, setApiDiagnostics] = useState<apiClient.ApiDiagnostic[]>([]);
  const [apiElapsedMs, setApiElapsedMs] = useState<number | null>(null);
  const [theme, setTheme] = useState<ThemeName>('default');
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [showExtraTools, setShowExtraTools] = useState(false);
  const [landingUiMode, setLandingUiModeState] = useState(getLandingUiMode);
  const [isDragging, setIsDragging] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const toolbarRef = useRef<HTMLElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const themeRequestId = useRef(0);
  const dragOrigin = useRef<{ pointerX: number; pointerY: number; left: number; top: number } | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState<{ left: number | null; top: number }>({
    left: null,
    top: 12,
  });

  const clampPosition = (left: number, top: number) => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return { left, top };

    return {
      left: Math.max(8, Math.min(window.innerWidth - toolbar.offsetWidth - 8, left)),
      top: Math.max(8, Math.min(window.innerHeight - toolbar.offsetHeight - 8, top)),
    };
  };

  const snapToNearestEdge = (left: number, top: number) => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return { left, top };
    const position = clampPosition(left, top);
    const right = window.innerWidth - toolbar.offsetWidth - 8;
    const bottom = window.innerHeight - toolbar.offsetHeight - 8;
    const candidates = [
      { distance: position.left - 8, left: 8, top: position.top },
      { distance: right - position.left, left: right, top: position.top },
      { distance: position.top - 8, left: position.left, top: 8 },
      { distance: bottom - position.top, left: position.left, top: bottom },
    ];
    const nearest = candidates.reduce((closest, candidate) =>
      candidate.distance < closest.distance ? candidate : closest);
    return clampPosition(nearest.left, nearest.top);
  };

  const handleDragStart = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = toolbarRef.current?.getBoundingClientRect();
    if (!bounds) return;
    dragOrigin.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      left: bounds.left,
      top: bounds.top,
    };
    setIsDragging(true);
  };

  const handleDragMove = (event: PointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin) return;
    setToolbarPosition(clampPosition(
      origin.left + event.clientX - origin.pointerX,
      origin.top + event.clientY - origin.pointerY,
    ));
  };

  const handleDragEnd = (event: PointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (origin) {
      const bounds = toolbarRef.current?.getBoundingClientRect();
      const position = event.type === 'pointerup'
        ? clampPosition(
          origin.left + event.clientX - origin.pointerX,
          origin.top + event.clientY - origin.pointerY,
        )
        : bounds ? clampPosition(bounds.left, bounds.top) : null;
      if (position) setToolbarPosition(snapToNearestEdge(position.left, position.top));
    }
    dragOrigin.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
  };

  const handlePositionKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const movement = event.shiftKey ? 40 : 16;
    const offsets: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -movement, y: 0 },
      ArrowRight: { x: movement, y: 0 },
      ArrowUp: { x: 0, y: -movement },
      ArrowDown: { x: 0, y: movement },
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const bounds = toolbarRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setToolbarPosition(clampPosition(bounds.left + offset.x, bounds.top + offset.y));
  };

  useEffect(() => {
    const keepToolbarInView = () => {
      const bounds = toolbarRef.current?.getBoundingClientRect();
      if (bounds && toolbarPosition.left !== null) {
        setToolbarPosition(snapToNearestEdge(bounds.left, bounds.top));
      }
    };
    window.addEventListener('resize', keepToolbarInView);
    return () => window.removeEventListener('resize', keepToolbarInView);
  }, [toolbarPosition.left]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(dateTimeFormatter.format(new Date()));
      if (mode === 'user') {
        const expiresAt = window.localStorage.getItem(
          apiClient.AUTH_SESSION_EXPIRATION_STORAGE_KEY,
        );
        if (expiresAt) {
          const remaining = Math.max(
            0,
            Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
          );
          setSessionRemainingSeconds(remaining);
        }
      } else {
        setSessionRemainingSeconds(null);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (!themeMenuOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [themeMenuOpen]);

  useEffect(() => {
    const handleLandingUiChange = (event: Event) => {
      const customEvent = event as CustomEvent<LandingUiMode>;
      setLandingUiModeState(customEvent.detail);
    };
    window.addEventListener(LANDING_UI_CHANGED_EVENT, handleLandingUiChange);
    return () => window.removeEventListener(LANDING_UI_CHANGED_EVENT, handleLandingUiChange);
  }, []);

  useEffect(() => {
    let active = true;
    if (mode === 'user') {
      void apiClient.getLandingUiPreference()
        .then((savedMode) => {
          if (active) setLandingUiModeState(savedMode);
        })
        .catch(() => undefined);
    } else if (mode === 'guest') {
      setLandingUiModeState('legacy');
    }
    return () => {
      active = false;
    };
  }, [mode, user?.user]);

  useEffect(() => {
    let active = true;
    const requestId = ++themeRequestId.current;
    const applyTheme = (nextTheme: ThemeName) => {
      setTheme(nextTheme);
      applyDocumentTheme(nextTheme);
    };

    setThemeError(null);
    if (mode === 'user') {
      apiClient.getThemePreference()
        .then((savedTheme) => {
          if (active && requestId === themeRequestId.current) applyTheme(savedTheme);
        })
        .catch((error: unknown) => {
          if (!active || requestId !== themeRequestId.current) return;
          applyTheme('default');
          setThemeError(`Could not load your saved appearance: ${error instanceof Error ? error.message : String(error)}`);
          setThemeMenuOpen(true);
        });
    } else if (mode === 'guest') {
      try {
        const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
        const validTheme = themeOptions.find((option) => option.value === savedTheme)?.value ?? 'default';
        applyTheme(validTheme);
      } catch (error) {
        setThemeError(`Could not load your saved appearance: ${error instanceof Error ? error.message : String(error)}`);
        setThemeMenuOpen(true);
        applyTheme('default');
      }
    }

    return () => {
      active = false;
    };
  }, [mode, user?.user]);

  useEffect(() => {
    if (!activeDialog) {
      return;
    }

    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveDialog(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDialog]);

  const runApiTest = async () => {
    setApiTestState('checking');
    setApiDiagnostics([]);
    setApiElapsedMs(null);
    setActiveDialog('api');
    const startedAt = performance.now();
    try {
      const results = await apiClient.runApiDiagnostics();
      setApiDiagnostics(results);
      setApiElapsedMs(performance.now() - startedAt);
      setApiTestState(results.every((result) => result.passed) ? 'online' : 'offline');
    } catch (error) {
      setApiDiagnostics([{
        id: 'api',
        label: 'Pengujian API',
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
      }]);
      setApiElapsedMs(performance.now() - startedAt);
      setApiTestState('offline');
    }
  };

  const handleAccountAction = async () => {
    await logout();
    navigate('/login');
  };

  const refreshAuthenticatedSession = async () => {
    if (mode !== 'user' || sessionRefreshing) return;
    setSessionRefreshing(true);
    try {
      const refreshed = await apiClient.refreshSession();
      window.localStorage.setItem(apiClient.AUTH_TOKEN_STORAGE_KEY, refreshed.token);
      window.localStorage.setItem(
        apiClient.AUTH_SESSION_EXPIRATION_STORAGE_KEY,
        refreshed.expires_at,
      );
      setSessionRemainingSeconds(
        Math.max(
          0,
          Math.floor(
            (new Date(refreshed.expires_at).getTime() - Date.now()) / 1000,
          ),
        ),
      );
    } catch {
      window.dispatchEvent(new Event(apiClient.AUTH_SESSION_EXPIRED_EVENT));
    } finally {
      setSessionRefreshing(false);
    }
  };

  const formatSessionRemaining = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return [
      String(hours).padStart(2, '0'),
      String(minutes).padStart(2, '0'),
      String(remainingSeconds).padStart(2, '0'),
    ].join(':');
  };

  const handleThemeChange = async (nextTheme: ThemeName) => {
    themeRequestId.current += 1;
    setTheme(nextTheme);
    applyDocumentTheme(nextTheme);
    setThemeError(null);
    setThemeSaving(true);
    try {
      if (mode === 'user') {
        await apiClient.updateThemePreference(nextTheme);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      }
      setThemeMenuOpen(false);
    } catch (error) {
      setThemeError(`Could not save your appearance: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setThemeSaving(false);
    }
  };

  const toggleExtraTools = () => {
    setShowExtraTools((visible) => !visible);
  };

  const toggleLandingUi = async () => {
    const nextMode = landingUiMode === 'legacy' ? 'alternative' : 'legacy';
    setLandingUiModeState(nextMode);
    if (mode === 'user') {
      setLandingUiMode(nextMode);
      try {
        await apiClient.updateLandingUiPreference(nextMode);
      } catch {
        // localStorage fallback remains active if the server preference cannot be saved.
      }
    } else {
      setSessionLandingUiMode(nextMode);
    }
  };

  const handlePatchTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = PATCH_NOTES.findIndex((note) => note.version === selectedPatchVersion);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + PATCH_NOTES.length) % PATCH_NOTES.length;
    else if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % PATCH_NOTES.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = PATCH_NOTES.length - 1;
    else return;

    event.preventDefault();
    const nextNote = PATCH_NOTES[nextIndex];
    setSelectedPatchVersion(nextNote.version);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]
      ?.focus();
  };

  const dialogTitle = activeDialog === 'patch'
    ? 'Patch Notes'
    : activeDialog === 'unfixed'
      ? 'Catatan Staging'
      : activeDialog === 'api'
        ? 'Uji Fungsi & Koneksi API'
        : 'Mini Game · Snake';

  return (
    <>
      <aside
        ref={toolbarRef}
        className={`app-toolbar-capsule fixed z-50 flex max-w-[calc(100vw-1rem)] flex-wrap items-center gap-2 rounded-2xl border border-slate-700/85 bg-slate-900/90 px-3 py-2 shadow-xl shadow-slate-950/40 backdrop-blur-md motion-reduce:transition-none ${
          isDragging ? 'ring-2 ring-sky-400/50' : 'transition-[left,top] duration-200 ease-out'
        }`}
        style={{
          left: toolbarPosition.left ?? undefined,
          right: toolbarPosition.left === null ? 12 : undefined,
          top: toolbarPosition.top,
        }}
      >
        {/* Draggable Identity & Live WIB Clock */}
        <div
          role="group"
          tabIndex={0}
          aria-label="Toolbar position. Drag to move, or use arrow keys; hold Shift to move farther."
          onKeyDown={handlePositionKeyDown}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          className="flex min-w-0 cursor-grab touch-none select-none items-center gap-3 border-r border-slate-700/80 pr-3 active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          title={`Drag to move; use arrow keys to reposition. ${user ? `${user.name} · ${getAuthorityLabel(user.auth_level)}` : 'Guest'}`}
        >
          {/* Monogram Avatar */}
          <span
            aria-hidden="true"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-xs font-bold tracking-tight ${getAvatarAccent(user?.auth_level)}`}
          >
            {getInitials(user?.name)}
          </span>

          {/* User Name & Authority */}
          <div className="min-w-0 text-left">
            <p className="truncate text-xs font-semibold leading-tight text-slate-100">
              {user?.name ?? 'Guest'}
            </p>
            <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">
              {user ? getAuthorityLabel(user.auth_level) : 'Guest access'}
            </p>
          </div>

          {/* Live WIB Clock */}
          <div className="hidden border-l border-slate-800 pl-3 text-right sm:block">
            <p className="flex items-center justify-end gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Waktu · WIB</span>
            </p>
            <p className="mt-0.5 whitespace-nowrap font-mono text-xs font-medium tabular-nums text-slate-200">
              {currentTime}
            </p>
            {mode === 'user' && (
              <div className="mt-1 flex items-center justify-end gap-1">
                <span
                  className={`whitespace-nowrap font-mono text-[10px] tabular-nums ${
                    sessionRemainingSeconds !== null && sessionRemainingSeconds < 300
                      ? 'text-rose-300'
                      : 'text-slate-400'
                  }`}
                  title="Sisa masa aktif sesi"
                >
                  Sesi {sessionRemainingSeconds === null
                    ? '--:--:--'
                    : formatSessionRemaining(sessionRemainingSeconds)}
                </span>
                <button
                  type="button"
                  disabled={sessionRefreshing}
                  onClick={() => void refreshAuthenticatedSession()}
                  className="flex size-5 items-center justify-center rounded-md text-slate-400 transition hover:bg-sky-500/15 hover:text-sky-300 disabled:cursor-wait disabled:opacity-50"
                  aria-label="Perbarui sesi"
                  title="Perbarui sesi tanpa memasukkan password"
                >
                  <svg
                    className={`h-3 w-3 ${sessionRefreshing ? 'animate-spin' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 11a8 8 0 10-2.34 5.66M20 11V5m0 6h-6" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Action Cluster */}
        <div className="flex items-center gap-1">
          {/* Appearance Switcher */}
          <div className="relative" ref={themeMenuRef}>
            <ToolbarActionButton
              tooltip={`Appearance (${theme})`}
              ariaLabel="Choose appearance theme"
              ariaExpanded={themeMenuOpen}
              ariaControls={themeMenuOpen ? 'app-toolbar-theme-options' : undefined}
              onClick={() => setThemeMenuOpen((open) => !open)}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v2m0 14v2M3 12h2m14 0h2m-3.64-6.36l-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0l-1.42-1.42M7.06 7.06L5.64 5.64M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </ToolbarActionButton>

            {themeMenuOpen && (
              <div
                id="app-toolbar-theme-options"
                className="app-toolbar-popover absolute right-0 top-full z-[55] mt-2.5 w-52 rounded-2xl border border-slate-700 bg-slate-900 p-2 shadow-2xl"
                role="group"
                aria-label="Appearance theme"
              >
                <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Appearance
                </p>
                <div className="mt-1 space-y-1">
                  {themeOptions.map((option) => {
                    const active = theme === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={themeSaving}
                        aria-pressed={active}
                        onClick={() => void handleThemeChange(option.value)}
                        className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm transition hover:bg-slate-800 disabled:opacity-50 ${
                          active ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30' : 'text-slate-300'
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <span className={`h-4 w-4 rounded-full border ${option.swatchClass}`} aria-hidden="true" />
                          <span>
                            <span className="block text-xs font-semibold leading-tight">{option.label}</span>
                            <span className="block text-[10px] text-slate-400">{option.desc}</span>
                          </span>
                        </span>
                        {active && <span className="text-xs font-bold" aria-hidden="true">✓</span>}
                      </button>
                    );
                  })}
                </div>
                {themeSaving && <p role="status" className="px-2.5 pt-2 text-xs text-slate-400">Saving…</p>}
                {themeError && (
                  <p role="alert" className="px-2.5 pt-2 text-xs text-rose-300">{themeError}</p>
                )}
              </div>
            )}
          </div>

          {/* Expand / Collapse Utilities Toggle */}
          <ToolbarActionButton
            tooltip={showExtraTools ? 'Sembunyikan alat' : 'Alat tambahan'}
            ariaLabel={showExtraTools ? 'Hide extra toolbar tools' : 'Show extra toolbar tools'}
            ariaControls={showExtraTools ? 'app-toolbar-extra-tools' : undefined}
            ariaExpanded={showExtraTools}
            onClick={toggleExtraTools}
          >
            <svg
              className={`h-4 w-4 transition-transform duration-200 ${showExtraTools ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" />
            </svg>
          </ToolbarActionButton>

          {/* Collapsible Extra Utilities Dock */}
          {showExtraTools && (
            <div
              id="app-toolbar-extra-tools"
              className="flex items-center gap-1 border-l border-slate-700/80 pl-1.5"
              role="group"
              aria-label="Extra toolbar tools"
            >
              <ToolbarActionButton
                tooltip={landingUiMode === 'legacy' ? 'Tampilan Alternatif' : 'Legacy UI'}
                ariaLabel={
                  landingUiMode === 'legacy'
                    ? 'Gunakan tampilan landing page alternatif'
                    : 'Kembali ke tampilan landing page Legacy UI'
                }
                tone={landingUiMode === 'alternative' ? 'emerald' : 'default'}
                onClick={() => void toggleLandingUi()}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5v-13zM4 9h16M9 9v11" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 13l2 2-2 2m3-2h3" />
                </svg>
              </ToolbarActionButton>

              <ToolbarActionButton
                tooltip="Patch Notes (v1.5.0)"
                ariaLabel="Buka Patch Notes"
                onClick={() => {
                  setSelectedPatchVersion('1.5.0');
                  setActiveDialog('patch');
                }}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 3.75h7l4.25 4.5v12A.75.75 0 0117.5 21h-10a.75.75 0 01-.75-.75v-16A.75.75 0 017.5 3.5h6.25M14 3.75v4.5h4.25M9 12h6m-6 3.5h6" />
                </svg>
              </ToolbarActionButton>

              <ToolbarActionButton
                tooltip="Catatan Staging"
                ariaLabel="Buka catatan staging"
                tone="amber"
                onClick={() => setActiveDialog('unfixed')}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4m0 4h.01M10.3 3.95L2.8 17a2 2 0 001.73 3h14.94a2 2 0 001.73-3l-7.5-13.05a2 2 0 00-3.4 0z" />
                </svg>
              </ToolbarActionButton>

              <ToolbarActionButton
                tooltip="Mini Game · Snake"
                ariaLabel="Buka mini game Snake"
                tone="emerald"
                onClick={() => setActiveDialog('game')}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 8h8a4 4 0 014 4v3a2 2 0 01-3.2 1.6L14 14h-4l-2.8 2.6A2 2 0 014 15v-3a4 4 0 014-4zM8 11v4m-2-2h4m6-1h.01M18 14h.01" />
                </svg>
              </ToolbarActionButton>

              <ToolbarActionButton
                tooltip={apiTestState === 'checking' ? 'Menguji API…' : 'Uji Koneksi API'}
                ariaLabel="Uji koneksi API"
                ariaBusy={apiTestState === 'checking'}
                disabled={apiTestState === 'checking'}
                tone={apiTestState === 'online' ? 'emerald' : apiTestState === 'offline' ? 'rose' : 'default'}
                onClick={() => void runApiTest()}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8.5 5.5a5 5 0 017 0m-10 3a9 9 0 0113 0m-16 3a13 13 0 0119 0M12 18h.01M12 14.5a3.5 3.5 0 00-2.47 1.03" />
                </svg>
              </ToolbarActionButton>

              {user && user.auth_level >= 2 && (
                <ToolbarActionButton
                  tooltip="Ruang Admin"
                  ariaLabel="Buka Ruang Admin"
                  tone="amber"
                  onClick={() => navigate('/admin')}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3l8 3v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3zm-3 9l2 2 4-4" />
                  </svg>
                </ToolbarActionButton>
              )}
            </div>
          )}

          {/* Session Sign In / Out */}
          <div className="border-l border-slate-700/80 pl-1.5">
            <ToolbarActionButton
              tooltip={mode === 'guest' ? 'Masuk / Daftar' : 'Keluar Akun'}
              ariaLabel={mode === 'guest' ? 'Masuk atau daftar' : `Keluar dari akun ${user?.user ?? ''}`}
              tone={mode === 'guest' ? 'default' : 'rose'}
              onClick={() => void handleAccountAction()}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                {mode === 'guest' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4m-4-4l4-5-4-5m4 5H3" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4m4-4l-4-5 4-5m-4 5h12" />
                )}
              </svg>
            </ToolbarActionButton>
          </div>
        </div>
      </aside>

      {/* MODAL DIALOGS */}
      {activeDialog && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setActiveDialog(null);
            }
          }}
        >
          <section
            className={`app-toolbar-modal w-full rounded-2xl border border-slate-700 bg-slate-900 p-6 text-left shadow-2xl ${
              activeDialog === 'game'
                ? 'max-w-3xl'
                : activeDialog === 'patch'
                  ? 'flex max-h-[80vh] max-w-2xl flex-col'
                  : activeDialog === 'api'
                    ? 'max-w-2xl'
                    : 'max-w-lg'
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-toolbar-dialog-title"
          >
            <div className="mb-4 flex shrink-0 items-center justify-between gap-4 border-b border-slate-800 pb-3.5">
              <div>
                <h2 id="app-toolbar-dialog-title" className="text-lg font-bold text-white">
                  {dialogTitle}
                </h2>
                {activeDialog === 'patch' && (
                  <p className="mt-0.5 text-xs text-slate-400">
                    Riwayat pembaruan fitur, peningkatan kinerja, dan perbaikan sistem PBN Workspace.
                  </p>
                )}
                {activeDialog === 'api' && (
                  <p className="mt-0.5 text-xs text-slate-400">
                    Diagnostik non-destruktif untuk seluruh endpoint layanan dan konektivitas basis data.
                  </p>
                )}
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setActiveDialog(null)}
                aria-label={`Tutup ${dialogTitle}`}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-700/80 text-slate-400 transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                ×
              </button>
            </div>

            {activeDialog === 'game' ? (
              <iframe
                title="Mini Game Snake"
                src={apiClient.getSnakeGameUrl()}
                sandbox="allow-scripts allow-same-origin"
                className="h-[min(76vh,760px)] w-full rounded-xl border border-slate-800 bg-slate-950"
              />
            ) : activeDialog === 'api' ? (
              <div className="space-y-4">
                {apiTestState === 'checking' ? (
                  <div className="app-toolbar-subcard flex items-center justify-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 py-12">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
                    <p role="status" className="text-sm font-medium text-slate-300">
                      Menjalankan pemeriksaan endpoint…
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Top Health Banner */}
                    <div
                      role="status"
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                        apiTestState === 'online'
                          ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                          : 'border-rose-500/35 bg-rose-500/10 text-rose-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`h-2.5 w-2.5 rounded-full ${apiTestState === 'online' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        <span className="text-sm font-semibold">
                          {apiTestState === 'online' ? 'Semua pemeriksaan berhasil' : 'Ada pemeriksaan yang gagal'}
                        </span>
                        {apiElapsedMs !== null && (
                          <span className="rounded-md bg-slate-950/40 px-2 py-0.5 font-mono text-xs text-slate-300">
                            {apiElapsedMs < 1000
                              ? `${Math.round(apiElapsedMs)} ms`
                              : `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(apiElapsedMs / 1000)} detik`}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void runApiTest()}
                        className="rounded-lg border border-slate-600/70 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
                      >
                        Uji Ulang
                      </button>
                    </div>

                    {/* 2-Column Diagnostics Grid */}
                    <ul className="grid max-h-[55vh] grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2" aria-label="Hasil pemeriksaan API">
                      {apiDiagnostics.map((result) => (
                        <li
                          key={result.id}
                          className="app-toolbar-subcard flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3"
                        >
                          <span
                            aria-hidden="true"
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                              result.passed
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-rose-500/15 text-rose-300'
                            }`}
                          >
                            {result.passed ? '✓' : '×'}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-slate-100">
                              {result.label}
                            </span>
                            <span className={`mt-0.5 block break-words text-[11px] leading-snug ${result.passed ? 'text-slate-400' : 'text-rose-300'}`}>
                              {result.detail}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ) : activeDialog === 'patch' ? (
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden text-sm leading-relaxed text-slate-300">
                <div
                  role="tablist"
                  aria-label="Versi Patch Notes"
                  className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-slate-800 pb-3"
                >
                  {PATCH_NOTES.map((note, idx) => {
                    const isSelected = selectedPatchVersion === note.version;
                    return (
                      <button
                        key={note.version}
                        id={`patch-tab-${note.version}`}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        aria-controls="patch-version-panel"
                        tabIndex={isSelected ? 0 : -1}
                        onClick={() => setSelectedPatchVersion(note.version)}
                        onKeyDown={handlePatchTabKeyDown}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-400 ${
                          isSelected
                            ? 'bg-sky-500 text-white shadow-sm'
                            : 'border border-slate-800 bg-slate-950/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <span>v{note.label}</span>
                        {idx === 0 && (
                          <span className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase ${isSelected ? 'bg-white/20 text-white' : 'bg-emerald-500/15 text-emerald-300'}`}>
                            Latest
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {PATCH_NOTES.map((note) => note.version === selectedPatchVersion && (
                  <div
                    key={note.version}
                    id="patch-version-panel"
                    role="tabpanel"
                    aria-labelledby={`patch-tab-${note.version}`}
                    tabIndex={0}
                    className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain pr-1"
                  >
                    {note.items.map((item, itemIdx) => (
                      <div
                        key={item}
                        className="app-toolbar-subcard flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3.5"
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-sky-500/15 font-mono text-[11px] font-semibold text-sky-300">
                          {itemIdx + 1}
                        </span>
                        <p className="text-xs leading-relaxed text-slate-200 sm:text-sm">{item}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="app-toolbar-subcard rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                Proses Staging telah diperbaiki pada update 1.2.0.
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}