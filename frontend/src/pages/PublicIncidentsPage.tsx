import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  List,
  Map as MapIcon,
  MapPin,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { apiFetch, apiUrl } from '../api/client';
import { PublicIncidentCard, type PublicIncident } from '../components/PublicIncidentCard';
import {
  INCIDENT_FIABILITE_LABELS,
  INCIDENT_STATUT_LABELS,
  INCIDENT_TYPE_LABELS,
  formatRelativeTime,
} from '../components/incidentLabels';
import { SEVERITY_META, severityOf, type Severity } from '../components/landing/severity';

type SeverityFilter = Severity | 'all';
type ViewMode = 'split' | 'list' | 'map';

interface CommuneSummary {
  id: number;
  nom: string;
  code_adm?: string;
  incidents_jour: number;
}

interface PublicMapFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    type: string;
    statut: string;
    danger_immediat: boolean;
    categorie: 'critique' | 'vigilance' | 'route_coupee';
    commune: string;
    niveau_fiabilite?: string;
    cree_le?: string | null;
  };
}

interface CartePubliqueResponse {
  type: 'FeatureCollection';
  features: PublicMapFeature[];
  counts?: {
    critique: number;
    vigilance: number;
    route_coupee: number;
    total: number;
  };
}

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: any;
    properties?: Record<string, any>;
  }>;
}

interface LightboxState {
  photos: string[];
  index: number;
  title: string;
}

const ABIDJAN_CENTER: [number, number] = [5.3484, -4.0244];

const SEVERITY_RANK: Record<Severity, number> = {
  critique: 0,
  route_coupee: 1,
  vigilance: 2,
};

const SEVERITY_OPTIONS: Array<{ value: SeverityFilter; label: string }> = [
  { value: 'all', label: 'Toutes' },
  { value: 'critique', label: SEVERITY_META.critique.label },
  { value: 'route_coupee', label: SEVERITY_META.route_coupee.label },
  { value: 'vigilance', label: SEVERITY_META.vigilance.label },
];

