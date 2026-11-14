import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface ItineraryMapProps {
  destination: { lat: number; lon: number };
  label?: string;
  onClose: () => void;
}

interface RouteInfo {
  distanceKm: number;
  durationMin: number | null;
  approximate: boolean;
}

const dot = (cls: string) =>
  L.divIcon({
    className: '',
    html: `<span class="oid-itin-dot ${cls}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

/** Carte d'itinéraire intégrée : position de l'agent, destination et tracé routier (OSRM). */
export const ItineraryMap: React.FC<ItineraryMapProps> = ({ destination, label, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const meRef = useRef<L.Marker | null>(null);
  const routeRef = useRef<L.Polyline | null>(null);
  const lastRouteFrom = useRef<L.LatLng | null>(null);
  const [status, setStatus] = useState<'locating' | 'ready' | 'denied'>('locating');
  const [info, setInfo] = useState<RouteInfo | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!containerRef.current) return;
    const dest = L.latLng(destination.lat, destination.lon);
    const map = L.map(containerRef.current, { zoomControl: true }).setView(dest, 15);
    mapRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    L.marker(dest, { icon: dot('is-dest') }).addTo(map).bindTooltip(label || 'Destination');
    setTimeout(() => map.invalidateSize(), 200);

    let cancelled = false;
    const drawRoute = async (from: L.LatLng) => {
      // évite de relancer le calcul pour un déplacement de moins de 40 m
      if (lastRouteFrom.current && lastRouteFrom.current.distanceTo(from) < 40) return;
      lastRouteFrom.current = from;
      const straightKm = from.distanceTo(dest) / 1000;
      let coords: L.LatLngTuple[] = [
        [from.lat, from.lng],
        [dest.lat, dest.lng],
      ];
      let next: RouteInfo = { distanceKm: straightKm, durationMin: null, approximate: true };
      try {
        const ctrl = new AbortController();
        const t = window.setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`,
          { signal: ctrl.signal }
        );
        window.clearTimeout(t);
        const data = await res.json();
        const r = data?.routes?.[0];
        if (r) {
          coords = r.geometry.coordinates.map(([x, y]: [number, number]) => [y, x] as L.LatLngTuple);
          next = { distanceKm: r.distance / 1000, durationMin: Math.round(r.duration / 60), approximate: false };
        }
      } catch {
        /* repli : ligne droite */
      }
      if (cancelled) return;
      routeRef.current?.remove();
      routeRef.current = L.polyline(coords, {
        color: next.approximate ? '#5b7389' : '#0b5fc4',
        weight: 5,
        opacity: 0.85,
        dashArray: next.approximate ? '8 8' : undefined,
      }).addTo(map);
      map.fitBounds(routeRef.current.getBounds(), { padding: [40, 40] });
      setInfo(next);
    };

    let watchId: number | null = null;
    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const here = L.latLng(pos.coords.latitude, pos.coords.longitude);
          if (!meRef.current) meRef.current = L.marker(here, { icon: dot('is-me') }).addTo(map).bindTooltip('Vous');
          else meRef.current.setLatLng(here);
          setStatus('ready');
          void drawRoute(here);
        },
        () => setStatus('denied'),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
    } else {
      setStatus('denied');
    }

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      map.remove();
      mapRef.current = null;
      meRef.current = null;
      routeRef.current = null;
      lastRouteFrom.current = null;
    };
  }, [destination.lat, destination.lon, label]);

  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    if (routeRef.current) map.fitBounds(routeRef.current.getBounds(), { padding: [40, 40] });
    else map.setView([destination.lat, destination.lon], 15);
  };

  return (
    <div className="oid-itin-overlay" role="dialog" aria-modal="true" aria-label="Itinéraire vers le dossier">
      <div className="oid-itin-panel">
        <div className="oid-itin-head">
          <div className="oid-itin-title">
            <span className="material-symbols-outlined">navigation</span>
            <span>Itinéraire{label ? ` · ${label}` : ''}</span>
          </div>
          <button type="button" className="oid-itin-close" onClick={onClose} aria-label="Fermer la carte">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="oid-itin-status" role="status">
          {status === 'locating' && 'Recherche de votre position…'}
          {status === 'denied' &&
            'Position indisponible : autorisez la localisation pour voir le tracé. La destination reste affichée.'}
          {status === 'ready' && info && (
            <>
              <strong>{info.distanceKm.toFixed(1)} km</strong>
              {info.durationMin != null && <> · environ {info.durationMin} min en voiture</>}
              {info.approximate && <> · tracé à vol d’oiseau (itinéraire routier indisponible)</>}
            </>
          )}
          {status === 'ready' && !info && 'Calcul de l’itinéraire…'}
        </div>
        <div className="oid-itin-map-wrap">
          <div ref={containerRef} className="oid-itin-map" />
          <button type="button" className="oid-itin-recenter" onClick={recenter}>
            <span className="material-symbols-outlined">my_location</span>
            <span>Recentrer</span>
          </button>
        </div>
      </div>
    </div>
  );
};
