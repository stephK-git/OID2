import { useEffect, useState } from 'react';

/** Renvoie l'id de la section visible au centre de l'écran (accueil uniquement). */
export function useActiveSection(ids: string[], enabled: boolean): string {
  const [active, setActive] = useState<string>('');
  const key = ids.join('|');

  useEffect(() => {
    if (!enabled || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );

    // Les sections de l'accueil peuvent se monter après le header : on réessaie brièvement.
    const observed = new Set<string>();
    const attach = () => {
      key.split('|').forEach((id) => {
        if (observed.has(id)) return;
        const element = document.getElementById(id);
        if (element) {
          observer.observe(element);
          observed.add(id);
        }
      });
    };
    attach();
    const retry = window.setTimeout(attach, 300);

    return () => {
      window.clearTimeout(retry);
      observer.disconnect();
    };
  }, [enabled, key]);

  return enabled ? active : '';
}
