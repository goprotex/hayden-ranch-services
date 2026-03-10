'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * AnimatedTexas — Large SVG Texas silhouette with:
 * 1. Stroke-draw animation on mount (outline traces in)
 * 2. Gradient fill fades in after stroke completes
 * 3. Subtle 3D rotation driven by scroll position
 * 4. Star cutout in the center (Lone Star)
 */

// Detailed Texas outline path (320x320 viewBox)
const TEXAS_PATH =
  'M 92 2 L 97 2 L 97 58 L 100 58 L 100 62 L 104 62 L 104 66 L 180 66 ' +
  'L 180 70 L 206 70 L 208 74 L 220 74 L 222 78 L 228 78 L 232 82 ' +
  'L 240 82 L 244 86 L 250 86 L 256 90 L 266 90 L 270 94 L 278 98 ' +
  'L 282 104 L 286 108 L 290 110 L 294 116 L 296 122 L 298 128 ' +
  'L 296 134 L 290 140 L 286 146 L 282 148 L 276 152 L 272 158 ' +
  'L 268 162 L 262 166 L 258 172 L 254 178 L 248 184 L 244 190 ' +
  'L 238 194 L 232 200 L 228 206 L 222 210 L 218 216 L 214 222 ' +
  'L 210 226 L 204 230 L 198 236 L 192 240 L 188 244 L 182 246 ' +
  'L 176 250 L 170 252 L 164 256 L 158 258 L 152 262 L 146 264 ' +
  'L 140 264 L 134 260 L 130 256 L 128 250 L 124 246 L 120 242 ' +
  'L 116 240 L 110 236 L 106 232 L 102 228 L 96 226 L 92 222 ' +
  'L 86 220 L 82 218 L 76 216 L 72 212 L 68 210 L 62 208 ' +
  'L 58 204 L 54 198 L 50 194 L 46 188 L 42 184 L 38 178 ' +
  'L 38 172 L 42 168 L 44 162 L 48 158 L 50 152 L 48 146 ' +
  'L 44 140 L 40 134 L 36 128 L 34 122 L 30 116 L 28 110 ' +
  'L 26 104 L 22 98 L 18 92 L 14 86 L 10 80 L 6 74 ' +
  'L 6 68 L 10 62 L 16 58 L 22 54 L 26 48 L 30 42 ' +
  'L 36 38 L 42 34 L 48 28 L 54 24 L 60 20 L 66 16 ' +
  'L 72 12 L 78 8 L 84 4 L 92 2 Z';

// Five-pointed star centered at (160, 150), radius 28
const STAR_PATH = (() => {
  const cx = 160, cy = 155, outer = 30, inner = 12;
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

  const pathLength = 2200;

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
        viewBox="0 0 320 280"
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
            <line key={`h${i}`} x1="0" y1={i * 24} x2="320" y2={i * 24} stroke="#c19a6b" strokeWidth="0.5" />
          ))}
          {Array.from({ length: 14 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 24} y1="0" x2={i * 24} y2="280" stroke="#c19a6b" strokeWidth="0.5" />
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
