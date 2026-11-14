import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { IncidentItem } from './types';

/** Lit une variable CSS du thème courant (les couches Leaflet n'acceptent pas var()). */
const readToken = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

export const IncidentMiniMap: React.FC<{
  incident: IncidentItem;
  communeLabel: string;
}> = ({ incident, communeLabel }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || !incident.coords) return;

    if (!mapRef.current) {
      const map = L.map(containerRef.current, {
        scrollWheelZoom: false,
        zoomControl: true,
      }).setView([incident.coords.lat, incident.coords.lon], 15);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      layerGroupRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
    }

    const map = mapRef.current;
    const lg = layerGroupRef.current;
    if (!map || !lg) return;

    lg.clearLayers();
    const { lat, lon } = incident.coords;
    map.setView([lat, lon], 15, { animate: true });

    const water = readToken('--water', '#0b5fc4');
    const ok = readToken('--ok', '#0b7a4f');
    const crit = readToken('--crit', '#b3261e');
    const surface = readToken('--s1', '#ffffff');

    L.circle([lat, lon], {
      radius: 400,
      color: incident.danger_immediat ? crit : water,
      weight: 1.5,
      dashArray: '5, 6',
      fillColor: incident.danger_immediat ? crit : water,
      fillOpacity: 0.08,
    }).addTo(lg);

    L.circleMarker([lat, lon], {
      radius: 9,
      color: surface,
      fillColor: incident.danger_immediat ? crit : incident.statut === 'evalue' ? ok : water,
      fillOpacity: 1,
      weight: 2.5,
    })
      .bindPopup(`<strong>Incident #${incident.id}</strong><br/>${communeLabel}`)
      .addTo(lg);
  }, [incident, communeLabel]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return <div ref={containerRef} style={{ height: '205px', width: '100%' }} />;
};
