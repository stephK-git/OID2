import React, { useEffect, useRef } from 'react';

/** Lignes d'eau qui ondulent en fond du hero. Figées si l'utilisateur réduit les animations. */
export const HeroWaves: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const anim = { t: 0, frame: 0, width: 0, height: 0 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      anim.width = canvas.clientWidth;
      anim.height = canvas.clientHeight;
      canvas.width = anim.width * dpr;
      canvas.height = anim.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      ctx.clearRect(0, 0, anim.width, anim.height);
      const lines = 14;
      for (let i = 0; i < lines; i += 1) {
        const base = anim.height * 0.28 + i * (anim.height * 0.055);
        const amp = 6 + i * 1.6;
        ctx.beginPath();
        for (let x = 0; x <= anim.width; x += 8) {
          const y =
            base +
            Math.sin(x * 0.006 + anim.t * 0.6 + i * 0.5) * amp +
            Math.sin(x * 0.013 - anim.t * 0.4 + i) * amp * 0.45;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(120, 180, 255, ${(0.06 + i * 0.018).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      if (!still) {
        anim.t += 0.012;
        anim.frame = window.requestAnimationFrame(draw);
      }
    };

    const onResize = () => {
      resize();
      if (still) draw();
    };

    resize();
    draw();
    window.addEventListener('resize', onResize);
    return () => {
      window.cancelAnimationFrame(anim.frame);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="landing-waves" aria-hidden="true" />;
};
