import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, LogIn, LogOut, Menu, X } from 'lucide-react';
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

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-[1200px] 2xl:max-w-[1320px] items-center justify-between gap-4 px-4 sm:h-[68px] sm:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-3"
            aria-label="OID — Accueil"
          >
            <img
              src="/images/oid-logo.png"
              alt=""
              className="block h-[34px] w-auto shrink-0 object-contain sm:h-[38px]"
              width={78}
              height={38}
            />
            <span className="hidden border-l border-line pl-3 text-[12.5px] font-semibold text-ink2 sm:block lg:hidden xl:block">
              Observatoire Inondations &amp; Dommages
            </span>
          </Link>

          <nav
            className="hidden items-center gap-0.5 text-[13px] font-semibold text-ink2 lg:flex xl:gap-1 xl:text-[14px]"
            aria-label="Navigation principale"
          >
            {NAV_ITEMS.map((item) => {
              const active = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`rounded-lg px-2.5 py-2.5 transition-colors xl:px-3.5 xl:py-3 ${active
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
              className="rounded-lg px-2.5 py-2.5 transition-colors hover:bg-[var(--s2)] hover:text-[var(--water)] xl:px-3.5 xl:py-3"
            >
              Consulter
            </Link>
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            {isAuthenticated && user ? (
              <>
                <Link
                  to={agentPath}
                  className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[var(--water)] px-3.5 text-[13px] font-bold text-white transition-colors hover:bg-[var(--water-hi)] xl:h-11 xl:px-4 xl:text-[14px]"
                >
                  <span>Mon poste ({user.nom})</span>
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-line2 text-ink2 transition-colors hover:bg-[var(--s2)] hover:text-ink xl:h-11 xl:w-11"
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
                  className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line2 px-3 text-[13px] font-bold text-ink transition-colors hover:bg-[var(--s2)] xl:h-11 xl:px-4 xl:text-[14px]"
                >
                  <LogIn size={16} />
                  <span>Espace agent</span>
                </Link>
                <Link
                  to="/signaler"
                  className="inline-flex h-10 items-center rounded-[10px] bg-[var(--water)] px-3.5 text-[13px] font-bold text-white transition-colors hover:bg-[var(--water-hi)] xl:h-11 xl:px-[18px] xl:text-[14px]"
                >
                  Signaler un incident
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-line2 text-ink transition-colors hover:bg-[var(--s2)] lg:hidden"
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Fond assombri du tiroir mobile */}
      <div
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
        className={`landing-drawer-backdrop ${menuOpen ? 'is-open' : ''
          } fixed inset-0 z-[60] bg-slate-950/55 backdrop-blur-[2px] lg:hidden`}
      />

      {/* Sidebar latérale mobile */}
      <aside
        id="landing-mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navigation"
        aria-hidden={!menuOpen}
        className={`landing-drawer ${menuOpen ? 'is-open' : ''
          } fixed inset-y-0 right-0 z-[70] flex w-[min(85vw,320px)] flex-col border-l border-line bg-surface shadow-2xl lg:hidden`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4 sm:h-[68px]">
          <div className="flex items-center gap-2.5">
            <img
              src="/images/oid-logo.png"
              alt="OID"
              className="block h-[34px] w-auto shrink-0 object-contain"
              width={69}
              height={34}
            />
            <span className="border-l border-line pl-2.5 text-[11px] font-semibold text-ink2">
              Menu principal
            </span>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-line2 text-ink transition-colors hover:bg-[var(--s2)]"
            aria-label="Fermer le menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink2">
            Navigation
          </div>
          <nav className="flex flex-col gap-1" aria-label="Navigation mobile">
            {NAV_ITEMS.map((item) => {
              const active = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => setMenuOpen(false)}
                  className={`flex h-11 items-center justify-between rounded-xl px-3 text-[15px] transition-colors ${active
                      ? 'bg-[#e6f0fb] font-bold text-[var(--water)]'
                      : 'font-semibold text-ink hover:bg-[var(--s2)]'
                    }`}
                >
                  <span>{item.label}</span>
                  <ChevronRight size={16} className="shrink-0 opacity-60" aria-hidden="true" />
                </a>
              );
            })}
            <Link
              to="/consulter"
              onClick={() => setMenuOpen(false)}
              className="flex h-11 items-center justify-between rounded-xl px-3 text-[15px] font-semibold text-ink transition-colors hover:bg-[var(--s2)]"
            >
              <span>Consulter les incidents</span>
              <ChevronRight size={16} className="shrink-0 opacity-60" aria-hidden="true" />
            </Link>
          </nav>
        </div>

        <div className="dock-safe shrink-0 border-t border-line bg-[#f8fafc] p-4">
          <div className="flex flex-col gap-2.5">
            {isAuthenticated && user ? (
              <>
                <Link
                  to={agentPath}
                  onClick={() => setMenuOpen(false)}
                  className="flex h-11 items-center justify-center rounded-[10px] bg-[var(--water)] px-3 text-center text-[14px] font-bold text-white transition-colors hover:bg-[var(--water-hi)]"
                >
                  Mon poste ({user.nom})
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex h-11 items-center justify-center gap-2 rounded-[10px] border border-line2 bg-surface px-3 text-[14px] font-bold text-ink transition-colors hover:bg-[var(--s2)]"
                >
                  <LogOut size={16} aria-hidden="true" />
                  <span>Se déconnecter</span>
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/signaler"
                  onClick={() => setMenuOpen(false)}
                  className="flex h-11 items-center justify-center rounded-[10px] bg-[#b3261e] px-3 text-center text-[14px] font-bold text-white transition-colors hover:bg-[#8f1e18]"
                >
                  Signaler un incident
                </Link>
                <Link
                  to={agentPath}
                  onClick={() => setMenuOpen(false)}
                  className="flex h-11 items-center justify-center gap-2 rounded-[10px] border border-line2 bg-surface px-3 text-[14px] font-bold text-ink transition-colors hover:bg-[var(--s2)]"
                >
                  <LogIn size={16} aria-hidden="true" />
                  <span>Espace agent</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
