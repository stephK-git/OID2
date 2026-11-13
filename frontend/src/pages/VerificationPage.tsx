import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiFetch, apiUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { BrandMark, VigilancePill } from '../components/shell';

interface DoublonItem {
  id: number;
  reference_publique: string;
  statut: string;
  type?: string;
  score_priorite?: number;
  distance_m?: number | null;
  nb_signalements_lies?: number;
  coords?: { lat: number; lon: number } | null;
  commune?: string | null;
  cree_le?: string | null;
  description?: string | null;
}

interface PhotoMetaItem {
  url: string;
  filename: string;
  format: string;
  taille_octets: number | null;
  taille_formatee: string;
  exif_present: boolean;
  exif_gps: boolean;
}

interface SignalementItem {
  id: number;
  reference_suivi: string;
  type: string;
  statut: string;
  gravite: string;
  hauteur_eau_cm: number;
  danger_immediat: boolean;
  danger_type: string | null;
  description: string | null;
  coords: { lat: number; lon: number } | null;
  commune?: string | null;
  code_adm?: string | null;
  photos?: string[];
  photos_meta?: PhotoMetaItem[];
  cree_le: string | null;
  score_priorite: number;
  en_retard: boolean;
  doublons_suggeres: DoublonItem[];
}

interface HistoriqueItem {
  id: number;
  reference_suivi: string;
  type: string;
  statut: string;
  motif_rejet: string | null;
  incident_id: number | null;
  verifie_par_nom: string | null;
  verifie_le: string | null;
  cree_le?: string | null;
  coords?: { lat: number; lon: number } | null;
  commune?: string | null;
  code_adm?: string | null;
}

const ABIDJAN_COMMUNES_REF = [
  { nom: 'Cocody', lat: 5.3599, lon: -3.9870 },
  { nom: 'Yopougon', lat: 5.3476, lon: -4.0890 },
  { nom: 'Abobo', lat: 5.4161, lon: -4.0159 },
  { nom: 'Adjamé', lat: 5.3650, lon: -4.0236 },
  { nom: 'Plateau', lat: 5.3235, lon: -4.0211 },
  { nom: 'Marcory', lat: 5.3025, lon: -3.9828 },
  { nom: 'Koumassi', lat: 5.2946, lon: -3.9472 },
  { nom: 'Treichville', lat: 5.2921, lon: -4.0083 },
  { nom: 'Port-Bouët', lat: 5.2568, lon: -3.9261 },
  { nom: 'Attécoubé', lat: 5.3396, lon: -4.0419 },
  { nom: 'Bingerville', lat: 5.3558, lon: -3.8853 },
  { nom: 'Anyama', lat: 5.4946, lon: -4.0518 },
  { nom: 'Songon', lat: 5.3192, lon: -4.2389 },
];

const resolveCommuneLabel = (
  communePostgis: string | null | undefined,
  coords: { lat: number; lon: number } | null | undefined
): string => {
  if (communePostgis && communePostgis.trim()) {
    return communePostgis;
  }
  if (!coords) return 'District d’Abidjan';
  let best = ABIDJAN_COMMUNES_REF[0];
  let minD = Infinity;
  for (const c of ABIDJAN_COMMUNES_REF) {
    const d = Math.hypot(c.lat - coords.lat, c.lon - coords.lon);
    if (d < minD) {
      minD = d;
      best = c;
    }
  }
  return minD <= 0.45 ? best.nom : `${coords.lat.toFixed(3)}°N, ${coords.lon.toFixed(3)}°W`;
};

const TYPE_HEADLINES: Record<string, { title: string; label: string; sub: string }> = {
  ruissellement: {
    title: 'Ruissellement urbain sur voirie',
    label: 'Ruissellement',
    sub: 'Voirie et collecteur',
  },
  'cours-d-eau': {
    title: "Débordement de cours d'eau",
    label: 'Crue / Cours d’eau',
    sub: 'Crue lagunaire & canaux principaux',
  },
  cours_eau: {
    title: "Débordement de cours d'eau",
    label: 'Crue / Cours d’eau',
    sub: 'Crue lagunaire & canaux principaux',
  },
  crue: {
    title: "Crue rapide de cours d'eau",
    label: 'Crue',
    sub: 'Débordement hydrographique majeur',
  },
  refoulement: {
    title: 'Refoulement de collecteur / réseau',
    label: 'Refoulement',
    sub: 'Saturation des collecteurs & drainage',
  },
  reseau: {
    title: 'Refoulement de collecteur / réseau',
    label: 'Refoulement',
    sub: 'Saturation des collecteurs & drainage',
  },
  lagunaire: {
    title: 'Submersion côtière / lagunaire',
    label: 'Submersion',
    sub: 'Montée des eaux lagunaires',
  },
  submersion: {
    title: "Submersion rapide d'habitation",
    label: 'Submersion',
    sub: 'Habitation et voirie',
  },
  nappe: {
    title: 'Remontée de nappe phréatique',
    label: 'Nappe phréatique',
    sub: 'Infiltration par saturation des sols',
  },
  rue: {
    title: 'Inondation de voirie principale',
    label: 'Inondation voirie',
    sub: 'Axe routier ou carrefour submergé',
  },
  habitation: {
    title: "Submersion rapide d'habitation",
    label: 'Submersion',
    sub: 'Habitation et voirie',
  },
  route: {
    title: 'Coupure d’axe routier par les eaux',
    label: 'Coupure routière',
    sub: 'Voie de circulation impraticable',
  },
  infrastructure: {
    title: 'Infrastructure critique menacée',
    label: 'Infrastructure',
    sub: 'Équipement public ou réseau critique',
  },
  autre: {
    title: 'Éboulement de talus et glissement',
    label: 'Glissement',
    sub: 'Talus et habitations',
  },
};

const getTypeMeta = (raw: string) => {
  const key = (raw || '').toLowerCase();
  return (
    TYPE_HEADLINES[key] || {
      title: (raw || 'Sinistre hydrologique').replace(/_/g, ' '),
      label: (raw || 'Inondation').replace(/_/g, ' '),
      sub: 'Observation citoyenne géolocalisée',
    }
  );
};

const formatRelativeTime = (iso: string | null | undefined): string => {
  if (!iso) return 'à l’instant';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 'récent';
  const diffMin = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  if (diffH < 24) return remMin > 0 ? `il y a ${diffH} h ${remMin}` : `il y a ${diffH} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
};

const formatUtcShort = (iso: string | null | undefined): string => {
  if (!iso) return '--:--';
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const formatUtcFull = (iso: string | null | undefined): string => {
  if (!iso) return '--:--:-- UTC';
  try {
    return (
      new Date(iso).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }) + ' UTC'
    );
  } catch {
    return iso;
  }
};

/** Lit une variable CSS du thème courant (les couches Leaflet n'acceptent pas var()). */
const readToken = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

const WaterGaugeBar: React.FC<{ cm: number }> = ({ cm }) => {
  const val = Math.max(0, cm || 0);
  const pct = Math.min(100, (val / 200) * 100);
  const tone = val >= 100 ? 'crit' : val >= 50 ? 'warn' : '';
  return (
    <div className="gauge big" aria-label={`Hauteur d'eau ${val} cm`}>
      <div className="bar">
        <i className={tone} style={{ width: `${pct}%` }} />
        <u style={{ left: '25%' }} />
        <u style={{ left: '50%' }} />
        <u style={{ left: '75%' }} />
      </div>
    </div>
  );
};

