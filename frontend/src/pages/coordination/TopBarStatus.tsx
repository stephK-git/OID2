import React, { useEffect, useState } from 'react';

const utcNow = () =>
  new Date().toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC';

export const LiveClockDisplay: React.FC = () => {
  const [clock, setClock] = useState<string>(utcNow);

  useEffect(() => {
    const timer = setInterval(() => setClock(utcNow()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="ck" style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--tx2)' }}>
      {clock}
    </span>
  );
};

const syncLabel = (at: number | null): string => {
  if (at == null) return 'Jamais synchronisé';
  const sec = Math.round((Date.now() - at) / 1000);
  if (sec < 20) return "Synchronisé à l'instant";
  if (sec < 60) return `Synchronisé il y a ${sec} s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `Synchronisé il y a ${min} min`;
  return `Synchronisé il y a ${Math.round(min / 60)} h`;
};

/** Bouton d'actualisation unique de la page, avec l'heure de la dernière synchronisation. */
export const RefreshControl: React.FC<{
  lastSyncAt: number | null;
  loading: boolean;
  onRefresh: () => void;
}> = ({ lastSyncAt, loading, onRefresh }) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="coord-refresh">
      <span className="coord-refresh-label" aria-live="polite">
        {loading ? 'Synchronisation…' : syncLabel(lastSyncAt)}
      </span>
      <button
        type="button"
        className="icon-btn"
        title="Actualiser les données"
        aria-label="Actualiser les données"
        onClick={onRefresh}
        disabled={loading}
      >
        <span className={`material-symbols-outlined ${loading ? 'spin' : ''}`}>refresh</span>
      </button>
    </div>
  );
};
