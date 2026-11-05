import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import AnalyticsPage from './pages/AnalyticsPage';
import InsightHubPage from './pages/InsightHubPage';
import PltPlhManagementPage from './pages/PltPlhManagementPage';
import { AppToolbar } from './components/AppToolbar';

export default function App() {
  return (
    <>
      <div className="fixed right-3 top-3 z-50">
        <AppToolbar />
      </div>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/pbn-analytics" element={<AnalyticsPage />} />
        <Route path="/insights" element={<InsightHubPage />} />
        <Route path="/manajemen-plt-plh" element={<PltPlhManagementPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
