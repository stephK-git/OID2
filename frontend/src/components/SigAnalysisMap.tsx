import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Flame, VolumeX, Eye, MapPin, Grid, Layers, Compass as CompassIcon, Activity, RotateCcw, Filter, Search, X, ChevronDown, BarChart2 } from 'lucide-react';

/** Lit une variable CSS du thème courant (les couches Leaflet n'acceptent pas var()). */
const readToken = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

/** Palette sémantique résolue pour les couches vectorielles Leaflet. */
const leafletPalette = () => ({
  water: readToken('--water', '#0b5fc4'),
  ok: readToken('--ok', '#0b7a4f'),
  crit: readToken('--crit', '#b3261e'),
  tx3: readToken('--tx3', '#5b7389'),
  surface: readToken('--s1', '#ffffff'),
  line: readToken('--line', '#d3dee9'),
});

export type HexThematique = 'densite' | 'alea' | 'vulnerabilite' | 'getis_ord';

export interface PointChaud {
  cluster_id: number;
  algorithme?: string;
  eps_m?: number;
  min_points?: number;
  centre: { lat: number; lon: number; utm_e?: number; utm_n?: number };
  superficie_cluster_km2?: number;
  perimetre_m?: number;
  nombre_incidents: number;
  nombre_signalements?: number;
  nombre_observations?: number;
  score_moyen_priorite: number;
  danger_immediat_total: number;
  niveau_recurrence: string;
  score_hotspot: number;
  types_dominants: string[];
  incidents_associes: number[];
  emprise_geojson?: any;
}

export interface IndiceVulnerabilite {
  zone_id: number;
  zone_nom: string;
  code_adm?: string;
  superficie_km2?: number;
  population_totale?: number;
  population_zone_inondable?: number;
  densite_hab_km2?: number;
  altitude_moy_m?: number;
  dist_hydro_moy_m?: number;
  score_alea?: number;
  score_exposition?: number;
  score_vulnerabilite_soc?: number;
  nombre_incidents: number;
  dangers_immediats: number;
  personnes_affectees_estimees: number;
  indice_vulnerabilite: number;
  classe_risque: string;
  classe_jenks_label?: string;
  couleur: string;
  caracteristique_relief: string;
  jenks_gvf?: number;
  jenks_breaks?: number[];
  geojson?: any;
  centre?: { lat: number; lon: number; utm_e?: number; utm_n?: number } | null;
}

export interface ZoneSilencieuse {
  zone_id: number;
  zone_nom: string;
  population_totale?: number;
  population_exposee_alea?: number;
  indice_alea_moyen?: number;
  incidents_enregistres: number;
  observe?: number;
  attendu?: number;
  ratio_obs_att?: number;
  ecart_relatif_pct?: number;
  residu_poisson?: number;
  p_value_poisson?: number;
  statut_alerte: string;
  niveau_severite: string;
  motif: string;
  action_requise: string;
  geojson?: any;
  centre?: { lat: number; lon: number } | null;
}

export interface JenksClassificationMeta {
  variable: string;
  unite: string;
  methode: string;
  k: number;
  breaks: number[];
  counts: number[];
  gvf: number;
  palette: string[];
}

export interface MaillesPopulationCollection {
  type: 'FeatureCollection';
  crs_calcul: string;
  zone_filtree_id: number | null;
  thematique?: string;
  total_mailles: number;
  population_couverte: number;
  classification: JenksClassificationMeta;
  features: any[];
}

export interface GetisOrdLegendItem {
  classe: number;
  label: string;
  couleur: string;
  count?: number;
}

export interface GetisOrdCollection {
  type: 'FeatureCollection';
  crs_calcul: string;
  zone_filtree_id?: number | null;
  rayon_voisinage_m: number;
  resume: {
    nb_hotspots_99: number;
    nb_hotspots_95: number;
    nb_hotspots_90: number;
    nb_coldspots: number;
    nb_non_significatifs?: number;
    z_max: number;
  };
  legende: GetisOrdLegendItem[];
  features: any[];
}

export interface CommunesGeoJsonCollection {
  type: 'FeatureCollection';
  crs_calcul: string;
  classification: JenksClassificationMeta;
  features: any[];
}

export interface SigMetadata {
  territoire: string;
  scr_stockage: string;
  scr_calcul: string;
  unite_metrique: string;
  discretisation: string;
  maillage_hexagonal: {
    methode: string;
    cote_m: number;
    superficie_unitaire_km2: number;
    nb_mailles_actives: number;
    altitude_min_m?: number;
    altitude_max_m?: number;
    indice_alea_moyen?: number;
  };
  couverture_administrative: {
    nb_communes: number;
    superficie_totale_km2: number;
    population_totale_worldpop: number;
    source_limites: string;
    source_population: string;
    source_hydrographie?: string;
    source_mnt?: string;
  };
  methodes_lot2?: {
    clustering: string;
    autocorrelation: string;
    vulnerabilite: string;
    zones_silencieuses: string;
  };
  maj_referentiel?: string | null;
}

export interface SigAnalysisMapProps {
  mode?: 'analyse' | 'operationnel';
  communesGeoJson: CommunesGeoJsonCollection | null;
  maillesGeoJson: MaillesPopulationCollection | null;
  getisOrdGeoJson: GetisOrdCollection | null;
  hexThematique: HexThematique;
  onChangeHexThematique: (thematique: HexThematique) => void;
  hotspots: PointChaud[];
  vulnerabilities: IndiceVulnerabilite[];
  silentZones: ZoneSilencieuse[];
  incidentsGeoJson?: any;
  sigMetadata?: SigMetadata | null;
  selectedZoneId: number | '';
  onSelectZoneId: (zoneId: number | '') => void;
  focusTarget?: { lat: number; lon: number; zoom?: number } | null;
  statusFilter?: 'tous' | 'danger' | 'ouverts' | 'evalues' | 'clotures';
  onChangeStatusFilter?: (status: any) => void;
  searchRef?: string;
  onChangeSearchRef?: (search: string) => void;
  onRequestAssign?: (incidentId: number) => void;
  onOpenIncidentDetail?: (incidentId: number) => void;
  onToggleKpiSidebar?: () => void;
  isKpiSidebarOpen?: boolean;
}

type BasemapKey = 'sobre' | 'hot' | 'osm' | 'topo';

const BASEMAPS: Record<
  BasemapKey,
  { label: string; url: string; attribution: string; maxZoom: number; tileClassName?: string }
> = {
  sobre: {
    label: 'Fond Gris Clair SIG (OSM sobre — sans clé)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
    tileClassName: 'sig-tile-grayscale',
  },
  hot: {
    label: 'OSM Humanitaire (HOT — Gestion de crise)',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors, Tiles style by Humanitarian OSM Team',
    maxZoom: 19,
  },
  osm: {
    label: 'OpenStreetMap Standard (Couleur)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
  topo: {
    label: 'Topographique (Courbes / Relief)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; OpenStreetMap, SRTM | Map style: &copy; OpenTopoMap',
    maxZoom: 17,
  },
};

const HEX_THEMATIQUE_TITLES: Record<Exclude<HexThematique, 'getis_ord'>, string> = {
  densite: 'Densité démographique WorldPop 100 m (hab./km²) — Maillage hexagonal 300 m (0,234 km²)',
  alea: 'Susceptibilité hydro-topographique d’inondation (/ 100) — MNT 38 m & distance hydro EPSG:32630',
  vulnerabilite: 'Indice multicritère local IV (/ 100) — Aléa^0,40 × Exposition^0,35 × Vulnérabilité^0,25',
};

/**
 * Projection directe exacte WGS84 (degrés) -> UTM Zone 30N (EPSG:32630, mètres)
 * Méridien central 3°W, ellipsoïde WGS84.
 */
function wgs84ToUtm30N(lonDeg: number, latDeg: number): { easting: number; northing: number } {
  const a = 6378137.0;
  const f = 1.0 / 298.257223563;
  const e2 = 2 * f - f * f;
  const ep2 = e2 / (1 - e2);
  const k0 = 0.9996;
  const lon0 = (-3.0 * Math.PI) / 180.0;

  const phi = (latDeg * Math.PI) / 180.0;
  const lam = (lonDeg * Math.PI) / 180.0;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);

  const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const C = ep2 * cosPhi * cosPhi;
  const A = cosPhi * (lam - lon0);

  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const M =
    a *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi));

  const A2 = A * A;
  const A3 = A2 * A;
  const A4 = A2 * A2;
  const A5 = A4 * A;
  const A6 = A4 * A2;

  const easting =
    500000.0 +
    k0 *
      N *
      (A +
        ((1 - T + C) * A3) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A5) / 120);

  const northing =
    k0 *
    (M +
      N *
        tanPhi *
        (A2 / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A6) / 720));

  return { easting, northing };
}

