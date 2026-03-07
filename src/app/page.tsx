import Link from 'next/link';
import HaydenLogo from '@/components/HaydenLogo';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-steel-900 via-steel-800 to-steel-950">
      {/* Header */}
      <header className="border-b border-steel-700/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HaydenLogo className="h-10 w-auto" dark />
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/roofing"
              className="text-steel-300 hover:text-white transition text-sm"
            >
              Roofing
            </Link>
            <Link
              href="/pricing"
              className="text-steel-300 hover:text-white transition text-sm"
            >
              Pricing
            </Link>
            <Link
              href="/fencing"
              className="text-steel-300 hover:text-white transition text-sm"
            >
              Fencing
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-7xl mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Your Complete Bid &amp; Estimating Toolkit
          </h2>
          <p className="text-steel-400 text-lg max-w-2xl mx-auto">
            Import roof measurements, generate metal panel cut lists, price materials from your
            receipts, and create fencing bids with satellite maps — all in one place.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-8">
          {/* Roofing Module */}
          <Link href="/roofing" className="group">
            <div className="bg-steel-800/50 backdrop-blur border border-steel-700/50 rounded-2xl p-8 hover:border-brand-500/50 transition-all hover:shadow-lg hover:shadow-brand-500/10">
              <div className="w-14 h-14 bg-blue-500/10 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                </svg>
              </div>
              <h3 className="text-white text-xl font-semibold mb-3">Metal Roofing Cut Lists</h3>
              <p className="text-steel-400 text-sm mb-4">
                Import EagleView, GAF QuickMeasure, or RoofGraf reports. Generate precise cut lists
                for 6V Crimp, R-Panel, and Standing Seam panels with trim components.
              </p>
              <ul className="text-steel-500 text-xs space-y-1">
                <li>✓ Parse measurement reports automatically</li>
                <li>✓ 2D roof sketch with panel layout</li>
                <li>✓ Complete trim &amp; fastener lists</li>
                <li>✓ Visual cut list overlay</li>
              </ul>
              <div className="mt-6 text-brand-400 text-sm font-medium group-hover:text-brand-300 transition">
                Open Roofing Tool →
              </div>
            </div>
          </Link>

          {/* Pricing Module */}
          <Link href="/pricing" className="group">
            <div className="bg-steel-800/50 backdrop-blur border border-steel-700/50 rounded-2xl p-8 hover:border-brand-500/50 transition-all hover:shadow-lg hover:shadow-brand-500/10">
              <div className="w-14 h-14 bg-green-500/10 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <h3 className="text-white text-xl font-semibold mb-3">Material Pricing</h3>
              <p className="text-steel-400 text-sm mb-4">
                Upload receipts from your metal building suppliers. Build a live price database to
                instantly estimate material costs for any job.
              </p>
              <ul className="text-steel-500 text-xs space-y-1">
                <li>✓ Scan &amp; parse supplier receipts</li>
                <li>✓ Track price history over time</li>
                <li>✓ Auto-price your cut lists</li>
                <li>✓ Export cost estimates</li>
              </ul>
              <div className="mt-6 text-brand-400 text-sm font-medium group-hover:text-brand-300 transition">
                Open Pricing Tool →
              </div>
            </div>
          </Link>

          {/* Fencing Module */}
          <Link href="/fencing" className="group">
            <div className="bg-steel-800/50 backdrop-blur border border-steel-700/50 rounded-2xl p-8 hover:border-brand-500/50 transition-all hover:shadow-lg hover:shadow-brand-500/10">
              <div className="w-14 h-14 bg-amber-500/10 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
                </svg>
              </div>
              <h3 className="text-white text-xl font-semibold mb-3">Fencing Bids</h3>
              <p className="text-steel-400 text-sm mb-4">
                Draw fence lines over satellite imagery. Auto-calculate posts, bracing, wire, and
                hardware with terrain and soil analysis built in.
              </p>
              <ul className="text-steel-500 text-xs space-y-1">
                <li>✓ Draw on satellite maps</li>
                <li>✓ Stay Tuff &amp; wire options</li>
                <li>✓ Soil &amp; terrain analysis</li>
                <li>✓ Complete bid generation</li>
              </ul>
              <div className="mt-6 text-brand-400 text-sm font-medium group-hover:text-brand-300 transition">
                Open Fencing Tool →
              </div>
            </div>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-steel-700/50 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6 text-center text-steel-500 text-sm">
          © 2026 Hayden Ranch Services — haydenranchservices.com
        </div>
      </footer>
    </div>
  );
}
