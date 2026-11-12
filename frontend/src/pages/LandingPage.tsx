import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, MapPin, Plus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch, apiUrl } from '../api/client';
import { PublicHeader } from '../components/shell';
import { PublicIncidentCard, type PublicIncident } from '../components/PublicIncidentCard';
import './LandingPage.css';

interface CommuneOption {
  id: number;
  nom: string;
  code_adm: string | null;
  incidents_jour: number;
}

interface LightboxState {
  photos: string[];
  index: number;
  title: string;
}

export const LandingPage: React.FC = () => {
  const { user, isAuthenticated } = useAuth();

  // Section active pour la barre de navigation (IntersectionObserver)
  const [activeSection, setActiveSection] = useState<string>('');

  // 3 derniers incidents actifs remontés sur la plateforme
  const [recentIncidents, setRecentIncidents] = useState<PublicIncident[]>([]);
  const [loadingRecents, setLoadingRecents] = useState<boolean>(true);

  // Zone extensible "Consulter +" -> sélection de commune et incidents du jour
  const [showCommuneExplorer, setShowCommuneExplorer] = useState<boolean>(false);
  const [communes, setCommunes] = useState<CommuneOption[]>([]);
  const [loadingCommunes, setLoadingCommunes] = useState<boolean>(false);
  const [selectedCommune, setSelectedCommune] = useState<CommuneOption | null>(null);
  const [communeIncidents, setCommuneIncidents] = useState<PublicIncident[]>([]);
  const [loadingCommuneIncidents, setLoadingCommuneIncidents] = useState<boolean>(false);

  // Visionneuse photo plein écran
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  // Destination du bouton "Espace Agent" selon l'état d'authentification
  const agentPath =
    isAuthenticated && user
      ? user.role === 'coordinateur'
        ? '/coordination'
        : user.role === 'verificateur'
        ? '/verification'
        : '/enquete'
      : '/login';

  // Chargement des 3 derniers incidents actifs depuis l'API
  useEffect(() => {
    let mounted = true;
    apiFetch<{ items: PublicIncident[]; total: number }>('/signalements/recents?limit=3')
      .then((res) => {
        if (mounted && Array.isArray(res?.items)) {
          setRecentIncidents(res.items);
        }
      })
      .catch(() => {
        // Garde une liste vide en cas d'indisponibilité réseau
      })
      .finally(() => {
        if (mounted) setLoadingRecents(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Fermeture de la visionneuse photo au clavier (Échap / flèches)
  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightbox(null);
      } else if (e.key === 'ArrowRight' && lightbox.photos.length > 1) {
        setLightbox((prev) =>
          prev ? { ...prev, index: (prev.index + 1) % prev.photos.length } : null
        );
      } else if (e.key === 'ArrowLeft' && lightbox.photos.length > 1) {
        setLightbox((prev) =>
          prev
            ? { ...prev, index: (prev.index - 1 + prev.photos.length) % prev.photos.length }
            : null
        );
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightbox]);

  const handleToggleCommuneExplorer = () => {
    const nextOpen = !showCommuneExplorer;
    setShowCommuneExplorer(nextOpen);
    if (nextOpen && communes.length === 0 && !loadingCommunes) {
      setLoadingCommunes(true);
      apiFetch<{ communes: CommuneOption[] }>('/signalements/communes-actives')
        .then((res) => {
          if (Array.isArray(res?.communes)) {
            setCommunes(res.communes);
          }
        })
        .catch(() => {
          setCommunes([]);
        })
        .finally(() => {
          setLoadingCommunes(false);
        });
    }
  };

  const handleSelectCommune = (commune: CommuneOption) => {
    setSelectedCommune(commune);
    setLoadingCommuneIncidents(true);
    apiFetch<{ items: PublicIncident[]; total: number }>(
      `/signalements/recents?zone_id=${commune.id}&today_only=true&limit=30`
    )
      .then((res) => {
        setCommuneIncidents(Array.isArray(res?.items) ? res.items : []);
      })
      .catch(() => {
        setCommuneIncidents([]);
      })
      .finally(() => {
        setLoadingCommuneIncidents(false);
      });
  };

  const handleOpenPhoto = (photos: string[], index: number, title: string) => {
    setLightbox({ photos, index, title });
  };



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

  const currentYear = new Date().getFullYear();

  return (
    <div className="oid-landing-page font-sans antialiased selection:bg-accent selection:text-white pb-24 md:pb-0">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 z-[100] px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-lg"
        href="#contenu"
      >
        Aller au contenu principal
      </a>



      <PublicHeader isLanding activeSection={activeSection} />

      <main id="contenu">
        {/* HERO AVEC FOND PHOTO (ABIDJAN / LAGUNE ÉBRIÉ) */}
        <section className="relative bg-slate-950 text-white pt-12 pb-16 sm:pt-20 sm:pb-24 overflow-hidden">
          {/* Photo d'arrière-plan */}
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <img
              src="/images/hero-abidjan.jpg"
              alt="Vue aérienne d'Abidjan et de la lagune Ébrié"
              className="w-full h-full object-cover object-center scale-105"
            />
            {/* Voiles sombres allégés pour rendre la photo bien plus lumineuse et visible */}
            <div
              className="absolute inset-0 bg-gradient-to-r from-slate-950/82 via-slate-950/50 to-slate-950/20"
              aria-hidden="true"
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/25"
              aria-hidden="true"
            />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              {/* Colonne gauche */}
              <div className="lg:col-span-7 space-y-6">
                <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl xl:text-[64px] leading-[1.08] tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
                  Signalez, alertez et<br />
                  protégez face aux<br />
                  <span className="text-[#58a6ff]">montées des eaux</span>.
                </h1>
                <p className="text-base sm:text-lg text-slate-200 max-w-2xl leading-relaxed drop-shadow-[0_1px_6px_rgba(0,0,0,0.8)]">
                  Signalez un danger sur la voirie ou votre habitation en moins de 2 minutes. Vos signalements
                  alimentent les secours et alertent votre communauté en temps réel.
                </p>

                {/* Boutons d'action */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <Link
                    className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 bg-white text-slate-900 hover:bg-slate-100 font-bold text-sm sm:text-base rounded-xl shadow-lg transition hover:-translate-y-0.5 active:translate-y-0 group w-full sm:w-auto"
                    to="/signaler"
                  >
                    <span>Signaler une inondation</span>
                    <svg
                      className="w-4 h-4 text-slate-900 group-hover:translate-x-1 transition-transform"
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
                    className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 bg-[#182844] hover:bg-[#1e3459] border border-[#243d66] text-white font-semibold text-sm sm:text-base rounded-xl shadow-lg transition hover:-translate-y-0.5 active:translate-y-0 w-full sm:w-auto"
                    href="#situation"
                  >
                    <svg
                      className="w-4 h-4 text-[#4da3ff] shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      />
                    </svg>
                    <span>Consulter les incidents en direct</span>
                  </a>
                </div>

                <ul className="pt-2 flex flex-wrap items-center gap-y-2 gap-x-5 sm:gap-x-6 text-xs sm:text-sm text-slate-300 font-medium">
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
                    <span>Sans création de compte</span>
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
                    <span>Signalement en ~2 minutes</span>
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
                    <span>Anonymat garanti</span>
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

        {/* Situation en direct : 3 derniers incidents actifs + exploration par commune */}
        <section className="py-16 sm:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" id="situation">
          <div className="mb-8 sm:mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2.5 max-w-2xl">
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" aria-hidden="true" />
                Situation terrain en direct
              </span>
              <h2 className="font-display font-extrabold text-[1.65rem] sm:text-4xl text-ink tracking-tight">
                Les 3 derniers incidents actifs
              </h2>
              <p className="text-ink2 text-[15px] sm:text-base">
                Dépliez un incident pour consulter les constatations terrain et agrandir les photos prises sur place.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleToggleCommuneExplorer}
                aria-expanded={showCommuneExplorer}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-line bg-surface hover:bg-surface2 text-ink font-bold text-sm shadow-sm transition"
              >
                <Plus
                  size={16}
                  className={`text-accent transition-transform duration-200 ${showCommuneExplorer ? 'rotate-45' : ''}`}
                  aria-hidden="true"
                />
                <span>{showCommuneExplorer ? 'Masquer les communes' : 'Consulter +'}</span>
              </button>
              <Link
                to="/signaler"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-accent hover:bg-[var(--water-hi)] text-[var(--water-ink)] font-bold text-sm shadow-sm transition"
              >
                <span>Déclarer un incident</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          {loadingRecents ? (
            <div className="space-y-3" aria-label="Chargement des derniers incidents">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="p-5 rounded-2xl bg-surface border border-line animate-pulse space-y-2.5"
                >
                  <div className="h-5 w-1/3 bg-slate-200 rounded" />
                  <div className="h-3.5 w-1/2 bg-slate-200 rounded" />
                </div>
              ))}
            </div>
          ) : recentIncidents.length === 0 ? (
            <div className="p-8 rounded-3xl bg-surface border border-line text-center space-y-2 shadow-sm">
              <p className="text-base font-bold text-ink">Aucun incident actif pour le moment</p>
              <p className="text-sm text-ink2">
                Les incidents validés et en cours de prise en charge apparaîtront ici dès qu&apos;ils sont ouverts.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {recentIncidents.map((inc, idx) => (
                <PublicIncidentCard
                  key={inc.id}
                  incident={inc}
                  defaultExpanded={idx === 0}
                  onOpenPhoto={handleOpenPhoto}
                />
              ))}
            </div>
          )}

          {/* Zone extensible au clic sur "Consulter +" */}
          {showCommuneExplorer && (
            <div className="mt-8 p-5 sm:p-8 rounded-3xl bg-surface2/70 border border-line shadow-sm space-y-6">
              <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-accent block mb-1">
                    Exploration par secteur
                  </span>
                  <h3 className="font-display font-bold text-xl sm:text-2xl text-ink">
                    Sélectionner votre commune
                  </h3>
                  <p className="text-xs sm:text-sm text-ink2 mt-1">
                    Choisissez une commune pour consulter la liste des incidents actifs enregistrés aujourd&apos;hui.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCommuneExplorer(false)}
                  className="p-2 rounded-xl bg-surface border border-line hover:bg-surface2 text-ink2 hover:text-ink transition"
                  aria-label="Fermer la sélection de commune"
                >
                  <X size={18} />
                </button>
              </div>

              {loadingCommunes ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-12 rounded-xl bg-surface border border-line animate-pulse" />
                  ))}
                </div>
              ) : communes.length === 0 ? (
                <p className="text-sm text-ink2">Aucune commune disponible pour le moment.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
                  {communes.map((commune) => {
                    const isSelected = selectedCommune?.id === commune.id;
                    return (
                      <button
                        key={commune.id}
                        type="button"
                        onClick={() => handleSelectCommune(commune)}
                        className={`p-3 rounded-xl border text-left transition flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-accent text-[var(--water-ink)] border-accent shadow-md'
                            : 'bg-surface hover:bg-surface2 text-ink border-line'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5 font-semibold text-xs sm:text-sm truncate">
                          <MapPin
                            size={14}
                            className={isSelected ? 'text-white shrink-0' : 'text-accent shrink-0'}
                            aria-hidden="true"
                          />
                          <span className="truncate">{commune.nom}</span>
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : commune.incidents_jour > 0
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-surface2 text-ink2 border border-line'
                          }`}
                        >
                          {commune.incidents_jour}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedCommune && (
                <div className="pt-4 border-t border-line space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-display font-bold text-lg text-ink">
                      Incidents actifs du jour — {selectedCommune.nom}
                    </h4>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-surface border border-line text-ink2">
                      {loadingCommuneIncidents
                        ? 'Chargement…'
                        : `${communeIncidents.length} incident${communeIncidents.length > 1 ? 's' : ''} actif${communeIncidents.length > 1 ? 's' : ''}`}
                    </span>
                  </div>

                  {loadingCommuneIncidents ? (
                    <div className="space-y-3">
                      {[1, 2].map((item) => (
                        <div
                          key={item}
                          className="p-4 rounded-2xl bg-surface border border-line animate-pulse h-20"
                        />
                      ))}
                    </div>
                  ) : communeIncidents.length === 0 ? (
                    <div className="p-6 rounded-2xl bg-surface border border-line text-center text-sm text-ink2">
                      Aucun incident actif signalé aujourd&apos;hui à <strong>{selectedCommune.nom}</strong>.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {communeIncidents.map((inc) => (
                        <PublicIncidentCard
                          key={`commune-${selectedCommune.id}-${inc.id}`}
                          incident={inc}
                          onOpenPhoto={handleOpenPhoto}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Visionneuse photo plein écran */}
        {lightbox && (
          <div
            className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label={lightbox.title}
            onClick={() => setLightbox(null)}
          >
            <div
              className="relative max-w-4xl w-full flex flex-col items-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-full flex items-center justify-between text-white text-sm px-1">
                <span className="font-semibold truncate">{lightbox.title}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-slate-300 font-mono">
                    {lightbox.index + 1} / {lightbox.photos.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLightbox(null)}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
                    aria-label="Fermer la photo"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="relative w-full flex items-center justify-center">
                {lightbox.photos.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setLightbox((prev) =>
                        prev
                          ? {
                              ...prev,
                              index: (prev.index - 1 + prev.photos.length) % prev.photos.length,
                            }
                          : null
                      )
                    }
                    className="absolute left-2 sm:left-4 p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-white/15 transition"
                    aria-label="Photo précédente"
                  >
                    <ChevronLeft size={20} />
                  </button>
                )}

                <img
                  src={apiUrl(lightbox.photos[lightbox.index])}
                  alt={`${lightbox.title} — photo ${lightbox.index + 1}`}
                  className="max-h-[78vh] max-w-full rounded-2xl object-contain shadow-2xl border border-white/10"
                />

                {lightbox.photos.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setLightbox((prev) =>
                        prev ? { ...prev, index: (prev.index + 1) % prev.photos.length } : null
                      )
                    }
                    className="absolute right-2 sm:right-4 p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-white/15 transition"
                    aria-label="Photo suivante"
                  >
                    <ChevronRight size={20} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Que signaler */}
        <section className="py-16 sm:py-20 bg-surface2 border-y border-line" id="quoi">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mb-8 sm:mb-10 space-y-3">
              <h2 className="font-display font-extrabold text-[1.65rem] sm:text-4xl text-ink tracking-tight">
                Que pouvez-vous signaler ?
              </h2>
              <p className="text-ink2 text-[15px] sm:text-base">
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
                <li className="px-3 py-1.5 bg-surface border border-amber-200 rounded-full">
                  Coupure privée d&apos;eau courante
                </li>
                <li className="px-3 py-1.5 bg-surface border border-amber-200 rounded-full">
                  Demandes d&apos;indemnisation d&apos;assurance
                </li>
                <li className="px-3 py-1.5 bg-surface border border-amber-200 rounded-full">
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
                className="group rounded-3xl p-6 sm:p-8 bg-surface border border-line shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="rounded-2xl overflow-hidden border border-line shadow-sm aspect-[16/10] bg-surface2">
                    <img
                      alt="Illustration voirie submergée et balisage de sécurité"
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuARPshJDsbAgzyeayQD8KlnhL-swsUg0bK9jOYwEXxibzdV3xLQi9dRSSoNgbXxdASkYSVzALqKwWJgldbrF8LeiJh7VsCCuTwmlDgLZ2Z9HMGIWTQUYp1SfDjuW86pIpmam3u--8l-K3LDd-H9cRtJSsUmJ51Omyb88SHoMEdfOOqLvITmPYausuKp5XsXfKVvchnLTG-HyF4PnQwKcfAL1NvO0hKsPit2pLkECwE"
                    />
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-[var(--water-dim)] text-accent flex items-center justify-center">
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
                  <h3 className="font-display font-bold text-xl text-ink">
                    Chaussée ou route submergée
                  </h3>
                  <p className="text-ink2 text-sm leading-relaxed">
                    Voie impraticable, eau stagnant sur la voirie, pont sous surveillance ou circulation
                    automobile devenue risquée.
                  </p>
                </div>
                <div className="mt-5 pt-4 border-t border-line text-xs font-semibold text-accent">
                  Baliser &amp; prévenir les usagers →
                </div>
              </Link>

              {/* 3 : Habitation */}
              <Link
                to="/signaler?type=nappe"
                className="group rounded-3xl p-6 sm:p-8 bg-surface border border-line shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="rounded-2xl overflow-hidden border border-line shadow-sm aspect-[16/10] bg-surface2">
                    <img
                      alt="Illustration habitation inondée avec motopompe et sacs de protection"
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuDQnkveQFSybSoUwEtdGQuG4oGgddX2k3-8l8uWbyfdDTRQ4Gmo9pFhByfSgW-nuNBPLOctJipQ8ANC7vstZK49iT_yDGROQ0_A69-WNrFe0bWhNmT87z6doaUzafjC55tQigvfmY48_Kz_dAJtnRFxk6zspoK1tileUIygxtk-BLwJQw-6ym_sKOOxZyD6QiZtpznwkZa-qJQHtbZudzpkeKCU0va6NQb8pwOtb80"
                    />
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-[var(--water-dim)] text-accent flex items-center justify-center">
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
                  <h3 className="font-display font-bold text-xl text-ink">
                    Habitation ou local inondé
                  </h3>
                  <p className="text-ink2 text-sm leading-relaxed">
                    Cave, rez-de-chaussée ou commerce envahi par les eaux suite à un ruissellement ou une
                    remontée de nappe phréatique.
                  </p>
                </div>
                <div className="mt-5 pt-4 border-t border-line text-xs font-semibold text-accent">
                  Assistance municipale au pompage →
                </div>
              </Link>

              {/* 4 : Ouvrages */}
              <div className="group md:col-span-3 rounded-3xl p-6 sm:p-8 bg-surface border border-line shadow-sm hover:shadow-md transition flex flex-col md:flex-row items-stretch md:items-center justify-between gap-5 md:gap-6">
                <div className="w-full md:w-56 h-40 md:h-36 rounded-2xl overflow-hidden border border-line shadow-sm shrink-0 bg-surface2">
                  <img
                    alt="Illustration surveillance des digues et capteurs de niveau d'eau"
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBPJExPV6Av_G15jmyO4ZRZQUSnrqTIwJ2vFtDniK3jei8r9OdcF3NQPmjS-IAYgmdd-vWHtdNziCSVEhSExocRqmRFt9_ZXyQy5noCmYnn54Vh2OH3vSu10bvwhlUl_J4SQf_RJ4UdDVyxODJZyZ6evoUHExgjFzEHarr6hWPlz8T7ypGwwhf1891Rg9uRQWZu42U_Amy4cLX4ZaC3hpbu6OqkpinXszdaJ1EVJQg"
                  />
                </div>
                <div className="flex items-start gap-4 sm:gap-5 flex-1">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[var(--water-dim)] text-accent flex items-center justify-center shrink-0">
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
                    <h3 className="font-display font-bold text-xl text-ink">
                      Réseau d&apos;assainissement, digue ou cours d&apos;eau en crue
                    </h3>
                    <p className="text-ink2 text-sm leading-relaxed max-w-3xl">
                      Bouche d&apos;égout refoulant de l&apos;eau usée, fissure visible sur un ouvrage de
                      rétention ou cours d&apos;eau quittant son lit naturel.
                    </p>
                  </div>
                </div>
                <Link
                  className="shrink-0 text-center px-6 py-3.5 bg-accent hover:bg-[var(--water-hi)] text-[var(--water-ink)] font-semibold text-sm rounded-xl transition"
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
            <h2 className="font-display font-extrabold text-[1.65rem] sm:text-4xl text-ink tracking-tight">
              Comment fonctionne le signalement ?
            </h2>
            <p className="text-ink2 text-[15px] sm:text-base">
              Un processus intuitif conçu pour être manipulé facilement depuis un smartphone, même en situation
              de stress.
            </p>
          </div>

          <ol className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-8 relative">
            {/* Trait de liaison desktop */}
            <div
              className="hidden md:block absolute top-14 left-[16%] right-[16%] h-px border-t-2 border-dashed border-line2"
              aria-hidden="true"
            ></div>

            <li className="relative p-6 sm:p-8 rounded-3xl bg-surface border border-line shadow-sm hover:shadow-lg transition flex md:block gap-4">
              <div className="relative w-12 h-12 shrink-0 rounded-2xl bg-accent text-[var(--water-ink)] font-display font-bold text-xl flex items-center justify-center shadow-lg shadow-[var(--water-dim)] md:mb-6">
                1
              </div>
              <div>
                <h3 className="font-display font-bold text-lg sm:text-xl text-ink mb-2">
                  Localisation assistée
                </h3>
                <p className="text-ink2 text-sm leading-relaxed">
                  Votre géolocalisation GPS est automatiquement détectée. Vous pouvez ajuster le marqueur
                  directement sur la carte pour une précision métrique.
                </p>
              </div>
            </li>
            <li className="relative p-6 sm:p-8 rounded-3xl bg-surface border border-line shadow-sm hover:shadow-lg transition flex md:block gap-4">
              <div className="relative w-12 h-12 shrink-0 rounded-2xl bg-accent text-[var(--water-ink)] font-display font-bold text-xl flex items-center justify-center shadow-lg shadow-[var(--water-dim)] md:mb-6">
                2
              </div>
              <div>
                <h3 className="font-display font-bold text-lg sm:text-xl text-ink mb-2">
                  Constat &amp; Photos
                </h3>
                <p className="text-ink2 text-sm leading-relaxed">
                  Évaluez la hauteur d&apos;eau (cheville, genou, carrosserie), téléversez 1 à 3 photos et
                  indiquez si des personnes vulnérables sont à proximité.
                </p>
              </div>
            </li>
            <li className="relative p-6 sm:p-8 rounded-3xl bg-surface border border-line shadow-sm hover:shadow-lg transition flex md:block gap-4">
              <div className="relative w-12 h-12 shrink-0 rounded-2xl bg-accent text-[var(--water-ink)] font-display font-bold text-xl flex items-center justify-center shadow-lg shadow-[var(--water-dim)] md:mb-6">
                3
              </div>
              <div>
                <h3 className="font-display font-bold text-lg sm:text-xl text-ink mb-2">
                  Prise en charge &amp; Coordination
                </h3>
                <p className="text-ink2 text-sm leading-relaxed">
                  L&apos;alerte est immédiatement transmise aux agents municipaux et équipes de secours pour
                  vérification et déploiement sur le terrain.
                </p>
              </div>
            </li>
          </ol>

          <div className="mt-10 sm:mt-14 text-center">
            <Link
              className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-accent hover:bg-[var(--water-hi)] text-[var(--water-ink)] font-bold text-base rounded-xl shadow-xl shadow-[var(--water-dim)] transition hover:-translate-y-0.5 w-full sm:w-auto"
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
                    Incidents en direct
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
                  <a className="hover:text-white transition" href="#securite">
                    Urgences &amp; Contacts
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
      <div
        className="fixed bottom-0 inset-x-0 z-50 px-3 pt-3 dock-safe border-t border-line md:hidden flex items-center gap-3 backdrop-blur-lg"
        style={{ backgroundColor: 'var(--s1)' }}
      >
        <Link
          className="flex-1 py-3.5 px-4 bg-accent active:bg-[var(--water-hi)] text-[var(--water-ink)] font-bold text-sm rounded-xl text-center shadow-lg shadow-[var(--water-dim)] flex items-center justify-center gap-2"
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

