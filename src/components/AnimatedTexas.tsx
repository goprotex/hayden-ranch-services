'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

/**
 * AnimatedTexas — Texas outline image with:
 * 1. Fade-in on mount
 * 2. Subtle 3D rotation driven by scroll position
 * 3. Coyote tan tint via CSS filter
 */

export default function AnimatedTexas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // Fade in on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(t);
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

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
      style={{
        willChange: 'transform',
        transformStyle: 'preserve-3d',
      }}
    >
      <div
        className="relative w-[55vw] max-w-[640px]"
        style={{
          aspectRatio: '1 / 1',
          opacity: visible ? 0.15 : 0,
          transition: 'opacity 2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <Image
          src="/images/texas-outline.png"
          alt=""
          fill
          sizes="55vw"
          className="object-contain"
          priority
        />
      </div>
    </div>
  );
}
