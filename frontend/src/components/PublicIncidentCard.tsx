import React, { useState } from 'react';
import { ChevronDown, Camera, MapPin, Droplets, AlertTriangle, Route, LocateFixed } from 'lucide-react';
import { apiUrl } from '../api/client';
import {
  INCIDENT_FIABILITE_LABELS,
  INCIDENT_STATUT_LABELS,
  INCIDENT_TYPE_LABELS,
  formatRelativeTime,
} from './incidentLabels';

export interface PublicIncident {
  id: number;
  type: string;
  statut: string;
  niveau_fiabilite: string;
  danger_immediat: boolean;
  categorie: 'critique' | 'vigilance' | 'route_coupee';
  commune: string;
  zone_id: number | null;
  nb_signalements: number;
  hauteur_eau_max_cm: number | null;
  routes_coupees: string | null;
  degats: string | null;
  risques_sanitaires: string | null;
  photos: string[];
  lat?: number | null;
  lon?: number | null;
  cree_le: string | null;
  maj_le: string | null;
}

function formatExactTime(isoDate: string | null): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getCategorieBadge(
  categorie: PublicIncident['categorie'],
  dangerImmediat: boolean
): { label: string; cls: string; dotCls: string } {
  if (dangerImmediat || categorie === 'critique') {
    return {
      label: dangerImmediat ? 'Danger immédiat' : 'Critique',
      cls: 'bg-red-50 text-red-700 border-red-200',
      dotCls: 'bg-red-500',
    };
  }
  if (categorie === 'route_coupee') {
    return {
      label: 'Route coupée',
      cls: 'bg-amber-50 text-amber-800 border-amber-200',
      dotCls: 'bg-amber-500',
    };
  }
  return {
    label: 'Vigilance',
    cls: 'bg-sky-50 text-sky-700 border-sky-200',
    dotCls: 'bg-sky-500',
  };
}

interface PublicIncidentCardProps {
  incident: PublicIncident;
  defaultExpanded?: boolean;
  onOpenPhoto: (photos: string[], index: number, title: string) => void;
  onLocate?: (incident: PublicIncident) => void;
}

