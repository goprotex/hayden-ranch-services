export default function HaydenLogo({ className = '', dark = false }: { className?: string; dark?: boolean }) {
  const fillColor = dark ? '#ffffff' : '#000000';

  return (
    <svg
      viewBox="0 0 600 140"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Texas silhouette — geographically accurate */}
      <g fill={fillColor}>
        <path d="M 25 8 L 41 8 L 41 26 L 48 27 L 56 25 L 63 28 L 70 30 L 74 33 L 74 42 L 75 52 L 74 62 L 70 66 L 64 72 L 58 78 L 54 84 L 53 90 L 50 93 L 44 88 L 38 82 L 32 74 L 26 66 L 20 60 L 14 55 L 8 50 L 6 46 L 5 44 L 25 44 Z" />
      </g>

      {/* HAYDEN text */}
      <text x="85" y="72" fontFamily="'Space Grotesk', Arial Black, Impact, sans-serif" fontWeight="900" fontSize="76" fill={fillColor} letterSpacing="-1">
        HAYDEN
      </text>

      {/* RANCH SERVICES text */}
      <text x="85" y="118" fontFamily="'Space Grotesk', Arial Black, Impact, sans-serif" fontWeight="700" fontSize="36" fill={fillColor} letterSpacing="6" opacity="0.65">
        RANCH SERVICES
      </text>
    </svg>
  );
}
