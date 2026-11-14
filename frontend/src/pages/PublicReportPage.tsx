import React, { useState, useRef, useMemo, useEffect } from 'react';
import { apiFetch } from '../api/client';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LocationPickerMap } from '../components/LocationPickerMap';

interface SignalementResponse {
  reference_suivi: string;
  statut: string;
  type: string;
  gravite: string;
  danger_immediat: boolean;
  cree_le: string;
}

interface LocalisationPostgisResponse {
  zone_id: number | null;
  commune: string | null;
  code_adm: string | null;
  dans_district: boolean;
  methode: string;
}

interface ReverseGeoState {
  loading: boolean;
  commune: string | null;
  quartier: string | null;
  rue: string | null;
  adresseComplete: string | null;
  source: 'postgis+osm' | 'postgis' | 'osm' | 'fallback';
}

interface FloodTypeOption {
  value: string;
  title: string;
  subtitle: string;
  icon: string;
}

const FLOOD_TYPES: FloodTypeOption[] = [
  {
    value: 'ruissellement',
    title: 'Rue inondée',
    subtitle: 'Eau dans la rue, caniveaux pleins',
    icon: 'water',
  },
  {
    value: 'cours-d-eau',
    title: "Cours d'eau qui déborde",
    subtitle: 'Rivière, canal ou lagune',
    icon: 'waves',
  },
  {
    value: 'refoulement',
    title: 'Égout qui déborde',
    subtitle: 'Eau qui remonte des égouts',
    icon: 'plumbing',
  },
  {
    value: 'lagunaire',
    title: 'Lagune qui monte',
    subtitle: 'Bord de lagune ou de mer',
    icon: 'tsunami',
  },
  {
    value: 'nappe',
    title: 'Eau qui sort du sol',
    subtitle: 'Cour, sous-sol, maison',
    icon: 'water_drop',
  },
  {
    value: 'autre',
    title: 'Autre problème',
    subtitle: 'Éboulement, coulée de boue',
    icon: 'crisis_alert',
  },
];

interface WaterPreset {
  value: number;
  display: string;
  label: string;
  fillHeightPct: number;
  isRoof?: boolean;
}

const WATER_PRESETS: WaterPreset[] = [
  { value: 15, display: '15 cm', label: 'Cheville', fillHeightPct: 16 },
  { value: 40, display: '40 cm', label: 'Genou', fillHeightPct: 32 },
  { value: 80, display: '80 cm', label: 'Taille', fillHeightPct: 52 },
  { value: 140, display: '140 cm', label: 'Poitrine', fillHeightPct: 72 },
  { value: 220, display: '>200', label: 'Toiture', fillHeightPct: 100, isRoof: true },
];

interface SeverityOption {
  value: 'faible' | 'moderee' | 'elevee' | 'critique';
  title: string;
  subtitle: string;
  dotClass: string;
}

const SEVERITIES: SeverityOption[] = [
  {
    value: 'faible',
    title: 'Faible',
    subtitle: 'Ralentissement',
    dotClass: 'dot-secondary',
  },
  {
    value: 'moderee',
    title: 'Modérée',
    subtitle: 'Accès pénible',
    dotClass: 'dot-tertiary',
  },
  {
    value: 'elevee',
    title: 'Élevée',
    subtitle: 'Véhicules bloqués',
    dotClass: 'dot-error',
  },
  {
    value: 'critique',
    title: 'Critique',
    subtitle: 'Péril vital immédiat',
    dotClass: 'dot-error-ping',
  },
];

interface DangerTypeOption {
  value: 'trapped' | 'electric' | 'effondrement' | 'personnes_en_danger' | 'autre';
  label: string;
}

const DANGER_TYPES: DangerTypeOption[] = [
  { value: 'trapped', label: 'Personnes piégées' },
  { value: 'personnes_en_danger', label: 'Personnes en danger' },
  { value: 'electric', label: 'Risque électrique' },
  { value: 'effondrement', label: 'Risque d\'effondrement' },
  { value: 'autre', label: 'Autre danger' },
];

const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_PHOTOS = 3;

interface PhotoItem {
  id: number;
  dataUrl: string;
  meta: string;
}

// Réduit la photo côté navigateur (max 1600 px, JPEG 0,7) pour un envoi fiable en 3G.
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxSide = 1600;
      const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas indisponible'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image illisible'));
    };
    img.src = url;
  });
}

