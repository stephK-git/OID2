import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, apiUrl } from '../../api/client';
import { EnqueteReportView } from '../../components/EnqueteReportView';
import { IncidentMiniMap } from './IncidentMiniMap';
import type {
  CoordData,
  IncidentItem,
  IncidentSortKey,
  IncidentStatusFilter,
  PhotoMetaItem,
} from './types';
import {
  IncidentStatusBadge,
  formatIncidentType,
  formatRelativeTime,
  formatShortDate,
  getFiabilitePresentation,
  getIncidentTypeMeta,
  getWaterHeightContext,
  resolveIncidentCommune,
} from './helpers';

interface IncidentsTabProps {
  data: CoordData;
  filteredIncidents: IncidentItem[];
  loading: boolean;
  incidentSearch: string;
  onChangeIncidentSearch: (q: string) => void;
  incidentFilter: IncidentStatusFilter;
  onChangeIncidentFilter: (f: IncidentStatusFilter) => void;
  incidentSort: IncidentSortKey;
  onChangeIncidentSort: (s: IncidentSortKey) => void;
  selectedIncidentId: number | null;
  onSelectIncidentId: (id: number) => void;
  /** Bascule sur l'onglet Carte centré sur l'incident. */
  onShowOnMap: (id: number) => void;
  onDataChanged: () => Promise<void> | void;
  showToast: (msg: string) => void;
}

export const IncidentsTab: React.FC<IncidentsTabProps> = ({
  data,
  filteredIncidents,
  loading,
  incidentSearch,
  onChangeIncidentSearch: setIncidentSearch,
  incidentFilter,
  onChangeIncidentFilter: setIncidentFilter,
  incidentSort,
  onChangeIncidentSort: setIncidentSort,
  selectedIncidentId,
  onSelectIncidentId,
  onShowOnMap,
  onDataChanged,
  showToast,
}) => {
  const { incidents, enqueteurs, zones } = data;
  const [panelEnqueteurId, setPanelEnqueteurId] = useState<number | ''>('');
  const [reopenMotif, setReopenMotif] = useState('');
  const [reopenRingError, setReopenRingError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showFullReportModal, setShowFullReportModal] = useState(false);

  const detailScrollRef = useRef<HTMLDivElement>(null);
  const detailColRef = useRef<HTMLDivElement>(null);
  const queueListRef = useRef<HTMLDivElement>(null);
  const reopenInputRef = useRef<HTMLInputElement>(null);

  const selectedIncident = useMemo(() => {
    if (filteredIncidents.length === 0) return null;
    if (selectedIncidentId != null) {
      const found = filteredIncidents.find((i) => i.id === selectedIncidentId);
      if (found) return found;
    }
    return filteredIncidents[0];
  }, [filteredIncidents, selectedIncidentId]);

  useEffect(() => {
    setPanelEnqueteurId(selectedIncident?.enqueteur_id || '');
    setReopenMotif('');
  }, [selectedIncident?.id, selectedIncident?.enqueteur_id]);

  const scrollToCard = useCallback((id: number) => {
    const cardEl = queueListRef.current?.querySelector(`[data-iid="${id}"]`) as HTMLElement | null;
    cardEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);

  // À l'ouverture de l'onglet (depuis la carte ou le tableau), amène le dossier sélectionné en vue
  useEffect(() => {
    if (selectedIncidentId == null) return;
    const timer = window.setTimeout(() => {
      scrollToCard(selectedIncidentId);
      if (window.innerWidth < 1080) {
        detailColRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectIncident = useCallback(
    (inc: IncidentItem, scrollCardIntoView = false) => {
      onSelectIncidentId(inc.id);
      detailScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      if (scrollCardIntoView) scrollToCard(inc.id);
      if (window.innerWidth < 1080 && detailColRef.current) {
        detailColRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [onSelectIncidentId, scrollToCard]
  );

  // Navigation clavier ↑ / ↓ dans la file
  useEffect(() => {
    if (filteredIncidents.length === 0) return;
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
  }, [filteredIncidents, selectedIncident, handleSelectIncident]);

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
      await onDataChanged();
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
      await onDataChanged();
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
      await onDataChanged();
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      {/* Lightbox plein écran */}
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
                    const communeName = resolveIncidentCommune(inc, zones);
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
                              <IncidentStatusBadge statut={inc.statut} />
                            </div>
                          </div>

                          {/* Réf & Localisation PostGIS */}
                          <div className="verif-qcard-refrow">
                            <span className="verif-ref-code">
                              #INC-{inc.id}
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
                    const selCommune = resolveIncidentCommune(selectedIncident, zones);
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

                    return (
                      <div className="verif-detail-card">
                        {/* 1. En-tête compact sur 1 ligne */}
                        <div className="verif-detail-header oid-coord-dhead-compact">
                          <div className="oid-coord-dhead-left">
                            <h2 className="verif-detail-title">Incident #{selectedIncident.id}</h2>
                            <IncidentStatusBadge statut={selectedIncident.statut} />
                            <span className="chip water">{selCommune}</span>
                          </div>

                          <div className="oid-coord-dhead-right">
                            <span className="verif-detail-time">
                              Ouvert {formatRelativeTime(selectedIncident.cree_le)}
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
                                  onClick={() => onShowOnMap(selectedIncident.id)}
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
                                        <strong>Signalement #{sig.id}</strong>
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
    </>
  );
};
