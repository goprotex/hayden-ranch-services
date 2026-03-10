'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * AnimatedTexas — Large SVG Texas silhouette with:
 * 1. Stroke-draw animation on mount (outline traces in)
 * 2. Gradient fill fades in after stroke completes
 * 3. Subtle 3D rotation driven by scroll position
 * 4. Star cutout in the center (Lone Star)
 */

// Geographically accurate Texas outline (500x520 viewBox)
// Panhandle at top-left, Red River north border, Sabine east, Gulf coast,
// Rio Grande with Big Bend curve, L-shaped NM border on west
const TEXAS_PATH =
  'M 137 2 H 253 V 108 ' +
  'L 268 112 L 292 105 L 318 112 L 345 107 L 370 114 L 395 109 L 420 116 L 445 112 L 465 120 L 480 138 ' +
  'L 481 168 L 479 198 L 482 228 L 485 258 L 483 288 L 485 312 L 481 332 ' +
  'L 465 340 L 448 350 L 434 360 L 416 372 L 398 386 L 382 400 L 366 416 L 354 434 L 350 456 L 353 478 L 348 498 L 340 518 ' +
  'L 320 506 L 300 490 L 282 472 L 264 454 L 248 438 L 234 420 L 222 400 L 212 380 L 205 362 L 198 352 ' +
  'L 182 356 L 164 360 L 146 352 L 128 342 L 114 330 L 98 312 L 84 292 L 68 270 L 52 254 L 34 242 L 18 234 L 6 228 ' +
  'L 2 220 L 137 220 Z';

// Five-pointed Lone Star centered in the body of Texas
const STAR_PATH = (() => {
  const cx = 270, cy = 270, outer = 30, inner = 12;
  const pts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const aOuter = (Math.PI / 2) + (i * 2 * Math.PI / 5);
    const aInner = aOuter + Math.PI / 5;
    pts.push(`${cx + outer * Math.cos(aOuter)},${cy - outer * Math.sin(aOuter)}`);
    pts.push(`${cx + inner * Math.cos(aInner)},${cy - inner * Math.sin(aInner)}`);
  }
  return 'M ' + pts.join(' L ') + ' Z';
})();

export default function AnimatedTexas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [filled, setFilled] = useState(false);

  // Stroke-draw → fill sequence
  useEffect(() => {
    const t1 = setTimeout(() => setDrawn(true), 100);
    const t2 = setTimeout(() => setFilled(true), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Scroll-driven 3D rotation
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const progress = Math.min(scrollY / Math.max(maxScroll, 1), 1);

        // Subtle 3D rotation: rotateY 0→25deg, rotateX stays near 0→8deg
        const rotY = progress * 25;
        const rotX = Math.sin(progress * Math.PI) * 8;
        const translateZ = progress * -40;

        el.style.transform =
          `perspective(1200px) rotateY(${rotY}deg) rotateX(${rotX}deg) translateZ(${translateZ}px)`;
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const pathLength = 2800;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
      style={{
        willChange: 'transform',
        transformStyle: 'preserve-3d',
      }}
    >
      <svg
        viewBox="0 0 500 520"
        className="w-[60vw] max-w-[700px] h-auto"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Coyote tan gradient fill */}
          <linearGradient id="texasFill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c19a6b" stopOpacity="0.12" />
            <stop offset="50%" stopColor="#d1b080" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#8c6a47" stopOpacity="0.04" />
          </linearGradient>

          {/* Slightly stronger gradient for the star */}
          <linearGradient id="starFill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c19a6b" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#d1b080" stopOpacity="0.15" />
          </linearGradient>

          {/* Glow filter */}
          <filter id="texasGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="0 0 0 0 0.757  0 0 0 0 0.604  0 0 0 0 0.420  0 0 0 0.15 0"
            />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Fill (fades in after stroke draws) */}
        <path
          d={TEXAS_PATH}
          fill="url(#texasFill)"
          style={{
            opacity: filled ? 1 : 0,
            transition: 'opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />

        {/* Animated stroke outline */}
        <path
          d={TEXAS_PATH}
          stroke="#c19a6b"
          strokeWidth="1"
          fill="none"
          filter="url(#texasGlow)"
          style={{
            strokeDasharray: pathLength,
            strokeDashoffset: drawn ? 0 : pathLength,
            transition: 'stroke-dashoffset 2.2s cubic-bezier(0.16, 1, 0.3, 1)',
            opacity: 0.5,
          }}
        />

        {/* Second stroke pass — thinner, brighter, slightly delayed */}
        <path
          d={TEXAS_PATH}
          stroke="#d1b080"
          strokeWidth="0.5"
          fill="none"
          style={{
            strokeDasharray: pathLength,
            strokeDashoffset: drawn ? 0 : pathLength,
            transition: 'stroke-dashoffset 2.6s cubic-bezier(0.16, 1, 0.3, 1) 0.3s',
            opacity: 0.25,
          }}
        />

        {/* Lone Star — draws after the outline */}
        <path
          d={STAR_PATH}
          fill="url(#starFill)"
          stroke="#c19a6b"
          strokeWidth="0.8"
          style={{
            strokeDasharray: 200,
            strokeDashoffset: filled ? 0 : 200,
            opacity: filled ? 1 : 0,
            transition: 'stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1) 0.2s, opacity 0.6s ease 0.1s',
          }}
        />

        {/* Grid lines inside Texas (subtle tech feel) */}
        <g
          clipPath="url(#texasClip)"
          style={{
            opacity: filled ? 0.04 : 0,
            transition: 'opacity 1.5s ease 0.5s',
          }}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 40} x2="500" y2={i * 40} stroke="#c19a6b" strokeWidth="0.5" />
          ))}
          {Array.from({ length: 14 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2="520" stroke="#c19a6b" strokeWidth="0.5" />
          ))}
        </g>
        <defs>
          <clipPath id="texasClip">
            <path d={TEXAS_PATH} />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}
