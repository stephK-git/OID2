import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AlertTriangle, ShieldCheck, MapPin, Search, LogOut, LogIn, ClipboardCheck, Compass } from 'lucide-react';

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
    <header className="navbar">
      <div className="navbar-container">
        <Link to="/" className="brand">
          <div className="brand-logo">
            <AlertTriangle size={22} className="brand-icon" />
          </div>
          <div>
            <div className="brand-title">O.I.D</div>
            <div className="brand-sub">Observatoire Inondations & Dommages</div>
          </div>
        </Link>

        <nav className="nav-links">
          <Link to="/" className={`nav-link ${isActive('/') ? 'active' : ''}`}>
            <MapPin size={16} />
            <span>Signaler</span>
          </Link>
          <Link to="/suivi" className={`nav-link ${isActive('/suivi') ? 'active' : ''}`}>
            <Search size={16} />
            <span>Suivi</span>
          </Link>

          {isAuthenticated && user && (
            <>
              {(user.role === 'verificateur' || user.role === 'coordinateur') && (
                <Link to="/verification" className={`nav-link ${isActive('/verification') ? 'active' : ''}`}>
                  <ShieldCheck size={16} />
                  <span>Vérification</span>
                </Link>
              )}

              {user.role === 'coordinateur' && (
                <Link to="/coordination" className={`nav-link ${isActive('/coordination') ? 'active' : ''}`}>
                  <Compass size={16} />
                  <span>Coordination</span>
                </Link>
              )}

              {user.role === 'enqueteur' && (
                <Link to="/enquete" className={`nav-link ${isActive('/enquete') ? 'active' : ''}`}>
                  <ClipboardCheck size={16} />
                  <span>Mes Enquêtes</span>
                </Link>
              )}
            </>
          )}
        </nav>

        <div className="nav-auth">
          {isAuthenticated && user ? (
            <div className="user-profile">
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
  );
};

