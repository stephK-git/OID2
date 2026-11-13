import type { PublicIncident } from '../PublicIncidentCard';

export type Severity = 'critique' | 'route_coupee' | 'vigilance';

export const SEVERITY_META: Record<
  Severity,
  { label: string; bg: string; fg: string; bd: string }
> = {
  critique: { label: 'Critique', bg: '#fdecea', fg: '#b3261e', bd: '#f0b8b4' },
  route_coupee: { label: 'Route coupée', bg: '#fff3dc', fg: '#8a5300', bd: '#ecd09a' },
  vigilance: { label: 'Vigilance', bg: '#e6f0fb', fg: '#0b5fc4', bd: '#b9d3f1' },
};

export function severityOf(incident: PublicIncident): Severity {
  if (incident.danger_immediat || incident.categorie === 'critique') return 'critique';
  if (incident.categorie === 'route_coupee') return 'route_coupee';
  return 'vigilance';
}
