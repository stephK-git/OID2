import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch, apiUrl } from '../api/client';
import { LandingHeader } from '../components/landing/LandingHeader';
import { severityOf, type Severity } from '../components/landing/severity';
import { formatRelativeTime } from '../components/incidentLabels';
import { PublicIncidentCard, type PublicIncident } from '../components/PublicIncidentCard';
import './LandingPage.css';

interface LightboxState {
  photos: string[];
  index: number;
  title: string;
}

const LANDING_PREVIEW_COUNT = 3;

const SEVERITY_RANK: Record<Severity, number> = {
  critique: 0,
  route_coupee: 1,
  vigilance: 2,
};

const OUT_OF_SCOPE = [
  "Coupure d'eau privée",
  "Indemnisation d'assurance",
  'Voirie sans lien avec une crue',
];

const STEPS = [
  {
    n: '1',
    title: 'Localisation assistée',
    text: 'Votre position GPS est détectée. Ajustez le repère si besoin.',
  },
  {
    n: '2',
    title: 'Constat et photos',
    text: "Hauteur d'eau (cheville, genou, taille), une photo et un repère visuel (carrefour, concession).",
  },
  {
    n: '3',
    title: 'Prise en charge',
    text: "L'alerte est transmise aux agents municipaux et aux secours, puis visible ici une fois validée.",
  },
];

const SAFETY_TIPS = [
  {
    n: '01',
    title: 'Coupez gaz et électricité',
    text: "Disjoncteur général et arrivée de gaz, avant que l'eau n'entre.",
  },
  {
    n: '02',
    title: "Montez à l'étage",
    text: "Emportez papiers d'identité et kit d'urgence. Ne descendez jamais dans un sous-sol.",
  },
  {
    n: '03',
    title: 'Écoutez les consignes',
    text: 'Radios locales et autorités. Gardez les lignes libres pour les urgences.',
  },
];

const EMERGENCY_NUMBERS = [
  { number: '180', label: 'Sapeurs-pompiers (GSPM)', href: 'tel:180' },
  { number: '112', label: 'Secours & urgences', href: 'tel:112' },
];

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatTime(isoDate: string | null): string {
  if (!isoDate) return '—';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

const ReportIcon: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

interface ReportCardProps {
  to: string;
  icon: React.ReactNode;
  title: string;
  text: string;
}

const ReportCard: React.FC<ReportCardProps> = ({ to, icon, title, text }) => (
  <Link
    to={to}
    className="group flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--water)] focus-visible:ring-offset-2"
  >
    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e6f0fb] text-[var(--water)]">
      {icon}
    </span>
    <span className="text-[18px] font-bold text-ink">{title}</span>
    <span className="text-[14px] leading-[1.55] text-ink2">{text}</span>
    <span className="mt-auto pt-1 text-[14px] font-bold text-[var(--water)] group-hover:underline">
      Signaler →
    </span>
  </Link>
);

