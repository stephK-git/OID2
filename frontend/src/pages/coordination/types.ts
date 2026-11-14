export interface StatsData {
  incidents: number;
  ouverts: number;
  evalues: number;
  couverture: string;
  retard_critique: number;
  retard_standard: number;
  retards_total: number;
  menages_touches: number;
  personnes_affectees: number;
  blesses: number;
  deplaces: number;
  deces: number;
  disparus: number;
}

export interface PhotoMetaItem {
  url: string;
  filename: string;
  taille_octets: number;
  taille_formatee: string;
  format: string;
  exif_present: boolean;
  exif_gps: boolean;
}

export interface LinkedSignalementItem {
  id: number;
  reference_suivi: string;
  type: string;
  hauteur_eau_cm: number | null;
  gravite: string;
  danger_immediat: boolean;
  danger_type: string | null;
  description: string | null;
  statut: string;
  cree_le: string | null;
  photos?: string[];
  photos_meta?: PhotoMetaItem[];
}

export interface IncidentEvaluationData {
  id: number;
  statut: string;
  menages_touches: number;
  personnes_affectees: number;
  blesses: number;
  deplaces: number;
  deces: number;
  disparus: number;
  degats: string | null;
  routes_coupees: string | null;
  risques_sanitaires: string | null;
  besoins: string | null;
  recommandations: string | null;
  soumise_le: string | null;
  photos?: string[];
  photos_meta?: PhotoMetaItem[];
}

export interface IncidentItem {
  id: number;
  reference_publique: string;
  type: string;
  statut: string;
  score_priorite: number;
  niveau_fiabilite: string;
  enqueteur_id: number | null;
  enqueteur_nom?: string | null;
  danger_immediat: boolean;
  cree_le: string | null;
  maj_le?: string | null;
  cloture_le?: string | null;
  zone_id?: number | null;
  commune?: string | null;
  code_adm?: string | null;
  coords?: { lat: number; lon: number } | null;
  nb_signalements?: number;
  hauteur_eau_max_cm?: number | null;
  gravite_max?: string;
  description_synthese?: string | null;
  signalements_lies?: LinkedSignalementItem[];
  evaluation?: IncidentEvaluationData | null;
}

export interface EnqueteurItem {
  id: number;
  nom: string;
  email: string;
  zone_id?: number | null;
  zone_nom?: string | null;
  dossiers_actifs: number;
}

export interface ZoneItem {
  id: number;
  nom: string;
}

export interface UtilisateurItem {
  id: number;
  nom: string;
  email: string;
  role: string;
  actif: boolean;
  zone_id: number | null;
  derniere_connexion: string | null;
  dossiers_actifs: number;
}

export type CoordTab = 'kpis' | 'carte' | 'incidents' | 'historique' | 'utilisateurs';
export type MapQuickFilter = 'tous' | 'danger' | 'ouverts' | 'evalues' | 'clotures';
export type IncidentStatusFilter =
  | 'tous'
  | 'a_affecter'
  | 'ouverts'
  | 'affectes'
  | 'evalues'
  | 'clotures'
  | 'danger';
export type IncidentSortKey = 'priorite' | 'date';
export type UserRoleFilter = 'tous' | 'coordinateur' | 'verificateur' | 'enqueteur';

/** Données partagées par tous les onglets, chargées par la page. */
export interface CoordData {
  stats: StatsData | null;
  incidents: IncidentItem[];
  enqueteurs: EnqueteurItem[];
  zones: ZoneItem[];
}
