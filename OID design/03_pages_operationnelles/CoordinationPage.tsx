import React, { useState, useEffect } from 'react';
import { apiFetch, getToken } from '../api/client';
import { IncidentsMap } from '../components/IncidentsMap';
import {
  SigAnalysisMap,
  type PointChaud,
  type IndiceVulnerabilite,
  type ZoneSilencieuse,
  type CommunesGeoJsonCollection,
  type MaillesPopulationCollection,
  type GetisOrdCollection,
  type HexThematique,
  type SigMetadata,
} from '../components/SigAnalysisMap';
import {
  Compass,
  AlertTriangle,
  Users,
  CheckCircle2,
  RotateCcw,
  UserCheck,
  FileText,
  FileSpreadsheet,
  Globe,
  UserPlus,
  RefreshCw,
  Map,
  KeyRound,
  Edit2,
  Layers,
  Flame,
  ShieldAlert,
  VolumeX,
  ExternalLink,
  Activity,
  Crosshair
} from 'lucide-react';

interface StatsData {
  incidents: number;
  ouverts: number;
  evalues: number;
  couverture: string;
  retard_critique: number;
  retard_standard: number;
  retards_total: number;
  menages_touches: number;
  personnes_affectees: number;
  blesses: number;
  deplaces: number;
  deces: number;
  disparus: number;
}

interface IncidentItem {
  id: number;
  reference_publique: string;
  type: string;
  statut: string;
  score_priorite: number;
  niveau_fiabilite: string;
  enqueteur_id: number | null;
  danger_immediat: boolean;
  cree_le: string | null;
}

interface EnqueteurItem {
  id: number;
  nom: string;
  email: string;
  dossiers_actifs: number;
}

interface ZoneItem {
  id: number;
  nom: string;
}

interface UtilisateurItem {
  id: number;
  nom: string;
  email: string;
  role: string;
  actif: boolean;
  zone_id: number | null;
  derniere_connexion: string | null;
  dossiers_actifs: number;
}