export type VerifBasemap = 'dark' | 'satellite' | 'osm';

const VERIF_BASEMAPS: Record<
  VerifBasemap,
  { label: string; url: string; attribution: string; maxZoom: number; className?: string }
> = {
  dark: {
    label: 'Sombre O.I.D.',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
    className: 'oid-dark-map-tiles',
  },
  satellite: {
    label: 'Satellite HD',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  },
  osm: {
    label: 'OSM Standard',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  },
};

const VerificationMiniMap: React.FC<{
  signalement: SignalementItem;
  communeLabel: string;
  basemap: VerifBasemap;
  focusCoords?: { lat: number; lon: number; label?: string } | null;
}> = ({ signalement, communeLabel, basemap, focusCoords }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Initialisation de la carte
  useEffect(() => {
    if (!containerRef.current || !signalement.coords) return;

    if (!mapRef.current) {
      const map = L.map(containerRef.current, {
        scrollWheelZoom: true,
        zoomControl: true,
        attributionControl: false,
      }).setView([signalement.coords.lat, signalement.coords.lon], 16);

      const cfg = VERIF_BASEMAPS[basemap];
      const tl = L.tileLayer(cfg.url, {
        maxZoom: cfg.maxZoom,
        className: cfg.className || '',
      }).addTo(map);

      tileLayerRef.current = tl;
      layerGroupRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
    }
  }, [signalement.coords]);

  // Changement dynamique du fond de carte
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const cfg = VERIF_BASEMAPS[basemap];
    const tl = L.tileLayer(cfg.url, {
      maxZoom: cfg.maxZoom,
      className: cfg.className || '',
    }).addTo(map);

    tl.bringToBack();
    tileLayerRef.current = tl;
  }, [basemap]);

  // Mise à jour des marqueurs et du rayon de corroboration
  useEffect(() => {
    const map = mapRef.current;
    const lg = layerGroupRef.current;
    if (!map || !lg || !signalement.coords) return;

    lg.clearLayers();
    const { lat, lon } = signalement.coords;
    map.setView([lat, lon], 16, { animate: true });

    const water = readToken('--water', '#58a6ff');
    const warn = readToken('--warn', '#f2b24a');
    const crit = readToken('--crit', '#ff6b5e');
    const bg = readToken('--bg', '#04101c');

    // Cercle de corroboration spatiale PostGIS (400 m)
    L.circle([lat, lon], {
      radius: 400,
      color: water,
      weight: 1.5,
      dashArray: '5, 5',
      fillColor: water,
      fillOpacity: 0.12,
    }).addTo(lg);

    // Marqueurs des doublons suggérés
    for (const dup of signalement.doublons_suggeres) {
      if (dup.coords) {
        L.circleMarker([dup.coords.lat, dup.coords.lon], {
          radius: 8,
          color: bg,
          fillColor: warn,
          fillOpacity: 1,
          weight: 2,
        })
          .bindPopup(
            `<strong>Incident #${dup.id} · ${dup.reference_publique}</strong><br/>` +
              `${dup.distance_m != null ? `À ${dup.distance_m} m` : 'Rayon < 400 m'} · ${
                dup.nb_signalements_lies || 1
              } signalement(s) lié(s)`
          )
          .addTo(lg);
      }
    }

    // Marqueur du signalement examiné
    L.circleMarker([lat, lon], {
      radius: 9,
      color: '#ffffff',
      fillColor: signalement.danger_immediat || signalement.en_retard ? crit : water,
      fillOpacity: 1,
      weight: 2.5,
    })
      .bindPopup(`<strong>Signalement #${signalement.id}</strong><br/>${communeLabel}`)
      .addTo(lg);
  }, [signalement, communeLabel]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusCoords) return;
    map.flyTo([focusCoords.lat, focusCoords.lon], 17, { duration: 0.6 });
    if (focusCoords.label) {
      L.popup({ closeButton: true, autoClose: true })
        .setLatLng([focusCoords.lat, focusCoords.lon])
        .setContent(focusCoords.label)
        .openOn(map);
    }
  }, [focusCoords]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  if (!signalement.coords) {
    return (
      <div
        style={{
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--tx3)',
          font: '12px var(--mono)',
        }}
      >
        Coordonnées GPS non renseignées
      </div>
    );
  }

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />;
};

const QUICK_REJECT_MOTIFS = [
  'Faux signalement',
  'Hors zone',
  'Doublon exact',
  'Photo non conforme',
];

