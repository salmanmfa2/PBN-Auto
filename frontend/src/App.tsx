import { useState } from 'react';
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import AdminPage from './pages/AdminPage';
import LandingPage from './pages/LandingPage';
import AnalyticsPage from './pages/AnalyticsPage';
import InsightHubPage from './pages/InsightHubPage';
import LoginPage from './pages/LoginPage';
import PelantikanAgendaPage from './pages/PelantikanAgendaPage';
import PerformanceAnalysisPage from './pages/PerformanceAnalysisPage';
import PltPlhManagementPage from './pages/PltPlhManagementPage';
import { AppToolbar } from './components/AppToolbar';
import { ChatWidget } from './components/ChatWidget';
import { FeedbackWidget } from './components/FeedbackWidget';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function RequireSession() {
  const { mode, isLoading } = useAuth();
  if (isLoading) return null;
  return mode ? <Outlet /> : <Navigate to="/login" replace />;
}

function RequireAdmin() {
  const { user } = useAuth();
  return user && user.auth_level >= 2 ? <Outlet /> : <Navigate to="/" replace />;
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
          <Route path="/" element={<LandingPage />} />
          <Route path="/pbn-analytics" element={<AnalyticsPage />} />
          <Route path="/insights" element={<InsightHubPage />} />
          <Route path="/insights-beta" element={<InsightHubPage source="database" />} />
          <Route path="/manajemen-plt-plh" element={<PltPlhManagementPage />} />
          <Route path="/analisis-kinerja" element={<PerformanceAnalysisPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
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
      <AppRoutes />
    </AuthProvider>
  );
}
