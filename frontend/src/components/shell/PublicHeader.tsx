import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { BrandMark } from './BrandMark';
import { MapPin, LogOut, LogIn, ArrowLeft, ListFilter } from 'lucide-react';

export interface PublicHeaderProps {
  isLanding?: boolean;
  isAuth?: boolean;
  activeSection?: string;
}

export const PublicHeader: React.FC<PublicHeaderProps> = ({
  isLanding = false,
  isAuth = false,
  activeSection,
}) => {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const agentDest =
    user?.role === 'coordinateur'
      ? '/coordination'
      : user?.role === 'verificateur'
      ? '/verification'
      : '/enquete';

  return (
    <>
      <header
        className="oid-public-header"
        style={{
          height: '64px',
          minHeight: '64px',
          backgroundColor: 'var(--s1)',
          borderBottom: '1px solid var(--line)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          transition: 'background-color 150ms ease, border-color 150ms ease',
        }}
      >
        <div
          className="container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            width: '100%',
            maxWidth: '1280px',
            margin: '0 auto',
            padding: '0 1rem',
          }}
        >
          {/* Logo BrandMark */}
          <Link
            to="/"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            aria-label="OID — Accueil"
          >
            <BrandMark
              subtitle={
                isAuth
                  ? "Portail d'Accès Opérationnel"
                  : 'Observatoire Inondations & Dommages'
              }
            />
          </Link>

          {/* Navigation centrale */}
          {isLanding ? (
            <nav
              className="hidden md:flex items-center gap-1 lg:gap-2 font-medium text-sm"
              aria-label="Navigation principale"
              style={{ color: 'var(--tx2)' }}
            >
              <a
                href="#situation"
                className={`px-3 py-2 rounded-lg transition-colors ${
                  activeSection === 'situation'
                    ? 'text-water font-bold'
                    : 'hover:text-water hover:bg-surface2'
                }`}
                style={{
                  color: activeSection === 'situation' ? 'var(--water)' : 'var(--tx2)',
                  textDecoration: 'none',
                }}
              >
                Incidents en direct
              </a>
              <a
                href="#quoi"
                className={`px-3 py-2 rounded-lg transition-colors ${
                  activeSection === 'quoi'
                    ? 'text-water font-bold'
                    : 'hover:text-water hover:bg-surface2'
                }`}
                style={{
                  color: activeSection === 'quoi' ? 'var(--water)' : 'var(--tx2)',
                  textDecoration: 'none',
                }}
              >
                Que signaler ?
              </a>
              <a
                href="#etapes"
                className={`px-3 py-2 rounded-lg transition-colors ${
                  activeSection === 'etapes'
                    ? 'text-water font-bold'
                    : 'hover:text-water hover:bg-surface2'
                }`}
                style={{
                  color: activeSection === 'etapes' ? 'var(--water)' : 'var(--tx2)',
                  textDecoration: 'none',
                }}
              >
                Fonctionnement
              </a>
              <a
                href="#securite"
                className={`px-3 py-2 rounded-lg transition-colors ${
                  activeSection === 'securite'
                    ? 'text-water font-bold'
                    : 'hover:text-water hover:bg-surface2'
                }`}
                style={{
                  color: activeSection === 'securite' ? 'var(--water)' : 'var(--tx2)',
                  textDecoration: 'none',
                }}
              >
                Consignes de sécurité
              </a>
            </nav>
          ) : !isAuth ? (
            <nav
              className="hidden md:flex items-center gap-2 font-semibold text-sm"
              aria-label="Navigation principale"
            >
              <Link
                to="/signaler"
                className={`btn btn-ghost ${isActive('/signaler') ? 'active' : ''}`}
                style={{
                  color: isActive('/signaler') ? 'var(--water)' : 'var(--tx)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  textDecoration: 'none',
                  padding: '6px 14px',
                  borderRadius: 'var(--r-md)',
                  backgroundColor: isActive('/signaler') ? 'var(--water-dim)' : 'transparent',
                }}
              >
                <MapPin size={16} />
                <span>Signaler</span>
              </Link>
              <Link
                to="/consulter"
                className={`btn btn-ghost ${isActive('/consulter') || isActive('/incidents') ? 'active' : ''}`}
                style={{
                  color:
                    isActive('/consulter') || isActive('/incidents') ? 'var(--water)' : 'var(--tx)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  textDecoration: 'none',
                  padding: '6px 14px',
                  borderRadius: 'var(--r-md)',
                  backgroundColor:
                    isActive('/consulter') || isActive('/incidents')
                      ? 'var(--water-dim)'
                      : 'transparent',
                }}
              >
                <ListFilter size={16} />
                <span>Consulter les incidents</span>
              </Link>
            </nav>
          ) : (
            <div style={{ flex: 1 }} />
          )}

          {/* Espace droit : Bouton d'action */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isAuth ? (
              <Link
                to="/"
                className="btn btn-secondary btn-sm"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  textDecoration: 'none',
                  fontSize: '13px',
                }}
              >
                <ArrowLeft size={15} />
                <span className="hidden sm:inline">Retour accueil</span>
              </Link>
            ) : isAuthenticated && user ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Link
                  to={agentDest}
                  className="btn btn-primary btn-sm"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    textDecoration: 'none',
                    fontSize: '13px',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    admin_panel_settings
                  </span>
                  <span>Mon poste ({user.nom})</span>
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="btn btn-secondary btn-sm"
                  title="Déconnexion"
                  aria-label="Se déconnecter"
                  style={{ padding: '0 10px', height: '36px' }}
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : isLanding ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Link
                  to="/login"
                  className="hidden sm:inline-flex btn btn-secondary btn-sm"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    textDecoration: 'none',
                    fontSize: '13px',
                  }}
                >
                  <LogIn size={15} />
                  <span>Espace agent</span>
                </Link>
                <Link
                  to="/signaler"
                  className="btn btn-primary btn-sm"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    textDecoration: 'none',
                    fontSize: '13px',
                  }}
                >
                  <span>Signaler<span className="hidden sm:inline"> un incident</span></span>
                </Link>
              </div>
            ) : (
              <Link
                to="/login"
                className="btn btn-secondary btn-sm"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  textDecoration: 'none',
                  fontSize: '13px',
                }}
              >
                <LogIn size={15} />
                <span>Espace agent</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Barre de navigation mobile du bas (Signaler) */}
      {!isLanding && !isAuth && (
        <nav className="oid-mobile-bottom-nav" aria-label="Navigation mobile">
          <Link to="/" className={`oid-mob-nav-item ${isActive('/') ? 'active' : ''}`}>
            <span className="material-symbols-outlined">home</span>
            <span>Accueil</span>
          </Link>
          <Link
            to="/signaler"
            className={`oid-mob-nav-item ${isActive('/signaler') ? 'active' : ''}`}
          >
            <span className="material-symbols-outlined">add_location_alt</span>
            <span>Signaler</span>
          </Link>
          <Link
            to="/consulter"
            className={`oid-mob-nav-item ${
              isActive('/consulter') || isActive('/incidents') ? 'active' : ''
            }`}
          >
            <span className="material-symbols-outlined">fact_check</span>
            <span>Consulter</span>
          </Link>
          <Link
            to={isAuthenticated && user ? agentDest : '/login'}
            className={`oid-mob-nav-item ${
              isActive('/login') ||
              isActive('/coordination') ||
              isActive('/verification') ||
              isActive('/enquete')
                ? 'active'
                : ''
            }`}
          >
            <span className="material-symbols-outlined">
              {isAuthenticated ? 'admin_panel_settings' : 'lock'}
            </span>
            <span>{isAuthenticated ? 'Mon poste' : 'Agent'}</span>
          </Link>
        </nav>
      )}
    </>
  );
};

