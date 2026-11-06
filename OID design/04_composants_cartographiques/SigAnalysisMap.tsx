import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Flame, VolumeX, Eye, MapPin, Grid, Layers, Compass as CompassIcon, Activity } from 'lucide-react';

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

interface SigAnalysisMapProps {
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

export const SigAnalysisMap: React.FC<SigAnalysisMapProps> = ({
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
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const canvasRendererRef = useRef<L.Canvas | null>(null);

  // Groupes de couches ordonnés (du fond thématique vers les ponctuels d'alerte)
  const maillesLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const communesLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const silentLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const hotspotsLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const incidentsLayerRef = useRef<L.LayerGroup>(L.layerGroup());

  const [basemap, setBasemap] = useState<BasemapKey>('sobre');
  const [showMaillesPop, setShowMaillesPop] = useState(true);
  const [showCommunes, setShowCommunes] = useState(true);
  const [communeChoropleth, setCommuneChoropleth] = useState<'contour' | 'vulnerabilite'>('contour');
  const [showHotspots, setShowHotspots] = useState(true);
  const [showSilent, setShowSilent] = useState(true);
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
      }).setView([5.36, -4.01], 11);

      const bm = BASEMAPS[basemap];
      tileLayerRef.current = L.tileLayer(bm.url, {
        attribution: bm.attribution,
        maxZoom: bm.maxZoom,
        className: bm.tileClassName || '',
      }).addTo(map);

