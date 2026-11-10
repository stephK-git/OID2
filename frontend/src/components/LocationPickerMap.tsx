import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix pour les icônes de marqueurs Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface LocationPickerMapProps {
  lat: number;
  lon: number;
  onChange: (lat: number, lon: number) => void;
  communeLabel?: string;
}

export const LocationPickerMap: React.FC<LocationPickerMapProps> = ({
  lat,
  lon,
  onChange,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const isInternalUpdate = useRef(false);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        scrollWheelZoom: false,
        touchZoom: true,
        zoomControl: true,
      }).setView([lat, lon], 14);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
        className: 'oid-dark-map-tiles',
      }).addTo(map);

      // Icône radar tactile cyan conforme au template
      const pulseIcon = L.divIcon({
        className: 'oid-radar-marker',
        html: `
          <div class="oid-radar-pin-wrap">
            <span class="oid-radar-ping"></span>
            <span class="material-symbols-outlined oid-radar-pin-icon">location_pin</span>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 38],
      });

      const marker = L.marker([lat, lon], {
        draggable: true,
        icon: pulseIcon,
      }).addTo(map);

      marker.on('dragend', () => {
        const position = marker.getLatLng();
        isInternalUpdate.current = true;
        onChange(Number(position.lat.toFixed(6)), Number(position.lng.toFixed(6)));
      });

      map.on('click', (e: L.LeafletMouseEvent) => {
        const newLat = Number(e.latlng.lat.toFixed(6));
        const newLon = Number(e.latlng.lng.toFixed(6));
        marker.setLatLng([newLat, newLon]);
        isInternalUpdate.current = true;
        onChange(newLat, newLon);
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;

      // Invalidation automatique de la taille sur redimensionnement ou rotation d'écran mobile
      const handleResize = () => {
        map.invalidateSize();
      };
      window.addEventListener('resize', handleResize);
      window.addEventListener('orientationchange', handleResize);

      // Délai pour assurer un affichage parfait des tuiles après rendu initial
      setTimeout(() => map.invalidateSize(), 200);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('orientationchange', handleResize);
        map.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      };
    }
  }, []);

  // Synchronisation si la position change depuis l'extérieur (ex : GPS cliqué)
  useEffect(() => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }

    if (mapInstanceRef.current && markerRef.current) {
      const currentPos = markerRef.current.getLatLng();
      if (Math.abs(currentPos.lat - lat) > 0.0001 || Math.abs(currentPos.lng - lon) > 0.0001) {
        markerRef.current.setLatLng([lat, lon]);
        mapInstanceRef.current.setView([lat, lon], 15, { animate: true });
      }
    }
  }, [lat, lon]);

  return (
    <div className="oid-map-frame">
      <div
        ref={mapContainerRef}
        className="oid-map-canvas"
        style={{ width: '100%', borderRadius: '12px', zIndex: 1 }}
      />
    </div>
  );
};
