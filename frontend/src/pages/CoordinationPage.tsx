import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiFetch, apiUrl, getToken } from '../api/client';
import { BrandMark, VigilancePill } from '../components/shell';
import { EnqueteReportView } from '../components/EnqueteReportView';
import {
  SigAnalysisMap,
  type PointChaud,
  type IndiceVulnerabilite,
  type ZoneSilencieuse,
  type CommunesGeoJsonCollection,
} from '../components/SigAnalysisMap';

/** Lit une variable CSS du thème courant (les couches Leaflet n'acceptent pas var()). */
const readToken = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

interface StatsData {
  incidents: number;
  ouverts: number;
  evalues: number;
  couverture: string;
  retard_critique: number;
  retard_standard: number;
  retards_total: number;
  menages_touches: number;
  personnes_affectees: number;
  blesses: number;
  deplaces: number;
  deces: number;
  disparus: number;
}

interface PhotoMetaItem {
  url: string;
  filename: string;
  taille_octets: number;
  taille_formatee: string;
  format: string;
  exif_present: boolean;
  exif_gps: boolean;
}

interface LinkedSignalementItem {
  id: number;
  reference_suivi: string;
  type: string;
  hauteur_eau_cm: number | null;
  gravite: string;
  danger_immediat: boolean;
  danger_type: string | null;
  description: string | null;
  statut: string;
  cree_le: string | null;
  photos?: string[];
  photos_meta?: PhotoMetaItem[];
}

interface IncidentEvaluationData {
  id: number;
  statut: string;
  menages_touches: number;
  personnes_affectees: number;
  blesses: number;
  deplaces: number;
  deces: number;
  disparus: number;
  degats: string | null;
  routes_coupees: string | null;
  risques_sanitaires: string | null;
  besoins: string | null;
  recommandations: string | null;
  soumise_le: string | null;
  photos?: string[];
  photos_meta?: PhotoMetaItem[];
}

interface IncidentItem {
  id: number;
  reference_publique: string;
  type: string;
  statut: string;
  score_priorite: number;
  niveau_fiabilite: string;
  enqueteur_id: number | null;
  enqueteur_nom?: string | null;
  danger_immediat: boolean;
  cree_le: string | null;
  maj_le?: string | null;
  cloture_le?: string | null;
  zone_id?: number | null;
  commune?: string | null;
  code_adm?: string | null;
  coords?: { lat: number; lon: number } | null;
  nb_signalements?: number;
  hauteur_eau_max_cm?: number | null;
  gravite_max?: string;
  description_synthese?: string | null;
  signalements_lies?: LinkedSignalementItem[];
  evaluation?: IncidentEvaluationData | null;
}

interface EnqueteurItem {
  id: number;
  nom: string;
  email: string;
  zone_id?: number | null;
  zone_nom?: string | null;
  dossiers_actifs: number;
}

interface ZoneItem {
  id: number;
  nom: string;
}

interface UtilisateurItem {
  id: number;
  nom: string;
  email: string;
  role: string;
  actif: boolean;
  zone_id: number | null;
  derniere_connexion: string | null;
  dossiers_actifs: number;
}

type CoordTab = 'kpis' | 'carte' | 'incidents' | 'utilisateurs';
type MapQuickFilter = 'tous' | 'danger' | 'ouverts' | 'evalues' | 'clotures';
type IncidentStatusFilter = 'tous' | 'a_affecter' | 'ouverts' | 'affectes' | 'evalues' | 'clotures' | 'danger';
type IncidentSortKey = 'priorite' | 'date';
type UserRoleFilter = 'tous' | 'coordinateur' | 'verificateur' | 'enqueteur';

const ROLE_LABELS: Record<string, string> = {
  coordinateur: 'Coordinateur',
  verificateur: 'Vérificateur',
  enqueteur: 'Enquêteur terrain',
};

const formatIncidentType = (raw: string): string => {
  if (!raw) return 'Non spécifié';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
};

const getIncidentTypeMeta = (raw: string): { title: string; sub: string } => {
  const t = (raw || '').toLowerCase();
  if (t.includes('habitation') || t.includes('maison') || t.includes('domicile')) {
    return { title: 'Inondation de habitation / Voirie', sub: 'Submersion résidentielle & accès' };
  }
  if (t.includes('route') || t.includes('voirie') || t.includes('axe') || t.includes('pont')) {
    return { title: 'Submersion de voirie & Axe coupé', sub: 'Rupture de trafic routier' };
  }
  if (t.includes('caniveau') || t.includes('ouvrage') || t.includes('drain')) {
    return { title: "Débordement d'ouvrage de drainage", sub: 'Saturation canalisation / collecteur' };
  }
  if (t.includes('eboulement') || t.includes('glissement')) {
    return { title: 'Glissement de terrain / Érosion', sub: 'Instabilité géotechnique de talus' };
  }
  return { title: formatIncidentType(raw), sub: 'Aléa hydrométéorologique urbain' };
};

const getWaterHeightContext = (cm: number | null | undefined): string => {
  if (cm == null || cm <= 0) return 'Niveau non mesuré sur site';
  if (cm >= 100) return 'Seuil critique de submersion (> 1 m)';
  if (cm >= 50) return 'Circulation impossible & risque électrique';
  if (cm >= 20) return 'Franchissement piéton et berline difficile';
  return "Lame d'eau superficielle de ruissellement";
};

const formatRelativeTime = (iso: string | null | undefined): string => {
  if (!iso) return 'Récemment';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.max(1, Math.round(diffMs / 60000));
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
};

const formatUtcTime = (iso: string | null | undefined): string => {
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

const formatShortDate = (iso: string | null): string => {
  if (!iso) return 'Date non renseignée';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const getFiabilitePresentation = (raw: string | null | undefined, statut: string) => {
  if (statut === 'cloture') return { label: '100% Clôturé', cls: 'text-muted-oid' };
  if (statut === 'evalue') return { label: '100% Vérifié', cls: 'text-mint' };
  const f = (raw || '').toLowerCase();
  if (f.includes('confir') || f.includes('elev') || f.includes('élev') || f.includes('haute')) {
    return { label: '96% Confirmé', cls: 'text-mint' };
  }
  if (f.includes('corrob')) {
    return { label: '90% Corroboré', cls: 'text-mint' };
  }
  return { label: '85% Déclaré', cls: 'text-sky' };
};

const IncidentMiniMap: React.FC<{
  incident: IncidentItem;
  communeLabel: string;
}> = ({ incident, communeLabel }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || !incident.coords) return;

    if (!mapRef.current) {
      const map = L.map(containerRef.current, {
        scrollWheelZoom: false,
        zoomControl: true,
      }).setView([incident.coords.lat, incident.coords.lon], 15);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      layerGroupRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
    }

    const map = mapRef.current;
    const lg = layerGroupRef.current;
    if (!map || !lg) return;

    lg.clearLayers();
    const { lat, lon } = incident.coords;
    map.setView([lat, lon], 15, { animate: true });

    const water = readToken('--water', '#0b5fc4');
    const ok = readToken('--ok', '#0b7a4f');
    const crit = readToken('--crit', '#b3261e');
    const surface = readToken('--s1', '#ffffff');

    L.circle([lat, lon], {
      radius: 400,
      color: incident.danger_immediat ? crit : water,
      weight: 1.5,
      dashArray: '5, 6',
      fillColor: incident.danger_immediat ? crit : water,
      fillOpacity: 0.08,
    }).addTo(lg);

    L.circleMarker([lat, lon], {
      radius: 9,
      color: surface,
      fillColor: incident.danger_immediat
        ? crit
        : incident.statut === 'evalue'
        ? ok
        : water,
      fillOpacity: 1,
      weight: 2.5,
    })
      .bindPopup(`<strong>Incident #${incident.id}</strong><br/>${communeLabel}`)
      .addTo(lg);
  }, [incident, communeLabel]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return <div ref={containerRef} style={{ height: '205px', width: '100%' }} />;
};

const EMPTY_HOTSPOTS: PointChaud[] = [];
const EMPTY_VULNERABILITIES: IndiceVulnerabilite[] = [];
const EMPTY_SILENT_ZONES: ZoneSilencieuse[] = [];
const NOOP_HEX_THEME = () => {};

const LiveClockDisplay: React.FC = () => {
  const [clock, setClock] = useState<string>(() => {
    return (
      new Date().toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'UTC',
      }) + ' UTC'
    );
  });

  useEffect(() => {
    const tick = () => {
      setClock(
        new Date().toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'UTC',
        }) + ' UTC'
      );
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="ck" style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--tx2)' }}>
      {clock}
    </span>
  );
};

