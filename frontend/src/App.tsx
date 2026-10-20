import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import AnalyticsPage from './pages/AnalyticsPage';
import MenuBuilderPage from './pages/MenuBuilderPage';
import InsightHubPage from './pages/InsightHubPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/pbn-analytics" element={<AnalyticsPage />} />
      <Route path="/menu-builder" element={<MenuBuilderPage />} />
      <Route path="/insights" element={<InsightHubPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