export const PublicIncidentCard: React.FC<PublicIncidentCardProps> = ({
  incident,
  defaultExpanded = false,
  onOpenPhoto,
  onLocate,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const typeLabel = INCIDENT_TYPE_LABELS[incident.type] || incident.type;
  const catBadge = getCategorieBadge(incident.categorie, incident.danger_immediat);
  const statutBadge = INCIDENT_STATUT_LABELS[incident.statut] || {
    label: incident.statut,
    cls: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  const fiabiliteLabel =
    INCIDENT_FIABILITE_LABELS[incident.niveau_fiabilite] || incident.niveau_fiabilite;

  return (
    <article className="rounded-2xl bg-surface border border-line shadow-sm overflow-hidden transition hover:border-slate-300">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="w-full text-left p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface2/40 transition"
      >
        <div className="flex items-start gap-3 min-w-0">
          <span
            className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${catBadge.dotCls}`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display font-bold text-base sm:text-lg text-ink leading-snug">
                {typeLabel}
              </h3>
              {incident.photos.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-surface2 text-ink2 border border-line">
                  <Camera size={12} aria-hidden="true" />
                  <span>
                    {incident.photos.length} photo{incident.photos.length > 1 ? 's' : ''}
                  </span>
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-ink2">
              <span className="inline-flex items-center gap-1 font-medium text-ink">
                <MapPin size={13} className="text-accent shrink-0" aria-hidden="true" />
                {incident.commune}
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatRelativeTime(incident.cree_le)}</span>
              {incident.hauteur_eau_max_cm != null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Droplets size={13} className="text-accent shrink-0" aria-hidden="true" />
                    ~{Math.round(incident.hauteur_eau_max_cm)} cm
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pl-5 sm:pl-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${catBadge.cls}`}>
              {catBadge.label}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statutBadge.cls}`}>
              {statutBadge.label}
            </span>
          </div>
          <ChevronDown
            size={18}
            className={`text-ink2 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </div>
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-5 pt-3 border-t border-line bg-surface2/35 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-surface border border-line">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-ink2">
                Fiabilité
              </span>
              <span className="mt-1 block font-semibold text-ink">{fiabiliteLabel}</span>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-line">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-ink2">
                Signalements liés
              </span>
              <span className="mt-1 block font-semibold text-ink">
                {incident.nb_signalements} remontée{incident.nb_signalements > 1 ? 's' : ''}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-line">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-ink2">
                Hauteur d&apos;eau max
              </span>
              <span className="mt-1 block font-semibold text-ink">
                {incident.hauteur_eau_max_cm != null
                  ? `~${Math.round(incident.hauteur_eau_max_cm)} cm`
                  : 'Non précisée'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-line">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-ink2">
                Dernière mise à jour
              </span>
              <span className="mt-1 block font-semibold text-ink">
                {formatExactTime(incident.maj_le || incident.cree_le)}
              </span>
            </div>
          </div>

          {(incident.routes_coupees || incident.degats || incident.risques_sanitaires) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {incident.routes_coupees && (
                <div className="p-3.5 rounded-xl bg-surface border border-line space-y-1">
                  <span className="inline-flex items-center gap-1.5 font-bold text-ink">
                    <Route size={14} className="text-amber-600" aria-hidden="true" />
                    Voies / routes affectées
                  </span>
                  <p className="text-ink2 leading-relaxed">{incident.routes_coupees}</p>
                </div>
              )}
              {incident.degats && (
                <div className="p-3.5 rounded-xl bg-surface border border-line space-y-1">
                  <span className="inline-flex items-center gap-1.5 font-bold text-ink">
                    <AlertTriangle size={14} className="text-accent" aria-hidden="true" />
                    Dégâts matériels signalés
                  </span>
                  <p className="text-ink2 leading-relaxed">{incident.degats}</p>
                </div>
              )}
              {incident.risques_sanitaires && (
                <div className="p-3.5 rounded-xl bg-surface border border-line space-y-1">
                  <span className="inline-flex items-center gap-1.5 font-bold text-ink">
                    <Droplets size={14} className="text-sky-600" aria-hidden="true" />
                    Risques sanitaires / réseau
                  </span>
                  <p className="text-ink2 leading-relaxed">{incident.risques_sanitaires}</p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <span className="block text-xs font-bold uppercase tracking-wider text-ink2">
              Photos prises sur place
            </span>
            {incident.photos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
                {incident.photos.map((url, idx) => (
                  <button
                    key={`${incident.id}-photo-${idx}`}
                    type="button"
                    onClick={() => onOpenPhoto(incident.photos, idx, `${typeLabel} — ${incident.commune}`)}
                    className="group relative aspect-[4/3] w-full sm:w-40 shrink-0 rounded-xl overflow-hidden border border-line bg-slate-900 focus:outline-none focus:ring-2 focus:ring-accent"
                    aria-label={`Agrandir la photo ${idx + 1} sur ${incident.photos.length}`}
                  >
                    <img
                      src={apiUrl(url)}
                      alt={`${typeLabel} à ${incident.commune} (${idx + 1})`}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <span className="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/35 transition flex items-end justify-end p-2">
                      <span className="opacity-0 group-hover:opacity-100 transition px-2 py-0.5 rounded-md bg-slate-950/80 text-white text-[11px] font-semibold">
                        Agrandir
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink2 italic">Aucune photo publiée pour cet incident.</p>
            )}
          </div>

          {onLocate && (
            <div className="flex items-center justify-end pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => onLocate(incident)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold border border-[var(--water)] bg-surface text-[var(--water)] hover:bg-[var(--water)] hover:text-white transition"
              >
                <LocateFixed size={15} aria-hidden="true" />
                <span>Localiser</span>
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
};

