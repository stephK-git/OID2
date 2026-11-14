import React, { useEffect, useRef } from 'react';

/* --------------------------------------------------------------------------
   Contrôles de recherche, filtre et tri de l'espace coordinateur.
   Styles : .cf-* dans coordination.css
   -------------------------------------------------------------------------- */

interface SearchFieldProps {
  value: string;
  onChange: (q: string) => void;
  placeholder: string;
  /** Raccourci « / » pour placer le curseur dans le champ (désactivé si plusieurs champs à l'écran). */
  shortcut?: boolean;
  className?: string;
  ariaLabel?: string;
}

export const SearchField: React.FC<SearchFieldProps> = ({
  value,
  onChange,
  placeholder,
  shortcut = true,
  className = '',
  ariaLabel,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!shortcut) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcut]);

  return (
    <label className={`cf-search ${value ? 'has-value' : ''} ${className}`}>
      <span className="material-symbols-outlined cf-search-icon" aria-hidden="true">
        search
      </span>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onChange('');
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      {value ? (
        <button
          type="button"
          className="cf-search-clear"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          aria-label="Effacer la recherche"
          title="Effacer (Échap)"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      ) : (
        shortcut && (
          <kbd className="cf-kbd" aria-hidden="true" title="Appuyez sur / pour rechercher">
            /
          </kbd>
        )
      )}
    </label>
  );
};

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  icon?: string;
  /** Teinte de la pastille active : « danger » pour les urgences. */
  tone?: 'default' | 'danger' | 'warn';
}

interface FilterChipsProps<T extends string> {
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  className?: string;
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
}: FilterChipsProps<T>) {
  return (
    <div className={`cf-chips ${className}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`cf-chip ${active ? 'is-active' : ''} tone-${opt.tone || 'default'}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon && (
              <span className="material-symbols-outlined cf-chip-icon" aria-hidden="true">
                {opt.icon}
              </span>
            )}
            <span>{opt.label}</span>
            {opt.count != null && <span className="cf-chip-count">{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string; icon?: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  /** Petit libellé avant le groupe, ex. « Trier ». */
  prefix?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  prefix,
}: SegmentedControlProps<T>) {
  return (
    <div className="cf-segmented-wrap">
      {prefix && <span className="cf-segmented-prefix">{prefix}</span>}
      <div className="cf-segmented" role="radiogroup" aria-label={ariaLabel}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              className={`cf-seg ${active ? 'is-active' : ''}`}
              onClick={() => onChange(opt.value)}
            >
              {opt.icon && (
                <span className="material-symbols-outlined" aria-hidden="true">
                  {opt.icon}
                </span>
              )}
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
