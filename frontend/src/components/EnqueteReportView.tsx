import React from 'react';
import { apiUrl } from '../api/client';

export interface ReportPhotoMetaItem {
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

export interface ReportDossierItem {
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
  photos_citoyennes_meta?: ReportPhotoMetaItem[];
  evaluation_statut: string;
  cree_le: string | null;
  maj_le?: string | null;
}

export interface ReportEvaluationData {
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
  photos_meta?: ReportPhotoMetaItem[];
}

interface EnqueteReportViewProps {
  dossier: ReportDossierItem;
  evaluation: ReportEvaluationData;
  inspectorName?: string;
  loading?: boolean;
  onOpenLightbox: (url: string) => void;
}

const formatTypeLabel = (raw: string): string => {
  if (!raw) return 'Sinistre hydrologique';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
};

const formatDateTimeFr = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatStatutLabel = (dossier: ReportDossierItem, evaluation: ReportEvaluationData): string => {
  if (dossier.statut === 'cloture') return 'Dossier clôturé';
  if (evaluation.statut === 'soumise' || dossier.evaluation_statut === 'soumise') {
    return 'Évaluation transmise au Centre Opérationnel';
  }
  return dossier.statut || 'Traité';
};

export const EnqueteReportView: React.FC<EnqueteReportViewProps> = ({
  dossier,
  evaluation,
  inspectorName,
  loading = false,
  onOpenLightbox,
}) => {
  const commune = dossier.commune || "District d'Abidjan";
  const refCode = `OID-ABJ-${dossier.reference_publique.slice(0, 10).toUpperCase()}`;
  const evalPhotos = evaluation.photos || [];
  const citizenPhotos = dossier.photos_citoyennes || [];

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="oid-report-shell oid-report-loading">
        <span className="material-symbols-outlined oid-spin">progress_activity</span>
        <p>Chargement du rapport d'enquête...</p>
      </div>
    );
  }

  const kpis = [
    {
      label: 'Ménages touchés',
      value: evaluation.menages_touches,
      icon: 'home',
      tone: 'neutral',
    },
    {
      label: 'Personnes affectées',
      value: evaluation.personnes_affectees,
      icon: 'groups',
      tone: 'neutral',
    },
    {
      label: 'Personnes déplacées',
      value: evaluation.deplaces,
      icon: 'transfer_within_a_station',
      tone: evaluation.deplaces > 0 ? 'warn' : 'neutral',
    },
    {
      label: 'Blessés recensés',
      value: evaluation.blesses,
      icon: 'medical_services',
      tone: evaluation.blesses > 0 ? 'warn' : 'neutral',
    },
    {
      label: 'Décès constatés',
      value: evaluation.deces,
      icon: 'warning',
      tone: evaluation.deces > 0 ? 'danger' : 'neutral',
    },
    {
      label: 'Personnes disparues',
      value: evaluation.disparus,
      icon: 'person_search',
      tone: evaluation.disparus > 0 ? 'danger' : 'neutral',
    },
  ];

  return (
    <article className="oid-report-shell" id="oid-enquete-report-printable">
      {/* 1. EN-TÊTE DOCUMENTAIRE OFFICIEL */}
      <header className="oid-report-header">
        <div className="oid-report-header-top">
          <div>
            <div className="oid-report-eyebrow">
              OBSERVATOIRE DES INONDATIONS DU DISTRICT D'ABIDJAN · RAPPORT D'ENQUÊTE DE TERRAIN
            </div>
            <h2 className="oid-report-title">
              Compte-rendu d'évaluation — Dossier #{dossier.id}
            </h2>
          </div>

          <div className="oid-report-header-actions no-print">
            <button
              type="button"
              className="btn btn-primary btn-sm oid-report-print-btn"
              onClick={handlePrint}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                print
              </span>
              <span>Imprimer / PDF</span>
            </button>
          </div>
        </div>

        <div className="oid-report-meta-grid">
          <div className="oid-report-meta-item">
            <span className="oid-report-meta-label">Référence</span>
            <strong className="oid-report-meta-val mono">{refCode}</strong>
          </div>
          <div className="oid-report-meta-item">
            <span className="oid-report-meta-label">Commune / Zone</span>
            <strong className="oid-report-meta-val">{commune}</strong>
          </div>
          <div className="oid-report-meta-item">
            <span className="oid-report-meta-label">Nature du sinistre</span>
            <strong className="oid-report-meta-val">{formatTypeLabel(dossier.type)}</strong>
          </div>
          <div className="oid-report-meta-item">
            <span className="oid-report-meta-label">Agent enquêteur</span>
            <strong className="oid-report-meta-val">{inspectorName || 'Enquêteur O.I.D'}</strong>
          </div>
          <div className="oid-report-meta-item">
            <span className="oid-report-meta-label">Transmis le</span>
            <strong className="oid-report-meta-val">
              {formatDateTimeFr(evaluation.soumise_le || dossier.maj_le)}
            </strong>
          </div>
          <div className="oid-report-meta-item">
            <span className="oid-report-meta-label">Statut du dossier</span>
            <span
              className={`oid-report-status-pill ${
                dossier.statut === 'cloture' ? 'is-closed' : 'is-submitted'
              }`}
            >
              {formatStatutLabel(dossier, evaluation)}
            </span>
          </div>
        </div>
      </header>

      {/* CORPS DU RAPPORT */}
      <div className="oid-report-body">
        {/* 2. LOCALISATION & SIGNALEMENT INITIAL */}
        <section className="oid-report-section">
          <div className="oid-report-section-title">
            <span className="material-symbols-outlined">location_on</span>
            <h3>1. Contexte du signalement & localisation</h3>
          </div>

          <div className="oid-report-context-grid">
            <div className="oid-report-box">
              <span className="oid-report-box-label">Déclaration citoyenne initiale</span>
              <p className="oid-report-box-text">
                {dossier.description_citoyenne
                  ? `« ${dossier.description_citoyenne} »`
                  : 'Aucune description citoyenne textuelle enregistrée.'}
              </p>
              <div className="oid-report-context-pills">
                <span>Signalé le {formatDateTimeFr(dossier.cree_le)}</span>
                {dossier.hauteur_eau_cm != null && dossier.hauteur_eau_cm > 0 && (
                  <span className="is-water">Hauteur d'eau estimée : {dossier.hauteur_eau_cm} cm</span>
                )}
                {dossier.danger_immediat && (
                  <span className="is-danger">Danger immédiat signalé</span>
                )}
              </div>
            </div>

            {dossier.coords && (
              <div className="oid-report-box">
                <span className="oid-report-box-label">Coordonnées géographiques relevées</span>
                <div className="oid-report-coords-list">
                  <div>
                    <span>WGS84 (EPSG:4326) :</span>
                    <strong>
                      {dossier.coords.lat.toFixed(5)}° N, {dossier.coords.lon.toFixed(5)}° W
                    </strong>
                  </div>
                  {dossier.coords.utm_e != null && dossier.coords.utm_n != null && (
                    <div>
                      <span>UTM 30N (EPSG:32630) :</span>
                      <strong>
                        E {dossier.coords.utm_e.toLocaleString('fr-FR')} m · N{' '}
                        {dossier.coords.utm_n.toLocaleString('fr-FR')} m
                      </strong>
                    </div>
                  )}
                </div>
                <div className="oid-report-map-links no-print">
                  <a
                    href={`https://maps.google.com/?q=${dossier.coords.lat},${dossier.coords.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Google Maps
                  </a>
                  <a
                    href={`https://www.openstreetmap.org/#map=17/${dossier.coords.lat}/${dossier.coords.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    OpenStreetMap
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 3. BILAN HUMAIN (CARTES KPI) */}
        <section className="oid-report-section">
          <div className="oid-report-section-title">
            <span className="material-symbols-outlined">analytics</span>
            <h3>2. Bilan humain et démographique constaté</h3>
          </div>

          <div className="oid-report-kpi-grid">
            {kpis.map((kpi) => (
              <div key={kpi.label} className={`oid-report-kpi-card tone-${kpi.tone}`}>
                <div className="oid-report-kpi-top">
                  <span className="material-symbols-outlined">{kpi.icon}</span>
                  <span className="oid-report-kpi-val">{kpi.value}</span>
                </div>
                <span className="oid-report-kpi-label">{kpi.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 4. CONSTATS TECHNIQUES DE TERRAIN */}
        <section className="oid-report-section">
          <div className="oid-report-section-title">
            <span className="material-symbols-outlined">fact_check</span>
            <h3>3. Constatations techniques sur le terrain</h3>
          </div>

          <div className="oid-report-findings-grid">
            <div className="oid-report-finding-card">
              <h4>Dégâts matériels & infrastructures</h4>
              <p className={!evaluation.degats ? 'is-empty' : ''}>
                {evaluation.degats || 'Aucun dégât matériel majeur signalé.'}
              </p>
            </div>

            <div className="oid-report-finding-card">
              <h4>Axes routiers & voies coupées</h4>
              <p className={!evaluation.routes_coupees ? 'is-empty' : ''}>
                {evaluation.routes_coupees || 'Aucune coupure d’axe routier signalée.'}
              </p>
            </div>

            <div className="oid-report-finding-card">
              <h4>Risques sanitaires & environnementaux</h4>
              <p className={!evaluation.risques_sanitaires ? 'is-empty' : ''}>
                {evaluation.risques_sanitaires || 'Aucun risque sanitaire immédiat relevé.'}
              </p>
            </div>
          </div>
        </section>

        {/* 5. BESOINS URGENTS & RECOMMANDATIONS */}
        <section className="oid-report-section">
          <div className="oid-report-section-title">
            <span className="material-symbols-outlined">campaign</span>
            <h3>4. Besoins urgents & recommandations opérationnelles</h3>
          </div>

          <div className="oid-report-action-grid">
            <div className="oid-report-action-card is-needs">
              <div className="oid-report-action-head">
                <span className="material-symbols-outlined">emergency</span>
                <h4>Besoins prioritaires identifiés</h4>
              </div>
              <p className={!evaluation.besoins ? 'is-empty' : ''}>
                {evaluation.besoins || 'Aucun besoin matériel urgent formulé.'}
              </p>
            </div>

            <div className="oid-report-action-card is-reco">
              <div className="oid-report-action-head">
                <span className="material-symbols-outlined">assignment</span>
                <h4>Recommandations au Centre Opérationnel</h4>
              </div>
              <p className={!evaluation.recommandations ? 'is-empty' : ''}>
                {evaluation.recommandations || 'Aucune recommandation particulière transmise.'}
              </p>
            </div>
          </div>
        </section>

        {/* 6. DOSSIER PHOTOGRAPHIQUE & PREUVES */}
        <section className="oid-report-section">
          <div className="oid-report-section-title">
            <span className="material-symbols-outlined">photo_library</span>
            <h3>
              5. Dossier photographique ({evalPhotos.length + citizenPhotos.length} pièce
              {evalPhotos.length + citizenPhotos.length > 1 ? 's' : ''})
            </h3>
          </div>

          {evalPhotos.length === 0 && citizenPhotos.length === 0 ? (
            <div className="oid-report-empty-photos">
              Aucune photographie jointe à ce dossier.
            </div>
          ) : (
            <div className="oid-report-photos-grid">
              {evalPhotos.map((pUrl, idx) => {
                const meta = evaluation.photos_meta?.[idx];
                return (
                  <div
                    key={`rep-eval-${idx}`}
                    className="oid-report-photo-card"
                    onClick={() => onOpenLightbox(pUrl)}
                  >
                    <div className="oid-report-photo-img-wrap">
                      <img src={apiUrl(pUrl)} alt={`Constat enquêteur #${idx + 1}`} />
                      <span className="oid-report-photo-badge is-field">Enquêteur</span>
                      {meta?.sha256_short && (
                        <span className="oid-report-photo-sha">
                          SHA-256 {meta.sha256_short}
                        </span>
                      )}
                    </div>
                    <div className="oid-report-photo-meta">
                      <strong>{meta?.filename || `Constat terrain #${idx + 1}`}</strong>
                      <span>
                        {meta?.horodatage_utc || 'Horodaté UTC'}
                        {meta?.taille_formatee ? ` · ${meta.taille_formatee}` : ''}
                      </span>
                    </div>
                  </div>
                );
              })}

              {citizenPhotos.map((cUrl, idx) => {
                const meta = dossier.photos_citoyennes_meta?.[idx];
                return (
                  <div
                    key={`rep-cit-${idx}`}
                    className="oid-report-photo-card"
                    onClick={() => onOpenLightbox(cUrl)}
                  >
                    <div className="oid-report-photo-img-wrap">
                      <img src={apiUrl(cUrl)} alt={`Signalement citoyen #${idx + 1}`} />
                      <span className="oid-report-photo-badge is-citizen">Citoyen</span>
                    </div>
                    <div className="oid-report-photo-meta">
                      <strong>{meta?.filename || `Photo citoyenne #${idx + 1}`}</strong>
                      <span>{meta?.horodatage_utc || 'Pièce initiale'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </article>
  );
};

