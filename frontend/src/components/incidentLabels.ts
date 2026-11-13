export const INCIDENT_TYPE_LABELS: Record<string, string> = {
  rue: 'Rue inondée',
  route: 'Route submergée',
  habitation: 'Habitation inondée',
  cours_eau: 'Débordement de cours d’eau',
  'cours-d-eau': 'Cours d’eau en crue',
  ruissellement: 'Ruissellement / voirie',
  infrastructure: 'Ouvrage / voirie affectée',
  crue: 'Crue / montée des eaux',
  refoulement: 'Refoulement / égout',
  reseau: 'Saturation du réseau',
  lagunaire: 'Débordement lagunaire',
  submersion: 'Submersion',
  nappe: 'Remontée de nappe',
  voirie: 'Voirie submergée',
  autre: 'Incident hydrologique',
};

export const INCIDENT_STATUT_LABELS: Record<string, { label: string; cls: string }> = {
  ouvert: { label: 'Signalé', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  affecte: { label: 'En intervention', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  rouvert: { label: 'Réintervention', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  evalue: { label: 'Évalué terrain', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

export const INCIDENT_FIABILITE_LABELS: Record<string, string> = {
  confirme: 'Confirmé terrain',
  corrobore: 'Corroboré (multi-sources)',
  verifie: 'Vérifié',
  declare: 'Déclaré',
};

export function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return 'Récent';
  const ts = new Date(isoDate).getTime();
  if (Number.isNaN(ts)) return 'Récent';
  const diffMin = Math.max(1, Math.floor((Date.now() - ts) / 60000));
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  return `Il y a ${diffD} j`;
}
