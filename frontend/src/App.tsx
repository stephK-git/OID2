import React, { useLayoutEffect } from 'react';
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

/**
 * React Router ne réinitialise pas le défilement : sans ceci, une page ouverte depuis
 * le bas de l'accueil s'affiche au même décalage. Seul le chemin déclenche le retour en haut
 * (les changements de filtres dans l'URL ne doivent pas faire remonter la page).
 */
const ScrollToTop: React.FC = () => {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    // 'instant' : le CSS global active scroll-behavior: smooth, qui animerait le retour en haut
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, hash]);

  return null;
};

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
          <ScrollToTop />
          <AppShell />
        </ThemeProvider>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
