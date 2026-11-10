import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { PublicHeader } from './components/shell';
import { ProtectedRoute, CitizenOnlyRoute } from './components/ProtectedRoute';

import { LandingPage } from './pages/LandingPage';
import { PublicReportPage } from './pages/PublicReportPage';
import { TrackingPage } from './pages/TrackingPage';
import { LoginPage } from './pages/LoginPage';
import { VerificationPage } from './pages/VerificationPage';
import { CoordinationPage } from './pages/CoordinationPage';
import { EnquetePage } from './pages/EnquetePage';

const AppShell: React.FC = () => {
  const location = useLocation();
  const isLandingPage = location.pathname === '/';
  const isCommandScreen =
    location.pathname.startsWith('/coordination') ||
    location.pathname.startsWith('/verification') ||
    location.pathname.startsWith('/enquete') ||
    location.pathname === '/login';
  const hideDefaultChrome = isCommandScreen || isLandingPage;

  return (
    <div className={`app-root ${isCommandScreen ? 'is-command' : ''}`}>
      {!hideDefaultChrome && <PublicHeader />}
      <div className={isCommandScreen ? 'command-screen-wrap' : isLandingPage ? '' : 'main-content'}>
        <Routes>
          {/* Routes publiques */}
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/signaler"
            element={
              <CitizenOnlyRoute>
                <PublicReportPage />
              </CitizenOnlyRoute>
            }
          />
          <Route path="/signalement" element={<Navigate to="/signaler" replace />} />
          <Route path="/suivi" element={<TrackingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/agent/connexion" element={<Navigate to="/login" replace />} />

          {/* Routes protégées */}
          <Route
            path="/verification"
            element={
              <ProtectedRoute allowedRoles={['verificateur']}>
                <VerificationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/coordination"
            element={
              <ProtectedRoute allowedRoles={['coordinateur']}>
                <CoordinationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/enquete"
            element={
              <ProtectedRoute allowedRoles={['enqueteur']}>
                <EnquetePage />
              </ProtectedRoute>
            }
          />

          {/* Redirection par défaut */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {!hideDefaultChrome && (
        <footer className="footer">
          <div className="container footer-content">
            <div className="footer-brand-row">
              <span className="material-symbols-outlined footer-brand-icon">tsunami</span>
              <strong>O.I.D — Observatoire Inondations &amp; Dommages</strong>
              <span className="footer-sep">•</span>
              <span>District Autonome d'Abidjan</span>
            </div>
            <p className="footer-copy">
              © {new Date().getFullYear()} Dispositif de gestion de crise hydrologique, veille citoyenne et résilience urbaine · Urgences GSPM : <strong>180</strong> / Secours : <strong>112</strong>
            </p>
          </div>
        </footer>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ThemeProvider>
          <AppShell />
        </ThemeProvider>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
