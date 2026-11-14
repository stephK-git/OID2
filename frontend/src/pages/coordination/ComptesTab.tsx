import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import type { UserRoleFilter, UtilisateurItem, ZoneItem } from './types';
import { ROLE_LABELS } from './helpers';

interface ComptesTabProps {
  zones: ZoneItem[];
  /** Recharge les données partagées (la charge des enquêteurs change avec les comptes). */
  onDataChanged: () => Promise<void> | void;
  onError: (msg: string) => void;
  refreshKey: number;
}

export const ComptesTab: React.FC<ComptesTabProps> = ({ zones, onDataChanged, onError, refreshKey }) => {
  const [utilisateurs, setUtilisateurs] = useState<UtilisateurItem[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<UserRoleFilter>('tous');

  // Nouveau compte
  const [showNewUser, setShowNewUser] = useState(false);
  const [newNom, setNewNom] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('enqueteur');
  const [newZoneId, setNewZoneId] = useState<number | ''>('');

  // Édition
  const [editingUser, setEditingUser] = useState<UtilisateurItem | null>(null);
  const [editNom, setEditNom] = useState('');
  const [editRole, setEditRole] = useState('enqueteur');
  const [editZoneId, setEditZoneId] = useState<number | ''>('');

  const loadUtilisateurs = useCallback(async () => {
    try {
      setUtilisateurs(await apiFetch<UtilisateurItem[]>('/coordination/utilisateurs'));
    } catch (err: any) {
      onError(err.message);
    }
  }, [onError]);

  useEffect(() => {
    loadUtilisateurs();
  }, [loadUtilisateurs, refreshKey]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return utilisateurs.filter((u) => {
      if (userRoleFilter !== 'tous' && u.role !== userRoleFilter) return false;
      if (!q) return true;
      const zone = zones.find((z) => z.id === u.zone_id);
      return (
        u.nom.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (zone && zone.nom.toLowerCase().includes(q))
      );
    });
  }, [utilisateurs, zones, userSearch, userRoleFilter]);

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
      await Promise.all([loadUtilisateurs(), onDataChanged()]);
      alert('Utilisateur créé avec succès.');
    } catch (err: any) {
      alert(`Erreur création : ${err.message}`);
    }
  };

  const handleToggleActif = async (uid: number, actifActuel: boolean) => {
    try {
      await apiFetch(`/coordination/utilisateurs/${uid}/actif?actif=${!actifActuel}`, { method: 'PATCH' });
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
      await apiFetch(
        `/coordination/utilisateurs/${uid}/mot-de-passe?nouveau_mot_de_passe=${encodeURIComponent(newPass)}`,
        { method: 'PATCH' }
      );
      alert(`Mot de passe mis à jour avec succès pour ${nom}.`);
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    }
  };

  const startEditUser = (u: UtilisateurItem) => {
    setShowNewUser(false);
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
      await Promise.all([loadUtilisateurs(), onDataChanged()]);
      alert('Utilisateur modifié avec succès.');
    } catch (err: any) {
      alert(`Erreur modification : ${err.message}`);
    }
  };

  return (
    <div className="oid-coord-stack">
        <div className="oid-coord-stack">
          <div className="oid-coord-kpi-grid">
            <div className="oid-coord-sig-meta-card">
              <span className="oid-coord-sig-meta-lbl">Total Comptes</span>
              <strong>{utilisateurs.length}</strong>
            </div>
            <div className="oid-coord-sig-meta-card">
              <span className="oid-coord-sig-meta-lbl">Comptes Actifs</span>
              <strong className="text-mint">{utilisateurs.filter((u) => u.actif).length}</strong>
            </div>
            <div className="oid-coord-sig-meta-card">
              <span className="oid-coord-sig-meta-lbl">Enquêteurs Terrain</span>
              <strong className="text-cyan">
                {utilisateurs.filter((u) => u.role === 'enqueteur').length}
              </strong>
            </div>
            <div className="oid-coord-sig-meta-card">
              <span className="oid-coord-sig-meta-lbl">Vérificateurs &amp; Coord.</span>
              <strong className="text-sky">
                {utilisateurs.filter((u) => u.role !== 'enqueteur').length}
              </strong>
            </div>
          </div>

          <div className="oid-coord-panel">
            <div className="oid-coord-panel-head">
              <div className="oid-coord-map-filters-left">
                <div className="oid-coord-filter-chip search">
                  <span className="material-symbols-outlined">search</span>
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Rechercher un agent par nom, email ou commune..."
                    className="oid-coord-map-search-input"
                  />
                </div>

                <div className="oid-coord-filter-chip">
                  <span className="material-symbols-outlined">badge</span>
                  <select
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value as UserRoleFilter)}
                    className="oid-coord-transparent-select"
                  >
                    <option value="tous">Tous les rôles</option>
                    <option value="enqueteur">Enquêteurs terrain</option>
                    <option value="verificateur">Vérificateurs</option>
                    <option value="coordinateur">Coordinateurs</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingUser(null);
                  setShowNewUser(!showNewUser);
                }}
                className="oid-coord-retex-dl-btn"
              >
                <span className="material-symbols-outlined">person_add</span>
                <span>Nouveau compte</span>
              </button>
            </div>

            {showNewUser && (
              <form onSubmit={handleCreateUser} className="oid-coord-user-form">
                <h4>Création d'un nouveau compte agent</h4>
                <div className="oid-coord-user-form-grid">
                  <input
                    type="text"
                    placeholder="Nom complet (ex: Kouassi Marc)"
                    value={newNom}
                    onChange={(e) => setNewNom(e.target.value)}
                    className="oid-coord-input"
                    required
                  />
                  <input
                    type="email"
                    placeholder="Email professionnel"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="oid-coord-input"
                    required
                  />
                  <input
                    type="password"
                    placeholder="Mot de passe initial (min. 8 car.)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="oid-coord-input"
                    required
                    minLength={8}
                  />
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="oid-coord-input"
                  >
                    <option value="enqueteur">Enquêteur de terrain</option>
                    <option value="verificateur">Vérificateur cellule</option>
                    <option value="coordinateur">Coordinateur</option>
                  </select>
                  <select
                    value={newZoneId}
                    onChange={(e) => setNewZoneId(e.target.value ? Number(e.target.value) : '')}
                    className="oid-coord-input"
                  >
                    <option value="">Toutes communes (District)</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.nom}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="oid-coord-actions-group" style={{ marginTop: '0.85rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowNewUser(false)}
                    className="oid-coord-btn-action neutral"
                  >
                    Annuler
                  </button>
                  <button type="submit" className="oid-coord-btn-action primary">
                    Créer le compte
                  </button>
                </div>
              </form>
            )}

            {editingUser && (
              <form onSubmit={handleSaveEditUser} className="oid-coord-user-form">
                <h4>Modifier le profil : {editingUser.email}</h4>
                <div className="oid-coord-user-form-grid">
                  <input
                    type="text"
                    placeholder="Nom complet"
                    value={editNom}
                    onChange={(e) => setEditNom(e.target.value)}
                    className="oid-coord-input"
                    required
                  />
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="oid-coord-input"
                  >
                    <option value="enqueteur">Enquêteur de terrain</option>
                    <option value="verificateur">Vérificateur cellule</option>
                    <option value="coordinateur">Coordinateur</option>
                  </select>
                  <select
                    value={editZoneId}
                    onChange={(e) => setEditZoneId(e.target.value ? Number(e.target.value) : '')}
                    className="oid-coord-input"
                  >
                    <option value="">Toutes communes (District)</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.nom}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="oid-coord-actions-group" style={{ marginTop: '0.85rem' }}>
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="oid-coord-btn-action neutral"
                  >
                    Annuler
                  </button>
                  <button type="submit" className="oid-coord-btn-action primary">
                    Enregistrer
                  </button>
                </div>
              </form>
            )}

            <div className="oid-coord-table-wrap">
              <table className="oid-coord-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Email</th>
                    <th>Rôle</th>
                    <th>Secteur / Commune</th>
                    <th>Dossiers actifs</th>
                    <th>Statut</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => {
                    const zName = zones.find((z) => z.id === u.zone_id)?.nom || 'District Autonome';
                    return (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.nom}</strong>
                        </td>
                        <td className="mono">{u.email}</td>
                        <td>
                          <span className="oid-coord-status-pill status-ouvert">
                            {ROLE_LABELS[u.role] || u.role}
                          </span>
                        </td>
                        <td>{zName}</td>
                        <td className="mono">{u.dossiers_actifs}</td>
                        <td>
                          <span
                            className={`oid-coord-status-pill ${
                              u.actif ? 'status-evalue' : 'status-cloture'
                            }`}
                          >
                            {u.actif ? 'ACTIF' : 'SUSPENDU'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="oid-coord-actions-group">
                            <button
                              type="button"
                              onClick={() => startEditUser(u)}
                              className="oid-coord-btn-action neutral"
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResetPassword(u.id, u.nom)}
                              className="oid-coord-btn-action neutral"
                            >
                              MDP
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActif(u.id, u.actif)}
                              className={`oid-coord-btn-action ${u.actif ? 'reopen' : 'primary'}`}
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
          </div>
        </div>
    </div>
  );
};
