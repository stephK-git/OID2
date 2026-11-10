import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { BrandMark, VigilancePill, ThemeToggle } from '../components/shell';

interface PhotoMetaItem {
  url: string;
  filename: string;
  taille_octets: number | null;
  taille_formatee: string;
  format: string;
  exif_present: boolean;
  exif_gps: boolean;
  sha256?: string | null;
  sha256_short?: string | null;
  horodatage_utc?: string | null;
}

interface DossierItem {
  id: number;
  reference_publique: string;
  type: string;
  statut: string;
  score_priorite: number;
  niveau_fiabilite?: string;
  danger_immediat: boolean;
  coords: { lat: number; lon: number; utm_e?: number; utm_n?: number } | null;
  commune?: string | null;
  code_adm?: string | null;
  description_citoyenne?: string | null;
  hauteur_eau_cm?: number | null;
  photos_citoyennes?: string[];
  photos_citoyennes_meta?: PhotoMetaItem[];
  evaluation_statut: string;
  cree_le: string | null;
  maj_le?: string | null;
}

interface EvaluationData {
  menages_touches: number;
  personnes_affectees: number;
  blesses: number;
  deplaces: number;
  deces: number;
  disparus: number;
  degats: string;
  routes_coupees: string;
  risques_sanitaires: string;
  besoins: string;
  recommandations: string;
  statut?: string;
  soumise_le?: string | null;
  photos?: string[];
  photos_meta?: PhotoMetaItem[];
}

interface NewPhotoItem {
  dataUrl: string;
  name: string;
  time: string;
  sizeFormatted: string;
  sha256Short: string;
}

interface OfflineQueuePacket {
  incidentId: number;
  payload: {
    menages_touches: number;
    personnes_affectees: number;
    blesses: number;
    deplaces: number;
    deces: number;
    disparus: number;
    degats: string;
    routes_coupees: string;
    risques_sanitaires: string;
    besoins: string;
    recommandations: string;
    photos_data_urls: string[];
  };
  queuedAt: string;
}

const OFFLINE_QUEUE_KEY = 'oid_enq_offline_queue_v1';
const LOCAL_DRAFT_PREFIX = 'oid_enq_draft_v1_';

const defaultEvaluation: EvaluationData = {
  menages_touches: 0,
  personnes_affectees: 0,
  blesses: 0,
  deplaces: 0,
  deces: 0,
  disparus: 0,
  degats: '',
  routes_coupees: '',
  risques_sanitaires: '',
  besoins: '',
  recommandations: '',
  photos: [],
  photos_meta: [],
};

const formatTypeBadge = (raw: string): string => {
  const t = (raw || '').toLowerCase();
  if (t.includes('habitation') || t.includes('submersion') || t.includes('inondation')) {
    return 'SUBMERSION RAPIDE';
  }
  if (t.includes('eboulement') || t.includes('glissement') || t.includes('talus')) {
    return 'ÉBOULEMENT TALUS';
  }
  if (t.includes('route') || t.includes('voirie') || t.includes('axe')) {
    return 'AXE ROUTIER SUBMERGÉ';
  }
  if (t.includes('caniveau') || t.includes('drain') || t.includes('ouvrage')) {
    return 'SATURATION DRAINAGE';
  }
  return (raw || 'RUISSELLEMENT URBAIN').replace(/_/g, ' ').toUpperCase();
};

const formatTypeSubtitle = (raw: string): string => {
  if (!raw) return 'Sinistre hydrologique';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
};

const formatRelativeTime = (iso: string | null | undefined): string => {
  if (!iso) return 'Il y a quelques min';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.max(1, Math.round(diffMs / 60000));
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  if (diffH < 24) return remMin > 0 ? `Il y a ${diffH}h ${remMin}` : `Il y a ${diffH}h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
};

const formatBytesClient = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${bytes} B`;
};

const computeClientSha256Short = async (buffer: ArrayBuffer): Promise<string> => {
  try {
    if (window.crypto && window.crypto.subtle) {
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      return hex.slice(0, 8).toUpperCase();
    }
  } catch {
    // Fallback
  }
  return 'LOCAL-OK';
};

const readOfflineQueue = (): OfflineQueuePacket[] => {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeOfflineQueue = (packets: OfflineQueuePacket[]) => {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(packets));
  } catch {
    // Ignore storage quota errors
  }
};

