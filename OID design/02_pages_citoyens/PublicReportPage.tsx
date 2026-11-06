import React, { useState } from 'react';
import { apiFetch } from '../api/client';
import { AlertTriangle, Camera, CheckCircle, Navigation, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LocationPickerMap } from '../components/LocationPickerMap';

interface SignalementResponse {
  reference_suivi: string;
  statut: string;
  type: string;
  gravite: string;
  danger_immediat: boolean;
  cree_le: string;
}

const TYPES_INONDATION = [
  { value: 'crue', label: 'Crue de cours d\'eau' },
  { value: 'ruissellement', label: 'Ruissellement urbain' },
  { value: 'reseau', label: 'Débordement réseau / égout' },
  { value: 'nappe', label: 'Remontée de nappe' },
  { value: 'submersion', label: 'Submersion marine' },
  { value: 'autre', label: 'Autre inondation' },
];

const GRAVITES = [
  { value: 'faible', label: 'Faible (quelques centimètres, circulant)' },
  { value: 'moderee', label: 'Modérée (habitations menacées)' },
  { value: 'elevee', label: 'Élevée (eau dans les habitations)' },
  { value: 'critique', label: 'Critique (danger de mort, sauvetage urgent)' },
];

export const PublicReportPage: React.FC = () => {
  const [type, setType] = useState('crue');
  const [lat, setLat] = useState<number>(14.6937); // Dakar / Zone exemple par défaut
  const [lon, setLon] = useState<number>(-17.4441);
  const [hauteurEauCm, setHauteurEauCm] = useState<number>(30);
  const [gravite, setGravite] = useState('moderee');
  const [dangerImmediat, setDangerImmediat] = useState(false);
  const [dangerType, setDangerType] = useState('');
  const [description, setDescription] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SignalementResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGeolocate = () => {
    if (!navigator.geolocation) {
      setError("La géolocalisation n'est pas supportée par votre navigateur.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Number(pos.coords.latitude.toFixed(6)));
        setLon(Number(pos.coords.longitude.toFixed(6)));
        setLocating(false);
      },
      (err) => {
        setError(`Impossible d'obtenir la position : ${err.message}`);
        setLocating(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError("L'image est trop lourde (max 10 Mo).");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        type,
        lat: Number(lat),
        lon: Number(lon),
        hauteur_eau_cm: Number(hauteurEauCm),
        gravite,
        danger_immediat: dangerImmediat,
        danger_type: dangerImmediat ? dangerType || 'personnes_en_danger' : null,
        description: description.trim() || null,
        photo_data_url: photoPreview,
      };

      const res = await apiFetch<SignalementResponse>('/signalements', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue lors de l\'envoi du signalement.');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="container page-content">
        <div className="card confirmation-card">
          <div className="confirmation-icon">
            <CheckCircle size={56} color="#16a34a" />
          </div>
          <h2>Signalement enregistré avec succès !</h2>
          <p className="confirmation-desc">
            Votre observation a bien été transmise aux services de régulation et de secours.
          </p>

          <div className="reference-box">
            <span className="reference-label">Votre référence de suivi</span>
            <div className="reference-code">{result.reference_suivi}</div>
            <p className="reference-hint">Conservez précieusement ce code pour suivre l'évolution ou signaler une aggravation.</p>
          </div>

          <div className="confirmation-actions">
            <Link to={`/suivi?ref=${result.reference_suivi}`} className="btn btn-primary">
              Suivre mon signalement
            </Link>
            <button
              onClick={() => {
                setResult(null);
                setDescription('');
                setPhotoPreview(null);
              }}
              className="btn btn-secondary"
            >
              Faire un nouveau signalement
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container page-content">
      <div className="page-header">
        <h1>Signaler une inondation</h1>
        <p>Alertez rapidement les coordinateurs et les secours sur une situation d'inondation en cours.</p>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-card">
        {/* Type & Gravité */}
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="type">Type d'inondation *</label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="form-control"
              required
            >
              {TYPES_INONDATION.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="gravite">Niveau de gravité estimé *</label>
            <select
              id="gravite"
              value={gravite}
              onChange={(e) => setGravite(e.target.value)}
              className="form-control"
              required
            >
              {GRAVITES.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Hauteur d'eau */}
        <div className="form-group">
          <label htmlFor="hauteur">Hauteur approximative de l'eau : <strong>{hauteurEauCm} cm</strong></label>
          <input
            id="hauteur"
            type="range"
            min="0"
            max="300"
            step="5"
            value={hauteurEauCm}
            onChange={(e) => setHauteurEauCm(Number(e.target.value))}
            className="form-range"
          />
          <div className="range-markers">
            <span>Cheville (15 cm)</span>
            <span>Genou (50 cm)</span>
            <span>Taille (100 cm)</span>
            <span>Submersion totale (&gt; 200 cm)</span>
          </div>
        </div>

        {/* Localisation */}
        <div className="form-group section-box">
          <div className="section-header">
            <label>Localisation précise *</label>
            <button
              type="button"
              onClick={handleGeolocate}
              className="btn btn-sm btn-outline"
              disabled={locating}
            >
              <Navigation size={14} />
              <span>{locating ? 'Recherche GPS...' : 'Me géolocaliser (GPS)'}</span>
            </button>
          </div>

          <LocationPickerMap
            lat={lat}
            lon={lon}
            onChange={(newLat, newLon) => {
              setLat(newLat);
              setLon(newLon);
            }}
          />

          <div className="form-grid" style={{ marginTop: '0.85rem' }}>
            <div>
              <label className="sub-label">Latitude</label>
              <input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(Number(e.target.value))}
                className="form-control"
                required
              />
            </div>
            <div>
              <label className="sub-label">Longitude</label>
              <input
                type="number"
                step="any"
                value={lon}
                onChange={(e) => setLon(Number(e.target.value))}
                className="form-control"
                required
              />
            </div>
          </div>
        </div>

        {/* Danger immédiat */}
        <div className={`danger-toggle ${dangerImmediat ? 'danger-active' : ''}`}>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={dangerImmediat}
              onChange={(e) => setDangerImmediat(e.target.checked)}
            />
            <span className="checkbox-text">
              <strong>Danger immédiat pour des personnes ou habitations isolées</strong>
              <small>Cocher uniquement si une vie humaine est directement menacée</small>
            </span>
          </label>

          {dangerImmediat && (
            <div className="danger-detail">
              <label htmlFor="dangerType">Précision du danger critique :</label>
              <input
                id="dangerType"
                type="text"
                value={dangerType}
                onChange={(e) => setDangerType(e.target.value)}
                placeholder="Ex : Famille bloquée sur le toit, courant violent, câble électrique..."
                className="form-control"
                required={dangerImmediat}
              />
            </div>
          )}
        </div>

        {/* Description */}
        <div className="form-group">
          <label htmlFor="desc">Description de la situation et repères visuels</label>
          <textarea
            id="desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Nom de rue, carrefour, dégâts visibles, vitesse de montée de l'eau..."
            className="form-control"
          />
        </div>

        {/* Photo */}
        <div className="form-group">
          <label>Photo du sinistre (recommandé)</label>
          <div className="photo-upload-container">
            <label className="photo-upload-btn">
              <Camera size={20} />
              <span>Prendre ou sélectionner une photo</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoUpload}
                style={{ display: 'none' }}
              />
            </label>
            {photoPreview && (
              <div className="photo-preview">
                <img src={photoPreview} alt="Aperçu" />
                <button
                  type="button"
                  onClick={() => setPhotoPreview(null)}
                  className="btn-remove-photo"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" disabled={submitting} className="btn btn-primary btn-lg">
            <Send size={18} />
            <span>{submitting ? 'Envoi en cours...' : 'Transmettre l\'alerte'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
