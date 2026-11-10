import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export interface ThemeToggleProps {
  className?: string;
  size?: number;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '', size = 20 }) => {
  const { isDark, toggleTheme } = useTheme();

  const label = isDark ? 'Passer au thème clair' : 'Passer au thème sombre';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`oid-theme-toggle ${className}`}
      aria-label={label}
      title={label}
      style={{
        width: '44px',
        height: '44px',
        minWidth: '44px',
        minHeight: '44px',
        borderRadius: '10px',
        backgroundColor: 'var(--s2)',
        border: '1px solid var(--line)',
        color: 'var(--tx)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 150ms ease',
        padding: 0,
      }}
    >
      {isDark ? (
        <Sun size={size} strokeWidth={2} style={{ color: 'var(--warn)' }} />
      ) : (
        <Moon size={size} strokeWidth={2} style={{ color: 'var(--water)' }} />
      )}
    </button>
  );
};

