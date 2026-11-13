import React from 'react';
import { Waves } from 'lucide-react';

export interface BrandMarkProps {
  subtitle?: string;
  className?: string;
  badge?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  subtitle = 'Observatoire Inondations & Dommages',
  className = '',
  badge,
}) => {
  return (
    <div
      className={`oid-brandmark ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '12px',
        textDecoration: 'none',
        userSelect: 'none',
      }}
    >
      <div
        className="oid-brandmark-badge"
        style={{
          width: '34px',
          height: '34px',
          borderRadius: '10px',
          backgroundColor: 'var(--water)',
          color: 'var(--water-ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 2px 8px var(--water-dim)',
        }}
        aria-hidden="true"
      >
        <Waves size={18} strokeWidth={2.5} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            className="oid-brandmark-title"
            style={{
              fontFamily: 'var(--font)',
              fontSize: '18px',
              fontWeight: 800,
              color: 'var(--tx)',
              letterSpacing: '-0.02em',
            }}
          >
            OID
          </span>
          {badge && (
            <span
              className="badge badge-water"
              style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '99px',
                fontFamily: 'var(--mono)',
              }}
            >
              {badge}
            </span>
          )}
        </div>
        <span
          className="oid-brandmark-subtitle"
          style={{
            fontFamily: 'var(--font)',
            fontSize: '12px',
            color: 'var(--tx2)',
            fontWeight: 500,
          }}
        >
          {subtitle}
        </span>
      </div>
    </div>
  );
};

