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
    title: 'Ruissellement',
    subtitle: 'Voies coupées, caniveaux débordés',
    icon: 'water',
  },
  {
    value: 'cours-d-eau',
    title: 'Débordement',
    subtitle: 'Crue lagune & canaux',
    icon: 'waves',
  },
  {
    value: 'refoulement',
    title: 'Refoulement',
    subtitle: 'Égouts & collecteurs',
    icon: 'plumbing',
  },
  {
    value: 'lagunaire',
    title: 'Submersion',
    subtitle: 'Côtière / Ébrié',
    icon: 'tsunami',
  },
  {
    value: 'nappe',
    title: 'Remontée nappe',
    subtitle: 'Infiltration sous-sol',
    icon: 'water_drop',
  },
  {
    value: 'autre',
    title: 'Autre sinistre',
    subtitle: 'Éboulement / coulée',
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
  const [lat, setLat] = useState<number>(5.3599); // Abidjan — Cocody par défaut
  const [lon, setLon] = useState<number>(-4.0083);
  const [hauteurEauCm, setHauteurEauCm] = useState<number>(80);
  const [gravite, setGravite] = useState<'faible' | 'moderee' | 'elevee' | 'critique'>('moderee');
  const [dangerImmediat, setDangerImmediat] = useState(false);
  const [dangerNotes, setDangerNotes] = useState('');
  const [description, setDescription] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoMeta, setPhotoMeta] = useState<string>('PHOTO CHARGÉE');

  const [geoInfo, setGeoInfo] = useState<ReverseGeoState>({
    loading: false,
    commune: 'Cocody',
    quartier: 'Riviera Palmeraie',
    rue: null,
    adresseComplete: 'Riviera Palmeraie, Cocody',
    source: 'fallback',
  });

  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SignalementResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
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
    const controller = new AbortController();
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

      const nominatimPromise = fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=fr`,
        {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        }
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data || !data.address) return;
          const addr = data.address;
          osmCommune =
            addr.city_district ||
            addr.municipality ||
            addr.borough ||
            addr.town ||
            addr.Suburb ||
            null;
          osmQuartier =
            addr.neighbourhood ||
            addr.suburb ||
            addr.quarter ||
            addr.residential ||
            addr.hamlet ||
            addr.village ||
            null;
          osmRue =
            addr.road ||
            addr.pedestrian ||
            addr.amenity ||
            addr.building ||
            addr.shop ||
            data.name ||
            null;
        })
        .catch(() => {
          // Fallback silencieux si hors-ligne
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
    }, 320);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [lat, lon, fallbackCommune]);

  const headerCommuneBadge = useMemo(() => {
    if (geoInfo.loading) return 'LOCALISATION SIG...';
    if (geoInfo.commune) return `${geoInfo.commune.toUpperCase()} DÉTECTÉ`;
    return 'HORS DISTRICT';
  }, [geoInfo]);

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
        setLocating(false);
        showToast(`GPS actualisé : ${nextLat.toFixed(4)}° N, ${nextLon.toFixed(4)}° W`);
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

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError("L'image est trop lourde (max 10 Mo).");
      return;
    }

    const ext = (file.name.split('.').pop() || 'JPG').toUpperCase();
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    setPhotoMeta(`${ext} • ${sizeMb}Mo`);

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(reader.result as string);
      showToast('Photo prête pour envoi.');
    };
    reader.readAsDataURL(file);
  };

  const handleDeletePhoto = () => {
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    showToast('Photo supprimée du rapport.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const combinedDesc = [
        dangerImmediat && dangerNotes.trim() ? `[URGENCE VITALE : ${dangerNotes.trim()}]` : '',
        description.trim() || geoInfo.adresseComplete || '',
      ]
        .filter(Boolean)
        .join(' — ');

      const payload = {
        type,
        lat: Number(lat),
        lon: Number(lon),
        hauteur_eau_cm: Number(hauteurEauCm),
        gravite,
        danger_immediat: dangerImmediat,
        danger_type: dangerImmediat ? 'trapped' : null,
        description: combinedDesc || null,
        photo_data_url: photoPreview,
      };

      const res = await apiFetch<SignalementResponse>('/signalements', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setResult(res);
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue lors de l'envoi du signalement.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyRef = () => {
    if (!result?.reference_suivi) return;
    navigator.clipboard?.writeText(result.reference_suivi);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2500);
  };

  if (isAuthenticated && user) {
    return null;
  }

  // ÉCRAN DE CONFIRMATION APRÈS SOUMISSION
  if (result) {
    return (
      <div className="oid-report-page">
        <div className="oid-report-container">
          <div className="oid-confirm-panel">
            <div className="oid-confirm-badge">
              <span className="material-symbols-outlined">verified</span>
            </div>

            <h2 className="oid-confirm-title">Signalement transmis aux secours !</h2>
            <p className="oid-confirm-subtitle">
              Votre alerte a été enregistrée par le centre de régulation <strong>O.I.D • GSPM 180</strong>.
            </p>

            <div className="oid-ref-card">
              <span className="oid-ref-label">RÉFÉRENCE DE VOTRE SIGNALEMENT</span>
              <div className="oid-ref-code">{result.reference_suivi}</div>
              <button type="button" onClick={handleCopyRef} className="oid-copy-btn">
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                  {copiedRef ? 'check' : 'content_copy'}
                </span>
                <span>{copiedRef ? 'Référence copiée !' : 'Copier la référence'}</span>
              </button>
              <p className="oid-ref-hint">
                Conservez cette référence en cas de contact avec les équipes de coordination municipale.
              </p>
            </div>

            <div className="oid-confirm-actions">
              <Link to="/" className="oid-submit-btn">
                <span className="material-symbols-outlined">home</span>
                <span>Retour à l'accueil</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setDescription('');
                  setDangerNotes('');
                  setDangerImmediat(false);
                  setPhotoPreview(null);
                }}
                className="oid-secondary-btn"
              >
                <span className="material-symbols-outlined">add_circle</span>
                <span>Nouveau signalement</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="oid-report-page">
      {/* Notification Toast Flottante */}
      {toastMsg && (
        <div className="oid-toast" role="status" aria-live="polite">
          <span className="material-symbols-outlined oid-toast-icon">bolt</span>
          <span>{toastMsg}</span>
        </div>
      )}

      <div className="oid-report-container">
        {/* 1. En-tête de la page */}
        <section className="oid-hero-header">
          <h1 className="oid-main-title">Signaler une inondation</h1>
          <p className="oid-main-subtitle">
            Alertez instantanément les secours du District d'Abidjan en quelques clics.
          </p>
        </section>

        {/* Barre d'appel rapide GSPM 180 / 112 (Crucial sur mobile) */}
        <div className="oid-emergency-strip">
          <a
            href="tel:180"
            className="oid-call-gspm"
            title="Appel d'urgence GSPM (Sapeurs-Pompiers)"
          >
            <span className="material-symbols-outlined oid-call-error-icon">call</span>
            <span>URGENCES GSPM : 180</span>
          </a>
          <a
            href="tel:112"
            className="oid-call-112"
            title="Appel d'urgence SAMU / Police / Secours"
          >
            <span className="material-symbols-outlined oid-call-shield-icon">shield</span>
            <span>SECOURS : 112</span>
          </a>
        </div>

        {error && (
          <div className="oid-error-banner" role="alert">
            <span className="material-symbols-outlined">warning</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="oid-form-stack">
          {/* BLOC 1 : LOCALISATION PRÉCISE & GPS 1-CLIC */}
          <section className="oid-block-card">
            <div className="oid-block-header">
              <div className="oid-block-title-wrap">
                <span className="material-symbols-outlined oid-block-icon">my_location</span>
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
                <span className="material-symbols-outlined oid-gps-icon">
                  {locating ? 'sync' : 'near_me'}
                </span>
                <div className="oid-gps-text">
                  <span className="oid-gps-title">
                    {locating ? 'Acquisition satellite en cours...' : 'Me géolocaliser'}
                  </span>
                  <span className="oid-gps-sub">GPS automatique 1-clic</span>
                </div>
              </div>
              <span className="material-symbols-outlined">my_location</span>
            </button>

            {/* Mini-Carte Interactive LocationPickerMap avec télémétrie flottante */}
            <LocationPickerMap
              lat={lat}
              lon={lon}
              communeLabel={mapTelemetryLabel}
              onChange={(newLat, newLon) => {
                setLat(newLat);
                setLon(newLon);
              }}
            />

            {/* Bandeau d'adresse géocodée en direct (PostGIS ST_Intersects + Nominatim OSM) */}
            <div className="oid-reverse-geo-strip">
              <div className="oid-reverse-geo-info">
                <span className="material-symbols-outlined oid-reverse-geo-pin">pin_drop</span>
                <div className="oid-reverse-geo-text">
                  <span className="oid-reverse-geo-label">
                    {geoInfo.loading
                      ? 'Géocodage inverse PostGIS / OSM en cours...'
                      : `Adresse détectée (${geoInfo.source === 'postgis+osm' ? 'PostGIS + OSM' : geoInfo.source.toUpperCase()})`}
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
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
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
                <span className="material-symbols-outlined oid-block-icon">flood</span>
                <h2 className="oid-block-title">2. Nature du sinistre</h2>
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
                    className={`oid-flood-card ${isSelected ? 'selected' : ''}`}
                  >
                    <div className="oid-flood-icon-box">
                      <span className="material-symbols-outlined">{item.icon}</span>
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
                <span className="material-symbols-outlined oid-block-icon">straighten</span>
                <h2 className="oid-block-title">3. Hauteur de l'eau</h2>
              </div>
              <div className="oid-level-badge">
                <span className="oid-level-lbl">NIVEAU :</span>
                <span className="oid-level-val" id="height-display">
                  {hauteurEauCm} cm
                </span>
              </div>
            </div>

            {/* 5 Presets corporels rapides avec silhouettes SVG */}
            <div className="oid-presets-grid" id="presets-container">
              {WATER_PRESETS.map((preset) => {
                const isActive =
                  preset.isRoof
                    ? hauteurEauCm >= 200
                    : Math.abs(preset.value - hauteurEauCm) <= 18;

                return (
                  <button
                    key={preset.value}
                    type="button"
                    data-value={preset.value}
                    onClick={() => setHauteurEauCm(preset.value)}
                    className={`oid-preset-btn ${isActive ? 'active' : ''}`}
                  >
                    <div className="oid-silhouette-box">
                      {preset.isRoof ? (
                        <div className="oid-water-fill roof-fill">
                          <span className="material-symbols-outlined oid-roof-icon">roofing</span>
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
                <span className="material-symbols-outlined oid-block-icon">speed</span>
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
                <label htmlFor="peril-notes" className="oid-peril-label">
                  <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>
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
                <span className="material-symbols-outlined oid-block-icon">add_a_photo</span>
                <h2 className="oid-block-title">5. Photo &amp; Repères</h2>
              </div>
              <span className={`oid-photo-status ${photoPreview ? 'loaded' : ''}`}>
                {photoPreview ? '1 PHOTO CHARGÉE' : 'RECOMMANDÉ'}
              </span>
            </div>

            <div className="oid-photo-row">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                style={{ display: 'none' }}
              />

              <button
                id="btn-camera"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="oid-camera-btn"
              >
                <span className="material-symbols-outlined oid-camera-icon">photo_camera</span>
                <span className="oid-camera-title">Prendre photo</span>
                <span className="oid-camera-sub">ou parcourir la galerie</span>
              </button>

              {photoPreview && (
                <div className="oid-photo-thumb" id="photo-preview-container">
                  <img src={photoPreview} alt="Aperçu du sinistre" />
                  <div className="oid-photo-overlay" />
                  <button
                    id="btn-delete-photo"
                    type="button"
                    onClick={handleDeletePhoto}
                    aria-label="Supprimer la photo"
                    className="oid-photo-delete"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                      close
                    </span>
                  </button>
                  <div className="oid-photo-tag">{photoMeta}</div>
                </div>
              )}
            </div>

            {/* Champ Repères et Carrefour */}
            <div className="oid-landmark-group">
              <label htmlFor="crossroad-input" className="oid-landmark-label">
                <span className="material-symbols-outlined oid-landmark-icon">signpost</span>
                <span>Carrefour, repère visuel ou concession :</span>
              </label>
              <div className="oid-landmark-input-wrap">
                <input
                  id="crossroad-input"
                  type="text"
                  enterKeyHint="done"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    geoInfo.adresseComplete
                      ? `Ex: ${geoInfo.adresseComplete}, eau boueuse...`
                      : 'Ex: Carrefour Duncan, eau boueuse avec fort courant...'
                  }
                  className="oid-landmark-input"
                />
                <span className="material-symbols-outlined oid-landmark-edit-icon">edit_location</span>
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
