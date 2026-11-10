import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, MapPin, Search, LogOut, LogIn } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <header className="navbar">
        <div className="navbar-container">
          <Link to="/" className="brand">
            <div className="brand-logo">
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                radar
              </span>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="brand-title">O.I.D.</span>
                <span className="chip water" style={{ marginLeft: '8px', fontSize: '10px' }}>
                  {user?.role ? user.role.toUpperCase() : 'DISTRICT ABJ'}
                </span>
              </div>
              <div className="brand-sub">Observatoire des Inondations · Abidjan</div>
            </div>
          </Link>

          <div className="hidden lg:flex items-center gap-2">
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 9px',
                borderRadius: '99px',
                border: '1px solid var(--warn)',
                color: 'var(--warn)',
                fontSize: '11px',
                fontFamily: 'var(--mono)',
                fontWeight: 600,
              }}
            >
              <i
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--warn)',
                  display: 'inline-block',
                }}
              />
              Vigilance orange v4
            </span>
          </div>

          <nav className="nav-links" aria-label="Navigation principale">
            <Link to="/signaler" className={`nav-link ${isActive('/signaler') ? 'active' : ''}`}>
              <MapPin size={16} />
              <span>Signaler</span>
            </Link>
            <Link to="/suivi" className={`nav-link ${isActive('/suivi') ? 'active' : ''}`}>
              <Search size={16} />
              <span>Suivi</span>
            </Link>
          </nav>

          <div className="nav-auth">
            {isAuthenticated && user ? (
              <div className="user-profile">
                <Link
                  to={
                    user.role === 'coordinateur'
                      ? '/coordination'
                      : user.role === 'verificateur'
                      ? '/verification'
                      : '/enquete'
                  }
                  className="btn-login"
                  style={{ marginRight: '6px', fontSize: '11px', padding: '4px 8px' }}
                  title="Accéder à mon poste opérationnel"
                >
                  <ShieldCheck size={14} />
                  <span>Mon Poste</span>
                </Link>
                <div className="user-info">
                  <span className="user-name">{user.nom}</span>
                  <span className={`role-badge role-${user.role}`}>{user.role}</span>
                </div>
                <button onClick={handleLogout} className="btn-logout" title="Se déconnecter">
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <Link to="/login" className="btn-login">
                <LogIn size={16} />
                <span>Espace Agent</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Barre de navigation mobile en bas sur smartphone (fidèle à pagesignalement.html) */}
      <nav className="oid-mobile-bottom-nav" aria-label="Navigation mobile">
        <Link to="/signaler" className={`oid-mob-tab ${isActive('/signaler') ? 'active' : ''}`}>
          <span className="material-symbols-outlined">warning</span>
          <span>Signaler</span>
        </Link>

        <Link to="/suivi" className={`oid-mob-tab ${isActive('/suivi') ? 'active' : ''}`}>
          <span className="material-symbols-outlined">radar</span>
          <span>Suivi</span>
        </Link>

        <a href="tel:180" className="oid-mob-tab oid-mob-tab-emergency">
          <span className="material-symbols-outlined">emergency</span>
          <span>GSPM 180</span>
        </a>

        {isAuthenticated && user ? (
          <Link
            to={
              user.role === 'coordinateur'
                ? '/coordination'
                : user.role === 'verificateur'
                  ? '/verification'
                  : '/enquete'
            }
            className={`oid-mob-tab ${['/coordination', '/verification', '/enquete'].includes(location.pathname) ? 'active' : ''
              }`}
          >
            <span className="material-symbols-outlined">shield_person</span>
            <span>Cellule</span>
          </Link>
        ) : (
          <Link to="/login" className={`oid-mob-tab ${isActive('/login') ? 'active' : ''}`}>
            <span className="material-symbols-outlined">person</span>
            <span>Agent</span>
          </Link>
        )}
      </nav>
    </>
  );
};
