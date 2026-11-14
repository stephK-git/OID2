import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, LogIn, LogOut, Menu, Waves, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useActiveSection } from './useActiveSection';
import './site.css';

export interface SiteHeaderProps {
  /** 'public' : navigation complète. 'auth' : marque + retour (page de connexion). */
  variant?: 'public' | 'auth';
}

interface NavItem {
  key: string;
  label: string;
  /** Route interne, ou ancre de l'accueil si `hash` est renseigné. */
  to: string;
  hash?: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'aujourdhui', label: "Aujourd'hui", to: '/', hash: 'aujourdhui' },
  { key: 'consulter', label: 'Consulter', to: '/consulter' },
  { key: 'etapes', label: 'Comment ça marche', to: '/', hash: 'etapes' },
  { key: 'securite', label: 'Sécurité', to: '/', hash: 'securite' },
];

const SECTION_IDS = NAV_ITEMS.filter((item) => item.hash).map((item) => item.hash as string);

export const SiteHeader: React.FC<SiteHeaderProps> = ({ variant = 'public' }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const onLanding = location.pathname === '/';
  const activeSection = useActiveSection(SECTION_IDS, onLanding && variant === 'public');

  const agentPath =
    isAuthenticated && user
      ? user.role === 'coordinateur'
        ? '/coordination'
        : user.role === 'verificateur'
        ? '/verification'
        : '/enquete'
      : '/login';

  const isActive = (item: NavItem) =>
    item.hash
      ? onLanding && activeSection === item.hash
      : location.pathname === item.to ||
        (item.to === '/consulter' && location.pathname === '/incidents');

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const onViewportChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    mediaQuery.addEventListener('change', onViewportChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      mediaQuery.removeEventListener('change', onViewportChange);
    };
  }, [menuOpen]);

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
    navigate('/login');
  };

  /** Ancre : défilement simple sur l'accueil, navigation + ancre ailleurs. */
  const renderLink = (item: NavItem, className: string, onClick?: () => void) => {
    const children = (
      <>
        <span>{item.label}</span>
        {className.includes('site-drawer-link') && (
          <ChevronRight size={16} aria-hidden="true" style={{ opacity: 0.6 }} />
        )}
      </>
    );
    const active = isActive(item);
    const cls = `${className}${active ? ' is-active' : ''}`;

    if (item.hash && onLanding) {
      return (
        <a
          key={item.key}
          href={`#${item.hash}`}
          className={cls}
          aria-current={active ? 'true' : undefined}
          onClick={onClick}
        >
          {children}
        </a>
      );
    }
    return (
      <Link
        key={item.key}
        to={item.hash ? { pathname: '/', hash: `#${item.hash}` } : item.to}
        className={cls}
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
      >
        {children}
      </Link>
    );
  };

  const brand = (
    <Link to="/" className="site-brand" aria-label="OID — Accueil">
      <span className="site-brand-badge" aria-hidden="true">
        <Waves size={20} strokeWidth={2.5} />
      </span>
      <span className="site-brand-text">
        <span className="site-brand-name">OID</span>
        <span className="site-brand-sub">
          {variant === 'auth' ? "Portail d'accès opérationnel" : 'Observatoire Inondations & Dommages'}
        </span>
      </span>
    </Link>
  );

  if (variant === 'auth') {
    return (
      <header className="site-header">
        <a className="site-skip" href="#contenu">
          Aller au contenu principal
        </a>
        <div className="site-wrap site-header-row">
          {brand}
          <Link to="/" className="site-btn site-btn-outline">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Retour accueil</span>
          </Link>
        </div>
      </header>
    );
  }

  return (
    <>
      <header className="site-header">
        <a className="site-skip" href="#contenu">
          Aller au contenu principal
        </a>
        <div className="site-wrap site-header-row">
          {brand}

          <nav className="site-nav" aria-label="Navigation principale">
            {NAV_ITEMS.map((item) => renderLink(item, 'site-nav-link'))}
          </nav>

          <div className="site-actions">
            {isAuthenticated && user ? (
              <>
                <Link to={agentPath} className="site-btn site-btn-primary">
                  Mon poste ({user.nom})
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="site-btn site-btn-outline site-btn-icon"
                  title="Déconnexion"
                  aria-label="Se déconnecter"
                >
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="site-btn site-btn-outline">
                  <LogIn size={16} aria-hidden="true" />
                  <span>Espace agent</span>
                </Link>
                <Link to="/signaler" className="site-btn site-btn-primary">
                  Signaler un incident
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            className="site-burger"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            aria-controls="site-mobile-menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <div
        className={`site-backdrop${menuOpen ? ' is-open' : ''}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />

      <aside
        id="site-mobile-menu"
        className={`site-drawer${menuOpen ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navigation"
        aria-hidden={!menuOpen}
      >
        <div className="site-drawer-head">
          <Link to="/" className="site-brand" aria-label="OID — Accueil" onClick={() => setMenuOpen(false)}>
            <span className="site-brand-badge" aria-hidden="true">
              <Waves size={20} strokeWidth={2.5} />
            </span>
            <span className="site-brand-name">OID</span>
          </Link>
          <button
            type="button"
            className="site-burger"
            onClick={() => setMenuOpen(false)}
            aria-label="Fermer le menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="site-drawer-body">
          <div className="site-drawer-label">Navigation</div>
          <nav aria-label="Navigation mobile" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {NAV_ITEMS.map((item) => renderLink(item, 'site-drawer-link', () => setMenuOpen(false)))}
          </nav>
        </div>

        <div className="site-drawer-foot">
          {isAuthenticated && user ? (
            <>
              <Link to={agentPath} className="site-btn site-btn-primary" onClick={() => setMenuOpen(false)}>
                Mon poste ({user.nom})
              </Link>
              <button type="button" onClick={handleLogout} className="site-btn site-btn-outline">
                <LogOut size={16} aria-hidden="true" />
                <span>Se déconnecter</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/signaler" className="site-btn site-btn-emergency" onClick={() => setMenuOpen(false)}>
                Signaler un incident
              </Link>
              <Link to="/login" className="site-btn site-btn-outline" onClick={() => setMenuOpen(false)}>
                <LogIn size={16} aria-hidden="true" />
                <span>Espace agent</span>
              </Link>
            </>
          )}
        </div>
      </aside>
    </>
  );
};