export const CoordinationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<CoordTab>('kpis');
  const [isMapKpiSidebarOpen, setIsMapKpiSidebarOpen] = useState(true);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [enqueteurs, setEnqueteurs] = useState<EnqueteurItem[]>([]);
  const [zones, setZones] = useState<ZoneItem[]>([]);
  const [utilisateurs, setUtilisateurs] = useState<UtilisateurItem[]>([]);
  const [carteGeoJson, setCarteGeoJson] = useState<any>(null);
  const [communesGeoJson, setCommunesGeoJson] = useState<CommunesGeoJsonCollection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtres opérationnels (Carte, Incidents, Utilisateurs)
  const [mapFilter, setMapFilter] = useState<MapQuickFilter>('tous');
  const [mapCommuneFilter, setMapCommuneFilter] = useState<string>('all');
  const [mapSearchRef, setMapSearchRef] = useState<string>('');
  const [mapFocusIncidentId, setMapFocusIncidentId] = useState<number | null>(null);

  const [incidentSearch, setIncidentSearch] = useState('');
  const [incidentFilter, setIncidentFilter] = useState<IncidentStatusFilter>('tous');
  const [incidentSort, setIncidentSort] = useState<IncidentSortKey>('priorite');
  const [kpiTablePage, setKpiTablePage] = useState(1);

  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<UserRoleFilter>('tous');

  // Affectation modal / state (table rapide Onglet 2 + panneau Onglet 3)
  const [affectingId, setAffectingId] = useState<number | null>(null);
  const [selectedEnqueteurId, setSelectedEnqueteurId] = useState<number | ''>('');

  // Vue 2 colonnes Onglet 3 (Gestion des Incidents type Vérification)
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);
  const [panelEnqueteurId, setPanelEnqueteurId] = useState<number | ''>('');
  const [reopenMotif, setReopenMotif] = useState('');
  const [reopenRingError, setReopenRingError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showFullReportModal, setShowFullReportModal] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const handleSelectMapCommune = useCallback((zid: number | '') => {
    setMapCommuneFilter(zid ? String(zid) : 'all');
  }, []);

  const carteFocusTarget = useMemo(() => {
    if (!mapFocusIncidentId) return null;
    const inc = incidents.find((i) => i.id === mapFocusIncidentId);
    return inc?.coords ? { lat: inc.coords.lat, lon: inc.coords.lon, zoom: 15 } : null;
  }, [mapFocusIncidentId, incidents]);

  const enrichedCarteGeoJson = useMemo(() => {
    if (!carteGeoJson || !carteGeoJson.features) return carteGeoJson;
    const feats = carteGeoJson.features.map((feat: any) => {
      if (feat.properties && feat.properties.zone_id != null) return feat;
      const incItem = incidents.find((i) => i.id === feat.properties?.id);
      if (incItem && incItem.zone_id != null) {
        return {
          ...feat,
          properties: {
            ...feat.properties,
            zone_id: incItem.zone_id,
          },
        };
      }
      return feat;
    });
    return { ...carteGeoJson, features: feats };
  }, [carteGeoJson, incidents]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const detailScrollRef = useRef<HTMLDivElement>(null);
  const detailColRef = useRef<HTMLDivElement>(null);
  const queueListRef = useRef<HTMLDivElement>(null);
  const reopenInputRef = useRef<HTMLInputElement>(null);

  const handleOpenIncidentFromMap = useCallback((id: number) => {
    setIncidentFilter('tous');
    setIncidentSearch('');
    setSelectedIncidentId(id);
    setActiveTab('incidents');
    window.setTimeout(() => {
      if (detailScrollRef.current) {
        detailScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (queueListRef.current) {
        const cardEl = queueListRef.current.querySelector(`[data-iid="${id}"]`) as HTMLElement | null;
        cardEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      if (window.innerWidth < 1080 && detailColRef.current) {
        detailColRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  // Nouveau compte utilisateur
  const [showNewUser, setShowNewUser] = useState(false);
  const [newNom, setNewNom] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('enqueteur');
  const [newZoneId, setNewZoneId] = useState<number | ''>('');

  // Édition utilisateur
  const [editingUser, setEditingUser] = useState<UtilisateurItem | null>(null);
  const [editNom, setEditNom] = useState('');
  const [editRole, setEditRole] = useState('enqueteur');
  const [editZoneId, setEditZoneId] = useState<number | ''>('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sData, iData, eData, zData, commData] = await Promise.all([
        apiFetch<StatsData>('/coordination/stats'),
        apiFetch<IncidentItem[]>('/coordination/incidents'),
        apiFetch<EnqueteurItem[]>('/coordination/enqueteurs'),
        apiFetch<ZoneItem[]>('/coordination/zones'),
        apiFetch<CommunesGeoJsonCollection>('/analyses/communes').catch(() => null),
      ]);
      setStats(sData);
      setIncidents(iData);
      setEnqueteurs(eData);
      setZones(zData);
      if (commData) {
        setCommunesGeoJson(commData);
      }
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement des données.');
    } finally {
      setLoading(false);
    }
  };

  const loadCarte = async () => {
    setLoading(true);
    try {
      const [geo, commData] = await Promise.all([
        apiFetch<any>('/coordination/carte'),
        communesGeoJson
          ? Promise.resolve(communesGeoJson)
          : apiFetch<CommunesGeoJsonCollection>('/analyses/communes').catch(() => null),
      ]);
      setCarteGeoJson(geo);
      if (commData) {
        setCommunesGeoJson(commData);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadUtilisateurs = async () => {
    try {
      const uData = await apiFetch<UtilisateurItem[]>('/coordination/utilisateurs');
      setUtilisateurs(uData);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRefreshAll = () => {
    loadData();
    if (activeTab === 'carte') loadCarte();
    else if (activeTab === 'utilisateurs') loadUtilisateurs();
  };

  useEffect(() => {
    loadData();
    if (activeTab === 'carte') {
      loadCarte();
    } else if (activeTab === 'utilisateurs') {
      loadUtilisateurs();
    }
  }, [activeTab]);

  const handleAffecter = async (incidentId: number) => {
    if (!selectedEnqueteurId) return;
    try {
      await apiFetch(`/coordination/incidents/${incidentId}/affecter`, {
        method: 'POST',
        body: JSON.stringify({ enqueteur_id: Number(selectedEnqueteurId) }),
      });
      setAffectingId(null);
      setSelectedEnqueteurId('');
      loadData();
      if (activeTab === 'carte') loadCarte();
    } catch (err: any) {
      alert(`Erreur d'affectation : ${err.message}`);
    }
  };

  const handleCloturer = async (incidentId: number) => {
    if (!window.confirm('Confirmer la clôture de cet incident ?')) return;
    try {
      await apiFetch(`/coordination/incidents/${incidentId}/cloturer`, { method: 'POST' });
      loadData();
      if (activeTab === 'carte') loadCarte();
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    }
  };

  const handleRouvrir = async (incidentId: number) => {
    const motif = window.prompt('Motif de la réouverture :');
    if (!motif) return;
    try {
      await apiFetch(`/coordination/incidents/${incidentId}/rouvrir`, {
        method: 'POST',
        body: JSON.stringify({ motif }),
      });
      loadData();
      if (activeTab === 'carte') loadCarte();
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/coordination/utilisateurs', {
        method: 'POST',
        body: JSON.stringify({
          nom: newNom,
          email: newEmail,
          password: newPassword,
          role: newRole,
          zone_id: newZoneId ? Number(newZoneId) : null,
        }),
      });
      setShowNewUser(false);
      setNewNom('');
      setNewEmail('');
      setNewPassword('');
      setNewZoneId('');
      loadUtilisateurs();
      loadData();
      alert('Utilisateur créé avec succès.');
    } catch (err: any) {
      alert(`Erreur création : ${err.message}`);
    }
  };

  const handleToggleActif = async (uid: number, actifActuel: boolean) => {
    try {
      await apiFetch(`/coordination/utilisateurs/${uid}/actif?actif=${!actifActuel}`, {
        method: 'PATCH',
      });
      loadUtilisateurs();
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    }
  };

  const handleResetPassword = async (uid: number, nom: string) => {
    const newPass = window.prompt(`Entrez le nouveau mot de passe pour ${nom} (minimum 8 caractères) :`);
    if (!newPass) return;
    if (newPass.length < 8) {
      alert('Le mot de passe doit comporter au moins 8 caractères.');
      return;
    }
    try {
      await apiFetch(
        `/coordination/utilisateurs/${uid}/mot-de-passe?nouveau_mot_de_passe=${encodeURIComponent(newPass)}`,
        {
          method: 'PATCH',
        }
      );
      alert(`Mot de passe mis à jour avec succès pour ${nom}.`);
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    }
  };

  const startEditUser = (u: UtilisateurItem) => {
    setShowNewUser(false);
    setEditingUser(u);
    setEditNom(u.nom);
    setEditRole(u.role);
    setEditZoneId(u.zone_id || '');
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await apiFetch(`/coordination/utilisateurs/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nom: editNom,
          role: editRole,
          zone_id: editZoneId ? Number(editZoneId) : null,
        }),
      });
      setEditingUser(null);
      loadUtilisateurs();
      loadData();
      alert('Utilisateur modifié avec succès.');
    } catch (err: any) {
      alert(`Erreur modification : ${err.message}`);
    }
  };

  const downloadFile = (endpoint: string, filename: string) => {
    const token = getToken();
    fetch(apiUrl(endpoint), {
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch((err) => alert(`Erreur de téléchargement : ${err.message}`));
  };

  // --- Métriques dérivées ---
  const topCriticalIncidents = useMemo(() => {
    return [...incidents]
      .filter((i) => i.statut !== 'cloture')
      .sort((a, b) => {
        if (a.danger_immediat !== b.danger_immediat) return a.danger_immediat ? -1 : 1;
        return b.score_priorite - a.score_priorite;
      })
      .slice(0, 3);
  }, [incidents]);

  // Filtrage & tri de la table des incidents
  const filteredIncidents = useMemo(() => {
    const q = incidentSearch.trim().toLowerCase();
    return [...incidents]
      .filter((inc) => {
        if (incidentFilter === 'a_affecter' && !(['ouvert', 'rouvert'].includes(inc.statut) && !inc.enqueteur_id)) {
          return false;
        }
        if (incidentFilter === 'ouverts' && !['ouvert', 'rouvert'].includes(inc.statut)) return false;
        if (incidentFilter === 'affectes' && inc.statut !== 'affecte') return false;
        if (incidentFilter === 'evalues' && inc.statut !== 'evalue') return false;
        if (incidentFilter === 'clotures' && inc.statut !== 'cloture') return false;
        if (incidentFilter === 'danger' && !inc.danger_immediat) return false;

        if (!q) return true;
        const enq = enqueteurs.find((e) => e.id === inc.enqueteur_id);
        const zoneNom = inc.zone_id ? zones.find((zn) => zn.id === inc.zone_id)?.nom || '' : '';
        const communeName = (inc.commune || zoneNom).toLowerCase();
        const idStr = String(inc.id);
        return (
          idStr.includes(q.replace(/^#/, '')) ||
          `#${idStr}`.includes(q) ||
          inc.reference_publique.toLowerCase().includes(q) ||
          inc.type.toLowerCase().includes(q) ||
          inc.statut.toLowerCase().includes(q) ||
          communeName.includes(q) ||
          (enq && enq.nom.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (incidentSort === 'date') {
          const da = a.cree_le ? new Date(a.cree_le).getTime() : 0;
          const db = b.cree_le ? new Date(b.cree_le).getTime() : 0;
          return db - da;
        }
        if (a.danger_immediat !== b.danger_immediat) return a.danger_immediat ? -1 : 1;
        return b.score_priorite - a.score_priorite;
      });
  }, [incidents, enqueteurs, zones, incidentSearch, incidentFilter, incidentSort]);

  const selectedIncident = useMemo(() => {
    if (filteredIncidents.length === 0) return null;
    if (selectedIncidentId != null) {
      const found = filteredIncidents.find((i) => i.id === selectedIncidentId);
      if (found) return found;
    }
    return filteredIncidents[0];
  }, [filteredIncidents, selectedIncidentId]);

  useEffect(() => {
    if (selectedIncident) {
      setPanelEnqueteurId(selectedIncident.enqueteur_id || '');
    } else {
      setPanelEnqueteurId('');
    }
    setReopenMotif('');
  }, [selectedIncident?.id, selectedIncident?.enqueteur_id]);

  const handleSelectIncident = useCallback((inc: IncidentItem, scrollCardIntoView = false) => {
    setSelectedIncidentId(inc.id);
    if (detailScrollRef.current) {
      detailScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (scrollCardIntoView && queueListRef.current) {
      const cardEl = queueListRef.current.querySelector(`[data-iid="${inc.id}"]`) as HTMLElement | null;
      cardEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    if (window.innerWidth < 1080 && detailColRef.current) {
      detailColRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Navigation clavier ↑ / ↓ dans l'onglet Gestion des Incidents
  useEffect(() => {
    if (activeTab !== 'incidents' || filteredIncidents.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const currentIdx = filteredIncidents.findIndex((i) => i.id === selectedIncident?.id);
      const nextIdx =
        e.key === 'ArrowDown'
          ? Math.min(filteredIncidents.length - 1, currentIdx + 1)
          : Math.max(0, currentIdx <= 0 ? 0 : currentIdx - 1);
      const nextItem = filteredIncidents[nextIdx];
      if (nextItem && nextItem.id !== selectedIncident?.id) {
        handleSelectIncident(nextItem, true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, filteredIncidents, selectedIncident, handleSelectIncident]);

  const resolveIncidentCommune = (inc: IncidentItem): string => {
    if (inc.commune) return inc.commune;
    if (inc.zone_id) {
      const z = zones.find((zn) => zn.id === inc.zone_id);
      if (z) return z.nom;
    }
    return 'District Autonome d’Abidjan';
  };

  const handlePanelAffecter = async (incidentId: number) => {
    if (!panelEnqueteurId) {
      showToast('Veuillez sélectionner un enquêteur terrain avant d’affecter.');
      return;
    }
    setActionLoading(true);
    try {
      await apiFetch(`/coordination/incidents/${incidentId}/affecter`, {
        method: 'POST',
        body: JSON.stringify({ enqueteur_id: Number(panelEnqueteurId) }),
      });
      const enq = enqueteurs.find((e) => e.id === Number(panelEnqueteurId));
      showToast(`Incident #${incidentId} affecté à ${enq ? enq.nom : `Enquêteur #${panelEnqueteurId}`}.`);
      await loadData();
    } catch (err: any) {
      alert(`Erreur d'affectation : ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePanelCloturer = async (incidentId: number) => {
    if (!window.confirm(`Confirmer la clôture de l'incident #${incidentId} ?`)) return;
    setActionLoading(true);
    try {
      await apiFetch(`/coordination/incidents/${incidentId}/cloturer`, { method: 'POST' });
      showToast(`Incident #${incidentId} clôturé avec succès.`);
      await loadData();
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePanelRouvrir = async (incidentId: number) => {
    if (!reopenMotif.trim()) {
      setReopenRingError(true);
      reopenInputRef.current?.focus();
      window.setTimeout(() => setReopenRingError(false), 1800);
      return;
    }
    setActionLoading(true);
    try {
      await apiFetch(`/coordination/incidents/${incidentId}/rouvrir`, {
        method: 'POST',
        body: JSON.stringify({ motif: reopenMotif.trim() }),
      });
      setReopenMotif('');
      showToast(`Incident #${incidentId} rouvert et remis en file active.`);
      await loadData();
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Pagination de la table dans l'onglet 2 (Carte opérationnelle : 5 par page)
  const kpiPageSize = 5;
  const kpiTotalPages = Math.max(1, Math.ceil(filteredIncidents.length / kpiPageSize));
  const kpiPaginatedIncidents = useMemo(() => {
    const safePage = Math.min(kpiTablePage, kpiTotalPages);
    const start = (safePage - 1) * kpiPageSize;
    return filteredIncidents.slice(start, start + kpiPageSize);
  }, [filteredIncidents, kpiTablePage, kpiTotalPages]);

  // Filtrage des utilisateurs
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return utilisateurs.filter((u) => {
      if (userRoleFilter !== 'tous' && u.role !== userRoleFilter) return false;
      if (!q) return true;
      const zone = zones.find((z) => z.id === u.zone_id);
      return (
        u.nom.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (zone && zone.nom.toLowerCase().includes(q))
      );
    });
  }, [utilisateurs, zones, userSearch, userRoleFilter]);

  const renderIncidentActionCell = (inc: IncidentItem) => {
    if (affectingId === inc.id) {
      return (
        <div className="oid-coord-inline-assign">
          <select
            value={selectedEnqueteurId}
            onChange={(e) => setSelectedEnqueteurId(e.target.value ? Number(e.target.value) : '')}
            className="oid-coord-select-sm"
            aria-label="Sélectionner un enquêteur"
          >
            <option value="">Choisir un enquêteur...</option>
            {enqueteurs.map((enq) => (
              <option key={enq.id} value={enq.id}>
                {enq.nom} ({enq.dossiers_actifs} actifs)
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => handleAffecter(inc.id)}
            className="oid-coord-btn-action primary"
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => {
              setAffectingId(null);
              setSelectedEnqueteurId('');
            }}
            className="oid-coord-btn-action neutral"
          >
            Annuler
          </button>
        </div>
      );
    }

    return (
      <div className="oid-coord-actions-group">
        {['ouvert', 'rouvert', 'affecte'].includes(inc.statut) && (
          <button
            type="button"
            onClick={() => {
              setAffectingId(inc.id);
              setSelectedEnqueteurId(inc.enqueteur_id || '');
            }}
            className="oid-coord-btn-action primary"
          >
            Affecter
          </button>
        )}
        {inc.statut !== 'cloture' ? (
          <button
            type="button"
            onClick={() => handleCloturer(inc.id)}
            className="oid-coord-btn-action neutral"
          >
            Clôturer
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleRouvrir(inc.id)}
            className="oid-coord-btn-action reopen"
          >
            Rouvrir
          </button>
        )}
      </div>
    );
  };

  const renderWaterGauge = (cm: number | null | undefined) => {
    if (cm == null || cm <= 0) {
      return <span style={{ color: 'var(--tx3)' }}>—</span>;
    }
    const pct = Math.min(100, Math.round((cm / 150) * 100));
    const cls = cm >= 100 ? 'crit' : cm >= 50 ? 'warn' : '';
    const label = cm >= 150 ? 'toiture' : cm >= 100 ? 'taille' : cm >= 50 ? 'genou' : 'sol';
    return (
      <div className="gauge" title={`Hauteur d'eau: ${cm} cm`}>
        <div className="t">
          <span>{cm} cm</span>
          <span style={{ color: 'var(--tx3)', fontSize: '11px' }}>{label}</span>
        </div>
        <div className="bar">
          <i className={cls} style={{ width: `${pct}%` }} />
          <u style={{ left: '33.33%' }} title="50 cm (genou)" />
          <u style={{ left: '66.66%' }} title="100 cm (taille)" />
        </div>
      </div>
    );
  };

  const renderIncidentStatusBadge = (statut: string) => {
    const s = (statut || 'ouvert').toLowerCase();
    if (s === 'evalue') {
      return (
        <span className="chip ok">
          <i className="dot" />
          Évalué
        </span>
      );
    }
    if (s === 'affecte') {
      return (
        <span className="chip water">
          <i className="dot" style={{ background: 'var(--water)' }} />
          Affecté
        </span>
      );
    }
    if (s === 'cloture') {
      return (
        <span className="chip">
          <i className="dot" style={{ background: 'var(--tx3)' }} />
          Clôturé
        </span>
      );
    }
    return (
      <span className="chip warn">
        <i className="dot warn" />
        {s === 'rouvert' ? 'Rouvert' : 'Ouvert'}
      </span>
    );
  };

  const tabHeaderInfo = useMemo(() => {
    switch (activeTab) {
      case 'kpis':
        return {
          title: "Vue d'ensemble & KPIs",
          subtitle: "Pilotage opérationnel de l'Observatoire et suivi stratégique",
        };
      case 'carte':
        return {
          title: "Cartographie Opérationnelle",
          subtitle: "Visualisation spatiale en temps réel des incidents hydrologiques",
        };
      case 'incidents':
        return {
          title: "Gestion Opérationnelle des Incidents",
          subtitle: "Triage, affectation des enquêteurs et suivi des résolutions",
        };
      case 'utilisateurs':
        return {
          title: "Comptes & Accréditations",
          subtitle: "Gestion des accès et supervision des équipes terrain",
        };
      default:
        return {
          title: "Poste de Coordination",
          subtitle: "Observatoire des Inondations · District d'Abidjan",
        };
    }
  }, [activeTab]);

  return (
    <div className="app-shell page-coordinateur" id="appShell">
      {/* Symboles SVG natifs du poste de commandement */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <symbol id="i-radar" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12 18.5 5.5"/></symbol>
        <symbol id="i-chart" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></symbol>
        <symbol id="i-map" viewBox="0 0 24 24"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/></symbol>
        <symbol id="i-inbox" viewBox="0 0 24 24"><path d="m3 13 3-8h12l3 8v6H3Z"/><path d="M3 13h5l1 3h6l1-3h5"/></symbol>
        <symbol id="i-bars" viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></symbol>
        <symbol id="i-users" viewBox="0 0 24 24"><path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1"/><circle cx="9.5" cy="7.5" r="3.5"/><path d="M21 20v-1a4 4 0 0 0-3-3.9M16 4.2a3.5 3.5 0 0 1 0 6.6"/></symbol>
        <symbol id="i-down" viewBox="0 0 24 24"><path d="M12 4v11m-4-4 4 4 4-4M5 20h14"/></symbol>
        <symbol id="i-logout" viewBox="0 0 24 24"><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9"/></symbol>
        <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></symbol>
        <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></symbol>
        <symbol id="i-l" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></symbol>
        <symbol id="i-r" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></symbol>
        <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
        <symbol id="i-minus" viewBox="0 0 24 24"><path d="M5 12h14"/></symbol>
        <symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></symbol>
        <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></symbol>
        <symbol id="i-uplus" viewBox="0 0 24 24"><circle cx="10" cy="8" r="4"/><path d="M2 21a8 8 0 0 1 14-5M19 14v6M16 17h6"/></symbol>
        <symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></symbol>
        <symbol id="i-alert" viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4m0 3h.01"/></symbol>
        <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></symbol>
        <symbol id="i-edit" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16Z"/></symbol>
        <symbol id="i-cam" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4Z"/><circle cx="12" cy="13.5" r="3.5"/></symbol>
        <symbol id="i-ext" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4 10 14M18 14v5H5V6h5"/></symbol>
        <symbol id="i-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></symbol>
        <symbol id="i-send" viewBox="0 0 24 24"><path d="M21 3 3 10l7 3 3 7 8-17Z"/><path d="m10 13 4-4"/></symbol>
      </svg>

      {/* Toast Notification Opérateur */}
      {toastMsg && (
        <div id="toasts" role="status">
          <div className="toast success">
            <svg className="icon"><use href="#i-check"/></svg>
            <span>{toastMsg}</span>
          </div>
        </div>
      )}

      {/* Lightbox Plein Écran */}
      {lightboxUrl && (
        <div className="verif-lightbox" onClick={() => setLightboxUrl(null)}>
          <div className="verif-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="verif-lightbox-close"
              onClick={() => setLightboxUrl(null)}
              aria-label="Fermer l'aperçu"
            >
              <span className="material-symbols-outlined">close</span>
              <span>Fermer l'aperçu</span>
            </button>
            <img src={apiUrl(lightboxUrl)} alt="Inspection plein écran du sinistre" />
          </div>
        </div>
      )}

      {/* ---------- SIDEBAR LATÉRALE FIXE (Issu de coordinateur.html) ---------- */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <BrandMark subtitle="Inondations &amp; Dommages" />
        </div>

        <nav className="sidebar-nav">
          <div className="nav-group">
            <div className="nav-label">Pilotage</div>
            <button
              type="button"
              className={`nav-item ${activeTab === 'kpis' ? 'actif' : ''}`}
              onClick={() => setActiveTab('kpis')}
            >
              <span className="material-symbols-outlined">dashboard</span>
              <span>Vue stratégique</span>
            </button>
            <button
              type="button"
              className={`nav-item ${activeTab === 'carte' ? 'actif' : ''}`}
              onClick={() => setActiveTab('carte')}
            >
              <span className="material-symbols-outlined">map</span>
              <span>Carte</span>
              {urgentCount(incidents) > 0 && (
                <span className="nav-badge" title="Incidents critiques urgents">
                  {urgentCount(incidents)}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`nav-item ${activeTab === 'incidents' ? 'actif' : ''}`}
              onClick={() => setActiveTab('incidents')}
            >
              <span className="material-symbols-outlined">assignment_late</span>
              <span>Incidents</span>
              <span className="nav-badge" style={{ backgroundColor: 'var(--water)', color: 'var(--water-ink)' }}>
                {filteredIncidents.length}
              </span>
            </button>
          </div>

          <div className="nav-group">
            <div className="nav-label">Administration</div>
            <button
              type="button"
              className={`nav-item ${activeTab === 'utilisateurs' ? 'actif' : ''}`}
              onClick={() => setActiveTab('utilisateurs')}
            >
              <span className="material-symbols-outlined">manage_accounts</span>
              <span>Comptes &amp; Enquêteurs</span>
            </button>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="avatar">
            {user?.nom ? user.nom.slice(0, 2).toUpperCase() : 'HQ'}
          </div>
          <div className="user-info">
            <span className="user-name">{user?.nom || 'Coordinateur'}</span>
            <span className="user-role">{user?.role?.toUpperCase() || 'HQ COORDINATION'}</span>
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
            <h1 className="page-title">{tabHeaderInfo.title}</h1>
            <div className="page-subtitle">{tabHeaderInfo.subtitle}</div>
          </div>

          <div className="top-actions">
            {/* Menu Exports & SITREP */}
            <div className="menu" ref={exportMenuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                aria-haspopup="true"
                aria-expanded={exportMenuOpen}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>
                <span>Exports &amp; SITREP</span>
              </button>
              {exportMenuOpen && (
                <div className="menu-pop" role="menu">
                  <button
                    type="button"
                    onClick={() => {
                      downloadFile('/rapports/sitrep.pdf', 'OID-SITREP.pdf');
                      setExportMenuOpen(false);
                    }}
                  >
                    <span className="tag">PDF</span>
                    <b>Générer le SITREP (CRIS)</b>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      downloadFile('/rapports/incidents.geojson', 'OID-Incidents.geojson');
                      setExportMenuOpen(false);
                    }}
                  >
                    <span className="tag">GEOJSON</span>
                    <b>Exporter les données SIG</b>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      downloadFile('/rapports/incidents.csv', 'OID-Incidents.csv');
                      setExportMenuOpen(false);
                    }}
                  >
                    <span className="tag">CSV</span>
                    <b>Exporter le registre (Excel)</b>
                  </button>
                </div>
              )}
            </div>

            {/* Rafraîchir */}
            <button
              type="button"
              className="icon-btn"
              title="Actualiser les données"
              onClick={loadData}
              disabled={loading}
            >
              <span className={`material-symbols-outlined ${loading ? 'spin' : ''}`}>
                refresh
              </span>
            </button>

            {/* Statut Vigilance & Heure */}
            <div className="status" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <VigilancePill />
              <LiveClockDisplay />
            </div>

          </div>
        </header>

        {error && (
          <div className="oid-error-banner" role="alert" style={{ margin: '16px 20px' }}>
            <span className="material-symbols-outlined">warning</span>
            <span>{error}</span>
          </div>
        )}

      {/* ================= 1. VUE STRATÉGIQUE ================= */}
      {activeTab === 'kpis' && (
        <section className="view on">
          <div className="page gut">
            <div className="page-head">
              <div>
                <p className="eyebrow">ONPC · SODEXAM · DGDD · Protection civile</p>
                <h1>Situation des opérations</h1>
                <p className="lede">
                  Surveillance hydrologique en temps réel et synthèse pour la décision multi-agences.
                </p>
              </div>
              <div className="sync">
                <span>
                  Synchronisé <b>en direct</b>
                </span>
                <button
                  type="button"
                  className="btn btn-pri"
                  onClick={handleRefreshAll}
                  disabled={loading}
                >
                  <svg className={`icon ${loading ? 'spin' : ''}`}>
                    <use href="#i-refresh" />
                  </svg>
                  <span>Actualiser</span>
                </button>
              </div>
            </div>
            {/* Grille des 4 KPIs Stratégiques connectés */}
            <section className="panel kpis">
              <div className="kpi">
                <div className="eyebrow">Total incidents</div>
                <div className="v">
                  {stats?.incidents ?? incidents.length}
                  <span className="d up-ok">24h</span>
                </div>
                <small>Tous statuts confondus</small>
              </div>

              <div className="kpi">
                <div className="eyebrow">Incidents ouverts</div>
                <div className="v up-crit">
                  {stats?.ouverts ?? 0}
                  <span className="d up-crit">actifs</span>
                </div>
                <small>En attente ou en cours d'enquête</small>
              </div>

              <div className="kpi">
                <div className="eyebrow">Couverture évaluations</div>
                <div className="v up-ok">
                  {stats?.couverture ?? '0%'}
                  <span className="d up-ok">cible 85%</span>
                </div>
                <small>Dossiers avec évaluation validée</small>
              </div>

              <div className="kpi">
                <div className="eyebrow">Retards SLA</div>
                <div className="v up-warn">
                  {stats?.retards_total ?? 0}
                  <span className="d up-warn">SLA &gt; 2h</span>
                </div>
                <small>
                  {stats?.retard_critique ?? 0} critique(s) / {stats?.retard_standard ?? 0} standard(s)
                </small>
              </div>
            </section>

            {/* Bilan humain consolidé des sinistres (Sendai Framework) */}
            <section>
              <div className="sec-head">
                <div>
                  <div className="eyebrow">Cadre de Sendai · Cibles A &amp; B</div>
                  <h2>Bilan humain consolidé des sinistres</h2>
                </div>
                <p>Données issues des fiches d'évaluation terrain · District d'Abidjan</p>
              </div>

              <div className="panel impact">
                <div className="imp">
                  <div className="l">
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>family_restroom</span>
                    Ménages touchés
                  </div>
                  <div className="v">{(stats?.menages_touches ?? 0).toLocaleString('fr-FR')}</div>
                  <small>Foyers recensés</small>
                </div>

                <div className="imp">
                  <div className="l">
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>groups</span>
                    Personnes affectées
                  </div>
                  <div className="v">{(stats?.personnes_affectees ?? 0).toLocaleString('fr-FR')}</div>
                  <small>Population exposée</small>
                </div>

                <div className="imp">
                  <div className="l">
                    <span className="material-symbols-outlined text-warn" style={{ fontSize: '16px' }}>personal_injury</span>
                    Blessés
                  </div>
                  <div className="v up-warn">{(stats?.blesses ?? 0).toLocaleString('fr-FR')}</div>
                  <small>Pris en charge</small>
                </div>

                <div className="imp">
                  <div className="l">
                    <span className="material-symbols-outlined text-warn" style={{ fontSize: '16px' }}>night_shelter</span>
                    Déplacés / Relogés
                  </div>
                  <div className="v up-warn">{(stats?.deplaces ?? 0).toLocaleString('fr-FR')}</div>
                  <small>En hébergement d'urgence</small>
                </div>

                <div className="imp">
                  <div className="l">
                    <span className="material-symbols-outlined text-coral" style={{ fontSize: '16px' }}>person_search</span>
                    Disparus
                  </div>
                  <div className="v up-crit">{String(stats?.disparus ?? 0).padStart(2, '0')}</div>
                  <small>Recherches en cours</small>
                </div>

                <div className="imp">
                  <div className="l">
                    <span className="material-symbols-outlined text-coral" style={{ fontSize: '16px' }}>sentiment_very_dissatisfied</span>
                    Décès constatés
                  </div>
                  <div className="v up-crit">{String(stats?.deces ?? 0).padStart(2, '0')}</div>
                  <small>Certifiés par les secours</small>
                </div>
              </div>
            </section>
          </div>
        </section>
      )}

        {/* ==========================================================================
            ONGLET 2 : CARTE OPÉRATIONNELLE DES INCIDENTS (Mode Opérationnel SIG)
           ========================================================================== */}
        {activeTab === 'carte' && (
          <div className="oid-coord-stack">
            <div id="sig-op-map-anchor" className="oid-coord-sig-map-card oid-coord-map-with-sidebar">
              {/* Panneau latéral rétractable des Indicateurs Stratégiques (250px) */}
              <aside
                className={`oid-map-kpi-sidebar ${!isMapKpiSidebarOpen ? 'is-collapsed' : ''}`}
                aria-label="Indicateurs stratégiques opérationnels"
              >
                <div className="oid-map-kpi-sidebar-header">
                  <div className="oid-map-kpi-sidebar-title-group">
                    <div className="oid-map-kpi-sidebar-title">
                      <span className="material-symbols-outlined" style={{ fontSize: '17px', color: 'var(--water)' }}>
                        monitoring
                      </span>
                      <span>Indicateurs Stratégiques</span>
                    </div>
                    <span className="oid-map-kpi-sidebar-subtitle">Situation Opérationnelle · 24h</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMapKpiSidebarOpen(false)}
                    className="oid-map-kpi-sidebar-toggle-btn"
                    title="Replier le panneau des indicateurs (250px)"
                    aria-label="Replier le panneau"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_left</span>
                  </button>
                </div>

                <div className="oid-map-kpi-sidebar-content">
                  {/* SECTION 1: KPIS OPÉRATIONNELS */}
                  <div className="oid-map-kpi-sec">
                    <div className="oid-map-kpi-sec-title">
                      <span>Pilotage Opérationnel</span>
                      <span className="oid-map-kpi-badge live">Live</span>
                    </div>

                    <div className="oid-map-kpi-items">
                      {/* Total Incidents */}
                      <div className="oid-map-kpi-card">
                        <div className="oid-map-kpi-card-head">
                          <span className="oid-map-kpi-card-label">Total incidents</span>
                          <span className="oid-map-kpi-tag ok">24h</span>
                        </div>
                        <div className="oid-map-kpi-card-value">
                          {stats?.incidents ?? incidents.length}
                        </div>
                        <span className="oid-map-kpi-card-hint">Tous statuts confondus</span>
                      </div>

                      {/* Incidents Ouverts */}
                      <div className="oid-map-kpi-card highlight-crit">
                        <div className="oid-map-kpi-card-head">
                          <span className="oid-map-kpi-card-label">Incidents ouverts</span>
                          <span className="oid-map-kpi-tag crit">actifs</span>
                        </div>
                        <div className="oid-map-kpi-card-value text-crit">
                          {stats?.ouverts ?? 0}
                        </div>
                        <span className="oid-map-kpi-card-hint">En attente ou en enquête</span>
                      </div>

                      {/* Couverture Évaluations */}
                      <div className="oid-map-kpi-card">
                        <div className="oid-map-kpi-card-head">
                          <span className="oid-map-kpi-card-label">Couverture éval.</span>
                          <span className="oid-map-kpi-tag ok">cible 85%</span>
                        </div>
                        <div className="oid-map-kpi-card-value text-ok">
                          {stats?.couverture ?? '0%'}
                        </div>
                        <span className="oid-map-kpi-card-hint">Dossiers avec évaluation</span>
                      </div>

                      {/* Retards SLA */}
                      <div className="oid-map-kpi-card highlight-warn">
                        <div className="oid-map-kpi-card-head">
                          <span className="oid-map-kpi-card-label">Retards SLA</span>
                          <span className="oid-map-kpi-tag warn">&gt; 2h</span>
                        </div>
                        <div className="oid-map-kpi-card-value text-warn">
                          {stats?.retards_total ?? 0}
                        </div>
                        <span className="oid-map-kpi-card-hint">
                          {stats?.retard_critique ?? 0} crit. · {stats?.retard_standard ?? 0} std
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2: BILAN HUMAIN SENDAI */}
                  <div className="oid-map-kpi-sec">
                    <div className="oid-map-kpi-sec-title">
                      <span>Bilan Humain (Sendai)</span>
                    </div>

                    <div className="oid-map-kpi-impact-grid">
                      <div className="oid-map-kpi-impact-chip">
                        <div className="oid-map-kpi-impact-l">
                          <span className="material-symbols-outlined" style={{ fontSize: '15px', color: 'var(--water-hi)' }}>family_restroom</span>
                          <span>Ménages</span>
                        </div>
                        <span className="oid-map-kpi-impact-v">{(stats?.menages_touches ?? 0).toLocaleString('fr-FR')}</span>
                      </div>

                      <div className="oid-map-kpi-impact-chip">
                        <div className="oid-map-kpi-impact-l">
                          <span className="material-symbols-outlined" style={{ fontSize: '15px', color: 'var(--water-hi)' }}>groups</span>
                          <span>Personnes</span>
                        </div>
                        <span className="oid-map-kpi-impact-v">{(stats?.personnes_affectees ?? 0).toLocaleString('fr-FR')}</span>
                      </div>

                      <div className="oid-map-kpi-impact-chip">
                        <div className="oid-map-kpi-impact-l">
                          <span className="material-symbols-outlined text-warn" style={{ fontSize: '15px' }}>personal_injury</span>
                          <span>Blessés</span>
                        </div>
                        <span className="oid-map-kpi-impact-v text-warn">{(stats?.blesses ?? 0).toLocaleString('fr-FR')}</span>
                      </div>

                      <div className="oid-map-kpi-impact-chip">
                        <div className="oid-map-kpi-impact-l">
                          <span className="material-symbols-outlined text-warn" style={{ fontSize: '15px' }}>night_shelter</span>
                          <span>Déplacés</span>
                        </div>
                        <span className="oid-map-kpi-impact-v text-warn">{(stats?.deplaces ?? 0).toLocaleString('fr-FR')}</span>
                      </div>

                      <div className="oid-map-kpi-impact-chip">
                        <div className="oid-map-kpi-impact-l">
                          <span className="material-symbols-outlined text-coral" style={{ fontSize: '15px' }}>person_search</span>
                          <span>Disparus</span>
                        </div>
                        <span className="oid-map-kpi-impact-v text-coral">{String(stats?.disparus ?? 0).padStart(2, '0')}</span>
                      </div>

                      <div className="oid-map-kpi-impact-chip">
                        <div className="oid-map-kpi-impact-l">
                          <span className="material-symbols-outlined text-coral" style={{ fontSize: '15px' }}>sentiment_very_dissatisfied</span>
                          <span>Décès</span>
                        </div>
                        <span className="oid-map-kpi-impact-v text-coral">{String(stats?.deces ?? 0).padStart(2, '0')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </aside>

              {/* Conteneur de la Carte Leaflet */}
              <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                <SigAnalysisMap
                  mode="operationnel"
                  communesGeoJson={communesGeoJson}
                  maillesGeoJson={null}
                  getisOrdGeoJson={null}
                  hexThematique="densite"
                  onChangeHexThematique={NOOP_HEX_THEME}
                  hotspots={EMPTY_HOTSPOTS}
                  vulnerabilities={EMPTY_VULNERABILITIES}
                  silentZones={EMPTY_SILENT_ZONES}
                  incidentsGeoJson={enrichedCarteGeoJson}
                  sigMetadata={null}
                  selectedZoneId={mapCommuneFilter !== 'all' ? Number(mapCommuneFilter) : ''}
                  onSelectZoneId={handleSelectMapCommune}
                  statusFilter={mapFilter}
                  onChangeStatusFilter={setMapFilter}
                  searchRef={mapSearchRef}
                  onChangeSearchRef={setMapSearchRef}
                  focusTarget={carteFocusTarget}
                  onOpenIncidentDetail={handleOpenIncidentFromMap}
                  onToggleKpiSidebar={() => setIsMapKpiSidebarOpen((prev) => !prev)}
                  isKpiSidebarOpen={isMapKpiSidebarOpen}
                />
              </div>
            </div>

            {/* Grille contextuelle rapide sous la carte : Accès direct aux 3 derniers incidents critiques */}
            {topCriticalIncidents.length > 0 && (
              <div className="oid-coord-alpha-grid">
                {topCriticalIncidents.map((inc) => {
                  const zoneName = zones.find((z) => z.id === inc.zone_id)?.nom || 'District Abidjan';
                  return (
                    <div key={inc.id} className="oid-coord-alpha-card">
                      <div className="oid-coord-alpha-top">
                        <div className="oid-coord-alpha-badge">
                          <span
                            className={`oid-dot ${inc.danger_immediat ? 'bg-coral pulse' : 'bg-cyan'}`}
                          />
                          <span className={inc.danger_immediat ? 'text-coral' : 'text-cyan'}>
                            {inc.danger_immediat
                              ? `URGENCE ALPHA #${inc.id}`
                              : `INTERVENTION EN COURS #${inc.id}`}
                          </span>
                        </div>
                        <span className="oid-coord-alpha-zone">{zoneName}</span>
                      </div>

                      <p className="oid-coord-alpha-title">
                        {getIncidentTypeMeta(inc.type).title}
                      </p>
                      <p className="oid-coord-alpha-desc">
                        {inc.description_synthese ||
                          `Signalements regroupés sur ${zoneName}. Score de priorité: ${inc.score_priorite} pts.`}
                      </p>

                      <div className="oid-coord-alpha-foot">
                        <span className="oid-coord-alpha-time">
                          {formatRelativeTime(inc.cree_le)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setMapFocusIncidentId(inc.id);
                          }}
                          className="oid-coord-locate-link"
                          title="Localiser l'incident sur la carte"
                        >
                          <span className="material-symbols-outlined">my_location</span>
                          <span>Localiser</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Table des incidents réels avec jauges physiques d'eau */}
            <section style={{ padding: '0 20px 32px' }}>
              <div className="sec-head">
                <div>
                  <div className="eyebrow">Tableau de bord opérationnel</div>
                  <h2>File priorisée des incidents ({filteredIncidents.length})</h2>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <div className="oid-coord-filter-chip">
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>filter_list</span>
                    <select
                      value={incidentFilter}
                      onChange={(e) => {
                        setIncidentFilter(e.target.value as IncidentStatusFilter);
                        setKpiTablePage(1);
                      }}
                      className="oid-coord-transparent-select"
                      aria-label="Filtrer par statut"
                    >
                      <option value="tous">Tous les incidents ({incidents.length})</option>
                      <option value="danger">Urgences vitales ({urgentCount(incidents)})</option>
                      <option value="a_affecter">À affecter sans enquêteur</option>
                      <option value="ouverts">Ouverts</option>
                      <option value="affectes">Affectés</option>
                      <option value="evalues">Évalués</option>
                      <option value="clotures">Clôturés</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Réf. dossier</th>
                      <th>Type &amp; Commune</th>
                      <th>Niveau d'eau</th>
                      <th>Statut</th>
                      <th>Priorité</th>
                      <th>Enquêteur assigné</th>
                      <th className="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpiPaginatedIncidents.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--tx3)' }}>
                          Aucun incident enregistré pour les critères sélectionnés.
                        </td>
                      </tr>
                    ) : (
                      kpiPaginatedIncidents.map((inc) => {
                        const enq = enqueteurs.find((e) => e.id === inc.enqueteur_id);
                        const typeMeta = getIncidentTypeMeta(inc.type);
                        const commune = resolveIncidentCommune(inc);
                        return (
                          <tr key={inc.id}>
                            <td>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedIncidentId(inc.id);
                                  setActiveTab('incidents');
                                }}
                                className={`oid-coord-ref-link ${inc.statut === 'cloture' ? 'is-closed' : ''}`}
                                title="Ouvrir le dossier dans la vue Gestion des Incidents"
                              >
                                <span className="code">OID-ABJ-{inc.reference_publique.slice(0, 8).toUpperCase()}</span>
                              </button>
                              <span className="sub">{formatRelativeTime(inc.cree_le)}</span>
                            </td>
                            <td>
                              <b>{typeMeta.title}</b>
                              <span className="sub">{commune}</span>
                            </td>
                            <td>{renderWaterGauge(inc.hauteur_eau_max_cm)}</td>
                            <td>{renderIncidentStatusBadge(inc.statut)}</td>
                            <td>
                              {inc.danger_immediat ? (
                                <span className="chip crit">
                                  <i className="dot crit" /> {inc.score_priorite} pts
                                </span>
                              ) : (
                                <span className="chip">{inc.score_priorite} pts</span>
                              )}
                            </td>
                            <td>
                              {enq ? (
                                <span>
                                  <b>{enq.nom}</b>
                                  <span className="sub">{enq.email}</span>
                                </span>
                              ) : (
                                <span className="chip warn">À affecter</span>
                              )}
                            </td>
                            <td className="right">{renderIncidentActionCell(inc)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="oid-coord-pagination" style={{ marginTop: '12px' }}>
                <span>
                  Affichage {filteredIncidents.length === 0 ? 0 : (kpiTablePage - 1) * kpiPageSize + 1} à{' '}
                  {Math.min(kpiTablePage * kpiPageSize, filteredIncidents.length)} sur {filteredIncidents.length}{' '}
                  incidents répertoriés
                </span>
                <div className="oid-coord-page-btns">
                  <button
                    type="button"
                    disabled={kpiTablePage <= 1}
                    onClick={() => setKpiTablePage((p) => Math.max(1, p - 1))}
                    className="btn btn-sm"
                  >
                    Précédent
                  </button>
                  <span className="mono" style={{ fontSize: '12px', padding: '0 8px' }}>
                    Page {kpiTablePage} / {kpiTotalPages}
                  </span>
                  <button
                    type="button"
                    disabled={kpiTablePage >= kpiTotalPages}
                    onClick={() => setKpiTablePage((p) => Math.min(kpiTotalPages, p + 1))}
                    className="btn btn-sm"
                  >
                    Suivant
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ==========================================================================
            ONGLET 3 : GESTION DES INCIDENTS (VUE 2 COLONNES TYPE VÉRIFICATION)
           ========================================================================== */}
        {activeTab === 'incidents' && (
          <div className="oid-coord-incidents-wrap">
            {/* Barre de recherche, filtrage et tri en haut de la vue 2 colonnes */}
            <div className="oid-coord-map-filterbar compact">
              <div className="oid-coord-map-filters-left">
                <div className="oid-coord-filter-chip search">
                  <span className="material-symbols-outlined">search</span>
                  <input
                    type="text"
                    value={incidentSearch}
                    onChange={(e) => setIncidentSearch(e.target.value)}
                    placeholder="Rechercher #ID, réf, type, commune, enquêteur..."
                    className="oid-coord-map-search-input"
                  />
                </div>

                <div className="oid-coord-filter-chip">
                  <span className="material-symbols-outlined">filter_list</span>
                  <select
                    value={incidentFilter}
                    onChange={(e) => setIncidentFilter(e.target.value as IncidentStatusFilter)}
                    className="oid-coord-transparent-select"
                    aria-label="Filtrer par statut d'incident"
                  >
                    <option value="tous">Tous les incidents ({incidents.length})</option>
                    <option value="a_affecter">
                      À affecter ({incidents.filter((i) => ['ouvert', 'rouvert'].includes(i.statut) && !i.enqueteur_id).length})
                    </option>
                    <option value="danger">
                      Danger immédiat ({incidents.filter((i) => i.danger_immediat && i.statut !== 'cloture').length})
                    </option>
                    <option value="ouverts">Ouverts ({incidents.filter((i) => ['ouvert', 'rouvert'].includes(i.statut)).length})</option>
                    <option value="affectes">Affectés ({incidents.filter((i) => i.statut === 'affecte').length})</option>
                    <option value="evalues">Évalués ({incidents.filter((i) => i.statut === 'evalue').length})</option>
                    <option value="clotures">Clôturés ({incidents.filter((i) => i.statut === 'cloture').length})</option>
                  </select>
                </div>

                <div className="oid-coord-filter-chip">
                  <span className="material-symbols-outlined">sort</span>
                  <select
                    value={incidentSort}
                    onChange={(e) => setIncidentSort(e.target.value as IncidentSortKey)}
                    className="oid-coord-transparent-select"
                    aria-label="Trier les incidents"
                  >
                    <option value="priorite">Tri : Priorité décroissante</option>
                    <option value="date">Tri : Plus récents</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="verif-grid">
              {/* COLONNE GAUCHE : FILE PRIORISÉE DES INCIDENTS (5 colonnes) */}
              <div className="verif-queue-col">
                <div className="verif-queue-header">
                  <span className="verif-queue-eyebrow">REGISTRE DES INCIDENTS (TRI PRIORISÉ)</span>
                  <span className="verif-queue-live-count">{filteredIncidents.length} INCIDENT(S)</span>
                </div>

                {filteredIncidents.length === 0 && !loading && (
                  <div className="verif-empty-queue">
                    <span className="material-symbols-outlined verif-empty-icon">fact_check</span>
                    <p>Aucun incident trouvé</p>
                    <span>Aucun dossier ne correspond aux critères de filtrage sélectionnés.</span>
                  </div>
                )}

                <div ref={queueListRef} className="verif-queue-list">
                  {filteredIncidents.map((inc) => {
                    const isSelected = selectedIncident?.id === inc.id;
                    const typeMeta = getIncidentTypeMeta(inc.type);
                    const communeName = resolveIncidentCommune(inc);
                    const enq = enqueteurs.find((e) => e.id === inc.enqueteur_id);
                    const fiab = getFiabilitePresentation(inc.niveau_fiabilite, inc.statut);
                    const needsAssignment = ['ouvert', 'rouvert'].includes(inc.statut) && !inc.enqueteur_id;

                    return (
                      <div
                        key={inc.id}
                        data-iid={inc.id}
                        onClick={() => handleSelectIncident(inc)}
                        className={`verif-qcard ${isSelected ? 'selected' : ''} ${
                          inc.danger_immediat ? 'has-danger' : ''
                        } ${needsAssignment ? 'has-sla' : ''}`}
                      >
                        {inc.danger_immediat && <div className="verif-strip-left" />}
                        {needsAssignment && <div className="verif-strip-right" />}

                        <div className="verif-qcard-body">
                          {/* Badges d'en-tête */}
                          <div className="verif-qcard-top">
                            <span className="verif-score-chip">Score: {inc.score_priorite} pts</span>

                            <div className="verif-qcard-badges">
                              {inc.danger_immediat && (
                                <span className="verif-badge-danger">
                                  <span className="verif-ping-dot" />
                                  DANGER IMMÉDIAT
                                </span>
                              )}
                              {needsAssignment && <span className="verif-badge-sla">À AFFECTER</span>}
                              {renderIncidentStatusBadge(inc.statut)}
                            </div>
                          </div>

                          {/* Réf & Localisation PostGIS */}
                          <div className="verif-qcard-refrow">
                            <span className="verif-ref-code">
                              #INC-{inc.id} · OID-ABJ-{inc.reference_publique.slice(0, 8).toUpperCase()}
                            </span>
                            <span className="verif-loc-tag">
                              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                                location_on
                              </span>
                              {communeName}
                            </span>
                          </div>

                          {/* Titre */}
                          <h2 className="verif-qcard-title">{typeMeta.title}</h2>

                          {/* Extrait de description */}
                          <p className="verif-qcard-desc">
                            {inc.description_synthese ||
                              `Incident opérationnel qualifié (${inc.nb_signalements || 1} signalement${
                                (inc.nb_signalements || 1) > 1 ? 's' : ''
                              } citoyen${(inc.nb_signalements || 1) > 1 ? 's' : ''} rattaché${
                                (inc.nb_signalements || 1) > 1 ? 's' : ''
                              }).`}
                          </p>

                          {/* Pied de carte métadonnées */}
                          <div className="verif-qcard-footer">
                            <div className="verif-qcard-metrics">
                              <span>
                                Hauteur:{' '}
                                <strong className="text-cyan">
                                  {inc.hauteur_eau_max_cm != null ? `${inc.hauteur_eau_max_cm} cm` : '—'}
                                </strong>
                              </span>
                              <span>
                                Fiabilité: <strong className={fiab.cls}>{fiab.label}</strong>
                              </span>
                            </div>

                            {enq ? (
                              <span className="verif-dup-pill" style={{ color: 'var(--water)', borderColor: 'var(--water-dim)', background: 'var(--water-dim)' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                                  badge
                                </span>
                                {enq.nom}
                              </span>
                            ) : (
                              <span className="verif-time-ago">{formatRelativeTime(inc.cree_le)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* COLONNE DROITE : INFOS ESSENTIELLES, CONTENU DE L'INCIDENT & AFFECTATION (7 colonnes) */}
              <div ref={detailColRef} className="verif-detail-col">
                {selectedIncident ? (
                  (() => {
                    const selCommune = resolveIncidentCommune(selectedIncident);
                    const selEnq =
                      enqueteurs.find((e) => e.id === selectedIncident.enqueteur_id) ||
                      (selectedIncident.enqueteur_nom
                        ? { id: selectedIncident.enqueteur_id || 0, nom: selectedIncident.enqueteur_nom, email: '', dossiers_actifs: 0 }
                        : null);
                    const selFiab = getFiabilitePresentation(
                      selectedIncident.niveau_fiabilite,
                      selectedIncident.statut
                    );
                    const selSigs = selectedIncident.signalements_lies || [];
                    const allPhotos: PhotoMetaItem[] = selSigs.flatMap((s) =>
                      s.photos_meta && s.photos_meta.length > 0
                        ? s.photos_meta
                        : (s.photos || []).map((url) => ({
                            url,
                            filename: url.split('/').pop() || 'photo.jpg',
                            taille_octets: 0,
                            taille_formatee: 'Image jointe',
                            format: 'JPEG/PNG',
                            exif_present: false,
                            exif_gps: false,
                          }))
                    );
                    const anyExifGps = allPhotos.some((p) => p.exif_gps);
                    const anyExifPresent = allPhotos.some((p) => p.exif_present);

                    return (
                      <div className="verif-detail-card">
                        {/* 1. En-tête compact sur 1 ligne */}
                        <div className="verif-detail-header oid-coord-dhead-compact">
                          <div className="oid-coord-dhead-left">
                            <h2 className="verif-detail-title">Incident #{selectedIncident.id}</h2>
                            {renderIncidentStatusBadge(selectedIncident.statut)}
                            <span className="chip water">{selCommune}</span>
                          </div>

                          <div className="oid-coord-dhead-right">
                            <span className="verif-detail-ref">
                              OID-ABJ-{selectedIncident.reference_publique.slice(0, 10).toUpperCase()}
                            </span>
                            <span className="verif-detail-time">
                              · Ouvert à {formatUtcTime(selectedIncident.cree_le)} ({formatRelativeTime(selectedIncident.cree_le)})
                            </span>
                          </div>
                        </div>

                        {/* Zone centrale à défilement indépendant */}
                        <div ref={detailScrollRef} className="verif-detail-scroll-body">
                          {/* 2. INFOS ESSENTIELLES DE L'INCIDENT (Grille 4 cases) */}
                          <div className="verif-specs-grid">
                            <div className="verif-spec-box">
                              <span className="verif-spec-lbl">
                                <span>Type d'aléa &amp; Fiabilité</span>
                                <span className="material-symbols-outlined verif-spec-icon text-sky">
                                  category
                                </span>
                              </span>
                              <div className="verif-spec-val">{formatIncidentType(selectedIncident.type)}</div>
                              <div className="verif-spec-sub">
                                <span className={selFiab.cls}>{selFiab.label}</span> ·{' '}
                                {selectedIncident.nb_signalements || 1} signalement(s) lié(s)
                              </div>
                            </div>

                            <div className="verif-spec-box">
                              <span className="verif-spec-lbl">
                                <span>Score de priorité &amp; Gravité</span>
                                <span className="material-symbols-outlined verif-spec-icon text-coral">
                                  crisis_alert
                                </span>
                              </span>
                              <div
                                className={`verif-spec-val ${
                                  selectedIncident.danger_immediat ? 'text-coral' : 'text-cyan'
                                }`}
                              >
                                {selectedIncident.score_priorite} pts
                                {selectedIncident.danger_immediat ? ' (Danger vital)' : ''}
                              </div>
                              <div className="verif-spec-sub">
                                Gravité max : <strong>{selectedIncident.gravite_max || 'moyenne'}</strong>
                              </div>
                            </div>

                            <div className="verif-spec-box">
                              <span className="verif-spec-lbl">
                                <span>Hauteur d'eau &amp; État</span>
                                <span className="material-symbols-outlined verif-spec-icon text-cyan">
                                  straighten
                                </span>
                              </span>
                              <div className="verif-spec-val text-cyan">
                                {selectedIncident.hauteur_eau_max_cm != null
                                  ? `${selectedIncident.hauteur_eau_max_cm} cm`
                                  : 'Non mesurée'}
                              </div>
                              <div className="verif-spec-sub">
                                {getWaterHeightContext(selectedIncident.hauteur_eau_max_cm)}
                              </div>
                            </div>

                            <div className="verif-spec-box">
                              <span className="verif-spec-lbl">
                                <span>Secteur &amp; Enquêteur assigné</span>
                                <span className="material-symbols-outlined verif-spec-icon text-mint">
                                  person_pin_circle
                                </span>
                              </span>
                              <div className="verif-spec-val">
                                {selEnq ? selEnq.nom : 'Non affecté'}
                              </div>
                              <div className="verif-spec-sub text-mint">
                                {selCommune}
                                {selectedIncident.code_adm ? ` (${selectedIncident.code_adm})` : ''}
                                {selectedIncident.coords
                                  ? ` · ${selectedIncident.coords.lat.toFixed(4)}°N, ${selectedIncident.coords.lon.toFixed(4)}°W`
                                  : ''}
                              </div>
                            </div>
                          </div>

                          {/* 3. Encadré d'Alerte Danger Immédiat */}
                          {selectedIncident.danger_immediat && (
                            <div className="verif-danger-banner">
                              <div className="verif-danger-icon">
                                <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>
                                  warning
                                </span>
                              </div>
                              <div className="verif-danger-content">
                                <span className="verif-danger-title">Urgence vitale / Danger immédiat actif :</span>
                                <p className="verif-danger-text">
                                  {selectedIncident.description_synthese ||
                                    'Menace directe sur les personnes ou infrastructures critiques. Affectation prioritaire d’une équipe d’enquête et de secours recommandée.'}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* 4. Mini-carte tactique de localisation de l'incident */}
                          {selectedIncident.coords && (
                            <div className="verif-section-box">
                              <div className="verif-section-head">
                                <span className="verif-spec-lbl">
                                  <span className="material-symbols-outlined verif-spec-icon text-cyan">
                                    my_location
                                  </span>
                                  <span>Localisation tactique de l'incident (Périmètre 400 m)</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMapFocusIncidentId(selectedIncident.id);
                                    setActiveTab('carte');
                                  }}
                                  className="oid-coord-locate-link"
                                >
                                  <span>Ouvrir sur la Carte Interactive</span>
                                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                                    open_in_new
                                  </span>
                                </button>
                              </div>

                              <div className="verif-minimap-wrap">
                                <IncidentMiniMap incident={selectedIncident} communeLabel={selCommune} />
                                <div className="verif-minimap-legend">
                                  <span>
                                    <i
                                      className="verif-legend-dot"
                                      style={{
                                        background: selectedIncident.danger_immediat ? 'var(--crit)' : 'var(--water)',
                                      }}
                                    />
                                    Incident #{selectedIncident.id} ({selCommune})
                                  </span>
                                  <span>
                                    <i className="verif-legend-ring" />
                                    Zone d'impact 400 m
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 5. CONTENU DE L'INCIDENT : Signalements citoyens rattachés */}
                          <div className="verif-section-box">
                            <div className="verif-section-head">
                              <span className="verif-spec-lbl">
                                <span className="material-symbols-outlined verif-spec-icon text-sky">
                                  record_voice_over
                                </span>
                                <span>
                                  Contenu de l'incident &amp; Signalements rattachés ({selSigs.length || 1}) :
                                </span>
                              </span>
                              <span className="verif-source-tag">Consolidation PostGIS O.I.D</span>
                            </div>

                            {selSigs.length === 0 ? (
                              <p className="verif-quote-box">
                                «{' '}
                                {selectedIncident.description_synthese ||
                                  `Incident #${selectedIncident.id} (${formatIncidentType(
                                    selectedIncident.type
                                  )}) ouvert dans le secteur ${selCommune}.`}{' '}
                                »
                              </p>
                            ) : (
                              <div className="verif-doublons-list">
                                {selSigs.map((sig) => (
                                  <div
                                    key={sig.id}
                                    className="verif-quote-box"
                                    style={{ marginBottom: '0.5rem' }}
                                  >
                                    <div
                                      style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: '0.35rem',
                                        fontSize: '0.72rem',
                                        fontFamily: "var(--mono)",
                                        color: 'var(--water)',
                                      }}
                                    >
                                      <span>
                                        <strong>Signalement #{sig.id}</strong> ({sig.reference_suivi.slice(0, 10).toUpperCase()})
                                      </span>
                                      <span>
                                        Hauteur: {sig.hauteur_eau_cm ?? 0} cm · Gravité: {sig.gravite} ·{' '}
                                        {formatShortDate(sig.cree_le)}
                                      </span>
                                    </div>
                                    <div>
                                      «{' '}
                                      {sig.description ||
                                        'Signalement citoyen géolocalisé validé sans note textuelle additionnelle.'}{' '}
                                      »
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* 6. Photographies transmises sur cet incident */}
                          <div className="verif-section-box">
                            <div className="verif-section-head">
                              <span className="verif-spec-lbl">
                                <span className="material-symbols-outlined verif-spec-icon text-cyan">
                                  photo_camera
                                </span>
                                <span>
                                  Preuves visuelles rattachées ({allPhotos.length} fichier
                                  {allPhotos.length > 1 ? 's' : ''}) :
                                </span>
                              </span>
                              {allPhotos.length > 0 && (
                                <span className="verif-exif-tag">
                                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                                    {anyExifGps ? 'verified' : 'image_search'}
                                  </span>
                                  {anyExifGps
                                    ? 'EXIF GPS VALIDÉ'
                                    : anyExifPresent
                                    ? 'EXIF CAMÉRA PRÉSENT'
                                    : 'PREUVE VISUELLE VÉRIFIÉE'}
                                </span>
                              )}
                            </div>

                            {allPhotos.length > 0 ? (
                              <div className="verif-photos-stack">
                                {allPhotos.map((pMeta, idx) => (
                                  <div key={idx} className="verif-photo-card">
                                    <div
                                      className="verif-photo-thumb"
                                      onClick={() => setLightboxUrl(pMeta.url)}
                                      title="Cliquer pour agrandir"
                                    >
                                      <img src={apiUrl(pMeta.url)} alt={`Preuve visuelle #${idx + 1}`} />
                                      <div className="verif-photo-size">{pMeta.taille_formatee}</div>
                                    </div>

                                    <div className="verif-photo-meta">
                                      <span className="verif-photo-filename">
                                        <span className="material-symbols-outlined">photo</span>
                                        {pMeta.filename} ({pMeta.format})
                                      </span>
                                      <p className="verif-photo-sub">
                                        Rattachée à l'incident #{selectedIncident.id} ·{' '}
                                        {pMeta.exif_gps
                                          ? 'Coordonnées GPS EXIF détectées'
                                          : 'Signature binaire validée'}
                                      </p>
                                      <div className="verif-photo-actions">
                                        <button
                                          type="button"
                                          onClick={() => setLightboxUrl(pMeta.url)}
                                          className="verif-photo-btn primary"
                                        >
                                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                                            fullscreen
                                          </span>
                                          <span>Plein écran</span>
                                        </button>
                                        <a
                                          href={pMeta.url}
                                          download={pMeta.filename}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="verif-photo-btn"
                                        >
                                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                                            download
                                          </span>
                                          <span>Télécharger</span>
                                        </a>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="verif-no-photo">
                                <span className="material-symbols-outlined">hide_image</span>
                                <span>Aucune photographie jointe aux signalements de cet incident.</span>
                              </div>
                            )}
                          </div>

                          {/* 7. Bilan d'évaluation terrain de l'enquêteur (si soumis) */}
                          {selectedIncident.evaluation && (
                            <div className="verif-section-box">
                              <div className="verif-section-head">
                                <span className="verif-spec-lbl">
                                  <span className="material-symbols-outlined verif-spec-icon text-mint">
                                    assignment_turned_in
                                  </span>
                                  <span>Rapport d'évaluation terrain (Enquêteur) :</span>
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <span className="verif-exif-tag">
                                    {selectedIncident.evaluation.statut.toUpperCase()}
                                    {selectedIncident.evaluation.soumise_le
                                      ? ` · ${formatShortDate(selectedIncident.evaluation.soumise_le)}`
                                      : ''}
                                  </span>
                                  <button
                                    type="button"
                                    className="oid-coord-locate-link"
                                    onClick={() => setShowFullReportModal(true)}
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                                      description
                                    </span>
                                    <span>Rapport complet</span>
                                  </button>
                                </div>
                              </div>

                              <div className="oid-coord-impact-grid" style={{ marginBottom: '0.75rem' }}>
                                <div className="oid-coord-impact-box border-b-secondary">
                                  <span className="oid-coord-impact-lbl">Ménages touchés</span>
                                  <span className="oid-coord-impact-val">
                                    {selectedIncident.evaluation.menages_touches}
                                  </span>
                                </div>
                                <div className="oid-coord-impact-box border-b-primary">
                                  <span className="oid-coord-impact-lbl">Personnes affectées</span>
                                  <span className="oid-coord-impact-val">
                                    {selectedIncident.evaluation.personnes_affectees}
                                  </span>
                                </div>
                                <div className="oid-coord-impact-box border-b-danger">
                                  <span className="oid-coord-impact-lbl">Blessés / Déplacés</span>
                                  <span className="oid-coord-impact-val">
                                    {selectedIncident.evaluation.blesses} / {selectedIncident.evaluation.deplaces}
                                  </span>
                                </div>
                                <div className="oid-coord-impact-box border-b-danger">
                                  <span className="oid-coord-impact-lbl">Décès / Disparus</span>
                                  <span className="oid-coord-impact-val">
                                    {selectedIncident.evaluation.deces} / {selectedIncident.evaluation.disparus}
                                  </span>
                                </div>
                              </div>

                              {(selectedIncident.evaluation.degats ||
                                selectedIncident.evaluation.routes_coupees ||
                                selectedIncident.evaluation.risques_sanitaires ||
                                selectedIncident.evaluation.besoins ||
                                selectedIncident.evaluation.recommandations) && (
                                <div className="verif-quote-box">
                                  {selectedIncident.evaluation.degats && (
                                    <p style={{ margin: '0 0 0.35rem' }}>
                                      <strong>Dégâts constatés :</strong> {selectedIncident.evaluation.degats}
                                    </p>
                                  )}
                                  {selectedIncident.evaluation.routes_coupees && (
                                    <p style={{ margin: '0 0 0.35rem' }}>
                                      <strong>Routes coupées :</strong> {selectedIncident.evaluation.routes_coupees}
                                    </p>
                                  )}
                                  {selectedIncident.evaluation.risques_sanitaires && (
                                    <p style={{ margin: '0 0 0.35rem' }}>
                                      <strong>Risques sanitaires :</strong>{' '}
                                      {selectedIncident.evaluation.risques_sanitaires}
                                    </p>
                                  )}
                                  {selectedIncident.evaluation.besoins && (
                                    <p style={{ margin: '0 0 0.35rem' }}>
                                      <strong>Besoins prioritaires :</strong> {selectedIncident.evaluation.besoins}
                                    </p>
                                  )}
                                  {selectedIncident.evaluation.recommandations && (
                                    <p style={{ margin: 0 }}>
                                      <strong>Recommandations :</strong>{' '}
                                      {selectedIncident.evaluation.recommandations}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 8. PIED DE PANNEAU COMPACT ÉPINGLÉ À DROITE */}
                        <div className="verif-actions-footer oid-coord-dfoot-compact">
                          {['ouvert', 'rouvert'].includes(selectedIncident.statut) && (
                            <div className="oid-coord-assign-row">
                              <div className="verif-reject-input-wrap" style={{ flex: 1, minWidth: '200px' }}>
                                <span className="material-symbols-outlined verif-reject-icon">
                                  person_search
                                </span>
                                <select
                                  value={panelEnqueteurId}
                                  onChange={(e) =>
                                    setPanelEnqueteurId(e.target.value ? Number(e.target.value) : '')
                                  }
                                  className="verif-reject-input"
                                  style={{ cursor: 'pointer' }}
                                  aria-label="Sélectionner un enquêteur terrain à affecter"
                                >
                                  <option value="">
                                    -- Sélectionner un enquêteur --
                                  </option>
                                  {enqueteurs.map((enq) => {
                                    const sameZone =
                                      Boolean(enq.zone_nom) &&
                                      Boolean(selCommune) &&
                                      enq.zone_nom!.toLowerCase() === selCommune.toLowerCase();
                                    return (
                                      <option key={enq.id} value={enq.id}>
                                        {sameZone ? '★ ' : ''}
                                        {enq.nom} · {enq.zone_nom || 'Toutes zones'} ·{' '}
                                        {enq.dossiers_actifs} dossier(s)
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>

                              <button
                                id="btn-assign-incident"
                                type="button"
                                disabled={actionLoading || !panelEnqueteurId}
                                onClick={() => handlePanelAffecter(selectedIncident.id)}
                                className="verif-btn-validate oid-coord-assign-btn"
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                                  assignment_ind
                                </span>
                                <span>{actionLoading ? 'Affectation…' : 'Affecter'}</span>
                              </button>

                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => handlePanelCloturer(selectedIncident.id)}
                                className="oid-coord-print-btn"
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                                  task_alt
                                </span>
                                <span>Clôturer</span>
                              </button>
                            </div>
                          )}

                          {['affecte', 'evalue'].includes(selectedIncident.statut) && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  flexWrap: 'wrap',
                                  gap: '0.5rem',
                                  padding: '0.6rem 0.9rem',
                                  borderRadius: '0.375rem',
                                  background: 'rgba(0, 162, 230, 0.12)',
                                  border: '1px solid rgba(137, 206, 255, 0.28)',
                                  fontSize: '0.8rem',
                                }}
                              >
                                <span>
                                  Enquêteur en charge :{' '}
                                  <strong className="text-cyan">
                                    {selEnq ? selEnq.nom : `Agent #${selectedIncident.enqueteur_id}`}
                                  </strong>
                                </span>
                                <span className="oid-coord-mono-sub">
                                  Statut : {selectedIncident.statut.toUpperCase()}
                                </span>
                              </div>

                              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  disabled={actionLoading}
                                  onClick={() => handlePanelCloturer(selectedIncident.id)}
                                  className="verif-btn-validate"
                                  style={{ flex: 1 }}
                                >
                                  <span className="material-symbols-outlined">task_alt</span>
                                  <span>Clôturer l'incident #{selectedIncident.id}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => window.print()}
                                  className="oid-coord-print-btn no-print"
                                  title="Imprimer ou exporter la fiche complète de l'incident"
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                                    print
                                  </span>
                                  <span>Imprimer fiche</span>
                                </button>
                              </div>
                            </div>
                          )}

                          {selectedIncident.statut === 'cloture' && (
                            <div className="verif-reject-row">
                              <div className="verif-reject-input-wrap">
                                <span className="material-symbols-outlined verif-reject-icon">
                                  edit_note
                                </span>
                                <input
                                  ref={reopenInputRef}
                                  type="text"
                                  value={reopenMotif}
                                  onChange={(e) => setReopenMotif(e.target.value)}
                                  placeholder="Motif obligatoire pour rouvrir cet incident..."
                                  className={`verif-reject-input ${reopenRingError ? 'ring-error' : ''}`}
                                />
                              </div>

                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => handlePanelRouvrir(selectedIncident.id)}
                                className="verif-btn-validate"
                                style={{ width: 'auto', padding: '0.75rem 1.25rem' }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                                  restart_alt
                                </span>
                                <span>Rouvrir l'incident</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="verif-detail-empty">
                    <span className="material-symbols-outlined verif-empty-icon">emergency_share</span>
                    <h3>Sélectionnez un incident dans la colonne de gauche</h3>
                    <p>
                      Cliquez sur une carte d'incident pour inspecter ses informations essentielles, ses
                      signalements citoyens, sa localisation et l'affecter à un enquêteur terrain.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==========================================================================
            ONGLET 4 : GESTION DES COMPTES AGENTS
           ========================================================================== */}
        {activeTab === 'utilisateurs' && (
          <div className="oid-coord-stack">
            <div className="oid-coord-kpi-grid">
              <div className="oid-coord-sig-meta-card">
                <span className="oid-coord-sig-meta-lbl">Total Comptes</span>
                <strong>{utilisateurs.length}</strong>
              </div>
              <div className="oid-coord-sig-meta-card">
                <span className="oid-coord-sig-meta-lbl">Comptes Actifs</span>
                <strong className="text-mint">{utilisateurs.filter((u) => u.actif).length}</strong>
              </div>
              <div className="oid-coord-sig-meta-card">
                <span className="oid-coord-sig-meta-lbl">Enquêteurs Terrain</span>
                <strong className="text-cyan">
                  {utilisateurs.filter((u) => u.role === 'enqueteur').length}
                </strong>
              </div>
              <div className="oid-coord-sig-meta-card">
                <span className="oid-coord-sig-meta-lbl">Vérificateurs &amp; Coord.</span>
                <strong className="text-sky">
                  {utilisateurs.filter((u) => u.role !== 'enqueteur').length}
                </strong>
              </div>
            </div>

            <div className="oid-coord-panel">
              <div className="oid-coord-panel-head">
                <div className="oid-coord-map-filters-left">
                  <div className="oid-coord-filter-chip search">
                    <span className="material-symbols-outlined">search</span>
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Rechercher un agent par nom, email ou commune..."
                      className="oid-coord-map-search-input"
                    />
                  </div>

                  <div className="oid-coord-filter-chip">
                    <span className="material-symbols-outlined">badge</span>
                    <select
                      value={userRoleFilter}
                      onChange={(e) => setUserRoleFilter(e.target.value as UserRoleFilter)}
                      className="oid-coord-transparent-select"
                    >
                      <option value="tous">Tous les rôles</option>
                      <option value="enqueteur">Enquêteurs terrain</option>
                      <option value="verificateur">Vérificateurs</option>
                      <option value="coordinateur">Coordinateurs</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                    setShowNewUser(!showNewUser);
                  }}
                  className="oid-coord-retex-dl-btn"
                >
                  <span className="material-symbols-outlined">person_add</span>
                  <span>Nouveau compte</span>
                </button>
              </div>

              {showNewUser && (
                <form onSubmit={handleCreateUser} className="oid-coord-user-form">
                  <h4>Création d'un nouveau compte agent</h4>
                  <div className="oid-coord-user-form-grid">
                    <input
                      type="text"
                      placeholder="Nom complet (ex: Kouassi Marc)"
                      value={newNom}
                      onChange={(e) => setNewNom(e.target.value)}
                      className="oid-coord-input"
                      required
                    />
                    <input
                      type="email"
                      placeholder="Email professionnel"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="oid-coord-input"
                      required
                    />
                    <input
                      type="password"
                      placeholder="Mot de passe initial (min. 8 car.)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="oid-coord-input"
                      required
                      minLength={8}
                    />
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="oid-coord-input"
                    >
                      <option value="enqueteur">Enquêteur de terrain</option>
                      <option value="verificateur">Vérificateur cellule</option>
                      <option value="coordinateur">Coordinateur</option>
                    </select>
                    <select
                      value={newZoneId}
                      onChange={(e) => setNewZoneId(e.target.value ? Number(e.target.value) : '')}
                      className="oid-coord-input"
                    >
                      <option value="">Toutes communes (District)</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="oid-coord-actions-group" style={{ marginTop: '0.85rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowNewUser(false)}
                      className="oid-coord-btn-action neutral"
                    >
                      Annuler
                    </button>
                    <button type="submit" className="oid-coord-btn-action primary">
                      Créer le compte
                    </button>
                  </div>
                </form>
              )}

              {editingUser && (
                <form onSubmit={handleSaveEditUser} className="oid-coord-user-form">
                  <h4>Modifier le profil : {editingUser.email}</h4>
                  <div className="oid-coord-user-form-grid">
                    <input
                      type="text"
                      placeholder="Nom complet"
                      value={editNom}
                      onChange={(e) => setEditNom(e.target.value)}
                      className="oid-coord-input"
                      required
                    />
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="oid-coord-input"
                    >
                      <option value="enqueteur">Enquêteur de terrain</option>
                      <option value="verificateur">Vérificateur cellule</option>
                      <option value="coordinateur">Coordinateur</option>
                    </select>
                    <select
                      value={editZoneId}
                      onChange={(e) => setEditZoneId(e.target.value ? Number(e.target.value) : '')}
                      className="oid-coord-input"
                    >
                      <option value="">Toutes communes (District)</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="oid-coord-actions-group" style={{ marginTop: '0.85rem' }}>
                    <button
                      type="button"
                      onClick={() => setEditingUser(null)}
                      className="oid-coord-btn-action neutral"
                    >
                      Annuler
                    </button>
                    <button type="submit" className="oid-coord-btn-action primary">
                      Enregistrer
                    </button>
                  </div>
                </form>
              )}

              <div className="oid-coord-table-wrap">
                <table className="oid-coord-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Email</th>
                      <th>Rôle</th>
                      <th>Secteur / Commune</th>
                      <th>Dossiers actifs</th>
                      <th>Statut</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => {
                      const zName = zones.find((z) => z.id === u.zone_id)?.nom || 'District Autonome';
                      return (
                        <tr key={u.id}>
                          <td>
                            <strong>{u.nom}</strong>
                          </td>
                          <td className="mono">{u.email}</td>
                          <td>
                            <span className="oid-coord-status-pill status-ouvert">
                              {ROLE_LABELS[u.role] || u.role}
                            </span>
                          </td>
                          <td>{zName}</td>
                          <td className="mono">{u.dossiers_actifs}</td>
                          <td>
                            <span
                              className={`oid-coord-status-pill ${
                                u.actif ? 'status-evalue' : 'status-cloture'
                              }`}
                            >
                              {u.actif ? 'ACTIF' : 'SUSPENDU'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="oid-coord-actions-group">
                              <button
                                type="button"
                                onClick={() => startEditUser(u)}
                                className="oid-coord-btn-action neutral"
                              >
                                Modifier
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResetPassword(u.id, u.nom)}
                                className="oid-coord-btn-action neutral"
                              >
                                MDP
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleActif(u.id, u.actif)}
                                className={`oid-coord-btn-action ${u.actif ? 'reopen' : 'primary'}`}
                              >
                                {u.actif ? 'Désactiver' : 'Activer'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {showFullReportModal && selectedIncident && selectedIncident.evaluation && (
        <div
          className="oid-coord-report-modal-backdrop"
          onClick={() => setShowFullReportModal(false)}
        >
          <div
            className="oid-coord-report-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="oid-coord-report-modal-top no-print">
              <span>Rapport d'enquête terrain — Incident #{selectedIncident.id}</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowFullReportModal(false)}
              >
                Fermer
              </button>
            </div>
            <div className="oid-coord-report-modal-body">
              <EnqueteReportView
                dossier={{
                  id: selectedIncident.id,
                  reference_publique: selectedIncident.reference_publique,
                  type: selectedIncident.type,
                  statut: selectedIncident.statut,
                  score_priorite: selectedIncident.score_priorite,
                  niveau_fiabilite: selectedIncident.niveau_fiabilite,
                  danger_immediat: selectedIncident.danger_immediat,
                  coords: selectedIncident.coords ?? null,
                  commune: selectedIncident.commune,
                  code_adm: selectedIncident.code_adm,
                  description_citoyenne: selectedIncident.description_synthese,
                  hauteur_eau_cm: selectedIncident.hauteur_eau_max_cm,
                  photos_citoyennes: (selectedIncident.signalements_lies || []).flatMap(
                    (s) => s.photos || []
                  ),
                  evaluation_statut: selectedIncident.evaluation.statut,
                  cree_le: selectedIncident.cree_le,
                  maj_le: selectedIncident.maj_le,
                }}
                evaluation={{
                  ...selectedIncident.evaluation,
                  degats: selectedIncident.evaluation.degats || '',
                  routes_coupees: selectedIncident.evaluation.routes_coupees || '',
                  risques_sanitaires: selectedIncident.evaluation.risques_sanitaires || '',
                  besoins: selectedIncident.evaluation.besoins || '',
                  recommandations: selectedIncident.evaluation.recommandations || '',
                  photos: selectedIncident.evaluation.photos || [],
                  photos_meta: (selectedIncident.evaluation.photos_meta || []).map((m) => ({
                    ...m,
                    sha256_short: null,
                    horodatage_utc: null,
                  })),
                }}
                inspectorName={selectedIncident.enqueteur_nom || undefined}
                onOpenLightbox={(url) => setLightboxUrl(url)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function urgentCount(list: IncidentItem[]): number {
  return list.filter((i) => i.danger_immediat && i.statut !== 'cloture').length;
}
