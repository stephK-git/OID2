import React, { useMemo } from 'react';
import type { CoordData, IncidentStatusFilter } from './types';
import {
  ACTIVE_STATUSES,
  formatDuration,
  getIncidentTypeMeta,
  needsAssignment,
  resolveIncidentCommune,
  slaOverrunMs,
} from './helpers';
import { CountUp, Donut, Ring, Sparkline, TrendChart } from './charts';
import type { DonutSegment, TrendDay } from './charts';
import './coordination.css';

interface KpisTabProps {
  data: CoordData;
  onOpenIncident: (id: number) => void;
  onOpenIncidentList: (filter: IncidentStatusFilter) => void;
}

const DAYS = 7;
const MAX_COMMUNES = 8;
const MAX_RETARDS = 6;
const MAX_TYPES = 5;
const CIBLE_COUVERTURE = 85;

const TYPE_COLORS = ['var(--water)', 'var(--cyan)', 'var(--violet)', 'var(--warn)', 'var(--ok)', 'var(--tx3)'];

const STATUTS: { key: string; label: string; color: string; filter: IncidentStatusFilter }[] = [
  { key: 'ouvert', label: 'Ouverts', color: 'var(--warn)', filter: 'ouverts' },
  { key: 'affecte', label: 'Affectés', color: 'var(--water)', filter: 'affectes' },
  { key: 'rouvert', label: 'Rouverts', color: 'var(--violet)', filter: 'ouverts' },
  { key: 'evalue', label: 'Évalués', color: 'var(--ok)', filter: 'evalues' },
  { key: 'cloture', label: 'Clôturés', color: 'var(--tx3)', filter: 'clotures' },
];

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Décalage d'apparition des blocs (animation en cascade). */
const stagger = (i: number) => ({ '--i': i }) as React.CSSProperties;