      // Barre d'échelle métrique réglementaire (sans unités impériales)
      L.control
        .scale({
          metric: true,
          imperial: false,
          maxWidth: 160,
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

      mapInstanceRef.current = map;
    }

    return () => {
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
  }, [focusTarget]);

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
            <div style="font-family: sans-serif; font-size: 12.5px; line-height: 1.45; min-width: 235px;">
              <strong style="font-size: 13.5px; color: #0b1f3a;">Autocorrélation Getis-Ord Gi* — ${p.code_maille}</strong><br/>
              <span style="color: #475569; font-weight: 600;">Commune : ${p.zone_nom}</span>
              <hr style="margin: 5px 0; border: none; border-top: 1px solid #e2e8f0;"/>
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
          color: '#64748b',
          weight: 0.3,
          opacity: 0.45,
        };
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        const popupHtml = `
          <div style="font-family: sans-serif; font-size: 12.5px; line-height: 1.45; min-width: 235px;">
            <strong style="font-size: 13.5px; color: #0b1f3a;">Maille ${p.code_maille}</strong><br/>
            <span style="color: #475569; font-weight: 600;">Commune : ${p.zone_nom}</span>
            <hr style="margin: 5px 0; border: none; border-top: 1px solid #e2e8f0;"/>
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
            fillOpacity: showMaillesPop ? 0.2 : 0.52,
            color: isSelected ? '#0284c7' : '#0f172a',
            weight: isSelected ? 3.2 : 1.8,
          };
        }

        return {
          renderer,
          fillColor: '#0f172a',
          fillOpacity: isSelected ? 0.06 : 0.01,
          color: isSelected ? '#0284c7' : '#0f172a',
          weight: isSelected ? 3.2 : 1.7,
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
          <div style="font-family: sans-serif; font-size: 12.5px; line-height: 1.45; min-width: 245px;">
            <strong style="font-size: 14px; color: #0b1f3a;">Commune : ${p.nom}</strong>
            <span style="color: #64748b; font-size: 11px;"> (${p.code_adm})</span>
            <hr style="margin: 5px 0; border: none; border-top: 1px solid #e2e8f0;"/>
            <b>Superficie (EPSG:32630) :</b> ${formatNumberFr(p.superficie_km2, 2)} km²<br/>
            <b>Population WorldPop 100 m :</b> ${formatNumberFr(p.population_totale, 0)} hab. (${formatNumberFr(p.densite_hab_km2, 0)} hab./km²)<br/>
            ${decompHtml}
            <b>Incidents rattachés :</b> ${p.nombre_incidents} (${p.incidents_pour_100k_hab} / 100k hab.)<br/>
            ${
              vuln
                ? `<b>Indice multicritère IV :</b> <span style="color:${vuln.couleur}; font-weight:700;">${vuln.indice_vulnerabilite}/100 (${(vuln.classe_jenks_label || vuln.classe_risque).toUpperCase()})</span><br/>`
                : ''
            }
            <span style="color: #64748b; font-size: 11px;">Source : ${p.source_geom}</span>
          </div>
        `;
        layer.bindPopup(popupHtml);
        layer.bindTooltip(`${p.nom} (${formatNumberFr(p.densite_hab_km2, 0)} hab./km²)`, {
          sticky: true,
          direction: 'top',
        });
      },
    });

    communesLayerRef.current.addLayer(commLayer);

    if (selectedZoneId === '' && !focusTarget && commLayer.getBounds().isValid()) {
      map.fitBounds(commLayer.getBounds(), { padding: [20, 20], maxZoom: 12 });
    }
  }, [showCommunes, communeChoropleth, showMaillesPop, communesGeoJson, vulnerabilities, selectedZoneId]);

  // 6. Couches opérationnelles (Corridors ST_ClusterDBSCAN + ST_ConcaveHull, Zones silencieuses Poisson, Incidents)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const renderer = canvasRendererRef.current || undefined;

    hotspotsLayerRef.current.clearLayers();
    if (showHotspots) {
      hotspots.forEach((h) => {
        const color =
          h.niveau_recurrence === 'critique'
            ? '#dc2626'
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
          <div style="font-family: sans-serif; font-size: 12.5px; line-height: 1.45; min-width: 235px;">
            <strong style="font-size: 13.5px; color: ${color};">Corridor DBSCAN #${h.cluster_id} (${h.niveau_recurrence.toUpperCase()})</strong><br/>
            <span style="color: #64748b; font-size: 11px;">${h.algorithme || 'ST_ClusterDBSCAN + ST_ConcaveHull (EPSG:32630)'}</span>
            <hr style="margin: 5px 0; border: none; border-top: 1px solid #e2e8f0;"/>
            ${utmLine}
            ${areaLine}
            ${obsLine}
            <b>Priorité moyenne :</b> ${h.score_moyen_priorite} / 100<br/>
            <b>Typologies :</b> ${h.types_dominants.join(', ')}
          </div>
        `;

        // Polygone organique issu de PostGIS ST_ConcaveHull (zéro disque fixe de 600 m)
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
    }

    silentLayerRef.current.clearLayers();
    if (showSilent) {
      silentZones.forEach((z) => {
        const sColor = z.niveau_severite === 'haute' ? '#b91c1c' : '#d97706';
        const poissonLine =
          z.observe !== undefined && z.attendu !== undefined
            ? `<b>Modèle de Poisson :</b> O<sub>i</sub> = <b>${z.observe}</b> observé(s) vs E<sub>i</sub> = <b>${formatNumberFr(z.attendu, 2)}</b> attendu(s) (${z.ecart_relatif_pct !== undefined && z.ecart_relatif_pct >= 0 ? '+' : ''}${formatNumberFr(z.ecart_relatif_pct ?? 0, 0)} %)<br/>
               <b>Test statistique :</b> r<sub>D</sub> = <code>${formatNumberFr(z.residu_poisson ?? 0, 2)}</code> · p = <code>${formatNumberFr(z.p_value_poisson ?? 0, 3)}</code><br/>`
            : '';

        const silentPopup = `
          <div style="font-family: sans-serif; font-size: 12.5px; line-height: 1.45; min-width: 245px;">
            <strong style="color: ${sColor};">Zone silencieuse : ${z.zone_nom}</strong><br/>
            <span style="font-size: 11px; font-weight: 700; color: ${sColor};">${z.statut_alerte}</span>
            <hr style="margin: 5px 0; border: none; border-top: 1px solid #e2e8f0;"/>
            ${poissonLine}
            <p style="margin: 4px 0; color: #334155;">${z.motif}</p>
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
    }

    incidentsLayerRef.current.clearLayers();
    if (showIncidents && incidentsGeoJson?.features) {
      incidentsGeoJson.features.forEach((feat: any) => {
        const [lon, lat] = feat.geometry.coordinates;
        if (typeof lat !== 'number' || typeof lon !== 'number') return;
        const pColor = feat.properties.danger_immediat ? '#dc2626' : '#0284c7';
        const pMarker = L.circleMarker([lat, lon], {
          radius: 6,
          fillColor: pColor,
          color: '#ffffff',
          weight: 1.8,
          fillOpacity: 0.95,
        });
        pMarker.bindPopup(`
          <div style="font-size: 12px;">
            <strong>Incident #${feat.properties.id}</strong> (${feat.properties.type})<br/>
            Statut : ${feat.properties.statut} · Priorité : ${feat.properties.score_priorite} pts
          </div>
        `);
        incidentsLayerRef.current.addLayer(pMarker);
      });
    }
  }, [showHotspots, showSilent, showIncidents, hotspots, silentZones, incidentsGeoJson]);

  const jenksMeta = maillesGeoJson?.classification;
  const totalHexCount =
    hexThematique === 'getis_ord'
      ? getisOrdGeoJson?.features?.length || 0
      : maillesGeoJson?.total_mailles || 0;

  return (
    <div className="sig-map-wrapper">
      {/* Barre supérieure : Sélecteur de fond de plan + Thématique hexagonale + Filtre communal + Couches */}
      <div className="sig-map-controls">
        <div className="sig-controls-row">
          <span className="sig-map-controls-title">
            <Layers size={15} />
            <span>Fond :</span>
          </span>
          <select
            value={basemap}
            onChange={(e) => setBasemap(e.target.value as BasemapKey)}
            className="sig-select-compact"
            aria-label="Choix du fond cartographique"
          >
            {Object.entries(BASEMAPS).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.label}
              </option>
            ))}
          </select>

          <span className="sig-map-controls-title" style={{ marginLeft: '0.4rem' }}>
            <Activity size={15} />
            <span>Mailles 300 m :</span>
          </span>
          <select
            value={hexThematique}
            onChange={(e) => onChangeHexThematique(e.target.value as HexThematique)}
            className="sig-select-compact"
            aria-label="Thématique du maillage hexagonal 300 m"
          >
            <option value="densite">Densité WorldPop 100 m (Fisher-Jenks)</option>
            <option value="alea">Aléa physique MNT + Hydro (Fisher-Jenks)</option>
            <option value="vulnerabilite">Risque multicritère A × E × V (Fisher-Jenks)</option>
            <option value="getis_ord">Autocorrélation Getis-Ord Gi* (Points chauds)</option>
          </select>

          <span className="sig-map-controls-title" style={{ marginLeft: '0.4rem' }}>
            <CompassIcon size={15} />
            <span>Commune :</span>
          </span>
          <select
            value={selectedZoneId}
            onChange={(e) => onSelectZoneId(e.target.value ? Number(e.target.value) : '')}
            className="sig-select-compact"
            aria-label="Filtrer par commune"
          >
            <option value="">
              District d'Abidjan — 13 communes ({sigMetadata?.maillage_hexagonal.nb_mailles_actives || totalHexCount} mailles)
            </option>
            {communesGeoJson?.features.map((f: any) => (
              <option key={f.properties.zone_id} value={f.properties.zone_id}>
                {f.properties.nom} ({formatNumberFr(f.properties.population_totale, 0)} hab. · {f.properties.superficie_km2} km²)
              </option>
            ))}
          </select>

          <span className="sig-map-controls-title" style={{ marginLeft: '0.4rem' }}>
            <span>Communes :</span>
          </span>
          <select
            value={communeChoropleth}
            onChange={(e) => setCommuneChoropleth(e.target.value as 'contour' | 'vulnerabilite')}
            className="sig-select-compact"
          >
            <option value="contour">Contours administratifs seuls</option>
            <option value="vulnerabilite">Choroplèthe indice IV communal</option>
          </select>
        </div>

        <div className="sig-controls-row" style={{ marginTop: '0.55rem' }}>
          <span className="sig-map-controls-title">
            <Eye size={15} />
            <span>Couches SIG :</span>
          </span>

          <label className="sig-layer-toggle">
            <input
              type="checkbox"
              checked={showMaillesPop}
              onChange={(e) => setShowMaillesPop(e.target.checked)}
            />
            <Grid size={14} color="#d95f0e" />
            <span>Hexagones 300 m ({totalHexCount})</span>
          </label>

          <label className="sig-layer-toggle">
            <input
              type="checkbox"
              checked={showCommunes}
              onChange={(e) => setShowCommunes(e.target.checked)}
            />
            <Layers size={14} color="#0f172a" />
            <span>Limites réelles (13 communes)</span>
          </label>

          <label className="sig-layer-toggle">
            <input
              type="checkbox"
              checked={showIncidents}
              onChange={(e) => setShowIncidents(e.target.checked)}
            />
            <MapPin size={14} color="#0284c7" />
            <span>Incidents ({incidentsGeoJson?.features?.length || 0})</span>
          </label>

          <label className="sig-layer-toggle">
            <input
              type="checkbox"
              checked={showHotspots}
              onChange={(e) => setShowHotspots(e.target.checked)}
            />
            <Flame size={14} color="#dc2626" />
            <span>Corridors DBSCAN ({hotspots.length})</span>
          </label>

          <label className="sig-layer-toggle">
            <input
              type="checkbox"
              checked={showSilent}
              onChange={(e) => setShowSilent(e.target.checked)}
            />
            <VolumeX size={14} color="#b91c1c" />
            <span>Zones silencieuses Poisson ({silentZones.length})</span>
          </label>
        </div>
      </div>

      {/* Canevas cartographique avec Flèche du Nord et Coordonnées UTM 30N en surimpression */}
      <div style={{ position: 'relative' }}>
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

        {/* Barre temps réel des coordonnées curseur (WGS84 + EPSG:32630) */}
        <div className="sig-coords-overlay">
          {cursorCoords ? (
            <>
              <span>
                <strong>WGS84 :</strong> {cursorCoords.lat.toFixed(5)}° N, {Math.abs(cursorCoords.lon).toFixed(5)}° W
              </span>
              <span className="sig-coords-sep">|</span>
              <span>
                <strong>UTM 30N (EPSG:32630) :</strong> E {formatNumberFr(cursorCoords.easting, 0)} m · N{' '}
                {formatNumberFr(cursorCoords.northing, 0)} m
              </span>
            </>
          ) : (
            <span>Survolez la carte pour lire les coordonnées WGS84 et métriques UTM 30N (EPSG:32630)</span>
          )}
        </div>
      </div>

      {/* Légende Statistique Graduée (Fisher-Jenks ou Getis-Ord Gi*) & Cartouche de Sources */}
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
                      <small style={{ color: '#64748b', marginLeft: '4px' }}>({item.count})</small>
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
                        <small style={{ color: '#64748b', marginLeft: '4px' }}>({count})</small>
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
            <strong>Limites & Hydro :</strong> OpenStreetMap (ODbL) / OCHA COD-AB (13 communes + réseau de drainage)
          </span>
          <span>•</span>
          <span>
            <strong>Démographie & Relief :</strong> WorldPop 100 m (CC-BY 4.0) · MNT SRTM-Copernicus (~38 m)
          </span>
        </div>
      </div>
    </div>
  );
};
