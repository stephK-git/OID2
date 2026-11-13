import React from 'react';
import { apiUrl } from '../../api/client';
import {
  INCIDENT_FIABILITE_LABELS,
  INCIDENT_STATUT_LABELS,
  INCIDENT_TYPE_LABELS,
} from '../incidentLabels';
import type { PublicIncident } from '../PublicIncidentCard';

function formatTime(isoDate: string | null): string {
  if (!isoDate) return '—';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatHeight(height: number | null): string {
  return height != null ? `${Math.round(height)} cm` : '—';
}

interface MetricProps {
  label: string;
  value: string;
  mono?: boolean;
}

const Metric: React.FC<MetricProps> = ({ label, value, mono = false }) => (
  <div className="rounded-xl border border-line p-3.5">
    <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink2">{label}</div>
    <div className={`mt-1.5 font-bold text-ink ${mono ? 'font-mono text-[22px]' : 'text-[15px]'}`}>
      {value}
    </div>
  </div>
);

const MiniMetric: React.FC<MetricProps> = ({ label, value }) => (
  <div className="rounded-[10px] border border-line bg-surface px-3 py-2.5">
    <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink2">{label}</div>
    <div className="mt-1 text-[14px] font-bold text-ink">{value}</div>
  </div>
);

interface DetailBlockProps {
  title: string;
  text: string | null;
}

const DetailBlock: React.FC<DetailBlockProps> = ({ title, text }) => (
  <div>
    <div className="text-[13px] font-bold text-ink">{title}</div>
    <p className="mt-1 text-[14px] leading-[1.55] text-ink2">{text || 'Non renseigné.'}</p>
  </div>
);

interface PhotosProps {
  photos: string[];
  title: string;
  compact?: boolean;
  onOpenPhoto: (photos: string[], index: number, title: string) => void;
}

const Photos: React.FC<PhotosProps> = ({ photos, title, compact = false, onOpenPhoto }) => {
  if (photos.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-ink2">
        Aucune photo publiée pour cet incident.
      </div>
    );
  }

  if (compact) {
    return (
      <div>
        <div className="mb-1.5 text-[12px] font-bold text-ink2">
          Photos ({photos.length}) — cliquez pour agrandir
        </div>
        <div className="flex flex-wrap gap-2">
          {photos.map((url, index) => (
            <button
              key={`${title}-photo-${index}`}
              type="button"
              onClick={() => onOpenPhoto(photos, index, title)}
              className="group relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-line bg-[var(--s3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--water)] sm:h-24 sm:w-32"
              aria-label={`Agrandir la photo ${index + 1} sur ${photos.length}`}
            >
              <img
                src={apiUrl(url)}
                alt={`${title} — miniature ${index + 1}`}
                loading="lazy"
                className="landing-cover-img transition-transform duration-300 group-hover:scale-105"
              />
            </button>
          ))}
        </div>
      </div>
    );
  }

  const singlePhoto = photos.length === 1;
  const gridCols =
    photos.length >= 3 ? 'grid-cols-3' : photos.length === 2 ? 'grid-cols-2' : 'grid-cols-1';

  return (
    <div className={`grid ${gridCols} gap-2`}>
      {photos.map((url, index) => (
        <button
          key={`${title}-photo-${index}`}
          type="button"
          onClick={() => onOpenPhoto(photos, index, title)}
          className={`group relative overflow-hidden rounded-[10px] border border-line bg-[var(--s3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--water)] ${
            singlePhoto ? 'aspect-[16/9]' : 'aspect-[4/3]'
          }`}
          aria-label={`Agrandir la photo ${index + 1} sur ${photos.length}`}
        >
          <img
            src={apiUrl(url)}
            alt={`${title} — photo ${index + 1}`}
            loading="lazy"
            className="landing-cover-img transition-transform duration-300 group-hover:scale-105"
          />
        </button>
      ))}
    </div>
  );
};

interface LandingIncidentDetailProps {
  incident: PublicIncident;
  variant?: 'panel' | 'inline';
  onOpenPhoto: (photos: string[], index: number, title: string) => void;
}

export const LandingIncidentDetail: React.FC<LandingIncidentDetailProps> = ({
  incident,
  variant = 'panel',
  onOpenPhoto,
}) => {
  const typeLabel = INCIDENT_TYPE_LABELS[incident.type] || incident.type;
  const statutLabel = INCIDENT_STATUT_LABELS[incident.statut]?.label || incident.statut;
  const fiabiliteLabel =
    INCIDENT_FIABILITE_LABELS[incident.niveau_fiabilite] || incident.niveau_fiabilite;
  const height = formatHeight(incident.hauteur_eau_max_cm);
  const lastUpdate = formatTime(incident.maj_le || incident.cree_le);

  if (variant === 'inline') {
    return (
      <div className="flex flex-col gap-3 border-t border-line bg-[var(--s2)] p-4">
        <div className="grid grid-cols-2 gap-2">
          <MiniMetric label="Statut" value={statutLabel} />
          <MiniMetric
            label="Signalements"
            value={`${incident.nb_signalements} lié${incident.nb_signalements > 1 ? 's' : ''}`}
          />
        </div>

        <div className="flex flex-col gap-3">
          <DetailBlock title="Voies affectées" text={incident.routes_coupees} />
          <DetailBlock title="Dégâts signalés" text={incident.degats} />
          <DetailBlock title="Risques" text={incident.risques_sanitaires} />
        </div>

        <Photos
          photos={incident.photos}
          title={`${typeLabel} — ${incident.commune}`}
          compact
          onOpenPhoto={onOpenPhoto}
        />

        <div className="text-[12px] text-ink2">
          Dernière mise à jour à <span className="font-mono text-ink">{lastUpdate}</span>
        </div>
      </div>
    );
  }

  return (
    <aside
      className="overflow-hidden rounded-2xl border border-line bg-surface"
      aria-label="Détail de l'incident sélectionné"
    >
      <div className="flex flex-col gap-2.5 border-b border-line bg-[var(--s2)] p-6">
        <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink2">
          Détail de l'incident
        </span>
        <h3 className="font-display text-2xl font-extrabold leading-tight tracking-[-0.01em] text-ink">
          {typeLabel}
        </h3>
        <div className="text-[15px] text-ink2">
          <strong className="text-ink">{incident.commune}</strong> · signalé à{' '}
          <span className="font-mono text-ink">{formatTime(incident.cree_le)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-6">
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Hauteur d'eau max" value={height} mono />
          <Metric label="Signalements liés" value={String(incident.nb_signalements)} mono />
          <Metric label="Fiabilité" value={fiabiliteLabel} />
          <Metric label="Statut" value={statutLabel} />
        </div>

        <div className="flex flex-col gap-3.5">
          <DetailBlock title="Voies et routes affectées" text={incident.routes_coupees} />
          <DetailBlock title="Dégâts signalés" text={incident.degats} />
          <DetailBlock title="Risques sanitaires et réseau" text={incident.risques_sanitaires} />
        </div>

        <Photos
          photos={incident.photos}
          title={`${typeLabel} — ${incident.commune}`}
          onOpenPhoto={onOpenPhoto}
        />

        <div className="text-[13px] text-ink2">
          Dernière mise à jour à <span className="font-mono text-ink">{lastUpdate}</span>
        </div>
      </div>
    </aside>
  );
};
