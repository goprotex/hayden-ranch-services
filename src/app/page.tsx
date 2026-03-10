import Link from 'next/link';
import HaydenLogo from '@/components/HaydenLogo';
import AnimatedTexas from '@/components/AnimatedTexas';
import { Reveal, RevealText, Marquee, StaggerReveal } from '@/components/animations';

const SERVICES = [
  {
    tag: 'Fencing',
    title: 'Ranch & Agricultural Fencing',
    href: '/fencing',
    desc: 'Draw fence lines on satellite maps. Auto-calculate posts, wire, bracing, and hardware with terrain analysis. Generate complete bids.',
    stats: ['Stay Tuff Wire', 'Barbed Wire', 'Pipe & T-Post', 'H-Braces & Gates'],
    bg: '/images/ranch-rainbow.jpg',
  },
  {
    tag: 'Metal Roofing',
    title: 'Cut Lists & Material Takeoffs',
    href: '/roofing',
    desc: 'Import EagleView or QuickMeasure reports. Generate precise panel cut lists for 6V Crimp, R-Panel, and Standing Seam with trim & fasteners.',
    stats: ['6V Crimp', 'R-Panel', 'Standing Seam', 'Trim Lists'],
    bg: '/images/roof-ridge.jpg',
  },
  {
    tag: 'Pricing',
    title: 'Receipt Scanning & Cost Tracking',
    href: '/pricing',
    desc: 'Upload supplier receipts to build a live price database. Auto-price your cut lists and track material costs over time.',
    stats: ['AI Receipt Parsing', 'Price History', 'Auto-Cost Estimates', 'Multi-Supplier'],
    bg: '/images/truck-sunset.jpg',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-black">

      {/* ─── HERO: Full-bleed fence photo + dark overlay + animated Texas ─── */}
      <section className="relative min-h-[100vh] flex flex-col overflow-hidden">
        {/* Background image — fence in Texas Hill Country */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(/images/hillcountry-landscape.jpg)' }}
        />
        {/* Dark overlay — keeps text readable, maintains dark bold feel */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-black" />
        {/* Subtle noise texture */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.5\'/%3E%3C/svg%3E")' }} />

        {/* Animated Texas silhouette — rotates on scroll */}
        <AnimatedTexas />

        {/* Header (over hero) */}
        <header className="relative z-10 border-b border-white/[0.06]">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <HaydenLogo className="h-10 w-auto" dark />
            <nav className="hidden sm:flex items-center gap-6">
              {['Fencing', 'Roofing', 'Pricing', 'Projects'].map((item) => (
                <Link
                  key={item}
                  href={`/${item.toLowerCase()}`}
                  className="hover-line text-white/60 hover:text-white transition text-xs uppercase tracking-widest font-medium"
                >
                  {item}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex flex-col justify-end max-w-7xl mx-auto w-full px-6 pb-16 md:pb-24">
          {/* What we do — instantly clear */}
          <Reveal>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px w-12 bg-tan-400" />
              <span className="font-cursive text-tan-400 text-2xl">Texas Hill Country</span>
            </div>
          </Reveal>

          <Reveal>
            <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-bold text-white mb-5 tracking-tightest leading-[0.92]">
              <RevealText as="div" delay={0}>WE BUILD FENCES</RevealText>
              <RevealText as="div" delay={1}>&amp; METAL ROOFS</RevealText>
            </h1>
          </Reveal>

          <Reveal delay={300}>
            <p className="text-white/60 text-base md:text-lg max-w-lg leading-relaxed mb-8">
              Bid estimating tools built by contractors, for contractors.
              Satellite mapping, material takeoffs, and PDF generation — all in one place.
            </p>
          </Reveal>

          <Reveal delay={500}>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/fencing"
                className="magnetic-hover inline-flex items-center gap-2.5 bg-tan-400 text-black px-7 py-3.5 text-xs uppercase tracking-widest font-bold hover:bg-tan-300 transition-colors"
              >
                Start a Fencing Bid
                <svg width="16" height="16" viewBox="0 0 25 25" fill="none"><path d="M20.5 12.5H4.5M20.5 12.5L13.5 5.5M20.5 12.5L13.5 19.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/></svg>
              </Link>
              <Link
                href="/roofing"
                className="magnetic-hover inline-flex items-center gap-2 border border-tan-400/30 text-tan-300 px-7 py-3.5 text-xs uppercase tracking-widest font-semibold hover:border-tan-400/60 hover:text-tan-200 transition-colors"
              >
                Roofing Cut Lists
              </Link>
            </div>
          </Reveal>

          {/* Quick stats bar */}
          <Reveal delay={700}>
            <div className="flex flex-wrap items-center gap-8 mt-12 pt-8 border-t border-white/[0.06]">
              {[
                ['Satellite Maps', 'Draw on aerial imagery'],
                ['Stay Tuff Wire', '40+ catalog products'],
                ['PDF Generation', 'Professional bid documents'],
              ].map(([label, sub]) => (
                <div key={label}>
                  <p className="text-tan-400 text-sm font-bold">{label}</p>
                  <p className="text-white/40 text-xs mt-0.5">{sub}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── MARQUEE: Services ticker ─── */}
      <Marquee speed={28} className="border-b border-white/[0.06] py-3 bg-black text-tan-600 text-[10px] uppercase tracking-[0.3em] font-medium">
        <span className="mx-8">Fencing Bids</span>
        <span className="mx-8 text-tan-800">&#x25C6;</span>
        <span className="mx-8">Metal Roofing</span>
        <span className="mx-8 text-tan-800">&#x25C6;</span>
        <span className="mx-8">Cut Lists</span>
        <span className="mx-8 text-tan-800">&#x25C6;</span>
        <span className="mx-8">Material Pricing</span>
        <span className="mx-8 text-tan-800">&#x25C6;</span>
        <span className="mx-8">Satellite Maps</span>
        <span className="mx-8 text-tan-800">&#x25C6;</span>
        <span className="mx-8">Stay Tuff Wire</span>
        <span className="mx-8 text-tan-800">&#x25C6;</span>
        <span className="mx-8">PDF Generation</span>
        <span className="mx-8 text-tan-800">&#x25C6;</span>
        <span className="mx-8">Terrain Analysis</span>
        <span className="mx-8 text-tan-800">&#x25C6;</span>
      </Marquee>

      {/* ─── SERVICE CARDS: Photo backgrounds with dark overlay ─── */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <Reveal>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-px w-8 bg-tan-400/40" />
            <span className="text-tan-500 text-xs uppercase tracking-[0.25em] font-semibold">Our Tools</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-12">
            Everything you need to bid,<br />estimate, and build.
          </h2>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-4">
          {SERVICES.map((svc, i) => (
            <Reveal key={svc.tag} delay={i * 120}>
              <Link href={svc.href} className="group block">
                <div className="relative h-[420px] overflow-hidden rounded-sm border border-white/[0.06] hover:border-tan-400/20 transition-colors">
                  {/* Card background image */}
                  {svc.bg && (
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                      style={{ backgroundImage: `url(${svc.bg})` }}
                    />
                  )}
                  {/* Dark overlay */}
                  <div className={`absolute inset-0 ${svc.bg ? 'bg-gradient-to-t from-black via-black/85 to-black/50' : 'bg-black bg-grid'}`} />

                  {/* Content */}
                  <div className="relative z-10 h-full flex flex-col justify-end p-6">
                    <div className="text-tan-400 text-[10px] uppercase tracking-[0.25em] font-bold mb-3">{svc.tag}</div>
                    <h3 className="text-white text-xl font-bold mb-2 tracking-tight">{svc.title}</h3>
                    <p className="text-white/50 text-sm leading-relaxed mb-5">{svc.desc}</p>

                    <StaggerReveal className="flex flex-wrap gap-2 mb-5">
                      {svc.stats.map((s) => (
                        <span key={s} className="text-[10px] px-2.5 py-1 bg-white/[0.06] text-white/60 uppercase tracking-wider font-medium border border-white/[0.04]">
                          {s}
                        </span>
                      ))}
                    </StaggerReveal>

                    <div className="flex items-center gap-2 text-tan-400 text-xs font-semibold uppercase tracking-widest opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                      Open Tool
                      <svg width="14" height="14" viewBox="0 0 25 25" fill="none"><path d="M20.5 12.5H4.5M20.5 12.5L13.5 5.5M20.5 12.5L13.5 19.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/></svg>
                    </div>
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─── BOTTOM MARQUEE (reverse) ─── */}
      <Marquee speed={22} reverse className="border-t border-white/[0.06] py-3 text-steel-800 text-[10px] uppercase tracking-[0.25em]">
        <span className="mx-6">6V Crimp</span>
        <span className="mx-6">R-Panel</span>
        <span className="mx-6">Standing Seam</span>
        <span className="mx-6">EagleView</span>
        <span className="mx-6">QuickMeasure</span>
        <span className="mx-6">RoofGraf</span>
        <span className="mx-6">Stay Tuff 49/6</span>
        <span className="mx-6">Barbed Wire</span>
        <span className="mx-6">T-Posts</span>
        <span className="mx-6">Pipe Posts</span>
        <span className="mx-6">H-Braces</span>
        <span className="mx-6">Tensioners</span>
      </Marquee>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <HaydenLogo className="h-7 w-auto opacity-40" dark />
            <span className="text-steel-600 text-xs uppercase tracking-widest">
              © 2026 Hayden Ranch Services
            </span>
          </div>
          <div className="flex items-center gap-6">
            {['Fencing', 'Roofing', 'Pricing', 'Projects'].map((item) => (
              <Link
                key={item}
                href={`/${item.toLowerCase()}`}
                className="hover-line text-steel-600 hover:text-tan-400 transition text-xs uppercase tracking-widest"
              >
                {item}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
