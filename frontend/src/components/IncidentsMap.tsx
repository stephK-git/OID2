import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export interface GeoJsonFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
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

interface IncidentsMapProps {
  data: GeoJsonCollection | null;
  focusIncidentId?: number | null;
  onRequestAssign?: (incidentId: number) => void;
  totalCounts?: {
    tous: number;
    danger: number;
    ouverts: number;
    clotures: number;
  };
}

export const IncidentsMap: React.FC<IncidentsMapProps> = ({
  data,
  focusIncidentId,
  onRequestAssign,
  totalCounts,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersByIdRef = useRef<Record<number, L.CircleMarker>>({});
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number }>({
    lat: 5.3599,
    lon: -4.0083,
  });
  const [clustersEnabled, setClustersEnabled] = useState(true);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
      }).setView([5.35, -4.008], 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
        className: 'oid-dark-map-tiles',
      }).addTo(map);

      map.on('mousemove', (e: L.LeafletMouseEvent) => {
        setCursorCoords({
          lat: Number(e.latlng.lat.toFixed(4)),
          lon: Number(e.latlng.lng.toFixed(4)),
        });
      });

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker || layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });
    markersByIdRef.current = {};

    if (data && data.features.length > 0) {
      const bounds: [number, number][] = [];

      data.features.forEach((feat) => {
        const [lon, lat] = feat.geometry.coordinates;
        if (typeof lat !== 'number' || typeof lon !== 'number') return;

        bounds.push([lat, lon]);

        const color = feat.properties.danger_immediat
          ? '#dc2626'
          : feat.properties.statut === 'cloture'
          ? '#64748b'
          : feat.properties.statut === 'evalue'
          ? '#16a34a'
          : '#00e5ff';

        const circle = L.circleMarker([lat, lon], {
          radius: feat.properties.danger_immediat ? 11.5 : 8.5,
          fillColor: color,
          color: '#ffffff',
          weight: 2.2,
          opacity: 1,
          fillOpacity: 0.92,
        });

        const popupHtml = `
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; color: #d4e4fa; background: #1c2b3c; border: 1px solid rgba(0,229,255,0.3); border-radius: 12px; padding: 12px; min-width: 245px; box-shadow: 0 12px 32px rgba(0,0,0,0.55);">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding-bottom: 6px; border-bottom: 1px solid rgba(132,147,150,0.22);">
              <div>
                <div style="font-weight: 800; font-size: 14px; color: #d4e4fa;">Incident #${feat.properties.id} (${feat.properties.type})</div>
                <div style="font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: #849396;">Réf : ${feat.properties.reference_publique.slice(0, 16).toUpperCase()}</div>
              </div>
            </div>
            ${
              feat.properties.danger_immediat
                ? `<div style="margin-top: 8px; padding: 6px 8px; border-radius: 6px; background: #93000a; color: #ffdad6; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; font-weight: 700;">
                    ⚠ DANGER IMMÉDIAT DÉCLARÉ — ÉVACUATION / SECOURS PRIORITAIRE
                  </div>`
                : ''
            }
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px;">
              <div style="background: #122131; padding: 6px 8px; border-radius: 6px;">
                <div style="font-size: 9.5px; color: #849396;">STATUT ACTUEL</div>
                <div style="font-weight: 700; color: ${color}; text-transform: uppercase; margin-top: 2px;">${feat.properties.statut}</div>
              </div>
              <div style="background: #122131; padding: 6px 8px; border-radius: 6px;">
                <div style="font-size: 9.5px; color: #849396;">PRIORITÉ O.I.D</div>
                <div style="font-weight: 700; color: ${feat.properties.danger_immediat ? '#ffb4ab' : '#00e5ff'}; margin-top: 2px;">${feat.properties.score_priorite} pts</div>
              </div>
            </div>
            <div style="margin-top: 8px; font-size: 11.5px; color: #bac9cc;">
              📍 WGS84 : ${lat.toFixed(4)}° N, ${lon.toFixed(4)}° W
            </div>
            <div style="margin-top: 10px; display: flex; gap: 6px;">
              <a href="/incidents/${feat.properties.id}" style="flex: 1; text-align: center; text-decoration: none; background: #00e5ff; color: #001f24; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; padding: 7px 10px; border-radius: 6px;">
                Ouvrir Dossier #${feat.properties.id}
              </a>
            </div>
          </div>
        `;

        circle.bindPopup(popupHtml, { className: 'oid-tactical-leaflet-popup' });
        circle.on('click', () => {
          if (onRequestAssign) {
            onRequestAssign(feat.properties.id);
          }
        });
        circle.addTo(map);
        markersByIdRef.current[feat.properties.id] = circle;
      });

      if (bounds.length > 0 && !focusIncidentId) {
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
      }
    }
  }, [data]);

  useEffect(() => {
    if (!focusIncidentId || !mapInstanceRef.current) return;
    const marker = markersByIdRef.current[focusIncidentId];
    if (marker) {
      const ll = marker.getLatLng();
      mapInstanceRef.current.setView(ll, 15, { animate: true });
      marker.openPopup();
    }
  }, [focusIncidentId]);

  const feats = data?.features || [];
  const counts = totalCounts || {
    tous: feats.length,
    danger: feats.filter((f) => f.properties.danger_immediat).length,
    ouverts: feats.filter((f) => ['ouvert', 'affecte', 'rouvert'].includes(f.properties.statut)).length,
    clotures: feats.filter((f) => f.properties.statut === 'cloture').length,
  };

  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();
  const handleRecenter = () => mapInstanceRef.current?.setView([5.35, -4.008], 12, { animate: true });

  return (
    <div className="oid-coord-map-shell">
      <div className="oid-coord-map-canvas-wrap">
        {/* Contrôles tactiques en haut à gauche */}
        <div className="oid-coord-map-controls">
          <div className="oid-coord-zoom-group">
            <button type="button" onClick={handleZoomIn} aria-label="Zoomer sur la carte">
              <span className="material-symbols-outlined">add</span>
            </button>
            <div className="oid-coord-zoom-divider" />
            <button type="button" onClick={handleZoomOut} aria-label="Dézoomer sur la carte">
              <span className="material-symbols-outlined">remove</span>
            </button>
          </div>
          <button
            type="button"
            onClick={handleRecenter}
            className="oid-coord-map-ctrl-btn primary"
            title="Recentrer sur le District d'Abidjan"
          >
            <span className="material-symbols-outlined">my_location</span>
          </button>
        </div>

        {/* Badge radio / coordonnées en haut à droite */}
        <div className="oid-coord-map-telemetry">
          <div className="oid-coord-vhf-pill">
            <span className="oid-ping-cyan" />
            <span>ÉCOUTE VHF / GSM : ACTIVE</span>
          </div>
          <span className="oid-coord-telemetry-sep">|</span>
          <span className="oid-coord-telemetry-coords">
            Lat: {cursorCoords.lat.toFixed(4)}° N · Lon: {cursorCoords.lon.toFixed(4)}° W
          </span>
        </div>

        {/* Canvas Leaflet */}
        <div ref={mapContainerRef} style={{ height: '560px', width: '100%' }} />
      </div>

      {/* Bandeau Récapitulatif Inférieur en Direct */}
      <div className="oid-coord-map-footer">
        <div className="oid-coord-map-stats">
          <div className="oid-coord-map-stat">
            <strong>{counts.tous}</strong>
            <span>incidents cartographiés</span>
          </div>
          <span className="oid-coord-dot-sep">•</span>
          <div className="oid-coord-map-stat">
            <span className="oid-dot bg-coral" />
            <strong className="text-coral">{counts.danger}</strong>
            <span>avec danger immédiat</span>
          </div>
          <span className="oid-coord-dot-sep">•</span>
          <div className="oid-coord-map-stat">
            <span className="oid-dot bg-cyan" />
            <strong className="text-cyan">{counts.ouverts}</strong>
            <span>en cours d'intervention</span>
          </div>
          <span className="oid-coord-dot-sep">•</span>
          <div className="oid-coord-map-stat">
            <span className="oid-dot bg-slate" />
            <strong>{counts.clotures}</strong>
            <span>clôturés</span>
          </div>
        </div>

        <div className="oid-coord-map-footer-right">
          <label className="oid-coord-cluster-toggle">
            <input
              type="checkbox"
              checked={clustersEnabled}
              onChange={(e) => setClustersEnabled(e.target.checked)}
            />
            <span>Clusters dynamiques</span>
          </label>
          <span className="oid-coord-telemetry-badge">Flux Télémétrie 1.2s</span>
        </div>
      </div>
    </div>
  );
};
