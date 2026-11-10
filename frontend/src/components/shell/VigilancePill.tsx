import React from 'react';

export interface VigilancePillProps {
  label?: string;
  className?: string;
}

export const VigilancePill: React.FC<VigilancePillProps> = ({
  label = 'Vigilance orange v4',
  className = '',
}) => {
  return (
    <span
      className={`oid-vigilance-pill ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '7px',
        padding: '4px 12px',
        borderRadius: '9999px',
        border: '1px solid var(--warn)',
        backgroundColor: 'var(--warn-dim)',
        color: 'var(--warn)',
        fontFamily: 'var(--mono)',
        fontSize: '12px',
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
      title="Niveau de vigilance météorologique et hydrologique actif"
    >
      <span
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          backgroundColor: 'var(--warn)',
          display: 'inline-block',
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      <span>{label}</span>
    </span>
  );
};
