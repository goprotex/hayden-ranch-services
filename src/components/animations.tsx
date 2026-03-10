'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';

/* ─── useInView hook ─── */
export function useInView(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold: 0.15, ...options }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, isVisible };
}

/* ─── Reveal (scroll-triggered) ─── */
export function Reveal({
  children,
  direction = 'up',
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  direction?: 'up' | 'left' | 'scale';
  delay?: number;
  className?: string;
}) {
  const { ref, isVisible } = useInView();
  const attr =
    direction === 'left'
      ? 'data-reveal-left'
      : direction === 'scale'
      ? 'data-reveal-scale'
      : 'data-reveal';

  return (
    <div
      ref={ref}
      {...{ [attr]: isVisible ? 'visible' : '' }}
      style={{ transitionDelay: `${delay}ms` }}
      className={className}
    >
      {children}
    </div>
  );
}

/* ─── RevealText (clip-mask text reveal per line) ─── */
export function RevealText({
  children,
  delay = 0,
  className = '',
  as: Tag = 'span',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'span' | 'div' | 'h1' | 'h2' | 'h3' | 'p';
}) {
  const { ref, isVisible } = useInView();

  return (
    <Tag
      ref={ref as any}
      className={`reveal-text ${className}`}
      data-delay={delay}
      style={{ visibility: isVisible ? 'visible' : 'hidden' }}
    >
      {isVisible && <span>{children}</span>}
    </Tag>
  );
}

/* ─── Marquee (infinite scrolling ticker) ─── */
export function Marquee({
  children,
  speed = 20,
  reverse = false,
  className = '',
}: {
  children: ReactNode;
  speed?: number;
  reverse?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`marquee ${reverse ? 'marquee-reverse' : ''} ${className}`}
      style={{ '--marquee-duration': `${speed}s` } as React.CSSProperties}
    >
      <div className="marquee-content">{children}</div>
      <div className="marquee-content" aria-hidden="true">{children}</div>
    </div>
  );
}

/* ─── StaggerReveal (reveals children one by one on scroll) ─── */
export function StaggerReveal({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const { ref, isVisible } = useInView();

  return (
    <div ref={ref} className={isVisible ? `stagger-children ${className}` : className}>
      {children}
    </div>
  );
}
