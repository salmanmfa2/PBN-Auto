import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import AdminPage from './pages/AdminPage';
import LandingPage from './pages/LandingPage';
const AlternativeLandingPage = lazy(() => import('./pages/LandingPage_Alternative'));
import AnalyticsPage from './pages/AnalyticsPage';
import InsightHubPage from './pages/InsightHubPage';
import LoginPage from './pages/LoginPage';
import PelantikanAgendaPage from './pages/PelantikanAgendaPage';
import PerformanceAnalysisPage from './pages/PerformanceAnalysisPage';
import MutationAnalysisPage from './pages/MutationAnalysisPage';
import PltPlhManagementPage from './pages/PltPlhManagementPage';
import FragmentPetikanPage from './pages/FragmentPetikanPage';
import { AppToolbar } from './components/AppToolbar';
import { ChatWidget } from './components/ChatWidget';
import { FeedbackWidget } from './components/FeedbackWidget';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MenuAccessProvider, useMenuAccess } from './contexts/MenuAccessContext';
import * as apiClient from './services/api';
import type { MenuAccessKey } from './types';
import {
  getLandingUiMode,
  LANDING_UI_CHANGED_EVENT,
  setLandingUiMode as persistLandingUiMode,
  type LandingUiMode,
} from './utils/landingUi';

function RequireSession() {
  const { mode, isLoading } = useAuth();
  if (isLoading) return null;
  return mode ? <Outlet /> : <Navigate to="/login" replace />;
}

function RequireMenuView({ menuKey }: { menuKey: MenuAccessKey }) {
  const { isLoading, error, canView, showNoAuth, reload } = useMenuAccess();
  const allowed = canView(menuKey);

  useEffect(() => {
    if (!isLoading && !error && !allowed) showNoAuth();
  }, [isLoading, error, allowed, showNoAuth]);

  if (isLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-surface-950 text-sm text-slate-400">Memuat izin menu…</main>;
  }
  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-950 px-4 text-slate-100">
        <section className="max-w-lg rounded-xl border border-rose-700/50 bg-surface-900 p-6">
          <h1 className="font-semibold">Izin menu tidak dapat dimuat</h1>
          <p className="mt-2 text-sm text-slate-300">{error}</p>
          <button className="btn-primary mt-4" onClick={() => void reload()} type="button">
            Coba lagi
          </button>
        </section>
      </main>
    );
  }
  if (!allowed) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function RedirectExperimentalPelantikanRoute() {
  const { agendaId } = useParams<{ agendaId: string }>();
  const target = agendaId
    ? `/undangan-pelantikan/${agendaId}`
    : '/undangan-pelantikan';
  return <Navigate to={target} replace />;
}

function AppRoutes() {
  const { mode, user, isLoading } = useAuth();
  const [activeWidget, setActiveWidget] = useState<'chat' | 'feedback' | null>(null);
  const [landingUiMode, setLandingUiModeState] = useState<LandingUiMode>(getLandingUiMode);

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
          if (active) persistLandingUiMode(savedMode);
        })
        .catch(() => undefined);
    } else if (mode === 'guest') {
      setLandingUiModeState('legacy');
    }
    return () => {
      active = false;
    };
  }, [mode, user?.user]);

  if (isLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-surface-950 text-sm text-slate-400">Memuat aplikasi…</main>;
  }

  return (
    <>
      {mode && (
        <>
          <AppToolbar />
          {user && (
            <>
              <ChatWidget
                isOpen={activeWidget === 'chat'}
                onOpen={() => setActiveWidget('chat')}
                onClose={() => setActiveWidget(null)}
              />
              <FeedbackWidget
                isOpen={activeWidget === 'feedback'}
                onOpen={() => setActiveWidget('feedback')}
                onClose={() => setActiveWidget(null)}
              />
            </>
          )}
        </>
      )}
      <Routes>
        <Route
          path="/login"
          element={mode ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route element={<RequireSession />}>
          <Route
            path="/"
            element={
              landingUiMode === 'alternative' ? (
                <Suspense
                  fallback={
                    <main className="flex min-h-screen items-center justify-center bg-surface-950 text-sm text-slate-400">
                      Memuat tampilan alternatif…
                    </main>
                  }
                >
                  <AlternativeLandingPage />
                </Suspense>
              ) : (
                <LandingPage />
              )
            }
          />
          <Route element={<RequireMenuView menuKey="analytics" />}>
            <Route path="/pbn-analytics" element={<AnalyticsPage />} />
          </Route>
          <Route element={<RequireMenuView menuKey="insights-beta" />}>
            <Route path="/insights-beta" element={<InsightHubPage source="database" />} />
          </Route>
          <Route element={<RequireMenuView menuKey="plt-plh" />}>
            <Route path="/manajemen-plt-plh" element={<PltPlhManagementPage />} />
          </Route>
          <Route element={<RequireMenuView menuKey="analisis-kinerja" />}>
            <Route path="/analisis-kinerja" element={<PerformanceAnalysisPage />} />
          </Route>
          <Route element={<RequireMenuView menuKey="analisis-mutasi" />}>
            <Route path="/analisis-mutasi" element={<MutationAnalysisPage />} />
          </Route>
          <Route element={<RequireMenuView menuKey="fragment-petikan" />}>
            <Route path="/fragment-petikan" element={<FragmentPetikanPage />} />
          </Route>
          <Route element={<RequireMenuView menuKey="admin" />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route element={<RequireMenuView menuKey="nd-undangan" />}>
            <Route path="/undangan-pelantikan" element={<PelantikanAgendaPage workflowMode="all_sheets" />} />
            <Route path="/undangan-pelantikan/:agendaId" element={<PelantikanAgendaPage />} />
            <Route
              path="/undangan-pelantikan-experimental"
              element={<RedirectExperimentalPelantikanRoute />}
            />
            <Route
              path="/undangan-pelantikan-experimental/:agendaId"
              element={<RedirectExperimentalPelantikanRoute />}
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        {!user && <Route path="*" element={<Navigate to="/login" replace />} />}
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MenuAccessProvider>
        <AppRoutes />
      </MenuAccessProvider>
    </AuthProvider>
  );
}
