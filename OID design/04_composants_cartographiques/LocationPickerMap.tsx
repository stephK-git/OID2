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
}

export const LocationPickerMap: React.FC<LocationPickerMapProps> = ({ lat, lon, onChange }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const isInternalUpdate = useRef(false);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        scrollWheelZoom: 'center',
      }).setView([lat, lon], 14);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // Création du marqueur déplaçable
      const marker = L.marker([lat, lon], {
        draggable: true,
      }).addTo(map);

      marker.bindPopup('<strong>Point de signalement</strong><br/>Déplacez-moi pour affiner la position').openPopup();

      marker.on('dragend', () => {
        const position = marker.getLatLng();
        isInternalUpdate.current = true;
        onChange(Number(position.lat.toFixed(6)), Number(position.lng.toFixed(6)));
      });

      // Clic sur la carte pour déplacer le repère
      map.on('click', (e: L.LeafletMouseEvent) => {
        const newLat = Number(e.latlng.lat.toFixed(6));
        const newLon = Number(e.latlng.lng.toFixed(6));
        marker.setLatLng([newLat, newLon]);
        marker.openPopup();
        isInternalUpdate.current = true;
        onChange(newLat, newLon);
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;
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
    <div className="location-picker-container">
      <div className="picker-map-hint">
        <span>📍 <strong>Pointage sur carte :</strong> Cliquez n'importe où sur la carte ou déplacez le repère pour positionner l'inondation.</span>
      </div>
      <div
        ref={mapContainerRef}
        style={{ height: '320px', width: '100%', borderRadius: '10px', zIndex: 1 }}
      />
    </div>
  );
};