export const LandingPage: React.FC = () => {
  const { user, isAuthenticated } = useAuth();

  const [activeSection, setActiveSection] = useState<string>('aujourdhui');
  const [todayIncidents, setTodayIncidents] = useState<PublicIncident[]>([]);
  const [todayTotal, setTodayTotal] = useState<number>(0);
  const [loadingToday, setLoadingToday] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<boolean>(false);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  const agentPath =
    isAuthenticated && user
      ? user.role === 'coordinateur'
        ? '/coordination'
        : user.role === 'verificateur'
        ? '/verification'
        : '/enquete'
      : '/login';

  // Chargement des incidents actifs du jour
  useEffect(() => {
    let mounted = true;

    apiFetch<{ items: PublicIncident[]; total: number }>(
      '/signalements/recents?today_only=true&limit=30'
    )
      .then((response) => {
        if (!mounted) return;
        setTodayIncidents(Array.isArray(response?.items) ? response.items : []);
        setTodayTotal(typeof response?.total === 'number' ? response.total : 0);
        setLoadError(false);
      })
      .catch(() => {
        if (!mounted) return;
        setTodayIncidents([]);
        setTodayTotal(0);
        setLoadError(true);
      })
      .finally(() => {
        if (mounted) setLoadingToday(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Visionneuse photo : fermeture au clavier (Échap / flèches)
  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightbox(null);
      } else if (event.key === 'ArrowRight' && lightbox.photos.length > 1) {
        setLightbox((previous) =>
          previous
            ? { ...previous, index: (previous.index + 1) % previous.photos.length }
            : null
        );
      } else if (event.key === 'ArrowLeft' && lightbox.photos.length > 1) {
        setLightbox((previous) =>
          previous
            ? {
                ...previous,
                index:
                  (previous.index - 1 + previous.photos.length) % previous.photos.length,
              }
            : null
        );
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightbox]);

  // Section active pour la navigation
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );

    ['aujourdhui', 'quoi', 'etapes', 'securite'].forEach((id) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const [today] = useState(() => new Date());
  const dateLabel = useMemo(
    () =>
      capitalize(
        today.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
      ),
    [today]
  );
  const currentYear = today.getFullYear();

  const stats = useMemo(() => {
    const total = todayTotal > 0 ? todayTotal : todayIncidents.length;
    const communes = new Set(todayIncidents.map((incident) => incident.commune)).size;
    const critical = todayIncidents.filter(
      (incident) => severityOf(incident) === 'critique'
    ).length;
    return { total, communes, critical };
  }, [todayIncidents, todayTotal]);

  const latestUpdate = useMemo(() => {
    let latest: string | null = null;
    let latestTimestamp = 0;

    for (const incident of todayIncidents) {
      const isoDate = incident.maj_le || incident.cree_le;
      if (!isoDate) continue;
      const timestamp = new Date(isoDate).getTime();
      if (!Number.isNaN(timestamp) && timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
        latest = isoDate;
      }
    }

    return latest;
  }, [todayIncidents]);

  const lastUpdateRelative = latestUpdate ? formatRelativeTime(latestUpdate) : '—';
  const lastUpdateTime = latestUpdate ? formatTime(latestUpdate) : '—';

  const previewIncidents = useMemo(() => {
    const sorted = [...todayIncidents].sort((a, b) => {
      const rankDiff = SEVERITY_RANK[severityOf(a)] - SEVERITY_RANK[severityOf(b)];
      if (rankDiff !== 0) return rankDiff;
      const ta = new Date(a.maj_le || a.cree_le || 0).getTime();
      const tb = new Date(b.maj_le || b.cree_le || 0).getTime();
      return tb - ta;
    });
    return sorted.slice(0, LANDING_PREVIEW_COUNT);
  }, [todayIncidents]);

  const handleOpenPhoto = (photos: string[], index: number, title: string) => {
    setLightbox({ photos, index, title });
  };

  return (
    <div className="oid-landing-page font-sans antialiased selection:bg-accent selection:text-white">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 z-[100] rounded-lg bg-[var(--water)] px-4 py-2 font-semibold text-white shadow-lg"
        href="#contenu"
      >
        Aller au contenu principal
      </a>

      <LandingHeader activeSection={activeSection} agentPath={agentPath} />

      <main id="contenu">
        {/* HERO */}
        <section className="relative overflow-hidden bg-[#0b1f33] text-white">
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            <img
              src="/images/hero-abidjan.jpg"
              alt="Vue aérienne d'Abidjan et de la lagune Ébrié"
              className="landing-cover-img"
            />
            <div className="landing-hero-overlay absolute inset-0" aria-hidden="true" />
          </div>

          <div className="relative z-10 mx-auto max-w-[1200px] 2xl:max-w-[1320px] px-4 pb-[88px] pt-9 sm:px-6 sm:pb-[120px] sm:pt-[72px]">
            <div className="flex max-w-[720px] flex-col gap-4 sm:gap-5">
              <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#9cc8ff] sm:hidden">
                Information citoyenne · Abidjan
              </span>

              <h1 className="font-display text-[32px] font-extrabold leading-[1.12] tracking-[-0.03em] sm:text-[44px] sm:leading-[1.1] xl:text-[56px] xl:leading-[1.08]">
                Signalez, alertez et
                <br />
                protégez face aux
                <br />
                <span className="text-[#58a6ff]">montées des eaux</span>.
              </h1>

              <p className="max-w-[600px] text-[15px] leading-[1.6] text-[#e3ecf6] sm:text-[18px]">
                <span className="hidden sm:inline">
                  Consultez les incidents actifs commune par commune et sachez quoi faire. Un
                  danger près de vous ? Signalez-le en deux minutes, sans compte.
                </span>
                <span className="sm:hidden">
                  Consultez les incidents actifs commune par commune. Un danger près de vous ?
                  Signalez-le en deux minutes.
                </span>
              </p>

              <div className="flex flex-col items-stretch gap-3 pt-1 sm:flex-row sm:items-center">
                <a
                  href="#aujourdhui"
                  className="inline-flex h-[52px] w-full items-center justify-center gap-2.5 rounded-xl bg-white px-6 text-[16px] font-bold text-[#0b1f33] transition-colors hover:bg-[#f3f6fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1f33] sm:w-auto"
                >
                  Voir les incidents du jour
                  <ArrowDown size={16} strokeWidth={2.5} aria-hidden="true" />
                </a>
                <Link
                  to="/signaler"
                  className="hidden h-[52px] items-center justify-center rounded-xl border border-white px-6 text-[16px] font-bold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1f33] sm:inline-flex"
                >
                  Signaler un incident
                </Link>
              </div>

              <p className="hidden text-[14px] text-[#e3ecf6] sm:block">
                Personne en danger ? Appelez d&apos;abord les secours :{' '}
                <a
                  href="tel:180"
                  className="font-mono font-bold text-white underline underline-offset-2 hover:text-[#9cc8ff]"
                >
                  180
                </a>
              </p>
            </div>
          </div>
        </section>

        {/* BANDEAU DE SITUATION — MOBILE */}
        <div className="landing-shadow-card relative z-10 mx-4 -mt-14 overflow-hidden rounded-2xl border border-line bg-surface sm:mx-6 xl:hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
            <span className="text-[15px] font-extrabold text-ink">{dateLabel}</span>
            <span className="flex items-center gap-1.5 text-[13px] text-ink2">
              <span className="h-2 w-2 rounded-full bg-[var(--ok)]" aria-hidden="true" />
              {loadingToday ? 'Chargement…' : lastUpdateRelative}
            </span>
          </div>
          <div className="grid grid-cols-3 divide-x divide-line">
            <div className="px-4 py-3.5">
              <div className="font-mono text-[26px] font-bold leading-[1.1] text-ink">
                {loadingToday ? '—' : stats.total}
              </div>
              <div className="mt-1 text-[12px] font-semibold text-ink2">Incidents actifs</div>
            </div>
            <div className="px-4 py-3.5">
              <div className="font-mono text-[26px] font-bold leading-[1.1] text-ink">
                {loadingToday ? '—' : stats.communes}
              </div>
              <div className="mt-1 text-[12px] font-semibold text-ink2">Communes</div>
            </div>
            <div className="px-4 py-3.5">
              <div className="font-mono text-[26px] font-bold leading-[1.1] text-[#b3261e]">
                {loadingToday ? '—' : stats.critical}
              </div>
              <div className="mt-1 text-[12px] font-semibold text-[#b3261e]">Critiques</div>
            </div>
          </div>
        </div>

        {/* BANDEAU DE SITUATION — DESKTOP */}
        <div className="relative z-10 mx-auto -mt-14 hidden max-w-[1200px] 2xl:max-w-[1320px] px-6 xl:block">
          <div className="landing-shadow-card grid grid-cols-5 divide-x divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="px-6 py-5">
              <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink2">
                Aujourd&apos;hui
              </div>
              <div className="mt-1.5 text-[18px] font-extrabold text-ink">{dateLabel}</div>
              <div className="mt-0.5 text-[13px] text-ink2">{currentYear}</div>
            </div>
            <div className="px-6 py-5">
              <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink2">
                Incidents actifs
              </div>
              <div className="mt-1.5 font-mono text-[32px] font-bold leading-[1.1] text-ink">
                {loadingToday ? '—' : stats.total}
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink2">
                Communes touchées
              </div>
              <div className="mt-1.5 font-mono text-[32px] font-bold leading-[1.1] text-ink">
                {loadingToday ? '—' : stats.communes}
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-[#b3261e]">
                Situations critiques
              </div>
              <div className="mt-1.5 font-mono text-[32px] font-bold leading-[1.1] text-[#b3261e]">
                {loadingToday ? '—' : stats.critical}
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink2">
                Dernière mise à jour
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-[18px] font-extrabold text-ink">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--ok)]" aria-hidden="true" />
                {loadingToday ? 'Chargement…' : lastUpdateRelative}
              </div>
              <div className="mt-0.5 font-mono text-[13px] text-ink2">
                {loadingToday ? '—' : lastUpdateTime}
              </div>
            </div>
          </div>
        </div>

        {/* INCIDENTS DU JOUR (APERÇU 3 INCIDENTS EN ACCORDÉON) */}
        <section
          id="aujourdhui"
          className="mx-auto max-w-[1200px] 2xl:max-w-[1320px] px-4 pb-12 pt-10 sm:px-6 lg:pb-[72px] lg:pt-16"
        >
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-7">
            <div className="flex max-w-[640px] flex-col gap-2">
              <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--water)]">
                Situation terrain en direct
              </span>
              <h2 className="font-display text-[26px] font-extrabold leading-[1.2] tracking-[-0.02em] text-ink sm:text-[36px] sm:leading-[1.15]">
                Les incidents du jour
              </h2>
              <p className="text-[15px] leading-[1.6] text-ink2 sm:text-[16px]">
                Cliquez sur un incident pour dérouler le détail : hauteur d&apos;eau, routes
                coupées et risques.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                to="/consulter"
                className="inline-flex h-11 items-center rounded-[10px] border border-[var(--water)] bg-[#e6f0fb] px-4 text-[14px] font-bold text-[var(--water)] transition-colors hover:bg-[var(--water)] hover:text-white sm:h-12 sm:px-5"
              >
                Consulter les incidents
                <ArrowRight size={16} className="ml-2" aria-hidden="true" />
              </Link>
              <Link
                to="/signaler"
                className="inline-flex h-11 items-center rounded-[10px] border border-line2 bg-surface px-4 text-[14px] font-bold text-ink transition-colors hover:border-[var(--water)] hover:text-[var(--water)] sm:h-12 sm:px-5"
              >
                Déclarer un incident
                <ArrowRight size={16} className="ml-2" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {loadingToday ? (
              [1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-[88px] animate-pulse rounded-2xl border border-line bg-surface"
                />
              ))
            ) : loadError ? (
              <div className="rounded-2xl border border-line bg-surface p-6 text-center sm:p-8">
                <p className="text-[16px] font-bold text-ink">
                  Impossible de charger les incidents
                </p>
                <p className="mt-1.5 text-[14px] text-ink2">
                  Réessayez dans quelques instants ou accédez directement à la page de
                  consultation.
                </p>
              </div>
            ) : previewIncidents.length === 0 ? (
              <div className="rounded-2xl border border-line bg-surface p-6 text-center sm:p-8">
                <p className="text-[16px] font-bold text-ink">
                  Aucun incident actif signalé aujourd&apos;hui
                </p>
                <p className="mt-1.5 text-[14px] text-ink2">
                  Vous pouvez consulter les incidents en cours des jours précédents ou signaler un
                  nouvel incident.
                </p>
              </div>
            ) : (
              previewIncidents.map((incident) => (
                <PublicIncidentCard
                  key={incident.id}
                  incident={incident}
                  defaultExpanded={false}
                  onOpenPhoto={handleOpenPhoto}
                />
              ))
            )}
          </div>
        </section>

        {/* QUE SIGNALER */}
        <section id="quoi" className="border-y border-line bg-[var(--s2)]">
          <div className="mx-auto max-w-[1200px] 2xl:max-w-[1320px] px-4 py-12 sm:px-6 sm:py-16">
            <div className="mb-8 flex max-w-[640px] flex-col gap-2">
              <h2 className="font-display text-[26px] font-extrabold leading-[1.2] tracking-[-0.02em] text-ink sm:text-[32px]">
                Que pouvez-vous signaler ?
              </h2>
              <p className="text-[15px] leading-[1.6] text-ink2 sm:text-[16px]">
                Quatre situations liées aux crues, prises en charge par les équipes municipales
                et les secours.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <ReportCard
                to="/signaler?type=ruissellement"
                title="Route ou chaussée submergée"
                text="Voie impraticable, eau stagnante, pont sous surveillance."
                icon={
                  <ReportIcon>
                    <path d="M3 17l3-12h12l3 12M12 5v3m0 4v2m0 3v2" />
                  </ReportIcon>
                }
              />
              <ReportCard
                to="/signaler?type=nappe"
                title="Habitation ou local inondé"
                text="Rez-de-chaussée, commerce ou cour envahis par les eaux."
                icon={
                  <ReportIcon>
                    <path d="M3 11l9-8 9 8M5 10v10h14V10" />
                  </ReportIcon>
                }
              />
              <ReportCard
                to="/signaler?type=refoulement"
                title="Égout, digue ou cours d'eau"
                text="Refoulement, fissure sur un ouvrage, débordement."
                icon={
                  <ReportIcon>
                    <path d="M3 15c2.5-2 4.5-2 7 0s4.5 2 7 0 3-1.5 4-1M3 9c2.5-2 4.5-2 7 0s4.5 2 7 0 3-1.5 4-1" />
                  </ReportIcon>
                }
              />

              <div className="flex flex-col gap-3 rounded-2xl border border-[#f0b8b4] bg-[#fdecea] p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[#b3261e]">
                  <ReportIcon>
                    <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                  </ReportIcon>
                </span>
                <span className="text-[18px] font-bold text-[#7a1a15]">
                  Danger immédiat pour une personne
                </span>
                <span className="text-[14px] leading-[1.55] text-[#7a1a15]">
                  Personne isolée, risque électrique, bâtiment menaçant. Appelez les secours, ne
                  passez pas par le formulaire.
                </span>
                <a
                  href="tel:180"
                  className="mt-auto pt-1 font-mono text-[14px] font-bold text-[#7a1a15] underline underline-offset-2"
                >
                  180 — Sapeurs-pompiers
                </a>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2.5 text-[14px] text-ink2">
              <strong className="text-ink">Hors périmètre :</strong>
              {OUT_OF_SCOPE.map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-line bg-surface px-3 py-1.5"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* COMMENT ÇA MARCHE */}
        <section id="etapes" className="mx-auto max-w-[1200px] 2xl:max-w-[1320px] px-4 py-12 sm:px-6 sm:py-[72px]">
          <div className="mb-8 flex max-w-[640px] flex-col gap-2">
            <h2 className="font-display text-[26px] font-extrabold leading-[1.2] tracking-[-0.02em] text-ink sm:text-[32px]">
              Un signalement en trois étapes
            </h2>
            <p className="text-[15px] leading-[1.6] text-ink2 sm:text-[16px]">
              Pensé pour un smartphone, même en situation de stress.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {STEPS.map((step) => (
              <div
                key={step.n}
                className="flex gap-4 rounded-2xl border border-line bg-surface p-6"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--water)] font-mono text-[18px] font-bold text-white">
                  {step.n}
                </span>
                <div>
                  <div className="text-[17px] font-bold text-ink">{step.title}</div>
                  <p className="mt-1.5 text-[14px] leading-[1.55] text-ink2">{step.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SÉCURITÉ */}
        <section id="securite" className="bg-[#0b1f33] text-white">
          <div className="mx-auto flex max-w-[1200px] 2xl:max-w-[1320px] flex-col gap-12 px-4 py-12 sm:px-6 sm:py-[72px]">
            <div className="flex flex-col items-center gap-8 lg:flex-row">
              <div className="flex flex-1 flex-col gap-4">
                <h2 className="font-display text-[26px] font-extrabold leading-[1.2] tracking-[-0.02em] sm:text-[36px] sm:leading-[1.15]">
                  <span className="text-[#fbbf24]">30 centimètres d&apos;eau</span> suffisent
                  pour emporter une voiture.
                </h2>
                <p className="text-[15px] leading-[1.65] text-[#e3ecf6] sm:text-[16px]">
                  Ne vous engagez jamais sur une route submergée, même en 4x4. Le courant
                  soulève le véhicule et en prend le contrôle. Faites demi-tour.
                </p>
              </div>

              <div className="w-full flex-1 rounded-2xl border border-[#1c3452] bg-[#07162a] p-4 sm:p-5">
                <svg
                  role="img"
                  aria-label="Schéma : une nappe d'eau de 30 centimètres autour des roues d'un véhicule"
                  className="h-auto w-full select-none"
                  viewBox="0 0 540 220"
                >
                  <rect x="0" y="180" width="540" height="40" fill="#0b1f33" />
                  <line x1="0" y1="180" x2="540" y2="180" stroke="#3b5878" strokeWidth="2" />
                  <g fill="#14304f" stroke="#cbd5e1" strokeWidth="2.5" strokeLinejoin="round">
                    <path d="M 120 110 L 160 65 L 320 65 L 380 110 Z" />
                    <rect x="60" y="105" width="370" height="55" rx="14" />
                    <circle cx="130" cy="155" r="28" fill="#07162a" stroke="#94a3b8" strokeWidth="3" />
                    <circle cx="360" cy="155" r="28" fill="#07162a" stroke="#94a3b8" strokeWidth="3" />
                  </g>
                  <path
                    className="animate-wave"
                    d="M 0 150 Q 75 142, 150 150 T 300 150 T 450 150 T 540 150 T 690 150 T 840 150 T 990 150 T 1080 150 L 1080 180 L 0 180 Z"
                    fill="#2d9cdb"
                    fillOpacity="0.85"
                  />
                  <g stroke="#fbbf24" strokeWidth="2.5">
                    <line x1="500" y1="150" x2="500" y2="180" />
                    <line x1="492" y1="150" x2="508" y2="150" />
                    <line x1="492" y1="180" x2="508" y2="180" />
                  </g>
                  <text
                    x="500"
                    y="138"
                    fill="#fbbf24"
                    fontSize="20"
                    fontWeight="700"
                    textAnchor="middle"
                    fontFamily="'Plus Jakarta Sans', sans-serif"
                  >
                    30 cm
                  </text>
                </svg>
              </div>
            </div>

            <div>
              <h3 className="font-display text-[24px] font-extrabold text-white">
                Les gestes réflexes
              </h3>
              <p className="mb-5 mt-1.5 text-[14px] text-[#e3ecf6]">
                Dès les premiers signaux de crue.
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {SAFETY_TIPS.map((tip) => (
                  <div
                    key={tip.n}
                    className="rounded-2xl border border-[#1c3452] bg-[#112a45] p-6"
                  >
                    <div className="font-mono text-[14px] font-bold text-[#fbbf24]">
                      {tip.n}
                    </div>
                    <div className="mt-2 text-[18px] font-bold text-white">{tip.title}</div>
                    <p className="mt-2 text-[14px] leading-[1.6] text-[#e3ecf6]">{tip.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-[#1c3452] pt-8">
              <div className="mb-4 text-[12px] font-bold uppercase tracking-[0.08em] text-[#e3ecf6]">
                Numéros d&apos;urgence
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {EMERGENCY_NUMBERS.map((item, index) => (
                  <a
                    key={item.label}
                    href={item.href}
                    className="rounded-[14px] border border-[#1c3452] bg-[#112a45] p-[18px] text-center transition-colors hover:bg-[#14304f]"
                  >
                    <div
                      className={`font-mono text-[22px] font-bold ${
                        index === 0 ? 'text-[#ffb4ad]' : 'text-[#9cc8ff]'
                      }`}
                    >
                      {item.number}
                    </div>
                    <div className="mt-1 text-[13px] font-semibold text-white">{item.label}</div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-[#1c3452] bg-[#07162a] text-[#cbd8e6]">
        <div className="mx-auto flex max-w-[1200px] 2xl:max-w-[1320px] flex-wrap justify-between gap-8 px-4 pb-28 pt-12 sm:px-6 xl:pb-8">
          <div className="flex max-w-[460px] flex-1 basis-[320px] flex-col gap-3">
            <div className="text-[18px] font-extrabold text-white">
              OID · Observatoire Inondations &amp; Dommages
            </div>
            <p className="text-[13px] leading-[1.6]">
              Outil d&apos;intérêt général développé avec les collectivités locales, les services
              de secours et la protection civile pour faire remonter les données de crues.
            </p>
          </div>

          <nav aria-label="Plateforme" className="flex flex-col gap-1 text-[14px]">
            <div className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-white">
              Plateforme
            </div>
            <a href="#aujourdhui" className="py-2 transition-colors hover:text-white">
              Incidents du jour
            </a>
            <a href="#quoi" className="py-2 transition-colors hover:text-white">
              Que signaler ?
            </a>
            <a href="#etapes" className="py-2 transition-colors hover:text-white">
              Comment ça marche
            </a>
            <a href="#securite" className="py-2 transition-colors hover:text-white">
              Sécurité
            </a>
          </nav>

          <nav aria-label="Informations" className="flex flex-col gap-1 text-[14px]">
            <div className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-white">
              Informations
            </div>
            <a href="#" className="py-2 transition-colors hover:text-white">
              Mentions légales
            </a>
            <a href="#" className="py-2 transition-colors hover:text-white">
              Confidentialité
            </a>
            <a href="#contenu" className="py-2 transition-colors hover:text-white">
              Accessibilité
            </a>
            <Link to={agentPath} className="py-2 transition-colors hover:text-white">
              Espace agent
            </Link>
          </nav>
        </div>

        <div className="border-t border-[#1c3452]">
          <div className="mx-auto max-w-[1200px] 2xl:max-w-[1320px] px-4 py-5 text-[13px] sm:px-6">
            © {currentYear} Observatoire Inondations &amp; Dommages. Service public citoyen.
          </div>
        </div>
      </footer>

      {/* VISIONNEUSE PHOTO */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.title}
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative flex w-full max-w-4xl flex-col items-center gap-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex w-full items-center justify-between px-1 text-sm text-white">
              <span className="truncate font-semibold">{lightbox.title}</span>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-xs text-slate-300">
                  {lightbox.index + 1} / {lightbox.photos.length}
                </span>
                <button
                  type="button"
                  onClick={() => setLightbox(null)}
                  className="rounded-xl bg-white/10 p-2 text-white transition hover:bg-white/20"
                  aria-label="Fermer la photo"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="relative flex w-full items-center justify-center">
              {lightbox.photos.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setLightbox((previous) =>
                      previous
                        ? {
                            ...previous,
                            index:
                              (previous.index - 1 + previous.photos.length) %
                              previous.photos.length,
                          }
                        : null
                    )
                  }
                  className="absolute left-2 rounded-full border border-white/15 bg-slate-900/80 p-2.5 text-white transition hover:bg-slate-800 sm:left-4"
                  aria-label="Photo précédente"
                >
                  <ChevronLeft size={20} />
                </button>
              )}

              <img
                src={apiUrl(lightbox.photos[lightbox.index])}
                alt={`${lightbox.title} — photo ${lightbox.index + 1}`}
                className="max-h-[78vh] max-w-full rounded-2xl border border-white/10 object-contain shadow-2xl"
              />

              {lightbox.photos.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setLightbox((previous) =>
                      previous
                        ? {
                            ...previous,
                            index: (previous.index + 1) % previous.photos.length,
                          }
                        : null
                    )
                  }
                  className="absolute right-2 rounded-full border border-white/15 bg-slate-900/80 p-2.5 text-white transition hover:bg-slate-800 sm:right-4"
                  aria-label="Photo suivante"
                >
                  <ChevronRight size={20} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BARRE D'ACTION MOBILE */}
      <div className="dock-safe fixed inset-x-0 bottom-0 z-50 flex gap-2.5 border-t border-line bg-surface px-3 pt-3 xl:hidden">
        <Link
          to="/signaler"
          className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[var(--water)] text-[15px] font-bold text-white active:bg-[var(--water-hi)]"
        >
          Signaler un danger
        </Link>
        <a
          href="tel:180"
          className="flex h-12 items-center justify-center rounded-xl bg-[#b3261e] px-[18px] text-[15px] font-bold text-white active:bg-[#8f1e18]"
          aria-label="Appeler le 180, sapeurs-pompiers"
        >
          Urgence
        </a>
      </div>
    </div>
  );
};