// Fallback local hors-ligne pour les 13 communes du District Autonome d'Abidjan
const ABIDJAN_COMMUNES_FALLBACK = [
  { nom: 'Cocody', quartier: 'Riviera Palmeraie', lat: 5.3599, lon: -3.9870 },
  { nom: 'Yopougon', quartier: 'Niangon / Banco', lat: 5.3476, lon: -4.0890 },
  { nom: 'Abobo', quartier: 'Abobo Gare / Samaké', lat: 5.4161, lon: -4.0159 },
  { nom: 'Adjamé', quartier: 'Forum / Liberté', lat: 5.3650, lon: -4.0236 },
  { nom: 'Plateau', quartier: 'Centre Administratif', lat: 5.3235, lon: -4.0211 },
  { nom: 'Marcory', quartier: 'Zone 4 / Anoumabo', lat: 5.3025, lon: -3.9828 },
  { nom: 'Koumassi', quartier: 'Remblais / Grand Carrefour', lat: 5.2946, lon: -3.9472 },
  { nom: 'Treichville', quartier: 'Zone Portuaire / Belleville', lat: 5.2921, lon: -4.0083 },
  { nom: 'Port-Bouët', quartier: 'Vridi / Gonzagueville', lat: 5.2568, lon: -3.9261 },
  { nom: 'Attécoubé', quartier: 'Agban / Sebroko', lat: 5.3396, lon: -4.0419 },
  { nom: 'Bingerville', quartier: 'Bingerville Centre', lat: 5.3558, lon: -3.8853 },
  { nom: 'Anyama', quartier: 'Anyama Gare', lat: 5.4946, lon: -4.0518 },
  { nom: 'Songon', quartier: 'Songon-Agban', lat: 5.3192, lon: -4.2389 },
];

