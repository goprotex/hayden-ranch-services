export default function HaydenLogo({ className = '', dark = false }: { className?: string; dark?: boolean }) {
  const fillColor = dark ? '#ffffff' : '#000000';

  return (
    <svg
      viewBox="0 0 600 140"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Texas silhouette */}
      <g fill={fillColor}>
        <path d="M8 35 L14 28 L18 30 L22 26 L25 28 L30 22 L35 24 L38 20 L42 22 L48 16 L52 18 L56 14 L60 16 L62 12 L66 18 L70 22 L68 30 L72 36 L76 42 L78 50 L74 56 L70 62 L72 68 L68 74 L64 78 L60 82 L56 88 L50 92 L44 90 L40 86 L36 88 L32 84 L28 86 L24 82 L20 78 L16 74 L12 68 L8 60 L6 50 L8 42 Z" />
      </g>

      {/* HAYDEN text */}
      <text x="85" y="72" fontFamily="Arial Black, Impact, sans-serif" fontWeight="900" fontSize="80" fill={fillColor} letterSpacing="-2">
        HAYDEN
      </text>

      {/* RANCH SERVICES text */}
      <text x="335" y="130" fontFamily="Arial Black, Impact, sans-serif" fontWeight="900" fontSize="48" fill={fillColor} letterSpacing="2">
        RANCH SERVICES
      </text>
    </svg>
  );
}
