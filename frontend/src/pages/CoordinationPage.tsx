import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../api/client';
import { BrandMark, VigilancePill } from '../components/shell';
import type { CommunesGeoJsonCollection } from '../components/SigAnalysisMap';
import type {
  CoordData,
  CoordTab,
  EnqueteurItem,
  IncidentItem,
  IncidentSortKey,
  IncidentStatusFilter,
  StatsData,
  ZoneItem,
} from './coordination/types';
import { aTraiterCount, urgentCount } from './coordination/helpers';
import { LiveClockDisplay, RefreshControl } from './coordination/TopBarStatus';
import { KpisTab } from './coordination/KpisTab';
import { CarteTab } from './coordination/CarteTab';
import { IncidentsTab } from './coordination/IncidentsTab';
import { HistoriqueTab } from './coordination/HistoriqueTab';
import { ComptesTab } from './coordination/ComptesTab';
import './coordination/coordination.css';

const TAB_HEADERS: Record<CoordTab, { title: string; subtitle: string }> = {
  kpis: {
    title: 'Situation des opérations',
    subtitle: 'Synthèse décisionnelle pour le pilotage des interventions',
  },
  carte: {
    title: 'Cartographie Opérationnelle',
    subtitle: 'Visualisation spatiale en temps réel des incidents hydrologiques',
  },
  incidents: {
    title: 'Gestion Opérationnelle des Incidents',
    subtitle: 'Triage, affectation des enquêteurs et suivi des résolutions',
  },
  historique: {
    title: 'Historique des incidents traités',
    subtitle: 'Incidents clôturés et rapports d’enquête terrain associés',
  },
  utilisateurs: {
    title: 'Comptes & Accréditations',
    subtitle: 'Gestion des accès et supervision des équipes terrain',
  },
};

const NAV_ITEMS: { tab: CoordTab; icon: string; label: string; group: 'pilotage' | 'admin' }[] = [
  { tab: 'kpis', icon: 'dashboard', label: 'Vue stratégique', group: 'pilotage' },
  { tab: 'carte', icon: 'map', label: 'Carte', group: 'pilotage' },
  { tab: 'incidents', icon: 'assignment_late', label: 'Incidents', group: 'pilotage' },
  { tab: 'historique', icon: 'history', label: 'Historique', group: 'pilotage' },
  { tab: 'utilisateurs', icon: 'badge', label: 'Comptes & Enquêteurs', group: 'admin' },
];

