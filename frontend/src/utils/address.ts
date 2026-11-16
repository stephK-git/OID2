import { useEffect, useState } from 'react';
import { apiFetch } from '../api/client';

export interface CoordsLike {
  lat?: number | null;
  lon?: number | null;
}

interface AbidjanRepere {
  lat: number;
  lon: number;
  commune: string;
  quartier: string;
  rue: string;
}

const ABIDJAN_REPERES: AbidjanRepere[] = [
  { lat: 5.3675, lon: -3.9585, commune: 'Cocody', quartier: 'Riviera Palmeraie', rue: 'Rue Ministre / Carrefour Guiraud' },
  { lat: 5.3599, lon: -3.9870, commune: 'Cocody', quartier: 'Riviera 2', rue: 'Boulevard François Mitterrand' },
  { lat: 5.3535, lon: -3.9685, commune: 'Cocody', quartier: 'Riviera 3 / Bonoumin', rue: 'Voie Express Riviera' },
  { lat: 5.3442, lon: -3.9375, commune: 'Cocody', quartier: "Riviera Golf / M'Badon", rue: 'Boulevard de France' },
  { lat: 5.3772, lon: -3.9788, commune: 'Cocody', quartier: 'Angré 8e Tranche', rue: 'Boulevard Latrille Prolongé' },
  { lat: 5.3910, lon: -3.9860, commune: 'Cocody', quartier: 'Angré Château', rue: 'Voie Principale Djibi' },
  { lat: 5.3688, lon: -4.0005, commune: 'Cocody', quartier: 'Deux-Plateaux Vallon', rue: 'Rue des Jardins' },
  { lat: 5.3580, lon: -4.0055, commune: 'Cocody', quartier: 'Deux-Plateaux ENA', rue: 'Boulevard Latrille' },
  { lat: 5.3295, lon: -3.9975, commune: 'Cocody', quartier: 'Blockhauss / Cocody Centre', rue: 'Boulevard de la Corniche' },
  { lat: 5.3468, lon: -4.0118, commune: 'Cocody', quartier: 'Danga / Lycée Technique', rue: 'Avenue Jean Mermoz' },
  { lat: 5.3476, lon: -4.0890, commune: 'Yopougon', quartier: 'Niangon Nord / Banco', rue: 'Boulevard Principal de Yopougon' },
  { lat: 5.3310, lon: -4.0950, commune: 'Yopougon', quartier: 'Niangon Sud / Académie', rue: 'Rue Princesse / Axe Niangon' },
  { lat: 5.3560, lon: -4.0720, commune: 'Yopougon', quartier: 'Maroc / Ananerais', rue: 'Rue Kouté / Carrefour Maroc' },
  { lat: 5.3415, lon: -4.0630, commune: 'Yopougon', quartier: 'Toits Rouges / Siporex', rue: 'Autoroute du Nord · Sortie Siporex' },
  { lat: 5.3635, lon: -4.1080, commune: 'Yopougon', quartier: 'Gesco / Manutention', rue: 'Route de Dabou' },
  { lat: 5.3245, lon: -4.0735, commune: 'Yopougon', quartier: 'Millionnaire / Sideci', rue: 'Axe Palais de Justice' },
  { lat: 5.4161, lon: -4.0159, commune: 'Abobo', quartier: 'Abobo Gare / Samaké', rue: 'Voie Express Abobo' },
  { lat: 5.4015, lon: -4.0085, commune: 'Abobo', quartier: 'Dokui / Plateau Dokui', rue: 'Route du Zoo / Axe Dokui' },
  { lat: 5.4320, lon: -4.0225, commune: 'Abobo', quartier: 'Avocatier / Kennedy', rue: "Axe Mairie d'Abobo" },
  { lat: 5.4530, lon: -4.0350, commune: 'Abobo', quartier: 'PK 18 / Agbékoi', rue: "Route d'Anyama" },
  { lat: 5.4255, lon: -3.9970, commune: 'Abobo', quartier: 'Abobo Baoulé', rue: "Route d'Alépé" },
  { lat: 5.3650, lon: -4.0236, commune: 'Adjamé', quartier: 'Forum / Liberté', rue: 'Boulevard Nangui Abrogoua' },
  { lat: 5.3795, lon: -4.0210, commune: 'Adjamé', quartier: 'Williamsville / Macaci', rue: 'Voie Express Adjamé-Abobo' },
  { lat: 5.3555, lon: -4.0270, commune: 'Adjamé', quartier: 'Bracodi / Renault', rue: 'Avenue Reboul' },
  { lat: 5.3235, lon: -4.0211, commune: 'Plateau', quartier: 'Centre Administratif', rue: 'Boulevard de la République' },
  { lat: 5.3310, lon: -4.0175, commune: 'Plateau', quartier: 'Indénié / Baie de Cocody', rue: "Carrefour de l'Indénié" },
  { lat: 5.3185, lon: -4.0160, commune: 'Plateau', quartier: 'Quartier du Commerce', rue: 'Avenue Chardy' },
  { lat: 5.3025, lon: -3.9828, commune: 'Marcory', quartier: 'Zone 4C / Biétry', rue: 'Rue du Canal / Bd de Marseille' },
  { lat: 5.3125, lon: -3.9860, commune: 'Marcory', quartier: 'Anoumabo / Sicogi', rue: "Boulevard Valéry Giscard d'Estaing" },
  { lat: 5.3075, lon: -3.9720, commune: 'Marcory', quartier: 'Marcory Résidentiel / Remblais', rue: "Avenue de Côte d'Ivoire" },
  { lat: 5.2946, lon: -3.9472, commune: 'Koumassi', quartier: 'Grand Carrefour / Remblais', rue: 'Boulevard du 7 Décembre' },
  { lat: 5.3030, lon: -3.9565, commune: 'Koumassi', quartier: 'Prodomo / Campement', rue: 'Boulevard du Gabon' },
  { lat: 5.2885, lon: -3.9380, commune: 'Koumassi', quartier: 'Quartier Divo / Sicogi', rue: 'Rue du Marché de Koumassi' },
  { lat: 5.2921, lon: -4.0083, commune: 'Treichville', quartier: 'Zone Portuaire / Belleville', rue: 'Boulevard de Marseille' },
  { lat: 5.3020, lon: -4.0010, commune: 'Treichville', quartier: 'Avenue 16 / Arras', rue: 'Avenue 16 · Carrefour France-Amérique' },
  { lat: 5.2568, lon: -3.9261, commune: 'Port-Bouët', quartier: 'Vridi / Zone Industrielle', rue: 'Boulevard de Petit-Bassam' },
  { lat: 5.2435, lon: -3.8920, commune: 'Port-Bouët', quartier: 'Gonzagueville / Terre Rouge', rue: 'Route de Grand-Bassam' },
  { lat: 5.2540, lon: -3.9510, commune: 'Port-Bouët', quartier: 'Adjouffou / Aéroport', rue: "Boulevard de l'Aéroport" },
  { lat: 5.3396, lon: -4.0419, commune: 'Attécoubé', quartier: 'Agban / Sebroko', rue: 'Boulevard de la Paix' },
  { lat: 5.3510, lon: -4.0390, commune: 'Attécoubé', quartier: 'Boribana / Banco Baie', rue: 'Voie Lagunaire Ouest' },
  { lat: 5.3558, lon: -3.8853, commune: 'Bingerville', quartier: 'Bingerville Centre / Feh Kessé', rue: 'Boulevard Mitterrand Est' },
  { lat: 5.4946, lon: -4.0518, commune: 'Anyama', quartier: 'Anyama Gare / Résidentiel', rue: "Voie Principale d'Anyama" },
  { lat: 5.3192, lon: -4.2389, commune: 'Songon', quartier: 'Songon-Agban / Kassemblé', rue: 'Route de Dabou · Axe Songon' },
];

