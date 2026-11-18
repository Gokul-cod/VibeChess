import { useEffect } from 'react';

/**
 * The page's gradient backdrop, painted on its own fixed layer so it can drift
 * a little with scrolling and the pointer. Content stays put; the colour moves.
 */
export function Backdrop() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) return;

    const root = document.documentElement;
    let frame = 0;
    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;

    const settle = () => {
      frame = 0;
      const dx = targetX - currentX;
      const dy = targetY - currentY;
      currentX += dx * 0.09;
      currentY += dy * 0.09;
      root.style.setProperty('--plx-x', `${currentX.toFixed(2)}px`);
      root.style.setProperty('--plx-y', `${currentY.toFixed(2)}px`);
      if (Math.abs(dx) > 0.15 || Math.abs(dy) > 0.15) frame = requestAnimationFrame(settle);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(settle);
    };

    const onScroll = () => {
      targetY = Math.min(0, -window.scrollY * 0.08);
      schedule();
    };

    let pointerX = 0;
    let pointerY = 0;
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointerX = (event.clientX / window.innerWidth - 0.5) * -22;
      pointerY = (event.clientY / window.innerHeight - 0.5) * -14;
      targetX = pointerX;
      targetY = Math.min(0, -window.scrollY * 0.08) + pointerY;
      schedule();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointer);
      if (frame) cancelAnimationFrame(frame);
      root.style.removeProperty('--plx-x');
      root.style.removeProperty('--plx-y');
    };
  }, []);

  return <div className="backdrop" aria-hidden="true" />;
}
