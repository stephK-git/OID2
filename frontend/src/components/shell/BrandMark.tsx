import React from 'react';

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
      className={`oid-brandmark ${className}`.trim()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        textDecoration: 'none',
        userSelect: 'none',
        minWidth: 0,
      }}
    >
      <img
        src="/images/oid-logo.png"
        alt="OID"
        className="oid-brandmark-logo"
        width={66}
        height={32}
        style={{
          display: 'block',
          height: '32px',
          width: 'auto',
          flexShrink: 0,
          objectFit: 'contain',
        }}
      />

      {(subtitle || badge) && (
        <div
          className="oid-brandmark-meta"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            paddingLeft: '10px',
            borderLeft: '1px solid var(--line)',
            lineHeight: 1.25,
            minWidth: 0,
          }}
        >
          {badge && (
            <span
              className="badge badge-water"
              style={{
                alignSelf: 'flex-start',
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '99px',
                fontFamily: 'var(--mono)',
              }}
            >
              {badge}
            </span>
          )}
          {subtitle && (
            <span
              className="oid-brandmark-subtitle"
              style={{
                fontFamily: 'var(--font)',
                fontSize: '11.5px',
                color: 'var(--tx2)',
                fontWeight: 600,
              }}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
