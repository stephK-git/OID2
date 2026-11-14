import React, { useEffect, useId, useRef, useState } from 'react';

/* Graphiques SVG légers du tableau de bord (aucune dépendance externe). */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Passe à true à la première frame : déclenche les transitions d'entrée. */
const useMounted = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return mounted;
};

/** Nombre animé : compte depuis la valeur affichée jusqu'à la nouvelle valeur. */
export const CountUp: React.FC<{ value: number; suffix?: string }> = ({ value, suffix = '' }) => {
  const [shown, setShown] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    const duration = prefersReducedMotion() ? 1 : 900;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      current.current = from + (value - from) * eased;
      setShown(current.current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <>
      {Math.round(shown).toLocaleString('fr-FR')}
      {suffix}
    </>
  );
};

/** Courbe lissée sans dépassement (tangentes horizontales). */
const smoothPath = (pts: { x: number; y: number }[]): string =>
  pts
    .map((p, i) => {
      if (i === 0) return `M${p.x},${p.y}`;
      const prev = pts[i - 1];
      const mx = (prev.x + p.x) / 2;
      return `C${mx},${prev.y} ${mx},${p.y} ${p.x},${p.y}`;
    })
    .join(' ');

/** Mini-courbe décorative d'une tuile. */
export const Sparkline: React.FC<{ values: number[] }> = ({ values }) => {
  const id = useId();
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => ({
    x: values.length > 1 ? (i / (values.length - 1)) * 100 : 50,
    y: 30 - (v / max) * 26,
  }));
  const line = smoothPath(pts);
  return (
    <svg className="dash-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--tone)', stopOpacity: 0.45 }} />
          <stop offset="1" style={{ stopColor: 'var(--tone)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={`${line} L100,32 L0,32 Z`} fill={`url(#${id})`} />
      <path d={line} className="dash-spark-line" />
    </svg>
  );
};

/** Anneau de progression (0–100) avec repère de cible. */
export const Ring: React.FC<{ value: number; target?: number }> = ({ value, target }) => {
  const mounted = useMounted();
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <svg className="dash-ring" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r={r} className="dash-ring-track" />
      <circle
        cx="32"
        cy="32"
        r={r}
        className="dash-ring-value"
        strokeDasharray={`${mounted ? (pct / 100) * c : 0} ${c}`}
        transform="rotate(-90 32 32)"
      />
      {target != null && (
        <line
          x1="32"
          y1="1.5"
          x2="32"
          y2="10.5"
          className="dash-ring-target"
          transform={`rotate(${(target / 100) * 360} 32 32)`}
        />
      )}
    </svg>
  );
};

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Anneau de répartition avec légende cliquable. */
export const Donut: React.FC<{
  segments: DonutSegment[];
  centerLabel: string;
  onSelect?: (key: string) => void;
}> = ({ segments, centerLabel, onSelect }) => {
  const mounted = useMounted();
  const [active, setActive] = useState<string | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 46;
  const c = 2 * Math.PI * r;
  const focus = segments.find((s) => s.key === active);

  let offset = 0;
  const arcs = segments.map((s) => {
    const full = total > 0 ? (s.value / total) * c : 0;
    const len = Math.max(0, full - (full > 4 ? 2 : 0));
    const arc = { ...s, len, offset };
    offset += full;
    return arc;
  });

  return (
    <div className="dash-donut">
      <div className="dash-donut-chart">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r={r} className="dash-donut-track" />
          {arcs.map(
            (a) =>
              a.value > 0 && (
                <circle
                  key={a.key}
                  cx="60"
                  cy="60"
                  r={r}
                  className={`dash-donut-arc ${active && active !== a.key ? 'is-dim' : ''}`}
                  style={{ stroke: a.color }}
                  strokeDasharray={`${mounted ? a.len : 0} ${c}`}
                  strokeDashoffset={-a.offset}
                  transform="rotate(-90 60 60)"
                  onMouseEnter={() => setActive(a.key)}
                  onMouseLeave={() => setActive(null)}
                />
              )
          )}
        </svg>
        <div className="dash-donut-center">
          <b>
            <CountUp value={focus ? focus.value : total} />
          </b>
          <span>{focus ? focus.label : centerLabel}</span>
        </div>
      </div>

      <ul className="dash-legend">
        {segments.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <li key={s.key}>
              <button
                type="button"
                className={active === s.key ? 'is-active' : ''}
                onMouseEnter={() => setActive(s.key)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(s.key)}
                onBlur={() => setActive(null)}
                onClick={() => onSelect?.(s.key)}
                title={`Voir les incidents : ${s.label}`}
              >
                <i style={{ background: s.color }} />
                <span>{s.label}</span>
                <b>{s.value}</b>
                <em>{pct}%</em>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export interface TrendDay {
  key: string;
  label: string;
  full: string;
  a: number;
  b: number;
  isToday?: boolean;
}

/** Courbes sur N jours : série A (aire) et série B (ligne), avec infobulle au survol. */
export const TrendChart: React.FC<{ days: TrendDay[]; nameA: string; nameB: string }> = ({
  days,
  nameA,
  nameB,
}) => {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const n = days.length;
  const rawMax = Math.max(1, ...days.map((d) => Math.max(d.a, d.b)));
  const step = Math.max(1, Math.ceil(rawMax / 4));
  const max = step * 4;

  const xOf = (i: number) => ((i + 0.5) / n) * 100;
  const yOf = (v: number) => (1 - v / max) * 100;
  const ptsA = days.map((d, i) => ({ x: xOf(i), y: yOf(d.a) }));
  const ptsB = days.map((d, i) => ({ x: xOf(i), y: yOf(d.b) }));
  const lineA = smoothPath(ptsA);
  const lineB = smoothPath(ptsB);
  const area = `${lineA} L${xOf(n - 1)},100 L${xOf(0)},100 Z`;
  const cur = active != null ? days[active] : null;

  return (
    <div className="dash-trend">
      <div className="dash-trend-y" aria-hidden="true">
        <span>{max}</span>
        <span>{max / 2}</span>
        <span>0</span>
      </div>

      <div className="dash-trend-plot" onMouseLeave={() => setActive(null)}>
        <i className="dash-trend-grid" style={{ top: 0 }} />
        <i className="dash-trend-grid" style={{ top: '50%' }} />
        <i className="dash-trend-grid is-base" style={{ top: '100%' }} />

        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--water)', stopOpacity: 0.38 }} />
              <stop offset="1" style={{ stopColor: 'var(--water)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id})`} />
          <path d={lineA} className="dash-trend-line is-a" />
          <path d={lineB} className="dash-trend-line is-b" />
        </svg>

        {active != null && <i className="dash-trend-cross" style={{ left: `${xOf(active)}%` }} />}

        {days.map((d, i) => (
          <React.Fragment key={d.key}>
            <i
              className={`dash-trend-dot is-b ${active === i ? 'is-on' : ''}`}
              style={{ left: `${ptsB[i].x}%`, top: `${ptsB[i].y}%` }}
            />
            <i
              className={`dash-trend-dot is-a ${active === i ? 'is-on' : ''} ${d.isToday ? 'is-today' : ''}`}
              style={{ left: `${ptsA[i].x}%`, top: `${ptsA[i].y}%` }}
            />
          </React.Fragment>
        ))}

        <div className="dash-trend-hit" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
          {days.map((d, i) => (
            <span key={d.key} onMouseEnter={() => setActive(i)} onTouchStart={() => setActive(i)} />
          ))}
        </div>

        {cur && active != null && (
          <div
            className={`dash-tip ${active === 0 ? 'is-left' : active === n - 1 ? 'is-right' : ''}`}
            style={{ left: `${xOf(active)}%` }}
            role="status"
          >
            <strong>{cur.full}</strong>
            <span>
              <i style={{ background: 'var(--water)' }} /> {nameA} <b>{cur.a}</b>
            </span>
            <span>
              <i style={{ background: 'var(--ok)' }} /> {nameB} <b>{cur.b}</b>
            </span>
          </div>
        )}
      </div>

      <div className="dash-trend-x" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }} aria-hidden="true">
        {days.map((d, i) => (
          <span key={d.key} className={`${d.isToday ? 'is-today' : ''} ${active === i ? 'is-on' : ''}`}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
};
