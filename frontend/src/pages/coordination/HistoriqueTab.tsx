import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, apiUrl } from '../../api/client';
import { EnqueteReportView } from '../../components/EnqueteReportView';
import { FilterChips, SearchField, SegmentedControl, type ChipOption } from './FilterControls';
import type { CoordData, IncidentItem } from './types';
import {
  formatIncidentRef,
  formatIncidentType,
  formatShortDate,
  getIncidentTypeMeta,
  resolveIncidentCommune,
} from './helpers';

type HistoriqueSort = 'date' | 'priorite' | 'commune';

const PAGE_SIZE = 15;

interface HistoriqueTabProps {
  data: CoordData;
  loading: boolean;
  /** Incident dont le rapport est ouvert en pleine page (null : tableau). */
  openReportId: number | null;
  onChangeOpenReportId: (id: number | null) => void;
  onShowOnMap: (id: number) => void;
  onDataChanged: () => Promise<void> | void;
  showToast: (msg: string) => void;
}

const closedAt = (inc: IncidentItem) => inc.cloture_le || inc.maj_le || null;
const ts = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
/** Même référence que l'en-tête du rapport d'enquête ; les références déjà préfixées restent telles quelles. */
const formatPublicRef = (ref: string) =>
  ref.includes('-') ? ref.toUpperCase() : `OID-ABJ-${ref.slice(0, 10).toUpperCase()}`;

