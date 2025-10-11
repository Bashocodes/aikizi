import { useEffect, useRef, useState } from 'react';

interface DotGridBackgroundProps {
  density?: 'cozy' | 'default' | 'roomy';
  opacity?: number;
  mask?: boolean | 'radial' | 'none';
  parallax?: boolean;
  zIndex?: number;
  inset?: string;
  className?: string;
}

const DENSITY_MAP = {
  cozy: 16,
  default: 24,
  roomy: 32,
};

export function DotGridBackground({
  density = 'default',
  opacity,
  mask = 'none',
  parallax = false,
  zIndex = -1,
  inset = '0',
  className = '',
}: DotGridBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0 });
  const [effectsEnabled, setEffectsEnabled] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('aikizi-bg-effects');
    if (stored !== null) {
      setEffectsEnabled(stored === 'true');
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!parallax || !effectsEnabled || prefersReducedMotion) {
      setTransform({ x: 0, y: 0 });
      return;
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth - 0.5) * 6;
        const y = (e.clientY / window.innerHeight - 0.5) * 6;
        setTransform({ x, y });
      });
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [parallax, effectsEnabled, prefersReducedMotion]);

  if (!effectsEnabled) {
    return null;
  }

  const gridSize = DENSITY_MAP[density];
  const dotSize = 1.5;
  const finalOpacity = opacity !== undefined ? opacity :
    document.documentElement.classList.contains('dark') ? 0.08 : 0.06;

  const shouldApplyMask = mask === true || mask === 'radial';

  const style: React.CSSProperties = {
    position: 'absolute',
    inset,
    zIndex,
    pointerEvents: 'none',
    backgroundImage: `radial-gradient(circle, currentColor ${dotSize}px, transparent ${dotSize}px)`,
    backgroundSize: `${gridSize}px ${gridSize}px`,
    opacity: finalOpacity,
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    willChange: parallax && effectsEnabled && !prefersReducedMotion ? 'transform' : 'auto',
    maskImage: shouldApplyMask ? 'radial-gradient(circle at center, black 40%, transparent 70%)' : undefined,
    WebkitMaskImage: shouldApplyMask ? 'radial-gradient(circle at center, black 40%, transparent 70%)' : undefined,
  };

  return (
    <div
      ref={containerRef}
      className={`dot-grid-background text-gray-900 dark:text-white ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

export function useBackgroundEffects() {
  const [enabled, setEnabled] = useState(() => {
    const stored = localStorage.getItem('aikizi-bg-effects');
    return stored === null ? true : stored === 'true';
  });

  const toggle = () => {
    setEnabled(prev => {
      const next = !prev;
      localStorage.setItem('aikizi-bg-effects', String(next));
      window.dispatchEvent(new Event('storage'));
      return next;
    });
  };

  return { enabled, toggle };
}
