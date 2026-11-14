import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Severity } from './severity';
import { prefersReducedMotion } from './useLandingMotion';

export interface LandingMapPoint {
  id: number;
  lat: number;
  lon: number;
  severity: Severity;
  title: string;
  commune: string;
}

interface LandingMapProps {
  points: LandingMapPoint[];
  filter: Severity | 'all';
  selectedId: number | null;
  onSelect: (id: number) => void;
}

const ABIDJAN_CENTER: [number, number] = [5.3484, -4.0244];

/** Ordre d'arrivée des repères : vigilance d'abord, critiques en dernier. */
const DROP_ORDER: Record<Severity, number> = { vigilance: 0, route_coupee: 1, critique: 2 };

function pinIcon(severity: Severity, dropDelay: number | null): L.DivIcon {
  const size = severity === 'critique' ? 22 : 18;
  const drop = dropDelay !== null;
  return L.divIcon({
    className: 'landing-pin-host',
    html:
      `<span class="landing-pin landing-pin--${severity}${drop ? ' is-dropping' : ''}">` +
      `<span class="landing-pin-drop"${drop ? ` style="animation-delay:${dropDelay}ms"` : ''}>` +
      '<span class="landing-pin-halo"></span><span class="landing-pin-core"></span></span>' +
      (drop
        ? `<span class="landing-pin-ripple" style="animation-delay:${dropDelay + 380}ms"></span>`
        : '') +
      '</span>',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function zOffset(point: LandingMapPoint, selected: boolean): number {
  if (selected) return 1000;
  return point.severity === 'critique' ? 500 : 0;
}

/** Carte Leaflet compacte de la page d'accueil : un repère pulsant par incident du jour. */
export const LandingMap: React.FC<LandingMapProps> = ({ points, filter, selectedId, onSelect }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef(new Map<number, { marker: L.Marker; point: LandingMapPoint }>());
  const droppedRef = useRef(false);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, {
      center: ABIDJAN_CENTER,
      zoom: 12,
      zoomControl: false,
      scrollWheelZoom: false,
      attributionControl: true,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Repères + cadrage. Les repères tombent un à un la première fois seulement.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    markersRef.current.clear();
    const bounds = L.latLngBounds([]);

    const animate = !droppedRef.current && points.length > 0 && !prefersReducedMotion();
    const order = [...points].sort((a, b) => DROP_ORDER[a.severity] - DROP_ORDER[b.severity]);

    order.forEach((point, index) => {
      const marker = L.marker([point.lat, point.lon], {
        icon: pinIcon(point.severity, animate ? 250 + index * 90 : null),
        title: `${point.title} · ${point.commune}`,
        zIndexOffset: zOffset(point, false),
        keyboard: true,
      });
      marker.on('click', () => onSelectRef.current(point.id));
      marker.addTo(layer);
      markersRef.current.set(point.id, { marker, point });
      bounds.extend([point.lat, point.lon]);
    });
    if (points.length > 0) droppedRef.current = true;

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [56, 56], maxZoom: 14, animate: false });
    } else {
      map.setView(ABIDJAN_CENTER, 12, { animate: false });
    }
  }, [points]);

  // Filtre : les repères écartés rétrécissent au lieu de disparaître d'un coup
  useEffect(() => {
    markersRef.current.forEach(({ marker, point }) => {
      const hidden = filter !== 'all' && point.severity !== filter;
      const el = marker.getElement();
      if (!el) return;
      el.classList.toggle('is-filtered-out', hidden);
      el.tabIndex = hidden ? -1 : 0;
      el.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    });
  }, [filter, points]);

  // Sélection : repère mis en avant, la carte glisse jusqu'à lui
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach(({ marker, point }) => {
      const selected = point.id === selectedId;
      marker.getElement()?.querySelector('.landing-pin')?.classList.toggle('is-selected', selected);
      marker.setZIndexOffset(zOffset(point, selected));
      if (!selected) return;
      const target = marker.getLatLng();
      if (map.getBounds().pad(-0.15).contains(target)) return;
      if (prefersReducedMotion()) {
        map.setView(target, map.getZoom(), { animate: false });
      } else {
        map.flyTo(target, Math.max(map.getZoom(), 13), { duration: 0.8, easeLinearity: 0.3 });
      }
    });
  }, [selectedId, points]);

  return <div ref={containerRef} className="landing-map" aria-label="Carte des incidents du jour" />;
};