export const HistoriqueTab: React.FC<HistoriqueTabProps> = ({
  data,
  loading,
  openReportId,
  onChangeOpenReportId,
  onShowOnMap,
  onDataChanged,
  showToast,
}) => {
  const { zones } = data;
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<HistoriqueSort>('date');
  const [commune, setCommune] = useState('toutes');
  const [page, setPage] = useState(1);

  // Tout changement de critère ramène en page 1
  const changeSearch = (v: string) => {
    setSearch(v);
    setPage(1);
  };
  const changeSort = (v: HistoriqueSort) => {
    setSort(v);
    setPage(1);
  };
  const changeCommune = (v: string) => {
    setCommune(v);
    setPage(1);
  };

  const closed = useMemo(
    () =>
      data.incidents
        .filter((i) => i.statut === 'cloture')
        .map((inc) => ({ inc, commune: resolveIncidentCommune(inc, zones) })),
    [data.incidents, zones]
  );

  const communeChips: ChipOption<string>[] = useMemo(() => {
    const counts = new Map<string, number>();
    closed.forEach(({ commune: c }) => counts.set(c, (counts.get(c) || 0) + 1));
    return [
      { value: 'toutes', label: 'Toutes les communes', count: closed.length },
      ...[...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'fr'))
        .map(([c, n]) => ({ value: c, label: c, count: n })),
    ];
  }, [closed]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^#/, '');
    return closed
      .filter(({ inc, commune: c }) => {
        if (commune !== 'toutes' && c !== commune) return false;
        if (!q) return true;
        return [
          String(inc.id),
          `inc-${inc.id}`,
          inc.reference_publique,
          inc.type,
          getIncidentTypeMeta(inc.type).title,
          c,
          inc.enqueteur_nom || '',
          inc.description_synthese || '',
        ].some((v) => v.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        if (sort === 'priorite') return b.inc.score_priorite - a.inc.score_priorite;
        if (sort === 'commune') return a.commune.localeCompare(b.commune, 'fr') || ts(closedAt(b.inc)) - ts(closedAt(a.inc));
        return ts(closedAt(b.inc)) - ts(closedAt(a.inc));
      });
  }, [closed, search, commune, sort]);


  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openIncident = openReportId != null ? data.incidents.find((i) => i.id === openReportId) : undefined;

  // Un identifiant qui ne correspond plus à un incident clôturé (ex. rouvert entre-temps) ramène au tableau
  useEffect(() => {
    if (openReportId != null && !loading && data.incidents.length > 0 && openIncident?.statut !== 'cloture') {
      onChangeOpenReportId(null);
    }
  }, [openReportId, openIncident, loading, data.incidents.length, onChangeOpenReportId]);

  if (openIncident && openIncident.statut === 'cloture') {
    return (
      <HistoriqueReport
        incident={openIncident}
        communeLabel={resolveIncidentCommune(openIncident, zones)}
        onBack={() => onChangeOpenReportId(null)}
        onShowOnMap={onShowOnMap}
        onDataChanged={onDataChanged}
        showToast={showToast}
      />
    );
  }

  const isFiltered = Boolean(search.trim()) || commune !== 'toutes';

  return (
    <section className="coord-hist">
      <div className="oid-coord-panel coord-hist-panel">
        <div className="cf-bar coord-hist-toolbar">
          <div className="cf-bar-row">
            <SearchField
              value={search}
              onChange={changeSearch}
              placeholder="Rechercher : #ID, réf, type, commune, enquêteur…"
              className="cf-search-grow"
            />
            <SegmentedControl<HistoriqueSort>
              prefix="Trier"
              ariaLabel="Trier l'historique"
              value={sort}
              onChange={changeSort}
              options={[
                { value: 'date', label: 'Clôture récente', icon: 'history' },
                { value: 'priorite', label: 'Priorité', icon: 'crisis_alert' },
                { value: 'commune', label: 'Commune', icon: 'location_on' },
              ]}
            />
          </div>
          {communeChips.length > 2 && (
            <FilterChips<string>
              ariaLabel="Filtrer par commune"
              value={commune}
              onChange={changeCommune}
              options={communeChips}
            />
          )}
        </div>

        <div className="coord-hist-count">
          <b>{rows.length}</b> incident{rows.length > 1 ? 's' : ''} clôturé{rows.length > 1 ? 's' : ''}
          {isFiltered && ` sur ${closed.length}`}
        </div>

        <div className="tbl-wrap coord-hist-table">
          <table>
            <thead>
              <tr>
                <th>Réf. dossier</th>
                <th>Clôturé le</th>
                <th>Type &amp; commune</th>
                <th>Enquêteur</th>
                <th>Bilan humain</th>
                <th>Rapport</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr className="coord-hist-empty-row">
                  <td colSpan={7}>
                    <div className="coord-hist-empty">
                      <span className="material-symbols-outlined">{isFiltered ? 'search' : 'history'}</span>
                      <b>{loading ? 'Chargement…' : isFiltered ? 'Aucun résultat' : 'Aucun incident clôturé'}</b>
                      {!loading && (
                        <span>
                          {isFiltered
                            ? 'Aucun incident clôturé ne correspond à ces critères.'
                            : 'Les incidents apparaissent ici une fois clôturés.'}
                        </span>
                      )}
                      {isFiltered && !loading && (
                        <button
                          type="button"
                          className="btn btn-sm cf-btn"
                          onClick={() => {
                            changeSearch('');
                            changeCommune('toutes');
                          }}
                        >
                          Réinitialiser les filtres
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map(({ inc, commune: c }) => {
                  const ev = inc.evaluation;
                  return (
                    <tr
                      key={inc.id}
                      className="coord-hist-row"
                      onClick={() => onChangeOpenReportId(inc.id)}
                    >
                      <td data-label="Réf.">
                        <span className="code">{formatIncidentRef(inc)}</span>
                        <span className="sub coord-hist-ref">{formatPublicRef(inc.reference_publique)}</span>
                      </td>
                      <td data-label="Clôturé le" className="coord-hist-date">
                        {formatShortDate(closedAt(inc))}
                      </td>
                      <td data-label="Type">
                        <b>{getIncidentTypeMeta(inc.type).title}</b>
                        <span className="sub">
                          {c}
                          {inc.danger_immediat && <span className="coord-hist-danger"> · danger vital</span>}
                        </span>
                      </td>
                      <td data-label="Enquêteur">
                        {inc.enqueteur_nom ? <span>{inc.enqueteur_nom}</span> : <span className="sub">—</span>}
                      </td>
                      <td data-label="Bilan">
                        {ev ? (
                          <span className="coord-hist-bilan" title="Personnes affectées · blessés · décès">
                            <span>
                              <b>{ev.personnes_affectees}</b> affectée{ev.personnes_affectees > 1 ? 's' : ''}
                            </span>
                            {(ev.blesses > 0 || ev.deces > 0) && (
                              <span className="is-crit">
                                {ev.blesses} blessé{ev.blesses > 1 ? 's' : ''} · {ev.deces} décès
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="sub">—</span>
                        )}
                      </td>
                      <td data-label="Rapport">
                        {ev ? (
                          <span className="chip ok">
                            <i className="dot ok" /> Soumis
                          </span>
                        ) : (
                          <span className="chip">Sans rapport</span>
                        )}
                      </td>
                      <td className="right coord-hist-actions">
                        <button
                          type="button"
                          className="btn btn-sm cf-btn coord-hist-open"
                          onClick={(e) => {
                            e.stopPropagation();
                            onChangeOpenReportId(inc.id);
                          }}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            {ev ? 'description' : 'visibility'}
                          </span>
                          <span>{ev ? 'Voir le rapport' : 'Consulter'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="oid-coord-pagination coord-hist-pagination">
            <span>
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, rows.length)} sur {rows.length}
            </span>
            <div className="oid-coord-page-btns">
              <button
                type="button"
                className="btn btn-sm cf-btn"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
              >
                Précédent
              </button>
              <span className="mono" style={{ fontSize: '12px', padding: '0 8px' }}>
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-sm cf-btn"
                disabled={safePage >= totalPages}
                onClick={() => setPage(safePage + 1)}
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

/* --------------------------------------------------------------------------
   Rapport d'enquête en pleine page (lecture seule) + réouverture
   -------------------------------------------------------------------------- */

interface HistoriqueReportProps {
  incident: IncidentItem;
  communeLabel: string;
  onBack: () => void;
  onShowOnMap: (id: number) => void;
  onDataChanged: () => Promise<void> | void;
  showToast: (msg: string) => void;
}

const HistoriqueReport: React.FC<HistoriqueReportProps> = ({
  incident,
  communeLabel,
  onBack,
  onShowOnMap,
  onDataChanged,
  showToast,
}) => {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [motif, setMotif] = useState('');
  const [motifError, setMotifError] = useState(false);
  const [saving, setSaving] = useState(false);
  const motifRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const [barTop, setBarTop] = useState(0);

  // La barre d'actions colle juste sous l'en-tête de page quand celui-ci est épinglé (bureau)
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.page-coordinateur .top-bar');
    if (!header) return;
    const update = () =>
      setBarTop(getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().height : 0);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  // Arrive en haut du rapport à l'ouverture
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start' });
  }, [incident.id]);

  useEffect(() => {
    if (reopenOpen) motifRef.current?.focus();
  }, [reopenOpen]);

  // Échap : ferme la photo, puis le formulaire de réouverture, puis revient au tableau
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (lightboxUrl) setLightboxUrl(null);
      else if (reopenOpen) setReopenOpen(false);
      else onBack();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxUrl, reopenOpen, onBack]);

  const handleReopen = async () => {
    if (!motif.trim()) {
      setMotifError(true);
      motifRef.current?.focus();
      window.setTimeout(() => setMotifError(false), 1800);
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/coordination/incidents/${incident.id}/rouvrir`, {
        method: 'POST',
        body: JSON.stringify({ motif: motif.trim() }),
      });
      showToast(`Incident #${incident.id} rouvert : il est de retour dans l'onglet Incidents.`);
      onBack();
      await onDataChanged();
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const ev = incident.evaluation;
  const sigs = incident.signalements_lies || [];

  return (
    <div className="coord-hist-report" ref={topRef}>
      {lightboxUrl && (
        <div className="verif-lightbox" onClick={() => setLightboxUrl(null)}>
          <div className="verif-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="verif-lightbox-close"
              onClick={() => setLightboxUrl(null)}
              aria-label="Fermer l'aperçu"
            >
              <span className="material-symbols-outlined">close</span>
              <span>Fermer l'aperçu</span>
            </button>
            <img src={apiUrl(lightboxUrl)} alt="Photo jointe au rapport" />
          </div>
        </div>
      )}

      <div className="coord-hist-report-bar no-print" style={{ top: barTop }}>
        <button type="button" className="btn btn-sm cf-btn" onClick={onBack}>
          <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          <span>Retour à l'historique</span>
        </button>

        <div className="coord-hist-report-meta">
          <span className="chip">{ev ? "Rapport d'enquête · lecture seule" : 'Incident clôturé'}</span>
          <span className="coord-hist-report-id">
            {formatIncidentRef(incident)} · {communeLabel} · clôturé {formatShortDate(closedAt(incident))}
          </span>
        </div>

        <div className="coord-hist-report-actions">
          {incident.coords && (
            <button type="button" className="btn btn-sm cf-btn" onClick={() => onShowOnMap(incident.id)}>
              <span className="material-symbols-outlined" aria-hidden="true">map</span>
              <span>Carte</span>
            </button>
          )}
          <button
            type="button"
            className={`btn btn-sm cf-btn ${reopenOpen ? 'is-pressed' : ''}`}
            onClick={() => setReopenOpen((o) => !o)}
            aria-expanded={reopenOpen}
          >
            <span className="material-symbols-outlined" aria-hidden="true">restart_alt</span>
            <span>Rouvrir</span>
          </button>
        </div>

        {reopenOpen && (
          <div className="coord-hist-reopen">
            <label className={`cf-search coord-hist-reopen-input ${motifError ? 'is-error' : ''}`}>
              <span className="material-symbols-outlined cf-search-icon" aria-hidden="true">edit_note</span>
              <input
                ref={motifRef}
                type="text"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleReopen();
                }}
                placeholder="Motif de réouverture (obligatoire)…"
                aria-label="Motif de réouverture"
              />
            </label>
            <button
              type="button"
              className="verif-btn-validate coord-hist-reopen-btn"
              disabled={saving}
              onClick={handleReopen}
            >
              <span className="material-symbols-outlined" aria-hidden="true">restart_alt</span>
              <span>{saving ? 'Réouverture…' : "Rouvrir l'incident"}</span>
            </button>
          </div>
        )}
      </div>

      {ev ? (
        <EnqueteReportView
          dossier={{
            id: incident.id,
            reference_publique: incident.reference_publique,
            type: incident.type,
            statut: incident.statut,
            score_priorite: incident.score_priorite,
            niveau_fiabilite: incident.niveau_fiabilite,
            danger_immediat: incident.danger_immediat,
            coords: incident.coords ?? null,
            commune: incident.commune || communeLabel,
            code_adm: incident.code_adm,
            description_citoyenne: incident.description_synthese,
            hauteur_eau_cm: incident.hauteur_eau_max_cm,
            photos_citoyennes: sigs.flatMap((s) => s.photos || []),
            evaluation_statut: ev.statut,
            cree_le: incident.cree_le,
            maj_le: incident.maj_le,
          }}
          evaluation={{
            ...ev,
            degats: ev.degats || '',
            routes_coupees: ev.routes_coupees || '',
            risques_sanitaires: ev.risques_sanitaires || '',
            besoins: ev.besoins || '',
            recommandations: ev.recommandations || '',
            photos: ev.photos || [],
            photos_meta: (ev.photos_meta || []).map((m) => ({ ...m, sha256_short: null, horodatage_utc: null })),
          }}
          inspectorName={incident.enqueteur_nom || undefined}
          onOpenLightbox={setLightboxUrl}
        />
      ) : (
        <div className="oid-coord-panel coord-hist-noreport">
          <span className="material-symbols-outlined" aria-hidden="true">description</span>
          <h3>Aucun rapport d'enquête pour cet incident</h3>
          <p>
            L'incident a été clôturé sans qu'un enquêteur ait transmis d'évaluation de terrain.
          </p>
          <dl className="coord-hist-facts">
            <div>
              <dt>Type</dt>
              <dd>{formatIncidentType(incident.type)}</dd>
            </div>
            <div>
              <dt>Commune</dt>
              <dd>{communeLabel}</dd>
            </div>
            <div>
              <dt>Ouvert le</dt>
              <dd>{formatShortDate(incident.cree_le)}</dd>
            </div>
            <div>
              <dt>Enquêteur</dt>
              <dd>{incident.enqueteur_nom || 'Non affecté'}</dd>
            </div>
            <div>
              <dt>Signalements</dt>
              <dd>{incident.nb_signalements || 1}</dd>
            </div>
            <div>
              <dt>Priorité</dt>
              <dd>{incident.score_priorite} pts</dd>
            </div>
          </dl>
          {incident.description_synthese && <blockquote>« {incident.description_synthese} »</blockquote>}
        </div>
      )}
    </div>
  );
};
