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
  PlusCircle,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  ShieldAlert,
  X,
} from 'lucide-react';
import { apiFetch, apiUrl } from '../api/client';
import { PublicIncidentCard, type PublicIncident } from '../components/PublicIncidentCard';
import { Pagination } from '../components/Pagination';
import {
  INCIDENT_FIABILITE_LABELS,
  INCIDENT_STATUT_LABELS,
  INCIDENT_TYPE_LABELS,
  formatRelativeTime,
} from '../components/incidentLabels';
import { SEVERITY_META, severityOf, type Severity } from '../components/landing/severity';

const PAGE_SIZE = 10;
const FETCH_LIMIT = 30;

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
    id?: number;
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

type SortMode = 'gravite' | 'recent' | 'ancien' | 'proche';

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'gravite', label: 'Gravité' },
  { value: 'recent', label: 'Plus récents' },
  { value: 'ancien', label: 'Plus anciens' },
  { value: 'proche', label: 'Plus proches de moi' },
];

function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

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

function communeStyle(isSelected: boolean): L.PathOptions {
  return {
    className: 'oid-commune-poly',
    color: isSelected ? '#0b5fc4' : '#64748b',
    weight: isSelected ? 2.5 : 1,
    opacity: isSelected ? 0.95 : 0.45,
    fillColor: isSelected ? '#0b5fc4' : '#94a3b8',
    fillOpacity: isSelected ? 0.14 : 0.04,
  };
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
  const initialVue = searchParams.get('vue');
  const incidentParam = searchParams.get('incident');
  const parsedIncidentId = incidentParam ? Number(incidentParam) : NaN;
  const initialIncidentId =
    Number.isFinite(parsedIncidentId) && parsedIncidentId > 0 ? parsedIncidentId : null;

  const [todayOnly, setTodayOnly] = useState<boolean>(initialPeriod);
  const [communeFilter, setCommuneFilter] = useState<string>(initialCommune);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>(() => {
    const param = searchParams.get('gravite');
    return SEVERITY_OPTIONS.some((option) => option.value === param)
      ? (param as SeverityFilter)
      : 'all';
  });
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const param = searchParams.get('tri');
    return param === 'recent' || param === 'ancien' ? param : 'gravite';
  });
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [geoError, setGeoError] = useState<string>('');
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const revealedIdRef = useRef<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (
      initialVue === 'carte' &&
      typeof window !== 'undefined' &&
      window.innerWidth < 960
    ) {
      return 'map';
    }
    if (typeof window !== 'undefined' && window.innerWidth < 960) {
      return 'list';
    }
    return 'split';
  });
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);
  const [focusedIncidentId, setFocusedIncidentId] = useState<number | null>(initialIncidentId);
  const [focusTick, setFocusTick] = useState<number>(
    initialVue === 'carte' || initialIncidentId !== null ? 1 : 0
  );
  const [refreshTick, setRefreshTick] = useState<number>(0);

  const [incidents, setIncidents] = useState<PublicIncident[]>([]);
  const [apiTotal, setApiTotal] = useState<number>(0);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [listError, setListError] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [loadMoreError, setLoadMoreError] = useState<boolean>(false);
  // Identifie le chargement « première page » en cours : une réponse « page suivante »
  // d'une génération précédente (période changée, actualisation) est ignorée.
  const listGenerationRef = useRef<number>(0);

  const [communesList, setCommunesList] = useState<CommuneSummary[]>([]);
  const [mapFeatures, setMapFeatures] = useState<PublicMapFeature[]>([]);
  const [communesGeoJson, setCommunesGeoJson] = useState<GeoJsonFeatureCollection | null>(null);
  const [loadingMap, setLoadingMap] = useState<boolean>(true);

  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  const mapCardRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const communesLayerRef = useRef<L.GeoJSON | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const haloLayerRef = useRef<L.LayerGroup | null>(null);

  // Clic sur un marqueur : met la fiche correspondante en évidence dans la liste
  const handleMarkerSelect = useCallback((id: number) => {
    setHighlightedId(id);
    if (typeof window !== 'undefined' && window.innerWidth < 960) setViewMode('list');
  }, []);

  const handleSortChange = (next: SortMode) => {
    setGeoError('');
    if (next !== 'proche') {
      setSortMode(next);
      return;
    }
    if (userPos) {
      setSortMode('proche');
      return;
    }
    if (!navigator.geolocation) {
      setGeoError('La géolocalisation n’est pas disponible sur cet appareil.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos([pos.coords.latitude, pos.coords.longitude]);
        setSortMode('proche');
      },
      () => setGeoError('Position refusée ou indisponible : tri par gravité conservé.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  // Vrai quand le rechargement vient du minuteur : on garde l'affichage actuel
  // (pas de squelette, pas d'effacement en cas d'erreur réseau passagère).
  const silentRefreshRef = useRef<boolean>(false);
  // Nombre d'incidents chargés : le rafraîchissement auto est suspendu au-delà d'une page,
  // sinon il ferait disparaître les pages supplémentaires déjà chargées.
  const loadedCountRef = useRef<number>(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Synchronise les filtres partageables (commune, période, gravité) avec l'URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (communeFilter !== 'all') params.set('commune', communeFilter);
    else params.delete('commune');
    if (!todayOnly) params.set('periode', 'tous');
    else params.delete('periode');
    if (severityFilter !== 'all') params.set('gravite', severityFilter);
    else params.delete('gravite');
    if (sortMode === 'recent' || sortMode === 'ancien') params.set('tri', sortMode);
    else params.delete('tri');
    if (focusedIncidentId == null) params.delete('incident');
    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params, { replace: true });
    }
  }, [communeFilter, todayOnly, severityFilter, sortMode, focusedIncidentId, searchParams, setSearchParams]);

  // Chargement des incidents filtrés par période (aujourd'hui vs tous actifs)
  useEffect(() => {
    let mounted = true;
    const silent = silentRefreshRef.current;
    listGenerationRef.current += 1;
    setLoadingMore(false);
    setLoadMoreError(false);
    if (!silent) setLoadingList(true);

    apiFetch<{ items: PublicIncident[]; total: number }>(
      `/signalements/recents?limit=${FETCH_LIMIT}&today_only=${todayOnly}`
    )
      .then((data) => {
        if (!mounted) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setIncidents(items);
        setApiTotal(typeof data?.total === 'number' ? data.total : items.length);
        setListError(false);
        setLastUpdated(new Date());
      })
      .catch(() => {
        if (!mounted || silent) return;
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

  // Charge la page suivante côté serveur (offset = nombre d'incidents déjà reçus)
  const handleLoadMore = useCallback(() => {
    const generation = listGenerationRef.current;
    setLoadingMore(true);
    setLoadMoreError(false);
    apiFetch<{ items: PublicIncident[]; total: number }>(
      `/signalements/recents?limit=${FETCH_LIMIT}&offset=${incidents.length}&today_only=${todayOnly}`
    )
      .then((data) => {
        if (generation !== listGenerationRef.current) return;
        const more = Array.isArray(data?.items) ? data.items : [];
        setIncidents((prev) => {
          const known = new Set(prev.map((incident) => incident.id));
          return [...prev, ...more.filter((incident) => !known.has(incident.id))];
        });
        if (typeof data?.total === 'number') setApiTotal(data.total);
      })
      .catch(() => {
        if (generation === listGenerationRef.current) setLoadMoreError(true);
      })
      .finally(() => {
        if (generation === listGenerationRef.current) setLoadingMore(false);
      });
  }, [incidents.length, todayOnly]);

  // Chargement des communes actives et des points de la carte publique
  useEffect(() => {
    let mounted = true;
    const silent = silentRefreshRef.current;
    silentRefreshRef.current = false;
    if (!silent) setLoadingMap(true);

    Promise.allSettled([
      apiFetch<CartePubliqueResponse>('/signalements/carte-publique'),
      apiFetch<{ communes: CommuneSummary[] }>('/signalements/communes-actives'),
    ])
      .then(([carteRes, communesRes]) => {
        if (!mounted) return;
        if (carteRes.status === 'fulfilled') {
          const next = Array.isArray(carteRes.value?.features) ? carteRes.value.features : [];
          const signature = (list: PublicMapFeature[]) =>
            list
              .map(
                (f) =>
                  `${f.properties.id}:${f.properties.statut}:${f.properties.categorie}:${f.geometry?.coordinates?.join(',')}`
              )
              .join('|');
          // Conserve la référence précédente si rien n'a changé : évite de redessiner
          // la carte (et de fermer une popup ouverte) à chaque rafraîchissement.
          setMapFeatures((prev) => (signature(prev) === signature(next) ? prev : next));
        } else if (!silent) {
          setMapFeatures([]);
        }
        if (communesRes.status === 'fulfilled') {
          setCommunesList(
            Array.isArray(communesRes.value?.communes) ? communesRes.value.communes : []
          );
        }
      })
      .finally(() => {
        if (mounted) setLoadingMap(false);
      });

    return () => {
      mounted = false;
    };
  }, [refreshTick]);

  // Limites des communes : lourdes et quasi statiques, chargées une seule fois
  useEffect(() => {
    let mounted = true;
    apiFetch<GeoJsonFeatureCollection>('/signalements/communes')
      .then((geo) => {
        if (mounted && geo?.type === 'FeatureCollection') setCommunesGeoJson(geo);
      })
      .catch(() => {
        /* la carte reste utilisable sans les limites */
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Rafraîchissement automatique toutes les 60 s quand l'onglet est visible
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden || loadedCountRef.current > FETCH_LIMIT) return;
      silentRefreshRef.current = true;
      setRefreshTick((t) => t + 1);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

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

  loadedCountRef.current = incidents.length;

  // Options de communes fusionnant les 13 communes d'Abidjan et les comptes filtrés
  const communeOptions = useMemo(() => {
    const base = incidents.filter(
      (incident) => severityFilter === 'all' || severityOf(incident) === severityFilter
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
  }, [incidents, communesList, severityFilter]);

  const severityCounts = useMemo(() => {
    const base = incidents.filter(
      (incident) => communeFilter === 'all' || incident.commune === communeFilter
    );
    return {
      all: base.length,
      critique: base.filter((incident) => severityOf(incident) === 'critique').length,
      route_coupee: base.filter((incident) => severityOf(incident) === 'route_coupee')
        .length,
      vigilance: base.filter((incident) => severityOf(incident) === 'vigilance').length,
    };
  }, [incidents, communeFilter]);

  const filteredIncidents = useMemo(() => {
    const list = incidents.filter(
      (incident) =>
        (communeFilter === 'all' || incident.commune === communeFilter) &&
        (severityFilter === 'all' || severityOf(incident) === severityFilter)
    );

    const time = (i: PublicIncident) => new Date(i.maj_le || i.cree_le || 0).getTime();
    const distance = (i: PublicIncident) =>
      userPos && i.lat != null && i.lon != null
        ? distanceKm(userPos, [i.lat, i.lon])
        : Number.POSITIVE_INFINITY;

    return [...list].sort((a, b) => {
      if (sortMode === 'recent') return time(b) - time(a);
      if (sortMode === 'ancien') return time(a) - time(b);
      if (sortMode === 'proche') {
        const diff = distance(a) - distance(b);
        if (diff !== 0 && !Number.isNaN(diff)) return diff;
        return time(b) - time(a);
      }
      const rankDiff = SEVERITY_RANK[severityOf(a)] - SEVERITY_RANK[severityOf(b)];
      if (rankDiff !== 0) return rankDiff;
      return time(b) - time(a);
    });
  }, [incidents, communeFilter, severityFilter, sortMode, userPos]);

  // Pagination : la page choisie est liée aux filtres actifs, donc elle revient
  // à la première page dès qu'un filtre, la recherche ou la période change.
  const filterKey = `${todayOnly}|${communeFilter}|${severityFilter}`;
  const [pageChoice, setPageChoice] = useState<{ key: string; page: number }>({
    key: '',
    page: 1,
  });
  const totalPages = Math.max(1, Math.ceil(filteredIncidents.length / PAGE_SIZE));
  const focusIndex =
    focusedIncidentId != null
      ? filteredIncidents.findIndex((incident) => incident.id === focusedIncidentId)
      : -1;
  const defaultPage = focusIndex >= 0 ? Math.floor(focusIndex / PAGE_SIZE) + 1 : 1;
  const currentPage = Math.min(
    pageChoice.key === filterKey ? pageChoice.page : defaultPage,
    totalPages
  );
  const pagedIncidents = useMemo(
    () => filteredIncidents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredIncidents, currentPage]
  );
  const listSectionRef = useRef<HTMLElement | null>(null);

  const handlePageChange = (nextPage: number) => {
    setPageChoice({ key: filterKey, page: nextPage });
    listSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Recalculée à chaque rafraîchissement (manuel ou automatique), y compris après minuit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todayUtcStr = useMemo(() => new Date().toISOString().slice(0, 10), [refreshTick]);
  const isMapVisible = viewMode !== 'list';

  const focusedIncident = useMemo(
    () =>
      focusedIncidentId != null
        ? incidents.find((incident) => incident.id === focusedIncidentId) ?? null
        : null,
    [incidents, focusedIncidentId]
  );

  const filteredMapFeatures = useMemo(() => {
    const filtered = mapFeatures.filter((feature) => {
      const props = feature.properties;
      if (focusedIncidentId != null && props.id === focusedIncidentId) {
        return true;
      }
      if (communeFilter !== 'all' && props.commune !== communeFilter) return false;
      const sev = featureSeverity(props);
      if (severityFilter !== 'all' && sev !== severityFilter) return false;
      if (todayOnly && props.cree_le && !isSameUtcDate(props.cree_le, todayUtcStr)) {
        return false;
      }
      return true;
    });

    if (
      focusedIncident &&
      focusedIncident.lat != null &&
      focusedIncident.lon != null &&
      !filtered.some((feature) => feature.properties.id === focusedIncident.id)
    ) {
      return [
        ...filtered,
        {
          type: 'Feature' as const,
          geometry: {
            type: 'Point',
            coordinates: [focusedIncident.lon, focusedIncident.lat] as [number, number],
          },
          properties: {
            id: focusedIncident.id,
            type: focusedIncident.type,
            statut: focusedIncident.statut,
            danger_immediat: focusedIncident.danger_immediat,
            categorie: focusedIncident.categorie,
            commune: focusedIncident.commune,
            niveau_fiabilite: focusedIncident.niveau_fiabilite,
            cree_le: focusedIncident.cree_le,
          },
        },
      ];
    }

    return filtered;
  }, [
    mapFeatures,
    communeFilter,
    severityFilter,
    todayOnly,
    todayUtcStr,
    focusedIncidentId,
    focusedIncident,
  ]);

  // Initialisation / destruction de la carte Leaflet selon la visibilité de la carte
  useEffect(() => {
    if (!isMapVisible || !mapContainerRef.current) return;

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
    const haloLayer = L.layerGroup().addTo(map);

    mapRef.current = map;
    communesLayerRef.current = communesLayer;
    markersLayerRef.current = markersLayer;
    haloLayerRef.current = haloLayer;

    return () => {
      map.remove();
      mapRef.current = null;
      communesLayerRef.current = null;
      markersLayerRef.current = null;
      haloLayerRef.current = null;
    };
  }, [isMapVisible]);

  // Recalcule la taille Leaflet quand la disposition change (split <-> map)
  useEffect(() => {
    if (!isMapVisible || !mapRef.current) return;
    const timer = window.setTimeout(() => {
      mapRef.current?.invalidateSize({ animate: false });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [viewMode, isMapVisible]);

  // Polygones de communes : créés une seule fois (ou quand la carte est recréée)
  useEffect(() => {
    const communesLayer = communesLayerRef.current;
    if (!communesLayer || !isMapVisible) return;

    communesLayer.clearLayers();
    if (!communesGeoJson) return;

    const geo = L.geoJSON(communesGeoJson as any, {
      style: () => communeStyle(false),
      onEachFeature: (feature, layer) => {
        const name = getCommunePropName(feature?.properties);
        if (!name) return;
        // Survol = simple info-bulle : la commune se choisit uniquement via les filtres
        layer.bindTooltip(name, { sticky: true, direction: 'center' });
      },
    });
    geo.eachLayer((layer) => communesLayer.addLayer(layer));
  }, [communesGeoJson, isMapVisible]);

  // Met simplement à jour le style quand la commune sélectionnée change
  useEffect(() => {
    const communesLayer = communesLayerRef.current;
    if (!communesLayer || !isMapVisible) return;
    communesLayer.eachLayer((layer) => {
      const name = getCommunePropName((layer as any).feature?.properties);
      (layer as L.Path).setStyle(communeStyle(communeFilter !== 'all' && name === communeFilter));
    });
  }, [communeFilter, communesGeoJson, isMapVisible]);

  // Marqueurs filtrés + cadrage de la carte
  useEffect(() => {
    const map = mapRef.current;
    const communesLayer = communesLayerRef.current;
    const markersLayer = markersLayerRef.current;
    const haloLayer = haloLayerRef.current;
    if (!map || !communesLayer || !markersLayer || !haloLayer || viewMode === 'list') return;

    let selectedCommuneBounds: L.LatLngBounds | null = null;
    if (communeFilter !== 'all') {
      communesLayer.eachLayer((layer) => {
        const name = getCommunePropName((layer as any).feature?.properties);
        if (name === communeFilter && 'getBounds' in layer) {
          try {
            selectedCommuneBounds = (layer as L.Polygon).getBounds();
          } catch {
            selectedCommuneBounds = null;
          }
        }
      });
    }

    markersLayer.clearLayers();
    haloLayer.clearLayers();
    const pointBounds = L.latLngBounds([]);
    let focusedMarker: L.CircleMarker | null = null;
    let focusedCoords: [number, number] | null = null;

    for (const feature of filteredMapFeatures) {
      const coords = feature.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const [lon, lat] = coords;
      if (typeof lat !== 'number' || typeof lon !== 'number') continue;

      const props = feature.properties;
      const sev = featureSeverity(props);
      const color = MARKER_COLORS[sev];
      const matchesById = focusedIncidentId != null && props.id === focusedIncidentId;
      const matchesByFallback =
        props.id == null &&
        focusedIncident != null &&
        props.commune === focusedIncident.commune &&
        props.type === focusedIncident.type &&
        (!props.cree_le ||
          !focusedIncident.cree_le ||
          props.cree_le === focusedIncident.cree_le);
      const isFocused = matchesById || matchesByFallback;
      const baseRadius = sev === 'critique' ? 9 : sev === 'route_coupee' ? 8 : 7;
      const radius = isFocused ? baseRadius + 4 : baseRadius;

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

      if (isFocused) {
        L.circleMarker([lat, lon], {
          radius: radius + 7,
          color: '#0b5fc4',
          weight: 2.5,
          opacity: 0.9,
          fillColor: '#0b5fc4',
          fillOpacity: 0.16,
          interactive: false,
        }).addTo(haloLayer);
      }

      const marker = L.circleMarker([lat, lon], {
        radius,
        color: isFocused ? '#0b1f33' : '#ffffff',
        weight: isFocused ? 3 : 2,
        fillColor: color,
        fillOpacity: 0.95,
      });

      marker.bindPopup(popupHtml);
      if (props.id != null) {
        const markerId = props.id;
        marker.on('click', () => handleMarkerSelect(markerId));
      }
      marker.addTo(markersLayer);
      pointBounds.extend([lat, lon]);

      if (isFocused) {
        focusedMarker = marker;
        focusedCoords = [lat, lon];
      }
    }

    let rafId: number | null = null;
    let popupTimer: number | null = null;

    if (focusedMarker && focusedCoords) {
      const targetMarker = focusedMarker;
      const targetCoords = focusedCoords;
      rafId = window.requestAnimationFrame(() => {
        map.invalidateSize({ animate: false });
        map.setView(targetCoords, 16, { animate: true });
        popupTimer = window.setTimeout(() => {
          targetMarker.openPopup();
        }, 240);
      });
    } else if (selectedCommuneBounds && (selectedCommuneBounds as L.LatLngBounds).isValid()) {
      map.fitBounds(selectedCommuneBounds, { padding: [24, 24], maxZoom: 14 });
    } else if (pointBounds.isValid()) {
      map.fitBounds(pointBounds, { padding: [32, 32], maxZoom: 14 });
    } else {
      map.setView(ABIDJAN_CENTER, 12);
    }

    return () => {
      if (rafId != null) window.cancelAnimationFrame(rafId);
      if (popupTimer != null) window.clearTimeout(popupTimer);
    };
  }, [
    communesGeoJson,
    filteredMapFeatures,
    communeFilter,
    viewMode,
    isMapVisible,
    focusedIncidentId,
    focusedIncident,
    focusTick,
    handleMarkerSelect,
  ]);

  // Amène la fiche mise en évidence à l'écran (bonne page de pagination + défilement)
  useEffect(() => {
    if (highlightedId == null || viewMode === 'map') {
      revealedIdRef.current = null;
      return;
    }
    // Une seule fois par sélection : ne pas ramener la page à chaque rafraîchissement
    if (revealedIdRef.current === highlightedId) return;
    const index = filteredIncidents.findIndex((incident) => incident.id === highlightedId);
    if (index < 0) return;
    revealedIdRef.current = highlightedId;
    setPageChoice({ key: filterKey, page: Math.floor(index / PAGE_SIZE) + 1 });
    const timer = window.setTimeout(() => {
      document
        .getElementById(`incident-${highlightedId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [highlightedId, viewMode, filteredIncidents, filterKey]);

  // Fait défiler jusqu'à la carte lorsque l'utilisateur demande à localiser un incident
  useEffect(() => {
    if (focusTick === 0 || viewMode === 'list') return;
    const timer = window.setTimeout(() => {
      mapCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [focusTick, viewMode]);

  const handleCommuneSelect = (commune: string) => {
    setFocusedIncidentId(null);
    setCommuneFilter(commune);
  };

  const handlePeriodChange = (nextTodayOnly: boolean) => {
    setFocusedIncidentId(null);
    setTodayOnly(nextTodayOnly);
  };

  const handleSeverityChange = (next: SeverityFilter) => {
    setFocusedIncidentId(null);
    setSeverityFilter(next);
  };

  const handleResetFilters = () => {
    setFocusedIncidentId(null);
    setCommuneFilter('all');
    setSeverityFilter('all');
  };

  const handleLocateIncident = useCallback(
    (incident: PublicIncident) => {
      setFocusedIncidentId(incident.id);
      setFocusTick((t) => t + 1);
      if (viewMode === 'list') {
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 960;
        setViewMode(isMobile ? 'map' : 'split');
      } else if (
        typeof window !== 'undefined' &&
        window.innerWidth < 960 &&
        viewMode !== 'map'
      ) {
        setViewMode('map');
      }
    },
    [viewMode]
  );

  const handleOpenPhoto = (photos: string[], index: number, title: string) => {
    setLightbox({ photos, index, title });
  };

  const activeFilterCount = (communeFilter !== 'all' ? 1 : 0) + (severityFilter !== 'all' ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  return (
    <div className="oid-report-page oid-consulter-page">
      <div className="oid-consulter-container">
        {/* En-tête compact : titre + période, puis une seule barre d'outils */}
        <header className="oid-consulter-hero">
          <div className="oid-consulter-hero-top">
            <div className="oid-consulter-hero-heading">
              <h1 className="oid-consulter-title">
                {todayOnly ? 'Les incidents du jour' : 'Tous les incidents actifs'}
              </h1>
              <p className="oid-consulter-subtitle" aria-live="polite">
                <strong className="font-mono">{filteredIncidents.length}</strong>
                {` affiché${filteredIncidents.length > 1 ? 's' : ''}`}
                {apiTotal > incidents.length ? ` sur ${apiTotal}` : ''}
                <span className="oid-consulter-subtitle-hint">
                  {' '}
                  · ouvrez un incident pour consulter son suivi
                </span>
                {lastUpdated && (
                  <span className="oid-consulter-subtitle-hint">
                    {' '}
                    · actualisé {formatRelativeTime(lastUpdated.toISOString())}
                  </span>
                )}
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
                  size={16}
                  className={loadingList || loadingMap ? 'animate-spin' : ''}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          {/* Barre unique : Recherche + Commune + Gravité (puces) + Liste / Carte */}
          <div
            className="oid-consulter-hero-toolbar"
            role="search"
            aria-label="Filtres et affichage des incidents"
          >
            <div className="oid-consulter-search-row">
              <button
                type="button"
                onClick={() => setFiltersOpen((open) => !open)}
                className={`oid-consulter-filters-toggle ${
                  filtersOpen || activeFilterCount > 0 ? 'is-active' : ''
                }`}
                aria-expanded={filtersOpen}
                aria-controls="consulter-commune-filter consulter-severity-filter"
              >
                <SlidersHorizontal size={16} aria-hidden="true" />
                <span>Filtres</span>
                {activeFilterCount > 0 && (
                  <span className="oid-consulter-filters-count" aria-label={`${activeFilterCount} filtre actif`}>
                    {activeFilterCount}
                  </span>
                )}
              </button>

              <div
                id="consulter-commune-filter"
                className={`oid-consulter-select-wrap oid-consulter-commune-wrap ${
                  filtersOpen ? 'is-open' : ''
                }`}
              >
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

              <div
                id="consulter-severity-filter"
                className={`oid-consulter-chips ${filtersOpen ? 'is-open' : ''}`}
                role="group"
                aria-label="Filtrer par gravité"
              >
                {SEVERITY_OPTIONS.map((option) => {
                  const active = severityFilter === option.value;
                  const count = severityCounts[option.value];
                  const tone =
                    option.value === 'critique'
                      ? 'is-crit'
                      : option.value === 'route_coupee'
                      ? 'is-warn'
                      : option.value === 'vigilance'
                      ? 'is-vig'
                      : '';
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleSeverityChange(option.value)}
                      aria-pressed={active}
                      className={`oid-consulter-chip ${tone} ${active ? 'is-active' : ''}`}
                    >
                      {tone && <span className={`oid-consulter-dot ${tone}`} aria-hidden="true" />}
                      <span>{option.value === 'all' ? 'Toutes' : option.label}</span>
                      <strong className="font-mono">{count}</strong>
                    </button>
                  );
                })}
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="oid-consulter-reset-btn"
                    title="Réinitialiser les filtres"
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    <span>Réinitialiser</span>
                  </button>
                )}
              </div>

              <div className="oid-consulter-select-wrap oid-consulter-sort-wrap">
                <select
                  value={sortMode}
                  onChange={(e) => handleSortChange(e.target.value as SortMode)}
                  aria-label="Trier les incidents"
                  className="oid-consulter-select"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      Tri : {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="oid-consulter-view-switch" role="group" aria-label="Affichage">
                <button
                  type="button"
                  onClick={() => setViewMode('split')}
                  aria-pressed={viewMode === 'split'}
                  className={`oid-consulter-view-btn is-split-only ${
                    viewMode === 'split' ? 'is-active' : ''
                  }`}
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
            {geoError && (
              <p className="oid-consulter-subtitle" role="status">
                {geoError}
              </p>
            )}
          </div>
        </header>

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
            <section
              ref={listSectionRef}
              className="oid-consulter-list-col"
              aria-label="Liste des incidents"
            >
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
                <>
                  <div className="space-y-3">
                    {pagedIncidents.map((incident) => (
                      <PublicIncidentCard
                        key={incident.id}
                        incident={incident}
                        defaultExpanded={incident.id === initialIncidentId}
                        highlighted={incident.id === highlightedId}
                        onOpenPhoto={handleOpenPhoto}
                        onLocate={handleLocateIncident}
                      />
                    ))}
                  </div>
                  <Pagination
                    page={currentPage}
                    pageSize={PAGE_SIZE}
                    total={filteredIncidents.length}
                    onPageChange={handlePageChange}
                  />
                  {incidents.length < apiTotal && (
                    <div className="mt-4 flex flex-col items-center gap-2 text-center">
                      <p className="text-sm text-ink2">
                        {incidents.length} incidents chargés sur {apiTotal}.
                      </p>
                      <button
                        type="button"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        className="oid-consulter-empty-btn is-primary"
                      >
                        {loadingMore
                          ? 'Chargement…'
                          : `Charger ${Math.min(FETCH_LIMIT, apiTotal - incidents.length)} incidents de plus`}
                      </button>
                      {loadMoreError && (
                        <p className="text-sm text-[var(--crit)]" role="alert">
                          Impossible de charger la suite. Réessayez.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {viewMode !== 'list' && (
            <aside className="oid-consulter-map-col" aria-label="Carte des incidents">
              <div ref={mapCardRef} id="carte-publique" className="oid-consulter-map-card">
                <div className="oid-consulter-map-head">
                  <div>
                    <h2 className="oid-consulter-map-title">Carte publique</h2>
                    <p className="oid-consulter-map-caption">
                      {filteredMapFeatures.length} point
                      {filteredMapFeatures.length > 1 ? 's' : ''} localisé
                      {filteredMapFeatures.length > 1 ? 's' : ''}
                      {communeFilter !== 'all' ? ` · ${communeFilter}` : ''}
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <div
                    ref={mapContainerRef}
                    className={`oid-consulter-leaflet ${viewMode === 'map' ? 'is-tall' : ''}`}
                  />
                  {filteredMapFeatures.length === 0 && (
                    <div className="oid-consulter-map-empty" role="status">
                      Aucun incident localisé pour le moment.
                    </div>
                  )}
                </div>

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

