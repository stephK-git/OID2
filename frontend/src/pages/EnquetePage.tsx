import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api/client';
import {
  ClipboardList,
  AlertTriangle,
  Save,
  Send,
  CheckCircle,
  MapPin,
  RefreshCw,
  FolderOpen,
  Navigation,
  ExternalLink,
  Camera,
  Trash2
} from 'lucide-react';

interface DossierItem {
  id: number;
  reference_publique: string;
  type: string;
  statut: string;
  score_priorite: number;
  danger_immediat: boolean;
  coords: { lat: number; lon: number } | null;
  evaluation_statut: string;
  cree_le: string | null;
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
  photos?: string[];
}

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
};

export const EnquetePage: React.FC = () => {
  const [dossiers, setDossiers] = useState<DossierItem[]>([]);
  const [selectedDossier, setSelectedDossier] = useState<DossierItem | null>(null);
  const [evalForm, setEvalForm] = useState<EvaluationData>(defaultEvaluation);
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadDossiers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<DossierItem[]>('/enquete/mes-dossiers');
      setDossiers(data);
    } catch (err: any) {
      setError(err.message || 'Erreur de chargement des dossiers.');
    } finally {
      setLoading(false);
    }
  };

  const loadEvaluation = async (incidentId: number) => {
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
          photos: res.photos || [],
        });
      } else {
        setEvalForm(defaultEvaluation);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadDossiers();
  }, []);

  const handleSelectDossier = (dossier: DossierItem) => {
    setSelectedDossier(dossier);
    setSuccessMsg(null);
    setError(null);
    loadEvaluation(dossier.id);
  };

  const handleFormChange = (field: keyof EvaluationData, value: any) => {
    setEvalForm((prev) => ({
      ...prev,
      [field]: value,
    }));
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
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setNewPhotos((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveNewPhoto = (index: number) => {
    setNewPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const validateCoherence = (): boolean => {
    if (
      evalForm.blesses > evalForm.personnes_affectees ||
      evalForm.deces > evalForm.personnes_affectees ||
      evalForm.disparus > evalForm.personnes_affectees
    ) {
      setError('Incohérence : Le nombre de blessés, décès ou disparus ne peut pas dépasser le nombre total de personnes affectées.');
      return false;
    }
    return true;
  };

  const handleSaveDraft = async () => {
    if (!selectedDossier) return;
    if (!validateCoherence()) return;

    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<any>(`/enquete/${selectedDossier.id}/evaluation`, {
        method: 'PUT',
        body: JSON.stringify({
          ...evalForm,
          photos_data_urls: newPhotos,
        }),
      });
      setNewPhotos([]);
      if (res.photos) {
        setEvalForm((prev) => ({ ...prev, photos: res.photos }));
      }
      setSuccessMsg('Brouillon et photos enregistrés avec succès.');
      loadDossiers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitEvaluation = async () => {
    if (!selectedDossier) return;
    if (!validateCoherence()) return;
    if (!window.confirm('Voulez-vous soumettre définitivement cette évaluation ? Le statut passera à "Évalué".')) return;

    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<any>(`/enquete/${selectedDossier.id}/soumettre`, {
        method: 'POST',
        body: JSON.stringify({
          ...evalForm,
          photos_data_urls: newPhotos,
        }),
      });
      setNewPhotos([]);
      if (res.photos) {
        setEvalForm((prev) => ({ ...prev, photos: res.photos }));
      }
      setSuccessMsg('Évaluation et photographies transmises avec succès ! L\'incident est désormais marqué comme évalué.');
      loadDossiers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container page-content">
      <div className="page-header flex-between">
        <div>
          <h1>Missions de Terrain</h1>
          <p>Consultez vos dossiers d'investigation affectés et saisissez vos évaluations de dégâts.</p>
        </div>
        <button onClick={loadDossiers} className="btn btn-outline" disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          <span>Actualiser</span>
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="alert alert-success">
          <CheckCircle size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="enquete-layout">
        {/* Liste des dossiers affectés */}
        <div className="dossiers-sidebar">
          <h3>Dossiers Affectés ({dossiers.length})</h3>

          {dossiers.length === 0 && !loading && (
            <div className="card empty-state">
              <FolderOpen size={36} color="#94a3b8" />
              <p>Aucun dossier ne vous est actuellement affecté.</p>
            </div>
          )}

          {dossiers.map((d) => (
            <div
              key={d.id}
              onClick={() => handleSelectDossier(d)}
              className={`dossier-card ${selectedDossier?.id === d.id ? 'active' : ''} ${
                d.danger_immediat ? 'card-danger' : ''
              }`}
            >
              <div className="dossier-card-top">
                <span className="ref-tag">Incident #{d.id}</span>
                <span className={`status-badge status-${d.statut}`}>{d.statut}</span>
              </div>
              <h4>{d.type.toUpperCase()}</h4>
              <div className="dossier-meta">
                <span>Score: {d.score_priorite}</span>
                <span className="eval-status">Éval: {d.evaluation_statut}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Formulaire d'évaluation */}
        <div className="evaluation-panel">
          {selectedDossier ? (
            <div className="card eval-card">
              <div className="eval-card-header flex-between">
                <div>
                  <h2>Évaluation de Terrain — Dossier #{selectedDossier.id}</h2>
                  <p className="sub-hint">
                    Réf : {selectedDossier.reference_publique} — {selectedDossier.type}
                  </p>
                </div>
                <div className={`status-badge status-${selectedDossier.statut}`}>
                  {selectedDossier.statut}
                </div>
              </div>

              {selectedDossier.coords && (
                <div className="coords-banner flex-between">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <MapPin size={16} />
                    <span>Coordonnées : <strong>{selectedDossier.coords.lat}, {selectedDossier.coords.lon}</strong></span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${selectedDossier.coords.lat},${selectedDossier.coords.lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-primary"
                      title="Lancer le guidage GPS vers ce sinistre (Google Maps)"
                    >
                      <Navigation size={14} />
                      <span>Itinéraire GPS</span>
                    </a>
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${selectedDossier.coords.lat}&mlon=${selectedDossier.coords.lon}#map=16/${selectedDossier.coords.lat}/${selectedDossier.coords.lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-outline"
                      title="Ouvrir sur OpenStreetMap"
                    >
                      <ExternalLink size={14} />
                      <span>OSM</span>
                    </a>
                  </div>
                </div>
              )}

              <form onSubmit={(e) => e.preventDefault()} className="evaluation-form">
                {/* Chiffres d'impact */}
                <h3 className="section-title">1. Chiffrage de l'impact humain</h3>
                <div className="impact-inputs-grid">
                  <div className="form-group">
                    <label>Ménages touchés :</label>
                    <input
                      type="number"
                      min="0"
                      value={evalForm.menages_touches}
                      onChange={(e) => handleFormChange('menages_touches', Number(e.target.value))}
                      className="form-control"
                    />
                  </div>

                  <div className="form-group">
                    <label>Personnes affectées (total) :</label>
                    <input
                      type="number"
                      min="0"
                      value={evalForm.personnes_affectees}
                      onChange={(e) => handleFormChange('personnes_affectees', Number(e.target.value))}
                      className="form-control"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Blessés :</label>
                    <input
                      type="number"
                      min="0"
                      value={evalForm.blesses}
                      onChange={(e) => handleFormChange('blesses', Number(e.target.value))}
                      className="form-control"
                    />
                  </div>

                  <div className="form-group">
                    <label>Déplacés :</label>
                    <input
                      type="number"
                      min="0"
                      value={evalForm.deplaces}
                      onChange={(e) => handleFormChange('deplaces', Number(e.target.value))}
                      className="form-control"
                    />
                  </div>

                  <div className="form-group">
                    <label>Décès :</label>
                    <input
                      type="number"
                      min="0"
                      value={evalForm.deces}
                      onChange={(e) => handleFormChange('deces', Number(e.target.value))}
                      className="form-control"
                    />
                  </div>

                  <div className="form-group">
                    <label>Disparus :</label>
                    <input
                      type="number"
                      min="0"
                      value={evalForm.disparus}
                      onChange={(e) => handleFormChange('disparus', Number(e.target.value))}
                      className="form-control"
                    />
                  </div>
                </div>

                {/* Constats qualitatifs */}
                <h3 className="section-title">2. Constatations qualitatives</h3>

                <div className="form-group">
                  <label>Dégâts matériels constatés :</label>
                  <textarea
                    rows={2}
                    value={evalForm.degats}
                    onChange={(e) => handleFormChange('degats', e.target.value)}
                    placeholder="Murs effondrés, toitures arrachées, biens endommagés..."
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Routes coupées / Accessibilité :</label>
                  <textarea
                    rows={2}
                    value={evalForm.routes_coupees}
                    onChange={(e) => handleFormChange('routes_coupees', e.target.value)}
                    placeholder="Voies impraticables, ponts submergés, déviations possibles..."
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Risques sanitaires :</label>
                  <textarea
                    rows={2}
                    value={evalForm.risques_sanitaires}
                    onChange={(e) => handleFormChange('risques_sanitaires', e.target.value)}
                    placeholder="Eaux stagnantes, latrines débordées, risque d'épidémie..."
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Besoins urgents identifiés :</label>
                  <textarea
                    rows={2}
                    value={evalForm.besoins}
                    onChange={(e) => handleFormChange('besoins', e.target.value)}
                    placeholder="Pompage, motopompes, vivres, tentes, bâches, chlore..."
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Recommandations opérationnelles :</label>
                  <textarea
                    rows={2}
                    value={evalForm.recommandations}
                    onChange={(e) => handleFormChange('recommandations', e.target.value)}
                    placeholder="Priorité d'intervention, renforts à dépêcher..."
                    className="form-control"
                  />
                </div>

                {/* Photographies de terrain (Exigence F-24) */}
                <h3 className="section-title">3. Photographies et preuves de terrain</h3>

                <div className="form-group">
                  {/* Photos déjà enregistrées */}
                  {evalForm.photos && evalForm.photos.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <span className="sub-label">Photos enregistrées au dossier :</span>
                      <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                        {evalForm.photos.map((pUrl, idx) => (
                          <a key={idx} href={pUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={pUrl}
                              alt={`Photo terrain ${idx + 1}`}
                              style={{ width: '120px', height: '90px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #0284c7' }}
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bouton pour ajouter des photos */}
                  <div className="photo-upload-container">
                    <label className="photo-upload-btn">
                      <Camera size={18} />
                      <span>Prendre ou ajouter des photos terrain</span>
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handlePhotoUpload}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>

                  {/* Prévisualisation des nouvelles photos */}
                  {newPhotos.length > 0 && (
                    <div style={{ marginTop: '0.85rem' }}>
                      <span className="sub-label">Nouvelle(s) photo(s) prête(s) à être transmise(s) ({newPhotos.length}) :</span>
                      <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                        {newPhotos.map((preview, idx) => (
                          <div key={idx} className="photo-preview">
                            <img src={preview} alt={`Nouvelle photo ${idx + 1}`} />
                            <button
                              type="button"
                              onClick={() => handleRemoveNewPhoto(idx)}
                              className="btn-remove-photo"
                              title="Retirer cette photo"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="eval-actions-bar">
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={saving}
                    className="btn btn-secondary"
                  >
                    <Save size={18} />
                    <span>Sauvegarder Brouillon</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSubmitEvaluation}
                    disabled={saving}
                    className="btn btn-primary"
                  >
                    <Send size={18} />
                    <span>Soumettre l'évaluation</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="empty-panel card">
              <ClipboardList size={40} color="#94a3b8" />
              <p>Sélectionnez un dossier dans la colonne de gauche pour remplir ou modifier l'évaluation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