export const CoordinationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<CoordTab>('kpis');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [enqueteurs, setEnqueteurs] = useState<EnqueteurItem[]>([]);
  const [zones, setZones] = useState<ZoneItem[]>([]);
  const [communesGeoJson, setCommunesGeoJson] = useState<CommunesGeoJsonCollection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  /** Incrémenté par le bouton Actualiser : les onglets qui chargent leurs propres données le suivent. */
  const [refreshKey, setRefreshKey] = useState(0);

  // État partagé entre la Carte (tableau) et l'onglet Incidents
  const [incidentSearch, setIncidentSearch] = useState('');
  const [incidentFilter, setIncidentFilter] = useState<IncidentStatusFilter>('tous');
  const [incidentSort, setIncidentSort] = useState<IncidentSortKey>('priorite');
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);
  const [mapFocusIncidentId, setMapFocusIncidentId] = useState<number | null>(null);

  // Onglet Historique : incident dont le rapport est ouvert en pleine page (null : tableau)
  const [historiqueReportId, setHistoriqueReportId] = useState<number | null>(null);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const data: CoordData = useMemo(
    () => ({ stats, incidents, enqueteurs, zones }),
    [stats, incidents, enqueteurs, zones]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sData, iData, eData, zData, commData] = await Promise.all([
        apiFetch<StatsData>('/coordination/stats'),
        apiFetch<IncidentItem[]>('/coordination/incidents'),
        apiFetch<EnqueteurItem[]>('/coordination/enqueteurs'),
        apiFetch<ZoneItem[]>('/coordination/zones'),
        apiFetch<CommunesGeoJsonCollection>('/analyses/communes').catch(() => null),
      ]);
      setStats(sData);
      setIncidents(iData);
      setEnqueteurs(eData);
      setZones(zData);
      if (commData) setCommunesGeoJson(commData);
      setLastSyncAt(Date.now());
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement des données.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [activeTab, loadData]);

  const handleRefreshAll = () => {
    loadData();
    setRefreshKey((k) => k + 1);
  };

  const handleError = useCallback((msg: string) => setError(msg), []);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg((prev) => (prev === msg ? null : prev)), 3200);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // --- Navigation entre onglets ---
  const goToTab = useCallback((tab: CoordTab) => {
    // Les clôturés vivent dans l'Historique : le filtre « Clôturés » de la carte n'a pas de sens dans Incidents
    if (tab === 'incidents') setIncidentFilter((f) => (f === 'clotures' ? 'tous' : f));
    // Cliquer sur « Historique » dans le menu ramène toujours au tableau
    if (tab === 'historique') setHistoriqueReportId(null);
    setActiveTab(tab);
  }, []);

  const openIncident = useCallback(
    (id: number) => {
      const inc = incidents.find((i) => i.id === id);
      if (inc?.statut === 'cloture') {
        setHistoriqueReportId(id);
        setActiveTab('historique');
        return;
      }
      setIncidentFilter('tous');
      setIncidentSearch('');
      setSelectedIncidentId(id);
      setActiveTab('incidents');
    },
    [incidents]
  );

  const openIncidentList = useCallback((filter: IncidentStatusFilter) => {
    if (filter === 'clotures') {
      setHistoriqueReportId(null);
      setActiveTab('historique');
      return;
    }
    setIncidentFilter(filter);
    setIncidentSearch('');
    setSelectedIncidentId(null);
    setActiveTab('incidents');
  }, []);

  const showOnMap = useCallback((id: number) => {
    setMapFocusIncidentId(id);
    setActiveTab('carte');
  }, []);

  // Recherche texte commune aux onglets Carte / Incidents
  const matchesSearch = useCallback(
    (inc: IncidentItem, rawQuery: string) => {
      const q = rawQuery.trim().toLowerCase();
      if (!q) return true;
      const enqNom = enqueteurs.find((e) => e.id === inc.enqueteur_id)?.nom || inc.enqueteur_nom || '';
      const zoneNom = inc.zone_id ? zones.find((zn) => zn.id === inc.zone_id)?.nom || '' : '';
      const communeName = (inc.commune || zoneNom).toLowerCase();
      const idStr = String(inc.id);
      return (
        idStr.includes(q.replace(/^#/, '')) ||
        `#${idStr}`.includes(q) ||
        inc.reference_publique.toLowerCase().includes(q) ||
        inc.type.toLowerCase().includes(q) ||
        inc.statut.toLowerCase().includes(q) ||
        communeName.includes(q) ||
        enqNom.toLowerCase().includes(q)
      );
    },
    [enqueteurs, zones]
  );

  // Filtrage & tri de la file des incidents (partagé Carte / Incidents)
  const filteredIncidents = useMemo(() => {
    return [...incidents]
      .filter((inc) => {
        if (incidentFilter === 'a_affecter' && !(['ouvert', 'rouvert'].includes(inc.statut) && !inc.enqueteur_id)) {
          return false;
        }
        if (incidentFilter === 'ouverts' && !['ouvert', 'rouvert'].includes(inc.statut)) return false;
        if (incidentFilter === 'affectes' && inc.statut !== 'affecte') return false;
        if (incidentFilter === 'evalues' && inc.statut !== 'evalue') return false;
        if (incidentFilter === 'clotures' && inc.statut !== 'cloture') return false;
        if (incidentFilter === 'danger' && !inc.danger_immediat) return false;
        return matchesSearch(inc, incidentSearch);
      })
      .sort((a, b) => {
        if (incidentSort === 'date') {
          const da = a.cree_le ? new Date(a.cree_le).getTime() : 0;
          const db = b.cree_le ? new Date(b.cree_le).getTime() : 0;
          return db - da;
        }
        if (a.danger_immediat !== b.danger_immediat) return a.danger_immediat ? -1 : 1;
        return b.score_priorite - a.score_priorite;
      });
  }, [incidents, matchesSearch, incidentSearch, incidentFilter, incidentSort]);

  // Onglet Incidents : uniquement les dossiers encore en cours (les clôturés partent dans l'Historique)
  const activeIncidents = useMemo(
    () => filteredIncidents.filter((inc) => inc.statut !== 'cloture'),
    [filteredIncidents]
  );

  const aTraiter = aTraiterCount(incidents);
  const hasUrgent = urgentCount(incidents) > 0;
  const header = TAB_HEADERS[activeTab];

  const renderNavItem = (item: (typeof NAV_ITEMS)[number]) => (
    <button
      key={item.tab}
      type="button"
      className={`nav-item ${activeTab === item.tab ? 'actif' : ''}`}
      onClick={() => goToTab(item.tab)}
      aria-current={activeTab === item.tab ? 'page' : undefined}
    >
      <span className="material-symbols-outlined">{item.icon}</span>
      <span>{item.label}</span>
      {item.tab === 'incidents' && aTraiter > 0 && (
        <span
          className={`nav-badge ${hasUrgent ? '' : 'is-calm'}`}
          title={`${aTraiter} incident(s) à traiter : danger vital ou sans enquêteur`}
          aria-label={`${aTraiter} incident(s) à traiter`}
        >
          {aTraiter}
        </span>
      )}
    </button>
  );

  return (
    <div className="app-shell page-coordinateur" id="appShell">
      {toastMsg && (
        <div id="toasts" role="status">
          <div className="toast success">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>check_circle</span>
            <span>{toastMsg}</span>
          </div>
        </div>
      )}

      {/* ---------- Barre latérale ---------- */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <BrandMark subtitle="Inondations &amp; Dommages" />
        </div>

        <nav className="sidebar-nav">
          <div className="nav-group">
            <div className="nav-label">Pilotage</div>
            {NAV_ITEMS.filter((i) => i.group === 'pilotage').map(renderNavItem)}
          </div>
          <div className="nav-group">
            <div className="nav-label">Administration</div>
            {NAV_ITEMS.filter((i) => i.group === 'admin').map(renderNavItem)}
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="avatar">{user?.nom ? user.nom.slice(0, 2).toUpperCase() : 'HQ'}</div>
          <div className="user-info">
            <span className="user-name">{user?.nom || 'Coordinateur'}</span>
            <span className="user-role">{user?.role?.toUpperCase() || 'HQ COORDINATION'}</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            title="Se déconnecter"
            aria-label="Se déconnecter"
            onClick={handleLogout}
            style={{ marginLeft: 'auto', border: 'none' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--crit)' }}>
              logout
            </span>
          </button>
        </div>
      </aside>

      {/* ---------- Contenu ---------- */}
      <main className="main-content">
        <header className="top-bar">
          <div>
            <h1 className="page-title">{header.title}</h1>
            <div className="page-subtitle">{header.subtitle}</div>
          </div>

          <div className="top-actions">
            <RefreshControl lastSyncAt={lastSyncAt} loading={loading} onRefresh={handleRefreshAll} />

            <div className="status" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <VigilancePill />
              <LiveClockDisplay />
            </div>
          </div>
        </header>

        {error && (
          <div className="oid-error-banner" role="alert" style={{ margin: '16px 20px' }}>
            <span className="material-symbols-outlined">warning</span>
            <span>{error}</span>
          </div>
        )}

        {activeTab === 'kpis' && (
          <KpisTab data={data} onOpenIncident={openIncident} onOpenIncidentList={openIncidentList} />
        )}

        {activeTab === 'carte' && (
          <CarteTab
            data={data}
            communesGeoJson={communesGeoJson}
            filteredIncidents={filteredIncidents}
            incidentFilter={incidentFilter}
            onChangeIncidentFilter={setIncidentFilter}
            focusIncidentId={mapFocusIncidentId}
            onFocusIncident={setMapFocusIncidentId}
            onOpenIncident={openIncident}
            onDataChanged={loadData}
            onError={handleError}
            refreshKey={refreshKey}
          />
        )}

        {activeTab === 'incidents' && (
          <IncidentsTab
            data={data}
            filteredIncidents={activeIncidents}
            loading={loading}
            incidentSearch={incidentSearch}
            onChangeIncidentSearch={setIncidentSearch}
            incidentFilter={incidentFilter}
            onChangeIncidentFilter={setIncidentFilter}
            incidentSort={incidentSort}
            onChangeIncidentSort={setIncidentSort}
            selectedIncidentId={selectedIncidentId}
            onSelectIncidentId={setSelectedIncidentId}
            onShowOnMap={showOnMap}
            onDataChanged={loadData}
            showToast={showToast}
          />
        )}

        {activeTab === 'historique' && (
          <HistoriqueTab
            data={data}
            loading={loading}
            openReportId={historiqueReportId}
            onChangeOpenReportId={setHistoriqueReportId}
            onShowOnMap={showOnMap}
            onDataChanged={loadData}
            showToast={showToast}
          />
        )}

        {activeTab === 'utilisateurs' && (
          <ComptesTab
            zones={zones}
            onDataChanged={loadData}
            onError={handleError}
            showToast={showToast}
            refreshKey={refreshKey}
          />
        )}
      </main>
    </div>
  );
};
