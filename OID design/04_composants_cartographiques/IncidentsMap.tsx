import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix pour les icônes par défaut de Leaflet avec Vite/Webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface GeoJsonFeature {
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
  };
}

interface GeoJsonCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

interface IncidentsMapProps {
  data: GeoJsonCollection | null;
}

export const IncidentsMap: React.FC<IncidentsMapProps> = ({ data }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Centre par défaut sur Abidjan / région de démo
      const map = L.map(mapContainerRef.current).setView([5.35, -4.0], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Nettoyer les marqueurs précédents
    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker || layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });

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
          : '#0284c7';

        const circle = L.circleMarker([lat, lon], {
          radius: feat.properties.danger_immediat ? 12 : 9,
          fillColor: color,
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.85,
        });

        const popupContent = `
          <div style="font-family: sans-serif; font-size: 13px;">
            <strong style="font-size: 14px; color: #0b1f3a;">Incident #${feat.properties.id}</strong><br/>
            <span style="color: #64748b;">Réf : ${feat.properties.reference_publique.slice(0, 12)}...</span><br/>
            <strong>Type :</strong> ${feat.properties.type}<br/>
            <strong>Statut :</strong> <span style="font-weight: 700; color: ${color};">${feat.properties.statut.toUpperCase()}</span><br/>
            <strong>Priorité :</strong> ${feat.properties.score_priorite} pts<br/>
            ${
              feat.properties.danger_immediat
                ? '<strong style="color: #dc2626;">DANGER IMMÉDIAT DÉCLARÉ</strong>'
                : ''
            }
          </div>
        `;

        circle.bindPopup(popupContent);
        circle.addTo(map);
      });

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      }
    }
  }, [data]);

  return (
    <div className="map-wrapper card">
      <div className="map-legend">
        <span className="legend-item"><span className="legend-dot dot-danger"></span> Danger immédiat</span>
        <span className="legend-item"><span className="legend-dot dot-open"></span> Ouvert / Affecté</span>
        <span className="legend-item"><span className="legend-dot dot-success"></span> Évalué</span>
        <span className="legend-item"><span className="legend-dot dot-closed"></span> Clôturé</span>
      </div>
      <div ref={mapContainerRef} style={{ height: '480px', width: '100%', borderRadius: '12px' }} />
    </div>
  );
};
