import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowDown, ArrowRight } from 'lucide-react';
import { apiFetch } from '../api/client';
import { severityOf, SEVERITY_META, type Severity } from '../components/landing/severity';
import type { PublicIncident } from '../components/PublicIncidentCard';
import { INCIDENT_TYPE_LABELS, formatRelativeTime } from '../components/incidentLabels';
import { LandingMap, type LandingMapPoint } from '../components/landing/LandingMap';
import { HeroWaves } from '../components/landing/HeroWaves';
import { useCountUp, useReveal, useStepsProgress } from '../components/landing/useLandingMotion';
import './LandingPage.css';

type SeverityFilter = Severity | 'all';

interface CarteFeature {
  geometry?: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id?: number;
    type: string;
    danger_immediat: boolean;
    categorie: 'critique' | 'vigilance' | 'route_coupee';
    commune: string;
  };
}

const LIST_LIMIT = 6;

const SEVERITY_RANK: Record<Severity, number> = { critique: 0, route_coupee: 1, vigilance: 2 };

/** Couleurs alignées sur les repères de la page Consulter. */
const SEVERITY_DOT: Record<Severity, string> = {
  critique: '#b3261e',
  route_coupee: '#b45309',
  vigilance: '#0b5fc4',
};

const FILTERS: { key: SeverityFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'critique', label: 'Critique' },
  { key: 'route_coupee', label: 'Route coupée' },
  { key: 'vigilance', label: 'Vigilance' },
];

const REPORT_TYPES = [
  {
    to: '/signaler?type=ruissellement',
    title: 'Route ou chaussée submergée',
    text: 'Voie impraticable, eau stagnante, pont sous surveillance.',
    icon: <path d="M3 17l3-12h12l3 12M12 5v3m0 4v2m0 3v2" />,
  },
  {
    to: '/signaler?type=nappe',
    title: 'Habitation ou local inondé',
    text: 'Rez-de-chaussée, commerce ou cour envahis par les eaux.',
    icon: <path d="M3 11l9-8 9 8M5 10v10h14V10" />,
  },
  {
    to: '/signaler?type=refoulement',
    title: "Égout, digue ou cours d'eau",
    text: 'Refoulement, fissure sur un ouvrage, débordement.',
    icon: (
      <path d="M3 15c2.5-2 4.5-2 7 0s4.5 2 7 0 3-1.5 4-1M3 9c2.5-2 4.5-2 7 0s4.5 2 7 0 3-1.5 4-1" />
    ),
  },
];

const OUT_OF_SCOPE = "coupure d'eau privée, indemnisation d'assurance, voirie sans lien avec une crue.";

const WATER_LEVELS = [
  { label: 'Cheville', depth: '~10 cm', fill: 14, danger: false },
  { label: 'Genou', depth: '~50 cm', fill: 36, danger: false },
  { label: 'Taille', depth: '~1 m', fill: 58, danger: true },
];

const SAFETY_TIPS = [
  {
    when: "Avant que l'eau n'entre",
    title: 'Coupez gaz et électricité',
    text: 'Disjoncteur général et arrivée de gaz.',
    icon: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  },
  {
    when: "Dès que l'eau monte",
    title: "Montez à l'étage",
    text: "Emportez papiers d'identité et kit d'urgence. Ne descendez jamais dans un sous-sol.",
    icon: <path d="M4 20h4v-4h4v-4h4V8h4" />,
  },
  {
    when: 'En voiture',
    title: "Faites demi-tour devant l'eau",
    text: "30 cm d'eau suffisent pour emporter une voiture, même un 4x4.",
    icon: <path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />,
  },
  {
    when: 'Ensuite',
    title: 'Écoutez les consignes',
    text: 'Radios locales et autorités. Gardez les lignes libres pour les urgences.',
    icon: <path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" />,
  },
];

