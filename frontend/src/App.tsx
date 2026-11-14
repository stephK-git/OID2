import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SiteHeader, SiteFooter } from './components/site';
import { ProtectedRoute, CitizenOnlyRoute } from './components/ProtectedRoute';

import { LandingPage } from './pages/LandingPage';
import { PublicReportPage } from './pages/PublicReportPage';
import { LoginPage } from './pages/LoginPage';
import { PublicIncidentsPage } from './pages/PublicIncidentsPage';
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
  const hideDefaultChrome = isCommandScreen;

  return (
    <div className={`app-root ${isCommandScreen ? 'is-command' : ''}`}>
      {!hideDefaultChrome && <SiteHeader />}
      <div
        id={isCommandScreen || isLandingPage ? undefined : 'contenu'}
        className={isCommandScreen ? 'command-screen-wrap' : 'main-content'}
      >
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
          <Route path="/consulter" element={<PublicIncidentsPage />} />
          <Route path="/incidents" element={<Navigate to="/consulter" replace />} />
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
      {!hideDefaultChrome && <SiteFooter />}
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