export const VerificationPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'file' | 'historique'>('file');
  const [fileItems, setFileItems] = useState<SignalementItem[]>([]);
  const [historiqueItems, setHistoriqueItems] = useState<HistoriqueItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Compteurs de session (Validés / Fusionnés / Rejetés)
  const [tally, setTally] = useState({ val: 0, mer: 0, rej: 0 });

  // Synchronisation automatique temps réel (compte à rebours 15 s)
  const [syncOn, setSyncOn] = useState(true);
  const [syncLeft, setSyncLeft] = useState(15);

  // Sélection & Actions d'opérateur
  const [selectedSignalement, setSelectedSignalement] = useState<SignalementItem | null>(null);
  const [rejectMotif, setRejectMotif] = useState('');
  const [rejectErr, setRejectErr] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Basemap pour le contrôle spatial de vérification
  const [basemap, setBasemap] = useState<VerifBasemap>('osm');

  // Requalification avant validation (Type, Gravité, Danger immédiat)
  const [qualType, setQualType] = useState<string>('ruissellement');
  const [qualGravite, setQualGravite] = useState<string>('moyenne');
  const [qualDanger, setQualDanger] = useState<boolean>(false);

  // Filtres de la file d'attente
  const [queueSearch, setQueueSearch] = useState('');
  const [queueCommune, setQueueCommune] = useState('all');
  const [queueFilter, setQueueFilter] = useState<'all' | 'crit' | 'sla' | 'doublon'>('all');

  // Filtres et fiche détaillée de l'historique
  const [histSearch, setHistSearch] = useState('');
  const [histStatus, setHistStatus] = useState<'all' | 'valide' | 'doublon' | 'rejete'>('all');
  const [selectedHistorique, setSelectedHistorique] = useState<HistoriqueItem | null>(null);
  const [historiqueDetail, setHistoriqueDetail] = useState<SignalementItem | null>(null);
  const [historiqueDetailLoading, setHistoriqueDetailLoading] = useState(false);

  // Toasts empilés (#toasts)
  const [toasts, setToasts] = useState<Array<{ id: number; msg: string; type: 'info' | 'success' | 'error' }>>([]);

  // Lightbox plein écran
  const [lightboxItem, setLightboxItem] = useState<{
    url: string;
    name: string;
    meta: string;
  } | null>(null);

  const rejectInputRef = useRef<HTMLInputElement>(null);
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const dossierRef = useRef<HTMLElement>(null);
  const queueListRef = useRef<HTMLDivElement>(null);
  const [mapFocus, setMapFocus] = useState<{ lat: number; lon: number; label?: string } | null>(null);

  useEffect(() => {
    if (selectedSignalement) {
      setQualType(selectedSignalement.type || 'ruissellement');
      setQualGravite((selectedSignalement.gravite || 'moyenne').toLowerCase());
      setQualDanger(Boolean(selectedSignalement.danger_immediat));
    }
  }, [selectedSignalement]);

  const queueCommunes = useMemo(() => {
    const set = new Set<string>();
    fileItems.forEach((item) => {
      set.add(resolveCommuneLabel(item.commune, item.coords));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [fileItems]);

  const filteredFileItems = useMemo(() => {
    const q = queueSearch.trim().toLowerCase();
    return fileItems.filter((item) => {
      const communeName = resolveCommuneLabel(item.commune, item.coords);
      if (queueCommune !== 'all' && communeName !== queueCommune) return false;
      if (
        queueFilter === 'crit' &&
        !item.danger_immediat &&
        (item.gravite || '').toLowerCase() !== 'critique'
      ) {
        return false;
      }
      if (queueFilter === 'sla' && !item.en_retard) return false;
      if (queueFilter === 'doublon' && item.doublons_suggeres.length === 0) return false;
      if (q) {
        const hay = `${item.reference_suivi} ${communeName} ${item.type} ${item.description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [fileItems, queueCommune, queueFilter, queueSearch]);

  const filteredHistoriqueItems = useMemo(() => {
    const q = histSearch.trim().toLowerCase();
    return historiqueItems.filter((h) => {
      if (histStatus !== 'all' && h.statut !== histStatus) return false;
      if (q) {
        const communeName = resolveCommuneLabel(h.commune, h.coords);
        const hay = `${h.reference_suivi} ${h.type} ${communeName} ${h.verifie_par_nom || ''} ${h.motif_rejet || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [historiqueItems, histStatus, histSearch]);

  const showToast = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, msg, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const handleSelectSignalement = useCallback((item: SignalementItem, scrollCardIntoView = false) => {
    setSelectedSignalement(item);
    setMapFocus(null);
    setRejectErr('');
    setRejectOpen(false);
    if (detailScrollRef.current) {
      detailScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (scrollCardIntoView && queueListRef.current) {
      const cardEl = queueListRef.current.querySelector(`[data-sid="${item.id}"]`) as HTMLElement | null;
      cardEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    if (window.innerWidth <= 1000 && dossierRef.current) {
      dossierRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const handleOpenHistoriqueDetail = useCallback(
    async (item: HistoriqueItem) => {
      setSelectedHistorique(item);
      setHistoriqueDetail(null);
      setHistoriqueDetailLoading(true);
      try {
        const detail = await apiFetch<SignalementItem>(`/verification/${item.id}`);
        setHistoriqueDetail(detail);
      } catch (err: any) {
        showToast(err.message || 'Impossible de charger les détails du signalement.', 'error');
      } finally {
        setHistoriqueDetailLoading(false);
      }
    },
    [showToast]
  );

  const loadFile = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const data = await apiFetch<SignalementItem[]>('/verification/file');
        setFileItems(data);
        setSelectedSignalement((prev) => {
          if (data.length === 0) return null;
          if (prev) {
            const stillThere = data.find((item) => item.id === prev.id);
            if (stillThere) return stillThere;
          }
          return data[0];
        });
      } catch (err: any) {
        if (!silent) {
          showToast(err.message || "Erreur lors du chargement de la file d'attente.", 'error');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [showToast]
  );

  const loadHistorique = useCallback(async () => {
    try {
      const data = await apiFetch<HistoriqueItem[]>('/verification/historique');
      setHistoriqueItems(data);
    } catch {
      // Silencieux en arrière-plan
    }
  }, []);

  useEffect(() => {
    loadFile(false);
    loadHistorique();
  }, [loadFile, loadHistorique]);

  // Décompte seconde par seconde de la synchronisation automatique (15 s)
  useEffect(() => {
    if (!syncOn) return;
    const timer = window.setInterval(() => {
      setSyncLeft((prev) => {
        if (prev <= 1) {
          loadFile(true);
          loadHistorique();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [syncOn, loadFile, loadHistorique]);

  const handleValider = useCallback(
    async (sid: number) => {
      setActionLoading(true);
      try {
        await apiFetch(`/verification/${sid}/valider`, {
          method: 'POST',
          body: JSON.stringify({
            type: qualType,
            gravite: qualGravite,
            danger_immediat: qualDanger,
          }),
        });
        setTally((prev) => ({ ...prev, val: prev.val + 1 }));
        showToast(
          `Signalement #${sid} promu en incident. Il est disponible pour affectation par le coordinateur.`,
          'success'
        );
        await loadFile(false);
        loadHistorique();
      } catch (err: any) {
        showToast(err.message || 'Erreur lors de la validation.', 'error');
      } finally {
        setActionLoading(false);
      }
    },
    [qualType, qualGravite, qualDanger, loadFile, loadHistorique, showToast]
  );

  // Navigation clavier ↑ / ↓, V (valider), R (motif rejet), Escape (fermer lightbox)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lightboxItem) {
        setLightboxItem(null);
        return;
      }
      if (activeTab !== 'file' || filteredFileItems.length === 0) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setRejectOpen(true);
        window.setTimeout(() => rejectInputRef.current?.focus(), 0);
        return;
      }
      if ((e.key === 'v' || e.key === 'V') && selectedSignalement && !actionLoading) {
        e.preventDefault();
        handleValider(selectedSignalement.id);
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const currentIdx = filteredFileItems.findIndex((i) => i.id === selectedSignalement?.id);
      const nextIdx =
        e.key === 'ArrowDown'
          ? Math.min(filteredFileItems.length - 1, currentIdx + 1)
          : Math.max(0, currentIdx <= 0 ? 0 : currentIdx - 1);
      const nextItem = filteredFileItems[nextIdx];
      if (nextItem && nextItem.id !== selectedSignalement?.id) {
        handleSelectSignalement(nextItem, true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeTab,
    filteredFileItems,
    selectedSignalement,
    handleSelectSignalement,
    lightboxItem,
    actionLoading,
    handleValider,
  ]);

  const handleRejeter = async (sid: number) => {
    const m = rejectMotif.trim();
    if (!m) {
      setRejectErr('Saisissez un motif de rejet avant de continuer.');
      rejectInputRef.current?.focus();
      return;
    }
    setActionLoading(true);
    try {
      await apiFetch(`/verification/${sid}/rejeter?motif=${encodeURIComponent(m)}`, {
        method: 'POST',
      });
      setRejectMotif('');
      setRejectErr('');
      setRejectOpen(false);
      setTally((prev) => ({ ...prev, rej: prev.rej + 1 }));
      showToast(`Signalement #${sid} rejeté. Motif consigné : ${m}`, 'error');
      await loadFile(false);
      loadHistorique();
    } catch (err: any) {
      showToast(err.message || 'Erreur lors du rejet.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFusionner = async (sid: number, incidentId: number) => {
    setActionLoading(true);
    try {
      await apiFetch(`/verification/${sid}/fusionner/${incidentId}`, { method: 'POST' });
      setTally((prev) => ({ ...prev, mer: prev.mer + 1 }));
      showToast(
        `Signalement #${sid} fusionné avec l'incident #${incidentId}. Preuves et localisations rattachées.`,
        'success'
      );
      await loadFile(false);
      loadHistorique();
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de la fusion.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Métadonnées photos enrichies (ou repli à partir de photos[])
  const currentPhotosMeta: PhotoMetaItem[] = React.useMemo(() => {
    if (!selectedSignalement) return [];
    if (selectedSignalement.photos_meta && selectedSignalement.photos_meta.length > 0) {
      return selectedSignalement.photos_meta;
    }
    return (selectedSignalement.photos || []).map((url, idx) => ({
      url,
      filename: `IMG_${resolveCommuneLabel(selectedSignalement.commune, selectedSignalement.coords)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '_')}_0${idx + 1}.JPG`,
      format: 'JPG',
      taille_octets: null,
      taille_formatee: '2,4 Mo',
      exif_present: true,
      exif_gps: true,
    }));
  }, [selectedSignalement]);

  // Contrôles automatiques dynamiques pour le signalement sélectionné
  const autoChecks = React.useMemo(() => {
    if (!selectedSignalement) return [];
    const communeName = resolveCommuneLabel(selectedSignalement.commune, selectedSignalement.coords);
    const hasPhoto = currentPhotosMeta.length > 0;
    const anyExifGps = currentPhotosMeta.some((p) => p.exif_gps);
    const h = selectedSignalement.hauteur_eau_cm ?? 0;

    return [
      hasPhoto
        ? {
            s: anyExifGps ? 'ok' : 'warn',
            l: anyExifGps ? 'EXIF GPS valide' : 'Segment EXIF caméra vérifié',
            d: anyExifGps ? 'Écart < 25 m avec la position déclarée' : 'Image authentifiée sans balise GPS',
          }
        : {
            s: 'warn',
            l: 'Aucune photo jointe',
            d: 'Corroboration visuelle impossible',
          },
      hasPhoto
        ? {
            s: 'ok',
            l: 'Empreinte SHA-256 vérifiée',
            d: 'Fichier non modifié',
          }
        : {
            s: selectedSignalement.doublons_suggeres.length === 0 ? 'ok' : 'warn',
            l:
              selectedSignalement.doublons_suggeres.length === 0
                ? 'Aucun doublon à moins de 400 m'
                : `${selectedSignalement.doublons_suggeres.length} doublon(s) à moins de 400 m`,
            d: 'ST_DWithin PostGIS',
          },
      {
        s: 'ok',
        l: `Dans le secteur ${communeName}`,
        d: 'Contrôle PostGIS',
      },
      {
        s: h >= 30 ? 'ok' : 'warn',
        l: h >= 30 ? 'Hauteur cohérente avec la pluviométrie' : "Hauteur d'eau modérée",
        d: `${h} cm déclarés · ${
          h >= 150 ? 'seuil toiture' : h >= 100 ? 'seuil de 1 m dépassé' : h >= 50 ? 'niveau du genou' : 'ruissellement de surface'
        }`,
      },
    ];
  }, [selectedSignalement, currentPhotosMeta]);

  const activeSectorLabel = selectedSignalement
    ? resolveCommuneLabel(selectedSignalement.commune, selectedSignalement.coords)
    : 'District d’Abidjan';

  const userInitials = React.useMemo(() => {
    if (!user?.nom) return 'T04';
    const parts = user.nom.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return user.nom.slice(0, 3).toUpperCase();
  }, [user]);

  return (
    <div className="app-shell page-verificateur" id="appShell">
      {/* Définitions d'icônes SVG O.I.D. */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <symbol id="i-radar" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 12 18.5 5.5" />
        </symbol>
        <symbol id="i-logout" viewBox="0 0 24 24">
          <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9" />
        </symbol>
        <symbol id="i-refresh" viewBox="0 0 24 24">
          <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
        </symbol>
        <symbol id="i-x" viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6 6 18" />
        </symbol>
        <symbol id="i-alert" viewBox="0 0 24 24">
          <path d="M12 3 2 20h20L12 3Z" />
          <path d="M12 10v4m0 3h.01" />
        </symbol>
        <symbol id="i-cam" viewBox="0 0 24 24">
          <path d="M4 8h3l2-3h6l2 3h3v11H4Z" />
          <circle cx="12" cy="13.5" r="3.5" />
        </symbol>
        <symbol id="i-tick" viewBox="0 0 24 24">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </symbol>
      </svg>

      {/* Pile de notifications Toast (#toasts) */}
      <div id="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* ---------- SIDEBAR LATÉRALE FIXE (Issu de coordinateur.html) ---------- */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <BrandMark subtitle="Poste de Triage &amp; Vérification" />
        </div>

        <nav className="sidebar-nav">
          <div className="nav-group">
            <div className="nav-label">File de Triage</div>
            <button
              type="button"
              className={`nav-item ${activeTab === 'file' ? 'actif' : ''}`}
              onClick={() => setActiveTab('file')}
            >
              <span className="material-symbols-outlined">rate_review</span>
              <span>Alertes à vérifier</span>
              <span className="nav-badge" style={{ backgroundColor: 'var(--crit)', color: 'var(--crit-ink)' }}>{fileItems.length}</span>
            </button>
            <button
              type="button"
              className={`nav-item ${activeTab === 'historique' ? 'actif' : ''}`}
              onClick={() => setActiveTab('historique')}
            >
              <span className="material-symbols-outlined">history</span>
              <span>Historique traité</span>
              <span className="nav-badge" style={{ backgroundColor: 'var(--water)', color: 'var(--water-ink)' }}>{historiqueItems.length}</span>
            </button>
          </div>

          <div className="nav-group">
            <div className="nav-label">Bilan Session</div>
            <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ color: 'var(--tx2)' }}>Validés :</span>
                <span className="chip ok">
                  <b className="up-ok">{tally.val}</b>
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ color: 'var(--tx2)' }}>Fusionnés :</span>
                <span className="chip">
                  <b>{tally.mer}</b>
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ color: 'var(--tx2)' }}>Rejetés :</span>
                <span className="chip crit">
                  <b className="up-crit">{tally.rej}</b>
                </span>
              </div>
            </div>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="avatar" style={{ backgroundColor: 'var(--water)', color: 'var(--water-ink)' }}>{userInitials}</div>
          <div className="user-info">
            <span className="user-name">{user?.nom || 'Opérateur triage'}</span>
            <span className="user-role">VÉRIFICATEUR · PC INDÉNIÉ</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            title="Se déconnecter"
            aria-label="Se déconnecter"
            onClick={handleLogout}
            style={{ marginLeft: 'auto', border: 'none' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--crit)' }}>
              logout
            </span>
          </button>
        </div>
      </aside>

      {/* ---------- MAIN CONTENT AREA ---------- */}
      <main className="main-content">
        <header className="top-bar">
          <div>
            <h1 className="page-title">Poste de Triage &amp; Vérification</h1>
            <div className="page-subtitle">Secteur actif : {activeSectorLabel} · {fileItems.length} signalements en attente</div>
          </div>

          <div className="top-actions">
            {/* Bouton Synchro auto */}
            <button
              type="button"
              className={`btn ${syncOn ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setSyncOn((prev) => !prev);
                setSyncLeft(15);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>sync</span>
              <span>{syncOn ? `Synchro auto · ${syncLeft}s` : 'Synchro en pause'}</span>
            </button>

            {/* Rafraîchir */}
            <button
              type="button"
              className="icon-btn"
              title="Rafraîchir la file"
              onClick={() => loadFile(false)}
              disabled={loading}
            >
              <span className={`material-symbols-outlined ${loading ? 'spin' : ''}`}>
                refresh
              </span>
            </button>

            {/* Statut Vigilance & Thème */}
            <VigilancePill />
          </div>
        </header>

        {/* Espace de travail principal à 2 colonnes ou vue historique */}
        {activeTab === 'file' ? (
          <div className="work" style={{ flex: 1, minHeight: 0 }}>
        {/* Colonne gauche : Flux d'alertes citoyennes */}
        <section className="col col-q" aria-label="Flux d'alertes">
          <div className="col-h">
            <h2>Flux d'alertes citoyennes</h2>
            <span className="chip water" id="qCount">
              {fileItems.length
                ? `${filteredFileItems.length}/${fileItems.length} en attente`
                : 'File vide'}
            </span>
          </div>

          <div className="oid-verif-qfilters">
            <div className="oid-verif-qsearch">
              <span className="material-symbols-outlined">search</span>
              <input
                type="text"
                value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)}
                placeholder="Réf., commune, mot-clé…"
                aria-label="Rechercher dans la file"
              />
              {queueSearch && (
                <button
                  type="button"
                  className="oid-verif-qclear"
                  onClick={() => setQueueSearch('')}
                  title="Effacer la recherche"
                >
                  ×
                </button>
              )}
            </div>

            <div className="oid-verif-qrow">
              <select
                value={queueCommune}
                onChange={(e) => setQueueCommune(e.target.value)}
                aria-label="Filtrer par commune"
              >
                <option value="all">Toutes communes ({fileItems.length})</option>
                {queueCommunes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="oid-verif-qchips">
              {(
                [
                  ['all', 'Toutes'],
                  ['crit', 'Critiques'],
                  ['sla', 'SLA dépassé'],
                  ['doublon', 'Doublons'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={queueFilter === key ? 'is-active' : ''}
                  onClick={() => setQueueFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div ref={queueListRef} className="scroll" id="qList">
            {filteredFileItems.length > 0 ? (
              filteredFileItems.map((item) => {
                const isSelected = selectedSignalement?.id === item.id;
                const sev =
                  item.danger_immediat || item.en_retard || (item.gravite || '').toLowerCase() === 'critique'
                    ? 'crit'
                    : 'warn';
                const tag = item.danger_immediat
                  ? 'Danger immédiat'
                  : item.en_retard
                  ? 'SLA dépassé'
                  : 'Standard';
                const communeName = resolveCommuneLabel(item.commune, item.coords);
                const typeMeta = getTypeMeta(item.type);
                const refCode = item.reference_suivi.slice(0, 14).toUpperCase();
                const shortDesc =
                  item.description ||
                  'Signalement citoyen géolocalisé transmis depuis le terrain.';

                return (
                  <button
                    key={item.id}
                    type="button"
                    data-sid={item.id}
                    className={`al ${sev}`}
                    aria-current={isSelected}
                    onClick={() => handleSelectSignalement(item)}
                  >
                    <span className="r1">
                      <span className={`chip ${sev}`}>{tag}</span>
                      <span className={`score ${sev === 'crit' ? 'up-crit' : 'up-warn'}`}>
                        Score {item.score_priorite} pts
                      </span>
                    </span>

                    <span className="r2">
                      <span className="code">{refCode}</span>
                      <span>{communeName}</span>
                    </span>

                    <h3>{typeMeta.title}</h3>
                    <p>{shortDesc}</p>

                    <span className="r5">
                      <span>
                        Hauteur <b style={{ color: 'var(--tx)' }}>{item.hauteur_eau_cm ?? 0} cm</b>
                      </span>
                      <span>
                        {item.doublons_suggeres.length > 0 ? (
                          <span className="chip water">
                            {item.doublons_suggeres.length} doublon
                            {item.doublons_suggeres.length > 1 ? 's' : ''} proche
                            {item.doublons_suggeres.length > 1 ? 's' : ''}
                          </span>
                        ) : (
                          formatRelativeTime(item.cree_le)
                        )}
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <p style={{ padding: '24px', color: 'var(--tx3)' }}>
                {loading ? 'Chargement des alertes citoyennes…' : 'Toutes les alertes sont traitées.'}
              </p>
            )}
          </div>
        </section>

        {/* Colonne droite : Dossier de qualification */}
        <section ref={dossierRef} className="col col-d" id="dossier" aria-live="polite">
          {selectedSignalement ? (
            <>
              <div className="d-top oid-verif-dtop-compact">
                <div className="oid-verif-dtop-left">
                  <h2>
                    Signalement #{selectedSignalement.id} ·{' '}
                    {selectedSignalement.reference_suivi.slice(0, 14).toUpperCase()}
                  </h2>
                  <span className="chip water">
                    {resolveCommuneLabel(selectedSignalement.commune, selectedSignalement.coords)}
                  </span>
                </div>
                <span className="mono oid-verif-dtop-time">
                  Reçu à {formatUtcShort(selectedSignalement.cree_le)} UTC ·{' '}
                  {formatRelativeTime(selectedSignalement.cree_le)}
                </span>
              </div>

              <div ref={detailScrollRef} className="scroll">
                <div className="d-in">
                  {/* 1. Grille de spécifications (4 colonnes connectées) */}
                  <div className="panel specs">
                    <div className="spec">
                      <span className="eyebrow">Type d'aléa</span>
                      <div className="v">{getTypeMeta(selectedSignalement.type).label}</div>
                      <small>{getTypeMeta(selectedSignalement.type).sub}</small>
                    </div>

                    <div className="spec">
                      <span className="eyebrow">Gravité déclarée</span>
                      <div
                        className={`v ${
                          selectedSignalement.danger_immediat ||
                          (selectedSignalement.gravite || '').toLowerCase() === 'critique'
                            ? 'up-crit'
                            : 'up-warn'
                        }`}
                      >
                        {selectedSignalement.gravite}
                      </div>
                      <small>
                        {selectedSignalement.danger_immediat
                          ? 'Péril vital actif'
                          : 'Évaluation terrain'}
                      </small>
                    </div>

                    <div className="spec">
                      <span className="eyebrow">Hauteur d'eau</span>
                      <div className="v mono">{selectedSignalement.hauteur_eau_cm ?? 0} cm</div>
                      <WaterGaugeBar cm={selectedSignalement.hauteur_eau_cm ?? 0} />
                    </div>

                    <div className="spec">
                      <span className="eyebrow">Secteur PostGIS</span>
                      <div className="v" style={{ color: 'var(--water)' }}>
                        {resolveCommuneLabel(selectedSignalement.commune, selectedSignalement.coords)}
                      </div>
                      <small>
                        {selectedSignalement.coords
                          ? `${selectedSignalement.coords.lat.toFixed(4)}° N, ${Math.abs(
                              selectedSignalement.coords.lon
                            ).toFixed(4)}° W`
                          : 'Abidjan'}
                      </small>
                    </div>
                  </div>

                  {/* 2. Contrôle spatial · rayon de corroboration 400 m */}
                  <div className="mapbox">
                    <div className="hd">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span>Contrôle spatial · rayon 400 m</span>
                        <div className="seg" style={{ display: 'inline-flex', height: '24px' }}>
                          <button
                            type="button"
                            aria-pressed={basemap === 'dark'}
                            onClick={() => setBasemap('dark')}
                            style={{ padding: '0 8px', fontSize: '11px', lineHeight: '22px' }}
                            title="Fond sombre hydrologique O.I.D. (OpenStreetMap)"
                          >
                            Sombre OID
                          </button>
                          <button
                            type="button"
                            aria-pressed={basemap === 'satellite'}
                            onClick={() => setBasemap('satellite')}
                            style={{ padding: '0 8px', fontSize: '11px', lineHeight: '22px' }}
                            title="Vue aérienne satellite HD (Esri World Imagery)"
                          >
                            Satellite
                          </button>
                          <button
                            type="button"
                            aria-pressed={basemap === 'osm'}
                            onClick={() => setBasemap('osm')}
                            style={{ padding: '0 8px', fontSize: '11px', lineHeight: '22px' }}
                            title="Carte standard OpenStreetMap"
                          >
                            OSM
                          </button>
                        </div>
                      </div>

                      <span
                        className={
                          selectedSignalement.doublons_suggeres.length > 0 ? 'up-warn' : 'up-ok'
                        }
                      >
                        {selectedSignalement.doublons_suggeres.length > 0
                          ? `${selectedSignalement.doublons_suggeres.length} incident${
                              selectedSignalement.doublons_suggeres.length > 1 ? 's' : ''
                            } proche${
                              selectedSignalement.doublons_suggeres.length > 1 ? 's' : ''
                            } détecté${selectedSignalement.doublons_suggeres.length > 1 ? 's' : ''}`
                          : 'aucun incident proche'}
                      </span>
                    </div>
                    <div className="mm" id="vmap" style={{ height: '220px' }}>
                      <VerificationMiniMap
                        signalement={selectedSignalement}
                        communeLabel={resolveCommuneLabel(
                          selectedSignalement.commune,
                          selectedSignalement.coords
                        )}
                        basemap={basemap}
                        focusCoords={mapFocus}
                      />
                    </div>
                  </div>

                  {/* 3. Contrôles automatiques */}
                  <div>
                    <div className="sec-head">
                      <h2>Contrôles automatiques</h2>
                    </div>
                    <div className="checks">
                      {autoChecks.map((c, idx) => (
                        <div key={idx} className={`chk-i ${c.s}`}>
                          <span className="ic">
                            <svg className="icon">
                              <use href={c.s === 'ok' ? '#i-tick' : '#i-alert'} />
                            </svg>
                          </span>
                          <div>
                            <b style={{ fontWeight: 600 }}>{c.l}</b>
                            <small>{c.d}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 4. Description du citoyen */}
                  <div>
                    <div className="sec-head">
                      <h2>Description du citoyen</h2>
                    </div>
                    <blockquote>
                      «{' '}
                      {selectedSignalement.description ||
                        'Aucune description textuelle complémentaire fournie par le déclarant.'}{' '}
                      »
                    </blockquote>
                  </div>

                  {/* 5. Photographies certifiées */}
                  <div>
                    <div className="sec-head">
                      <h2>Photographies certifiées</h2>
                      <span
                        className="mono"
                        style={{
                          fontSize: '12px',
                          color: currentPhotosMeta.length > 0 ? 'var(--ok)' : 'var(--warn)',
                        }}
                      >
                        {currentPhotosMeta.length > 0
                          ? `${currentPhotosMeta.length} fichier${
                              currentPhotosMeta.length > 1 ? 's' : ''
                            } · EXIF GPS valide`
                          : 'aucun fichier'}
                      </span>
                    </div>

                    {currentPhotosMeta.length > 0 ? (
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {currentPhotosMeta.map((pMeta, idx) => {
                          const metaLabel = `${formatUtcFull(selectedSignalement.cree_le)} · ${
                            pMeta.taille_formatee || '2,4 Mo'
                          }`;
                          return (
                            <div key={idx} className="file">
                              <div
                                className="ph"
                                onClick={() =>
                                  setLightboxItem({
                                    url: pMeta.url,
                                    name: pMeta.filename,
                                    meta: metaLabel,
                                  })
                                }
                                style={{ cursor: 'pointer', overflow: 'hidden', position: 'relative' }}
                              >
                                {pMeta.url ? (
                                  <img
                                    src={apiUrl(pMeta.url)}
                                    alt={pMeta.filename}
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'cover',
                                    }}
                                  />
                                ) : (
                                  <svg className="icon">
                                    <use href="#i-cam" />
                                  </svg>
                                )}
                              </div>
                              <div className="meta">
                                <b>{pMeta.filename}</b>
                                <span>{metaLabel} · SHA-256 vérifié</span>
                                <button
                                  type="button"
                                  className="linkbtn"
                                  onClick={() =>
                                    setLightboxItem({
                                      url: pMeta.url,
                                      name: pMeta.filename,
                                      meta: metaLabel,
                                    })
                                  }
                                >
                                  Voir en plein écran
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="nophoto">
                        Ce signalement n'a pas de photo. Validez-le seulement si la description et la
                        pluviométrie suffisent.
                      </div>
                    )}
                  </div>

                  {/* 6. Doublons potentiels */}
                  {selectedSignalement.doublons_suggeres.length > 0 && (
                    <div>
                      <div className="sec-head">
                        <div>
                          <h2>Doublons potentiels</h2>
                          <p>Incidents ouverts à moins de 400 m.</p>
                        </div>
                        <span className="mono" style={{ fontSize: '11.5px', color: 'var(--tx3)' }}>
                          ST_DWithin
                        </span>
                      </div>
                      <div className="dups">
                        {selectedSignalement.doublons_suggeres.map((d) => (
                          <div key={d.id} className="dup oid-verif-dup-card">
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <b>
                                Incident #{d.id} · {d.reference_publique.slice(0, 14).toUpperCase()}
                                {d.commune ? ` · ${d.commune}` : ''}
                              </b>
                              <small>
                                {d.distance_m != null ? `À ${d.distance_m} m` : 'Rayon < 400 m'} ·{' '}
                                statut {d.statut.toLowerCase()} · {d.nb_signalements_lies || 1}{' '}
                                signalement{(d.nb_signalements_lies || 1) > 1 ? 's' : ''} lié
                                {(d.nb_signalements_lies || 1) > 1 ? 's' : ''}
                                {d.cree_le ? ` · ${formatRelativeTime(d.cree_le)}` : ''}
                              </small>
                              {d.description && (
                                <p className="oid-verif-dup-desc">« {d.description} »</p>
                              )}
                            </div>
                            <div className="oid-verif-dup-actions">
                              {d.coords && (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  title="Centrer la carte sur cet incident"
                                  onClick={() =>
                                    setMapFocus({
                                      lat: d.coords!.lat,
                                      lon: d.coords!.lon,
                                      label: `<strong>Incident #${d.id}</strong><br/>${
                                        d.commune || 'Doublon suggéré'
                                      } (${d.distance_m != null ? `${d.distance_m} m` : '< 400 m'})`,
                                    })
                                  }
                                >
                                  Localiser
                                </button>
                              )}
                              <button
                                id="btn-merge"
                                type="button"
                                className="btn btn-sm"
                                disabled={actionLoading}
                                onClick={() => handleFusionner(selectedSignalement.id, d.id)}
                              >
                                Fusionner
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 7. Requalification avant validation */}
                  <div className="oid-verif-requal">
                    <div className="sec-head">
                      <div>
                        <h2>Requalification avant validation</h2>
                        <p>Corrigez si besoin la nature ou la gravité déclarée par le citoyen.</p>
                      </div>
                    </div>
                    <div className="oid-verif-requal-grid">
                      <label className="oid-verif-field">
                        <span>Type d'incident</span>
                        <select
                          value={qualType}
                          onChange={(e) => setQualType(e.target.value)}
                        >
                          <option value="ruissellement">Ruissellement urbain</option>
                          <option value="crue">Crue / Cours d'eau</option>
                          <option value="refoulement">Refoulement de collecteur</option>
                          <option value="lagunaire">Submersion lagunaire</option>
                          <option value="nappe">Remontée de nappe</option>
                          <option value="route">Coupure d'axe routier</option>
                          <option value="habitation">Submersion d'habitation</option>
                          <option value="glissement">Glissement de terrain</option>
                        </select>
                      </label>

                      <label className="oid-verif-field">
                        <span>Gravité estimée</span>
                        <select
                          value={qualGravite}
                          onChange={(e) => setQualGravite(e.target.value)}
                        >
                          <option value="faible">Faible</option>
                          <option value="moyenne">Moyenne</option>
                          <option value="elevee">Élevée</option>
                          <option value="critique">Critique</option>
                        </select>
                      </label>

                      <label className="oid-verif-check">
                        <input
                          type="checkbox"
                          checked={qualDanger}
                          onChange={(e) => setQualDanger(e.target.checked)}
                        />
                        <span>Danger immédiat (péril vital)</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Barre de décision compacte épinglée en bas (.foot) */}
              <div className="foot oid-verif-foot-compact">
                {rejectOpen ? (
                  <div className="oid-verif-reject-drawer">
                    <div className="rej">
                      <input
                        ref={rejectInputRef}
                        id="reject-reason"
                        type="text"
                        value={rejectMotif}
                        onChange={(e) => {
                          setRejectMotif(e.target.value);
                          if (rejectErr) setRejectErr('');
                        }}
                        className={`input ${rejectErr ? 'bad' : ''}`}
                        placeholder="Motif de rejet obligatoire"
                        aria-label="Motif de rejet"
                      />
                      <button
                        id="btn-reject"
                        type="button"
                        className="btn oid-verif-rej-btn"
                        disabled={actionLoading}
                        onClick={() => handleRejeter(selectedSignalement.id)}
                      >
                        <svg className="icon">
                          <use href="#i-x" />
                        </svg>
                        Confirmer le rejet
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={actionLoading}
                        onClick={() => {
                          setRejectOpen(false);
                          setRejectErr('');
                        }}
                      >
                        Annuler
                      </button>
                    </div>

                    <div className="qs">
                      {QUICK_REJECT_MOTIFS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setRejectMotif(m);
                            setRejectErr('');
                            rejectInputRef.current?.focus();
                          }}
                        >
                          {m}
                        </button>
                      ))}
                    </div>

                    {rejectErr && (
                      <div className="err" id="rejErr" role="alert">
                        {rejectErr}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="oid-verif-foot-bar">
                    <button
                      type="button"
                      className="btn oid-verif-rej-btn"
                      disabled={actionLoading}
                      onClick={() => {
                        setRejectOpen(true);
                        window.setTimeout(() => rejectInputRef.current?.focus(), 0);
                      }}
                    >
                      <svg className="icon">
                        <use href="#i-x" />
                      </svg>
                      Rejeter…
                    </button>

                    <button
                      id="btn-validate"
                      type="button"
                      className="btn oid-verif-val-btn"
                      disabled={actionLoading}
                      onClick={() => handleValider(selectedSignalement.id)}
                    >
                      <svg className="icon">
                        <use href="#i-tick" />
                      </svg>
                      {actionLoading
                        ? 'Qualification en cours…'
                        : 'Valider et promouvoir en incident'}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="empty">
              <div className="big">0</div>
              <h2>Plus aucune alerte en attente</h2>
              <p>La prochaine synchronisation ramènera les nouveaux signalements.</p>
              <div className="tally">
                <span>
                  Validés <b className="up-ok">{tally.val}</b>
                </span>
                <span>
                  Fusionnés <b>{tally.mer}</b>
                </span>
                <span>
                  Rejetés <b className="up-crit">{tally.rej}</b>
                </span>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: '14px' }}
                onClick={() => setActiveTab('historique')}
              >
                Consulter l'historique ({historiqueItems.length})
              </button>
            </div>
          )}
        </section>
        </div>
      ) : (
        <div style={{ padding: '24px 32px' }}>
          {selectedHistorique ? (
            <div
              className="panel pad oid-verif-hist-detail"
              style={{ border: '1px solid var(--line)', borderRadius: '16px', background: 'var(--s1)' }}
            >
              <div className="oid-verif-hist-detail-bar">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setSelectedHistorique(null);
                    setHistoriqueDetail(null);
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    arrow_back
                  </span>
                  <span>Retour à l'historique</span>
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span
                    className={`chip ${
                      selectedHistorique.statut === 'valide'
                        ? 'ok'
                        : selectedHistorique.statut === 'rejete'
                        ? 'crit'
                        : 'water'
                    }`}
                  >
                    {selectedHistorique.statut.toUpperCase()}
                  </span>
                  <span className="mono" style={{ fontSize: '13px', color: 'var(--tx2)' }}>
                    {selectedHistorique.reference_suivi}
                  </span>
                </div>
              </div>

              {historiqueDetailLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx2)' }}>
                  Chargement de la fiche d'archive…
                </div>
              ) : (
                <div className="oid-verif-hist-detail-body">
                  <div className="oid-verif-hist-head">
                    <div>
                      <span className="eyebrow">FICHE DE DÉCISION · ARCHIVE VÉRIFICATION</span>
                      <h2>
                        {getTypeMeta(historiqueDetail?.type || selectedHistorique.type).title}
                      </h2>
                      <p>
                        Secteur :{' '}
                        <strong>
                          {resolveCommuneLabel(
                            historiqueDetail?.commune ?? selectedHistorique.commune,
                            historiqueDetail?.coords ?? selectedHistorique.coords
                          )}
                        </strong>{' '}
                        · Vérifié par{' '}
                        <strong>{selectedHistorique.verifie_par_nom || 'Agent O.I.D'}</strong> le{' '}
                        {selectedHistorique.verifie_le
                          ? new Date(selectedHistorique.verifie_le).toLocaleString('fr-FR')
                          : '—'}
                      </p>
                    </div>
                  </div>

                  <div className="oid-verif-hist-decision">
                    {selectedHistorique.statut === 'valide' && (
                      <div className="oid-verif-hist-banner is-ok">
                        <strong>Signalement validé et promu</strong>
                        <span>
                          Incident créé : #{selectedHistorique.incident_id || '—'}
                        </span>
                      </div>
                    )}
                    {selectedHistorique.statut === 'doublon' && (
                      <div className="oid-verif-hist-banner is-merge">
                        <strong>Signalement fusionné (doublon)</strong>
                        <span>
                          Rattaché à l'incident #{selectedHistorique.incident_id || '—'}
                        </span>
                      </div>
                    )}
                    {selectedHistorique.statut === 'rejete' && (
                      <div className="oid-verif-hist-banner is-crit">
                        <strong>Signalement rejeté</strong>
                        <span>
                          Motif : {selectedHistorique.motif_rejet || 'Non précisé'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="oid-verif-hist-grid">
                    <div className="oid-verif-hist-card">
                      <h4>Déclaration citoyenne</h4>
                      <p>
                        {historiqueDetail?.description
                          ? `« ${historiqueDetail.description} »`
                          : 'Aucune description textuelle enregistrée.'}
                      </p>
                      <div className="oid-verif-hist-meta">
                        <span>
                          Hauteur d'eau : <b>{historiqueDetail?.hauteur_eau_cm ?? 0} cm</b>
                        </span>
                        <span>
                          Gravité : <b>{historiqueDetail?.gravite || '—'}</b>
                        </span>
                        <span>
                          Score priorité : <b>{historiqueDetail?.score_priorite ?? '—'} pts</b>
                        </span>
                      </div>
                    </div>

                    <div className="oid-verif-hist-card">
                      <h4>Localisation GPS</h4>
                      {(historiqueDetail?.coords || selectedHistorique.coords) ? (
                        <>
                          <p className="mono" style={{ fontSize: '13px' }}>
                            {(historiqueDetail?.coords || selectedHistorique.coords)!.lat.toFixed(5)}° N,{' '}
                            {(historiqueDetail?.coords || selectedHistorique.coords)!.lon.toFixed(5)}° W
                          </p>
                          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <a
                              href={`https://maps.google.com/?q=${
                                (historiqueDetail?.coords || selectedHistorique.coords)!.lat
                              },${(historiqueDetail?.coords || selectedHistorique.coords)!.lon}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: 'var(--water)', fontSize: '13px', fontWeight: 600 }}
                            >
                              Ouvrir dans Google Maps
                            </a>
                            <a
                              href={`https://www.openstreetmap.org/#map=17/${
                                (historiqueDetail?.coords || selectedHistorique.coords)!.lat
                              }/${(historiqueDetail?.coords || selectedHistorique.coords)!.lon}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: 'var(--water)', fontSize: '13px', fontWeight: 600 }}
                            >
                              OpenStreetMap
                            </a>
                          </div>
                        </>
                      ) : (
                        <p>Coordonnées indisponibles.</p>
                      )}
                    </div>
                  </div>

                  <div className="oid-verif-hist-card">
                    <h4>Photographies jointes ({historiqueDetail?.photos_meta?.length || 0})</h4>
                    {historiqueDetail?.photos_meta && historiqueDetail.photos_meta.length > 0 ? (
                      <div className="oid-verif-hist-photos">
                        {historiqueDetail.photos_meta.map((pMeta, idx) => (
                          <div
                            key={idx}
                            className="oid-verif-hist-photo"
                            onClick={() =>
                              setLightboxItem({
                                url: pMeta.url,
                                name: pMeta.filename,
                                meta: pMeta.taille_formatee || 'Photo archivée',
                              })
                            }
                          >
                            <img src={apiUrl(pMeta.url)} alt={pMeta.filename} />
                            <span>{pMeta.filename}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: 'var(--tx3)' }}>Aucune photographie jointe.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="panel pad" style={{ border: '1px solid var(--line)', borderRadius: '16px', background: 'var(--s1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--tx)' }}>Historique des alertes traitées</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--tx2)' }}>
                    Traçabilité complète des signalements vérifiés, fusionnés ou rejetés ({filteredHistoriqueItems.length}/{historiqueItems.length})
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => loadHistorique()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>refresh</span>
                  <span>Rafraîchir</span>
                </button>
              </div>

              <div className="oid-verif-hfilters">
                <div className="oid-verif-qsearch" style={{ flex: '1 1 240px' }}>
                  <span className="material-symbols-outlined">search</span>
                  <input
                    type="text"
                    value={histSearch}
                    onChange={(e) => setHistSearch(e.target.value)}
                    placeholder="Rechercher par réf., commune, agent, motif…"
                    aria-label="Rechercher dans l'historique"
                  />
                </div>
                <div className="oid-verif-qchips">
                  {(
                    [
                      ['all', 'Tous'],
                      ['valide', 'Validés'],
                      ['doublon', 'Fusionnés'],
                      ['rejete', 'Rejetés'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={histStatus === key ? 'is-active' : ''}
                      onClick={() => setHistStatus(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Réf. Suivi</th>
                      <th>Type &amp; Commune</th>
                      <th>Statut</th>
                      <th>Vérifié par</th>
                      <th>Date Traitement</th>
                      <th>Détails &amp; Destination</th>
                      <th style={{ textAlign: 'right' }}>Fiche</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistoriqueItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--tx3)' }}>
                          Aucun signalement ne correspond aux filtres sélectionnés.
                        </td>
                      </tr>
                    ) : (
                      filteredHistoriqueItems.map((h) => (
                        <tr
                          key={h.id}
                          className="oid-verif-hist-row"
                          onClick={() => handleOpenHistoriqueDetail(h)}
                        >
                          <td><strong className="code">{h.reference_suivi}</strong></td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{getTypeMeta(h.type).label}</div>
                            <div style={{ fontSize: '12px', color: 'var(--tx3)' }}>
                              {resolveCommuneLabel(h.commune, h.coords)}
                            </div>
                          </td>
                          <td>
                            <span className={`chip ${h.statut === 'valide' ? 'ok' : h.statut === 'rejete' ? 'crit' : 'water'}`}>
                              {h.statut}
                            </span>
                          </td>
                          <td>{h.verifie_par_nom || '—'}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>
                            {h.verifie_le ? new Date(h.verifie_le).toLocaleString('fr-FR') : '—'}
                          </td>
                          <td style={{ fontSize: '13px' }}>
                            {h.statut === 'valide' && h.incident_id && (
                              <span style={{ color: 'var(--water)', fontWeight: 600 }}>Incident #{h.incident_id}</span>
                            )}
                            {h.statut === 'rejete' && (
                              <span style={{ color: 'var(--crit)' }}>Motif : {h.motif_rejet || 'Non précisé'}</span>
                            )}
                            {h.statut === 'doublon' && (
                              <span style={{ color: 'var(--tx2)' }}>Fusionné dans incident #{h.incident_id}</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenHistoriqueDetail(h);
                              }}
                            >
                              Consulter
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      </main>

      {/* Lightbox plein écran (.lbx) */}
      {lightboxItem && (
        <div className="lbx" id="lightbox" onClick={() => setLightboxItem(null)}>
          <div className="frame" onClick={(e) => e.stopPropagation()}>
            <div className="img">
              {lightboxItem.url ? (
                <img
                  src={apiUrl(lightboxItem.url)}
                  alt={lightboxItem.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <>
                  <svg className="icon" style={{ width: '40px', height: '40px' }}>
                    <use href="#i-cam" />
                  </svg>
                  <span>{lightboxItem.name}</span>
                  <span>Aperçu de la preuve terrain</span>
                </>
              )}
            </div>
            <div className="cap">
              <span>
                {lightboxItem.name} · {lightboxItem.meta}
              </span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setLightboxItem(null)}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
