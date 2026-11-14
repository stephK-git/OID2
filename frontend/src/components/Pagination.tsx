import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Libellé de l'élément compté (ex. « incident »). */
  itemLabel?: string;
}

/** Numéros à afficher : 1, …, page-1, page, page+1, …, dernière. */
function pageWindow(page: number, totalPages: number): Array<number | 'gap-left' | 'gap-right'> {
  const wanted = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const numbers = [...wanted].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const result: Array<number | 'gap-left' | 'gap-right'> = [];
  numbers.forEach((n, index) => {
    const previous = numbers[index - 1];
    if (previous !== undefined && n - previous > 1) {
      result.push(index < numbers.length / 2 ? 'gap-left' : 'gap-right');
    }
    result.push(n);
  });
  return result;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  pageSize,
  total,
  onPageChange,
  itemLabel = 'incident',
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav className="oid-pagination" aria-label="Pagination">
      <p className="oid-pagination-info" aria-live="polite">
        {first}–{last} sur {total} {itemLabel}
        {total > 1 ? 's' : ''}
      </p>

      <div className="oid-pagination-controls">
        <button
          type="button"
          className="oid-pagination-btn"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Page précédente"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          <span className="oid-pagination-btn-label">Précédent</span>
        </button>

        <ul className="oid-pagination-pages">
          {pageWindow(page, totalPages).map((entry) =>
            typeof entry === 'number' ? (
              <li key={entry}>
                <button
                  type="button"
                  className={`oid-pagination-num ${entry === page ? 'is-active' : ''}`}
                  onClick={() => onPageChange(entry)}
                  aria-label={`Page ${entry}`}
                  aria-current={entry === page ? 'page' : undefined}
                >
                  {entry}
                </button>
              </li>
            ) : (
              <li key={entry} className="oid-pagination-gap" aria-hidden="true">
                …
              </li>
            )
          )}
        </ul>

        <button
          type="button"
          className="oid-pagination-btn"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Page suivante"
        >
          <span className="oid-pagination-btn-label">Suivant</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
};