export const KpisTab: React.FC<KpisTabProps> = ({ data, onOpenIncident, onOpenIncidentList }) => {
  const { stats, incidents, enqueteurs, zones } = data;

  // Incidents signalés et clôturés par jour sur les 7 derniers jours (aujourd'hui inclus)
  const trend = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const slots = Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (DAYS - 1 - i));
      return { date: d, key: dayKey(d), crees: 0, clotures: 0 };
    });
    const byKey = new Map(slots.map((d) => [d.key, d]));
    for (const inc of incidents) {
      if (inc.cree_le) {
        const slot = byKey.get(dayKey(new Date(inc.cree_le)));
        if (slot) slot.crees++;
      }
      if (inc.cloture_le) {
        const slot = byKey.get(dayKey(new Date(inc.cloture_le)));
        if (slot) slot.clotures++;
      }
    }
    const days: TrendDay[] = slots.map((s, i) => {
      const isToday = i === slots.length - 1;
      return {
        key: s.key,
        label: isToday
          ? 'Auj.'
          : s.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }).replace('.', ''),
        full: s.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
        a: s.crees,
        b: s.clotures,
        isToday,
      };
    });
    return {
      days,
      totalCrees: slots.reduce((s, d) => s + d.crees, 0),
      totalClotures: slots.reduce((s, d) => s + d.clotures, 0),
      aujourdhui: slots[slots.length - 1].crees,
    };
  }, [incidents]);

  // Répartition de tous les incidents par statut
  const statuts = useMemo<DonutSegment[]>(() => {
    const counts = new Map<string, number>();
    for (const inc of incidents) {
      const s = (inc.statut || 'ouvert').toLowerCase();
      const key = STATUTS.some((x) => x.key === s) ? s : 'ouvert';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return STATUTS.map((s) => ({ key: s.key, label: s.label, color: s.color, value: counts.get(s.key) ?? 0 }));
  }, [incidents]);

  // Répartition par type d'incident
  const types = useMemo(() => {
    const map = new Map<string, number>();
    for (const inc of incidents) {
      const title = getIncidentTypeMeta(inc.type).title;
      map.set(title, (map.get(title) ?? 0) + 1);
    }
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const rows = sorted.slice(0, MAX_TYPES).map(([nom, n]) => ({ nom, n }));
    const autres = sorted.slice(MAX_TYPES).reduce((s, [, n]) => s + n, 0);
    if (autres > 0) rows.push({ nom: 'Autres types', n: autres });
    return { rows, max: Math.max(1, ...rows.map((r) => r.n)), total: incidents.length };
  }, [incidents]);

  // Incidents en cours par commune
  const communes = useMemo(() => {
    const map = new Map<string, { nom: string; actifs: number; urgences: number }>();
    for (const inc of incidents) {
      if (!ACTIVE_STATUSES.includes(inc.statut)) continue;
      const nom = resolveIncidentCommune(inc, zones);
      const row = map.get(nom) ?? { nom, actifs: 0, urgences: 0 };
      row.actifs++;
      if (inc.danger_immediat) row.urgences++;
      map.set(nom, row);
    }
    const rows = [...map.values()].sort((a, b) => b.actifs - a.actifs || b.urgences - a.urgences);
    return {
      rows: rows.slice(0, MAX_COMMUNES),
      hidden: Math.max(0, rows.length - MAX_COMMUNES),
      max: Math.max(1, ...rows.map((r) => r.actifs)),
    };
  }, [incidents, zones]);

  // Dossiers hors délai de traitement, les plus en retard d'abord
  const retards = useMemo(() => {
    const now = Date.now();
    const rows = incidents
      .map((inc) => ({ inc, overrun: slaOverrunMs(inc, now) }))
      .filter((r) => r.overrun > 0)
      .sort((a, b) => {
        if (a.inc.danger_immediat !== b.inc.danger_immediat) return a.inc.danger_immediat ? -1 : 1;
        return b.overrun - a.overrun;
      });
    return { rows: rows.slice(0, MAX_RETARDS), total: rows.length };
  }, [incidents]);

  const charge = useMemo(() => {
    const rows = [...enqueteurs].sort((a, b) => b.dossiers_actifs - a.dossiers_actifs);
    return {
      rows,
      max: Math.max(1, ...rows.map((e) => e.dossiers_actifs)),
      aAffecter: incidents.filter(needsAssignment).length,
    };
  }, [enqueteurs, incidents]);

  const total = stats?.incidents ?? incidents.length;
  const ouverts = stats?.ouverts ?? incidents.filter((i) => ACTIVE_STATUSES.includes(i.statut)).length;
  const partOuverts = total > 0 ? Math.round((ouverts / total) * 100) : 0;
  const couverture = parseFloat(stats?.couverture ?? '0') || 0;
  const retardCrit = stats?.retard_critique ?? 0;
  const retardStd = stats?.retard_standard ?? 0;
  const retardsTotal = stats?.retards_total ?? retardCrit + retardStd;

  const impact = [
    { icon: 'family_restroom', label: 'Ménages touchés', v: stats?.menages_touches, hint: 'Foyers recensés', tone: 'water' },
    { icon: 'groups', label: 'Personnes affectées', v: stats?.personnes_affectees, hint: 'Population exposée', tone: 'cyan' },
    { icon: 'personal_injury', label: 'Blessés', v: stats?.blesses, hint: 'Pris en charge', tone: 'warn' },
    { icon: 'night_shelter', label: 'Déplacés / Relogés', v: stats?.deplaces, hint: "En hébergement d'urgence", tone: 'violet' },
    { icon: 'person_search', label: 'Disparus', v: stats?.disparus, hint: 'Recherches en cours', tone: 'crit' },
    { icon: 'sentiment_very_dissatisfied', label: 'Décès constatés', v: stats?.deces, hint: 'Constatés sur le terrain', tone: 'crit' },
  ];

  return (
    <section className="view on">
      <div className="page gut coord-kpis-page">
        {/* Tuiles des 4 indicateurs clés */}
        <section className="dash-tiles" aria-label="Indicateurs clés">
          <article className="dash-tile t-water dash-in" style={stagger(0)}>
            <header>
              <span className="material-symbols-outlined dash-ico" aria-hidden="true">crisis_alert</span>
              <span className="eyebrow">Total incidents</span>
            </header>
            <div className="dash-tile-body">
              <div className="dash-tile-v">
                <CountUp value={total} />
              </div>
              <div className="dash-tile-viz">
                <Sparkline values={trend.days.map((d) => d.a)} />
              </div>
            </div>
            <small>
              <b>+{trend.aujourdhui}</b> aujourd'hui · {trend.totalCrees} sur 7 jours
            </small>
          </article>

          <article className="dash-tile t-crit dash-in" style={stagger(1)}>
            <header>
              <span className="material-symbols-outlined dash-ico" aria-hidden="true">emergency</span>
              <span className="eyebrow">Incidents ouverts</span>
              {ouverts > 0 && <i className="dash-live" aria-hidden="true" />}
            </header>
            <div className="dash-tile-body">
              <div className="dash-tile-v">
                <CountUp value={ouverts} />
              </div>
            </div>
            <div className="dash-meter" aria-hidden="true">
              <i style={{ width: `${partOuverts}%` }} />
            </div>
            <small>
              <b>{partOuverts}%</b> du total, en attente ou en cours d'enquête
            </small>
          </article>

          <article className="dash-tile t-ok dash-in" style={stagger(2)}>
            <header>
              <span className="material-symbols-outlined dash-ico" aria-hidden="true">fact_check</span>
              <span className="eyebrow">Couverture évaluations</span>
            </header>
            <div className="dash-tile-body">
              <div className="dash-tile-v">
                <CountUp value={couverture} suffix="%" />
              </div>
              <div className="dash-tile-viz is-ring">
                <Ring value={couverture} target={CIBLE_COUVERTURE} />
              </div>
            </div>
            <small>
              Cible <b>{CIBLE_COUVERTURE}%</b> · dossiers avec évaluation validée
            </small>
          </article>

          <article className="dash-tile t-warn dash-in" style={stagger(3)}>
            <header>
              <span className="material-symbols-outlined dash-ico" aria-hidden="true">history</span>
              <span className="eyebrow">Retards de traitement</span>
            </header>
            <div className="dash-tile-body">
              <div className="dash-tile-v">
                <CountUp value={retardsTotal} />
              </div>
            </div>
            <div className="dash-meter is-split" aria-hidden="true">
              {retardCrit > 0 && <i className="is-crit" style={{ flexGrow: retardCrit }} />}
              {retardStd > 0 && <i style={{ flexGrow: retardStd }} />}
            </div>
            <small>
              <b className="up-crit">{retardCrit}</b> danger vital (15 min) · <b>{retardStd}</b> standard (2 h)
            </small>
          </article>
        </section>

        {/* Bilan humain consolidé */}
        <section>
          <div className="sec-head">
            <div>
              <div className="eyebrow">Impact humain</div>
              <h2>Bilan humain consolidé des sinistres</h2>
            </div>
            <p>Données issues des fiches d'évaluation terrain · District d'Abidjan</p>
          </div>

          <div className="dash-impact">
            {impact.map((it, i) => (
              <div key={it.label} className={`dash-imp t-${it.tone} dash-in`} style={stagger(4 + i)}>
                <span className="material-symbols-outlined dash-ico" aria-hidden="true">{it.icon}</span>
                <div className="dash-imp-v">
                  <CountUp value={it.v ?? 0} />
                </div>
                <div className="dash-imp-l">{it.label}</div>
                <small>{it.hint}</small>
              </div>
            ))}
          </div>
        </section>

        <div className="coord-kpis-grid">
          {/* Évolution sur 7 jours */}
          <section className="panel pad coord-card is-wide dash-in" style={stagger(10)}>
            <div className="coord-card-head">
              <div>
                <div className="eyebrow">Tendance</div>
                <h2>Activité sur 7 jours</h2>
              </div>
              <div className="dash-keys">
                <span>
                  <i style={{ background: 'var(--water)' }} /> Signalés <b>{trend.totalCrees}</b>
                </span>
                <span>
                  <i style={{ background: 'var(--ok)' }} /> Clôturés <b>{trend.totalClotures}</b>
                </span>
              </div>
            </div>

            <TrendChart days={trend.days} nameA="Signalés" nameB="Clôturés" />

            <table className="sr-only">
              <caption>Incidents signalés et clôturés par jour</caption>
              <thead>
                <tr>
                  <th>Jour</th>
                  <th>Signalés</th>
                  <th>Clôturés</th>
                </tr>
              </thead>
              <tbody>
                {trend.days.map((d) => (
                  <tr key={d.key}>
                    <td>{d.full}</td>
                    <td>{d.a}</td>
                    <td>{d.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Répartition par statut */}
          <section className="panel pad coord-card is-narrow dash-in" style={stagger(11)}>
            <div className="coord-card-head">
              <div>
                <div className="eyebrow">Avancement</div>
                <h2>Répartition par statut</h2>
              </div>
            </div>

            {incidents.length === 0 ? (
              <p className="coord-empty">Aucun incident enregistré.</p>
            ) : (
              <Donut
                segments={statuts}
                centerLabel="incidents"
                onSelect={(key) => {
                  const s = STATUTS.find((x) => x.key === key);
                  if (s) onOpenIncidentList(s.filter);
                }}
              />
            )}
          </section>

          {/* Répartition par commune */}
          <section className="panel pad coord-card dash-in" style={stagger(12)}>
            <div className="coord-card-head">
              <div>
                <div className="eyebrow">Où intervenir</div>
                <h2>Incidents en cours par commune</h2>
              </div>
              <div className="dash-keys">
                <span>
                  <i style={{ background: 'var(--crit)' }} /> Danger vital
                </span>
                <span>
                  <i style={{ background: 'var(--water)' }} /> Autres
                </span>
              </div>
            </div>

            {communes.rows.length === 0 ? (
              <p className="coord-empty">Aucun incident en cours.</p>
            ) : (
              <ul className="coord-hbars">
                {communes.rows.map((c, i) => (
                  <li key={c.nom} title={`${c.nom} : ${c.actifs} incident(s) en cours, dont ${c.urgences} en danger vital`}>
                    <span className="coord-hbar-label">{c.nom}</span>
                    <span className="coord-hbar-track">
                      <span
                        className="coord-hbar is-stack"
                        style={{ width: `${(c.actifs / communes.max) * 100}%`, ...stagger(i) }}
                      >
                        {c.urgences > 0 && <i className="is-crit" style={{ flexGrow: c.urgences }} />}
                        {c.actifs - c.urgences > 0 && <i style={{ flexGrow: c.actifs - c.urgences }} />}
                      </span>
                    </span>
                    <span className="coord-hbar-v">
                      {c.actifs}
                      {c.urgences > 0 && <em> · {c.urgences}</em>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {communes.hidden > 0 && (
              <p className="coord-card-foot">+ {communes.hidden} autre(s) commune(s)</p>
            )}
          </section>

          {/* Répartition par type */}
          <section className="panel pad coord-card dash-in" style={stagger(13)}>
            <div className="coord-card-head">
              <div>
                <div className="eyebrow">Nature des sinistres</div>
                <h2>Incidents par type</h2>
              </div>
              <p>Tous statuts confondus</p>
            </div>

            {types.rows.length === 0 ? (
              <p className="coord-empty">Aucun incident enregistré.</p>
            ) : (
              <ul className="coord-hbars">
                {types.rows.map((t, i) => (
                  <li key={t.nom} title={`${t.nom} : ${t.n} incident(s)`}>
                    <span className="coord-hbar-label">{t.nom}</span>
                    <span className="coord-hbar-track">
                      <span
                        className="coord-hbar"
                        style={{
                          width: `${(t.n / types.max) * 100}%`,
                          background: TYPE_COLORS[Math.min(i, TYPE_COLORS.length - 1)],
                          ...stagger(i),
                        }}
                      />
                    </span>
                    <span className="coord-hbar-v">
                      {t.n}
                      <em> · {types.total > 0 ? Math.round((t.n / types.total) * 100) : 0}%</em>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Dossiers hors délai */}
          <section className="panel pad coord-card dash-in" style={stagger(14)}>
            <div className="coord-card-head">
              <div>
                <div className="eyebrow">À traiter en priorité</div>
                <h2>Dossiers hors délai ({retards.total})</h2>
              </div>
              <p>Délai : 15 min si danger vital, 2 h sinon</p>
            </div>

            {retards.rows.length === 0 ? (
              <p className="coord-empty">
                <span className="material-symbols-outlined">task_alt</span>
                Aucun dossier hors délai.
              </p>
            ) : (
              <ul className="coord-retards">
                {retards.rows.map(({ inc, overrun }) => (
                  <li key={inc.id}>
                    <button
                      type="button"
                      onClick={() => onOpenIncident(inc.id)}
                      className={`coord-retard-row ${inc.danger_immediat ? 'is-crit' : ''}`}
                    >
                      <span className="coord-retard-main">
                        <span className="coord-retard-title">
                          {inc.danger_immediat && (
                            <span className="chip crit">
                              <i className="dot crit" /> Danger vital
                            </span>
                          )}
                          <span className="coord-retard-text">
                            <b>#{inc.id}</b> {getIncidentTypeMeta(inc.type).title}
                          </span>
                        </span>
                        <span className="coord-retard-sub">
                          {resolveIncidentCommune(inc, zones)} ·{' '}
                          {inc.enqueteur_nom || (inc.enqueteur_id ? 'Affecté' : 'Sans enquêteur')}
                        </span>
                      </span>
                      <span className="coord-retard-late">+{formatDuration(overrun)}</span>
                      <span className="material-symbols-outlined coord-retard-go" aria-hidden="true">
                        arrow_forward
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {retards.total > retards.rows.length && (
              <button type="button" className="coord-card-link" onClick={() => onOpenIncidentList('ouverts')}>
                Voir les {retards.total} dossiers en cours
              </button>
            )}
          </section>

          {/* Charge des enquêteurs */}
          <section className="panel pad coord-card dash-in" style={stagger(15)}>
            <div className="coord-card-head">
              <div>
                <div className="eyebrow">Équipes terrain</div>
                <h2>Charge des enquêteurs</h2>
              </div>
              <p>Dossiers actifs par personne</p>
            </div>

            {charge.rows.length === 0 ? (
              <p className="coord-empty">Aucun enquêteur enregistré.</p>
            ) : (
              <ul className="coord-hbars">
                {charge.rows.map((e, i) => (
                  <li key={e.id} title={`${e.nom} : ${e.dossiers_actifs} dossier(s) actif(s)`}>
                    <span className="coord-hbar-label">
                      {e.nom}
                      <small>{e.zone_nom || 'Toutes zones'}</small>
                    </span>
                    <span className="coord-hbar-track">
                      <span
                        className="coord-hbar is-violet"
                        style={{ width: `${(e.dossiers_actifs / charge.max) * 100}%`, ...stagger(i) }}
                      />
                    </span>
                    <span className="coord-hbar-v">{e.dossiers_actifs}</span>
                  </li>
                ))}
              </ul>
            )}
            {charge.aAffecter > 0 && (
              <button type="button" className="coord-card-link" onClick={() => onOpenIncidentList('a_affecter')}>
                {charge.aAffecter} dossier(s) en attente d'affectation
              </button>
            )}
          </section>
        </div>
      </div>
    </section>
  );
};