export const CoordinationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'kpis' | 'carte' | 'incidents' | 'analyses' | 'utilisateurs'>('kpis');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [enqueteurs, setEnqueteurs] = useState<EnqueteurItem[]>([]);
  const [zones, setZones] = useState<ZoneItem[]>([]);
  const [utilisateurs, setUtilisateurs] = useState<UtilisateurItem[]>([]);
  const [carteGeoJson, setCarteGeoJson] = useState<any>(null);
  const [communesGeoJson, setCommunesGeoJson] = useState<CommunesGeoJsonCollection | null>(null);
  const [maillesGeoJson, setMaillesGeoJson] = useState<MaillesPopulationCollection | null>(null);
  const [getisOrdGeoJson, setGetisOrdGeoJson] = useState<GetisOrdCollection | null>(null);
  const [hexThematique, setHexThematique] = useState<HexThematique>('densite');
  const [sigMetadata, setSigMetadata] = useState<SigMetadata | null>(null);
  const [selectedSigZoneId, setSelectedSigZoneId] = useState<number | ''>('');
  const [pointsChauds, setPointsChauds] = useState<PointChaud[]>([]);
  const [vulnerabilites, setVulnerabilites] = useState<IndiceVulnerabilite[]>([]);
  const [zonesSilencieuses, setZonesSilencieuses] = useState<ZoneSilencieuse[]>([]);
  const [sigFocusTarget, setSigFocusTarget] = useState<{ lat: number; lon: number; zoom?: number } | null>(null);
  const [loadingAnalyses, setLoadingAnalyses] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Affectation modal / state
  const [affectingId, setAffectingId] = useState<number | null>(null);
  const [selectedEnqueteurId, setSelectedEnqueteurId] = useState<number | ''>('');

  // Nouveau compte utilisateur
  const [showNewUser, setShowNewUser] = useState(false);
  const [newNom, setNewNom] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('enqueteur');
  const [newZoneId, setNewZoneId] = useState<number | ''>('');

  // Édition utilisateur
  const [editingUser, setEditingUser] = useState<UtilisateurItem | null>(null);
  const [editNom, setEditNom] = useState('');
  const [editRole, setEditRole] = useState('enqueteur');
  const [editZoneId, setEditZoneId] = useState<number | ''>('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sData, iData, eData, zData] = await Promise.all([
        apiFetch<StatsData>('/coordination/stats'),
        apiFetch<IncidentItem[]>('/coordination/incidents'),
        apiFetch<EnqueteurItem[]>('/coordination/enqueteurs'),
        apiFetch<ZoneItem[]>('/coordination/zones'),
      ]);
      setStats(sData);
      setIncidents(iData);
      setEnqueteurs(eData);
      setZones(zData);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement des données.');
    } finally {
      setLoading(false);
    }
  };

  const loadCarte = async () => {
    setLoading(true);
    try {
      const geo = await apiFetch<any>('/coordination/carte');
      setCarteGeoJson(geo);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadUtilisateurs = async () => {
    try {
      const uData = await apiFetch<UtilisateurItem[]>('/coordination/utilisateurs');
      setUtilisateurs(uData);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const buildMaillesUrl = (zoneFilter: number | '', thematique: HexThematique) => {
    const thParam = thematique === 'getis_ord' ? 'densite' : thematique;
    const params = new URLSearchParams({ thematique: thParam });
    if (zoneFilter) params.set('zone_id', String(zoneFilter));
    return `/analyses/mailles-population?${params.toString()}`;
  };

  const buildGetisUrl = (zoneFilter: number | '') => {
    return zoneFilter ? `/analyses/getis-ord?zone_id=${zoneFilter}` : '/analyses/getis-ord';
  };

  const loadAnalyses = async (
    zoneFilter: number | '' = selectedSigZoneId,
    thematique: HexThematique = hexThematique
  ) => {
    setLoadingAnalyses(true);
    try {
      const maillesUrl = buildMaillesUrl(zoneFilter, thematique);
      const getisUrl = buildGetisUrl(zoneFilter);
      const [metaData, commData, mailleData, giData, pcData, vData, zsData, geoData] = await Promise.all([
        apiFetch<SigMetadata>('/analyses/metadonnees'),
        apiFetch<CommunesGeoJsonCollection>('/analyses/communes'),
        apiFetch<MaillesPopulationCollection>(maillesUrl),
        apiFetch<GetisOrdCollection>(getisUrl),
        apiFetch<PointChaud[]>('/analyses/points-chauds'),
        apiFetch<IndiceVulnerabilite[]>('/analyses/vulnerabilite'),
        apiFetch<ZoneSilencieuse[]>('/analyses/zones-silencieuses'),
        apiFetch<any>('/coordination/carte'),
      ]);
      setSigMetadata(metaData);
      setCommunesGeoJson(commData);
      setMaillesGeoJson(mailleData);
      setGetisOrdGeoJson(giData);
      setPointsChauds(pcData);
      setVulnerabilites(vData);
      setZonesSilencieuses(zsData);
      setCarteGeoJson(geoData);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement des analyses spatiales.');
    } finally {
      setLoadingAnalyses(false);
    }
  };

  const handleSelectSigZone = async (zoneId: number | '') => {
    setSelectedSigZoneId(zoneId);
    if (!zoneId) {
      setSigFocusTarget(null);
    }
    try {
      const [mailleData, giData] = await Promise.all([
        apiFetch<MaillesPopulationCollection>(buildMaillesUrl(zoneId, hexThematique)),
        apiFetch<GetisOrdCollection>(buildGetisUrl(zoneId)),
      ]);
      setMaillesGeoJson(mailleData);
      setGetisOrdGeoJson(giData);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du filtrage communal du maillage.');
    }
  };

  const handleChangeHexThematique = async (nextTheme: HexThematique) => {
    setHexThematique(nextTheme);
    if (nextTheme === 'getis_ord') return;
    try {
      const mailleData = await apiFetch<MaillesPopulationCollection>(
        buildMaillesUrl(selectedSigZoneId, nextTheme)
      );
      setMaillesGeoJson(mailleData);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du changement de thématique hexagonale.');
    }
  };

  useEffect(() => {
    loadData();
    if (activeTab === 'carte') {
      loadCarte();
    } else if (activeTab === 'analyses') {
      loadAnalyses();
    } else if (activeTab === 'utilisateurs') {
      loadUtilisateurs();
    }
  }, [activeTab]);

  const handleAffecter = async (incidentId: number) => {
    if (!selectedEnqueteurId) return;
    try {
      await apiFetch(`/coordination/incidents/${incidentId}/affecter`, {
        method: 'POST',
        body: JSON.stringify({ enqueteur_id: Number(selectedEnqueteurId) }),
      });
      setAffectingId(null);
      setSelectedEnqueteurId('');
      loadData();
    } catch (err: any) {
      alert(`Erreur d'affectation : ${err.message}`);
    }
  };

  const handleCloturer = async (incidentId: number) => {
    if (!window.confirm('Confirmer la clôture de cet incident ?')) return;
    try {
      await apiFetch(`/coordination/incidents/${incidentId}/cloturer`, { method: 'POST' });
      loadData();
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
      loadData();
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/coordination/utilisateurs', {
        method: 'POST',
        body: JSON.stringify({
          nom: newNom,
          email: newEmail,
          password: newPassword,
          role: newRole,
          zone_id: newZoneId ? Number(newZoneId) : null,
        }),
      });
      setShowNewUser(false);
      setNewNom('');
      setNewEmail('');
      setNewPassword('');
      setNewZoneId('');
      loadUtilisateurs();
      alert('Utilisateur créé avec succès.');
    } catch (err: any) {
      alert(`Erreur création : ${err.message}`);
    }
  };

  const handleToggleActif = async (uid: number, actifActuel: boolean) => {
    try {
      await apiFetch(`/coordination/utilisateurs/${uid}/actif?actif=${!actifActuel}`, {
        method: 'PATCH',
      });
      loadUtilisateurs();
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    }
  };

  const handleResetPassword = async (uid: number, nom: string) => {
    const newPass = window.prompt(`Entrez le nouveau mot de passe pour ${nom} (minimum 8 caractères) :`);
    if (!newPass) return;
    if (newPass.length < 8) {
      alert('Le mot de passe doit comporter au moins 8 caractères.');
      return;
    }
    try {
      await apiFetch(`/coordination/utilisateurs/${uid}/mot-de-passe?nouveau_mot_de_passe=${encodeURIComponent(newPass)}`, {
        method: 'PATCH',
      });
      alert(`Mot de passe mis à jour avec succès pour ${nom}.`);
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    }
  };

  const startEditUser = (u: UtilisateurItem) => {
    setEditingUser(u);
    setEditNom(u.nom);
    setEditRole(u.role);
    setEditZoneId(u.zone_id || '');
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await apiFetch(`/coordination/utilisateurs/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nom: editNom,
          role: editRole,
          zone_id: editZoneId ? Number(editZoneId) : null,
        }),
      });
      setEditingUser(null);
      loadUtilisateurs();
      alert('Utilisateur modifié avec succès.');
    } catch (err: any) {
      alert(`Erreur modification : ${err.message}`);
    }
  };

  const downloadFile = (endpoint: string, filename: string) => {
    const token = getToken();
    fetch(endpoint, {
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch((err) => alert(`Erreur de téléchargement : ${err.message}`));
  };

  return (
    <div className="container page-content">
      <div className="page-header flex-between">
        <div>
          <h1>Tableau de bord de Coordination</h1>
          <p>Vue d'ensemble stratégique, cartographie opérationnelle et pilotage des secours.</p>
        </div>

        {/* Exports & Rapports */}
        <div className="export-buttons">
          <button
            onClick={loadData}
            className="btn btn-outline"
            disabled={loading}
            title="Rafraîchir les données"
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            <span>Actualiser</span>
          </button>
          <button
            onClick={() => downloadFile('/rapports/sitrep.pdf', 'OID-SITREP.pdf')}
            className="btn btn-outline"
            title="Télécharger le rapport de situation en PDF"
          >
            <FileText size={16} />
            <span>SITREP PDF</span>
          </button>
          <button
            onClick={() => downloadFile('/rapports/export/csv', 'incidents.csv')}
            className="btn btn-outline"
            title="Export tabulaire CSV"
          >
            <FileSpreadsheet size={16} />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => downloadFile('/rapports/export/geojson', 'incidents.geojson')}
            className="btn btn-outline"
            title="Export cartographique GeoJSON"
          >
            <Globe size={16} />
            <span>GeoJSON</span>
          </button>
          <button
            onClick={() => downloadFile('/analyses/retex.pdf', 'OID-RETEX-Post-Crise.pdf')}
            className="btn btn-outline"
            title="Télécharger le rapport de retour d'expérience post-crise en PDF"
          >
            <ShieldAlert size={16} />
            <span>RETEX PDF</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'kpis' ? 'active' : ''}`}
          onClick={() => setActiveTab('kpis')}
        >
          <Compass size={16} />
          <span>Indicateurs & Impact</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'carte' ? 'active' : ''}`}
          onClick={() => setActiveTab('carte')}
        >
          <Map size={16} />
          <span>Carte Interactive des Incidents</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'incidents' ? 'active' : ''}`}
          onClick={() => setActiveTab('incidents')}
        >
          <AlertTriangle size={16} />
          <span>Gestion des Incidents ({incidents.length})</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'analyses' ? 'active' : ''}`}
          onClick={() => setActiveTab('analyses')}
        >
          <Layers size={16} />
          <span>Analyses Spatiales & RETEX</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'utilisateurs' ? 'active' : ''}`}
          onClick={() => setActiveTab('utilisateurs')}
        >
          <Users size={16} />
          <span>Gestion des Comptes</span>
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1 : KPIS & IMPACT */}
      {activeTab === 'kpis' && stats && (
        <div className="dashboard-grid">
          {/* Cartes KPI */}
          <div className="kpi-card">
            <span className="kpi-label">Total Incidents</span>
            <div className="kpi-val">{stats.incidents}</div>
            <span className="kpi-sub">Tous statuts confondus</span>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Incidents Ouverts</span>
            <div className="kpi-val text-warning">{stats.ouverts}</div>
            <span className="kpi-sub">En attente ou en cours d'enquête</span>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Couverture Évaluations</span>
            <div className="kpi-val text-success">{stats.couverture}</div>
            <span className="kpi-sub">Dossiers avec évaluation validée</span>
          </div>

          <div className="kpi-card">
            <span className="kpi-label">Retards SLA</span>
            <div className="kpi-val text-danger">{stats.retards_total}</div>
            <span className="kpi-sub">
              {stats.retard_critique} critique(s) / {stats.retard_standard} standard(s)
            </span>
          </div>

          {/* Bilan d'impact humain consolidé */}
          <div className="card full-width-card">
            <h3>Bilan humain consolidé des sinistres</h3>
            <p className="card-subtitle">
              Données issues des fiches d'évaluation soumises par les enquêteurs de terrain.
            </p>

            <div className="human-impact-grid">
              <div className="impact-box">
                <span className="impact-number">{stats.menages_touches}</span>
                <span className="impact-label">Ménages touchés</span>
              </div>
              <div className="impact-box">
                <span className="impact-number">{stats.personnes_affectees}</span>
                <span className="impact-label">Personnes affectées</span>
              </div>
              <div className="impact-box">
                <span className="impact-number text-warning">{stats.blesses}</span>
                <span className="impact-label">Blessés recensés</span>
              </div>
              <div className="impact-box">
                <span className="impact-number text-warning">{stats.deplaces}</span>
                <span className="impact-label">Déplacés / Relogés</span>
              </div>
              <div className="impact-box">
                <span className="impact-number text-danger">{stats.disparus}</span>
                <span className="impact-label">Personnes disparues</span>
              </div>
              <div className="impact-box">
                <span className="impact-number text-danger">{stats.deces}</span>
                <span className="impact-label">Décès constatés</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2 : CARTE INTERACTIVE */}
      {activeTab === 'carte' && (
        <div>
          <IncidentsMap data={carteGeoJson} />
        </div>
      )}

      {/* TAB 3 : INCIDENTS */}
      {activeTab === 'incidents' && (
        <div className="card table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Réf Publique</th>
                <th>Type</th>
                <th>Statut</th>
                <th>Priorité</th>
                <th>Fiabilité</th>
                <th>Enquêteur assigné</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => {
                const enqueteur = enqueteurs.find((e) => e.id === inc.enqueteur_id);
                return (
                  <tr key={inc.id}>
                    <td><strong>{inc.reference_publique.slice(0, 10)}...</strong></td>
                    <td>{inc.type}</td>
                    <td>
                      <span className={`status-badge status-${inc.statut}`}>
                        {inc.statut}
                      </span>
                    </td>
                    <td>
                      <span className={`score-badge ${inc.danger_immediat ? 'badge-danger' : ''}`}>
                        {inc.score_priorite} pts
                      </span>
                    </td>
                    <td>{inc.niveau_fiabilite}</td>
                    <td>
                      {enqueteur ? (
                        <span className="assigned-user">{enqueteur.nom}</span>
                      ) : (
                        <span className="unassigned">Non assigné</span>
                      )}
                    </td>
                    <td>
                      <div className="action-buttons-inline">
                        {['ouvert', 'rouvert'].includes(inc.statut) && (
                          affectingId === inc.id ? (
                            <div className="assign-select-wrap">
                              <select
                                value={selectedEnqueteurId}
                                onChange={(e) => setSelectedEnqueteurId(e.target.value ? Number(e.target.value) : '')}
                                className="form-control form-control-sm"
                              >
                                <option value="">Choisir enquêteur...</option>
                                {enqueteurs.map((enq) => (
                                  <option key={enq.id} value={enq.id}>
                                    {enq.nom} ({enq.dossiers_actifs} dossiers)
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleAffecter(inc.id)}
                                className="btn btn-sm btn-primary"
                              >
                                OK
                              </button>
                              <button
                                onClick={() => setAffectingId(null)}
                                className="btn btn-sm btn-secondary"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAffectingId(inc.id)}
                              className="btn btn-sm btn-outline"
                              title="Affecter un enquêteur de terrain"
                            >
                              <UserCheck size={14} />
                              <span>Affecter</span>
                            </button>
                          )
                        )}

                        {inc.statut !== 'cloture' ? (
                          <button
                            onClick={() => handleCloturer(inc.id)}
                            className="btn btn-sm btn-success"
                            title="Clôturer l'incident"
                          >
                            <CheckCircle2 size={14} />
                            <span>Clôturer</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRouvrir(inc.id)}
                            className="btn btn-sm btn-secondary"
                            title="Rouvrir l'incident"
                          >
                            <RotateCcw size={14} />
                            <span>Rouvrir</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4 : UTILISATEURS */}
      {activeTab === 'utilisateurs' && (
        <div className="card table-card">
          <div className="table-header-action flex-between">
            <h3>Comptes utilisateurs</h3>
            <button onClick={() => setShowNewUser(!showNewUser)} className="btn btn-primary">
              <UserPlus size={16} />
              <span>Créer un utilisateur</span>
            </button>
          </div>

          {showNewUser && (
            <form onSubmit={handleCreateUser} className="new-user-form">
              <div className="form-grid-3">
                <input
                  type="text"
                  placeholder="Nom complet"
                  value={newNom}
                  onChange={(e) => setNewNom(e.target.value)}
                  className="form-control"
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="form-control"
                  required
                />
                <input
                  type="password"
                  placeholder="Mot de passe (min 8 caractères)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="form-control"
                  required
                  minLength={8}
                />
              </div>
              <div className="form-actions-row">
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="form-control"
                  style={{ maxWidth: '180px' }}
                >
                  <option value="enqueteur">Enquêteur</option>
                  <option value="verificateur">Vérificateur</option>
                  <option value="coordinateur">Coordinateur</option>
                </select>
                <select
                  value={newZoneId}
                  onChange={(e) => setNewZoneId(e.target.value ? Number(e.target.value) : '')}
                  className="form-control"
                  style={{ maxWidth: '180px' }}
                >
                  <option value="">Aucune zone</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>{z.nom}</option>
                  ))}
                </select>
                <button type="submit" className="btn btn-success">
                  Enregistrer
                </button>
                <button type="button" onClick={() => setShowNewUser(false)} className="btn btn-secondary">
                  Annuler
                </button>
              </div>
            </form>
          )}

          {editingUser && (
            <form onSubmit={handleSaveEditUser} className="new-user-form" style={{ background: '#f0f9ff', borderColor: '#38bdf8' }}>
              <h4>Modifier l'utilisateur : {editingUser.email}</h4>
              <div className="form-actions-row">
                <input
                  type="text"
                  placeholder="Nom"
                  value={editNom}
                  onChange={(e) => setEditNom(e.target.value)}
                  className="form-control"
                  required
                />
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="form-control"
                >
                  <option value="enqueteur">Enquêteur</option>
                  <option value="verificateur">Vérificateur</option>
                  <option value="coordinateur">Coordinateur</option>
                </select>
                <select
                  value={editZoneId}
                  onChange={(e) => setEditZoneId(e.target.value ? Number(e.target.value) : '')}
                  className="form-control"
                >
                  <option value="">Aucune zone</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>{z.nom}</option>
                  ))}
                </select>
                <button type="submit" className="btn btn-primary">Valider</button>
                <button type="button" onClick={() => setEditingUser(null)} className="btn btn-secondary">Annuler</button>
              </div>
            </form>
          )}

          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Email</th>
                <th>Rôle</th>
                <th>Zone</th>
                <th>Statut</th>
                <th>Dossiers en cours</th>
                <th>Dernière connexion</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {utilisateurs.map((u) => {
                const zone = zones.find((z) => z.id === u.zone_id);
                return (
                  <tr key={u.id}>
                    <td><strong>{u.nom}</strong></td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`role-badge role-${u.role}`}>{u.role}</span>
                    </td>
                    <td>{zone ? zone.nom : '-'}</td>
                    <td>
                      <span className={`badge ${u.actif ? 'badge-success' : 'badge-danger'}`}>
                        {u.actif ? 'Actif' : 'Désactivé'}
                      </span>
                    </td>
                    <td>{u.dossiers_actifs}</td>
                    <td>{u.derniere_connexion ? new Date(u.derniere_connexion).toLocaleString('fr-FR') : 'Jamais'}</td>
                    <td>
                      <div className="action-buttons-inline">
                        <button
                          onClick={() => startEditUser(u)}
                          className="btn btn-sm btn-outline"
                          title="Modifier l'utilisateur"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => handleResetPassword(u.id, u.nom)}
                          className="btn btn-sm btn-outline"
                          title="Réinitialiser le mot de passe"
                        >
                          <KeyRound size={13} />
                        </button>
                        <button
                          onClick={() => handleToggleActif(u.id, u.actif)}
                          className={`btn btn-sm ${u.actif ? 'btn-danger' : 'btn-success'}`}
                        >
                          {u.actif ? 'Désactiver' : 'Activer'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4 : ANALYSES SPATIALES & RETEX (SIG) */}
      {activeTab === 'analyses' && (
        <div>
          {/* Header Box SIG */}
          <div className="sig-header-box">
            <div>
              <span className="sig-header-tag">Phase 3 — Référentiel Géomatique & Géostatistique EPSG:32630</span>
              <div className="sig-header-title">Analyses Spatiales Multi-Échelles & RETEX Post-Crise</div>
              <p className="sig-header-desc">
                Limites réelles des 13 communes d'Abidjan (OSM / OCHA COD-AB), maillage hexagonal de 300 m (EPSG:32630)
                croisant WorldPop 100 m, MNT (~38 m) et hydrographie, corridors PostGIS{' '}
                <code>ST_ClusterDBSCAN + ST_ConcaveHull</code>, autocorrélation <code>Getis-Ord Gi*</code>, indice
                multicritère <code>Aléa × Exposition × Vulnérabilité</code> (Fisher-Jenks) et modèle de Poisson Observé / Attendu.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => loadAnalyses(selectedSigZoneId, hexThematique)}
                className="btn btn-outline"
                style={{ color: '#ffffff', borderColor: 'rgba(255,255,255,0.4)' }}
                disabled={loadingAnalyses}
                title="Recalculer les analyses spatiales"
              >
                <RefreshCw size={16} className={loadingAnalyses ? 'spin' : ''} />
                <span>Recalculer</span>
              </button>
              <button
                onClick={() => downloadFile('/analyses/retex.pdf', 'OID-RETEX-Post-Crise.pdf')}
                className="sig-retex-btn"
                title="Générer et télécharger le rapport institutionnel RETEX en PDF"
              >
                <FileText size={18} />
                <span>Télécharger le RETEX (.PDF)</span>
              </button>
            </div>
          </div>

          {/* Bandeau méthodologique & indicateurs géomatiques */}
          {sigMetadata && (
            <div className="sig-meta-strip">
              <div className="sig-meta-item">
                <span className="sig-meta-label">Projection métrique</span>
                <strong>{sigMetadata.scr_calcul}</strong>
              </div>
              <div className="sig-meta-item">
                <span className="sig-meta-label">Couverture administrative</span>
                <strong>
                  {sigMetadata.couverture_administrative.nb_communes} communes ·{' '}
                  {sigMetadata.couverture_administrative.superficie_totale_km2.toLocaleString('fr-FR')} km²
                </strong>
              </div>
              <div className="sig-meta-item">
                <span className="sig-meta-label">Maillage hexagonal actif</span>
                <strong>
                  {sigMetadata.maillage_hexagonal.nb_mailles_actives.toLocaleString('fr-FR')} mailles ({sigMetadata.maillage_hexagonal.cote_m} m · {sigMetadata.maillage_hexagonal.superficie_unitaire_km2} km²)
                </strong>
              </div>
              <div className="sig-meta-item">
                <span className="sig-meta-label">Population WorldPop 100 m</span>
                <strong>
                  {Math.round(sigMetadata.couverture_administrative.population_totale_worldpop).toLocaleString('fr-FR')} hab.
                </strong>
              </div>
              {sigMetadata.maillage_hexagonal.altitude_max_m !== undefined && (
                <div className="sig-meta-item">
                  <span className="sig-meta-label">Relief MNT & Aléa moyen</span>
                  <strong>
                    {sigMetadata.maillage_hexagonal.altitude_min_m ?? 0}–{sigMetadata.maillage_hexagonal.altitude_max_m} m · Aléa{' '}
                    {sigMetadata.maillage_hexagonal.indice_alea_moyen ?? 0}/100
                  </strong>
                </div>
              )}
            </div>
          )}

          {/* CARTE SIG INTERACTIVE MULTI-COUCHES */}
          <div id="sig-map-anchor" className="card" style={{ marginBottom: '2rem', padding: '1.25rem' }}>
            <div className="sig-section-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Map size={22} color="var(--primary)" />
                <span>Cartographie Décisionnelle Multi-Thématique (WorldPop · Aléa MNT · Risque IV · Getis-Ord Gi*)</span>
              </div>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Rendu vectoriel Canvas · Échelle métrique · Enveloppes DBSCAN concaves · Coordonnées WGS84 & UTM 30N
              </span>
            </div>
            <SigAnalysisMap
              communesGeoJson={communesGeoJson}
              maillesGeoJson={maillesGeoJson}
              getisOrdGeoJson={getisOrdGeoJson}
              hexThematique={hexThematique}
              onChangeHexThematique={handleChangeHexThematique}
              hotspots={pointsChauds}
              vulnerabilities={vulnerabilites}
              silentZones={zonesSilencieuses}
              incidentsGeoJson={carteGeoJson}
              sigMetadata={sigMetadata}
              selectedZoneId={selectedSigZoneId}
              onSelectZoneId={handleSelectSigZone}
              focusTarget={sigFocusTarget}
            />
          </div>

          {/* Section 1 : Corridors DBSCAN + ConcaveHull & Autocorrélation Getis-Ord Gi* */}
          <div className="card" style={{ marginBottom: '2rem' }}>
            <div className="sig-section-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Flame size={22} color="#dc2626" />
                <span>1. Corridors d'Inondation (ST_ClusterDBSCAN + ST_ConcaveHull) & Autocorrélation Getis-Ord Gi*</span>
              </div>
              <button
                onClick={() => {
                  handleChangeHexThematique('getis_ord');
                  document.getElementById('sig-map-anchor')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="btn btn-sm btn-outline"
                title="Basculer le maillage hexagonal sur la carte des z-scores Getis-Ord Gi*"
              >
                <Layers size={14} />
                <span>Afficher la couche Getis-Ord Gi* sur la carte</span>
              </button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Clustering métrique déterministe en projection <strong>EPSG:32630</strong> (<code>eps = 450 m</code>,{' '}
              <code>minpoints = 2</code>, filtrage du bruit spatial) couplé à une enveloppe concave organique
              (<code>ST_ConcaveHull</code>) et au test local d'autocorrélation spatiale <strong>Getis-Ord Gi*</strong>{' '}
              (voisinage euclidien <code>d ≤ 900 m</code>).
            </p>

            {/* Résumé statistique Getis-Ord Gi* */}
            {getisOrdGeoJson && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  background: '#f8fafc',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 1rem',
                  marginBottom: '1.25rem',
                  alignItems: 'center',
                  fontSize: '0.84rem',
                }}
              >
                <strong style={{ color: 'var(--navy)' }}>Synthèse Getis-Ord Gi* (mailles 300 m) :</strong>
                <span className="badge badge-danger">
                  Points chauds 99 % (Z ≥ 2,58) : {getisOrdGeoJson.resume.nb_hotspots_99}
                </span>
                <span className="badge" style={{ background: '#ffedd5', color: '#c2410c', fontWeight: 700 }}>
                  Points chauds 95 % (Z ≥ 1,96) : {getisOrdGeoJson.resume.nb_hotspots_95}
                </span>
                <span className="badge badge-secondary">
                  Points chauds 90 % (Z ≥ 1,65) : {getisOrdGeoJson.resume.nb_hotspots_90}
                </span>
                <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 700 }}>
                  Pic Z(Gi*) = {getisOrdGeoJson.resume.z_max >= 0 ? '+' : ''}
                  {getisOrdGeoJson.resume.z_max.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {pointsChauds.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Aucun corridor multi-observations (<code>minpoints ≥ 2</code> sous <code>450 m</code>) détecté actuellement — les sinistres isolés sont filtrés comme bruit spatial DBSCAN.
              </p>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Corridor</th>
                      <th>Centroïde (WGS84 & UTM 30N)</th>
                      <th>Emprise Concave</th>
                      <th>Observations DBSCAN</th>
                      <th>Dangers Vitaux</th>
                      <th>Priorité Moy.</th>
                      <th>Récurrence</th>
                      <th>Typologies</th>
                      <th>Actions SIG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pointsChauds.map((pt) => (
                      <tr key={pt.cluster_id}>
                        <td><strong>#{pt.cluster_id}</strong></td>
                        <td>
                          <div><code>{pt.centre.lat.toFixed(5)}, {pt.centre.lon.toFixed(5)}</code></div>
                          {pt.centre.utm_e !== undefined && pt.centre.utm_n !== undefined && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              E {Math.round(pt.centre.utm_e).toLocaleString('fr-FR')} m · N {Math.round(pt.centre.utm_n).toLocaleString('fr-FR')} m
                            </div>
                          )}
                        </td>
                        <td>
                          <strong>
                            {pt.superficie_cluster_km2 !== undefined
                              ? `${pt.superficie_cluster_km2.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} km²`
                              : '-'}
                          </strong>
                          {pt.perimetre_m !== undefined && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Périmètre {Math.round(pt.perimetre_m).toLocaleString('fr-FR')} m
                            </div>
                          )}
                        </td>
                        <td>
                          <strong>{pt.nombre_observations ?? pt.nombre_incidents}</strong> obs.
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {pt.nombre_incidents} inc. · {pt.nombre_signalements ?? 0} sig.
                          </div>
                        </td>
                        <td>
                          {pt.danger_immediat_total > 0 ? (
                            <span className="badge badge-danger">
                              <AlertTriangle size={12} /> {pt.danger_immediat_total} critique(s)
                            </span>
                          ) : (
                            <span className="badge badge-success">0 critique</span>
                          )}
                        </td>
                        <td>
                          <strong>{pt.score_moyen_priorite}</strong> / 100
                        </td>
                        <td>
                          <span className={`sig-badge sig-badge-${pt.niveau_recurrence}`}>
                            {pt.niveau_recurrence}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                            {pt.types_dominants.map((t, i) => (
                              <span key={i} className="badge badge-secondary" style={{ fontSize: '0.72rem' }}>
                                {t}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <button
                              onClick={() => {
                                setSigFocusTarget({ lat: pt.centre.lat, lon: pt.centre.lon, zoom: 15 });
                                document.getElementById('sig-map-anchor')?.scrollIntoView({ behavior: 'smooth' });
                              }}
                              className="btn btn-sm btn-primary"
                              title="Centrer la carte sur l'enveloppe concave de ce corridor"
                            >
                              <Crosshair size={13} />
                              <span>Localiser</span>
                            </button>
                            <a
                              href={`https://www.google.com/maps?q=${pt.centre.lat},${pt.centre.lon}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm btn-outline"
                              title="Ouvrir le centroïde sur Google Maps"
                            >
                              <ExternalLink size={13} />
                              <span>GPS</span>
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 2 : Indice Multicritère Documenté (Aléa × Exposition × Vulnérabilité) */}
          <div className="card" style={{ marginBottom: '2rem' }}>
            <div className="sig-section-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Activity size={22} color="#ea580c" />
                <span>2. Indice Multicritère de Risque (Aléa × Exposition × Vulnérabilité — 13 Communes)</span>
              </div>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    handleChangeHexThematique('alea');
                    document.getElementById('sig-map-anchor')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="btn btn-sm btn-outline"
                >
                  Carte d'Aléa MNT/Hydro
                </button>
                <button
                  onClick={() => {
                    handleChangeHexThematique('vulnerabilite');
                    document.getElementById('sig-map-anchor')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="btn btn-sm btn-outline"
                >
                  Carte Risque IV par maille
                </button>
              </div>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              Formulation géomatique normalisée sur <code>[0, 100]</code> conforme au cadre UNDRR :{' '}
              <code>IV = 100 × Aléa^0,40 × Exposition^0,35 × Vulnérabilité^0,25</code>, croisant le MNT SRTM/Copernicus,
              la distance métrique au réseau hydrographique OSM, la démographie WorldPop 100 m et les sinistres actifs
              {vulnerabilites[0]?.jenks_gvf !== undefined && (
                <> (seuils naturels de Fisher-Jenks, <strong>GVF = {vulnerabilites[0].jenks_gvf.toFixed(3)}</strong>)</>
              )}.
            </p>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Commune (Code)</th>
                    <th>Population WorldPop</th>
                    <th>Relief & Hydro (UTM)</th>
                    <th>Aléa</th>
                    <th>Exposition</th>
                    <th>Vulnérabilité</th>
                    <th style={{ minWidth: '155px' }}>Indice IV (/100)</th>
                    <th>Classe Jenks</th>
                    <th>Cartographie</th>
                  </tr>
                </thead>
                <tbody>
                  {vulnerabilites.map((v) => (
                    <tr key={v.zone_id}>
                      <td>
                        <strong>{v.zone_nom}</strong>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          {v.code_adm} · {v.superficie_km2?.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km²
                        </div>
                      </td>
                      <td>
                        <strong>{Math.round(v.population_totale || 0).toLocaleString('fr-FR')}</strong> hab.
                        {v.population_zone_inondable !== undefined && (
                          <div style={{ fontSize: '0.74rem', color: '#b45309' }}>
                            dont {Math.round(v.population_zone_inondable).toLocaleString('fr-FR')} en bas-fonds
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.84rem' }}>
                          Alt. <strong>{v.altitude_moy_m?.toFixed(1) ?? '-'} m</strong>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Hydro {v.dist_hydro_moy_m !== undefined ? `${Math.round(v.dist_hydro_moy_m)} m` : '-'} ·{' '}
                          {Math.round(v.densite_hab_km2 || 0).toLocaleString('fr-FR')} hab./km²
                        </div>
                      </td>
                      <td>
                        <strong>{v.score_alea !== undefined ? v.score_alea.toFixed(0) : '-'}</strong>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>/100</span>
                      </td>
                      <td>
                        <strong>{v.score_exposition !== undefined ? v.score_exposition.toFixed(0) : '-'}</strong>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>/100</span>
                      </td>
                      <td>
                        <strong>
                          {v.score_vulnerabilite_soc !== undefined ? v.score_vulnerabilite_soc.toFixed(0) : '-'}
                        </strong>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>/100</span>
                        {v.nombre_incidents > 0 && (
                          <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                            {v.nombre_incidents} inc.{v.dangers_immediats > 0 ? ` (${v.dangers_immediats} vitaux)` : ''}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 700 }}>
                          <span>{v.indice_vulnerabilite.toFixed(1)}</span>
                          <span style={{ color: 'var(--text-muted)' }}>/ 100</span>
                        </div>
                        <div className="vuln-bar-bg">
                          <div
                            className="vuln-bar-fill"
                            style={{
                              width: `${Math.min(100, Math.max(5, v.indice_vulnerabilite))}%`,
                              backgroundColor: v.couleur,
                            }}
                          />
                        </div>
                      </td>
                      <td>
                        <span className={`sig-badge sig-badge-${v.classe_risque}`}>
                          {v.classe_jenks_label || v.classe_risque}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => {
                            handleSelectSigZone(v.zone_id);
                            if (v.centre) {
                              setSigFocusTarget({ lat: v.centre.lat, lon: v.centre.lon, zoom: 13 });
                            }
                            document.getElementById('sig-map-anchor')?.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className="btn btn-sm btn-outline"
                          title="Filtrer les mailles 300 m et cadrer sur cette commune"
                        >
                          <Crosshair size={13} />
                          <span>Maillage</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3 : Détection des Zones Silencieuses par Modèle de Poisson Observé / Attendu */}
          <div className="card">
            <div className="sig-section-title">
              <VolumeX size={22} color="#dc2626" />
              <span>3. Zones Silencieuses — Modèle Statistique de Poisson (Observé Oᵢ vs Attendu Eᵢ)</span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              Comparaison entre le nombre de remontées observées <code>Oᵢ</code> et l'espérance théorique{' '}
              <code>Eᵢ ∝ Population WorldPop × Aléa physique</code>. Un résidu de déviance fortement négatif
              (<code>r_D ≤ -1,10</code>) signale un déficit anormal de signalements (coupure électrique CIE, panne de relais télécom ou enclavement).
            </p>

            {zonesSilencieuses.length === 0 ? (
              <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={18} />
                <span>
                  Aucune anomalie statistique de sous-signalement (Poisson <code>Oᵢ / Eᵢ</code>) détectée sur les 13 communes au regard du volume actuel d'incidents.
                </span>
              </div>
            ) : (
              <div>
                {zonesSilencieuses.map((z) => (
                  <div
                    key={z.zone_id}
                    className={`silent-zone-card ${z.niveau_severite === 'moyenne' ? 'warning-level' : ''}`}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '1.05rem', color: 'var(--navy)' }}>{z.zone_nom}</strong>
                        <span className={`sig-badge ${z.niveau_severite === 'haute' ? 'sig-badge-critique' : 'sig-badge-forte'}`}>
                          {z.statut_alerte}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {z.observe !== undefined && z.attendu !== undefined && (
                          <span
                            style={{
                              fontSize: '0.8rem',
                              fontFamily: 'monospace',
                              background: '#fef2f2',
                              border: '1px solid #fecaca',
                              color: '#991b1b',
                              padding: '0.18rem 0.55rem',
                              borderRadius: '4px',
                              fontWeight: 700,
                            }}
                          >
                            Oᵢ = {z.observe} vs Eᵢ = {z.attendu.toFixed(2)} ({z.ecart_relatif_pct !== undefined && z.ecart_relatif_pct >= 0 ? '+' : ''}
                            {z.ecart_relatif_pct?.toFixed(0)} %) · r_D = {z.residu_poisson?.toFixed(2)} · p = {z.p_value_poisson?.toFixed(3)}
                          </span>
                        )}
                        {z.centre && (
                          <button
                            onClick={() => {
                              setSigFocusTarget({ lat: z.centre!.lat, lon: z.centre!.lon, zoom: 13 });
                              document.getElementById('sig-map-anchor')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="btn btn-sm btn-outline"
                            title="Centrer la carte sur cette zone silencieuse"
                          >
                            <Crosshair size={13} />
                            <span>Voir sur carte</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <p style={{ fontSize: '0.92rem', color: '#334155', marginBottom: '0.5rem' }}>
                      {z.motif}
                    </p>

                    <div className="silent-zone-action-box">
                      <AlertTriangle size={16} color="#dc2626" />
                      <span>
                        <strong>Action opérationnelle préconisée :</strong> {z.action_requise}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
