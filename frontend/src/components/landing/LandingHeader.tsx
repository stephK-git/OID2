import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, LogOut, Menu, Waves, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface LandingHeaderProps {
  activeSection?: string;
  agentPath: string;
}

const NAV_ITEMS = [
  { id: 'aujourdhui', label: "Aujourd'hui" },
  { id: 'quoi', label: 'Que signaler ?' },
  { id: 'etapes', label: 'Comment ça marche' },
  { id: 'securite', label: 'Sécurité' },
];

export const LandingHeader: React.FC<LandingHeaderProps> = ({
  activeSection = '',
  agentPath,
}) => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="mx-auto flex h-16 max-w-[1200px] 2xl:max-w-[1320px] items-center justify-between gap-4 px-4 sm:h-[68px] sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2.5 sm:gap-3"
          aria-label="OID — Accueil"
        >
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-[var(--water)] text-white sm:h-9 sm:w-9">
            <Waves size={20} strokeWidth={2.5} aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-display text-[18px] font-extrabold tracking-[-0.02em] text-ink">
              OID
            </span>
            <span className="hidden text-[12px] font-medium text-ink2 sm:block">
              Observatoire Inondations &amp; Dommages
            </span>
          </span>
        </Link>

        <nav
          className="hidden items-center gap-1 text-[14px] font-semibold text-ink2 xl:flex"
          aria-label="Navigation principale"
        >
          {NAV_ITEMS.map((item) => {
            const active = activeSection === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`rounded-lg px-3.5 py-3 transition-colors ${
                  active
                    ? 'font-bold text-[var(--water)]'
                    : 'hover:bg-[var(--s2)] hover:text-[var(--water)]'
                }`}
                aria-current={active ? 'true' : undefined}
              >
                {item.label}
              </a>
            );
          })}
          <Link
            to="/consulter"
            className="rounded-lg px-3.5 py-3 transition-colors hover:bg-[var(--s2)] hover:text-[var(--water)]"
          >
            Consulter
          </Link>
        </nav>

        <div className="hidden items-center gap-2 xl:flex">
          {isAuthenticated && user ? (
            <>
              <Link
                to={agentPath}
                className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-[var(--water)] px-4 text-[14px] font-bold text-white transition-colors hover:bg-[var(--water-hi)]"
              >
                <span>Mon poste ({user.nom})</span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-line2 text-ink2 transition-colors hover:bg-[var(--s2)] hover:text-ink"
                title="Déconnexion"
                aria-label="Se déconnecter"
              >
                <LogOut size={17} />
              </button>
            </>
          ) : (
            <>
              <Link
                to={agentPath}
                className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-line2 px-4 text-[14px] font-bold text-ink transition-colors hover:bg-[var(--s2)]"
              >
                <LogIn size={16} />
                <span>Espace agent</span>
              </Link>
              <Link
                to="/signaler"
                className="inline-flex h-11 items-center rounded-[10px] bg-[var(--water)] px-[18px] text-[14px] font-bold text-white transition-colors hover:bg-[var(--water-hi)]"
              >
                Signaler un incident
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-line2 text-ink transition-colors hover:bg-[var(--s2)] xl:hidden"
          aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={menuOpen}
          aria-controls="landing-mobile-menu"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {menuOpen && (
        <div
          id="landing-mobile-menu"
          className="border-t border-line bg-surface px-4 pb-4 pt-2 shadow-lg xl:hidden"
        >
          <nav className="flex flex-col" aria-label="Navigation mobile">
            {NAV_ITEMS.map((item) => {
              const active = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => setMenuOpen(false)}
                  className={`flex h-11 items-center rounded-lg px-3 text-[15px] font-semibold transition-colors ${
                    active
                      ? 'text-[var(--water)]'
                      : 'text-ink2 hover:bg-[var(--s2)] hover:text-ink'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
            {isAuthenticated && user ? (
              <>
                <Link
                  to={agentPath}
                  onClick={() => setMenuOpen(false)}
                  className="flex h-11 items-center justify-center rounded-[10px] bg-[var(--water)] text-[14px] font-bold text-white"
                >
                  Mon poste ({user.nom})
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex h-11 items-center justify-center gap-2 rounded-[10px] border border-line2 text-[14px] font-bold text-ink"
                >
                  <LogOut size={16} />
                  Se déconnecter
                </button>
              </>
            ) : (
              <>
                <Link
                  to={agentPath}
                  onClick={() => setMenuOpen(false)}
                  className="flex h-11 items-center justify-center gap-2 rounded-[10px] border border-line2 text-[14px] font-bold text-ink"
                >
                  <LogIn size={16} />
                  Espace agent
                </Link>
                <Link
                  to="/consulter"
                  onClick={() => setMenuOpen(false)}
                  className="flex h-11 items-center justify-center rounded-[10px] border border-line2 text-[14px] font-bold text-ink"
                >
                  Consulter les incidents
                </Link>
                <Link
                  to="/signaler"
                  onClick={() => setMenuOpen(false)}
                  className="flex h-11 items-center justify-center rounded-[10px] bg-[var(--water)] text-[14px] font-bold text-white"
                >
                  Signaler un incident
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
