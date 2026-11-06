import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api/client';
import { ShieldCheck, Check, X, GitMerge, AlertTriangle, Clock, History, RefreshCw, Eye } from 'lucide-react';

interface DoublonItem {
  id: number;
  reference_publique: string;
  statut: string;
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
  photos?: string[];
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
}

export const VerificationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'file' | 'historique'>('file');
  const [fileItems, setFileItems] = useState<SignalementItem[]>([]);
  const [historiqueItems, setHistoriqueItems] = useState<HistoriqueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal / Action en cours
  const [selectedSignalement, setSelectedSignalement] = useState<SignalementItem | null>(null);
  const [rejectMotif, setRejectMotif] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadFile = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<SignalementItem[]>('/verification/file');
      setFileItems(data);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement de la file d\'attente.');
    } finally {
      setLoading(false);
    }
  };

  const loadHistorique = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<HistoriqueItem[]>('/verification/historique');
      setHistoriqueItems(data);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement de l\'historique.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'file') {
      loadFile();
    } else {
      loadHistorique();
    }
  }, [activeTab]);

  const handleValider = async (sid: number) => {
    if (!window.confirm('Confirmer la validation de ce signalement en incident ouvert ?')) return;
    setActionLoading(true);
    try {
      await apiFetch(`/verification/${sid}/valider`, { method: 'POST' });
      loadFile();
      setSelectedSignalement(null);
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejeter = async (sid: number) => {
    if (!rejectMotif.trim()) {
      alert('Veuillez spécifier le motif du rejet.');
      return;
    }
    setActionLoading(true);
    try {
      await apiFetch(`/verification/${sid}/rejeter?motif=${encodeURIComponent(rejectMotif.trim())}`, {
        method: 'POST',
      });
      setRejectMotif('');
      loadFile();
      setSelectedSignalement(null);
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleFusionner = async (sid: number, incidentId: number) => {
    if (!window.confirm(`Confirmer la fusion de ce signalement avec l'incident #${incidentId} ?`)) return;
    setActionLoading(true);
    try {
      await apiFetch(`/verification/${sid}/fusionner/${incidentId}`, { method: 'POST' });
      loadFile();
      setSelectedSignalement(null);
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="container page-content">
      <div className="page-header flex-between">
        <div>
          <h1>Vérification des alertes</h1>
          <p>Triage, validation et qualification des signalements reçus.</p>
        </div>
        <button
          onClick={() => (activeTab === 'file' ? loadFile() : loadHistorique())}
          className="btn btn-outline"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          <span>Actualiser</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'file' ? 'active' : ''}`}
          onClick={() => setActiveTab('file')}
        >
          <Clock size={16} />
          <span>File d'attente ({fileItems.length})</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'historique' ? 'active' : ''}`}
          onClick={() => setActiveTab('historique')}
        >
          <History size={16} />
          <span>Historique récent</span>
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {activeTab === 'file' && (
        <div className="verification-layout">
          {/* Liste */}
          <div className="queue-list">
            {fileItems.length === 0 && !loading && (
              <div className="empty-state card">
                <ShieldCheck size={48} color="#16a34a" />
                <h3>Aucun signalement en attente</h3>
                <p>Tous les signalements reçus ont été traités !</p>
              </div>
            )}

            {fileItems.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedSignalement(item)}
                className={`queue-card ${selectedSignalement?.id === item.id ? 'selected' : ''} ${
                  item.danger_immediat ? 'card-danger' : ''
                } ${item.en_retard ? 'card-retard' : ''}`}
              >
                <div className="queue-card-top">
                  <div className="badge-group">
                    <span className="priority-badge">Score: {item.score_priorite}</span>
                    {item.danger_immediat && (
                      <span className="danger-badge">DANGER IMMÉDIAT</span>
                    )}
                    {item.en_retard && (
                      <span className="retard-badge">SLA DÉPASSÉ</span>
                    )}
                  </div>
                  <span className="ref-tag">{item.reference_suivi}</span>
                </div>

                <h3 className="queue-title">{item.type.toUpperCase()}</h3>
                <p className="queue-desc">{item.description || 'Pas de description fournie'}</p>

                <div className="queue-meta">
                  <span>Hauteur: {item.hauteur_eau_cm} cm</span>
                  <span>Gravité: {item.gravite}</span>
                  {item.doublons_suggeres.length > 0 && (
                    <span className="doublon-tag">
                      {item.doublons_suggeres.length} doublon(s) détecté(s)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Panneau de détail & Actions */}
          <div className="detail-panel">
            {selectedSignalement ? (
              <div className="card detail-card">
                <div className="detail-card-header">
                  <h2>Signalement #{selectedSignalement.id}</h2>
                  <span className="ref-code">{selectedSignalement.reference_suivi}</span>
                </div>

                <div className="detail-info-grid">
                  <div>
                    <label>Type :</label>
                    <p>{selectedSignalement.type}</p>
                  </div>
                  <div>
                    <label>Gravité :</label>
                    <p>{selectedSignalement.gravite}</p>
                  </div>
                  <div>
                    <label>Hauteur d'eau :</label>
                    <p>{selectedSignalement.hauteur_eau_cm} cm</p>
                  </div>
                  <div>
                    <label>Coordonnées :</label>
                    <p>
                      {selectedSignalement.coords
                        ? `${selectedSignalement.coords.lat}, ${selectedSignalement.coords.lon}`
                        : 'Non renseignées'}
                    </p>
                  </div>
                </div>

                {selectedSignalement.danger_immediat && (
                  <div className="danger-box">
                    <AlertTriangle size={18} color="#dc2626" />
                    <div>
                      <strong>Danger immédiat signalé :</strong>
                      <p>{selectedSignalement.danger_type || 'Non spécifié'}</p>
                    </div>
                  </div>
                )}

                {selectedSignalement.description && (
                  <div className="description-box">
                    <label>Description du déclarant :</label>
                    <p>{selectedSignalement.description}</p>
                  </div>
                )}

                {selectedSignalement.photos && selectedSignalement.photos.length > 0 && (
                  <div className="description-box">
                    <label>Photo(s) transmise(s) :</label>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                      {selectedSignalement.photos.map((pUrl, idx) => (
                        <a key={idx} href={pUrl} target="_blank" rel="noopener noreferrer">
                          <img
                            src={pUrl}
                            alt="Photo signalement"
                            style={{ width: '120px', height: '90px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggestions de doublons */}
                {selectedSignalement.doublons_suggeres.length > 0 && (
                  <div className="doublons-box">
                    <h4>
                      <GitMerge size={16} />
                      <span>Doublons potentiels détectés :</span>
                    </h4>
                    <p className="sub-hint">
                      Un incident similaire est déjà ouvert à proximité. Vous pouvez fusionner ce signalement pour corréler les données.
                    </p>
                    <div className="doublons-list">
                      {selectedSignalement.doublons_suggeres.map((d) => (
                        <div key={d.id} className="doublon-item">
                          <div>
                            <strong>Incident #{d.id}</strong> ({d.reference_publique}) — {d.statut}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleFusionner(selectedSignalement.id, d.id)}
                            disabled={actionLoading}
                            className="btn btn-sm btn-outline"
                          >
                            Fusionner
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions principales */}
                <div className="action-buttons-group">
                  <button
                    type="button"
                    onClick={() => handleValider(selectedSignalement.id)}
                    disabled={actionLoading}
                    className="btn btn-success btn-lg"
                  >
                    <Check size={18} />
                    <span>Valider en Incident</span>
                  </button>

                  <div className="reject-group">
                    <input
                      type="text"
                      placeholder="Motif de rejet (obligatoire)"
                      value={rejectMotif}
                      onChange={(e) => setRejectMotif(e.target.value)}
                      className="form-control"
                    />
                    <button
                      type="button"
                      onClick={() => handleRejeter(selectedSignalement.id)}
                      disabled={actionLoading}
                      className="btn btn-danger"
                    >
                      <X size={18} />
                      <span>Rejeter</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-panel card">
                <Eye size={36} color="#94a3b8" />
                <p>Sélectionnez un signalement dans la file pour le traiter.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'historique' && (
        <div className="card table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Réf</th>
                <th>Type</th>
                <th>Statut</th>
                <th>Vérifié Par</th>
                <th>Date Traitement</th>
                <th>Détails</th>
              </tr>
            </thead>
            <tbody>
              {historiqueItems.map((h) => (
                <tr key={h.id}>
                  <td><strong>{h.reference_suivi}</strong></td>
                  <td>{h.type}</td>
                  <td>
                    <span className={`status-badge status-${h.statut}`}>
                      {h.statut}
                    </span>
                  </td>
                  <td>{h.verifie_par_nom || '-'}</td>
                  <td>{h.verifie_le ? new Date(h.verifie_le).toLocaleString('fr-FR') : '-'}</td>
                  <td>
                    {h.statut === 'valide' && h.incident_id && `Incident #${h.incident_id}`}
                    {h.statut === 'rejete' && h.motif_rejet}
                    {h.statut === 'doublon' && `Fusionné dans incident #${h.incident_id}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

