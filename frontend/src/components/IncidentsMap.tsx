import React from 'react';
import {
  SigAnalysisMap,
  type CommunesGeoJsonCollection,
} from './SigAnalysisMap';

export interface GeoJsonFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    id: number;
    type: string;
    statut: string;
    score_priorite: number;
    danger_immediat: boolean;
    reference_publique: string;
    zone_id?: number | null;
    commune?: string | null;
  };
}

export interface GeoJsonCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

export { type CommunesGeoJsonCollection };

export interface IncidentsMapProps {
  data: GeoJsonCollection | null;
  communesGeoJson?: CommunesGeoJsonCollection | null;
  selectedCommuneId?: number | string | null;
  onSelectCommuneId?: (id: string) => void;
  focusIncidentId?: number | null;
  onRequestAssign?: (incidentId: number) => void;
  onOpenIncidentDetail?: (incidentId: number) => void;
  totalCounts?: {
    tous: number;
    danger: number;
    ouverts: number;
    clotures: number;
    evalues?: number;
  };
}

const EMPTY_HOTSPOTS: any[] = [];
const EMPTY_VULN: any[] = [];
const EMPTY_SILENT: any[] = [];
const NOOP_HEX = () => {};

/**
 * IncidentsMap : Rendu opérationnel unifié basé directement sur SigAnalysisMap en mode "operationnel".
 */
export const IncidentsMap: React.FC<IncidentsMapProps> = ({
  data,
  communesGeoJson,
  selectedCommuneId,
  onSelectCommuneId,
  onRequestAssign,
  onOpenIncidentDetail,
}) => {
  return (
    <SigAnalysisMap
      mode="operationnel"
      communesGeoJson={communesGeoJson || null}
      maillesGeoJson={null}
      getisOrdGeoJson={null}
      hexThematique="densite"
      onChangeHexThematique={NOOP_HEX}
      hotspots={EMPTY_HOTSPOTS}
      vulnerabilities={EMPTY_VULN}
      silentZones={EMPTY_SILENT}
      incidentsGeoJson={data}
      sigMetadata={null}
      selectedZoneId={
        selectedCommuneId != null && selectedCommuneId !== '' && selectedCommuneId !== 'all'
          ? Number(selectedCommuneId)
          : ''
      }
      onSelectZoneId={(zid) => onSelectCommuneId && onSelectCommuneId(zid ? String(zid) : 'all')}
      focusTarget={null}
      onRequestAssign={onRequestAssign}
      onOpenIncidentDetail={onOpenIncidentDetail || onRequestAssign}
    />
  );
};
