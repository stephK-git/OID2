import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import { FilterChips } from './FilterControls';
import {
  SigAnalysisMap,
  type PointChaud,
  type IndiceVulnerabilite,
  type ZoneSilencieuse,
  type CommunesGeoJsonCollection,
} from '../../components/SigAnalysisMap';
import type { CoordData, IncidentItem, IncidentStatusFilter, MapQuickFilter } from './types';
import {
  IncidentStatusBadge,
  WaterGauge,
  formatIncidentRef,
  formatRelativeTime,
  getIncidentTypeMeta,
  resolveIncidentCommune,
  urgentCount,
} from './helpers';

const EMPTY_HOTSPOTS: PointChaud[] = [];
const EMPTY_VULNERABILITIES: IndiceVulnerabilite[] = [];
const EMPTY_SILENT_ZONES: ZoneSilencieuse[] = [];
const NOOP_HEX_THEME = () => {};
const PAGE_SIZE = 10;

interface CarteTabProps {
  data: CoordData;
  communesGeoJson: CommunesGeoJsonCollection | null;
  filteredIncidents: IncidentItem[];
  incidentFilter: IncidentStatusFilter;
  onChangeIncidentFilter: (f: IncidentStatusFilter) => void;
  focusIncidentId: number | null;
  onFocusIncident: (id: number) => void;
  /** Ouvre le dossier dans l'onglet Incidents. */
  onOpenIncident: (id: number) => void;
  /** Recharge les données partagées après une action (affectation, clôture…). */
  onDataChanged: () => Promise<void> | void;
  onError: (msg: string) => void;
  refreshKey: number;
}

