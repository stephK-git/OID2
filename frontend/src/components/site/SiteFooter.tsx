import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './site.css';

const PLATFORM_LINKS = [
  { label: 'Incidents du jour', to: { pathname: '/', hash: '#aujourdhui' } },
  { label: 'Consulter les incidents', to: '/consulter' },
  { label: 'Que signaler ?', to: { pathname: '/', hash: '#quoi' } },
  { label: 'Comment ça marche', to: { pathname: '/', hash: '#etapes' } },
  { label: 'Consignes de sécurité', to: { pathname: '/', hash: '#securite' } },
];

/** Pages où la barre mobile « Signaler / Urgence » est masquée (le formulaire a son propre bouton). */
const NO_DOCK_PATHS = ['/signaler', '/signalement'];

const YEAR = new Date().getFullYear();

export const SiteFooter: React.FC = () => {
  const { pathname } = useLocation();
  const hasDock = !NO_DOCK_PATHS.includes(pathname);

  return (
    <>
      <footer className={`site-footer${hasDock ? ' has-dock' : ''}`}>
        <div className="site-wrap site-footer-main">
          <div className="site-footer-about">
            <div className="site-footer-title">OID · Observatoire Inondations &amp; Dommages</div>
            <p>
              Outil d&apos;intérêt général développé avec les collectivités locales, les services de
              secours et la protection civile pour faire remonter les données de crues.
            </p>
          </div>

          <nav className="site-footer-col" aria-label="Plateforme">
            <h2>Plateforme</h2>
            {PLATFORM_LINKS.map((link) => (
              <Link key={link.label} to={link.to}>
                {link.label}
              </Link>
            ))}
          </nav>

          <nav className="site-footer-col" aria-label="Accès et urgences">
            <h2>Accès &amp; urgences</h2>
            <Link to="/login">Espace agent</Link>
            <a href="tel:180" className="site-footer-tel">
              180 · Sapeurs-pompiers
            </a>
            <a href="tel:112" className="site-footer-tel">
              112 · Secours &amp; urgences
            </a>
          </nav>
        </div>

        <div className="site-footer-bottom">
          <div className="site-wrap">
            © {YEAR} Observatoire Inondations &amp; Dommages — District Autonome d&apos;Abidjan. Service
            public citoyen.
          </div>
        </div>
      </footer>

      {hasDock && (
        <div className="site-dock">
          <Link to="/signaler" className="site-btn site-btn-primary">
            Signaler un danger
          </Link>
          <a
            href="tel:180"
            className="site-btn site-btn-emergency"
            aria-label="Appeler le 180, sapeurs-pompiers"
          >
            Urgence
          </a>
        </div>
      )}
    </>
  );
};