function formatNumberFr(val: number, decimals = 0): string {
  return val.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Cadrage sur l'emprise du District d'Abidjan avec un cran de zoom supplémentaire (+1),
 * correspondant exactement à un cadrage complet suivi d'un clic sur le bouton « + ».
 */
function fitDistrictBoundsWithPlusOne(
  map: L.Map,
  bounds: L.LatLngBounds | null | undefined,
  animate = true
): void {
  if (!bounds || !bounds.isValid()) return;
  map.invalidateSize(false);
  const baseZoom = Math.min(12, map.getBoundsZoom(bounds, false, L.point(44, 44)));
  const targetZoom = Math.min(map.getMaxZoom() || 18, baseZoom + 1);
  map.setView(bounds.getCenter(), targetZoom, { animate });
}

export const SigAnalysisMap: React.FC<SigAnalysisMapProps> = ({
  mode = 'analyse',
  communesGeoJson,
  maillesGeoJson,
  getisOrdGeoJson,
  hexThematique,
  onChangeHexThematique,
  hotspots,
  vulnerabilities,
  silentZones,
  incidentsGeoJson,
  sigMetadata,
  selectedZoneId,
  onSelectZoneId,
  focusTarget,
  statusFilter = 'tous',
  onChangeStatusFilter,
  searchRef = '',
  onChangeSearchRef,
  onRequestAssign,
  onOpenIncidentDetail,
  onToggleKpiSidebar,
  isKpiSidebarOpen,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const canvasRendererRef = useRef<L.Canvas | null>(null);
  const svgRendererRef = useRef<L.SVG | null>(null);
  const hasInitialFitRef = useRef<boolean>(false);
  const openIncidentIdRef = useRef<number | null>(null);
  const selectedZoneIdRef = useRef<number | ''>(selectedZoneId);
  const prevSelectedZoneIdRef = useRef<number | ''>(selectedZoneId);
  const onSelectZoneIdRef = useRef<(zid: number | '') => void>(onSelectZoneId);
  const onOpenIncidentDetailRef = useRef<((id: number) => void) | undefined>(onOpenIncidentDetail);
  const incidentsGeoJsonRef = useRef(incidentsGeoJson);
  const activeCommunePopupRef = useRef<L.Popup | null>(null);
  const lastLayerClickTimeRef = useRef<number>(0);

  useEffect(() => {
    selectedZoneIdRef.current = selectedZoneId;
    onSelectZoneIdRef.current = onSelectZoneId;
    incidentsGeoJsonRef.current = incidentsGeoJson;
    onOpenIncidentDetailRef.current = onOpenIncidentDetail;
  }, [selectedZoneId, onSelectZoneId, incidentsGeoJson, onOpenIncidentDetail]);

  // Interception universelle des clics sur les boutons d'action des popups Leaflet
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const handleContainerClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('[data-incident-action="open-dossier"]') as HTMLElement | null;
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        const incId = Number(target.getAttribute('data-incident-id'));
        if (incId) {
          if (onOpenIncidentDetailRef.current) {
            onOpenIncidentDetailRef.current(incId);
          } else if (onRequestAssign) {
            onRequestAssign(incId);
          }
        }
      }
    };

    container.addEventListener('click', handleContainerClick);
    return () => {
      container.removeEventListener('click', handleContainerClick);
    };
  }, [onRequestAssign]);

  const [isLayersDrawerOpen, setIsLayersDrawerOpen] = useState(false);
  const [isFiltersDrawerOpen, setIsFiltersDrawerOpen] = useState(false);
  const [statusCollapseOpen, setStatusCollapseOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const filtersDrawerRef = useRef<HTMLDivElement>(null);

  // Fermeture des volets au clic en dehors
  useEffect(() => {
    if (!isLayersDrawerOpen && !isFiltersDrawerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        isLayersDrawerOpen &&
        drawerRef.current &&
        !drawerRef.current.contains(target) &&
        !target.closest('.oid-map-layers-toggle-btn')
      ) {
        setIsLayersDrawerOpen(false);
      }
      if (
        isFiltersDrawerOpen &&
        filtersDrawerRef.current &&
        !filtersDrawerRef.current.contains(target) &&
        !target.closest('.oid-map-filters-toggle-btn')
      ) {
        setIsFiltersDrawerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isLayersDrawerOpen, isFiltersDrawerOpen]);

  const handleToggleLayersDrawer = () => {
    setIsLayersDrawerOpen((prev) => {
      if (!prev) setIsFiltersDrawerOpen(false);
      return !prev;
    });
  };

  const handleToggleFiltersDrawer = () => {
    setIsFiltersDrawerOpen((prev) => {
      if (!prev) setIsLayersDrawerOpen(false);
      return !prev;
    });
  };

  // Groupes de couches ordonnés (du fond thématique vers les ponctuels d'alerte)
  const maillesLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const communesLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const silentLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const hotspotsLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const incidentsLayerRef = useRef<L.LayerGroup>(L.layerGroup());

  const [basemap, setBasemap] = useState<BasemapKey>('sobre');
  const [showMaillesPop, setShowMaillesPop] = useState(mode !== 'operationnel');
  const [showCommunes, setShowCommunes] = useState(true);
  const [communeChoropleth, setCommuneChoropleth] = useState<'contour' | 'vulnerabilite'>('contour');
  const [showHotspots, setShowHotspots] = useState(mode !== 'operationnel');
  const [showSilent, setShowSilent] = useState(mode !== 'operationnel');
  const [showIncidents, setShowIncidents] = useState(true);

  const [cursorCoords, setCursorCoords] = useState<{
    lat: number;
    lon: number;
    easting: number;
    northing: number;
  } | null>(null);

  // 1. Initialisation de la carte Leaflet en mode Canvas haute performance + Échelle métrique
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const canvasRenderer = L.canvas({ padding: 0.5 });
      canvasRendererRef.current = canvasRenderer;

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true,
        renderer: canvasRenderer,
        closePopupOnClick: false,
      }).setView([5.36, -4.01], 11);

      // Panneau dédié aux incidents avec z-index prioritaire pour garantir la visibilité au-dessus des polygones
      if (!map.getPane('incidentsPane')) {
        const incidentPane = map.createPane('incidentsPane');
        incidentPane.style.zIndex = '620';
      }
      svgRendererRef.current = L.svg({ pane: 'incidentsPane' });

      const bm = BASEMAPS[basemap];
      tileLayerRef.current = L.tileLayer(bm.url, {
        attribution: bm.attribution,
        maxZoom: bm.maxZoom,
        className: bm.tileClassName || '',
      }).addTo(map);

      // Barre d'échelle métrique réglementaire compacte (sans unités impériales)
      L.control
        .scale({
          metric: true,
          imperial: false,
          maxWidth: 85,
          position: 'bottomleft',
        })
        .addTo(map);

      maillesLayerRef.current.addTo(map);
      communesLayerRef.current.addTo(map);
      silentLayerRef.current.addTo(map);
      hotspotsLayerRef.current.addTo(map);
      incidentsLayerRef.current.addTo(map);

      map.on('mousemove', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        const utm = wgs84ToUtm30N(lng, lat);
        setCursorCoords({
          lat,
          lon: lng,
          easting: utm.easting,
          northing: utm.northing,
        });
      });

      // Clic dans le vide de la carte (ex: lagune ou hors commune) : réinitialise le zoom vers le cadrage district
      map.on('click', () => {
        if (Date.now() - lastLayerClickTimeRef.current < 250) {
          return;
        }
        if (mode === 'operationnel') {
          if (activeCommunePopupRef.current) {
            map.closePopup(activeCommunePopupRef.current);
            activeCommunePopupRef.current = null;
          }
          if (selectedZoneIdRef.current !== '') {
            selectedZoneIdRef.current = '';
            onSelectZoneIdRef.current('');
          }
        }
      });

      mapInstanceRef.current = map;
    }

    // Observation automatique du redimensionnement du conteneur (ex: repli/dépli du volet 250px)
    let resizeObserver: ResizeObserver | null = null;
    if (mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        mapInstanceRef.current?.invalidateSize();
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 2. Changement de fond de plan
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const bm = BASEMAPS[basemap];
    tileLayerRef.current = L.tileLayer(bm.url, {
      attribution: bm.attribution,
      maxZoom: bm.maxZoom,
      className: bm.tileClassName || '',
    }).addTo(map);
    tileLayerRef.current.bringToBack();
  }, [basemap]);

  // 3. Focus animé depuis les tableaux
  useEffect(() => {
    if (mapInstanceRef.current && focusTarget) {
      mapInstanceRef.current.flyTo([focusTarget.lat, focusTarget.lon], focusTarget.zoom || 14, {
        duration: 1.1,
      });
    }
  }, [focusTarget?.lat, focusTarget?.lon, focusTarget?.zoom]);

  // 4. Rendu Canvas du maillage hexagonal 300 m (Densité / Aléa / Risque IV / Getis-Ord Gi*)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    maillesLayerRef.current.clearLayers();
    if (!showMaillesPop) return;

    const renderer = canvasRendererRef.current || undefined;

    if (hexThematique === 'getis_ord') {
      if (!getisOrdGeoJson || !getisOrdGeoJson.features?.length) return;
      const giLayer = L.geoJSON(getisOrdGeoJson as any, {
        style: (feature) => {
          const clsGi = feature?.properties?.classe_gi ?? 4;
          const isNonSig = clsGi === 4;
          const fill = feature?.properties?.couleur || '#f8fafc';
          return {
            renderer,
            fillColor: fill,
            fillOpacity: isNonSig ? 0.1 : 0.76,
            color: isNonSig ? '#94a3b8' : '#0f172a',
            weight: isNonSig ? 0.25 : 0.65,
            opacity: isNonSig ? 0.3 : 0.75,
          };
        },
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          const zVal = typeof p.z_score === 'number' ? p.z_score : 0;
          const zColor = zVal >= 1.645 ? '#b2182b' : zVal <= -1.645 ? '#2166ac' : '#475569';
          const popupHtml = `
            <div style="font-family: var(--font); font-size: 12.5px; line-height: 1.45; min-width: 235px;">
              <strong style="font-size: 13.5px; color: var(--tx);">Autocorrélation Getis-Ord Gi* — ${p.code_maille}</strong><br/>
              <span style="color: var(--tx2); font-weight: 600;">Commune : ${p.zone_nom}</span>
              <hr style="margin: 5px 0; border: none; border-top: 1px solid var(--line);"/>
              <b>Diagnostic Gi* :</b> <span style="font-weight: 700; color: ${zColor};">${p.interpretation_gi}</span><br/>
              <b>Score standardisé Z(Gi*) :</b> <code>${zVal >= 0 ? '+' : ''}${formatNumberFr(zVal, 2)}</code> (p = ${formatNumberFr(p.p_value ?? 1, 4)})<br/>
              <b>Sinistres dans la maille :</b> ${p.nb_evenements ?? 0} (intensité pondérée : ${formatNumberFr(p.intensite_sinistre ?? 0, 2)})<br/>
              <b>Voisinage métrique (≤ ${getisOrdGeoJson.rayon_voisinage_m} m) :</b> ${p.nb_voisins ?? 1} hexagones<br/>
              <b>Population WorldPop :</b> ${formatNumberFr(p.population_worldpop ?? 0, 0)} hab. · Aléa : ${formatNumberFr(p.indice_alea ?? 0, 0)}/100
            </div>
          `;
          layer.bindPopup(popupHtml);
        },
      });
      maillesLayerRef.current.addLayer(giLayer);
      if (selectedZoneId !== '' && giLayer.getBounds().isValid()) {
        map.fitBounds(giLayer.getBounds(), { padding: [28, 28], maxZoom: 14 });
      }
      return;
    }

    if (!maillesGeoJson || !maillesGeoJson.features?.length) return;

    const c = leafletPalette();
    const hexGeoLayer = L.geoJSON(maillesGeoJson as any, {
      style: (feature) => {
        const p = feature?.properties || {};
        const dens = p.densite_hab_km2 ?? 0;
        const fill = p.couleur || '#ffffb2';
        const lowOpacity =
          (hexThematique === 'densite' || hexThematique === 'vulnerabilite') && dens <= 0;
        return {
          renderer,
          fillColor: fill,
          fillOpacity: lowOpacity ? 0.14 : 0.68,
          color: c.tx3,
          weight: 0.3,
          opacity: 0.45,
        };
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        const popupHtml = `
          <div style="font-family: var(--font); font-size: 12.5px; line-height: 1.45; min-width: 235px;">
            <strong style="font-size: 13.5px; color: var(--tx);">Maille ${p.code_maille}</strong><br/>
            <span style="color: var(--tx2); font-weight: 600;">Commune : ${p.zone_nom}</span>
            <hr style="margin: 5px 0; border: none; border-top: 1px solid var(--line);"/>
            <b>Population (WorldPop 100 m) :</b> ${formatNumberFr(p.population_worldpop ?? 0, 0)} hab.<br/>
            <b>Densité :</b> <span style="font-weight: 700; color: #b91c1c;">${formatNumberFr(p.densite_hab_km2 ?? 0, 0)} hab./km²</span><br/>
            <b>Altitude MNT / Dist. hydro :</b> ${formatNumberFr(p.altitude_moy_m ?? 0, 1)} m · ${formatNumberFr(p.dist_hydro_m ?? 0, 0)} m<br/>
            <b>Aléa physique :</b> ${formatNumberFr(p.indice_alea ?? 0, 1)} / 100 · <b>Risque IV :</b> ${formatNumberFr(p.indice_vulnerabilite_maille ?? 0, 1)} / 100<br/>
            <b>Classe Fisher-Jenks :</b> Classe ${p.classe_jenks} / ${maillesGeoJson.classification?.k || 5}
          </div>
        `;
        layer.bindPopup(popupHtml);
      },
    });

    maillesLayerRef.current.addLayer(hexGeoLayer);

    if (selectedZoneId !== '' && hexGeoLayer.getBounds().isValid()) {
      map.fitBounds(hexGeoLayer.getBounds(), { padding: [28, 28], maxZoom: 14 });
    }
  }, [showMaillesPop, hexThematique, maillesGeoJson, getisOrdGeoJson, selectedZoneId]);

  // 5. Rendu des vraies limites administratives des 13 communes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    communesLayerRef.current.clearLayers();
    if (!showCommunes || !communesGeoJson || !communesGeoJson.features?.length) return;

    const vulnByZoneId = new Map<number, IndiceVulnerabilite>();
    vulnerabilities.forEach((v) => vulnByZoneId.set(v.zone_id, v));

    const renderer = canvasRendererRef.current || undefined;
    const commLayer = L.geoJSON(communesGeoJson as any, {
      style: (feature) => {
        const zId = feature?.properties?.zone_id;
        const isSelected = selectedZoneId !== '' && Number(selectedZoneId) === zId;
        const vuln = vulnByZoneId.get(zId);

        if (communeChoropleth === 'vulnerabilite' && vuln) {
          return {
            renderer,
            fillColor: vuln.couleur,
            fillOpacity: isSelected ? 0.45 : showMaillesPop ? 0.2 : 0.52,
            color: isSelected ? '#8b5cf6' : '#0f172a',
            weight: isSelected ? 3.8 : 1.8,
          };
        }

        return {
          renderer,
          fillColor: isSelected ? '#8b5cf6' : '#0f172a',
          fillOpacity: isSelected ? 0.14 : 0.02,
          color: isSelected ? '#7c3aed' : '#0f172a',
          weight: isSelected ? 3.6 : 1.7,
        };
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        const vuln = vulnByZoneId.get(p.zone_id);
        const decompHtml =
          vuln && vuln.score_alea !== undefined
            ? `<b>Composantes (A × E × V) :</b> Aléa ${formatNumberFr(vuln.score_alea, 0)} · Expo. ${formatNumberFr(vuln.score_exposition ?? 0, 0)} · Vuln. ${formatNumberFr(vuln.score_vulnerabilite_soc ?? 0, 0)}<br/>
               <b>Topographie :</b> Alt. moy. ${formatNumberFr(vuln.altitude_moy_m ?? 0, 1)} m · Dist. hydro ${formatNumberFr(vuln.dist_hydro_moy_m ?? 0, 0)} m<br/>`
            : '';
        const popupHtml = `
          <div style="font-family: var(--font); font-size: 12.5px; line-height: 1.45; min-width: 245px;">
            <strong style="font-size: 14px; color: var(--tx);">Commune : ${p.nom}</strong>
            <span style="color: var(--tx2); font-size: 11px;"> (${p.code_adm})</span>
            <hr style="margin: 5px 0; border: none; border-top: 1px solid var(--line);"/>
            <b>Superficie (EPSG:32630) :</b> ${formatNumberFr(p.superficie_km2, 2)} km²<br/>
            <b>Population WorldPop 100 m :</b> ${formatNumberFr(p.population_totale, 0)} hab. (${formatNumberFr(p.densite_hab_km2, 0)} hab./km²)<br/>
            ${decompHtml}
            <b>Incidents rattachés :</b> ${p.nombre_incidents} (${p.incidents_pour_100k_hab} / 100k hab.)<br/>
            ${
              vuln
                ? `<b>Indice multicritère IV :</b> <span style="color:${vuln.couleur}; font-weight:700;">${vuln.indice_vulnerabilite}/100 (${(vuln.classe_jenks_label || vuln.classe_risque).toUpperCase()})</span><br/>`
                : ''
            }
            <span style="color: var(--tx3); font-size: 11px;">Source : ${p.source_geom}</span>
          </div>
        `;
        if (mode !== 'operationnel') {
          layer.bindPopup(popupHtml);
        }
        // En mode opérationnel : affichage strict du nom de la commune au survol (sans densité)
        layer.bindTooltip(mode === 'operationnel' ? p.nom : `${p.nom} (${formatNumberFr(p.densite_hab_km2, 0)} hab./km²)`, {
          sticky: true,
          direction: 'top',
        });

        // Gestion du clic communal :
        // - En mode opérationnel :
        //   1er clic : Sélection et cadrage/zoom sur la commune (sans popup, tous les incidents restent visibles)
        //   2ème clic : Affichage du mini-rapport opérationnel des incidents de la commune (avec détails)
        //   3ème clic sur un espace de la même commune : Fermeture du popup, désélection et dézoom vers la vue district (cadrage initial)
        // - En mode analyse : sélection et affichage de la fiche d'analyse
        layer.on('click', (e: L.LeafletMouseEvent) => {
          lastLayerClickTimeRef.current = Date.now();
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) {
            e.originalEvent.stopPropagation();
          }

          if (mode === 'operationnel') {
            const currentSelected = selectedZoneIdRef.current;
            const isSameZone = currentSelected !== '' && Number(currentSelected) === Number(p.zone_id);
            const isPopupOpen = Boolean(activeCommunePopupRef.current && map.hasLayer(activeCommunePopupRef.current));

            if (!isSameZone) {
              // 1er CLIC : Sélection et zoom sur la commune (sans popup)
              if (activeCommunePopupRef.current) {
                map.closePopup(activeCommunePopupRef.current);
                activeCommunePopupRef.current = null;
              }
              selectedZoneIdRef.current = p.zone_id;
              onSelectZoneId(p.zone_id);
            } else if (!isPopupOpen) {
              // 2ème CLIC : Affichage du mini-rapport opérationnel des incidents de la commune
              const allIncs: any[] = incidentsGeoJsonRef.current?.features || [];
              const zoneIncs = allIncs.filter(
                (f: any) => f.properties?.zone_id && Number(f.properties.zone_id) === Number(p.zone_id)
              );
              const nbTotal = zoneIncs.length;
              const nbDanger = zoneIncs.filter((f: any) => f.properties?.danger_immediat).length;
              const nbOuverts = zoneIncs.filter(
                (f: any) => ['ouvert', 'rouvert'].includes(f.properties?.statut) && !f.properties?.enqueteur_id
              ).length;
              const nbAffectes = zoneIncs.filter(
                (f: any) =>
                  f.properties?.statut === 'affecte' ||
                  (['ouvert', 'rouvert'].includes(f.properties?.statut) && f.properties?.enqueteur_id)
              ).length;
              const nbEvalues = zoneIncs.filter((f: any) => f.properties?.statut === 'evalue').length;
              const nbClotures = zoneIncs.filter((f: any) => f.properties?.statut === 'cloture').length;

              const opPopupHtml = `
                <div style="font-family: var(--font); color: var(--tx); background: var(--s1); border: 1px solid rgba(139, 92, 246, 0.5); border-radius: var(--r-md); padding: 14px; min-width: 260px; box-shadow: 0 12px 32px var(--shadow);">
                  <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--line);">
                    <div>
                      <div style="font-weight: 800; font-size: 15px; color: var(--tx);">Commune : ${p.nom}</div>
                      <div style="font-family: var(--mono); font-size: 10.5px; color: var(--tx3);">${p.code_adm || 'District Autonome'}</div>
                    </div>
                    <span style="font-family: var(--mono); font-size: 11px; font-weight: 700; background: rgba(139, 92, 246, 0.16); border: 1px solid rgba(139, 92, 246, 0.35); padding: 3px 8px; border-radius: 6px; color: #c084fc;">
                      ${nbTotal} dossier${nbTotal > 1 ? 's' : ''}
                    </span>
                  </div>

                  ${
                    nbDanger > 0
                      ? `<div style="margin-top: 8px; padding: 6px 8px; border-radius: 6px; background: color-mix(in srgb, var(--crit) 15%, transparent); color: var(--crit); font-family: var(--mono); font-size: 11px; font-weight: 700;">
                          ⚠ ${nbDanger} DANGER${nbDanger > 1 ? 'S' : ''} IMMÉDIAT${nbDanger > 1 ? 'S' : ''} DÉCLARÉ${nbDanger > 1 ? 'S' : ''}
                        </div>`
                      : ''
                  }

                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; font-family: var(--mono); font-size: 11px;">
                    <div style="background: var(--s2); padding: 6px 8px; border-radius: 6px;">
                      <div style="font-size: 9.5px; color: var(--tx3);">OUVERTS (À AFFECTER)</div>
                      <div style="font-weight: 700; color: var(--water); margin-top: 2px;">${nbOuverts}</div>
                    </div>
                    <div style="background: var(--s2); padding: 6px 8px; border-radius: 6px;">
                      <div style="font-size: 9.5px; color: var(--tx3);">AFFECTÉS (EN COURS)</div>
                      <div style="font-weight: 700; color: var(--water-hi); margin-top: 2px;">${nbAffectes}</div>
                    </div>
                    <div style="background: var(--s2); padding: 6px 8px; border-radius: 6px;">
                      <div style="font-size: 9.5px; color: var(--tx3);">ÉVALUÉS (TERRAIN)</div>
                      <div style="font-weight: 700; color: var(--ok); margin-top: 2px;">${nbEvalues}</div>
                    </div>
                    <div style="background: var(--s2); padding: 6px 8px; border-radius: 6px;">
                      <div style="font-size: 9.5px; color: var(--tx3);">CLÔTURÉS</div>
                      <div style="font-weight: 700; color: var(--tx3); margin-top: 2px;">${nbClotures}</div>
                    </div>
                  </div>

                  <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--line); font-size: 11px; color: var(--tx2); display: flex; justify-content: space-between;">
                    <span>Population : ${formatNumberFr(p.population_totale, 0)} hab.</span>
                    <span>${formatNumberFr(p.superficie_km2, 1)} km²</span>
                  </div>
                </div>
              `;

              const popup = L.popup({
                className: 'oid-tactical-leaflet-popup',
                autoClose: true,
                closeOnClick: false,
                autoPan: true,
                autoPanPadding: [24, 24],
              })
                .setLatLng(e.latlng)
                .setContent(opPopupHtml)
                .openOn(map);

              activeCommunePopupRef.current = popup;
              popup.on('remove', () => {
                if (activeCommunePopupRef.current === popup) {
                  activeCommunePopupRef.current = null;
                }
              });
            } else {
              // 3ème CLIC : Clic sur un espace de la même commune alors que le popup est ouvert
              // -> Fermeture du popup, désélection et dézoom vers la vue district (cadrage initial)
              if (activeCommunePopupRef.current) {
                map.closePopup(activeCommunePopupRef.current);
                activeCommunePopupRef.current = null;
              }
              selectedZoneIdRef.current = '';
              onSelectZoneId('');
            }
          } else {
            // Mode analyse : bascule de sélection
            if (selectedZoneId === p.zone_id) {
              onSelectZoneId('');
            } else {
              onSelectZoneId(p.zone_id);
            }
          }
        });

        layer.on('mouseover', (e: any) => {
          if (e.target?._path) {
            e.target._path.style.cursor = 'pointer';
          }
        });
      },
    });

    communesLayerRef.current.addLayer(commLayer);

    // Cadrage initial unique sur tout le District + 1 cran de zoom en mode opérationnel (ne se ré-exécute pas pour ne pas fermer les popups ouvertes)
    if (!hasInitialFitRef.current && commLayer.getBounds().isValid()) {
      hasInitialFitRef.current = true;
      if (mode === 'operationnel') {
        fitDistrictBoundsWithPlusOne(map, commLayer.getBounds(), false);
      } else {
        map.fitBounds(commLayer.getBounds(), { padding: [20, 20], maxZoom: 12 });
      }
    }
  }, [showCommunes, communeChoropleth, showMaillesPop, communesGeoJson, vulnerabilities, mode, selectedZoneId]);

  const getDistrictBounds = (): L.LatLngBounds | null => {
    const coords: L.LatLng[] = [];
    communesLayerRef.current.eachLayer((group: any) => {
      if (group.eachLayer) {
        group.eachLayer((l: any) => {
          if (l.getBounds && l.getBounds().isValid()) {
            coords.push(l.getBounds().getSouthWest());
            coords.push(l.getBounds().getNorthEast());
          }
        });
      }
    });
    if (coords.length > 0) {
      return L.latLngBounds(coords);
    }
    if (communesGeoJson && communesGeoJson.features?.length) {
      const tempLayer = L.geoJSON(communesGeoJson as any);
      if (tempLayer.getBounds().isValid()) {
        return tempLayer.getBounds();
      }
    }
    return null;
  };

  // Zoom dynamique lors de la sélection explicite d'une commune dans le sélecteur ou sur la carte
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const prevZoneId = prevSelectedZoneIdRef.current;
    prevSelectedZoneIdRef.current = selectedZoneId;

    if (selectedZoneId === '') {
      if (activeCommunePopupRef.current) {
        map.closePopup(activeCommunePopupRef.current);
        activeCommunePopupRef.current = null;
      }
      if (hasInitialFitRef.current && prevZoneId !== '') {
        const bounds = getDistrictBounds();
        if (bounds) {
          if (mode === 'operationnel') {
            fitDistrictBoundsWithPlusOne(map, bounds, true);
          } else {
            map.fitBounds(bounds, { padding: [20, 20], maxZoom: 12 });
          }
        }
      }
      return;
    }
    let foundBounds: L.LatLngBounds | null = null;
    communesLayerRef.current.eachLayer((group: any) => {
      if (group.eachLayer) {
        group.eachLayer((l: any) => {
          if (l.feature?.properties?.zone_id === Number(selectedZoneId)) {
            if (l.getBounds && l.getBounds().isValid()) {
              foundBounds = l.getBounds();
            }
          }
        });
      }
    });
    if (foundBounds) {
      map.fitBounds(foundBounds, { padding: [28, 28], maxZoom: 14 });
    }
  }, [selectedZoneId, mode]);

  const handleFitDistrict = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (activeCommunePopupRef.current) {
      map.closePopup(activeCommunePopupRef.current);
      activeCommunePopupRef.current = null;
    }
    prevSelectedZoneIdRef.current = '';
    selectedZoneIdRef.current = '';
    onSelectZoneId('');
    const bounds = getDistrictBounds();
    if (bounds) {
      fitDistrictBoundsWithPlusOne(map, bounds, true);
    }
  };

  // 6. Rendu des Corridors d'Inondation & Hotspots (ST_ClusterDBSCAN + ST_ConcaveHull)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const renderer = canvasRendererRef.current || undefined;
    hotspotsLayerRef.current.clearLayers();
    if (!showHotspots) return;

    hotspots.forEach((h) => {
      const color =
        h.niveau_recurrence === 'critique'
          ? '#b3261e'
          : h.niveau_recurrence === 'forte'
          ? '#ea580c'
          : '#d97706';

      const utmLine =
        h.centre.utm_e && h.centre.utm_n
          ? `<b>Centroïde UTM 30N :</b> E ${formatNumberFr(h.centre.utm_e, 0)} m · N ${formatNumberFr(h.centre.utm_n, 0)} m<br/>`
          : '';

      const areaLine =
        h.superficie_cluster_km2 !== undefined
          ? `<b>Emprise concave (UTM 30N) :</b> ${formatNumberFr(h.superficie_cluster_km2, 3)} km² (périmètre ${formatNumberFr(h.perimetre_m ?? 0, 0)} m)<br/>`
          : '';

      const obsLine =
        h.nombre_observations !== undefined
          ? `<b>Observations DBSCAN :</b> ${h.nombre_observations} (${h.nombre_incidents} incident(s), ${h.nombre_signalements ?? 0} signalement(s))<br/>`
          : `<b>Incidents agrégés :</b> ${h.nombre_incidents}<br/>`;

      const popupHtml = `
        <div style="font-family: var(--font); font-size: 12.5px; line-height: 1.45; min-width: 235px;">
          <strong style="font-size: 13.5px; color: ${color};">Corridor DBSCAN #${h.cluster_id} (${h.niveau_recurrence.toUpperCase()})</strong><br/>
          <span style="color: var(--tx2); font-size: 11px;">${h.algorithme || 'ST_ClusterDBSCAN + ST_ConcaveHull (EPSG:32630)'}</span>
          <hr style="margin: 5px 0; border: none; border-top: 1px solid var(--line);"/>
          ${utmLine}
          ${areaLine}
          ${obsLine}
          <b>Priorité moyenne :</b> ${h.score_moyen_priorite} / 100<br/>
          <b>Typologies :</b> ${h.types_dominants.join(', ')}
        </div>
      `;

      if (h.emprise_geojson) {
        const hullLayer = L.geoJSON(h.emprise_geojson as any, {
          style: () => ({
            renderer,
            fillColor: color,
            fillOpacity: 0.28,
            color,
            weight: 2.6,
            dashArray: '6, 4',
          }),
        });
        hullLayer.bindPopup(popupHtml);
        hotspotsLayerRef.current.addLayer(hullLayer);
      }

      const marker = L.circleMarker([h.centre.lat, h.centre.lon], {
        renderer,
        radius: 8,
        fillColor: color,
        color: '#ffffff',
        weight: 2.2,
        opacity: 1,
        fillOpacity: 0.95,
      });
      marker.bindPopup(popupHtml);
      hotspotsLayerRef.current.addLayer(marker);
    });
  }, [showHotspots, hotspots]);

  // 7. Rendu des Zones Silencieuses (Modèle de Poisson)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const renderer = canvasRendererRef.current || undefined;
    silentLayerRef.current.clearLayers();
    if (!showSilent) return;

    silentZones.forEach((z) => {
      const sColor = z.niveau_severite === 'haute' ? '#b91c1c' : '#d97706';
      const poissonLine =
        z.observe !== undefined && z.attendu !== undefined
          ? `<b>Modèle de Poisson :</b> O<sub>i</sub> = <b>${z.observe}</b> observé(s) vs E<sub>i</sub> = <b>${formatNumberFr(z.attendu, 2)}</b> attendu(s) (${z.ecart_relatif_pct !== undefined && z.ecart_relatif_pct >= 0 ? '+' : ''}${formatNumberFr(z.ecart_relatif_pct ?? 0, 0)} %)<br/>
             <b>Test statistique :</b> r<sub>D</sub> = <code>${formatNumberFr(z.residu_poisson ?? 0, 2)}</code> · p = <code>${formatNumberFr(z.p_value_poisson ?? 0, 3)}</code><br/>`
          : '';

      const silentPopup = `
        <div style="font-family: var(--font); font-size: 12.5px; line-height: 1.45; min-width: 245px;">
          <strong style="color: ${sColor};">Zone silencieuse : ${z.zone_nom}</strong><br/>
          <span style="font-size: 11px; font-weight: 700; color: ${sColor};">${z.statut_alerte}</span>
          <hr style="margin: 5px 0; border: none; border-top: 1px solid var(--line);"/>
          ${poissonLine}
          <p style="margin: 4px 0; color: var(--tx2);">${z.motif}</p>
          <b>Action :</b> ${z.action_requise}
        </div>
      `;

      if (z.geojson) {
        const zPoly = L.geoJSON(z.geojson as any, {
          style: () => ({
            renderer,
            fillColor: sColor,
            fillOpacity: 0.12,
            color: sColor,
            weight: 2.4,
            dashArray: '7, 5',
          }),
        });
        zPoly.bindPopup(silentPopup);
        silentLayerRef.current.addLayer(zPoly);
      }

      if (z.centre) {
        const alertMarker = L.circleMarker([z.centre.lat, z.centre.lon], {
          renderer,
          radius: 10,
          fillColor: sColor,
          color: '#ffffff',
          weight: 2.5,
          fillOpacity: 0.92,
        });
        alertMarker.bindPopup(silentPopup);
        silentLayerRef.current.addLayer(alertMarker);
      }
    });
  }, [showSilent, silentZones]);

  // 8. Rendu des Incidents Opérationnels (Couche SVG haute réactivité avec persistance de popup)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    incidentsLayerRef.current.clearLayers();
    if (!showIncidents || !incidentsGeoJson?.features) return;

    const q = (searchRef || '').trim().toLowerCase();
    const allIncidents: any[] = incidentsGeoJson.features || [];
    const featsToRender = allIncidents.filter((feat) => {
      if (mode !== 'operationnel') return true;
      const p = feat.properties || {};
      if (statusFilter === 'danger' && !p.danger_immediat) return false;
      if (statusFilter === 'ouverts' && !['ouvert', 'affecte', 'rouvert'].includes(p.statut)) return false;
      if (statusFilter === 'evalues' && p.statut !== 'evalue') return false;
      if (statusFilter === 'clotures' && p.statut !== 'cloture') return false;
      // Note : les incidents des autres communes restent toujours visibles au clic sur une commune
      if (q) {
        const refMatch = (p.reference_publique || '').toLowerCase().includes(q);
        const idMatch = String(p.id).includes(q);
        const typeMatch = (p.type || '').toLowerCase().includes(q);
        if (!refMatch && !idMatch && !typeMatch) return false;
      }
      return true;
    });

    const markersById = new Map<number, L.CircleMarker>();
    const c = leafletPalette();

    featsToRender.forEach((feat: any) => {
      const [lon, lat] = feat.geometry.coordinates;
      if (typeof lat !== 'number' || typeof lon !== 'number') return;
      const isDanger = Boolean(feat.properties.danger_immediat);
      const statut = feat.properties.statut || 'ouvert';
      const pColor = isDanger
        ? c.crit
        : statut === 'cloture'
        ? c.tx3
        : statut === 'evalue'
        ? c.ok
        : c.water;

      const isSelectedCommuneIncident =
        selectedZoneId !== '' && feat.properties.zone_id && Number(feat.properties.zone_id) === Number(selectedZoneId);

      // SVG Renderer dédié dans le panneau prioritaire incidentsPane pour garantir la visibilité au-dessus des polygones
      const pMarker = L.circleMarker([lat, lon], {
        renderer: svgRendererRef.current || undefined,
        pane: 'incidentsPane',
        radius: isDanger
          ? (isSelectedCommuneIncident ? 11.5 : 9.5)
          : (isSelectedCommuneIncident ? 9 : 7),
        fillColor: pColor,
        color: c.surface,
        weight: isSelectedCommuneIncident ? 2.8 : 2,
        opacity: 1,
        fillOpacity: selectedZoneId === '' || isSelectedCommuneIncident ? 0.95 : 0.85,
      });

      const popupHtml = `
        <div style="font-family: var(--font); color: var(--tx); background: var(--s1); border: 1px solid var(--line); border-radius: var(--r-md); padding: 12px; min-width: 245px; box-shadow: 0 12px 32px var(--shadow);">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--line);">
            <div>
              <div style="font-weight: 800; font-size: 14px; color: var(--tx);">Incident #${feat.properties.id} (${feat.properties.type})</div>
              <div style="font-family: var(--mono); font-size: 10.5px; color: var(--tx3);">Réf : ${(feat.properties.reference_publique || '').slice(0, 16).toUpperCase()}</div>
            </div>
          </div>
          ${
            isDanger
              ? `<div style="margin-top: 8px; padding: 6px 8px; border-radius: 6px; background: color-mix(in srgb, ${c.crit} 15%, transparent); color: ${c.crit}; font-family: var(--mono); font-size: 10.5px; font-weight: 700;">
                  ⚠ DANGER IMMÉDIAT DÉCLARÉ — ÉVACUATION / SECOURS PRIORITAIRE
                </div>`
              : ''
          }
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; font-family: var(--mono); font-size: 11px;">
            <div style="background: var(--s2); padding: 6px 8px; border-radius: 6px;">
              <div style="font-size: 9.5px; color: var(--tx3);">STATUT ACTUEL</div>
              <div style="font-weight: 700; color: ${pColor}; text-transform: uppercase; margin-top: 2px;">${statut}</div>
            </div>
            <div style="background: var(--s2); padding: 6px 8px; border-radius: 6px;">
              <div style="font-size: 9.5px; color: var(--tx3);">PRIORITÉ O.I.D</div>
              <div style="font-weight: 700; color: ${isDanger ? c.crit : c.water}; margin-top: 2px;">${feat.properties.score_priorite ?? 0} pts</div>
            </div>
          </div>
          <div style="margin-top: 8px; font-size: 11.5px; color: var(--tx2);">
            📍 WGS84 : ${lat.toFixed(4)}° N, ${Math.abs(lon).toFixed(4)}° W
          </div>
          <div style="margin-top: 10px; display: flex; gap: 6px;">
            <button
              type="button"
              data-incident-action="open-dossier"
              data-incident-id="${feat.properties.id}"
              style="flex: 1; text-align: center; border: none; cursor: pointer; background: ${c.water}; color: var(--water-ink); font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 12px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-family: var(--font);"
            >
              <span class="material-symbols-outlined" style="font-size: 15px; font-weight: 700; line-height: 1;">folder_open</span>
              <span>Ouvrir Dossier #${feat.properties.id}</span>
            </button>
          </div>
        </div>
      `;

      // Options garantissant la persistance de la popup : closeOnClick=false empêche la fermeture intempestive au clic carte
      pMarker.bindPopup(popupHtml, {
        className: 'oid-tactical-leaflet-popup',
        autoClose: true,
        closeOnClick: false,
        autoPan: true,
        autoPanPadding: [24, 24],
      });

      pMarker.on('popupopen', () => {
        openIncidentIdRef.current = feat.properties.id;
      });

      pMarker.on('popupclose', () => {
        if (openIncidentIdRef.current === feat.properties.id) {
          openIncidentIdRef.current = null;
        }
      });

      pMarker.on('click', (e: L.LeafletMouseEvent) => {
        lastLayerClickTimeRef.current = Date.now();
        if (e.originalEvent) {
          e.originalEvent.stopPropagation();
        }
        if (onRequestAssign) {
          onRequestAssign(feat.properties.id);
        }
      });

      markersById.set(feat.properties.id, pMarker);
      incidentsLayerRef.current.addLayer(pMarker);
    });

    // Maintien automatique de la popup ouverte en cas de réévaluation des incidents
    if (openIncidentIdRef.current !== null) {
      const activeMarker = markersById.get(openIncidentIdRef.current);
      if (activeMarker) {
        activeMarker.openPopup();
      }
    }
  }, [showIncidents, incidentsGeoJson, mode, statusFilter, selectedZoneId, searchRef, onRequestAssign]);

  const jenksMeta = maillesGeoJson?.classification;
  const totalHexCount =
    hexThematique === 'getis_ord'
      ? getisOrdGeoJson?.features?.length || 0
      : maillesGeoJson?.total_mailles || 0;

  const allIncidentsList: any[] = incidentsGeoJson?.features || [];
  const incidentCounts = {
    tous: allIncidentsList.length,
    danger: allIncidentsList.filter((f) => f.properties?.danger_immediat).length,
    ouverts: allIncidentsList.filter((f) => ['ouvert', 'affecte', 'rouvert'].includes(f.properties?.statut)).length,
    evalues: allIncidentsList.filter((f) => f.properties?.statut === 'evalue').length,
    clotures: allIncidentsList.filter((f) => f.properties?.statut === 'cloture').length,
  };

  const hasActiveFilters = Boolean(
    (selectedZoneId !== '' && selectedZoneId != null) ||
    (statusFilter && statusFilter !== 'tous') ||
    (searchRef && searchRef.trim() !== '')
  );

  const handleResetFilters = () => {
    onSelectZoneId('');
    if (onChangeStatusFilter) {
      onChangeStatusFilter('tous');
    }
    if (onChangeSearchRef) {
      onChangeSearchRef('');
    }
  };

  return (
    <div className="sig-map-wrapper">
      {/* Canevas cartographique avec Flèche du Nord et Coordonnées UTM 30N en surimpression */}
      <div style={{ position: 'relative', overflow: 'hidden', isolation: 'isolate', zIndex: 1 }}>
        <div
          ref={mapContainerRef}
          style={{
            width: '100%',
            height: '560px',
            borderLeft: '1px solid var(--border-color)',
            borderRight: '1px solid var(--border-color)',
            zIndex: 10,
          }}
        />

        {/* Bouton icône de couches situé directement sous les boutons + et - de Leaflet */}
        <button
          type="button"
          onClick={handleToggleLayersDrawer}
          className={`oid-map-layers-toggle-btn ${isLayersDrawerOpen ? 'is-active' : ''}`}
          title="Fonds et couches de la carte"
          aria-label="Ouvrir le panneau des fonds et couches cartographiques"
        >
          <Layers size={17} />
        </button>

        {/* Bouton icône de filtres situé directement sous le bouton de couches */}
        <button
          type="button"
          onClick={handleToggleFiltersDrawer}
          className={`oid-map-filters-toggle-btn ${isFiltersDrawerOpen ? 'is-active' : ''} ${hasActiveFilters ? 'has-filter' : ''}`}
          title="Filtres & Recherche d'incidents"
          aria-label="Ouvrir le panneau des filtres et recherche"
        >
          <Filter size={16} />
        </button>

        {/* Bouton icône du volet des indicateurs stratégiques (250px) */}
        {onToggleKpiSidebar && (
          <button
            type="button"
            onClick={onToggleKpiSidebar}
            className={`oid-map-kpi-toggle-btn ${isKpiSidebarOpen ? 'is-active' : ''}`}
            title={isKpiSidebarOpen ? 'Masquer le volet indicateurs (250px)' : 'Afficher le volet indicateurs (250px)'}
            aria-label="Afficher ou masquer les indicateurs stratégiques"
          >
            <BarChart2 size={16} />
          </button>
        )}

        {/* Volet latéral (Sidebar Drawer) des Fonds & Couches */}
        {isLayersDrawerOpen && (
          <div
            ref={drawerRef}
            className="oid-map-layers-drawer"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="oid-drawer-header">
              <div className="oid-drawer-title">
                <Layers size={16} style={{ color: 'var(--water)' }} />
                <span>Fonds &amp; Couches</span>
              </div>
              <button
                type="button"
                onClick={() => setIsLayersDrawerOpen(false)}
                className="oid-drawer-close-btn"
                title="Fermer le volet"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="oid-drawer-body">
              {/* 1. SECTION FONDS DE PLAN */}
              <div>
                <div className="oid-drawer-section-title">
                  <Layers size={13} />
                  <span>Fond de Plan</span>
                </div>
                <div className="oid-drawer-basemaps-grid">
                  {Object.entries(BASEMAPS).map(([key, cfg]) => {
                    const isActive = basemap === key;
                    const shortName =
                      key === 'sobre'
                        ? 'Gris Clair OID'
                        : key === 'hot'
                        ? 'HOT Crise'
                        : key === 'osm'
                        ? 'OSM Couleur'
                        : 'Topographique';
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setBasemap(key as BasemapKey)}
                        className={`oid-drawer-basemap-card ${isActive ? 'is-active' : ''}`}
                        title={cfg.label}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <span style={{ fontWeight: 700 }}>{shortName}</span>
                          {isActive && <span style={{ color: 'var(--water)', fontSize: '11px' }}>✓</span>}
                        </div>
                        <div style={{ fontSize: '9.5px', opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {cfg.label.split('(')[0].trim()}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. SECTION COUCHES GÉOGRAPHIQUES */}
              <div>
                <div className="oid-drawer-section-title">
                  <Eye size={13} />
                  <span>Couches Visibles</span>
                </div>

                <div className="oid-drawer-layers-list">
                  {/* Couche Incidents */}
                  <div
                    className="oid-drawer-layer-item"
                    onClick={() => setShowIncidents((prev) => !prev)}
                  >
                    <div className="oid-drawer-layer-left">
                      <MapPin size={15} style={{ color: 'var(--water)' }} />
                      <span>Incidents Opérationnels</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '10.5px', fontFamily: 'var(--mono)', color: 'var(--tx3)' }}>
                        {incidentCounts.tous}
                      </span>
                      <div className={`oid-drawer-switch ${showIncidents ? 'is-on' : ''}`}>
                        <div className="oid-drawer-switch-thumb" />
                      </div>
                    </div>
                  </div>

                  {/* Couche Limites Administratives */}
                  <div
                    className="oid-drawer-layer-item"
                    onClick={() => setShowCommunes((prev) => !prev)}
                  >
                    <div className="oid-drawer-layer-left">
                      <Layers size={15} style={{ color: 'var(--water-hi)' }} />
                      <span>Limites des 13 Communes</span>
                    </div>
                    <div className={`oid-drawer-switch ${showCommunes ? 'is-on' : ''}`}>
                      <div className="oid-drawer-switch-thumb" />
                    </div>
                  </div>

                  {/* Mode choroplèthe si communes activées (mode analyse) */}
                  {showCommunes && mode !== 'operationnel' && (
                    <div style={{ padding: '2px 8px 6px 28px', marginTop: '-4px' }}>
                      <select
                        value={communeChoropleth}
                        onChange={(e) => setCommuneChoropleth(e.target.value as 'contour' | 'vulnerabilite')}
                        className="sig-select-compact"
                        style={{ width: '100%', fontSize: '11px' }}
                      >
                        <option value="contour">Contours administratifs seuls</option>
                        <option value="vulnerabilite">Choroplèthe indice IV communal</option>
                      </select>
                    </div>
                  )}

                  {/* Couches analytiques en mode analyse */}
                  {mode !== 'operationnel' && (
                    <>
                      {/* Hexagones 300 m */}
                      <div
                        className="oid-drawer-layer-item"
                        onClick={() => setShowMaillesPop((prev) => !prev)}
                      >
                        <div className="oid-drawer-layer-left">
                          <Grid size={15} color="#d95f0e" />
                          <span>Hexagones 300 m</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '10.5px', fontFamily: 'var(--mono)', color: 'var(--tx3)' }}>
                            {totalHexCount}
                          </span>
                          <div className={`oid-drawer-switch ${showMaillesPop ? 'is-on' : ''}`}>
                            <div className="oid-drawer-switch-thumb" />
                          </div>
                        </div>
                      </div>

                      {showMaillesPop && (
                        <div style={{ padding: '2px 8px 6px 28px', marginTop: '-4px' }}>
                          <select
                            value={hexThematique}
                            onChange={(e) => onChangeHexThematique && onChangeHexThematique(e.target.value as HexThematique)}
                            className="sig-select-compact"
                            style={{ width: '100%', fontSize: '11px' }}
                          >
                            <option value="densite">Densité WorldPop 100 m</option>
                            <option value="alea">Aléa physique MNT + Hydro</option>
                            <option value="vulnerabilite">Risque multicritère A×E×V</option>
                            <option value="getis_ord">Points chauds Getis-Ord Gi*</option>
                          </select>
                        </div>
                      )}

                      {/* Corridors DBSCAN */}
                      <div
                        className="oid-drawer-layer-item"
                        onClick={() => setShowHotspots((prev) => !prev)}
                      >
                        <div className="oid-drawer-layer-left">
                          <Flame size={15} color="#b3261e" />
                          <span>Corridors &amp; Hotspots</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '10.5px', fontFamily: 'var(--mono)', color: 'var(--tx3)' }}>
                            {hotspots.length}
                          </span>
                          <div className={`oid-drawer-switch ${showHotspots ? 'is-on' : ''}`}>
                            <div className="oid-drawer-switch-thumb" />
                          </div>
                        </div>
                      </div>

                      {/* Zones Silencieuses Poisson */}
                      <div
                        className="oid-drawer-layer-item"
                        onClick={() => setShowSilent((prev) => !prev)}
                      >
                        <div className="oid-drawer-layer-left">
                          <VolumeX size={15} color="#b91c1c" />
                          <span>Zones Silencieuses (Poisson)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '10.5px', fontFamily: 'var(--mono)', color: 'var(--tx3)' }}>
                            {silentZones.length}
                          </span>
                          <div className={`oid-drawer-switch ${showSilent ? 'is-on' : ''}`}>
                            <div className="oid-drawer-switch-thumb" />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Volet latéral (Sidebar Drawer) des Filtres & Recherche */}
        {isFiltersDrawerOpen && (
          <div
            ref={filtersDrawerRef}
            className="oid-map-filters-drawer"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="oid-drawer-header">
              <div className="oid-drawer-title">
                <Filter size={16} style={{ color: 'var(--water)' }} />
                <span>Filtres &amp; Recherche</span>
              </div>
              <button
                type="button"
                onClick={() => setIsFiltersDrawerOpen(false)}
                className="oid-drawer-close-btn"
                title="Fermer le volet"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="oid-drawer-body">
              {/* 1. RECHERCHE TEXTUELLE */}
              {onChangeSearchRef && (
                <div>
                  <div className="oid-drawer-section-title">
                    <Search size={13} />
                    <span>Recherche Rapide</span>
                  </div>
                  <div className="oid-drawer-search-wrap">
                    <span className="oid-drawer-search-icon">
                      <Search size={14} />
                    </span>
                    <input
                      type="text"
                      value={searchRef || ''}
                      onChange={(e) => onChangeSearchRef(e.target.value)}
                      placeholder="Réf. incident (#12, OID-ABJ...)"
                      className="oid-drawer-search-input"
                    />
                    {searchRef && (
                      <button
                        type="button"
                        onClick={() => onChangeSearchRef('')}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--tx3)',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                        }}
                        title="Effacer la recherche"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* 2. FILTRAGE PAR COMMUNE & CADRAGE */}
              <div>
                <div className="oid-drawer-section-title">
                  <CompassIcon size={13} />
                  <span>Ciblage Territorial</span>
                </div>
                <select
                  value={selectedZoneId}
                  onChange={(e) => onSelectZoneId(e.target.value ? Number(e.target.value) : '')}
                  className="oid-drawer-select"
                  aria-label="Sélectionner une commune"
                >
                  <option value="">
                    District d'Abidjan (10 urbaines + 3 périphériques)
                  </option>
                  {communesGeoJson?.features.map((f: any) => (
                    <option key={f.properties.zone_id} value={f.properties.zone_id}>
                      {f.properties.nom} ({formatNumberFr(f.properties.population_totale, 0)} hab. · {f.properties.superficie_km2} km²)
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleFitDistrict}
                  className="oid-drawer-reset-btn"
                  style={{ marginTop: '8px', borderColor: 'color-mix(in srgb, var(--water) 30%, transparent)', color: 'var(--water)' }}
                  title="Recentrer et ajuster la vue sur l'ensemble du District d'Abidjan"
                >
                  <RotateCcw size={13} />
                  <span>Cadrer tout le District</span>
                </button>
              </div>

              {/* 3. FILTRAGE PAR STATUT D'INCIDENT (ACCORDÉON / COLLAPSIBLE) */}
              {onChangeStatusFilter && (
                <div>
                  <div
                    onClick={() => setStatusCollapseOpen((prev) => !prev)}
                    className="oid-drawer-collapse-header"
                    title={statusCollapseOpen ? 'Replier les statuts' : 'Déplier les statuts'}
                  >
                    <div className="oid-drawer-section-title" style={{ marginBottom: 0 }}>
                      <Filter size={13} />
                      <span>Statut des Incidents</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontFamily: 'var(--mono)',
                          color: statusFilter && statusFilter !== 'tous' ? 'var(--water)' : 'var(--tx3)',
                          fontWeight: 700,
                        }}
                      >
                        {statusFilter === 'danger'
                          ? 'Danger'
                          : statusFilter === 'ouverts'
                          ? 'Ouverts'
                          : statusFilter === 'evalues'
                          ? 'Évalués'
                          : statusFilter === 'clotures'
                          ? 'Clôturés'
                          : `Tous (${incidentCounts.tous})`}
                      </span>
                      <ChevronDown
                        size={15}
                        className={`oid-drawer-chevron ${statusCollapseOpen ? 'is-open' : ''}`}
                      />
                    </div>
                  </div>

                  {statusCollapseOpen && (
                    <div className="oid-drawer-status-chips" style={{ marginTop: '8px' }}>
                      {[
                        { key: 'tous', label: 'Tous les statuts', count: incidentCounts.tous, color: 'var(--water)' },
                        { key: 'danger', label: '⚠ Danger immédiat', count: incidentCounts.danger, color: 'var(--crit)' },
                        { key: 'ouverts', label: 'Ouverts & Affectés', count: incidentCounts.ouverts, color: 'var(--water-hi)' },
                        { key: 'evalues', label: 'Évalués (terrain)', count: incidentCounts.evalues, color: 'var(--ok)' },
                        { key: 'clotures', label: 'Clôturés (résolus)', count: incidentCounts.clotures, color: 'var(--tx3)' },
                      ].map((st) => {
                        const isActive = (statusFilter || 'tous') === st.key;
                        return (
                          <div
                            key={st.key}
                            onClick={() => onChangeStatusFilter(st.key as any)}
                            className={`oid-drawer-status-chip ${isActive ? 'is-active' : ''}`}
                          >
                            <span style={{ color: isActive ? st.color : 'inherit' }}>{st.label}</span>
                            <span
                              style={{
                                fontFamily: 'var(--mono)',
                                fontSize: '10.5px',
                                background: isActive ? 'rgba(0, 229, 255, 0.15)' : 'var(--s1)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                color: isActive ? st.color : 'var(--tx3)',
                                fontWeight: 700,
                              }}
                            >
                              {st.count}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 4. MODE ANALYSE : THÉMATIQUE DES MAILLES */}
              {mode !== 'operationnel' && onChangeHexThematique && (
                <div>
                  <div className="oid-drawer-section-title">
                    <Activity size={13} />
                    <span>Thématique Mailles 300 m</span>
                  </div>
                  <select
                    value={hexThematique}
                    onChange={(e) => onChangeHexThematique(e.target.value as HexThematique)}
                    className="oid-drawer-select"
                    aria-label="Thématique du maillage hexagonal 300 m"
                  >
                    <option value="densite">Densité WorldPop 100 m</option>
                    <option value="alea">Aléa physique MNT + Hydro</option>
                    <option value="vulnerabilite">Risque multicritère A × E × V</option>
                    <option value="getis_ord">Points chauds Getis-Ord Gi*</option>
                  </select>
                </div>
              )}

              {/* 5. RÉINITIALISATION DES FILTRES */}
              {hasActiveFilters && (
                <div style={{ marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--line)' }}>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="oid-drawer-reset-btn"
                  >
                    <RotateCcw size={13} />
                    <span>Réinitialiser tous les filtres</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Légende flottante opérationnelle (centrée en bas au plus près du bord, sans titre, sur une ligne) */}
        {mode === 'operationnel' && (
          <div
            className="oid-map-floating-legend"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="oid-map-floating-legend-item" title="Danger immédiat">
              <span className="oid-dot bg-coral pulse" />
              <span>Danger</span>
              <span className="oid-map-floating-legend-count">({incidentCounts.danger})</span>
            </div>
            <div className="oid-map-floating-legend-item" title="Ouvert / En intervention">
              <span className="oid-dot bg-cyan" />
              <span>Ouvert / Interv.</span>
              <span className="oid-map-floating-legend-count">({incidentCounts.ouverts})</span>
            </div>
            <div className="oid-map-floating-legend-item" title="Évalué terrain">
              <span className="oid-dot bg-green" />
              <span>Évalué</span>
              <span className="oid-map-floating-legend-count">({incidentCounts.evalues})</span>
            </div>
            <div className="oid-map-floating-legend-item" title="Clôturé">
              <span className="oid-dot bg-slate" />
              <span>Clôturé</span>
              <span className="oid-map-floating-legend-count">({incidentCounts.clotures})</span>
            </div>
            <div className="oid-map-floating-legend-item" title="Limites administratives (13 communes)">
              <span
                style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '8px',
                  border: '1.5px dashed #0284c7',
                  background: 'rgba(2, 132, 199, 0.14)',
                  borderRadius: '2px',
                }}
              />
              <span>Limites (13)</span>
            </div>
          </div>
        )}

        {/* Flèche du Nord géomatique (SVG) */}
        <div className="sig-north-arrow" title="Nord géographique / UTM Zone 30N">
          <svg width="32" height="40" viewBox="0 0 32 40" aria-hidden="true">
            <text x="16" y="11" textAnchor="middle" fontSize="11" fontWeight="800" fill="#0b1f3a">
              N
            </text>
            <polygon points="16,14 25,36 16,30" fill="#0b1f3a" />
            <polygon points="16,14 7,36 16,30" fill="#94a3b8" stroke="#0b1f3a" strokeWidth="0.8" />
          </svg>
        </div>

        {/* Barre temps réel des coordonnées curseur (WGS84 + EPSG:32630) - compacte et discrète */}
        <div className="sig-coords-overlay">
          {cursorCoords ? (
            <>
              <span>
                {cursorCoords.lat.toFixed(4)}°N, {Math.abs(cursorCoords.lon).toFixed(4)}°W
              </span>
              <span className="sig-coords-sep">·</span>
              <span>
                UTM {formatNumberFr(cursorCoords.easting, 0)}E {formatNumberFr(cursorCoords.northing, 0)}N
              </span>
            </>
          ) : (
            <span>WGS84 · UTM 30N</span>
          )}
        </div>
      </div>

      {/* Légende Statistique Graduée (Fisher-Jenks ou Getis-Ord Gi*) & Cartouche de Sources (Mode Analyse uniquement) */}
      {mode !== 'operationnel' && (
        <div className="sig-map-legend-panel">
          {hexThematique === 'getis_ord' && getisOrdGeoJson ? (
            <div className="sig-jenks-block">
              <div className="sig-jenks-header">
                <strong>
                  Autocorrélation spatiale locale Getis-Ord Gi* — Voisinage euclidien d ≤ {getisOrdGeoJson.rayon_voisinage_m} m (EPSG:32630)
                </strong>
                <span className="sig-gvf-badge" title="Score Z maximal observé sur le maillage">
                  Pic Z(Gi*) = {getisOrdGeoJson.resume.z_max >= 0 ? '+' : ''}
                  {formatNumberFr(getisOrdGeoJson.resume.z_max, 2)} · Mailles chaudes :{' '}
                  {getisOrdGeoJson.resume.nb_hotspots_99 +
                    getisOrdGeoJson.resume.nb_hotspots_95 +
                    getisOrdGeoJson.resume.nb_hotspots_90}
                </span>
              </div>
              <div className="sig-jenks-scale">
                {getisOrdGeoJson.legende.map((item) => (
                  <div key={item.classe} className="sig-jenks-class-item">
                    <span className="sig-jenks-swatch" style={{ backgroundColor: item.couleur }} />
                    <span>
                      {item.label}
                      {item.count !== undefined && (
                        <small style={{ color: 'var(--tx3)', marginLeft: '4px' }}>({item.count})</small>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            jenksMeta &&
            jenksMeta.breaks.length >= 2 && (
              <div className="sig-jenks-block">
                <div className="sig-jenks-header">
                  <strong>{HEX_THEMATIQUE_TITLES[hexThematique === 'getis_ord' ? 'densite' : hexThematique]}</strong>
                  <span className="sig-gvf-badge" title="Goodness of Variance Fit (qualité d'ajustement de Fisher-Jenks)">
                    Fisher-Jenks · GVF = {jenksMeta.gvf.toFixed(3)}
                  </span>
                </div>
                <div className="sig-jenks-scale">
                  {jenksMeta.palette.map((color, idx) => {
                    const low = jenksMeta.breaks[idx] ?? 0;
                    const high = jenksMeta.breaks[idx + 1] ?? low;
                    const count = jenksMeta.counts[idx] ?? 0;
                    const dec = hexThematique === 'densite' ? 0 : 1;
                    return (
                      <div key={idx} className="sig-jenks-class-item">
                        <span className="sig-jenks-swatch" style={{ backgroundColor: color }} />
                        <span>
                          {formatNumberFr(low, dec)} – {formatNumberFr(high, dec)}
                          <small style={{ color: 'var(--tx3)', marginLeft: '4px' }}>({count})</small>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}

          <div className="sig-sources-cartouche">
            <span>
              <strong>SCR Calcul :</strong> {sigMetadata?.scr_calcul || 'EPSG:32630 (WGS 84 / UTM zone 30N)'}
            </span>
            <span>•</span>
            <span>
              <strong>Limites &amp; Hydro :</strong> OpenStreetMap (ODbL) / OCHA COD-AB (13 communes)
            </span>
            <span>•</span>
            <span>
              <strong>Démographie &amp; Relief :</strong> WorldPop 100 m (CC-BY 4.0) · MNT SRTM-Copernicus (~38 m)
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