const Icon: React.FC<{ children: React.ReactNode; size?: number }> = ({ children, size = 22 }) => (
  <svg
    width={size}
    height={size}
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

function incidentTime(incident: PublicIncident): number {
  return new Date(incident.maj_le || incident.cree_le || 0).getTime();
}

function incidentTitle(incident: PublicIncident): string {
  return INCIDENT_TYPE_LABELS[incident.type] || incident.type;
}

function incidentDetail(incident: PublicIncident): string {
  const parts: string[] = [];
  if (incident.hauteur_eau_max_cm) parts.push(`${incident.hauteur_eau_max_cm} cm d'eau`);
  if (incident.routes_coupees) parts.push(incident.routes_coupees);
  else if (incident.degats) parts.push(incident.degats);
  if (incident.nb_signalements > 1) parts.push(`${incident.nb_signalements} signalements`);
  return parts.join(' · ');
}

export const LandingPage: React.FC = () => {
  const location = useLocation();
  const mapZoneRef = useRef<HTMLDivElement | null>(null);
  const stepsRef = useStepsProgress<HTMLOListElement>();
  const [gaugesRef, gaugesState] = useReveal<HTMLDivElement>();
  const [tipsRef, tipsState] = useReveal<HTMLDivElement>();

  const [incidents, setIncidents] = useState<PublicIncident[]>([]);
  const [features, setFeatures] = useState<CarteFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Incidents du jour (liste) et points géolocalisés (carte)
  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      apiFetch<{ items: PublicIncident[]; total: number }>(
        '/signalements/recents?today_only=true&limit=30'
      ),
      apiFetch<{ features: CarteFeature[] }>('/signalements/carte-publique'),
    ]).then(([recents, carte]) => {
      if (!mounted) return;
      if (recents.status === 'fulfilled') {
        setIncidents(Array.isArray(recents.value?.items) ? recents.value.items : []);
        setLoadError(false);
      } else {
        setIncidents([]);
        setLoadError(true);
      }
      setFeatures(
        carte.status === 'fulfilled' && Array.isArray(carte.value?.features)
          ? carte.value.features
          : []
      );
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Défilement vers l'ancre quand on arrive depuis une autre page (ex. /#securite)
  useEffect(() => {
    if (!location.hash) return;
    const id = decodeURIComponent(location.hash.slice(1));
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [location.hash]);

  const sorted = useMemo(
    () =>
      [...incidents].sort((a, b) => {
        const rank = SEVERITY_RANK[severityOf(a)] - SEVERITY_RANK[severityOf(b)];
        return rank !== 0 ? rank : incidentTime(b) - incidentTime(a);
      }),
    [incidents]
  );

  const counts = useMemo(() => {
    const c: Record<SeverityFilter, number> = { all: incidents.length, critique: 0, route_coupee: 0, vigilance: 0 };
    for (const incident of incidents) c[severityOf(incident)] += 1;
    return c;
  }, [incidents]);

  const shownAll = useCountUp(counts.all);
  const shownCritical = useCountUp(counts.critique);

  const lastUpdate = useMemo(() => {
    const latest = incidents.reduce<PublicIncident | null>(
      (best, inc) => (!best || incidentTime(inc) > incidentTime(best) ? inc : best),
      null
    );
    return latest ? formatRelativeTime(latest.maj_le || latest.cree_le) : '';
  }, [incidents]);

  const visible = useMemo(
    () => sorted.filter((inc) => filter === 'all' || severityOf(inc) === filter),
    [sorted, filter]
  );

  const points = useMemo<LandingMapPoint[]>(() => {
    const byId = new Map(incidents.map((inc) => [inc.id, inc]));
    const result: LandingMapPoint[] = [];
    for (const feature of features) {
      const id = feature.properties.id;
      const incident = id != null ? byId.get(id) : undefined;
      const coords = feature.geometry?.coordinates;
      if (!incident || !coords) continue;
      const severity = severityOf(incident);
      const [lon, lat] = coords;
      if (typeof lat !== 'number' || typeof lon !== 'number') continue;
      result.push({ id: incident.id, lat, lon, severity, title: incidentTitle(incident), commune: incident.commune });
    }
    return result;
  }, [features, incidents]);

  const handleSelectFromList = (id: number) => {
    setSelectedId(id);
    // Sur mobile la carte est au-dessus de la liste : on la ramène à l'écran
    if (window.matchMedia('(max-width: 979px)').matches) {
      mapZoneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleSelectFromMap = (id: number) => {
    setSelectedId(id);
    document
      .querySelector<HTMLElement>(`[data-incident-id="${id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const liveStatus = loading ? (
    <span>Chargement de la situation…</span>
  ) : loadError ? (
    <span>Situation indisponible pour le moment</span>
  ) : counts.all === 0 ? (
    <span>Aucun incident actif signalé aujourd&apos;hui</span>
  ) : (
    <>
      <span>
        <b className="font-mono">{shownAll}</b> incident{counts.all > 1 ? 's' : ''} actif
        {counts.all > 1 ? 's' : ''} aujourd&apos;hui
      </span>
      {counts.critique > 0 && (
        <>
          <span className="landing-live-sep" aria-hidden="true" />
          <span className="text-[#ffb4ad]">
            <b className="font-mono">{shownCritical}</b> critique{counts.critique > 1 ? 's' : ''}
          </span>
        </>
      )}
      {lastUpdate && (
        <>
          <span className="landing-live-sep hidden sm:block" aria-hidden="true" />
          <span className="hidden sm:inline">mis à jour {lastUpdate.toLowerCase()}</span>
        </>
      )}
    </>
  );

  return (
    <div className="oid-landing-page overflow-x-clip font-sans antialiased selection:bg-accent selection:text-white">
      <main id="contenu">
        {/* HERO */}
        <section className="landing-hero relative overflow-hidden text-white">
          <img src="/images/hero-abidjan.jpg" alt="" className="landing-cover-img landing-hero-photo" />
          <HeroWaves />

          <div className="relative z-10 mx-auto flex max-w-[1200px] 2xl:max-w-[1320px] flex-col gap-5 px-4 pb-[132px] pt-10 sm:gap-6 sm:px-6 sm:pb-[176px] sm:pt-[72px]">
            <div className="landing-live landing-rise" style={{ animationDelay: '0ms' }} role="status">
              <span
                className={`landing-live-dot ${loadError ? 'is-off' : ''}`}
                aria-hidden="true"
              />
              {liveStatus}
            </div>

            <h1 style={{ animationDelay: '80ms' }} className="landing-rise font-display max-w-[15ch] text-[34px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[48px] xl:text-[64px]">
              Signalez, alertez et protégez face aux{' '}
              <em className="landing-hero-em">montées des eaux</em>.
            </h1>

            <p style={{ animationDelay: '160ms' }} className="landing-rise max-w-[56ch] text-[15px] leading-[1.6] text-[var(--deep-tx-strong)] sm:text-[18px]">
              Suivez les incidents actifs commune par commune et sachez quoi faire. Un danger près
              de vous&nbsp;? Signalez-le en deux minutes, sans créer de compte.
            </p>

            <div style={{ animationDelay: '240ms' }} className="landing-rise grid max-w-[520px] grid-cols-2 gap-2.5 sm:flex sm:gap-3">
              <a
                href="#aujourdhui"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-3 text-[14px] font-bold text-[var(--deep)] transition-colors hover:bg-[var(--deep-tx-strong)] sm:h-[52px] sm:px-6 sm:text-[16px]"
              >
                Voir la carte
                <ArrowDown size={16} strokeWidth={2.6} className="landing-arrow-down" aria-hidden="true" />
              </a>
              <Link
                to="/signaler"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--emergency)] px-3 text-[14px] font-bold text-white transition-colors hover:bg-[var(--emergency-hover)] sm:h-[52px] sm:px-6 sm:text-[16px]"
              >
                Signaler un incident
              </Link>
            </div>

            <p style={{ animationDelay: '320ms' }} className="landing-rise text-[14px] text-[var(--deep-tx)]">
              Personne en danger&nbsp;? Appelez d&apos;abord les secours au{' '}
              <a href="tel:180" className="border-b border-white/40 font-bold text-white">
                180
              </a>
              .
            </p>
          </div>
        </section>

        {/* CARTE DES INCIDENTS DU JOUR */}
        <section
          id="aujourdhui"
          aria-labelledby="carte-titre"
          className="relative z-[2] -mt-[104px] sm:-mt-[132px]"
        >
          <div className="mx-auto max-w-[1200px] 2xl:max-w-[1320px] px-4 sm:px-6">
            <div className="landing-mapcard grid grid-cols-1 overflow-hidden rounded-[22px] border border-line bg-surface lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
              <div ref={mapZoneRef} className="relative min-w-0">
                <div
                  className="absolute left-3 right-3 top-3 z-[500] flex flex-wrap gap-1.5"
                  role="group"
                  aria-label="Filtrer par gravité"
                >
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      aria-pressed={filter === f.key}
                      onClick={() => setFilter(f.key)}
                      className="landing-chip"
                    >
                      {f.key !== 'all' && (
                        <i style={{ background: SEVERITY_DOT[f.key] }} aria-hidden="true" />
                      )}
                      {f.label}
                      <span className="font-mono text-[12px] opacity-70">{counts[f.key]}</span>
                    </button>
                  ))}
                </div>
                <LandingMap
                  points={points}
                  filter={filter}
                  selectedId={selectedId}
                  onSelect={handleSelectFromMap}
                />
              </div>

              <aside className="flex min-w-0 flex-col border-t border-line lg:border-l lg:border-t-0">
                <div className="flex flex-col gap-1 px-5 pb-3 pt-5">
                  <span className="text-[12px] font-bold uppercase tracking-[0.09em] text-[var(--water)]">
                    Situation terrain
                  </span>
                  <h2 id="carte-titre" className="font-display text-[22px] font-extrabold tracking-[-0.02em] text-ink">
                    Les incidents du jour
                  </h2>
                  <p className="text-[14px] text-ink2">Touchez un incident pour le repérer sur la carte.</p>
                </div>

                <div className="landing-list flex-1 px-2.5 pb-2">
                  {loading ? (
                    [1, 2, 3].map((n) => (
                      <div key={n} className="mx-2.5 my-2 h-[62px] animate-pulse rounded-xl bg-[var(--s2)]" />
                    ))
                  ) : loadError ? (
                    <div className="px-2.5 py-4">
                      <p className="font-bold text-ink">Impossible de charger les incidents</p>
                      <p className="mt-1 text-[14px] text-ink2">
                        Réessayez dans quelques instants ou ouvrez la page de consultation.
                      </p>
                    </div>
                  ) : visible.length === 0 ? (
                    <div className="px-2.5 py-4">
                      <p className="font-bold text-ink">
                        {incidents.length === 0
                          ? "Aucun incident actif signalé aujourd'hui"
                          : 'Aucun incident de ce niveau aujourd’hui'}
                      </p>
                      <p className="mt-1 text-[14px] text-ink2">
                        Consultez les jours précédents ou signalez un nouvel incident.
                      </p>
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {visible.slice(0, LIST_LIMIT).map((incident) => {
                        const sev = severityOf(incident);
                        const meta = SEVERITY_META[sev];
                        const detail = incidentDetail(incident);
                        const selected = incident.id === selectedId;
                        return (
                          <li key={incident.id} data-incident-id={incident.id}>
                            <div className={`landing-item ${selected ? 'is-selected' : ''}`}>
                              <button
                                type="button"
                                onClick={() => handleSelectFromList(incident.id)}
                                onMouseEnter={() => setSelectedId(incident.id)}
                                aria-pressed={selected}
                                className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 text-left"
                              >
                                <span
                                  className="mt-1.5 h-2.5 w-2.5 rounded-full"
                                  style={{ background: SEVERITY_DOT[sev] }}
                                  aria-hidden="true"
                                />
                                <span className="min-w-0">
                                  <span className="block text-[15px] font-bold tracking-[-0.01em] text-ink">
                                    {incidentTitle(incident)} · {incident.commune}
                                  </span>
                                  {detail && <span className="block truncate text-[13px] text-ink2">{detail}</span>}
                                  <span className="mt-0.5 block text-[12px] text-ink3">
                                    {formatRelativeTime(incident.maj_le || incident.cree_le)}
                                  </span>
                                </span>
                                <span
                                  className="whitespace-nowrap rounded-md px-2 py-[3px] text-[11px] font-bold uppercase tracking-[0.06em]"
                                  style={{ background: meta.bg, color: meta.fg }}
                                >
                                  {incident.danger_immediat ? 'Danger' : meta.label}
                                </span>
                              </button>
                              {selected && (
                                <Link
                                  to={`/consulter?commune=${encodeURIComponent(incident.commune)}&incident=${incident.id}&vue=carte`}
                                  className="group ml-[22px] mt-2 inline-flex items-center gap-1 text-[13px] font-bold text-[var(--water)] hover:underline"
                                >
                                  Voir le détail <ArrowRight size={14} className="landing-arrow" aria-hidden="true" />
                                </Link>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="px-5 pb-5 pt-3">
                  <Link
                    to="/consulter"
                    className="group flex h-12 items-center justify-center gap-2 rounded-xl border border-line2 text-[15px] font-bold text-ink transition-colors hover:bg-[var(--s2)]"
                  >
                    {visible.length > LIST_LIMIT
                      ? `Voir les ${visible.length} incidents`
                      : 'Consulter tous les incidents'}
                    <ArrowRight size={16} className="landing-arrow" aria-hidden="true" />
                  </Link>
                </div>
              </aside>
            </div>
          </div>
        </section>

        {/* SIGNALER : TYPES + ÉTAPES */}
        <section id="quoi" aria-labelledby="signaler-titre" className="py-[72px] sm:py-[104px]">
          <div className="mx-auto max-w-[1200px] 2xl:max-w-[1320px] px-4 sm:px-6">
            <div className="mb-9 flex max-w-[640px] flex-col gap-2.5">
              <span className="text-[12px] font-bold uppercase tracking-[0.09em] text-[var(--water)]">
                Signaler
              </span>
              <h2
                id="signaler-titre"
                className="font-display text-[28px] font-extrabold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[42px]"
              >
                Vous voyez de l&apos;eau là où elle ne devrait pas être&nbsp;?
              </h2>
              <p className="text-[16px] text-ink2 sm:text-[17px]">
                Choisissez la situation. Le signalement part aux agents municipaux et aux secours.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-7">
              <div className="grid grid-cols-1 content-start gap-2.5 sm:grid-cols-2">
                {REPORT_TYPES.map((type) => (
                  <Link key={type.to} to={type.to} className="landing-type group">
                    <span className="flex h-[42px] w-[42px] items-center justify-center rounded-[11px] bg-[var(--water-soft)] text-[var(--water)]">
                      <Icon>{type.icon}</Icon>
                    </span>
                    <span className="text-[15px] font-bold leading-[1.3] text-ink">{type.title}</span>
                    <span className="text-[13px] leading-[1.45] text-ink2">{type.text}</span>
                    <span className="mt-auto text-[13px] font-bold text-[var(--water)] group-hover:underline">
                      Signaler <span className="landing-arrow" aria-hidden="true">→</span>
                    </span>
                  </Link>
                ))}

                <a
                  href="tel:180"
                  className="group flex flex-col gap-2.5 rounded-2xl border border-[var(--emergency-soft-line)] bg-[var(--emergency-soft)] p-[18px] text-[var(--emergency-soft-tx)]"
                >
                  <span className="flex h-[42px] w-[42px] items-center justify-center rounded-[11px] bg-white text-[var(--emergency)]">
                    <Icon>
                      <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                    </Icon>
                  </span>
                  <span className="text-[15px] font-bold leading-[1.3]">Une personne en danger</span>
                  <span className="text-[13px] leading-[1.45]">
                    Personne isolée, risque électrique, bâtiment menaçant. Ne passez pas par le
                    formulaire.
                  </span>
                  <span className="mt-auto text-[13px] font-bold">
                    Appeler le 180 <span className="landing-arrow" aria-hidden="true">→</span>
                  </span>
                </a>

                <p className="px-0.5 pt-1 text-[13px] text-ink3 sm:col-span-2">
                  <b className="text-ink2">Pas ici&nbsp;:</b> {OUT_OF_SCOPE}
                </p>
              </div>

              <div id="etapes" className="flex flex-col gap-6 rounded-[22px] bg-[var(--deep)] p-6 text-white sm:p-9">
                <div>
                  <h3 className="font-display text-[20px] font-extrabold">Comment ça se passe</h3>
                  <p className="text-[13px] text-[var(--deep-accent)]">Environ 2 minutes, sans compte</p>
                </div>

                <ol ref={stepsRef} className="landing-steps">
                  <li>
                    <span className="landing-step-n">1</span>
                    <div>
                      <b>On vous localise</b>
                      <p>Votre position GPS est détectée. Déplacez le repère si besoin.</p>
                    </div>
                  </li>
                  <li>
                    <span className="landing-step-n">2</span>
                    <div>
                      <b>Vous décrivez ce que vous voyez</b>
                      <p>Une photo, un repère visuel (carrefour, concession) et la hauteur d&apos;eau&nbsp;:</p>
                      <div
                        ref={gaugesRef}
                        className={`landing-gauges is-${gaugesState} mt-3.5 grid grid-cols-3 gap-2`}
                        aria-label="Échelle de hauteur d'eau"
                      >
                        {WATER_LEVELS.map((level, index) => (
                          <div key={level.label} className="landing-level">
                            <svg viewBox="0 0 60 80" aria-hidden="true">
                              <rect
                                x="0"
                                y={80 - level.fill}
                                width="60"
                                height={level.fill}
                                rx="3"
                                className={`landing-level-water ${level.danger ? 'is-danger' : ''}`}
                                style={{ transitionDelay: `${index * 220}ms` }}
                              />
                              <path d="M26 10h8v54h6v6H24z" fill="var(--deep-tx-strong)" />
                            </svg>
                            <b>{level.label}</b>
                            <small className="font-mono">{level.depth}</small>
                          </div>
                        ))}
                      </div>
                    </div>
                  </li>
                  <li>
                    <span className="landing-step-n">3</span>
                    <div>
                      <b>Les équipes prennent le relais</b>
                      <p>
                        Votre alerte part aux agents et aux secours, puis apparaît sur la carte une
                        fois validée.
                      </p>
                    </div>
                  </li>
                </ol>

                <Link
                  to="/signaler"
                  className="inline-flex h-[52px] items-center justify-center rounded-xl bg-[var(--emergency)] px-6 text-[15px] font-bold text-white transition-colors hover:bg-[var(--emergency-hover)]"
                >
                  Commencer mon signalement
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* SÉCURITÉ */}
        <section id="securite" aria-labelledby="securite-titre" className="bg-[var(--deep)] text-white">
          <div className="mx-auto grid max-w-[1200px] 2xl:max-w-[1320px] grid-cols-1 gap-7 px-4 py-[72px] sm:px-6 sm:py-[104px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start lg:gap-14">
            <div>
              <span className="text-[12px] font-bold uppercase tracking-[0.09em] text-[var(--deep-accent)]">
                Sécurité
              </span>
              <h2
                id="securite-titre"
                className="font-display mt-2.5 text-[28px] font-extrabold leading-[1.1] tracking-[-0.025em] sm:text-[42px]"
              >
                L&apos;eau monte près de vous&nbsp;?
              </h2>
              <p className="mt-3 max-w-[44ch] text-[var(--deep-tx)]">
                Les bons réflexes, au bon moment. Et si une vie est en jeu, appelez avant tout.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-2.5">
                <a href="tel:180" className="landing-num is-red">
                  <strong className="font-mono">180</strong>
                  <span>Sapeurs-pompiers (GSPM)</span>
                </a>
                <a href="tel:112" className="landing-num">
                  <strong className="font-mono">112</strong>
                  <span>Secours &amp; urgences</span>
                </a>
              </div>
            </div>

            <div ref={tipsRef} className={`landing-tips is-${tipsState}`}>
              {SAFETY_TIPS.map((tip, index) => (
                <div
                  key={tip.title}
                  className="landing-tip"
                  style={{ animationDelay: `${index * 110}ms` }}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[rgba(88,166,255,0.14)] text-[#58a6ff]">
                    <Icon>{tip.icon}</Icon>
                  </span>
                  <div>
                    <span className="landing-tip-when font-mono">{tip.when}</span>
                    <b className="text-[16px]">{tip.title}</b>
                    <p className="mt-1 text-[14px] text-[var(--deep-tx)]">{tip.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
