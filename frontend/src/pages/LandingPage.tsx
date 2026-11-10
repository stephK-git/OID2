import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../api/client';
import { PublicHeader } from '../components/shell';
import './LandingPage.css';

interface PublicStats {
  signalements_traites: number;
  incidents_actifs: number;
  delai_moyen_min: number;
  communes_raccordees: number;
}

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  // État du formulaire de suivi citoyen
  const [refValue, setRefValue] = useState('');
  const [refError, setRefError] = useState('');
  const refInputRef = useRef<HTMLInputElement>(null);

  // Section active pour la barre de navigation (IntersectionObserver)
  const [activeSection, setActiveSection] = useState<string>('');

  // Zoom interactif sur la carte de situation en direct
  const [mapZoom, setMapZoom] = useState<number>(1);

  // Statistiques publiques dynamiques (avec valeurs de référence par défaut)
  const [stats, setStats] = useState<PublicStats>({
    signalements_traites: 142,
    incidents_actifs: 12,
    delai_moyen_min: 14,
    communes_raccordees: 86,
  });

  // Destination du bouton "Espace Agent" selon l'état d'authentification
  const agentPath =
    isAuthenticated && user
      ? user.role === 'coordinateur'
        ? '/coordination'
        : user.role === 'verificateur'
        ? '/verification'
        : '/enquete'
      : '/login';

  // Chargement des statistiques publiques depuis l'API
  useEffect(() => {
    let mounted = true;
    apiFetch<PublicStats>('/signalements/stats-publiques')
      .then((res) => {
        if (mounted && res) {
          setStats({
            signalements_traites: res.signalements_traites || 142,
            incidents_actifs: res.incidents_actifs ?? 12,
            delai_moyen_min: res.delai_moyen_min || 14,
            communes_raccordees: res.communes_raccordees || 86,
          });
        }
      })
      .catch(() => {
        // Conserve les valeurs de référence en mode hors-ligne
      });
    return () => {
      mounted = false;
    };
  }, []);



  // Mise en évidence de la section active au scroll (IntersectionObserver)
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );

    ['situation', 'quoi', 'etapes', 'securite'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });

    return () => io.disconnect();
  }, []);

  // Validation et soumission du formulaire de suivi de dossier
  const handleSuiviSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = refValue.trim().toUpperCase();
    // Accepte le format officiel OID-YYYY-XXXX ainsi que les identifiants hexadécimaux de suivi
    const pattern = /^(OID-\d{4}-[A-Z0-9]{4,}|[A-Z0-9_-]{6,64})$/;

    if (!val) {
      setRefError('Veuillez saisir votre référence de suivi.');
      refInputRef.current?.focus();
      return;
    }
    if (!pattern.test(val)) {
      setRefError('Format invalide. Exemple attendu : OID-2026-X892');
      refInputRef.current?.focus();
      return;
    }

    setRefError('');
    navigate(`/suivi?ref=${encodeURIComponent(val)}`);
  };

  const handleZoomIn = () => setMapZoom((z) => Math.min(1.75, Number((z + 0.25).toFixed(2))));
  const handleZoomOut = () => setMapZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))));

  const currentYear = new Date().getFullYear();

  return (
    <div className="oid-landing-page bg-slate-50 text-slate-900 font-sans antialiased selection:bg-blue-600 selection:text-white pb-24 md:pb-0">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 z-[100] px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-lg"
        href="#contenu"
      >
        Aller au contenu principal
      </a>



      <PublicHeader isLanding activeSection={activeSection} />

      <main id="contenu">
        {/* HERO */}
        <section className="relative bg-gradient-to-b from-slate-900 via-blue-950 to-slate-950 text-white pt-12 pb-36 sm:pt-20 sm:pb-44 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20" aria-hidden="true">
            <svg
              className="absolute -right-40 lg:-right-20 top-1/2 -translate-y-1/2 w-[640px] h-[640px] lg:w-[900px] lg:h-[900px]"
              fill="none"
              viewBox="0 0 800 800"
            >
              <circle
                className="animate-pulse-slow"
                cx="400"
                cy="400"
                r="100"
                stroke="#60a5fa"
                strokeDasharray="8 8"
                strokeWidth="2"
              />
              <circle cx="400" cy="400" r="180" stroke="#3b82f6" strokeWidth="2" />
              <circle cx="400" cy="400" r="260" stroke="#60a5fa" strokeDasharray="12 12" strokeWidth="1.5" />
              <circle cx="400" cy="400" r="340" stroke="#2563eb" strokeWidth="2" />
              <circle cx="400" cy="400" r="420" stroke="#1d4ed8" strokeWidth="1" />
            </svg>
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              {/* Colonne gauche */}
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-400/20 text-blue-200 text-xs font-semibold backdrop-blur-sm">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
                  Plateforme certifiée de surveillance citoyenne
                </div>
                <h1 className="font-display font-extrabold text-[2rem] leading-[1.1] sm:text-5xl lg:text-6xl tracking-tight text-white">
                  Alertez, suivez et protégez face aux{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-300">
                    montées des eaux
                  </span>
                  .
                </h1>
                <p className="text-base sm:text-xl text-slate-300 max-w-2xl leading-relaxed">
                  Signalez un danger sur la voirie ou votre habitation en moins de 2 minutes. Vos signalements
                  alimentent les secours et alertent votre communauté en temps réel.
                </p>

                {/* Une seule action principale, une action secondaire discrète */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                  <Link
                    className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-white text-slate-900 hover:bg-slate-100 font-bold text-base rounded-xl shadow-xl shadow-blue-900/30 transition hover:-translate-y-0.5 active:translate-y-0 group w-full sm:w-auto"
                    to="/signaler"
                  >
                    Signaler une inondation
                    <svg
                      className="w-5 h-5 text-slate-700 group-hover:translate-x-1 transition-transform"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="M14 5l7 7m0 0l-7 7m7-7H3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                      />
                    </svg>
                  </Link>
                  <a
                    className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-blue-200 hover:text-white underline underline-offset-4 decoration-blue-400/50 hover:decoration-white py-2 transition"
                    href="#situation"
                  >
                    Voir la carte interactive
                    <span aria-hidden="true">→</span>
                  </a>
                </div>

                <ul className="pt-2 grid grid-cols-1 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap gap-y-2 gap-x-6 text-[13px] sm:text-sm text-slate-300 font-medium">
                  <li className="inline-flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-emerald-400 shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path
                        clipRule="evenodd"
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      />
                    </svg>
                    Sans création de compte
                  </li>
                  <li className="inline-flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-emerald-400 shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path
                        clipRule="evenodd"
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      />
                    </svg>
                    Signalement en ~2 minutes
                  </li>
                  <li className="inline-flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-emerald-400 shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path
                        clipRule="evenodd"
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      />
                    </svg>
                    Anonymat garanti
                  </li>
                </ul>
              </div>

              {/* Colonne droite : choix rapide du type d'incident (desktop) */}
              <div className="hidden lg:block lg:col-span-5">
                <div className="rounded-3xl bg-white/[0.06] border border-white/10 backdrop-blur-md p-6 shadow-2xl shadow-black/20">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-300 mb-1">
                    Signalement rapide
                  </p>
                  <h2 className="font-display font-bold text-xl text-white mb-4">
                    Que se passe-t-il près de vous ?
                  </h2>
                  <div className="grid gap-2.5">
                    <Link
                      to="/signaler?type=ruissellement"
                      className="flex items-center gap-4 p-3.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 transition group"
                    >
                      <span className="w-11 h-11 rounded-xl bg-blue-500/20 text-blue-300 flex items-center justify-center shrink-0">
                        <svg
                          className="w-6 h-6 fill-none stroke-current stroke-2"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            d="M3 17l3-12h12l3 12M12 5v3m0 4v2m0 3v2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span className="flex-1">
                        <span className="block font-semibold text-white text-sm">Route submergée</span>
                        <span className="block text-xs text-slate-400">
                          Voie impraticable, eau sur la chaussée
                        </span>
                      </span>
                      <span
                        className="text-slate-400 group-hover:translate-x-1 transition-transform"
                        aria-hidden="true"
                      >
                        →
                      </span>
                    </Link>

                    <Link
                      to="/signaler?type=nappe"
                      className="flex items-center gap-4 p-3.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 transition group"
                    >
                      <span className="w-11 h-11 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
                        <svg
                          className="w-6 h-6 fill-none stroke-current stroke-2"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span className="flex-1">
                        <span className="block font-semibold text-white text-sm">
                          Habitation ou local inondé
                        </span>
                        <span className="block text-xs text-slate-400">
                          Cave, rez-de-chaussée, commerce
                        </span>
                      </span>
                      <span
                        className="text-slate-400 group-hover:translate-x-1 transition-transform"
                        aria-hidden="true"
                      >
                        →
                      </span>
                    </Link>

                    <Link
                      to="/signaler?type=cours-d-eau"
                      className="flex items-center gap-4 p-3.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 transition group"
                    >
                      <span className="w-11 h-11 rounded-xl bg-sky-500/20 text-sky-300 flex items-center justify-center shrink-0">
                        <svg
                          className="w-6 h-6 fill-none stroke-current stroke-2"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            d="M3 15c2.5-2 4.5-2 7 0s4.5 2 7 0 3-1.5 4-1M3 9c2.5-2 4.5-2 7 0s4.5 2 7 0 3-1.5 4-1"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span className="flex-1">
                        <span className="block font-semibold text-white text-sm">
                          Digue, égout ou cours d&apos;eau en crue
                        </span>
                        <span className="block text-xs text-slate-400">
                          Ouvrage fissuré, refoulement, débordement
                        </span>
                      </span>
                      <span
                        className="text-slate-400 group-hover:translate-x-1 transition-transform"
                        aria-hidden="true"
                      >
                        →
                      </span>
                    </Link>

                    <a
                      href="tel:18"
                      className="flex items-center gap-4 p-3.5 rounded-2xl bg-red-600/90 hover:bg-red-600 border border-red-400/30 transition group"
                    >
                      <span className="w-11 h-11 rounded-xl bg-white/20 text-white flex items-center justify-center shrink-0">
                        <svg
                          className="w-6 h-6 fill-none stroke-current stroke-2"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span className="flex-1">
                        <span className="block font-semibold text-white text-sm">
                          Une personne est en danger
                        </span>
                        <span className="block text-xs text-red-100">Appelez directement le 18</span>
                      </span>
                      <span
                        className="text-red-100 group-hover:translate-x-1 transition-transform"
                        aria-hidden="true"
                      >
                        →
                      </span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Suivi de dossier (chevauche le hero, marge de sécurité en dessous) */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 -mt-24 sm:-mt-28 relative z-30" id="suivi">
          <div className="bg-white rounded-3xl p-5 sm:p-10 shadow-2xl shadow-slate-900/10 border border-slate-200/90">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-8 items-center">
              <div className="md:col-span-5 space-y-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      clipRule="evenodd"
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                    />
                  </svg>
                  Espace citoyen
                </div>
                <h2 className="font-display font-bold text-xl sm:text-2xl text-slate-900">
                  Suivre votre signalement
                </h2>
                <p className="text-sm text-slate-500">
                  Saisissez la référence reçue lors de votre dépôt pour suivre l&apos;intervention des équipes.
                </p>
              </div>
              <div className="md:col-span-7">
                <form className="space-y-2" id="suivi-form" onSubmit={handleSuiviSubmit} noValidate>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider" htmlFor="ref">
                    Référence unique
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                          />
                        </svg>
                      </div>
                      <input
                        ref={refInputRef}
                        autoCapitalize="characters"
                        autoComplete="off"
                        aria-describedby="ref-err"
                        value={refValue}
                        onChange={(e) => {
                          setRefValue(e.target.value);
                          if (refError) setRefError('');
                        }}
                        className="w-full pl-11 pr-4 py-3.5 rounded-xl border-2 border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 font-mono font-bold text-slate-800 uppercase tracking-wide text-base outline-none transition"
                        id="ref"
                        name="reference_suivi"
                        placeholder="Ex : OID-2026-X892"
                        spellCheck={false}
                        type="text"
                      />
                    </div>
                    <button
                      className="px-7 py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-500/25 transition"
                      type="submit"
                    >
                      Consulter
                    </button>
                  </div>
                  <p
                    className="text-xs text-red-600 font-medium min-h-[1.25rem] mt-1"
                    id="ref-err"
                    role="alert"
                    aria-live="polite"
                  >
                    {refError}
                  </p>
                </form>
              </div>
            </div>
          </div>
        </div>

        {/* Situation en direct */}
        <section className="py-16 sm:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" id="situation">
          <div className="mb-8 sm:mb-12 space-y-3 max-w-2xl">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-3 py-1 rounded-md">
              Cartographie collaborative
            </span>
            <h2 className="font-display font-extrabold text-[1.65rem] sm:text-4xl text-slate-900 tracking-tight">
              Situation hydrologique en direct
            </h2>
            <p className="text-slate-600 text-[15px] sm:text-base">
              Consultez en temps réel les signalements confirmés par les autorités locales et les usagers pour
              anticiper vos déplacements.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
            {/* Carte */}
            <div className="lg:col-span-8 bg-slate-900 rounded-3xl overflow-hidden shadow-xl border border-slate-800">
              <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] bg-[#0c1834] overflow-hidden">
                <svg
                  className="w-full h-full select-none transition-transform duration-300"
                  style={{ transform: `scale(${mapZoom})`, transformOrigin: 'center center' }}
                  viewBox="0 0 800 500"
                  preserveAspectRatio="xMidYMid slice"
                  role="img"
                  aria-label="Carte schématique : une zone inondée critique, un secteur sous vigilance et une route coupée"
                >
                  <defs>
                    <pattern height="40" id="grid" patternUnits="userSpaceOnUse" width="40">
                      <path
                        d="M 40 0 L 0 0 0 40"
                        fill="none"
                        stroke="rgba(255,255,255,0.05)"
                        strokeWidth="1"
                      />
                    </pattern>
                    <linearGradient id="waterFlow" x1="0%" x2="100%" y1="0%" y2="100%">
                      <stop offset="0%" stopColor="#1e3a8a" />
                      <stop offset="50%" stopColor="#2563eb" />
                      <stop offset="100%" stopColor="#1d4ed8" />
                    </linearGradient>
                  </defs>
                  <rect fill="#081026" height="500" width="800" />
                  <rect fill="url(#grid)" height="500" width="800" />
                  <path
                    d="M -20 280 Q 200 240, 360 320 T 700 260 T 840 280 L 840 370 Q 700 340, 520 400 T 160 360 T -20 370 Z"
                    fill="url(#waterFlow)"
                    opacity="0.45"
                  />
                  <path
                    d="M -20 280 Q 200 240, 360 320 T 700 260 T 840 280"
                    fill="none"
                    opacity="0.6"
                    stroke="#60a5fa"
                    strokeWidth="3"
                  />
                  <g fill="none" stroke="rgba(255,255,255,0.18)" strokeLinecap="round" strokeWidth="4">
                    <path d="M 120 0 L 170 500" />
                    <path d="M 0 150 L 800 120" />
                    <path d="M 520 0 L 560 500" />
                    <path d="M 0 410 Q 400 370, 800 440" />
                  </g>
                  <g transform="translate(280, 310)">
                    <circle className="animate-pulse-slow" r="32" fill="#ef4444" fillOpacity="0.25" />
                    <circle r="14" fill="#ef4444" fillOpacity="0.6" />
                    <circle r="7" fill="#fff" />
                  </g>
                  <g transform="translate(620, 275)">
                    <circle className="animate-pulse-slow" r="26" fill="#f97316" fillOpacity="0.3" />
                    <circle r="11" fill="#f97316" fillOpacity="0.7" />
                    <circle r="6" fill="#fff" />
                  </g>
                  <g transform="translate(145, 145)">
                    <rect
                      fill="#fff"
                      height="8"
                      rx="3"
                      stroke="#ef4444"
                      strokeWidth="2.5"
                      transform="rotate(-15)"
                      width="28"
                      x="-14"
                      y="-4"
                    />
                    <line
                      stroke="#ef4444"
                      strokeWidth="3"
                      transform="rotate(-15)"
                      x1="-10"
                      x2="10"
                      y1="0"
                      y2="0"
                    />
                  </g>
                </svg>

                {/* Légende flottante : tablette / desktop */}
                <div className="hidden sm:block absolute top-4 left-4 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl p-4 text-xs space-y-2.5 shadow-xl text-white">
                  <span className="font-bold text-[11px] uppercase tracking-wider text-slate-300 block mb-1">
                    Repères cartographiques
                  </span>
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full bg-red-500"></span>
                    <span>Zone inondée critique</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                    <span>Secteur sous vigilance / ralenti</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-4 h-1.5 rounded-full bg-white border border-red-500"></span>
                    <span>Route coupée à la circulation</span>
                  </div>
                </div>

                <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    aria-label="Zoom avant"
                    className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white font-bold text-lg flex items-center justify-center border border-slate-700 shadow-lg"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    aria-label="Zoom arrière"
                    className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white font-bold text-lg flex items-center justify-center border border-slate-700 shadow-lg"
                  >
                    −
                  </button>
                </div>
              </div>

              {/* Légende mobile (sous la carte, ne masque pas la carte) */}
              <div className="sm:hidden px-4 py-3 bg-slate-900 border-t border-slate-800 grid gap-2 text-xs text-slate-200">
                <div className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full bg-red-500 shrink-0"></span>Zone inondée critique
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full bg-orange-500 shrink-0"></span>Secteur sous vigilance /
                  ralenti
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-4 h-1.5 rounded-full bg-white border border-red-500 shrink-0"></span>Route
                  coupée à la circulation
                </div>
              </div>

              <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-300 gap-2 sm:gap-4">
                <span className="flex items-start gap-2">
                  <svg
                    className="w-4 h-4 text-blue-400 shrink-0 mt-px"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                  Données croisées : Météo-France, Vigicrues et rapports usagers validés.
                </span>
                <a className="text-blue-300 hover:text-blue-200 font-semibold shrink-0" href="#etapes">
                  Comment valider un point ? →
                </a>
              </div>
            </div>

            {/* Statistiques : 3 colonnes compactes sur mobile, pile sur desktop */}
            <div className="lg:col-span-4 grid grid-cols-3 lg:grid-cols-1 gap-3 lg:gap-4">
              <div className="p-3.5 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-1.5 lg:mb-2">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 leading-tight">
                    Activité du jour
                  </span>
                  <span className="hidden lg:inline-flex p-2 rounded-xl bg-blue-50 text-blue-600">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      />
                    </svg>
                  </span>
                </div>
                <div
                  className="font-display font-extrabold text-2xl sm:text-3xl lg:text-4xl text-slate-900 tracking-tight"
                  id="stat-traites"
                >
                  {stats.signalements_traites}
                </div>
                <p className="text-[11px] sm:text-sm text-slate-500 mt-1 leading-snug">
                  Signalements traités &amp; coordonnés
                </p>
              </div>
              <div className="p-3.5 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-1.5 lg:mb-2">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 leading-tight">
                    Réactivité moyenne
                  </span>
                  <span className="hidden lg:inline-flex p-2 rounded-xl bg-emerald-50 text-emerald-600">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      />
                    </svg>
                  </span>
                </div>
                <div
                  className="font-display font-extrabold text-2xl sm:text-3xl lg:text-4xl text-emerald-600 tracking-tight"
                  id="stat-delai"
                >
                  {stats.delai_moyen_min} min
                </div>
                <p className="text-[11px] sm:text-sm text-slate-500 mt-1 leading-snug">
                  Délai d&apos;évaluation par les services locaux
                </p>
              </div>
              <div className="p-3.5 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-1.5 lg:mb-2">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 leading-tight">
                    Périmètre d&apos;action
                  </span>
                  <span className="hidden lg:inline-flex p-2 rounded-xl bg-purple-50 text-purple-600">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      />
                    </svg>
                  </span>
                </div>
                <div
                  className="font-display font-extrabold text-2xl sm:text-3xl lg:text-4xl text-slate-900 tracking-tight"
                  id="stat-communes"
                >
                  {stats.communes_raccordees}
                </div>
                <p className="text-[11px] sm:text-sm text-slate-500 mt-1 leading-snug">
                  Communes raccordées au dispositif OID
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Que signaler */}
        <section className="py-16 sm:py-20 bg-slate-100 border-y border-slate-200/80" id="quoi">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mb-8 sm:mb-10 space-y-3">
              <span className="inline-block text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-3 py-1 rounded-md">
                Typologie d&apos;incidents
              </span>
              <h2 className="font-display font-extrabold text-[1.65rem] sm:text-4xl text-slate-900 tracking-tight">
                Que pouvez-vous signaler ?
              </h2>
              <p className="text-slate-600 text-[15px] sm:text-base">
                Nos équipes et partenaires municipaux interviennent sur 4 grandes situations critiques sur le
                terrain.
              </p>
            </div>

            {/* Hors périmètre : mis en évidence AVANT les cartes pour éviter les signalements inutiles */}
            <div className="mb-8 p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
              <span className="flex items-center gap-2.5 font-bold text-amber-900 text-sm shrink-0">
                <span className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      clipRule="evenodd"
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    />
                  </svg>
                </span>
                Ne relève pas de cette plateforme :
              </span>
              <ul className="flex flex-wrap gap-2 text-sm text-amber-900">
                <li className="px-3 py-1.5 bg-white border border-amber-200 rounded-full">
                  Coupure privée d&apos;eau courante
                </li>
                <li className="px-3 py-1.5 bg-white border border-amber-200 rounded-full">
                  Demandes d&apos;indemnisation d&apos;assurance
                </li>
                <li className="px-3 py-1.5 bg-white border border-amber-200 rounded-full">
                  Problèmes de voirie sans lien avec la crue
                </li>
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
              {/* 1 : Danger immédiat */}
              <div className="md:col-span-1 rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-red-600 via-rose-600 to-red-700 text-white shadow-xl shadow-red-600/20 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                    <svg
                      className="w-7 h-7 stroke-current fill-none stroke-2"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <h3 className="font-display font-bold text-xl sm:text-2xl tracking-tight">
                    Danger immédiat pour les personnes
                  </h3>
                  <p className="text-red-100 text-sm leading-relaxed">
                    Personne isolée, risque de choc électrique, affaissement de sol ou bâtiment menaçant de
                    s&apos;effondrer.
                  </p>
                </div>
                <div className="mt-6 pt-5 border-t border-white/20 space-y-2">
                  <span className="text-xs uppercase tracking-wider font-bold text-red-100 block">
                    Contactez immédiatement :
                  </span>
                  <div className="flex gap-2">
                    <a
                      className="flex-1 py-3 px-3 rounded-xl bg-white text-red-700 font-bold text-center text-sm shadow hover:bg-red-50 transition"
                      href="tel:18"
                    >
                      18 Pompiers
                    </a>
                    <a
                      className="flex-1 py-3 px-3 rounded-xl bg-red-950/60 text-white font-bold text-center text-sm hover:bg-red-950 transition border border-white/20"
                      href="tel:112"
                    >
                      112 Urgence
                    </a>
                  </div>
                </div>
              </div>

              {/* 2 : Voirie */}
              <Link
                to="/signaler?type=ruissellement"
                className="group rounded-3xl p-6 sm:p-8 bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm aspect-[16/10] bg-slate-100">
                    <img
                      alt="Illustration voirie submergée et balisage de sécurité"
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuARPshJDsbAgzyeayQD8KlnhL-swsUg0bK9jOYwEXxibzdV3xLQi9dRSSoNgbXxdASkYSVzALqKwWJgldbrF8LeiJh7VsCCuTwmlDgLZ2Z9HMGIWTQUYp1SfDjuW86pIpmam3u--8l-K3LDd-H9cRtJSsUmJ51Omyb88SHoMEdfOOqLvITmPYausuKp5XsXfKVvchnLTG-HyF4PnQwKcfAL1NvO0hKsPit2pLkECwE"
                    />
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <svg
                      className="w-6 h-6 stroke-current fill-none stroke-2"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <h3 className="font-display font-bold text-xl text-slate-900">
                    Chaussée ou route submergée
                  </h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Voie impraticable, eau stagnant sur la voirie, pont sous surveillance ou circulation
                    automobile devenue risquée.
                  </p>
                </div>
                <div className="mt-5 pt-4 border-t border-slate-100 text-xs font-semibold text-blue-700">
                  Baliser &amp; prévenir les usagers →
                </div>
              </Link>

              {/* 3 : Habitation */}
              <Link
                to="/signaler?type=nappe"
                className="group rounded-3xl p-6 sm:p-8 bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm aspect-[16/10] bg-slate-100">
                    <img
                      alt="Illustration habitation inondée avec motopompe et sacs de protection"
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuDQnkveQFSybSoUwEtdGQuG4oGgddX2k3-8l8uWbyfdDTRQ4Gmo9pFhByfSgW-nuNBPLOctJipQ8ANC7vstZK49iT_yDGROQ0_A69-WNrFe0bWhNmT87z6doaUzafjC55tQigvfmY48_Kz_dAJtnRFxk6zspoK1tileUIygxtk-BLwJQw-6ym_sKOOxZyD6QiZtpznwkZa-qJQHtbZudzpkeKCU0va6NQb8pwOtb80"
                    />
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <svg
                      className="w-6 h-6 stroke-current fill-none stroke-2"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <h3 className="font-display font-bold text-xl text-slate-900">
                    Habitation ou local inondé
                  </h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Cave, rez-de-chaussée ou commerce envahi par les eaux suite à un ruissellement ou une
                    remontée de nappe phréatique.
                  </p>
                </div>
                <div className="mt-5 pt-4 border-t border-slate-100 text-xs font-semibold text-indigo-700">
                  Assistance municipale au pompage →
                </div>
              </Link>

              {/* 4 : Ouvrages */}
              <div className="group md:col-span-3 rounded-3xl p-6 sm:p-8 bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition flex flex-col md:flex-row items-stretch md:items-center justify-between gap-5 md:gap-6">
                <div className="w-full md:w-56 h-40 md:h-36 rounded-2xl overflow-hidden border border-slate-200 shadow-sm shrink-0 bg-slate-100">
                  <img
                    alt="Illustration surveillance des digues et capteurs de niveau d'eau"
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBPJExPV6Av_G15jmyO4ZRZQUSnrqTIwJ2vFtDniK3jei8r9OdcF3NQPmjS-IAYgmdd-vWHtdNziCSVEhSExocRqmRFt9_ZXyQy5noCmYnn54Vh2OH3vSu10bvwhlUl_J4SQf_RJ4UdDVyxODJZyZ6evoUHExgjFzEHarr6hWPlz8T7ypGwwhf1891Rg9uRQWZu42U_Amy4cLX4ZaC3hpbu6OqkpinXszdaJ1EVJQg"
                  />
                </div>
                <div className="flex items-start gap-4 sm:gap-5 flex-1">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                    <svg
                      className="w-6 h-6 sm:w-7 sm:h-7 stroke-current fill-none stroke-2"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-display font-bold text-xl text-slate-900">
                      Réseau d&apos;assainissement, digue ou cours d&apos;eau en crue
                    </h3>
                    <p className="text-slate-600 text-sm leading-relaxed max-w-3xl">
                      Bouche d&apos;égout refoulant de l&apos;eau usée, fissure visible sur un ouvrage de
                      rétention ou cours d&apos;eau quittant son lit naturel.
                    </p>
                  </div>
                </div>
                <Link
                  className="shrink-0 text-center px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm rounded-xl transition"
                  to="/signaler?type=refoulement"
                >
                  Signaler un ouvrage
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Étapes */}
        <section className="py-16 sm:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" id="etapes">
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-16 space-y-3">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-3 py-1 rounded-md">
              Démarche simplifiée
            </span>
            <h2 className="font-display font-extrabold text-[1.65rem] sm:text-4xl text-slate-900 tracking-tight">
              Comment fonctionne le signalement ?
            </h2>
            <p className="text-slate-600 text-[15px] sm:text-base">
              Un processus intuitif conçu pour être manipulé facilement depuis un smartphone, même en situation
              de stress.
            </p>
          </div>

          <ol className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-8 relative">
            {/* Trait de liaison desktop */}
            <div
              className="hidden md:block absolute top-14 left-[16%] right-[16%] h-px border-t-2 border-dashed border-blue-200"
              aria-hidden="true"
            ></div>

            <li className="relative p-6 sm:p-8 rounded-3xl bg-white border border-slate-200/80 shadow-sm hover:shadow-lg transition flex md:block gap-4">
              <div className="relative w-12 h-12 shrink-0 rounded-2xl bg-blue-600 text-white font-display font-bold text-xl flex items-center justify-center shadow-lg shadow-blue-500/30 md:mb-6">
                1
              </div>
              <div>
                <h3 className="font-display font-bold text-lg sm:text-xl text-slate-900 mb-2">
                  Localisation assistée
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Votre géolocalisation GPS est automatiquement détectée. Vous pouvez ajuster le marqueur
                  directement sur la carte pour une précision métrique.
                </p>
              </div>
            </li>
            <li className="relative p-6 sm:p-8 rounded-3xl bg-white border border-slate-200/80 shadow-sm hover:shadow-lg transition flex md:block gap-4">
              <div className="relative w-12 h-12 shrink-0 rounded-2xl bg-blue-600 text-white font-display font-bold text-xl flex items-center justify-center shadow-lg shadow-blue-500/30 md:mb-6">
                2
              </div>
              <div>
                <h3 className="font-display font-bold text-lg sm:text-xl text-slate-900 mb-2">
                  Constat &amp; Photos
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Évaluez la hauteur d&apos;eau (cheville, genou, carrosserie), téléversez 1 à 3 photos et
                  indiquez si des personnes vulnérables sont à proximité.
                </p>
              </div>
            </li>
            <li className="relative p-6 sm:p-8 rounded-3xl bg-white border border-slate-200/80 shadow-sm hover:shadow-lg transition flex md:block gap-4">
              <div className="relative w-12 h-12 shrink-0 rounded-2xl bg-blue-600 text-white font-display font-bold text-xl flex items-center justify-center shadow-lg shadow-blue-500/30 md:mb-6">
                3
              </div>
              <div>
                <h3 className="font-display font-bold text-lg sm:text-xl text-slate-900 mb-2">
                  Prise en charge &amp; Suivi
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  L&apos;alerte est transmise aux agents municipaux et secours. Vous recevez un code unique{' '}
                  <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-blue-700 font-mono">
                    OID-2026-XXXX
                  </code>{' '}
                  pour suivre les opérations.
                </p>
              </div>
            </li>
          </ol>

          <div className="mt-10 sm:mt-14 text-center">
            <Link
              className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-base rounded-xl shadow-xl shadow-blue-600/30 transition hover:-translate-y-0.5 w-full sm:w-auto"
              to="/signaler"
            >
              Commencer un signalement
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </Link>
          </div>
        </section>

        {/* Sécurité */}
        <section
          className="py-16 sm:py-24 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white relative overflow-hidden"
          id="securite"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="p-6 sm:p-12 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl mb-12 sm:mb-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-6 space-y-4">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Règle vitale de sécurité routière
                </span>
                <h2 className="font-display font-extrabold text-[1.65rem] sm:text-4xl text-white tracking-tight leading-tight">
                  <span className="text-amber-400">30 centimètres d&apos;eau</span> suffisent pour emporter une
                  voiture.
                </h2>
                <p className="text-slate-300 text-[15px] sm:text-base leading-relaxed">
                  Ne vous engagez <strong>jamais</strong> sur une route submergée, même au volant d&apos;un SUV ou
                  4x4. La poussée d&apos;Archimède décolle les roues et le courant prend le contrôle. Faites
                  systématiquement demi-tour.
                </p>
              </div>
              <div className="lg:col-span-6 bg-slate-950/80 rounded-2xl p-4 sm:p-6 border border-slate-800 overflow-hidden">
                <svg
                  aria-label="Schéma illustrant le danger d'une nappe d'eau de 30 centimètres sur un véhicule"
                  className="w-full h-auto select-none"
                  role="img"
                  viewBox="0 0 540 220"
                >
                  <defs>
                    <linearGradient id="waterGrad" x1="0%" x2="0%" y1="0%" y2="100%">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#0284c7" stopOpacity="0.95" />
                    </linearGradient>
                  </defs>
                  <rect fill="#0f172a" height="40" width="540" y="180" />
                  <line stroke="#334155" strokeWidth="2" x1="0" x2="540" y1="180" y2="180" />
                  <g fill="#1e293b" stroke="#cbd5e1" strokeLinejoin="round" strokeWidth="2.5">
                    <path d="M 120 110 L 160 65 L 320 65 L 380 110 Z" />
                    <rect height="55" rx="14" width="370" x="60" y="105" />
                    <circle cx="130" cy="155" fill="#0f172a" r="28" stroke="#94a3b8" strokeWidth="3" />
                    <circle cx="360" cy="155" fill="#0f172a" r="28" stroke="#94a3b8" strokeWidth="3" />
                  </g>
                  <path
                    className="animate-wave"
                    d="M 0 150 Q 75 142, 150 150 T 300 150 T 450 150 T 540 150 T 690 150 T 840 150 T 990 150 T 1080 150 L 1080 180 L 0 180 Z"
                    fill="url(#waterGrad)"
                  />
                  <g stroke="#f59e0b" strokeWidth="2.5">
                    <line x1="500" x2="500" y1="150" y2="180" />
                    <line x1="492" x2="508" y1="150" y2="150" />
                    <line x1="492" x2="508" y1="180" y2="180" />
                  </g>
                  <text
                    fill="#fbbf24"
                    fontFamily="'Plus Jakarta Sans', sans-serif"
                    fontSize="20"
                    fontWeight="700"
                    textAnchor="middle"
                    x="500"
                    y="138"
                  >
                    30 cm
                  </text>
                </svg>
              </div>
            </div>

            <div className="mb-8 sm:mb-10">
              <h3 className="font-display font-bold text-xl sm:text-2xl text-white mb-2">
                Les gestes réflexes indispensables
              </h3>
              <p className="text-slate-300 text-sm">
                Adoptez les bons comportements dès les premiers signaux de crue.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-12 sm:mb-16">
              <div className="p-5 sm:p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex md:block gap-4">
                <div className="w-10 h-10 shrink-0 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold md:mb-3">
                  1
                </div>
                <div>
                  <h4 className="font-display font-bold text-lg text-white mb-1">
                    Coupez gaz et électricité
                  </h4>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Dès que l&apos;eau menace de pénétrer dans votre logement, désactivez le disjoncteur général
                    et fermez l&apos;arrivée de gaz.
                  </p>
                </div>
              </div>
              <div className="p-5 sm:p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex md:block gap-4">
                <div className="w-10 h-10 shrink-0 rounded-xl bg-blue-500/20 text-blue-300 flex items-center justify-center font-bold md:mb-3">
                  2
                </div>
                <div>
                  <h4 className="font-display font-bold text-lg text-white mb-1">Réfugiez-vous à l&apos;étage</h4>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Montez le plus haut possible avec vos papiers d&apos;identité et un kit d&apos;urgence. Ne
                    descendez jamais dans les sous-sols.
                  </p>
                </div>
              </div>
              <div className="p-5 sm:p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex md:block gap-4">
                <div className="w-10 h-10 shrink-0 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold md:mb-3">
                  3
                </div>
                <div>
                  <h4 className="font-display font-bold text-lg text-white mb-1">Écoutez les consignes</h4>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Suivez les informations des radios locales et des autorités. Ne téléphonez qu&apos;en cas
                    d&apos;urgence absolue pour libérer les lignes.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-10 sm:pt-12">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-300 block mb-5">
                Numéros d&apos;urgence nationaux &amp; d&apos;assistance
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
                <a
                  className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex flex-col items-center justify-center text-center transition group"
                  href="tel:18"
                >
                  <span className="font-display font-extrabold text-3xl text-red-400 group-hover:scale-110 transition-transform">
                    18
                  </span>
                  <span className="text-xs font-semibold text-slate-200 mt-1">Sapeurs-Pompiers</span>
                </a>
                <a
                  className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex flex-col items-center justify-center text-center transition group"
                  href="tel:15"
                >
                  <span className="font-display font-extrabold text-3xl text-blue-400 group-hover:scale-110 transition-transform">
                    15
                  </span>
                  <span className="text-xs font-semibold text-slate-200 mt-1">SAMU / Médical</span>
                </a>
                <a
                  className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex flex-col items-center justify-center text-center transition group"
                  href="tel:17"
                >
                  <span className="font-display font-extrabold text-3xl text-sky-400 group-hover:scale-110 transition-transform">
                    17
                  </span>
                  <span className="text-xs font-semibold text-slate-200 mt-1">Police / Gendarmerie</span>
                </a>
                <a
                  className="p-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex flex-col items-center justify-center text-center transition group"
                  href="tel:112"
                >
                  <span className="font-display font-extrabold text-3xl text-indigo-400 group-hover:scale-110 transition-transform">
                    112
                  </span>
                  <span className="text-xs font-semibold text-slate-200 mt-1">Urgences Europe</span>
                </a>
                <a
                  className="col-span-2 sm:col-span-1 p-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex flex-col items-center justify-center text-center transition group"
                  href="sms:114"
                >
                  <span className="font-display font-extrabold text-3xl text-emerald-400 group-hover:scale-110 transition-transform">
                    114
                  </span>
                  <span className="text-xs font-semibold text-slate-200 mt-1">SMS Malentendants</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Pied de page enrichi */}
      <footer className="bg-slate-900 text-slate-300 border-t border-slate-800 text-sm pb-24 md:pb-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="grid grid-cols-2 md:grid-cols-12 gap-10">
            <div className="col-span-2 md:col-span-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                  OID
                </div>
                <span className="font-display font-bold text-base sm:text-lg text-white leading-tight">
                  Observatoire Inondations &amp; Dommages
                </span>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed max-w-md">
                Outil d&apos;intérêt général développé en concertation avec les collectivités locales, les
                services d&apos;incendie et de secours, et la protection civile pour fluidifier la remontée des
                données de crues.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-200 text-[11px] font-medium border border-slate-700">
                  Collectivités territoriales
                </span>
                <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-200 text-[11px] font-medium border border-slate-700">
                  Protection Civile
                </span>
                <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-200 text-[11px] font-medium border border-slate-700">
                  SDIS
                </span>
              </div>
            </div>

            <nav className="md:col-span-3 md:col-start-7" aria-label="Plateforme">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white mb-4">Plateforme</h3>
              <ul className="space-y-2.5">
                <li>
                  <a className="hover:text-white transition" href="#situation">
                    Carte en direct
                  </a>
                </li>
                <li>
                  <a className="hover:text-white transition" href="#quoi">
                    Que signaler ?
                  </a>
                </li>
                <li>
                  <a className="hover:text-white transition" href="#etapes">
                    Fonctionnement
                  </a>
                </li>
                <li>
                  <a className="hover:text-white transition" href="#securite">
                    Consignes de sécurité
                  </a>
                </li>
                <li>
                  <a className="hover:text-white transition" href="#suivi">
                    Suivre un dossier
                  </a>
                </li>
              </ul>
            </nav>

            <nav className="md:col-span-3" aria-label="Informations légales">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white mb-4">Informations</h3>
              <ul className="space-y-2.5">
                <li>
                  <a className="hover:text-white transition" href="#securite">
                    Mentions légales
                  </a>
                </li>
                <li>
                  <a className="hover:text-white transition" href="#securite">
                    Politique de confidentialité
                  </a>
                </li>
                <li>
                  <a className="hover:text-white transition" href="#contenu">
                    Accessibilité
                  </a>
                </li>
                <li>
                  <a className="hover:text-white transition" href="#suivi">
                    Nous contacter
                  </a>
                </li>
                <li>
                  <Link className="hover:text-white transition" to={agentPath}>
                    Espace Agent
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-400">
            <p>
              © <span id="current-year">{currentYear}</span> Observatoire Inondations &amp; Dommages. Service
              public citoyen.
            </p>
            <p className="text-slate-200 font-medium">
              Pour toute urgence vitale, contactez en priorité le 18 ou le 112.
            </p>
          </div>
        </div>
      </footer>

      {/* Barre d'action rapide mobile */}
      <div className="fixed bottom-0 inset-x-0 z-50 px-3 pt-3 dock-safe bg-white/95 backdrop-blur-lg border-t border-slate-200 md:hidden flex items-center gap-3">
        <Link
          className="flex-1 py-3.5 px-4 bg-blue-600 active:bg-blue-700 text-white font-bold text-sm rounded-xl text-center shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
          to="/signaler"
        >
          <svg
            className="w-4 h-4 fill-none stroke-current stroke-2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Signaler un danger
        </Link>
        <a
          className="py-3.5 px-5 bg-red-600 active:bg-red-700 text-white font-bold text-sm rounded-xl text-center flex items-center justify-center gap-1.5 shrink-0"
          href="tel:18"
          aria-label="Appeler le 18, sapeurs-pompiers"
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z" />
          </svg>
          18
        </a>
      </div>
    </div>
  );
};

