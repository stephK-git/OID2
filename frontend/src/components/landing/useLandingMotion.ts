import { useEffect, useRef, useState } from 'react';

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Compteur qui monte jusqu'à la valeur cible (0 → 7). Repart de la valeur affichée
 * si la cible change en cours de route. Saute directement à la cible si les
 * animations sont réduites.
 */
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0);
  const shownRef = useRef(0);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;
    if (prefersReducedMotion()) {
      shownRef.current = target;
      return;
    }
    const frame = { id: 0 };
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const current = Math.round(from + (target - from) * eased);
      shownRef.current = current;
      setValue(current);
      if (p < 1) frame.id = window.requestAnimationFrame(tick);
    };
    frame.id = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame.id);
  }, [target, duration]);

  return prefersReducedMotion() ? target : value;
}

export type RevealState = 'idle' | 'pending' | 'in';

/**
 * Révélation au défilement. Reste « idle » (contenu visible, sans animation) tant que
 * le JS n'a pas tourné, si IntersectionObserver manque ou si les animations sont
 * réduites ; sinon passe par « pending » puis « in » quand l'élément entre à l'écran.
 */
export function useReveal<T extends HTMLElement>(rootMargin = '0px 0px -12% 0px') {
  const ref = useRef<T | null>(null);
  const [state, setState] = useState<RevealState>('idle');

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return;
    setState('pending');
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState('in');
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return [ref, state] as const;
}

/**
 * Frise d'étapes tracée au défilement : met à jour --track-h et --progress sur la
 * liste, et la classe « is-lit » sur chaque étape dont le numéro a été atteint.
 */
export function useStepsProgress<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const items = Array.from(list.children) as HTMLElement[];
    const numbers = items
      .map((li) => li.querySelector<HTMLElement>('.landing-step-n'))
      .filter((n): n is HTMLElement => n !== null);
    if (numbers.length < 2) return;
    const reduced = prefersReducedMotion();
    const frame = { id: 0 };

    const update = () => {
      frame.id = 0;
      const listTop = list.getBoundingClientRect().top;
      const centers = numbers.map((n) => {
        const r = n.getBoundingClientRect();
        return r.top + r.height / 2;
      });
      const first = centers[0];
      const last = centers[centers.length - 1];
      list.style.setProperty('--track-top', `${first - listTop}px`);
      list.style.setProperty('--track-h', `${last - first}px`);

      const anchor = window.innerHeight * 0.62;
      const progress = reduced ? 1 : Math.min(1, Math.max(0, (anchor - first) / (last - first)));
      list.style.setProperty('--progress', progress.toFixed(3));
      items.forEach((li, i) => {
        li.classList.toggle('is-lit', reduced || centers[i] <= anchor + 1);
      });
    };

    const schedule = () => {
      if (!frame.id) frame.id = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.cancelAnimationFrame(frame.id);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return ref;
}
