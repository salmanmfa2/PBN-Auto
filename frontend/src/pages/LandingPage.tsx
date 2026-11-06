import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as apiClient from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { PltPlhMonitoringRecord } from '../types';
import logoAnalysis from '../assets/logo_analysis.png';
import logoBrain from '../assets/logo_brain.png';
import logoPelantikan from '../assets/pelantikan.png';
import logoPerformance from '../assets/performance.png';
import logoMutasi from '../assets/mutasi.png';


const features = [
  { key: 'analytics', title: 'PBN Analytics', image: logoAnalysis, subtitle: 'Upload, clean, export, dan generation Bahan Mutasi', path: '/pbn-analytics', color: 'text-emerald-300' },
  { key: 'insights', title: 'Insight Hub (On Development)', image: logoBrain, subtitle: 'PBN Open + Edu + HB dashboard', path: '/insights', color: 'text-sky-300' },
  { key: 'plt-plh', title: 'Manajemen Plt./Plh.', subtitle: 'Monitoring penugasan Plt. pejabat', path: '/manajemen-plt-plh', color: 'text-violet-300' },
  { key: 'nd-undangan', title: 'Generate ND Undangan Pelantikan', image: logoPelantikan, subtitle: 'Generate nota dinas undangan pelantikan', color: 'text-amber-300', placeholder: true },
  { key: 'analisis-kinerja', title: 'Analisis Kinerja DJPb', image: logoPerformance, subtitle: 'Analisis kinerja DJPb', color: 'text-cyan-300', placeholder: true },
  { key: 'progress-bahan', title: 'Bahan Pendukung MPK', subtitle: 'Library Bahan, dan Monitoring progress bahan ', color: 'text-rose-300', placeholder: true },
  { Key: 'simulasi-mutasi', title: 'Simulasi Mutasi', subtitle: 'Simulasi mutasi DJPb', color: 'text-fuchsia-300',image:logoMutasi, placeholder: true },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<PltPlhMonitoringRecord[]>([]);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [developmentMenu, setDevelopmentMenu] = useState<string | null>(null);

  useEffect(() => {
    if (!developmentMenu) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDevelopmentMenu(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [developmentMenu]);

  useEffect(() => {
    apiClient.getPltPlhNotifications()
      .then(setNotifications)
      .catch((error: unknown) => {
        setNotificationError(error instanceof Error ? error.message : String(error));
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-950 px-6 py-10 text-slate-100">
      <div className="w-full max-w-2xl pt-12">
        <div className="mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Working Utilities</p>
          <h1 className="text-3xl font-semibold text-white md:text-4xl">Pilih menu</h1>
          <p className="mt-3 text-sm text-slate-400">Pilih fungsi yang ingin Anda gunakan.</p>
        </div>

        {notifications.length > 0 && (
          <button
            type="button"
            onClick={() => navigate('/manajemen-plt-plh')}
            className="mb-5 flex w-full items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left transition hover:bg-amber-500/15 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v4m0 4h.01M10.3 3.95L2.8 17a2 2 0 001.73 3h14.94a2 2 0 001.73-3l-7.5-13.05a2 2 0 00-3.4 0z" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-amber-200">Notifikasi Manajemen Plt./Plh.</span>
              <span className="mt-0.5 block text-xs text-amber-100/70">
                {notifications.length} record perlu diperhatikan — buka monitoring
              </span>
            </span>
            <span className="text-lg text-amber-300" aria-hidden="true">→</span>
          </button>
        )}
        {notificationError && (
          <div role="alert" className="mb-5 rounded-lg border border-rose-700/50 bg-rose-900/20 px-4 py-3 text-xs text-rose-200">
            Notifikasi Plt./Plh. tidak dapat dimuat: {notificationError}
          </div>
        )}

        <div className="space-y-2">
          {[
            ...features,
            ...(user && user.auth_level >= 2
              ? [{ key: 'admin', title: 'Admin', subtitle: 'Pengelolaan akun dan data', path: '/admin', color: 'text-amber-300' }]
              : []),
          ].map((feature) => (
            <button
              key={feature.key}
              type="button"
              onClick={() => {
                if ('placeholder' in feature && feature.placeholder) {
                  setDevelopmentMenu(feature.title);
                  return;
                }
                if ('path' in feature && feature.path) navigate(feature.path);
              }}
              className="group flex w-full items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3.5 text-left transition hover:border-slate-700 hover:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 ${feature.color}`}>
                {feature.image ? (
                  <img src={feature.image} alt="" className="h-6 w-6 object-contain" />
                ) : feature.key === 'admin' ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3l8 3v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3zm-3 9l2 2 4-4" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2zM8 7h8M8 11h8" />
                  </svg>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-slate-100">{feature.title}</h2>
                <p className="mt-0.5 text-xs text-slate-400">{feature.subtitle}</p>
              </div>
              <span className="text-lg text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-slate-200" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </div>
      {developmentMenu && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDevelopmentMenu(null);
          }}
        >
          <section
            className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-6 text-center shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="landing-development-title"
          >
            <h2 id="landing-development-title" className="text-lg font-semibold text-white">
              On development
            </h2>
            <p className="mt-2 text-sm text-slate-400">{developmentMenu}</p>
            <button type="button" onClick={() => setDevelopmentMenu(null)} className="btn-secondary mt-5" autoFocus>
              Tutup
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
