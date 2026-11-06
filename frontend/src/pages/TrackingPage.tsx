import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { Search, AlertTriangle, ShieldAlert, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

interface SignalementTrack {
  reference_suivi: string;
  statut: string;
  incident_id: number | null;
  type: string;
  gravite: string;
  danger_immediat: boolean;
  danger_type: string | null;
  cree_le: string | null;
  incident_statut: string | null;
  incident_reference: string | null;
  niveau_fiabilite: string | null;
  motif_rejet: string | null;
}

export const TrackingPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialRef = searchParams.get('ref') || '';

  const [reference, setReference] = useState(initialRef);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SignalementTrack | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [aggravating, setAggravating] = useState(false);
  const [aggravatedMsg, setAggravatedMsg] = useState(false);

  const fetchTracking = async (ref: string) => {
    if (!ref.trim()) return;
    setLoading(true);
    setError(null);
    setAggravatedMsg(false);

    try {
      const res = await apiFetch<SignalementTrack>(`/signalements/${encodeURIComponent(ref.trim())}`);
      setData(res);
      setSearchParams({ ref: ref.trim() });
    } catch (err: any) {
      setError(err.message || 'Signalement introuvable avec cette référence.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialRef) {
      fetchTracking(initialRef);
    }
  }, [initialRef]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTracking(reference);
  };

  const handleAggraver = async () => {
    if (!data) return;
    setAggravating(true);
    try {
      await apiFetch(`/signalements/${encodeURIComponent(data.reference_suivi)}/aggraver`, {
        method: 'POST',
      });
      setAggravatedMsg(true);
      fetchTracking(data.reference_suivi);
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    } finally {
      setAggravating(false);
    }
  };

  return (
    <div className="container page-content">
      <div className="page-header">
        <h1>Suivre un signalement</h1>
        <p>Entrez votre code de référence pour connaître l'état de prise en charge de votre alerte.</p>
      </div>

      <form onSubmit={handleSearch} className="search-bar-form">
        <div className="search-input-group">
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Ex : OID-A1B2C3D4..."
            className="search-input"
            required
          />
          <button type="submit" disabled={loading} className="btn btn-primary">
            <Search size={18} />
            <span>{loading ? 'Recherche...' : 'Rechercher'}</span>
          </button>
        </div>
      </form>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {data && (
        <div className="card tracking-result-card">
          <div className="tracking-header">
            <div>
              <span className="sub-label">Référence :</span>
              <h2 className="tracking-code">{data.reference_suivi}</h2>
              <span className="tracking-date">
                Créé le {data.cree_le ? new Date(data.cree_le).toLocaleString('fr-FR') : 'Date inconnue'}
              </span>
            </div>

            <div className={`status-badge status-${data.statut}`}>
              {data.statut.toUpperCase()}
            </div>
          </div>

          {/* Stepper visuel */}
          <div className="tracking-stepper">
            <div className={`step-item ${data.statut !== 'rejete' ? 'step-done' : 'step-failed'}`}>
              <div className="step-circle"><Clock size={16} /></div>
              <div className="step-label">Signalement Reçu</div>
            </div>
            <div className={`step-item ${['valide', 'doublon'].includes(data.statut) ? 'step-done' : ''}`}>
              <div className="step-circle"><CheckCircle2 size={16} /></div>
              <div className="step-label">Vérifié & Analysé</div>
            </div>
            <div className={`step-item ${data.incident_statut && ['affecte', 'evalue', 'cloture'].includes(data.incident_statut) ? 'step-done' : ''}`}>
              <div className="step-circle"><ShieldAlert size={16} /></div>
              <div className="step-label">Enquête Terrain</div>
            </div>
            <div className={`step-item ${data.incident_statut === 'cloture' ? 'step-done' : ''}`}>
              <div className="step-circle"><CheckCircle2 size={16} /></div>
              <div className="step-label">Clôturé</div>
            </div>
          </div>

          {/* Détails du statut */}
          <div className="tracking-details-grid">
            <div className="detail-item">
              <span className="detail-title">Type d'événement</span>
              <span className="detail-value">{data.type}</span>
            </div>
            <div className="detail-item">
              <span className="detail-title">Gravité</span>
              <span className="detail-value">{data.gravite}</span>
            </div>
            <div className="detail-item">
              <span className="detail-title">Danger immédiat</span>
              <span className={`detail-value ${data.danger_immediat ? 'text-danger' : ''}`}>
                {data.danger_immediat ? 'OUI - Situation critique' : 'Non'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-title">Niveau de fiabilité</span>
              <span className="detail-value">{data.niveau_fiabilite || 'En attente de vérification'}</span>
            </div>
          </div>

          {data.motif_rejet && (
            <div className="alert alert-error" style={{ marginTop: '1rem' }}>
              <AlertTriangle size={18} />
              <div>
                <strong>Signalement non retenu :</strong> {data.motif_rejet}
              </div>
            </div>
          )}

          {aggravatedMsg && (
            <div className="alert alert-success" style={{ marginTop: '1rem' }}>
              <CheckCircle2 size={18} />
              <span>Votre mise en alerte pour aggravation a été enregistrée avec la priorité maximale.</span>
            </div>
          )}

          {/* Bouton d'aggravation */}
          {data.statut !== 'rejete' && (
            <div className="aggravation-zone">
              <div>
                <h4>La situation empire sur place ?</h4>
                <p>L'eau continue de monter ou des vies sont menacées ? Déclenchez le signal d'urgence prioritaire.</p>
              </div>
              <button
                type="button"
                onClick={handleAggraver}
                disabled={aggravating || data.danger_immediat}
                className="btn btn-danger"
              >
                <ShieldAlert size={18} />
                <span>{data.danger_immediat ? 'Danger déjà signalé' : 'Signaler une aggravation urgente'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