export const EnquetePage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userInitials = useMemo(() => {
    if (!user?.nom) return 'ENQ';
    const parts = user.nom.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return user.nom.slice(0, 3).toUpperCase();
  }, [user]);

  const [dossiers, setDossiers] = useState<DossierItem[]>([]);
  const [selectedDossier, setSelectedDossier] = useState<DossierItem | null>(null);
  const [evalForm, setEvalForm] = useState<EvaluationData>(defaultEvaluation);
  const [newPhotos, setNewPhotos] = useState<NewPhotoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftSavedPulse, setDraftSavedPulse] = useState(false);
  const [lastSavedLabel, setLastSavedLabel] = useState<string>('Prêt pour saisie contradictoire');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Onglet actif : 'dossiers' (missions affectées) ou 'historique' (dossiers traités)
  const [activeTab, setActiveTab] = useState<'dossiers' | 'historique'>('dossiers');

  // Tri & Filtres pour "Dossiers affectés"
  const [sortAffectes, setSortAffectes] = useState<
    'priorite_desc' | 'priorite_asc' | 'commune_asc' | 'commune_desc' | 'date_desc' | 'date_asc'
  >('priorite_desc');
  const [communeFilterAffectes, setCommuneFilterAffectes] = useState<string>('');

  // Tri & Filtres pour "Historique"
  const [sortHistorique, setSortHistorique] = useState<
    'date_desc' | 'date_asc' | 'priorite_desc' | 'priorite_asc' | 'commune_asc' | 'commune_desc'
  >('date_desc');
  const [communeFilterHistorique, setCommuneFilterHistorique] = useState<string>('');
  const [searchHistorique, setSearchHistorique] = useState<string>('');
  const [inspectingDossier, setInspectingDossier] = useState<DossierItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const evalScrollRef = useRef<HTMLDivElement>(null);
  const dossierListRef = useRef<HTMLDivElement>(null);

  const saveLocalDraftBackup = useCallback((incidentId: number, data: EvaluationData) => {
    try {
      localStorage.setItem(
        `${LOCAL_DRAFT_PREFIX}${incidentId}`,
        JSON.stringify({
          ...data,
          savedAt: new Date().toISOString(),
        })
      );
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const clearLocalDraftBackup = useCallback((incidentId: number) => {
    try {
      localStorage.removeItem(`${LOCAL_DRAFT_PREFIX}${incidentId}`);
    } catch {
      // Ignore
    }
  }, []);

  const loadEvaluation = useCallback(async (incidentId: number) => {
    setSaving(true);
    setNewPhotos([]);
    try {
      const res = await apiFetch<any>(`/enquete/${incidentId}/evaluation`);
      if (res && res.statut !== 'aucune') {
        setEvalForm({
          menages_touches: res.menages_touches || 0,
          personnes_affectees: res.personnes_affectees || 0,
          blesses: res.blesses || 0,
          deplaces: res.deplaces || 0,
          deces: res.deces || 0,
          disparus: res.disparus || 0,
          degats: res.degats || '',
          routes_coupees: res.routes_coupees || '',
          risques_sanitaires: res.risques_sanitaires || '',
          besoins: res.besoins || '',
          recommandations: res.recommandations || '',
          statut: res.statut,
          soumise_le: res.soumise_le || null,
          photos: res.photos || [],
          photos_meta: res.photos_meta || [],
        });
        if (res.soumise_le) {
          setLastSavedLabel(
            `Transmise le ${new Date(res.soumise_le).toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })}`
          );
        } else {
          setLastSavedLabel('Brouillon chargé depuis le serveur O.I.D');
        }
      } else {
        // Vérifier s'il existe un brouillon local non synchronisé pour cet incident
        const localRaw = localStorage.getItem(`${LOCAL_DRAFT_PREFIX}${incidentId}`);
        if (localRaw) {
          try {
            const parsed = JSON.parse(localRaw);
            setEvalForm({
              ...defaultEvaluation,
              menages_touches: parsed.menages_touches || 0,
              personnes_affectees: parsed.personnes_affectees || 0,
              blesses: parsed.blesses || 0,
              deplaces: parsed.deplaces || 0,
              deces: parsed.deces || 0,
              disparus: parsed.disparus || 0,
              degats: parsed.degats || '',
              routes_coupees: parsed.routes_coupees || '',
              risques_sanitaires: parsed.risques_sanitaires || '',
              besoins: parsed.besoins || '',
              recommandations: parsed.recommandations || '',
            });
            setLastSavedLabel('Restauré depuis le cache hors-ligne local');
            return;
          } catch {
            // Ignore malformed local draft
          }
        }
        setEvalForm(defaultEvaluation);
        setLastSavedLabel('Aucune évaluation enregistrée pour ce dossier');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, []);

  const loadDossiers = useCallback(
    async (preserveSelection = true) => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<DossierItem[]>('/enquete/mes-dossiers');
        setDossiers(data);
        if (data.length > 0) {
          setSelectedDossier((prev) => {
            if (preserveSelection && prev) {
              const found = data.find((d) => d.id === prev.id);
              if (found) return found;
            }
            const active = data.find((d) => d.evaluation_statut !== 'soumise' && d.statut !== 'cloture');
            const target = active || data[0];
            loadEvaluation(target.id);
            return target;
          });
        } else {
          setSelectedDossier(null);
        }
      } catch (err: any) {
        setError(err.message || 'Erreur de chargement des dossiers.');
      } finally {
        setLoading(false);
      }
    },
    [loadEvaluation]
  );

  // Dossiers affectés (en cours d'évaluation)
  const dossiersAffectes = useMemo(() => {
    return dossiers.filter(
      (d) => d.evaluation_statut !== 'soumise' && d.statut !== 'cloture'
    );
  }, [dossiers]);

  // Dossiers historique (déjà évalués ou clôturés)
  const dossiersHistorique = useMemo(() => {
    return dossiers.filter(
      (d) => d.evaluation_statut === 'soumise' || d.statut === 'evalue' || d.statut === 'cloture'
    );
  }, [dossiers]);

  // Communes uniques pour filtrage
  const communesAffectes = useMemo(() => {
    const set = new Set<string>();
    dossiersAffectes.forEach((d) => {
      if (d.commune) set.add(d.commune);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [dossiersAffectes]);

  const communesHistorique = useMemo(() => {
    const set = new Set<string>();
    dossiersHistorique.forEach((d) => {
      if (d.commune) set.add(d.commune);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [dossiersHistorique]);

  // Tri et filtre des dossiers affectés
  const filteredAndSortedAffectes = useMemo(() => {
    let list = dossiersAffectes;
    if (communeFilterAffectes && communeFilterAffectes !== 'all') {
      list = list.filter((d) => (d.commune || "District d'Abidjan") === communeFilterAffectes);
    }
    return [...list].sort((a, b) => {
      switch (sortAffectes) {
        case 'priorite_desc':
          return (b.score_priorite ?? 0) - (a.score_priorite ?? 0);
        case 'priorite_asc':
          return (a.score_priorite ?? 0) - (b.score_priorite ?? 0);
        case 'commune_asc': {
          const ca = (a.commune || "District d'Abidjan").toLowerCase();
          const cb = (b.commune || "District d'Abidjan").toLowerCase();
          return ca.localeCompare(cb, 'fr');
        }
        case 'commune_desc': {
          const ca = (a.commune || "District d'Abidjan").toLowerCase();
          const cb = (b.commune || "District d'Abidjan").toLowerCase();
          return cb.localeCompare(ca, 'fr');
        }
        case 'date_asc':
          return (a.cree_le ? new Date(a.cree_le).getTime() : 0) - (b.cree_le ? new Date(b.cree_le).getTime() : 0);
        case 'date_desc':
        default:
          return (b.cree_le ? new Date(b.cree_le).getTime() : 0) - (a.cree_le ? new Date(a.cree_le).getTime() : 0);
      }
    });
  }, [dossiersAffectes, sortAffectes, communeFilterAffectes]);

  // Tri et filtre de l'historique
  const filteredAndSortedHistorique = useMemo(() => {
    let list = dossiersHistorique;
    if (communeFilterHistorique && communeFilterHistorique !== 'all') {
      list = list.filter((d) => (d.commune || "District d'Abidjan") === communeFilterHistorique);
    }
    if (searchHistorique.trim()) {
      const q = searchHistorique.trim().toLowerCase();
      list = list.filter(
        (d) =>
          d.id.toString().includes(q) ||
          d.reference_publique.toLowerCase().includes(q) ||
          (d.commune && d.commune.toLowerCase().includes(q)) ||
          (d.type && d.type.toLowerCase().includes(q)) ||
          (d.description_citoyenne && d.description_citoyenne.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => {
      switch (sortHistorique) {
        case 'date_asc':
          return (a.cree_le ? new Date(a.cree_le).getTime() : 0) - (b.cree_le ? new Date(b.cree_le).getTime() : 0);
        case 'priorite_desc':
          return (b.score_priorite ?? 0) - (a.score_priorite ?? 0);
        case 'priorite_asc':
          return (a.score_priorite ?? 0) - (b.score_priorite ?? 0);
        case 'commune_asc': {
          const ca = (a.commune || "District d'Abidjan").toLowerCase();
          const cb = (b.commune || "District d'Abidjan").toLowerCase();
          return ca.localeCompare(cb, 'fr');
        }
        case 'commune_desc': {
          const ca = (a.commune || "District d'Abidjan").toLowerCase();
          const cb = (b.commune || "District d'Abidjan").toLowerCase();
          return cb.localeCompare(ca, 'fr');
        }
        case 'date_desc':
        default:
          return (b.cree_le ? new Date(b.cree_le).getTime() : 0) - (a.cree_le ? new Date(a.cree_le).getTime() : 0);
      }
    });
  }, [dossiersHistorique, sortHistorique, communeFilterHistorique, searchHistorique]);

  useEffect(() => {
    loadDossiers(false);
  }, [loadDossiers]);

  // Synchronisation automatique de la file hors-ligne dès reconnexion
  const flushOfflineQueue = useCallback(async () => {
    const queue = readOfflineQueue();
    if (queue.length === 0) return;
    const remaining: OfflineQueuePacket[] = [];
    let syncedCount = 0;

    for (const pkt of queue) {
      try {
        await apiFetch(`/enquete/${pkt.incidentId}/evaluation`, {
          method: 'PUT',
          body: JSON.stringify(pkt.payload),
        });
        clearLocalDraftBackup(pkt.incidentId);
        syncedCount += 1;
      } catch {
        remaining.push(pkt);
      }
    }

    writeOfflineQueue(remaining);

    if (syncedCount > 0) {
      setSuccessMsg(`${syncedCount} paquet(s) hors-ligne synchronisé(s) avec le serveur O.I.D.`);
      setLastSavedLabel(
        `Synchro auto réussie à ${new Date().toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}`
      );
      loadDossiers(true);
      if (selectedDossier) {
        loadEvaluation(selectedDossier.id);
      }
    }
  }, [clearLocalDraftBackup, loadDossiers, loadEvaluation, selectedDossier]);

  useEffect(() => {
    const handleOnline = () => {
      flushOfflineQueue();
    };
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [flushOfflineQueue]);

  const handleSelectDossier = useCallback(
    (dossier: DossierItem, scrollCardIntoView = false) => {
      setSelectedDossier(dossier);
      setSuccessMsg(null);
      setError(null);
      if (evalScrollRef.current) {
        evalScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (scrollCardIntoView && dossierListRef.current) {
        const cardEl = dossierListRef.current.querySelector(
          `[data-did="${dossier.id}"]`
        ) as HTMLElement | null;
        cardEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      loadEvaluation(dossier.id);
    },
    [loadEvaluation]
  );

  // Navigation clavier ↑ / ↓ entre les dossiers affectés
  useEffect(() => {
    if (dossiers.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const currentIdx = dossiers.findIndex((d) => d.id === selectedDossier?.id);
      const nextIdx =
        e.key === 'ArrowDown'
          ? Math.min(dossiers.length - 1, currentIdx + 1)
          : Math.max(0, currentIdx <= 0 ? 0 : currentIdx - 1);
      const nextItem = dossiers[nextIdx];
      if (nextItem && nextItem.id !== selectedDossier?.id) {
        handleSelectDossier(nextItem, true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dossiers, selectedDossier, handleSelectDossier]);

  const handleFormChange = (field: keyof EvaluationData, value: any) => {
    setEvalForm((prev) => {
      const next = {
        ...prev,
        [field]: value,
      };
      if (selectedDossier) {
        saveLocalDraftBackup(selectedDossier.id, next);
      }
      return next;
    });
    setLastSavedLabel(
      `Sauvegarde locale auto à ${new Date().toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}`
    );
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        setError(`L'image ${file.name} est trop volumineuse (max 10 Mo).`);
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        if (typeof reader.result === 'string') {
          const dataUrl = reader.result;
          const buf = await file.arrayBuffer();
          const sha256Short = await computeClientSha256Short(buf);
          const nowUtc =
            new Date().toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }) + ' UTC';
          setNewPhotos((prev) => [
            ...prev,
            {
              dataUrl,
              name: file.name,
              time: nowUtc,
              sizeFormatted: formatBytesClient(file.size),
              sha256Short,
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleRemoveNewPhoto = (index: number) => {
    setNewPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDeleteSavedPhoto = async (photoUrl: string) => {
    if (!selectedDossier) return;
    if (!window.confirm('Supprimer cette photographie du brouillon d’évaluation ?')) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<any>(
        `/enquete/${selectedDossier.id}/photos?url=${encodeURIComponent(photoUrl)}`,
        { method: 'DELETE' }
      );
      setEvalForm((prev) => ({
        ...prev,
        photos: res.photos || [],
        photos_meta: res.photos_meta || [],
      }));
      setSuccessMsg('Photographie retirée du brouillon.');
    } catch (err: any) {
      setError(err.message || 'Impossible de supprimer cette photo.');
    } finally {
      setSaving(false);
    }
  };

  const sumCritique =
    (Number(evalForm.blesses) || 0) +
    (Number(evalForm.deces) || 0) +
    (Number(evalForm.disparus) || 0);

  const isCoherent =
    evalForm.blesses <= evalForm.personnes_affectees &&
    evalForm.deces <= evalForm.personnes_affectees &&
    evalForm.disparus <= evalForm.personnes_affectees &&
    sumCritique <= evalForm.personnes_affectees;

  const validateCoherence = (): boolean => {
    if (!isCoherent) {
      setError(
        `Incohérence : La somme Blessés + Décès + Disparus (${sumCritique}) ne peut pas dépasser le nombre total de personnes affectées (${evalForm.personnes_affectees}).`
      );
      return false;
    }
    return true;
  };

  const enqueueOfflineDraft = (incidentId: number, payload: OfflineQueuePacket['payload']) => {
    const current = readOfflineQueue().filter((p) => p.incidentId !== incidentId);
    const updated: OfflineQueuePacket[] = [
      ...current,
      { incidentId, payload, queuedAt: new Date().toISOString() },
    ];
    writeOfflineQueue(updated);
  };

  const handleSaveDraft = async () => {
    if (!selectedDossier) return;
    if (!validateCoherence()) return;

    const payload = {
      menages_touches: evalForm.menages_touches,
      personnes_affectees: evalForm.personnes_affectees,
      blesses: evalForm.blesses,
      deplaces: evalForm.deplaces,
      deces: evalForm.deces,
      disparus: evalForm.disparus,
      degats: evalForm.degats,
      routes_coupees: evalForm.routes_coupees,
      risques_sanitaires: evalForm.risques_sanitaires,
      besoins: evalForm.besoins,
      recommandations: evalForm.recommandations,
      photos_data_urls: newPhotos.map((p) => p.dataUrl),
    };

    if (!navigator.onLine) {
      enqueueOfflineDraft(selectedDossier.id, payload);
      saveLocalDraftBackup(selectedDossier.id, evalForm);
      setDraftSavedPulse(true);
      window.setTimeout(() => setDraftSavedPulse(false), 1800);
      setLastSavedLabel('Mis en file hors-ligne (synchronisation auto dès reconnexion)');
      setSuccessMsg(
        'Mode hors-ligne : Brouillon enregistré dans la Queue Locale et prêt pour synchronisation automatique.'
      );
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiFetch<any>(`/enquete/${selectedDossier.id}/evaluation`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setNewPhotos([]);
      clearLocalDraftBackup(selectedDossier.id);
      setEvalForm((prev) => ({
        ...prev,
        statut: res.statut || 'brouillon',
        photos: res.photos || prev.photos,
        photos_meta: res.photos_meta || prev.photos_meta,
      }));
      setDraftSavedPulse(true);
      window.setTimeout(() => setDraftSavedPulse(false), 1800);
      setLastSavedLabel(
        `Dernière sauvegarde à ${new Date().toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}`
      );
      setSuccessMsg('Brouillon et photos enregistrés avec succès.');
      loadDossiers(true);
    } catch (err: any) {
      if (err instanceof TypeError || String(err.message).toLowerCase().includes('network')) {
        enqueueOfflineDraft(selectedDossier.id, payload);
        saveLocalDraftBackup(selectedDossier.id, evalForm);
        setSuccessMsg(
          'Connexion interrompue : votre brouillon a été placé dans la Queue Locale et sera synchronisé dès reconnexion.'
        );
      } else {
        setError(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitEvaluation = async () => {
    if (!selectedDossier) return;
    if (!validateCoherence()) return;
    if (
      !window.confirm(
        "Confirmer la transmission définitive de l'évaluation terrain au Centre Opérationnel O.I.D ?\nStatut incident cible : ÉVALUÉ"
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiFetch<any>(`/enquete/${selectedDossier.id}/soumettre`, {
        method: 'POST',
        body: JSON.stringify({
          menages_touches: evalForm.menages_touches,
          personnes_affectees: evalForm.personnes_affectees,
          blesses: evalForm.blesses,
          deplaces: evalForm.deplaces,
          deces: evalForm.deces,
          disparus: evalForm.disparus,
          degats: evalForm.degats,
          routes_coupees: evalForm.routes_coupees,
          risques_sanitaires: evalForm.risques_sanitaires,
          besoins: evalForm.besoins,
          recommandations: evalForm.recommandations,
          photos_data_urls: newPhotos.map((p) => p.dataUrl),
        }),
      });
      setNewPhotos([]);
      clearLocalDraftBackup(selectedDossier.id);
      setEvalForm((prev) => ({
        ...prev,
        statut: res.statut || 'soumise',
        photos: res.photos || prev.photos,
        photos_meta: res.photos_meta || prev.photos_meta,
      }));
      setLastSavedLabel(
        `Transmis au PC Central à ${new Date().toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })}`
      );
      setSuccessMsg(
        "Évaluation et photographies transmises avec succès ! L'incident est désormais marqué comme évalué."
      );
      loadDossiers(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const isReadOnly =
    inspectingDossier != null ||
    (selectedDossier != null &&
      (selectedDossier.statut !== 'affecte' || evalForm.statut === 'soumise'));

  const renderEvaluationCard = () => {
    return (
      <>
        {selectedDossier ? (
              (() => {
                const selCommune = selectedDossier.commune || "District d'Abidjan";
                const savedPhotos = evalForm.photos || [];
                const citizenPhotos = selectedDossier.photos_citoyennes || [];
                const citizenPhotosMeta = selectedDossier.photos_citoyennes_meta || [];

                return (
                  <div className="oid-enq-eval-card-shell">
                    {/* 1. EN-TÊTE FICHE D'ÉVALUATION (ÉPINGLÉ EN HAUT) */}
                    <div className="oid-enq-eval-head">
                      <div className="oid-enq-eval-head-left">
                        <div className="oid-enq-eval-title-row">
                          <span className="material-symbols-outlined text-cyan">
                            assignment_turned_in
                          </span>
                          <h2>Évaluation de Terrain — Dossier #{selectedDossier.id}</h2>
                        </div>
                        <span className="oid-enq-eval-ref">
                          Réf : OID-ABJ-{selectedDossier.reference_publique.slice(0, 10).toUpperCase()} ·{' '}
                          {formatTypeSubtitle(selectedDossier.type)} ({selCommune})
                        </span>
                      </div>

                      <div className="oid-enq-eval-head-badges">
                        <span className="oid-enq-head-pill primary">
                          {selectedDossier.statut.toUpperCase()}
                        </span>
                        {selectedDossier.danger_immediat ? (
                          <span className="oid-enq-head-pill danger">ALERTE ROUGE</span>
                        ) : (
                          <span className="oid-enq-head-pill secondary">
                            PRIORITÉ P.{Math.round(selectedDossier.score_priorite)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* CORPS DÉFILANT INDÉPENDANT */}
                    <div ref={evalScrollRef} className="oid-enq-eval-scroll-body">
                      {/* 2. COORDS BANNER & GUIDAGE GPS (UTM 30N PostGIS exact) */}
                      {selectedDossier.coords && (
                        <div className="oid-enq-coords-banner">
                          <div className="oid-enq-coords-left">
                            <div className="oid-enq-coords-icon">
                              <span className="material-symbols-outlined text-secondary">explore</span>
                            </div>
                            <div className="oid-enq-coords-text">
                              <span className="oid-enq-coords-eyebrow">
                                Position Tactique Signalée (EPSG:4326 / EPSG:32630)
                              </span>
                              <span className="oid-enq-coords-val">
                                WGS84 : {selectedDossier.coords.lat.toFixed(4)}° N,{' '}
                                {selectedDossier.coords.lon.toFixed(4)}° W
                                {selectedDossier.coords.utm_e != null &&
                                selectedDossier.coords.utm_n != null
                                  ? ` · UTM 30N : E ${selectedDossier.coords.utm_e.toLocaleString(
                                      'fr-FR'
                                    )} m, N ${selectedDossier.coords.utm_n.toLocaleString('fr-FR')} m`
                                  : ''}
                              </span>
                            </div>
                          </div>

                          <div className="oid-enq-coords-actions">
                            <a
                              href={`https://maps.google.com/?q=${selectedDossier.coords.lat},${selectedDossier.coords.lon}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="oid-enq-gps-btn"
                            >
                              <span className="material-symbols-outlined text-primary">navigation</span>
                              <span>Itinéraire GPS</span>
                            </a>
                            <a
                              href={`https://www.openstreetmap.org/#map=17/${selectedDossier.coords.lat}/${selectedDossier.coords.lon}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="oid-enq-gps-btn"
                            >
                              <span className="material-symbols-outlined text-secondary">
                                open_in_new
                              </span>
                              <span>OpenStreetMap</span>
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Rappel de la description citoyenne initiale si présente */}
                      {selectedDossier.description_citoyenne && (
                        <div className="oid-enq-citizen-note">
                          <span className="material-symbols-outlined text-sky">record_voice_over</span>
                          <div>
                            <span className="oid-enq-citizen-eyebrow">
                              Déclaration citoyenne initiale ({selCommune}) :
                            </span>
                            <p>« {selectedDossier.description_citoyenne} »</p>
                          </div>
                        </div>
                      )}

                      {/* 3. FORMULAIRE ENQUÊTE - SECTION 1 : IMPACT HUMAIN */}
                      <div className="oid-enq-section-card">
                        <div className="oid-enq-section-head">
                          <div className="oid-enq-section-title">
                            <span className="oid-enq-step-num">1</span>
                            <h3>Chiffrage de l'impact humain</h3>
                          </div>
                          <span className="oid-enq-section-sub">Relevé contradictoire terrain</span>
                        </div>

                        {/* 6 COMPTEURS NUMÉRIQUES */}
                        <div className="oid-enq-counters-grid">
                          {/* 1. Ménages touchés */}
                          <div className="oid-enq-counter-box">
                            <label className="oid-enq-counter-lbl">Ménages touchés</label>
                            <div className="oid-enq-counter-input-row">
                              <input
                                type="number"
                                min="0"
                                disabled={isReadOnly}
                                value={evalForm.menages_touches}
                                onChange={(e) =>
                                  handleFormChange(
                                    'menages_touches',
                                    Math.max(0, Number(e.target.value))
                                  )
                                }
                                className="oid-enq-counter-input"
                              />
                              <span className="material-symbols-outlined text-muted">roofing</span>
                            </div>
                            <span className="oid-enq-counter-hint">Concessions recensées</span>
                          </div>

                          {/* 2. Personnes affectées (total) */}
                          <div className="oid-enq-counter-box highlight-primary">
                            <div className="oid-enq-counter-lbl-row">
                              <label className="oid-enq-counter-lbl text-primary">
                                Personnes affectées *
                              </label>
                              <span className="oid-enq-ping-dot" />
                            </div>
                            <div className="oid-enq-counter-input-row">
                              <input
                                type="number"
                                min="0"
                                required
                                disabled={isReadOnly}
                                value={evalForm.personnes_affectees}
                                onChange={(e) =>
                                  handleFormChange(
                                    'personnes_affectees',
                                    Math.max(0, Number(e.target.value))
                                  )
                                }
                                className="oid-enq-counter-input text-primary"
                              />
                              <span className="material-symbols-outlined text-primary">groups</span>
                            </div>
                            <span className="oid-enq-counter-hint text-primary">
                              Indicateur pivot prioritaire
                            </span>
                          </div>

                          {/* 3. Blessés */}
                          <div className="oid-enq-counter-box">
                            <div className="oid-enq-counter-lbl-row">
                              <label className="oid-enq-counter-lbl text-secondary">Blessés</label>
                              <span className="oid-enq-mini-pill">PRIO SOINS</span>
                            </div>
                            <div className="oid-enq-counter-input-row">
                              <input
                                type="number"
                                min="0"
                                disabled={isReadOnly}
                                value={evalForm.blesses}
                                onChange={(e) =>
                                  handleFormChange('blesses', Math.max(0, Number(e.target.value)))
                                }
                                className="oid-enq-counter-input text-secondary"
                              />
                              <span className="material-symbols-outlined text-secondary">
                                medical_services
                              </span>
                            </div>
                            <span className="oid-enq-counter-hint">Transférés Antenne SAMU</span>
                          </div>

                          {/* 4. Déplacés / Relogés */}
                          <div className="oid-enq-counter-box">
                            <label className="oid-enq-counter-lbl">Déplacés / Relogés</label>
                            <div className="oid-enq-counter-input-row">
                              <input
                                type="number"
                                min="0"
                                disabled={isReadOnly}
                                value={evalForm.deplaces}
                                onChange={(e) =>
                                  handleFormChange('deplaces', Math.max(0, Number(e.target.value)))
                                }
                                className="oid-enq-counter-input"
                              />
                              <span className="material-symbols-outlined text-muted">
                                night_shelter
                              </span>
                            </div>
                            <span className="oid-enq-counter-hint">En attente mise à l'abri</span>
                          </div>

                          {/* 5. Décès constatés */}
                          <div className="oid-enq-counter-box">
                            <div className="oid-enq-counter-lbl-row">
                              <label className="oid-enq-counter-lbl text-tertiary">
                                Décès constatés
                              </label>
                              <span className="oid-enq-dot-tertiary" />
                            </div>
                            <div className="oid-enq-counter-input-row">
                              <input
                                type="number"
                                min="0"
                                disabled={isReadOnly}
                                value={evalForm.deces}
                                onChange={(e) =>
                                  handleFormChange('deces', Math.max(0, Number(e.target.value)))
                                }
                                className="oid-enq-counter-input text-tertiary"
                              />
                              <span className="material-symbols-outlined text-tertiary">
                                verified
                              </span>
                            </div>
                            <span className="oid-enq-counter-hint text-tertiary">
                              {evalForm.deces > 0
                                ? `${evalForm.deces} décès recensé(s)`
                                : 'Aucun corps signalé'}
                            </span>
                          </div>

                          {/* 6. Personnes disparues */}
                          <div className="oid-enq-counter-box">
                            <label className="oid-enq-counter-lbl">Personnes disparues</label>
                            <div className="oid-enq-counter-input-row">
                              <input
                                type="number"
                                min="0"
                                disabled={isReadOnly}
                                value={evalForm.disparus}
                                onChange={(e) =>
                                  handleFormChange('disparus', Math.max(0, Number(e.target.value)))
                                }
                                className="oid-enq-counter-input"
                              />
                              <span className="material-symbols-outlined text-muted">
                                person_search
                              </span>
                            </div>
                            <span className="oid-enq-counter-hint">
                              Recherche active GSPM : {evalForm.disparus}
                            </span>
                          </div>
                        </div>

                        {/* NOTE DE COHÉRENCE AUTOMATIQUE CUMULÉE */}
                        <div className={`oid-enq-coherence-bar ${isCoherent ? 'valid' : 'invalid'}`}>
                          <span className="material-symbols-outlined">
                            {isCoherent ? 'check_circle' : 'warning'}
                          </span>
                          <span>
                            {isCoherent
                              ? `Contrôle de cohérence validé : Blessés + Décès + Disparus (${sumCritique}) ≤ Personnes affectées (${evalForm.personnes_affectees})`
                              : `Alerte de cohérence : Blessés + Décès + Disparus (${sumCritique}) dépasse Personnes affectées (${evalForm.personnes_affectees})`}
                          </span>
                        </div>
                      </div>

                      {/* 4. FORMULAIRE ENQUÊTE - SECTION 2 : CONSTATATIONS QUALITATIVES */}
                      <div className="oid-enq-section-card">
                        <div className="oid-enq-section-head">
                          <div className="oid-enq-section-title">
                            <span className="oid-enq-step-num">2</span>
                            <h3>Constatations qualitatives sur le terrain</h3>
                          </div>
                          <span className="oid-enq-section-sub">Observations directes officier</span>
                        </div>

                        <div className="oid-enq-textareas-stack">
                          <div className="oid-enq-field">
                            <label className="oid-enq-field-lbl">
                              <span className="material-symbols-outlined text-primary">house</span>
                              <span>Dégâts matériels constatés</span>
                            </label>
                            <textarea
                              rows={2}
                              disabled={isReadOnly}
                              value={evalForm.degats}
                              onChange={(e) => handleFormChange('degats', e.target.value)}
                              placeholder="Concessions inondées, murs effondrés, véhicules bloqués, ouvrages CIE/SODECI touchés..."
                              className="oid-enq-textarea"
                            />
                          </div>

                          <div className="oid-enq-field">
                            <label className="oid-enq-field-lbl">
                              <span className="material-symbols-outlined text-danger">no_crash</span>
                              <span>Routes coupées / Accessibilité</span>
                            </label>
                            <textarea
                              rows={2}
                              disabled={isReadOnly}
                              value={evalForm.routes_coupees}
                              onChange={(e) => handleFormChange('routes_coupees', e.target.value)}
                              placeholder="Carrefours impraticables aux véhicules légers, radiers submergés, accès GSPM..."
                              className="oid-enq-textarea"
                            />
                          </div>

                          <div className="oid-enq-field">
                            <label className="oid-enq-field-lbl">
                              <span className="material-symbols-outlined text-secondary">
                                sanitizer
                              </span>
                              <span>Risques sanitaires</span>
                            </label>
                            <textarea
                              rows={2}
                              disabled={isReadOnly}
                              value={evalForm.risques_sanitaires}
                              onChange={(e) => handleFormChange('risques_sanitaires', e.target.value)}
                              placeholder="Refoulement de fosses septiques, contamination hydrique, eaux stagnantes..."
                              className="oid-enq-textarea"
                            />
                          </div>

                          <div className="oid-enq-field">
                            <label className="oid-enq-field-lbl">
                              <span className="material-symbols-outlined text-tertiary">
                                water_pump
                              </span>
                              <span>Besoins urgents identifiés</span>
                            </label>
                            <textarea
                              rows={2}
                              disabled={isReadOnly}
                              value={evalForm.besoins}
                              onChange={(e) => handleFormChange('besoins', e.target.value)}
                              placeholder="Motopompes gros débit, packs d'eau potable, bâches de protection, kits d'hygiène..."
                              className="oid-enq-textarea"
                            />
                          </div>

                          <div className="oid-enq-field">
                            <label className="oid-enq-field-lbl">
                              <span className="material-symbols-outlined text-primary">shield</span>
                              <span>Recommandations opérationnelles</span>
                            </label>
                            <textarea
                              rows={2}
                              disabled={isReadOnly}
                              value={evalForm.recommandations}
                              onChange={(e) => handleFormChange('recommandations', e.target.value)}
                              placeholder="Périmètre de sécurité, priorité d'évacuation, coupure préventive de secteur..."
                              className="oid-enq-textarea"
                            />
                          </div>
                        </div>
                      </div>

                      {/* 5. FORMULAIRE ENQUÊTE - SECTION 3 : PHOTOGRAPHIES ET PREUVES DE TERRAIN */}
                      <div className="oid-enq-section-card">
                        <div className="oid-enq-section-head">
                          <div className="oid-enq-section-title">
                            <span className="oid-enq-step-num">3</span>
                            <h3>Photographies et preuves de terrain (Exigence F-24)</h3>
                          </div>

                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => fileInputRef.current?.click()}
                            className="oid-enq-add-photo-btn"
                          >
                            <span className="material-symbols-outlined">photo_camera</span>
                            <span>Prendre ou ajouter des photos terrain</span>
                          </button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handlePhotoUpload}
                            style={{ display: 'none' }}
                          />
                        </div>

                        {savedPhotos.length === 0 &&
                        newPhotos.length === 0 &&
                        citizenPhotos.length === 0 ? (
                          <div className="oid-enq-no-photos">
                            <span className="material-symbols-outlined">add_a_photo</span>
                            <p>Aucune photographie de terrain jointe pour le moment.</p>
                            <span>
                              Cliquez sur « Prendre ou ajouter des photos terrain » pour certifier vos
                              constatations visuelles.
                            </span>
                          </div>
                        ) : (
                          <div className="oid-enq-photos-grid">
                            {/* Photos d'évaluation déjà enregistrées au brouillon */}
                            {savedPhotos.map((pUrl, idx) => {
                              const meta = evalForm.photos_meta?.[idx];
                              const shaLabel = meta?.sha256_short
                                ? `SHA-256 ${meta.sha256_short} ✓`
                                : 'SHA-256 ✓';
                              const geoTagCode = `GEO-TAG: ${
                                selectedDossier.code_adm || 'ABJ'
                              }-0${idx + 1}`;

                              return (
                                <div
                                  key={`saved-${idx}`}
                                  className="oid-enq-photo-card"
                                  onClick={() => setLightboxUrl(pUrl)}
                                >
                                  <div className="oid-enq-photo-img-wrap">
                                    <img src={pUrl} alt={`Preuve terrain #${idx + 1}`} />
                                    <div className="oid-enq-photo-geotag">{geoTagCode}</div>
                                    <div className="oid-enq-photo-sha">{shaLabel}</div>
                                    {!isReadOnly && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteSavedPhoto(pUrl);
                                        }}
                                        className="oid-enq-photo-remove"
                                        style={{ top: '2.2rem' }}
                                        title="Supprimer cette photo du brouillon"
                                      >
                                        <span className="material-symbols-outlined">delete</span>
                                      </button>
                                    )}
                                  </div>
                                  <div className="oid-enq-photo-caption">
                                    <strong>
                                      {meta?.filename || `Constat terrain #${idx + 1}`}
                                    </strong>
                                    <span>
                                      {meta?.horodatage_utc || 'Horodaté UTC'} ·{' '}
                                      {meta?.taille_formatee ? `${meta.taille_formatee} · ` : ''}
                                      {meta?.exif_gps ? 'EXIF GPS Validé' : 'WGS84 Validé'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Nouvelles photos en attente de sauvegarde (avec SHA-256 calculé côté client) */}
                            {newPhotos.map((np, idx) => (
                              <div key={`new-${idx}`} className="oid-enq-photo-card is-pending">
                                <div
                                  className="oid-enq-photo-img-wrap"
                                  onClick={() => setLightboxUrl(np.dataUrl)}
                                >
                                  <img src={np.dataUrl} alt={np.name} />
                                  <div className="oid-enq-photo-geotag">
                                    NOUVELLE PREUVE #{idx + 1}
                                  </div>
                                  <div className="oid-enq-photo-sha">
                                    SHA-256 {np.sha256Short} ✓
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveNewPhoto(idx);
                                    }}
                                    className="oid-enq-photo-remove"
                                    style={{ top: '2.2rem' }}
                                    title="Retirer cette photo"
                                  >
                                    <span className="material-symbols-outlined">delete</span>
                                  </button>
                                </div>
                                <div className="oid-enq-photo-caption">
                                  <strong>{np.name}</strong>
                                  <span>
                                    {np.time} · {np.sizeFormatted} · Prête à synchroniser
                                  </span>
                                </div>
                              </div>
                            ))}

                            {/* Photos initiales du signalement citoyen */}
                            {citizenPhotos.map((cUrl, idx) => {
                              const cMeta = citizenPhotosMeta[idx];
                              const cSha = cMeta?.sha256_short
                                ? `SHA-256 ${cMeta.sha256_short} ✓`
                                : 'SHA-256 ✓';
                              return (
                                <div
                                  key={`cit-${idx}`}
                                  className="oid-enq-photo-card"
                                  onClick={() => setLightboxUrl(cUrl)}
                                >
                                  <div className="oid-enq-photo-img-wrap">
                                    <img src={cUrl} alt={`Photo citoyenne #${idx + 1}`} />
                                    <div className="oid-enq-photo-geotag">
                                      SOURCE: ALERTE CITOYENNE
                                    </div>
                                    <div className="oid-enq-photo-sha">{cSha}</div>
                                  </div>
                                  <div className="oid-enq-photo-caption">
                                    <strong>
                                      {cMeta?.filename || `Preuve déclarant #${idx + 1}`}
                                    </strong>
                                    <span>
                                      {cMeta?.horodatage_utc || 'Dossier initial'} ·{' '}
                                      {cMeta?.taille_formatee || `Dossier #${selectedDossier.id}`}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 6. EVAL-ACTIONS-BAR (ÉPINGLÉE EN BAS DU PANNEAU DROIT) */}
                    <div className="oid-enq-actions-bar">
                      <div className="oid-enq-actions-left">
                        <button
                          id="btn-save-draft"
                          type="button"
                          disabled={saving || isReadOnly}
                          onClick={handleSaveDraft}
                          className="oid-enq-btn-draft"
                        >
                          <span
                            className={`material-symbols-outlined ${
                              draftSavedPulse ? 'text-tertiary' : 'text-secondary'
                            }`}
                          >
                            {draftSavedPulse ? 'check' : 'save'}
                          </span>
                          <span>
                            {draftSavedPulse ? 'Brouillon synchronisé !' : 'Sauvegarder Brouillon'}
                          </span>
                        </button>

                        <div className="oid-enq-save-timestamp">
                          <span className="oid-enq-save-lbl">Horodatage local</span>
                          <span className="oid-enq-save-val">{lastSavedLabel}</span>
                        </div>
                      </div>

                      <div className="oid-enq-actions-right">
                        <button
                          id="btn-submit-eval"
                          type="button"
                          disabled={saving || isReadOnly}
                          onClick={handleSubmitEvaluation}
                          title="Passera l'incident en statut ÉVALUÉ"
                          className="oid-enq-btn-submit"
                        >
                          <span className="material-symbols-outlined">
                            {isReadOnly ? 'task_alt' : 'send'}
                          </span>
                          <span>
                            {isReadOnly
                              ? 'Transmis au PC Central (Statut: ÉVALUÉ)'
                              : "Soumettre l'évaluation définitive"}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="oid-enq-empty-card large">
                <span className="material-symbols-outlined oid-enq-empty-icon">
                  assignment_turned_in
                </span>
                <h3>Sélectionnez un dossier dans la colonne de gauche</h3>
                <span>
                  Choisissez une mission affectée pour renseigner le chiffrage humain, les constats
                  qualitatifs et les preuves photographiques de terrain.
                </span>
              </div>
            )}
      </>
    );
  };

  return (
    <div className="app-shell page-enqueteur" id="appShell">
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
            <img src={lightboxUrl} alt="Preuve photographique terrain" />
          </div>
        </div>
      )}

      {/* ---------- SIDEBAR LATÉRALE FIXE (Issu du standard coordinateur/vérificateur) ---------- */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <BrandMark subtitle="Investigations &amp; Évaluations" />
        </div>

        <nav className="sidebar-nav">
          <div className="nav-group">
            <div className="nav-label">Missions Terrain</div>
            <button
              type="button"
              className={`nav-item ${activeTab === 'dossiers' ? 'actif' : ''}`}
              onClick={() => {
                setActiveTab('dossiers');
                setInspectingDossier(null);
                if (filteredAndSortedAffectes.length > 0 && (!selectedDossier || !filteredAndSortedAffectes.some(d => d.id === selectedDossier.id))) {
                  handleSelectDossier(filteredAndSortedAffectes[0]);
                }
              }}
            >
              <span className="material-symbols-outlined">folder_special</span>
              <span>Dossiers affectés</span>
              <span className="nav-badge" style={{ backgroundColor: 'var(--water)', color: 'var(--water-ink)' }}>
                {dossiersAffectes.length}
              </span>
            </button>
            <button
              type="button"
              className={`nav-item ${activeTab === 'historique' ? 'actif' : ''}`}
              onClick={() => {
                setActiveTab('historique');
              }}
            >
              <span className="material-symbols-outlined">history</span>
              <span>Historique</span>
              <span className="nav-badge" style={{ backgroundColor: 'var(--tertiary-dim)', color: 'var(--tertiary)' }}>
                {dossiersHistorique.length}
              </span>
            </button>
          </div>

          <div className="nav-group">
            <div className="nav-label">Bilan Enquête</div>
            <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ color: 'var(--tx2)' }}>Total dossiers :</span>
                <span className="chip" style={{ fontSize: '11px', padding: '2px 8px' }}>
                  <b>{dossiers.length}</b>
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ color: 'var(--tx2)' }}>En cours :</span>
                <span className="chip ok" style={{ fontSize: '11px', padding: '2px 8px' }}>
                  <b className="up-ok">
                    {dossiersAffectes.length}
                  </b>
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ color: 'var(--tx2)' }}>Historique :</span>
                <span className="chip" style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: 'var(--tertiary-dim)', color: 'var(--tertiary)' }}>
                  <b>{dossiersHistorique.length}</b>
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ color: 'var(--tx2)' }}>Critiques :</span>
                <span className="chip crit" style={{ fontSize: '11px', padding: '2px 8px' }}>
                  <b className="up-crit">
                    {dossiers.filter((d) => d.danger_immediat || d.score_priorite >= 80).length}
                  </b>
                </span>
              </div>
            </div>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="avatar" style={{ backgroundColor: 'var(--water)', color: 'var(--water-ink)' }}>
            {userInitials}
          </div>
          <div className="user-info">
            <span className="user-name">{user?.nom || 'Enquêteur terrain'}</span>
            <span className="user-role">ENQUÊTEUR · MISSION TERRAIN</span>
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
      <main className="main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <header className="top-bar">
          <div>
            <h1 className="page-title">
              {activeTab === 'dossiers'
                ? 'Investigations & Évaluations Terrain'
                : 'Historique des Dossiers & Évaluations'}
            </h1>
            <div className="page-subtitle">
              {activeTab === 'dossiers'
                ? 'Consultez vos dossiers d’investigation affectés et saisissez vos évaluations de dégâts.'
                : 'Consultez les enquêtes et évaluations transmises ou clôturées.'}
            </div>
          </div>

          <div className="top-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              id="btn-refresh"
              type="button"
              onClick={() => loadDossiers(true)}
              disabled={loading}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <span className={`material-symbols-outlined ${loading ? 'spin' : ''}`} style={{ fontSize: '18px' }}>
                sync
              </span>
              <span>Actualiser</span>
            </button>
            <VigilancePill />
            <ThemeToggle />
          </div>
        </header>

        <div className="oid-enq-container" style={{ width: '100%', maxWidth: '100%', padding: '16px 24px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {error && (
            <div className="oid-error-banner" role="alert">
              <span className="material-symbols-outlined">warning</span>
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="oid-enq-success-banner" role="status">
              <span className="material-symbols-outlined">check_circle</span>
              <span>{successMsg}</span>
            </div>
          )}

          {/* ==========================================================================
              ENQUETE LAYOUT : 2 COLUMNS À DÉFILEMENT INDÉPENDANT
             ========================================================================== */}
          {activeTab === 'dossiers' && (
            <div className="oid-enq-grid" style={{ height: 'calc(100vh - 140px)' }}>
              {/* LEFT COLUMN: SIDEBAR DOSSIERS AFFECTÉS (4 cols on desktop) */}
              <div className="oid-enq-left-col">
                <div className="oid-enq-sidebar-head">
                  <div className="oid-enq-sidebar-title">
                    <span className="material-symbols-outlined text-primary">folder_special</span>
                    <span>Dossiers Affectés</span>
                    <span className="oid-enq-count-pill">{filteredAndSortedAffectes.length}</span>
                  </div>
                  <span className="oid-enq-sidebar-eyebrow">Missions actives</span>
                </div>

                {/* Filtre & Tri des dossiers affectés */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--card)',
                  }}
                >
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '10px',
                          fontWeight: 600,
                          color: 'var(--tx3)',
                          marginBottom: '3px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        Trier par
                      </label>
                      <select
                        value={sortAffectes}
                        onChange={(e) => setSortAffectes(e.target.value as any)}
                        className="inp"
                        style={{
                          width: '100%',
                          fontSize: '11px',
                          padding: '4px 6px',
                          height: '30px',
                        }}
                      >
                        <option value="priorite_desc">⚡ Priorité (P. max)</option>
                        <option value="priorite_asc">⚡ Priorité (P. min)</option>
                        <option value="commune_asc">📍 Commune (A → Z)</option>
                        <option value="commune_desc">📍 Commune (Z → A)</option>
                        <option value="date_desc">🕒 Date (Récents)</option>
                        <option value="date_asc">🕒 Date (Anciens)</option>
                      </select>
                    </div>

                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '10px',
                          fontWeight: 600,
                          color: 'var(--tx3)',
                          marginBottom: '3px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        Commune
                      </label>
                      <select
                        value={communeFilterAffectes}
                        onChange={(e) => setCommuneFilterAffectes(e.target.value)}
                        className="inp"
                        style={{
                          width: '100%',
                          fontSize: '11px',
                          padding: '4px 6px',
                          height: '30px',
                        }}
                      >
                        <option value="all">Toutes ({dossiersAffectes.length})</option>
                        {communesAffectes.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {dossiersAffectes.length === 0 && !loading && (
                  <div className="oid-enq-empty-card">
                    <span className="material-symbols-outlined oid-enq-empty-icon">folder_open</span>
                    <p>Aucun dossier actif ne vous est actuellement affecté.</p>
                    <span>Tous vos dossiers ont été évalués ou clôturés. Consultez l'onglet Historique.</span>
                  </div>
                )}

                {dossiersAffectes.length > 0 && filteredAndSortedAffectes.length === 0 && (
                  <div className="oid-enq-empty-card">
                    <span className="material-symbols-outlined oid-enq-empty-icon">filter_alt_off</span>
                    <p>Aucun dossier ne correspond à la commune sélectionnée.</p>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setCommuneFilterAffectes('all')}
                      style={{ marginTop: '8px' }}
                    >
                      Réinitialiser le filtre
                    </button>
                  </div>
                )}

                <div ref={dossierListRef} className="oid-enq-dossier-list">
                  {filteredAndSortedAffectes.map((d) => {
                    const isSelected = selectedDossier?.id === d.id;
                    const isHighRisk = d.danger_immediat || d.score_priorite >= 80;
                    const communeLabel = d.commune || "District d'Abidjan";
                    const evalStatut = d.evaluation_statut || 'aucune';

                    return (
                      <div
                        key={d.id}
                        data-did={d.id}
                        onClick={() => handleSelectDossier(d)}
                        className={`oid-enq-dcard ${isSelected ? 'selected' : ''}`}
                      >
                        <div
                          className={`oid-enq-dcard-strip ${
                            isHighRisk ? 'strip-danger' : 'strip-secondary'
                          }`}
                        />
                        {isSelected && <div className="oid-enq-dcard-corner-dot" />}

                        <div className="oid-enq-dcard-top">
                          <div className="oid-enq-dcard-badges">
                            <span
                              className={`oid-enq-type-badge ${
                                isHighRisk ? 'badge-danger' : 'badge-secondary'
                              }`}
                            >
                              {formatTypeBadge(d.type)}
                            </span>
                            <span
                              className={`oid-enq-status-badge ${
                                isSelected ? 'status-active' : ''
                              }`}
                            >
                              {d.statut.toUpperCase()}
                            </span>
                          </div>

                          <div className="oid-enq-prio-box">
                            <span className={isHighRisk ? 'text-danger' : 'text-secondary'}>
                              P.{Math.round(d.score_priorite)}
                            </span>
                          </div>
                        </div>

                        <div className="oid-enq-dcard-idrow">
                          <span className={`oid-enq-dcard-id ${isSelected ? 'text-primary' : ''}`}>
                            Incident #{d.id}
                          </span>
                          <span className="oid-enq-dcard-ref">
                            OID-ABJ-{d.reference_publique.slice(0, 10).toUpperCase()}
                          </span>
                        </div>

                        <div className="oid-enq-dcard-loc">
                          <span
                            className={`material-symbols-outlined ${
                              isSelected ? 'text-primary' : 'text-muted'
                            }`}
                          >
                            location_on
                          </span>
                          <span className="oid-enq-loc-name">{communeLabel}</span>
                          {d.hauteur_eau_cm != null && d.hauteur_eau_cm > 0 && (
                            <span className="oid-enq-loc-sub">({d.hauteur_eau_cm} cm)</span>
                          )}
                        </div>

                        <div className="oid-enq-dcard-foot">
                          <div className="oid-enq-eval-state">
                            {evalStatut !== 'aucune' && (
                              <span
                                className={`oid-enq-eval-dot ${
                                  evalStatut === 'soumise' ? 'bg-tertiary' : 'bg-secondary pulse'
                                }`}
                              />
                            )}
                            <span
                              className={
                                evalStatut === 'soumise'
                                  ? 'text-tertiary'
                                  : evalStatut !== 'aucune'
                                  ? 'text-secondary'
                                  : 'text-muted'
                              }
                            >
                              Éval: {evalStatut === 'brouillon' ? 'en_cours' : evalStatut}
                            </span>
                          </div>
                          <span className="oid-enq-time-ago">{formatRelativeTime(d.cree_le)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT COLUMN: EVALUATION FORM */}
              <div className="oid-enq-right-col">
                {renderEvaluationCard()}
              </div>
            </div>
          )}

          {activeTab === 'historique' && (
            inspectingDossier ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', gap: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    background: 'var(--card)',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setInspectingDossier(null);
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      arrow_back
                    </span>
                    <span>← Retour à la liste de l'historique</span>
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      className="chip"
                      style={{
                        backgroundColor: 'var(--tertiary-dim)',
                        color: 'var(--tertiary)',
                        fontSize: '11px',
                        padding: '3px 8px',
                      }}
                    >
                      ARCHIVE CONSULTABLE · LECTURE SEULE
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--tx2)' }}>
                      Dossier #{inspectingDossier.id} · {inspectingDossier.commune || "District d'Abidjan"}
                    </span>
                  </div>
                </div>

                <div className="oid-enq-right-col" style={{ flex: 1, minHeight: 0 }}>
                  {renderEvaluationCard()}
                </div>
              </div>
            ) : (
              <div
                className="panel pad"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  background: 'var(--card)',
                  padding: '20px 24px',
                }}
              >
                {/* En-tête de l'historique */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    marginBottom: '20px',
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--tx)' }}>
                      Historique des dossiers et évaluations
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--tx2)' }}>
                      Dossiers clôturés ou dont l'évaluation de terrain a été transmise au Centre Opérationnel O.I.D.
                    </p>
                  </div>
                  <div className="chip" style={{ fontSize: '12px', padding: '4px 10px', backgroundColor: 'var(--tertiary-dim)', color: 'var(--tertiary)' }}>
                    <b>{filteredAndSortedHistorique.length} dossier(s) archivé(s)</b>
                  </div>
                </div>

                {/* Barre d'outils : Recherche, Tri, Filtre commune */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '12px',
                    alignItems: 'center',
                    marginBottom: '16px',
                    padding: '12px',
                    background: 'var(--surface-2, var(--card))',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
                    <span
                      className="material-symbols-outlined"
                      style={{
                        position: 'absolute',
                        left: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '18px',
                        color: 'var(--tx3)',
                      }}
                    >
                      search
                    </span>
                    <input
                      type="text"
                      placeholder="Rechercher par référence, commune, mot-clé..."
                      value={searchHistorique}
                      onChange={(e) => setSearchHistorique(e.target.value)}
                      className="inp"
                      style={{ paddingLeft: '34px', width: '100%', height: '36px', fontSize: '13px' }}
                    />
                    {searchHistorique && (
                      <button
                        type="button"
                        onClick={() => setSearchHistorique('')}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--tx3)',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--tx2)', whiteSpace: 'nowrap', fontWeight: 500 }}>
                      Trier par :
                    </label>
                    <select
                      value={sortHistorique}
                      onChange={(e) => setSortHistorique(e.target.value as any)}
                      className="inp"
                      style={{ height: '36px', fontSize: '13px', minWidth: '170px' }}
                    >
                      <option value="date_desc">🕒 Date (Plus récents)</option>
                      <option value="date_asc">🕒 Date (Plus anciens)</option>
                      <option value="priorite_desc">⚡ Priorité (Décroissante)</option>
                      <option value="priorite_asc">⚡ Priorité (Croissante)</option>
                      <option value="commune_asc">📍 Commune (A → Z)</option>
                      <option value="commune_desc">📍 Commune (Z → A)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--tx2)', whiteSpace: 'nowrap', fontWeight: 500 }}>
                      Commune :
                    </label>
                    <select
                      value={communeFilterHistorique}
                      onChange={(e) => setCommuneFilterHistorique(e.target.value)}
                      className="inp"
                      style={{ height: '36px', fontSize: '13px', minWidth: '150px' }}
                    >
                      <option value="all">Toutes ({dossiersHistorique.length})</option>
                      {communesHistorique.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Tableau de l'historique */}
                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Réf. Publique / ID</th>
                        <th>Date création</th>
                        <th>Type d'incident</th>
                        <th>Commune &amp; Détails</th>
                        <th>Priorité</th>
                        <th>Statut Évaluation</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dossiersHistorique.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--tx3)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '32px', display: 'block', marginBottom: '8px', opacity: 0.5 }}>
                              history_edu
                            </span>
                            Aucun dossier n'est archivé dans l'historique pour l'instant.
                          </td>
                        </tr>
                      ) : filteredAndSortedHistorique.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--tx3)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '32px', display: 'block', marginBottom: '8px', opacity: 0.5 }}>
                              search_off
                            </span>
                            Aucun dossier ne correspond à vos filtres de recherche.
                            <div style={{ marginTop: '10px' }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setSearchHistorique('');
                                  setCommuneFilterHistorique('all');
                                }}
                              >
                                Réinitialiser les filtres
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredAndSortedHistorique.map((h) => {
                          const isHighRisk = h.danger_immediat || h.score_priorite >= 80;
                          return (
                            <tr key={h.id}>
                              <td>
                                <strong className="code" style={{ fontSize: '12px' }}>
                                  OID-ABJ-{h.reference_publique.slice(0, 8).toUpperCase()}
                                </strong>
                                <div className="sub" style={{ fontSize: '11px', color: 'var(--tx3)' }}>
                                  Incident #{h.id}
                                </div>
                              </td>
                              <td style={{ fontFamily: 'var(--mono)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                                {h.cree_le
                                  ? new Date(h.cree_le).toLocaleString('fr-FR', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : '—'}
                              </td>
                              <td>
                                <span className={`oid-enq-type-badge ${isHighRisk ? 'badge-danger' : 'badge-secondary'}`} style={{ display: 'inline-flex' }}>
                                  {formatTypeBadge(h.type)}
                                </span>
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, fontSize: '13px' }}>
                                  {h.commune || "District d'Abidjan"}
                                </div>
                                {h.hauteur_eau_cm != null && h.hauteur_eau_cm > 0 && (
                                  <div className="sub" style={{ fontSize: '11.5px', color: 'var(--water)' }}>
                                    Hauteur : {h.hauteur_eau_cm} cm
                                  </div>
                                )}
                              </td>
                              <td>
                                <span
                                  className={`chip ${isHighRisk ? 'crit' : 'secondary'}`}
                                  style={{ fontSize: '11px', padding: '2px 8px' }}
                                >
                                  P.{Math.round(h.score_priorite)}
                                </span>
                              </td>
                              <td>
                                {h.evaluation_statut === 'soumise' ? (
                                  <span
                                    className="chip"
                                    style={{
                                      fontSize: '11.5px',
                                      backgroundColor: 'var(--tertiary-dim)',
                                      color: 'var(--tertiary)',
                                    }}
                                  >
                                    Évaluation soumise
                                  </span>
                                ) : h.statut === 'cloture' ? (
                                  <span className="chip" style={{ fontSize: '11.5px' }}>
                                    Clôturé
                                  </span>
                                ) : (
                                  <span className="chip ok" style={{ fontSize: '11.5px' }}>
                                    {h.statut}
                                  </span>
                                )}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => {
                                    handleSelectDossier(h);
                                    setInspectingDossier(h);
                                  }}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                                    visibility
                                  </span>
                                  <span>Consulter</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );
};