const addressCache = new Map<string, string>();

function coordKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

/**
 * Construit une adresse complète lisible (« Rue / Axe, Quartier, Commune »)
 * à partir des données disponibles ou des coordonnées GPS dans le District d'Abidjan.
 */
export function resolveAddressLabel(
  commune?: string | null,
  coords?: CoordsLike | null,
  adresse?: string | null,
  quartier?: string | null,
  rue?: string | null
): string {
  const lat = coords?.lat ?? null;
  const lon = coords?.lon ?? null;

  if (lat != null && lon != null) {
    const cached = addressCache.get(coordKey(lat, lon));
    if (cached) return cached;
  }

  if (adresse && adresse.trim() && adresse.trim().toLowerCase() !== (commune || '').trim().toLowerCase()) {
    return adresse.trim();
  }

  if (rue || quartier) {
    const parts = [rue, quartier, commune].filter(
      (p): p is string => Boolean(p && p.trim())
    );
    const dedup = Array.from(new Set(parts.map((p) => p.trim())));
    if (dedup.length > 0) return dedup.join(', ');
  }

  if (lat != null && lon != null) {
    let best: AbidjanRepere | null = null;
    let minD = Infinity;
    const cf = commune?.trim().toLowerCase();

    if (cf) {
      for (const r of ABIDJAN_REPERES) {
        if (r.commune.toLowerCase() === cf) {
          const d = Math.hypot(r.lat - lat, r.lon - lon);
          if (d < minD) {
            minD = d;
            best = r;
          }
        }
      }
    }

    if (!best) {
      for (const r of ABIDJAN_REPERES) {
        const d = Math.hypot(r.lat - lat, r.lon - lon);
        if (d < minD) {
          minD = d;
          best = r;
        }
      }
    }

    if (best && minD <= 0.45) {
      const com = commune && commune.trim() ? commune.trim() : best.commune;
      const parts = minD <= 0.018 ? [best.rue, best.quartier, com] : [best.quartier, com];
      return Array.from(new Set(parts)).join(', ');
    }
  }

  if (commune && commune.trim()) {
    return commune.trim();
  }
  return "District d'Abidjan";
}

