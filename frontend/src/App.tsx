import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { EmergencyBanner } from './components/EmergencyBanner';
import { ProtectedRoute } from './components/ProtectedRoute';

import { PublicReportPage } from './pages/PublicReportPage';
import { TrackingPage } from './pages/TrackingPage';
import { LoginPage } from './pages/LoginPage';
import { VerificationPage } from './pages/VerificationPage';
import { CoordinationPage } from './pages/CoordinationPage';
import { EnquetePage } from './pages/EnquetePage';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app-root">
          <EmergencyBanner />
          <Navbar />
          <main className="main-content">
            <Routes>
              {/* Routes publiques */}
              <Route path="/" element={<PublicReportPage />} />
              <Route path="/suivi" element={<TrackingPage />} />
              <Route path="/login" element={<LoginPage />} />

              {/* Routes protégées */}
              <Route
                path="/verification"
                element={
                  <ProtectedRoute allowedRoles={['verificateur', 'coordinateur']}>
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
          </main>
          <footer className="footer">
            <div className="container footer-content">
              <p>© {new Date().getFullYear()} Observatoire Inondations & Dommages (O.I.D) — Dispositif de gestion de crise et résilience.</p>
            </div>
          </footer>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
