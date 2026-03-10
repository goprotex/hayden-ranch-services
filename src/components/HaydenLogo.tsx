/* eslint-disable @next/next/no-img-element */
export default function HaydenLogo({ className = '', dark = false }: { className?: string; dark?: boolean }) {
  return (
    <img
      src="/images/hayden-logo.png"
      alt="Hayden Ranch Services"
      className={className}
      style={dark ? { filter: 'invert(1) brightness(2)' } : undefined}
    />
  );
}