/**
 * Hook qui retourne immédiatement l'adresse résolue et l'enrichit via /signalements/adresse (Nominatim OSM).
 */
export function useResolvedAddress(
  commune?: string | null,
  coords?: CoordsLike | null,
  initialAdresse?: string | null,
  quartier?: string | null,
  rue?: string | null
): string {
  const lat = coords?.lat ?? null;
  const lon = coords?.lon ?? null;
  const fallback = resolveAddressLabel(commune, coords, initialAdresse, quartier, rue);
  const [fetched, setFetched] = useState<{ key: string; value: string } | null>(null);

  useEffect(() => {
    if (lat == null || lon == null) return;
    const key = coordKey(lat, lon);
    if (addressCache.has(key)) return;

    const controller = new AbortController();
    apiFetch<{ commune?: string | null; quartier?: string | null; rue?: string | null; adresse?: string | null }>(
      `/signalements/adresse?lat=${lat}&lon=${lon}`,
      { signal: controller.signal }
    )
      .then((res) => {
        if (!res) return;
        const resolved = resolveAddressLabel(
          commune || res.commune,
          { lat, lon },
          res.adresse,
          res.quartier || quartier,
          res.rue || rue
        );
        addressCache.set(key, resolved);
        setFetched({ key, value: resolved });
      })
      .catch(() => {
        // Garde le repli local en cas d'indisponibilité réseau
      });

    return () => controller.abort();
  }, [commune, lat, lon, quartier, rue]);

  if (lat != null && lon != null) {
    const key = coordKey(lat, lon);
    if (fetched?.key === key) return fetched.value;
    const cached = addressCache.get(key);
    if (cached) return cached;
  }

  return fallback;
}