export const PublicReportPage: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Les agents connectés ne peuvent pas accéder au formulaire citoyen : redirection automatique
  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === 'coordinateur') {
        navigate('/coordination', { replace: true });
      } else if (user.role === 'verificateur') {
        navigate('/verification', { replace: true });
      } else if (user.role === 'enqueteur') {
        navigate('/enquete', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate]);

  const [searchParams] = useSearchParams();
  const initialTypeParam = searchParams.get('type');
  const validInitialType =
    initialTypeParam && FLOOD_TYPES.some((t) => t.value === initialTypeParam)
      ? initialTypeParam
      : 'ruissellement';

  const [type, setType] = useState(validInitialType);
  // Centre d'Abidjan : simple point de départ de la carte, jamais envoyé sans confirmation
  const [lat, setLat] = useState<number>(5.3364);
  const [lon, setLon] = useState<number>(-4.0267);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [hauteurEauCm, setHauteurEauCm] = useState<number | null>(null);
  const [gravite, setGravite] = useState<'faible' | 'moderee' | 'elevee' | 'critique'>('moderee');
  const [dangerImmediat, setDangerImmediat] = useState(false);
  const [dangerType, setDangerType] = useState<DangerTypeOption['value']>('personnes_en_danger');
  const [dangerNotes, setDangerNotes] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  const [geoInfo, setGeoInfo] = useState<ReverseGeoState>({
    loading: false,
    commune: null,
    quartier: null,
    rue: null,
    adresseComplete: null,
    source: 'fallback',
  });

  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SignalementResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const photoIdRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMsg(null);
    }, 3000);
  };

  // Fallback géométrique instantané (utilisé pendant le chargement ou hors-ligne)
  const fallbackCommune = useMemo(() => {
    let best = ABIDJAN_COMMUNES_FALLBACK[0];
    let minDist = Infinity;
    for (const c of ABIDJAN_COMMUNES_FALLBACK) {
      const d = Math.hypot(c.lat - lat, c.lon - lon);
      if (d < minDist) {
        minDist = d;
        best = c;
      }
    }
    if (minDist > 0.45) {
      return { commune: null, quartier: 'Hors District Abidjan' };
    }
    return { commune: best.nom, quartier: best.quartier };
  }, [lat, lon]);

  // Géocodage inverse hybride en temps réel : PostGIS (ST_Intersects sur polygones communaux) + OpenStreetMap Nominatim (quartier & rue)
  useEffect(() => {
    // Pas de géocodage tant que le citoyen n'a pas placé sa position
    if (!locationConfirmed) return;
    const controller = new AbortController();
    // Délai de 1 s après le dernier déplacement du repère
    const timer = window.setTimeout(async () => {
      setGeoInfo((prev) => ({ ...prev, loading: true }));

      let postgisCommune: string | null = null;
      let osmCommune: string | null = null;
      let osmQuartier: string | null = null;
      let osmRue: string | null = null;

      const postgisPromise = apiFetch<LocalisationPostgisResponse>(
        `/signalements/localisation?lat=${lat}&lon=${lon}`,
        { signal: controller.signal }
      )
        .then((res) => {
          if (res && res.commune) {
            postgisCommune = res.commune;
          }
        })
        .catch(() => {
          // Fallback silencieux si backend non joignable
        });

      // Adresse (quartier, rue) : le serveur interroge OpenStreetMap et met en cache
      const nominatimPromise = apiFetch<{
        commune: string | null;
        quartier: string | null;
        rue: string | null;
      }>(`/signalements/adresse?lat=${lat}&lon=${lon}`, { signal: controller.signal })
        .then((res) => {
          if (!res) return;
          osmCommune = res.commune;
          osmQuartier = res.quartier;
          osmRue = res.rue;
        })
        .catch(() => {
          // Fallback silencieux si le service d'adresse est indisponible
        });

      await Promise.allSettled([postgisPromise, nominatimPromise]);
      if (controller.signal.aborted) return;

      const finalCommune = postgisCommune || osmCommune || fallbackCommune.commune;
      const finalQuartier =
        osmQuartier && osmQuartier !== finalCommune
          ? osmQuartier
          : fallbackCommune.quartier;
      const finalRue =
        osmRue && osmRue !== finalQuartier && osmRue !== finalCommune ? osmRue : null;

      const parts = [finalRue, finalQuartier, finalCommune].filter(Boolean);
      const source: ReverseGeoState['source'] =
        postgisCommune && (osmQuartier || osmRue)
          ? 'postgis+osm'
          : postgisCommune
          ? 'postgis'
          : osmQuartier || osmRue || osmCommune
          ? 'osm'
          : 'fallback';

      setGeoInfo({
        loading: false,
        commune: finalCommune,
        quartier: finalQuartier,
        rue: finalRue,
        adresseComplete: parts.join(', ') || 'Position GPS sélectionnée',
        source,
      });
    }, 1000);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [lat, lon, fallbackCommune, locationConfirmed]);

  const headerCommuneBadge = useMemo(() => {
    if (!locationConfirmed) return 'À localiser';
    if (geoInfo.loading) return 'Localisation…';
    if (geoInfo.commune) return geoInfo.commune;
    return 'Hors district';
  }, [geoInfo, locationConfirmed]);

  const mapTelemetryLabel = useMemo(() => {
    const tokens = [geoInfo.rue, geoInfo.quartier || geoInfo.commune].filter(Boolean);
    if (tokens.length > 0) return tokens.join(' · ');
    return 'Toucher la carte pour ajuster';
  }, [geoInfo]);

  const handleGeolocate = () => {
    if (!navigator.geolocation) {
      setError("La géolocalisation n'est pas supportée par votre navigateur.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextLat = Number(pos.coords.latitude.toFixed(6));
        const nextLon = Number(pos.coords.longitude.toFixed(6));
        setLat(nextLat);
        setLon(nextLon);
        setLocationConfirmed(true);
        setLocating(false);
        showToast(`Position GPS enregistrée (${nextLat.toFixed(4)}, ${nextLon.toFixed(4)})`);
      },
      (err) => {
        setError(`Impossible d'obtenir la position : ${err.message}`);
        setLocating(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleApplyDetectedAddress = () => {
    if (!geoInfo.adresseComplete) return;
    setDescription((prev) => {
      if (!prev.trim()) return geoInfo.adresseComplete!;
      if (prev.includes(geoInfo.adresseComplete!)) return prev;
      return `${geoInfo.adresseComplete} — ${prev}`;
    });
    showToast('Adresse injectée dans le champ repère.');
  };

  const handleSelectSeverity = (val: 'faible' | 'moderee' | 'elevee' | 'critique') => {
    setGravite(val);
    if (val === 'critique' && !dangerImmediat) {
      setDangerImmediat(true);
      showToast('Alerte Péril Immédiat activée.');
    } else if (val !== 'critique' && dangerImmediat) {
      setDangerImmediat(false);
      showToast('Péril Immédiat désactivé.');
    }
  };

  const handleTogglePeril = () => {
    const next = !dangerImmediat;
    setDangerImmediat(next);
    if (next) {
      setGravite('critique');
      showToast('Alerte Péril Immédiat activée.');
    } else {
      if (gravite === 'critique') setGravite('elevee');
      showToast('Péril Immédiat désactivé.');
    }
  };

  const handlePhotoFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = Array.from(input.files ?? []);
    input.value = ''; // permet de re-choisir la même photo
    if (files.length === 0) return;

    const free = MAX_PHOTOS - photos.length;
    if (free <= 0) {
      setError(`${MAX_PHOTOS} photos maximum par signalement.`);
      return;
    }
    if (files.length > free) {
      showToast(`${MAX_PHOTOS} photos maximum : seules les ${free} premières sont ajoutées.`);
    }

    const added: PhotoItem[] = [];
    for (const file of files.slice(0, free)) {
      if (file.size > 10 * 1024 * 1024) {
        setError(`« ${file.name} » est trop lourde (max 10 Mo).`);
        continue;
      }
      try {
        const dataUrl = await compressImage(file);
        const sizeKb = Math.round((dataUrl.length * 0.75) / 1024);
        photoIdRef.current += 1;
        added.push({ id: photoIdRef.current, dataUrl, meta: `JPG • ${sizeKb} Ko` });
      } catch {
        setError('Impossible de lire cette image. Essayez une autre photo.');
      }
    }
    if (added.length > 0) {
      setPhotos((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
      showToast(added.length > 1 ? 'Photos prêtes pour envoi.' : 'Photo prête pour envoi.');
    }
  };

  const stopCameraStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const closeCamera = () => {
    stopCameraStream();
    setCameraOpen(false);
  };

  // Branche le flux vidéo sur l'aperçu quand la fenêtre caméra s'ouvre ; coupe la caméra à la fermeture
  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
    return () => {
      if (!cameraOpen) stopCameraStream();
    };
  }, [cameraOpen]);

  useEffect(() => stopCameraStream, []);

  const openCamera = async () => {
    if (photos.length >= MAX_PHOTOS) return;
    setError(null);

    // Caméra en direct : exige HTTPS ou localhost. Sinon, on passe par l'appareil photo du téléphone.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      setCameraOpen(true);
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
        setError(
          "L'accès à l'appareil photo est bloqué. Autorisez la caméra pour ce site dans votre navigateur (icône de cadenas près de l'adresse), puis réessayez, ou utilisez « Importer »."
        );
      } else if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') {
        setError("Aucun appareil photo détecté sur cet appareil. Utilisez « Importer » pour choisir une photo.");
      } else {
        // Caméra occupée ou autre souci : repli sur la capture native
        cameraInputRef.current?.click();
      }
    }
  };

  const takeSnapshot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const ratio = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * ratio);
    canvas.height = Math.round(video.videoHeight * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    const sizeKb = Math.round((dataUrl.length * 0.75) / 1024);
    photoIdRef.current += 1;
    const item: PhotoItem = { id: photoIdRef.current, dataUrl, meta: `JPG • ${sizeKb} Ko` };
    setPhotos((prev) => [...prev, item].slice(0, MAX_PHOTOS));
    showToast('Photo prête pour envoi.');
    closeCamera();
  };

  const handleDeletePhoto = (id: number) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    showToast('Photo supprimée du rapport.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!locationConfirmed) {
      setError("Indiquez où se trouve l'inondation : utilisez « Me géolocaliser » ou touchez la carte.");
      window.setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
      return;
    }

    setSubmitting(true);

    try {
      const combinedDesc = [
        dangerImmediat && dangerNotes.trim() ? `[URGENCE VITALE : ${dangerNotes.trim()}]` : '',
        description.trim() || geoInfo.adresseComplete || '',
      ]
        .filter(Boolean)
        .join(' — ')
        .slice(0, MAX_DESCRIPTION_LENGTH);

      const payload = {
        type,
        lat: Number(lat),
        lon: Number(lon),
        hauteur_eau_cm: hauteurEauCm === null ? null : Number(hauteurEauCm),
        gravite,
        danger_immediat: dangerImmediat,
        danger_type: dangerImmediat ? dangerType : null,
        description: combinedDesc || null,
        photos_data_urls: photos.map((p) => p.dataUrl),
      };

      const res = await apiFetch<SignalementResponse>('/signalements', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setResult(res);
      window.scrollTo({ top: 0 });
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue lors de l'envoi du signalement.");
      window.setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
    } finally {
      setSubmitting(false);
    }
  };

  if (isAuthenticated && user) {
    return null;
  }

  const handleNewReport = () => {
    setResult(null);
    setDescription('');
    setDangerNotes('');
    setDangerImmediat(false);
    setPhotos([]);
    setLocationConfirmed(false);
    setHauteurEauCm(null);
    setGravite('moderee');
  };

  return (
    <div className="oid-report-page">
      {/* Notification Toast Flottante */}
      {toastMsg && (
        <div className="oid-toast" role="status" aria-live="polite">
          <span aria-hidden="true" className="material-symbols-outlined oid-toast-icon">bolt</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Caméra en direct */}
      {cameraOpen && (
        <div className="oid-overlay" role="dialog" aria-modal="true" aria-label="Prendre une photo">
          <div className="oid-camera-modal">
            <video ref={videoRef} className="oid-camera-video" playsInline muted autoPlay />
            <div className="oid-camera-controls">
              <button type="button" onClick={closeCamera} className="oid-secondary-btn">
                <span>Annuler</span>
              </button>
              <button type="button" onClick={takeSnapshot} className="oid-submit-btn">
                <span aria-hidden="true" className="material-symbols-outlined">photo_camera</span>
                <span>Capturer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation après envoi : fenêtre par-dessus le formulaire */}
      {result && (
        <div className="oid-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="oid-confirm-panel">
            <div className="oid-confirm-badge">
              <span aria-hidden="true" className="material-symbols-outlined">verified</span>
            </div>

            <h2 id="confirm-title" className="oid-confirm-title">Signalement enregistré</h2>
            <p className="oid-confirm-subtitle">
              Merci, votre signalement a bien été reçu par la plateforme <strong>O.I.D</strong> et sera examiné par
              les équipes de vérification.
            </p>
            <p className="oid-confirm-subtitle">
              <strong>Si une vie est en danger, appelez immédiatement le <a href="tel:180">180</a> (sapeurs-pompiers) ou le{' '}
              <a href="tel:112">112</a>.</strong>
            </p>

            <div className="oid-confirm-actions">
              <Link to="/" className="oid-submit-btn">
                <span aria-hidden="true" className="material-symbols-outlined">home</span>
                <span>Retour à l'accueil</span>
              </Link>
              <button type="button" onClick={handleNewReport} className="oid-secondary-btn">
                <span aria-hidden="true" className="material-symbols-outlined">add_circle</span>
                <span>Nouveau signalement</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="oid-report-container">
        {/* 1. En-tête de la page */}
        <section className="oid-hero-header">
          <h1 className="oid-main-title">Signaler une inondation</h1>
          <p className="oid-main-subtitle">
            Alertez les secours et les équipes municipales du District d'Abidjan en quelques clics.
          </p>
        </section>

        {/* Barre d'appel rapide 180 / 112 (crucial sur mobile) */}
        <div className="oid-emergency-strip">
          <a
            href="tel:180"
            className="oid-call-gspm"
            title="Appel d'urgence sapeurs-pompiers (180)"
          >
            <span aria-hidden="true" className="material-symbols-outlined oid-call-error-icon">call</span>
            <span>POMPIERS : 180</span>
          </a>
          <a
            href="tel:112"
            className="oid-call-112"
            title="Appel d'urgence SAMU / Police / Secours"
          >
            <span aria-hidden="true" className="material-symbols-outlined oid-call-shield-icon">shield</span>
            <span>SECOURS : 112</span>
          </a>
        </div>

        {error && (
          <div className="oid-error-banner" role="alert" ref={errorRef}>
            <span aria-hidden="true" className="material-symbols-outlined">warning</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="oid-form-stack">
          {/* BLOC 1 : LOCALISATION PRÉCISE & GPS 1-CLIC */}
          <section className="oid-block-card">
            <div className="oid-block-header">
              <div className="oid-block-title-wrap">
                <span aria-hidden="true" className="material-symbols-outlined oid-block-icon">my_location</span>
                <h2 className="oid-block-title">1. Localisation précise</h2>
              </div>
              <span
                className="oid-commune-pill"
                title={
                  geoInfo.source.includes('postgis')
                    ? 'Commune identifiée par intersection spatiale PostGIS (ST_Intersects)'
                    : 'Localisation géocodée OpenStreetMap'
                }
              >
                {headerCommuneBadge}
              </span>
            </div>

            {/* Bouton GPS 1-clic */}
            <button
              id="btn-gps"
              type="button"
              onClick={handleGeolocate}
              disabled={locating}
              className="oid-gps-btn"
            >
              <div className="oid-gps-left">
                <span aria-hidden="true" className="material-symbols-outlined oid-gps-icon">
                  {locating ? 'sync' : 'near_me'}
                </span>
                <div className="oid-gps-text">
                  <span className="oid-gps-title">
                    {locating ? 'Localisation en cours…' : 'Me géolocaliser'}
                  </span>
                  <span className="oid-gps-sub">Position automatique</span>
                </div>
              </div>
              <span aria-hidden="true" className="material-symbols-outlined">my_location</span>
            </button>

            {/* Mini-Carte Interactive LocationPickerMap avec télémétrie flottante */}
            <LocationPickerMap
              lat={lat}
              lon={lon}
              communeLabel={mapTelemetryLabel}
              onChange={(newLat, newLon) => {
                setLat(newLat);
                setLon(newLon);
                setLocationConfirmed(true);
                setError(null);
              }}
            />

            {/* Bandeau d'adresse géocodée en direct (PostGIS ST_Intersects + Nominatim OSM) */}
            <div className="oid-reverse-geo-strip">
              <div className="oid-reverse-geo-info">
                <span aria-hidden="true" className="material-symbols-outlined oid-reverse-geo-pin">pin_drop</span>
                <div className="oid-reverse-geo-text">
                  <span className="oid-reverse-geo-label">
                    {geoInfo.loading
                      ? 'Adresse en cours de détection…'
                      : 'Adresse détectée'}
                  </span>
                  <strong className="oid-reverse-geo-value">
                    {geoInfo.adresseComplete || 'Déplacez le repère sur la carte'}
                  </strong>
                </div>
              </div>

              {geoInfo.adresseComplete && (
                <button
                  type="button"
                  onClick={handleApplyDetectedAddress}
                  className="oid-inject-addr-btn"
                  title="Copier cette adresse dans le champ Carrefour / Repère visuel"
                >
                  <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                    add_location_alt
                  </span>
                  <span>Utiliser comme repère</span>
                </button>
              )}
            </div>
          </section>

          {/* BLOC 2 : NATURE DU SINISTRE */}
          <section className="oid-block-card">
            <div className="oid-block-header">
              <div className="oid-block-title-wrap">
                <span aria-hidden="true" className="material-symbols-outlined oid-block-icon">flood</span>
                <h2 className="oid-block-title">2. Que se passe-t-il ?</h2>
              </div>
              <span className="oid-block-meta">1 Choix obligatoire</span>
            </div>

            <div className="oid-flood-grid" id="flood-type-grid">
              {FLOOD_TYPES.map((item) => {
                const isSelected = type === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    data-type={item.value}
                    onClick={() => setType(item.value)}
                    aria-pressed={isSelected}
                    className={`oid-flood-card ${isSelected ? 'selected' : ''}`}
                  >
                    <div className="oid-flood-icon-box">
                      <span aria-hidden="true" className="material-symbols-outlined">{item.icon}</span>
                    </div>
                    <div className="oid-flood-text">
                      <span className="oid-flood-title">{item.title}</span>
                      <span className="oid-flood-sub">{item.subtitle}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* BLOC 3 : HAUTEUR DE L'EAU */}
          <section className="oid-block-card">
            <div className="oid-block-header">
              <div className="oid-block-title-wrap">
                <span aria-hidden="true" className="material-symbols-outlined oid-block-icon">straighten</span>
                <h2 className="oid-block-title">3. Hauteur de l'eau</h2>
              </div>
              <div className="oid-level-badge">
                <span className="oid-level-lbl">Hauteur :</span>
                <span className="oid-level-val" id="height-display">
                  {hauteurEauCm === null ? 'Non précisée' : `${hauteurEauCm} cm`}
                </span>
              </div>
            </div>

            {/* 5 Presets corporels rapides avec silhouettes SVG */}
            <div className="oid-presets-grid" id="presets-container">
              {WATER_PRESETS.map((preset) => {
                const isActive =
                  hauteurEauCm !== null &&
                  (preset.isRoof
                    ? hauteurEauCm >= 200
                    : Math.abs(preset.value - hauteurEauCm) <= 18);

                return (
                  <button
                    key={preset.value}
                    type="button"
                    data-value={preset.value}
                    onClick={() => setHauteurEauCm(preset.value)}
                    aria-pressed={isActive}
                    aria-label={`Hauteur d'eau : ${preset.label}, ${preset.display}`}
                    className={`oid-preset-btn ${isActive ? 'active' : ''}`}
                  >
                    <div className="oid-silhouette-box">
                      {preset.isRoof ? (
                        <div className="oid-water-fill roof-fill">
                          <span aria-hidden="true" className="material-symbols-outlined oid-roof-icon">roofing</span>
                        </div>
                      ) : (
                        <div
                          className={`oid-water-fill ${isActive ? 'active-fill' : ''}`}
                          style={{ height: `${preset.fillHeightPct}%` }}
                        />
                      )}
                      <svg
                        className="oid-body-svg"
                        fill="currentColor"
                        viewBox="0 0 24 48"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="6" r="4"></circle>
                        <path d="M8 12c-2.2 0-4 1.8-4 4v10c0 1.1.9 2 2 2h1v16c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V28h1c1.1 0 2-.9 2-2V16c0-2.2-1.8-4-4-4H8z"></path>
                      </svg>
                    </div>
                    <div className="oid-preset-meta">
                      <span className="oid-preset-cm">{preset.display}</span>
                      <span className="oid-preset-name">{preset.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* BLOC 4 : GRAVITÉ ESTIMÉE & PÉRIL VITAL */}
          <section className="oid-block-card">
            <div className="oid-block-header">
              <div className="oid-block-title-wrap">
                <span aria-hidden="true" className="material-symbols-outlined oid-block-icon">speed</span>
                <h2 className="oid-block-title">4. Gravité estimée</h2>
              </div>

              {/* Interrupteur Péril Immédiat */}
              <button
                type="button"
                id="toggle-peril"
                onClick={handleTogglePeril}
                className={`oid-peril-switch ${dangerImmediat ? 'active' : ''}`}
                aria-pressed={dangerImmediat}
              >
                <span className="oid-peril-switch-lbl">Péril vital</span>
                <span className="oid-peril-track">
                  <span id="toggle-knob" className="oid-peril-knob" />
                </span>
              </button>
            </div>

            {/* 4 cartes tactiles distinctes */}
            <div className="oid-severity-grid" id="severity-container">
              {SEVERITIES.map((sev) => {
                const isSelected = gravite === sev.value;
                const isCritique = sev.value === 'critique';
                return (
                  <button
                    key={sev.value}
                    type="button"
                    data-severity={sev.value}
                    onClick={() => handleSelectSeverity(sev.value)}
                    aria-pressed={isSelected}
                    className={`oid-severity-btn ${
                      isSelected ? (isCritique ? 'selected-critique' : 'selected') : ''
                    }`}
                  >
                    <span className={`oid-sev-dot ${sev.dotClass}`} />
                    <div className="oid-sev-text">
                      <span className="oid-sev-title">{sev.title}</span>
                      <span className="oid-sev-sub">{sev.subtitle}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Zone de détail d'urgence vitale (affichée si Péril Vital ou Gravité Critique) */}
            {(dangerImmediat || gravite === 'critique') && (
              <div className="oid-peril-box" id="peril-details-box">
                <p className="oid-peril-call" role="alert">
                  <strong>Ce formulaire ne remplace pas un appel.</strong> Appelez maintenant le{' '}
                  <a href="tel:180">180 (sapeurs-pompiers)</a> ou le <a href="tel:112">112</a>.
                </p>
                <label htmlFor="peril-type" className="oid-peril-label">
                  <span>Nature du danger :</span>
                </label>
                <select
                  id="peril-type"
                  value={dangerType}
                  onChange={(e) => setDangerType(e.target.value as DangerTypeOption['value'])}
                  className="oid-peril-textarea"
                >
                  {DANGER_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <label htmlFor="peril-notes" className="oid-peril-label">
                  <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: '17px' }}>
                    emergency_home
                  </span>
                  <span>Précisez l'urgence vitale constatée :</span>
                </label>
                <textarea
                  id="peril-notes"
                  rows={2}
                  enterKeyHint="enter"
                  value={dangerNotes}
                  onChange={(e) => setDangerNotes(e.target.value)}
                  placeholder="Ex: 4 personnes isolées sur toiture concession Lot 24B avec 1 enfant, montée rapide..."
                  className="oid-peril-textarea"
                />
              </div>
            )}
          </section>

          {/* BLOC 5 : PHOTO DU SINISTRE & REPÈRES VISUELS */}
          <section className="oid-block-card">
            <div className="oid-block-header">
              <div className="oid-block-title-wrap">
                <span aria-hidden="true" className="material-symbols-outlined oid-block-icon">add_a_photo</span>
                <h2 className="oid-block-title">5. Photo &amp; Repères</h2>
              </div>
              <span className={`oid-photo-status ${photos.length > 0 ? 'loaded' : ''}`}>
                {photos.length > 0
                  ? `${photos.length}/${MAX_PHOTOS} PHOTO${photos.length > 1 ? 'S' : ''}`
                  : 'RECOMMANDÉ'}
              </span>
            </div>

            {/* Deux entrées : appareil photo direct, ou import depuis la galerie */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoFiles}
              style={{ display: 'none' }}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoFiles}
              style={{ display: 'none' }}
            />

            <div className="oid-photo-actions">
              <button
                id="btn-camera"
                type="button"
                onClick={openCamera}
                disabled={photos.length >= MAX_PHOTOS}
                className="oid-camera-btn"
              >
                <span aria-hidden="true" className="material-symbols-outlined oid-camera-icon">photo_camera</span>
                <span className="oid-camera-title">Prendre une photo</span>
                <span className="oid-camera-sub">avec l'appareil</span>
              </button>
              <button
                id="btn-gallery"
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                disabled={photos.length >= MAX_PHOTOS}
                className="oid-camera-btn"
              >
                <span aria-hidden="true" className="material-symbols-outlined oid-camera-icon">photo_library</span>
                <span className="oid-camera-title">Importer</span>
                <span className="oid-camera-sub">depuis la galerie</span>
              </button>
            </div>
            <p className="oid-photo-hint">
              Jusqu'à {MAX_PHOTOS} photos. Il en reste {MAX_PHOTOS - photos.length} à ajouter.
            </p>

            {photos.length > 0 && (
              <div className="oid-photo-grid" id="photo-preview-container">
                {photos.map((photo, index) => (
                  <div className="oid-photo-thumb" key={photo.id}>
                    <img src={photo.dataUrl} alt={`Photo ${index + 1} du sinistre`} />
                    <div className="oid-photo-overlay" />
                    <button
                      type="button"
                      onClick={() => handleDeletePhoto(photo.id)}
                      aria-label={`Supprimer la photo ${index + 1}`}
                      className="oid-photo-delete"
                    >
                      <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                        close
                      </span>
                    </button>
                    <div className="oid-photo-tag">{photo.meta}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Champ Repères et Carrefour */}
            <div className="oid-landmark-group">
              <label htmlFor="crossroad-input" className="oid-landmark-label">
                <span aria-hidden="true" className="material-symbols-outlined oid-landmark-icon">signpost</span>
                <span>Carrefour, repère visuel ou concession :</span>
              </label>
              <div className="oid-landmark-input-wrap">
                <textarea
                  id="crossroad-input"
                  rows={2}
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  enterKeyHint="enter"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    geoInfo.adresseComplete
                      ? `Ex: ${geoInfo.adresseComplete}, eau boueuse...`
                      : 'Ex: Carrefour Duncan, eau boueuse avec fort courant...'
                  }
                  className="oid-landmark-input"
                />
                <span aria-hidden="true" className="material-symbols-outlined oid-landmark-edit-icon">edit_location</span>
              </div>
            </div>
          </section>

          {/* BLOC 6 : BOUTON DE SOUMISSION PRINCIPAL & SÉCURITÉ */}
          <section className="oid-submit-section">
            <button
              id="btn-submit"
              type="submit"
              disabled={submitting}
              className="oid-submit-btn"
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '24px', fontVariationSettings: '"FILL" 1' }}
              >
                send
              </span>
              <span>{submitting ? 'Transmission en cours...' : 'Transmettre le signalement'}</span>
            </button>
          </section>
        </form>
      </div>
    </div>
  );
};
