import React from 'react';
import type { IncidentItem, ZoneItem } from './types';

export const ROLE_LABELS: Record<string, string> = {
  coordinateur: 'Coordinateur',
  verificateur: 'Vérificateur',
  enqueteur: 'Enquêteur terrain',
};

/** Statuts considérés comme « en cours » (ni évalués ni clôturés). */
export const ACTIVE_STATUSES = ['ouvert', 'affecte', 'rouvert'];

/** Délais de traitement, alignés sur le calcul du backend (/coordination/stats). */
export const SLA_CRITIQUE_MS = 15 * 60 * 1000;
export const SLA_STANDARD_MS = 2 * 60 * 60 * 1000;

export const formatIncidentType = (raw: string): string => {
  if (!raw) return 'Non spécifié';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
};

export const getIncidentTypeMeta = (raw: string): { title: string; sub: string } => {
  const t = (raw || '').toLowerCase();
  if (t.includes('habitation') || t.includes('maison') || t.includes('domicile')) {
    return { title: 'Inondation de habitation / Voirie', sub: 'Submersion résidentielle & accès' };
  }
  if (t.includes('route') || t.includes('voirie') || t.includes('axe') || t.includes('pont')) {
    return { title: 'Submersion de voirie & Axe coupé', sub: 'Rupture de trafic routier' };
  }
  if (t.includes('caniveau') || t.includes('ouvrage') || t.includes('drain')) {
    return { title: "Débordement d'ouvrage de drainage", sub: 'Saturation canalisation / collecteur' };
  }
  if (t.includes('eboulement') || t.includes('glissement')) {
    return { title: 'Glissement de terrain / Érosion', sub: 'Instabilité géotechnique de talus' };
  }
  return { title: formatIncidentType(raw), sub: 'Aléa hydrométéorologique urbain' };
};

export const getWaterHeightContext = (cm: number | null | undefined): string => {
  if (cm == null || cm <= 0) return 'Niveau non mesuré sur site';
  if (cm >= 100) return 'Seuil critique de submersion (> 1 m)';
  if (cm >= 50) return 'Circulation impossible & risque électrique';
  if (cm >= 20) return 'Franchissement piéton et berline difficile';
  return "Lame d'eau superficielle de ruissellement";
};

export const formatRelativeTime = (iso: string | null | undefined): string => {
  if (!iso) return 'Récemment';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.max(1, Math.round(diffMs / 60000));
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
};

/** Durée lisible (« 3 h 20 », « 2 j 4 h », « 12 min »). */
export const formatDuration = (ms: number): string => {
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${String(min % 60).padStart(2, '0')}`;
  return `${Math.floor(h / 24)} j ${h % 24} h`;
};

export const formatShortDate = (iso: string | null): string => {
  if (!iso) return 'Date non renseignée';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

export const getFiabilitePresentation = (raw: string | null | undefined, statut: string) => {
  if (statut === 'cloture') return { label: '100% Clôturé', cls: 'text-muted-oid' };
  if (statut === 'evalue') return { label: '100% Vérifié', cls: 'text-mint' };
  const f = (raw || '').toLowerCase();
  if (f.includes('confir') || f.includes('elev') || f.includes('élev') || f.includes('haute')) {
    return { label: '96% Confirmé', cls: 'text-mint' };
  }
  if (f.includes('corrob')) {
    return { label: '90% Corroboré', cls: 'text-mint' };
  }
  return { label: '85% Déclaré', cls: 'text-sky' };
};

export const resolveIncidentCommune = (inc: IncidentItem, zones: ZoneItem[]): string => {
  if (inc.commune) return inc.commune;
  if (inc.zone_id) {
    const z = zones.find((zn) => zn.id === inc.zone_id);
    if (z) return z.nom;
  }
  return 'District Autonome d’Abidjan';
};

export const needsAssignment = (inc: IncidentItem): boolean =>
  ['ouvert', 'rouvert'].includes(inc.statut) && !inc.enqueteur_id;

export function urgentCount(list: IncidentItem[]): number {
  return list.filter((i) => i.danger_immediat && i.statut !== 'cloture').length;
}

/** Incidents qui attendent une action du coordinateur : danger vital actif ou dossier sans enquêteur. */
export function aTraiterCount(list: IncidentItem[]): number {
  return list.filter(
    (i) => i.statut !== 'cloture' && (i.danger_immediat || needsAssignment(i))
  ).length;
}

/** Retard de traitement en ms (0 si dans les délais ou non concerné). */
export const slaOverrunMs = (inc: IncidentItem, now = Date.now()): number => {
  if (!ACTIVE_STATUSES.includes(inc.statut) || !inc.cree_le) return 0;
  const age = now - new Date(inc.cree_le).getTime();
  const limit = inc.danger_immediat ? SLA_CRITIQUE_MS : SLA_STANDARD_MS;
  return age > limit ? age - limit : 0;
};

export const WaterGauge: React.FC<{ cm: number | null | undefined }> = ({ cm }) => {
  if (cm == null || cm <= 0) {
    return <span style={{ color: 'var(--tx3)' }}>—</span>;
  }
  const pct = Math.min(100, Math.round((cm / 150) * 100));
  const cls = cm >= 100 ? 'crit' : cm >= 50 ? 'warn' : '';
  const label = cm >= 150 ? 'toiture' : cm >= 100 ? 'taille' : cm >= 50 ? 'genou' : 'sol';
  return (
    <div className="gauge" title={`Hauteur d'eau: ${cm} cm`}>
      <div className="t">
        <span>{cm} cm</span>
        <span style={{ color: 'var(--tx3)', fontSize: '11px' }}>{label}</span>
      </div>
      <div className="bar">
        <i className={cls} style={{ width: `${pct}%` }} />
        <u style={{ left: '33.33%' }} title="50 cm (genou)" />
        <u style={{ left: '66.66%' }} title="100 cm (taille)" />
      </div>
    </div>
  );
};

export const IncidentStatusBadge: React.FC<{ statut: string }> = ({ statut }) => {
  const s = (statut || 'ouvert').toLowerCase();
  if (s === 'evalue') {
    return (
      <span className="chip ok">
        <i className="dot" />
        Évalué
      </span>
    );
  }
  if (s === 'affecte') {
    return (
      <span className="chip water">
        <i className="dot" style={{ background: 'var(--water)' }} />
        Affecté
      </span>
    );
  }
  if (s === 'cloture') {
    return (
      <span className="chip">
        <i className="dot" style={{ background: 'var(--tx3)' }} />
        Clôturé
      </span>
    );
  }
  return (
    <span className="chip warn">
      <i className="dot warn" />
      {s === 'rouvert' ? 'Rouvert' : 'Ouvert'}
    </span>
  );
};