export const CarteTab: React.FC<CarteTabProps> = ({
  data,
  communesGeoJson,
  filteredIncidents,
  incidentFilter,
  onChangeIncidentFilter,
  focusIncidentId,
  onFocusIncident,
  onOpenIncident,
  onDataChanged,
  onError,
  refreshKey,
}) => {
  const { stats, incidents, enqueteurs, zones } = data;
  const [isKpiSidebarOpen, setIsKpiSidebarOpen] = useState(true);
  const [carteGeoJson, setCarteGeoJson] = useState<any>(null);
  const [mapFilter, setMapFilter] = useState<MapQuickFilter>('tous');
  const [mapCommuneFilter, setMapCommuneFilter] = useState<string>('all');
  const [mapSearchRef, setMapSearchRef] = useState<string>('');
  const [tablePage, setTablePage] = useState(1);
  const [affectingId, setAffectingId] = useState<number | null>(null);
  const [selectedEnqueteurId, setSelectedEnqueteurId] = useState<number | ''>('');

  const loadCarte = useCallback(async () => {
    try {
      setCarteGeoJson(await apiFetch<any>('/coordination/carte'));
    } catch (err: any) {
      onError(err.message);
    }
  }, [onError]);

  useEffect(() => {
    loadCarte();
  }, [loadCarte, refreshKey]);

  const afterChange = async () => {
    await Promise.all([onDataChanged(), loadCarte()]);
  };

  const handleSelectMapCommune = useCallback((zid: number | '') => {
    setMapCommuneFilter(zid ? String(zid) : 'all');
  }, []);

  const focusTarget = useMemo(() => {
    if (!focusIncidentId) return null;
    const inc = incidents.find((i) => i.id === focusIncidentId);
    return inc?.coords ? { lat: inc.coords.lat, lon: inc.coords.lon, zoom: 15 } : null;
  }, [focusIncidentId, incidents]);

  const enrichedCarteGeoJson = useMemo(() => {
    if (!carteGeoJson || !carteGeoJson.features) return carteGeoJson;
    const feats = carteGeoJson.features.map((feat: any) => {
      if (feat.properties && feat.properties.zone_id != null) return feat;
      const incItem = incidents.find((i) => i.id === feat.properties?.id);
      if (incItem && incItem.zone_id != null) {
        return { ...feat, properties: { ...feat.properties, zone_id: incItem.zone_id } };
      }
      return feat;
    });
    return { ...carteGeoJson, features: feats };
  }, [carteGeoJson, incidents]);

  const topCriticalIncidents = useMemo(
    () =>
      [...incidents]
        .filter((i) => i.statut !== 'cloture')
        .sort((a, b) => {
          if (a.danger_immediat !== b.danger_immediat) return a.danger_immediat ? -1 : 1;
          return b.score_priorite - a.score_priorite;
        })
        .slice(0, 3),
    [incidents]
  );

  const totalPages = Math.max(1, Math.ceil(filteredIncidents.length / PAGE_SIZE));
  const safePage = Math.min(tablePage, totalPages);
  const pageIncidents = filteredIncidents.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleAffecter = async (incidentId: number) => {
    if (!selectedEnqueteurId) return;
    try {
      await apiFetch(`/coordination/incidents/${incidentId}/affecter`, {
        method: 'POST',
        body: JSON.stringify({ enqueteur_id: Number(selectedEnqueteurId) }),
      });
      setAffectingId(null);
      setSelectedEnqueteurId('');
      await afterChange();
    } catch (err: any) {
      alert(`Erreur d'affectation : ${err.message}`);
    }
  };

  const handleCloturer = async (incidentId: number) => {
    if (!window.confirm('Confirmer la clôture de cet incident ?')) return;
    try {
      await apiFetch(`/coordination/incidents/${incidentId}/cloturer`, { method: 'POST' });
      await afterChange();
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    }
  };

  const handleRouvrir = async (incidentId: number) => {
    const motif = window.prompt('Motif de la réouverture :');
    if (!motif) return;
    try {
      await apiFetch(`/coordination/incidents/${incidentId}/rouvrir`, {
        method: 'POST',
        body: JSON.stringify({ motif }),
      });
      await afterChange();
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    }
  };

  const renderActionCell = (inc: IncidentItem) => {
    if (affectingId === inc.id) {
      const commune = resolveIncidentCommune(inc, zones).toLowerCase();
      const isSameZone = (zoneNom?: string | null) => Boolean(zoneNom) && zoneNom!.toLowerCase() === commune;
      const sortedEnqueteurs = [...enqueteurs].sort((a, b) => {
        const za = isSameZone(a.zone_nom) ? 0 : 1;
        const zb = isSameZone(b.zone_nom) ? 0 : 1;
        return za - zb || a.dossiers_actifs - b.dossiers_actifs;
      });
      return (
        <div className="oid-coord-inline-assign">
          <select
            value={selectedEnqueteurId}
            onChange={(e) => setSelectedEnqueteurId(e.target.value ? Number(e.target.value) : '')}
            className="oid-coord-select-sm"
            aria-label="Sélectionner un enquêteur"
          >
            <option value="">Choisir un enquêteur...</option>
            {sortedEnqueteurs.map((enq) => (
              <option key={enq.id} value={enq.id}>
                {isSameZone(enq.zone_nom) ? '★ ' : ''}
                {enq.nom} ({enq.dossiers_actifs} actifs)
              </option>
            ))}
          </select>
          <button type="button" onClick={() => handleAffecter(inc.id)} className="oid-coord-btn-action primary">
            OK
          </button>
          <button
            type="button"
            onClick={() => {
              setAffectingId(null);
              setSelectedEnqueteurId('');
            }}
            className="oid-coord-btn-action neutral"
          >
            Annuler
          </button>
        </div>
      );
    }

    const startAffecting = () => {
      setAffectingId(inc.id);
      setSelectedEnqueteurId(inc.enqueteur_id || '');
    };

    // Une seule action principale par statut, l'action secondaire reste discrète.
    return (
      <div className="oid-coord-actions-group">
        {['ouvert', 'rouvert'].includes(inc.statut) && !inc.enqueteur_id && (
          <button type="button" onClick={startAffecting} className="oid-coord-btn-action primary">
            Affecter
          </button>
        )}
        {(inc.statut === 'affecte' || (['ouvert', 'rouvert'].includes(inc.statut) && inc.enqueteur_id)) && (
          <button type="button" onClick={startAffecting} className="oid-coord-btn-action neutral">
            Réaffecter
          </button>
        )}
        {inc.statut === 'evalue' && (
          <button type="button" onClick={() => handleCloturer(inc.id)} className="oid-coord-btn-action primary">
            Clôturer
          </button>
        )}
        {inc.statut === 'cloture' && (
          <button type="button" onClick={() => handleRouvrir(inc.id)} className="oid-coord-btn-action reopen">
            Rouvrir
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="oid-coord-stack">
      <div id="sig-op-map-anchor" className="oid-coord-sig-map-card oid-coord-map-with-sidebar">
        {/* Panneau latéral rétractable : résumé compact des indicateurs (250px) */}
        <aside
          className={`oid-map-kpi-sidebar ${!isKpiSidebarOpen ? 'is-collapsed' : ''}`}
          aria-label="Indicateurs stratégiques opérationnels"
        >
          <div className="oid-map-kpi-sidebar-header">
            <div className="oid-map-kpi-sidebar-title-group">
              <div className="oid-map-kpi-sidebar-title">
                <span className="material-symbols-outlined" style={{ fontSize: '17px', color: 'var(--water)' }}>
                  monitoring
                </span>
                <span>Indicateurs Stratégiques</span>
              </div>
              <span className="oid-map-kpi-sidebar-subtitle">Situation Opérationnelle · 24h</span>
            </div>
            <button
              type="button"
              onClick={() => setIsKpiSidebarOpen(false)}
              className="oid-map-kpi-sidebar-toggle-btn"
              title="Replier le panneau des indicateurs (250px)"
              aria-label="Replier le panneau"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_left</span>
            </button>
          </div>

          <div className="oid-map-kpi-sidebar-content">
            <div className="oid-map-kpi-sec">
              <div className="oid-map-kpi-sec-title">
                <span>Pilotage Opérationnel</span>
                <span className="oid-map-kpi-badge live">Live</span>
              </div>

              <div className="oid-map-kpi-items">
                <div className="oid-map-kpi-card">
                  <div className="oid-map-kpi-card-head">
                    <span className="oid-map-kpi-card-label">Total incidents</span>
                    <span className="oid-map-kpi-tag ok">24h</span>
                  </div>
                  <div className="oid-map-kpi-card-value">{stats?.incidents ?? incidents.length}</div>
                  <span className="oid-map-kpi-card-hint">Tous statuts confondus</span>
                </div>

                <div className="oid-map-kpi-card highlight-crit">
                  <div className="oid-map-kpi-card-head">
                    <span className="oid-map-kpi-card-label">Incidents ouverts</span>
                    <span className="oid-map-kpi-tag crit">actifs</span>
                  </div>
                  <div className="oid-map-kpi-card-value text-crit">{stats?.ouverts ?? 0}</div>
                  <span className="oid-map-kpi-card-hint">En attente ou en enquête</span>
                </div>

                <div className="oid-map-kpi-card">
                  <div className="oid-map-kpi-card-head">
                    <span className="oid-map-kpi-card-label">Couverture éval.</span>
                    <span className="oid-map-kpi-tag ok">cible 85%</span>
                  </div>
                  <div className="oid-map-kpi-card-value text-ok">{stats?.couverture ?? '0%'}</div>
                  <span className="oid-map-kpi-card-hint">Dossiers avec évaluation</span>
                </div>

                <div className="oid-map-kpi-card highlight-warn">
                  <div className="oid-map-kpi-card-head">
                    <span className="oid-map-kpi-card-label">Retards SLA</span>
                    <span className="oid-map-kpi-tag warn">&gt; 2h</span>
                  </div>
                  <div className="oid-map-kpi-card-value text-warn">{stats?.retards_total ?? 0}</div>
                  <span className="oid-map-kpi-card-hint">
                    {stats?.retard_critique ?? 0} crit. · {stats?.retard_standard ?? 0} std
                  </span>
                </div>
              </div>
            </div>

            <div className="oid-map-kpi-sec">
              <div className="oid-map-kpi-sec-title">
                <span>Bilan humain</span>
              </div>

              <div className="oid-map-kpi-impact-grid">
                {[
                  { icon: 'family_restroom', label: 'Ménages', v: stats?.menages_touches, cls: '' },
                  { icon: 'groups', label: 'Personnes', v: stats?.personnes_affectees, cls: '' },
                  { icon: 'personal_injury', label: 'Blessés', v: stats?.blesses, cls: 'text-warn' },
                  { icon: 'night_shelter', label: 'Déplacés', v: stats?.deplaces, cls: 'text-warn' },
                  { icon: 'person_search', label: 'Disparus', v: stats?.disparus, cls: 'text-coral' },
                  { icon: 'sentiment_very_dissatisfied', label: 'Décès', v: stats?.deces, cls: 'text-coral' },
                ].map((it) => (
                  <div key={it.label} className="oid-map-kpi-impact-chip">
                    <div className="oid-map-kpi-impact-l">
                      <span
                        className={`material-symbols-outlined ${it.cls}`}
                        style={{ fontSize: '15px', color: it.cls ? undefined : 'var(--water-hi)' }}
                      >
                        {it.icon}
                      </span>
                      <span>{it.label}</span>
                    </div>
                    <span className={`oid-map-kpi-impact-v ${it.cls}`}>
                      {(it.v ?? 0).toLocaleString('fr-FR')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <SigAnalysisMap
            mode="operationnel"
            communesGeoJson={communesGeoJson}
            maillesGeoJson={null}
            getisOrdGeoJson={null}
            hexThematique="densite"
            onChangeHexThematique={NOOP_HEX_THEME}
            hotspots={EMPTY_HOTSPOTS}
            vulnerabilities={EMPTY_VULNERABILITIES}
            silentZones={EMPTY_SILENT_ZONES}
            incidentsGeoJson={enrichedCarteGeoJson}
            sigMetadata={null}
            selectedZoneId={mapCommuneFilter !== 'all' ? Number(mapCommuneFilter) : ''}
            onSelectZoneId={handleSelectMapCommune}
            statusFilter={mapFilter}
            onChangeStatusFilter={setMapFilter}
            searchRef={mapSearchRef}
            onChangeSearchRef={setMapSearchRef}
            focusTarget={focusTarget}
            onOpenIncidentDetail={onOpenIncident}
            onToggleKpiSidebar={() => setIsKpiSidebarOpen((prev) => !prev)}
            isKpiSidebarOpen={isKpiSidebarOpen}
            scrollZoomOnClick
          />
        </div>
      </div>

      {/* Accès direct aux 3 incidents les plus prioritaires */}
      {topCriticalIncidents.length > 0 && (
        <div className="oid-coord-alpha-grid">
          {topCriticalIncidents.map((inc) => {
            const zoneName = resolveIncidentCommune(inc, zones);
            return (
              <div key={inc.id} className={`oid-coord-alpha-card ${inc.danger_immediat ? 'alpha-danger' : 'alpha-primary'}`}>
                <div className="oid-coord-alpha-top">
                  <div className="oid-coord-alpha-badge">
                    <span className={`oid-dot ${inc.danger_immediat ? 'bg-coral pulse' : 'bg-cyan'}`} />
                    <span className={inc.danger_immediat ? 'text-coral' : 'text-cyan'}>
                      {inc.danger_immediat ? 'Urgence alpha' : 'Intervention en cours'} · {formatIncidentRef(inc)}
                    </span>
                  </div>
                  <span className="oid-coord-alpha-zone">{zoneName}</span>
                </div>

                <p className="oid-coord-alpha-title">{getIncidentTypeMeta(inc.type).title}</p>
                <p className="oid-coord-alpha-desc">
                  {inc.description_synthese ||
                    `Signalements regroupés sur ${zoneName}. Score de priorité: ${inc.score_priorite} pts.`}
                </p>

                <div className="oid-coord-alpha-foot">
                  <span className="oid-coord-alpha-time">{formatRelativeTime(inc.cree_le)}</span>
                  <div className="oid-coord-alpha-links">
                  <button
                    type="button"
                    onClick={() => onOpenIncident(inc.id)}
                    className="oid-coord-locate-link"
                    title="Ouvrir le dossier dans l'onglet Incidents"
                  >
                    <span className="material-symbols-outlined">folder_open</span>
                    <span>Dossier</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onFocusIncident(inc.id)}
                    className="oid-coord-locate-link"
                    title="Localiser l'incident sur la carte"
                  >
                    <span className="material-symbols-outlined">my_location</span>
                    <span>Localiser</span>
                  </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* File priorisée des incidents */}
      <section style={{ padding: '0 20px 32px' }}>
        <div className="sec-head">
          <div>
            <div className="eyebrow">Tableau de bord opérationnel</div>
            <h2>File priorisée des incidents ({filteredIncidents.length})</h2>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <FilterChips<IncidentStatusFilter>
              ariaLabel="Filtrer par statut"
              value={incidentFilter}
              onChange={(v) => {
                onChangeIncidentFilter(v);
                setTablePage(1);
              }}
              options={[
                { value: 'tous', label: 'Tous', count: incidents.length },
                { value: 'danger', label: 'Urgences', icon: 'emergency', tone: 'danger', count: urgentCount(incidents) },
                {
                  value: 'a_affecter',
                  label: 'À affecter',
                  tone: 'warn',
                  count: incidents.filter((i) => ['ouvert', 'rouvert'].includes(i.statut) && !i.enqueteur_id).length,
                },
                { value: 'ouverts', label: 'Ouverts', count: incidents.filter((i) => ['ouvert', 'rouvert'].includes(i.statut)).length },
                { value: 'affectes', label: 'Affectés', count: incidents.filter((i) => i.statut === 'affecte').length },
                { value: 'evalues', label: 'Évalués', count: incidents.filter((i) => i.statut === 'evalue').length },
                { value: 'clotures', label: 'Clôturés', count: incidents.filter((i) => i.statut === 'cloture').length },
              ]}
            />
          </div>
        </div>

        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Réf. dossier</th>
                <th>Type &amp; Commune</th>
                <th>Niveau d'eau</th>
                <th>Statut</th>
                <th>Priorité</th>
                <th>Enquêteur assigné</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageIncidents.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--tx3)' }}>
                    Aucun incident enregistré pour les critères sélectionnés.
                  </td>
                </tr>
              ) : (
                pageIncidents.map((inc) => {
                  const enq = enqueteurs.find((e) => e.id === inc.enqueteur_id);
                  return (
                    <tr key={inc.id}>
                      <td>
                        <button
                          type="button"
                          onClick={() => onOpenIncident(inc.id)}
                          className={`oid-coord-ref-link ${inc.statut === 'cloture' ? 'is-closed' : ''}`}
                          title="Ouvrir le dossier dans la vue Gestion des Incidents"
                        >
                          <span className="code">{formatIncidentRef(inc)}</span>
                        </button>
                        <span className="sub">{formatRelativeTime(inc.cree_le)}</span>
                      </td>
                      <td>
                        <b>{getIncidentTypeMeta(inc.type).title}</b>
                        <span className="sub">{resolveIncidentCommune(inc, zones)}</span>
                      </td>
                      <td>
                        <WaterGauge cm={inc.hauteur_eau_max_cm} />
                      </td>
                      <td>
                        <IncidentStatusBadge statut={inc.statut} />
                      </td>
                      <td>
                        {inc.danger_immediat ? (
                          <span className="chip crit">
                            <i className="dot crit" /> {inc.score_priorite} pts
                          </span>
                        ) : (
                          <span className="chip">{inc.score_priorite} pts</span>
                        )}
                      </td>
                      <td>
                        {enq ? (
                          <span>
                            <b>{enq.nom}</b>
                            <span className="sub">{enq.email}</span>
                          </span>
                        ) : (
                          <span className="chip warn">À affecter</span>
                        )}
                      </td>
                      <td className="right">{renderActionCell(inc)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="oid-coord-pagination" style={{ marginTop: '12px' }}>
          <span>
            Affichage {filteredIncidents.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1} à{' '}
            {Math.min(safePage * PAGE_SIZE, filteredIncidents.length)} sur {filteredIncidents.length} incidents
            répertoriés
          </span>
          <div className="oid-coord-page-btns">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setTablePage(Math.max(1, safePage - 1))}
              className="btn btn-sm"
            >
              Précédent
            </button>
            <span className="mono" style={{ fontSize: '12px', padding: '0 8px' }}>
              Page {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setTablePage(Math.min(totalPages, safePage + 1))}
              className="btn btn-sm"
            >
              Suivant
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
