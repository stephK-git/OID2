import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import type { UserRoleFilter, UtilisateurItem, ZoneItem } from './types';
import { ROLE_LABELS } from './helpers';
import { FilterChips, SearchField } from './FilterControls';

interface ComptesTabProps {
  zones: ZoneItem[];
  /** Recharge les données partagées (la charge des enquêteurs change avec les comptes). */
  onDataChanged: () => Promise<void> | void;
  onError: (msg: string) => void;
  showToast: (msg: string) => void;
  refreshKey: number;
}

/** Icônes d'action en SVG : la police d'icônes embarquée ne contient qu'un sous-ensemble. */
const ACTION_ICON_PATHS: Record<'edit' | 'key' | 'lock' | 'unlock', string> = {
  edit: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4',
  key: 'M14.5 9.5a4.5 4.5 0 1 1-1.3-3.2M12 12l8 8M17 17l2-2M19 19l1.5-1.5',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  unlock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2',
};

const ActionIcon: React.FC<{ name: keyof typeof ACTION_ICON_PATHS }> = ({ name }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ACTION_ICON_PATHS[name]} />
  </svg>
);

export const ComptesTab: React.FC<ComptesTabProps> = ({ zones, onDataChanged, onError, showToast, refreshKey }) => {
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
      showToast('Compte créé.');
    } catch (err: any) {
      onError(err.message);
    }
  };

  const handleToggleActif = async (u: UtilisateurItem) => {
    const { id: uid, actif: actifActuel } = u;
    if (actifActuel) {
      const charge =
        u.dossiers_actifs > 0
          ? `

${u.nom} a encore ${u.dossiers_actifs} dossier(s) actif(s) : pensez à les réaffecter.`
          : '';
      if (!window.confirm(`Suspendre le compte de ${u.nom} ? Il ne pourra plus se connecter.${charge}`)) return;
    }
    try {
      await apiFetch(`/coordination/utilisateurs/${uid}/actif?actif=${!actifActuel}`, { method: 'PATCH' });
      showToast(actifActuel ? `Compte de ${u.nom} suspendu.` : `Compte de ${u.nom} réactivé.`);
      await Promise.all([loadUtilisateurs(), onDataChanged()]);
    } catch (err: any) {
      onError(err.message);
    }
  };

  const handleResetPassword = async (uid: number, nom: string) => {
    const newPass = window.prompt(`Entrez le nouveau mot de passe pour ${nom} (minimum 8 caractères) :`);
    if (!newPass) return;
    if (newPass.length < 8) {
      showToast('Le mot de passe doit comporter au moins 8 caractères.');
      return;
    }
    try {
      await apiFetch(
        `/coordination/utilisateurs/${uid}/mot-de-passe`,
        { method: 'PATCH', body: JSON.stringify({ nouveau_mot_de_passe: newPass }) }
      );
      showToast(`Mot de passe de ${nom} réinitialisé.`);
    } catch (err: any) {
      onError(err.message);
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
          // 0 = retirer la commune (null signifie « ne pas modifier » côté API)
          zone_id: editZoneId ? Number(editZoneId) : 0,
        }),
      });
      setEditingUser(null);
      await Promise.all([loadUtilisateurs(), onDataChanged()]);
      showToast('Profil mis à jour.');
    } catch (err: any) {
      onError(err.message);
    }
  };

  return (
    <div className="oid-coord-stack coord-comptes">
        <div className="oid-coord-stack">
          <div className="coord-comptes-kpis">
            {[
              { lbl: 'Total comptes', v: utilisateurs.length, icon: 'groups', cls: '' },
              { lbl: 'Comptes actifs', v: utilisateurs.filter((u) => u.actif).length, icon: 'verified', cls: 'is-ok' },
              { lbl: 'Enquêteurs terrain', v: utilisateurs.filter((u) => u.role === 'enqueteur').length, icon: 'person_pin_circle', cls: 'is-water' },
              { lbl: 'Vérificateurs & coord.', v: utilisateurs.filter((u) => u.role !== 'enqueteur').length, icon: 'shield', cls: 'is-violet' },
            ].map((k) => (
              <div key={k.lbl} className={`coord-comptes-kpi ${k.cls}`}>
                <span className="material-symbols-outlined coord-comptes-kpi-icon" aria-hidden="true">{k.icon}</span>
                <div>
                  <span className="coord-comptes-kpi-lbl">{k.lbl}</span>
                  <strong>{k.v}</strong>
                </div>
              </div>
            ))}
          </div>

          <div className="oid-coord-panel">
            <div className="oid-coord-panel-head">
              <div className="cf-bar-row cf-bar-row-grow">
                <SearchField
                  value={userSearch}
                  onChange={setUserSearch}
                  placeholder="Nom, e-mail ou commune…"
                  className="cf-search-grow"
                />
                <FilterChips<UserRoleFilter>
                  ariaLabel="Filtrer par rôle"
                  value={userRoleFilter}
                  onChange={setUserRoleFilter}
                  options={[
                    { value: 'tous', label: 'Tous', count: utilisateurs.length },
                    { value: 'enqueteur', label: 'Enquêteurs', count: utilisateurs.filter((u) => u.role === 'enqueteur').length },
                    { value: 'verificateur', label: 'Vérificateurs', count: utilisateurs.filter((u) => u.role === 'verificateur').length },
                    { value: 'coordinateur', label: 'Coordinateurs', count: utilisateurs.filter((u) => u.role === 'coordinateur').length },
                  ]}
                />
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
                    <th>Rôle</th>
                    <th className="coord-col-zone">Secteur</th>
                    <th>Dossiers</th>
                    <th>Statut</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--tx3)' }}>
                        Aucun compte ne correspond à la recherche.
                      </td>
                    </tr>
                  )}
                  {filteredUsers.map((u) => {
                    const zName = zones.find((z) => z.id === u.zone_id)?.nom || 'Tout le district';
                    const initiales = u.nom
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join('')
                      .toUpperCase();
                    return (
                      <tr key={u.id} className={u.actif ? '' : 'row-closed'}>
                        <td>
                          <div className="coord-agent-cell">
                            <span className={`coord-agent-avatar role-${u.role}`} aria-hidden="true">
                              {initiales}
                            </span>
                            <span className="coord-agent-id">
                              <strong>{u.nom}</strong>
                              <span className="mono">{u.email}</span>
                              <span className="coord-agent-zone">{zName}</span>
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`coord-role-pill role-${u.role}`}>{ROLE_LABELS[u.role] || u.role}</span>
                        </td>
                        <td className="coord-col-zone">{zName}</td>
                        <td className="mono">{u.role === 'enqueteur' ? u.dossiers_actifs : '—'}</td>
                        <td>
                          <span className={`coord-account-state ${u.actif ? 'is-active' : 'is-suspended'}`}>
                            <i aria-hidden="true" />
                            {u.actif ? 'Actif' : 'Suspendu'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="coord-row-actions">
                            <button
                              type="button"
                              onClick={() => startEditUser(u)}
                              className="coord-icon-action"
                              title="Modifier le profil"
                              aria-label={`Modifier le profil de ${u.nom}`}
                            >
                              <ActionIcon name="edit" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResetPassword(u.id, u.nom)}
                              className="coord-icon-action"
                              title="Réinitialiser le mot de passe"
                              aria-label={`Réinitialiser le mot de passe de ${u.nom}`}
                            >
                              <ActionIcon name="key" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActif(u)}
                              className={`coord-icon-action ${u.actif ? 'is-danger' : 'is-ok'}`}
                              title={u.actif ? 'Suspendre le compte' : 'Réactiver le compte'}
                              aria-label={`${u.actif ? 'Suspendre' : 'Réactiver'} le compte de ${u.nom}`}
                            >
                              <ActionIcon name={u.actif ? 'lock' : 'unlock'} />
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