const MARKER_COLORS: Record<Severity, string> = {
  critique: '#b3261e',
  route_coupee: '#b45309',
  vigilance: '#0b5fc4',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getCommunePropName(properties?: Record<string, any>): string {
  if (!properties) return '';
  const raw = properties.nom || properties.commune || properties.name || properties.NOM || '';
  return typeof raw === 'string' ? raw.trim() : '';
}

function isSameUtcDate(isoDate: string | null | undefined, utcDateStr: string): boolean {
  if (!isoDate) return false;
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === utcDateStr;
}

function featureSeverity(props: PublicMapFeature['properties']): Severity {
  if (props.danger_immediat || props.categorie === 'critique') return 'critique';
  if (props.categorie === 'route_coupee') return 'route_coupee';
  return 'vigilance';
}

export const PublicIncidentsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCommune = searchParams.get('commune') || 'all';
  const initialPeriod = searchParams.get('periode') !== 'tous';

  const [todayOnly, setTodayOnly] = useState<boolean>(initialPeriod);
  const [communeFilter, setCommuneFilter] = useState<string>(initialCommune);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [refreshTick, setRefreshTick] = useState<number>(0);

  const [incidents, setIncidents] = useState<PublicIncident[]>([]);
  const [apiTotal, setApiTotal] = useState<number>(0);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [listError, setListError] = useState<boolean>(false);

  const [communesList, setCommunesList] = useState<CommuneSummary[]>([]);
  const [mapFeatures, setMapFeatures] = useState<PublicMapFeature[]>([]);
  const [communesGeoJson, setCommunesGeoJson] = useState<GeoJsonFeatureCollection | null>(null);
  const [loadingMap, setLoadingMap] = useState<boolean>(true);

  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const communesLayerRef = useRef<L.GeoJSON | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const syncUrlParams = useCallback(
    (nextCommune: string, nextTodayOnly: boolean) => {
      const params = new URLSearchParams();
      if (nextCommune !== 'all') params.set('commune', nextCommune);
      if (!nextTodayOnly) params.set('periode', 'tous');
      setSearchParams(params, { replace: true });
    },
    [setSearchParams]
  );

  // Chargement des incidents filtrés par période (aujourd'hui vs tous actifs)
  useEffect(() => {
    let mounted = true;
    setLoadingList(true);

    apiFetch<{ items: PublicIncident[]; total: number }>(
      `/signalements/recents?limit=30&today_only=${todayOnly}`
    )
      .then((data) => {
        if (!mounted) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setIncidents(items);
        setApiTotal(typeof data?.total === 'number' ? data.total : items.length);
        setListError(false);
      })
      .catch(() => {
        if (!mounted) return;
        setIncidents([]);
        setApiTotal(0);
        setListError(true);
      })
      .finally(() => {
        if (mounted) setLoadingList(false);
      });

    return () => {
      mounted = false;
    };
  }, [todayOnly, refreshTick]);

  // Chargement des communes et des points/limites pour la carte publique
  useEffect(() => {
    let mounted = true;
    setLoadingMap(true);

    Promise.allSettled([
      apiFetch<CartePubliqueResponse>('/signalements/carte-publique'),
      apiFetch<{ communes: CommuneSummary[] }>('/signalements/communes-actives'),
      apiFetch<GeoJsonFeatureCollection>('/signalements/communes'),
    ])
      .then(([carteRes, communesRes, geoRes]) => {
        if (!mounted) return;
        if (carteRes.status === 'fulfilled') {
          setMapFeatures(
            Array.isArray(carteRes.value?.features) ? carteRes.value.features : []
          );
        } else {
          setMapFeatures([]);
        }
        if (communesRes.status === 'fulfilled') {
          setCommunesList(
            Array.isArray(communesRes.value?.communes) ? communesRes.value.communes : []
          );
        }
        if (geoRes.status === 'fulfilled' && geoRes.value?.type === 'FeatureCollection') {
          setCommunesGeoJson(geoRes.value);
        }
      })
      .finally(() => {
        if (mounted) setLoadingMap(false);
      });

    return () => {
      mounted = false;
    };
  }, [refreshTick]);

  // Fermeture clavier de la visionneuse photo
  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightbox(null);
      } else if (event.key === 'ArrowRight' && lightbox.photos.length > 1) {
        setLightbox((prev) =>
          prev ? { ...prev, index: (prev.index + 1) % prev.photos.length } : null
        );
      } else if (event.key === 'ArrowLeft' && lightbox.photos.length > 1) {
        setLightbox((prev) =>
          prev
            ? {
                ...prev,
                index: (prev.index - 1 + prev.photos.length) % prev.photos.length,
              }
            : null
        );
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightbox]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const matchesSearch = useCallback(
    (incident: PublicIncident): boolean => {
      if (!normalizedQuery) return true;
      const typeLabel = (INCIDENT_TYPE_LABELS[incident.type] || incident.type).toLowerCase();
      const statutLabel = (
        INCIDENT_STATUT_LABELS[incident.statut]?.label || incident.statut
      ).toLowerCase();
      return (
        incident.commune.toLowerCase().includes(normalizedQuery) ||
        typeLabel.includes(normalizedQuery) ||
        statutLabel.includes(normalizedQuery) ||
        (incident.routes_coupees || '').toLowerCase().includes(normalizedQuery) ||
        (incident.degats || '').toLowerCase().includes(normalizedQuery) ||
        (incident.risques_sanitaires || '').toLowerCase().includes(normalizedQuery)
      );
    },
    [normalizedQuery]
  );

  // Options de communes fusionnant les 13 communes d'Abidjan et les comptes filtrés
  const communeOptions = useMemo(() => {
    const base = incidents.filter(
      (incident) =>
        (severityFilter === 'all' || severityOf(incident) === severityFilter) &&
        matchesSearch(incident)
    );
    const counts = new Map<string, number>();

    for (const commune of communesList) {
      if (commune.nom) counts.set(commune.nom, 0);
    }
    for (const incident of base) {
      counts.set(incident.commune, (counts.get(incident.commune) || 0) + 1);
    }

    const items = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        if ((b.count > 0 ? 1 : 0) !== (a.count > 0 ? 1 : 0)) {
          return (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0);
        }
        return b.count - a.count || a.name.localeCompare(b.name, 'fr');
      });

    return { total: base.length, items };
  }, [incidents, communesList, severityFilter, matchesSearch]);

  const severityCounts = useMemo(() => {
    const base = incidents.filter(
      (incident) =>
        (communeFilter === 'all' || incident.commune === communeFilter) &&
        matchesSearch(incident)
    );
    return {
      all: base.length,
      critique: base.filter((incident) => severityOf(incident) === 'critique').length,
      route_coupee: base.filter((incident) => severityOf(incident) === 'route_coupee')
        .length,
      vigilance: base.filter((incident) => severityOf(incident) === 'vigilance').length,
    };
  }, [incidents, communeFilter, matchesSearch]);

  const filteredIncidents = useMemo(() => {
    const list = incidents.filter(
      (incident) =>
        (communeFilter === 'all' || incident.commune === communeFilter) &&
        (severityFilter === 'all' || severityOf(incident) === severityFilter) &&
        matchesSearch(incident)
    );

    return [...list].sort((a, b) => {
      const rankDiff = SEVERITY_RANK[severityOf(a)] - SEVERITY_RANK[severityOf(b)];
      if (rankDiff !== 0) return rankDiff;
      const ta = new Date(a.maj_le || a.cree_le || 0).getTime();
      const tb = new Date(b.maj_le || b.cree_le || 0).getTime();
      return tb - ta;
    });
  }, [incidents, communeFilter, severityFilter, matchesSearch]);

  const todayUtcStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const filteredMapFeatures = useMemo(() => {
    return mapFeatures.filter((feature) => {
      const props = feature.properties;
      if (communeFilter !== 'all' && props.commune !== communeFilter) return false;
      const sev = featureSeverity(props);
      if (severityFilter !== 'all' && sev !== severityFilter) return false;
      if (todayOnly && props.cree_le && !isSameUtcDate(props.cree_le, todayUtcStr)) {
        return false;
      }
      if (normalizedQuery) {
        const typeLabel = (INCIDENT_TYPE_LABELS[props.type] || props.type).toLowerCase();
        const statutLabel = (
          INCIDENT_STATUT_LABELS[props.statut]?.label || props.statut
        ).toLowerCase();
        const communeLower = (props.commune || '').toLowerCase();
        if (
          !communeLower.includes(normalizedQuery) &&
          !typeLabel.includes(normalizedQuery) &&
          !statutLabel.includes(normalizedQuery)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [mapFeatures, communeFilter, severityFilter, todayOnly, todayUtcStr, normalizedQuery]);

  // Initialisation / destruction de la carte Leaflet selon viewMode
  useEffect(() => {
    if (viewMode === 'list' || !mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: ABIDJAN_CENTER,
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const communesLayer = L.geoJSON(undefined).addTo(map);
    const markersLayer = L.layerGroup().addTo(map);

    mapRef.current = map;
    communesLayerRef.current = communesLayer;
    markersLayerRef.current = markersLayer;

    return () => {
      map.remove();
      mapRef.current = null;
      communesLayerRef.current = null;
      markersLayerRef.current = null;
    };
  }, [viewMode]);

  // Recalcule la taille Leaflet quand la disposition change (split <-> map)
  useEffect(() => {
    if (viewMode === 'list' || !mapRef.current) return;
    const timer = window.setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [viewMode]);

  // Mise à jour des polygones de communes + marqueurs filtrés sur la carte
  useEffect(() => {
    const map = mapRef.current;
    const communesLayer = communesLayerRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !communesLayer || !markersLayer || viewMode === 'list') return;

    communesLayer.clearLayers();
    let selectedCommuneBounds: L.LatLngBounds | null = null;

    if (communesGeoJson) {
      const geo = L.geoJSON(communesGeoJson as any, {
        style: (feature) => {
          const name = getCommunePropName(feature?.properties);
          const isSelected = communeFilter !== 'all' && name === communeFilter;
          return {
            color: isSelected ? '#0b5fc4' : '#64748b',
            weight: isSelected ? 2.5 : 1,
            opacity: isSelected ? 0.95 : 0.45,
            fillColor: isSelected ? '#0b5fc4' : '#94a3b8',
            fillOpacity: isSelected ? 0.14 : 0.04,
          };
        },
        onEachFeature: (feature, layer) => {
          const name = getCommunePropName(feature?.properties);
          if (!name) return;
          layer.bindTooltip(name, { sticky: true, direction: 'center' });
          layer.on('click', () => {
            setCommuneFilter((prev) => {
              const next = prev === name ? 'all' : name;
              syncUrlParams(next, todayOnly);
              return next;
            });
          });
          if (communeFilter !== 'all' && name === communeFilter && 'getBounds' in layer) {
            try {
              selectedCommuneBounds = (layer as L.Polygon).getBounds();
            } catch {
              selectedCommuneBounds = null;
            }
          }
        },
      });
      geo.eachLayer((layer) => communesLayer.addLayer(layer));
    }

    markersLayer.clearLayers();
    const pointBounds = L.latLngBounds([]);

    for (const feature of filteredMapFeatures) {
      const coords = feature.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const [lon, lat] = coords;
      if (typeof lat !== 'number' || typeof lon !== 'number') continue;

      const props = feature.properties;
      const sev = featureSeverity(props);
      const color = MARKER_COLORS[sev];
      const radius = sev === 'critique' ? 9 : sev === 'route_coupee' ? 8 : 7;

      const typeLabel = INCIDENT_TYPE_LABELS[props.type] || props.type;
      const statutLabel = INCIDENT_STATUT_LABELS[props.statut]?.label || props.statut;
      const sevLabel = props.danger_immediat
        ? 'Danger immédiat'
        : SEVERITY_META[sev].label;
      const fiabLabel = props.niveau_fiabilite
        ? INCIDENT_FIABILITE_LABELS[props.niveau_fiabilite] || props.niveau_fiabilite
        : '';
      const relative = props.cree_le ? formatRelativeTime(props.cree_le) : '';

      const popupHtml = `
        <div class="oid-map-popup">
          <div class="oid-map-popup-badge" style="color:${color}">${escapeHtml(sevLabel)}</div>
          <div class="oid-map-popup-title">${escapeHtml(typeLabel)}</div>
          <div class="oid-map-popup-meta">
            <strong>${escapeHtml(props.commune)}</strong>${relative ? ` · ${escapeHtml(relative)}` : ''}
          </div>
          <div class="oid-map-popup-foot">
            <span>Statut : ${escapeHtml(statutLabel)}</span>
            ${fiabLabel ? `<span>Fiabilité : ${escapeHtml(fiabLabel)}</span>` : ''}
          </div>
        </div>
      `;

      const marker = L.circleMarker([lat, lon], {
        radius,
        color: '#ffffff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.92,
      });

      marker.bindPopup(popupHtml);
      marker.addTo(markersLayer);
      pointBounds.extend([lat, lon]);
    }

    if (selectedCommuneBounds && (selectedCommuneBounds as L.LatLngBounds).isValid()) {
      map.fitBounds(selectedCommuneBounds, { padding: [24, 24], maxZoom: 14 });
    } else if (pointBounds.isValid()) {
      map.fitBounds(pointBounds, { padding: [32, 32], maxZoom: 14 });
    } else {
      map.setView(ABIDJAN_CENTER, 12);
    }
  }, [
    communesGeoJson,
    filteredMapFeatures,
    communeFilter,
    viewMode,
    todayOnly,
    syncUrlParams,
  ]);

  const handleCommuneSelect = (commune: string) => {
    setCommuneFilter(commune);
    syncUrlParams(commune, todayOnly);
  };

  const handlePeriodChange = (nextTodayOnly: boolean) => {
    setTodayOnly(nextTodayOnly);
    syncUrlParams(communeFilter, nextTodayOnly);
  };

  const handleResetFilters = () => {
    setCommuneFilter('all');
    setSeverityFilter('all');
    setSearchQuery('');
    syncUrlParams('all', todayOnly);
  };

  const handleOpenPhoto = (photos: string[], index: number, title: string) => {
    setLightbox({ photos, index, title });
  };

  const hasActiveFilters =
    communeFilter !== 'all' || severityFilter !== 'all' || searchQuery.trim().length > 0;

  return (
    <div className="oid-report-page oid-consulter-page">
      <div className="oid-consulter-container">
        {/* En-tête de la page Consulter */}
        <header className="oid-consulter-hero">
          <div className="oid-consulter-hero-top">
            <div>
              <span className="oid-consulter-eyebrow">
                <MapPin size={14} aria-hidden="true" />
                District d&apos;Abidjan · Veille citoyenne
              </span>
              <h1 className="oid-consulter-title">
                {todayOnly ? 'Les incidents du jour' : 'Tous les incidents actifs'}
              </h1>
              <p className="oid-consulter-subtitle">
                Filtrez par commune ou par gravité, localisez les axes coupés et cliquez sur un
                incident pour consulter son suivi.
              </p>
            </div>

            <div className="oid-consulter-hero-controls">
              <div className="oid-consulter-segmented" role="group" aria-label="Période">
                <button
                  type="button"
                  onClick={() => handlePeriodChange(true)}
                  aria-pressed={todayOnly}
                  className={`oid-consulter-seg-btn ${todayOnly ? 'is-active' : ''}`}
                >
                  Aujourd&apos;hui
                </button>
                <button
                  type="button"
                  onClick={() => handlePeriodChange(false)}
                  aria-pressed={!todayOnly}
                  className={`oid-consulter-seg-btn ${!todayOnly ? 'is-active' : ''}`}
                >
                  Tous actifs
                </button>
              </div>

              <button
                type="button"
                onClick={() => setRefreshTick((t) => t + 1)}
                className="oid-consulter-refresh-btn"
                aria-label="Actualiser les incidents"
                title="Actualiser"
              >
                <RefreshCw
                  size={15}
                  className={loadingList || loadingMap ? 'animate-spin' : ''}
                  aria-hidden="true"
                />
                <span>Actualiser</span>
              </button>
            </div>
          </div>

          <div className="oid-consulter-stats-row">
            <div className="oid-consulter-stat-pill">
              <strong className="font-mono">{filteredIncidents.length}</strong>
              <span>
                affiché{filteredIncidents.length > 1 ? 's' : ''}
                {apiTotal > incidents.length ? ` sur ${apiTotal}` : ''}
              </span>
            </div>
            <div className="oid-consulter-stat-pill is-crit">
              <strong className="font-mono">{severityCounts.critique}</strong>
              <span>Critique{severityCounts.critique > 1 ? 's' : ''}</span>
            </div>
            <div className="oid-consulter-stat-pill is-warn">
              <strong className="font-mono">{severityCounts.route_coupee}</strong>
              <span>Route{severityCounts.route_coupee > 1 ? 's' : ''} coupée{severityCounts.route_coupee > 1 ? 's' : ''}</span>
            </div>
            <div className="oid-consulter-stat-pill is-vig">
              <strong className="font-mono">{severityCounts.vigilance}</strong>
              <span>Vigilance</span>
            </div>

            <div className="oid-consulter-view-switch" role="group" aria-label="Affichage">
              <button
                type="button"
                onClick={() => setViewMode('split')}
                aria-pressed={viewMode === 'split'}
                className={`oid-consulter-view-btn ${viewMode === 'split' ? 'is-active' : ''}`}
              >
                Liste + Carte
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
                className={`oid-consulter-view-btn ${viewMode === 'list' ? 'is-active' : ''}`}
              >
                <List size={14} aria-hidden="true" />
                <span>Liste</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('map')}
                aria-pressed={viewMode === 'map'}
                className={`oid-consulter-view-btn ${viewMode === 'map' ? 'is-active' : ''}`}
              >
                <MapIcon size={14} aria-hidden="true" />
                <span>Carte</span>
              </button>
            </div>
          </div>
        </header>

        {/* Barre de recherche & Filtres Commune / Gravité sur une ligne */}
        <section className="oid-consulter-filters" aria-label="Filtres des incidents">
          <div className="oid-consulter-search-row">
            <div className="oid-consulter-search-wrap">
              <Search size={16} className="oid-consulter-search-icon" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher par commune, type d'incident, route coupée..."
                className="oid-consulter-search-input"
                aria-label="Rechercher un incident"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="oid-consulter-search-clear"
                  aria-label="Effacer la recherche"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="oid-consulter-select-wrap">
              <select
                value={communeFilter}
                onChange={(e) => handleCommuneSelect(e.target.value)}
                aria-label="Filtrer par commune"
                className="oid-consulter-select"
              >
                <option value="all">Toutes les communes ({communeOptions.total})</option>
                {communeOptions.items.map((commune) => (
                  <option key={commune.name} value={commune.name}>
                    {commune.name} ({commune.count})
                  </option>
                ))}
              </select>
            </div>

            <div className="oid-consulter-select-wrap">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
                aria-label="Filtrer par gravité"
                className="oid-consulter-select"
              >
                {SEVERITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value === 'all'
                      ? `Toutes gravités (${severityCounts.all})`
                      : `${option.label} (${severityCounts[option.value]})`}
                  </option>
                ))}
              </select>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="oid-consulter-reset-btn"
              >
                <RotateCcw size={14} aria-hidden="true" />
                <span>Réinitialiser</span>
              </button>
            )}
          </div>
        </section>

        {/* Contenu principal : Liste accordéon + Carte publique */}
        <div
          className={`oid-consulter-workspace ${
            viewMode === 'split'
              ? 'is-split'
              : viewMode === 'map'
              ? 'is-map-only'
              : 'is-list-only'
          }`}
        >
          {viewMode !== 'map' && (
            <section className="oid-consulter-list-col" aria-label="Liste des incidents">
              {loadingList ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((item) => (
                    <div
                      key={item}
                      className="h-[96px] animate-pulse rounded-2xl border border-line bg-surface"
                    />
                  ))}
                </div>
              ) : listError ? (
                <div className="rounded-2xl border border-line bg-surface p-8 text-center space-y-3">
                  <AlertTriangle
                    size={28}
                    className="mx-auto text-[var(--crit)]"
                    aria-hidden="true"
                  />
                  <p className="text-base font-bold text-ink">
                    Impossible de charger les incidents
                  </p>
                  <p className="text-sm text-ink2">
                    Vérifiez votre connexion et réessayez dans un instant.
                  </p>
                  <button
                    type="button"
                    onClick={() => setRefreshTick((t) => t + 1)}
                    className="oid-consulter-empty-btn"
                  >
                    Réessayer
                  </button>
                </div>
              ) : filteredIncidents.length === 0 ? (
                <div className="rounded-2xl border border-line bg-surface p-8 text-center space-y-3">
                  <ShieldAlert
                    size={28}
                    className="mx-auto text-[var(--water)]"
                    aria-hidden="true"
                  />
                  <p className="text-base font-bold text-ink">
                    {communeFilter !== 'all'
                      ? `Aucun incident affiché à ${communeFilter}`
                      : todayOnly
                      ? "Aucun incident actif signalé aujourd'hui"
                      : 'Aucun incident actif correspondant'}
                  </p>
                  <p className="text-sm text-ink2">
                    {hasActiveFilters
                      ? 'Modifiez ou réinitialisez vos filtres pour élargir la recherche.'
                      : todayOnly
                      ? 'Vous pouvez afficher tous les incidents encore en cours sur les jours précédents.'
                      : 'La situation est actuellement calme dans les communes suivies.'}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="oid-consulter-empty-btn"
                      >
                        Voir toutes les communes
                      </button>
                    )}
                    {todayOnly && (
                      <button
                        type="button"
                        onClick={() => handlePeriodChange(false)}
                        className="oid-consulter-empty-btn is-primary"
                      >
                        Voir tous les incidents actifs
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredIncidents.map((incident) => (
                    <PublicIncidentCard
                      key={incident.id}
                      incident={incident}
                      defaultExpanded={false}
                      onOpenPhoto={handleOpenPhoto}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {viewMode !== 'list' && (
            <aside className="oid-consulter-map-col" aria-label="Carte des incidents">
              <div className="oid-consulter-map-card">
                <div className="oid-consulter-map-head">
                  <div>
                    <h2 className="oid-consulter-map-title">Carte publique</h2>
                    <p className="oid-consulter-map-caption">
                      {filteredMapFeatures.length} point
                      {filteredMapFeatures.length > 1 ? 's' : ''} localisé
                      {filteredMapFeatures.length > 1 ? 's' : ''}
                      {communeFilter !== 'all' ? ` · ${communeFilter}` : ' · Cliquez une commune pour filtrer'}
                    </p>
                  </div>
                </div>

                <div
                  ref={mapContainerRef}
                  className={`oid-consulter-leaflet ${viewMode === 'map' ? 'is-tall' : ''}`}
                />

                <div className="oid-consulter-map-legend">
                  <span className="oid-consulter-legend-item">
                    <span className="oid-consulter-dot is-crit" aria-hidden="true" />
                    Danger / Critique
                  </span>
                  <span className="oid-consulter-legend-item">
                    <span className="oid-consulter-dot is-warn" aria-hidden="true" />
                    Route coupée
                  </span>
                  <span className="oid-consulter-legend-item">
                    <span className="oid-consulter-dot is-vig" aria-hidden="true" />
                    Vigilance
                  </span>
                </div>
              </div>
            </aside>
          )}
        </div>

        {/* Passerelle vers /signaler */}
        <section className="oid-consulter-cta-banner">
          <div>
            <h2 className="oid-consulter-cta-title">
              {communeFilter !== 'all'
                ? `Un incident non listé à ${communeFilter} ?`
                : 'Un incident non listé dans votre quartier ?'}
            </h2>
            <p className="oid-consulter-cta-text">
              Votre signalement aide les équipes municipales à localiser rapidement les rues
              inondées et les urgences.
            </p>
          </div>
          <Link to="/signaler" className="oid-consulter-cta-btn">
            <PlusCircle size={17} aria-hidden="true" />
            <span>Signaler maintenant</span>
          </Link>
        </section>
      </div>

      {/* Visionneuse photo */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm"
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
                    setLightbox((prev) =>
                      prev
                        ? {
                            ...prev,
                            index: (prev.index - 1 + prev.photos.length) % prev.photos.length,
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
                    setLightbox((prev) =>
                      prev ? { ...prev, index: (prev.index + 1) % prev.photos.length } : null
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
    </div>
  );
};

