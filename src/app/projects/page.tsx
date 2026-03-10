'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAppStore } from '@/lib/store';
import { Reveal, StaggerReveal } from '@/components/animations';

type Tab = 'all' | 'roofing' | 'fencing';
type SortKey = 'date' | 'name' | 'cost';
type GalleryTab = 'all' | 'roofing' | 'equipment' | 'ranch';

const GALLERY = [
  { src: '/images/roof-ridge.jpg', alt: 'Metal roof ridge and hip intersection', cat: 'roofing' as const, span: true },
  { src: '/images/roof-closeup.jpg', alt: 'Standing seam metal panels with rain', cat: 'roofing' as const },
  { src: '/images/roof-edge-oaks.jpg', alt: 'Metal roof edge with Hill Country oaks', cat: 'roofing' as const },
  { src: '/images/roof-branded.jpg', alt: 'Metal roof — Hayden Ranch Services', cat: 'roofing' as const, span: true },
  { src: '/images/roof-gable-trim.jpg', alt: 'Gable trim detail with dramatic sky', cat: 'roofing' as const },
  { src: '/images/roof-edge-deer.jpg', alt: 'Metal roof with hillside and deer', cat: 'roofing' as const },
  { src: '/images/skidsteer.jpg', alt: 'Kubota SVL 65-2 track loader', cat: 'equipment' as const, span: true },
  { src: '/images/ranch-rainbow.jpg', alt: 'Rainbow over the ranch', cat: 'ranch' as const },
  { src: '/images/deer.jpg', alt: 'Axis deer', cat: 'ranch' as const },
  { src: '/images/truck-sunset.jpg', alt: 'F-350 at sunset', cat: 'ranch' as const },
  { src: '/images/windmill-stars.jpg', alt: 'Windmill under the stars', cat: 'ranch' as const },
  { src: '/images/dog-field.jpg', alt: 'Aussie in the grass', cat: 'ranch' as const },
  { src: '/images/hillcountry-landscape.jpg', alt: 'Texas Hill Country', cat: 'ranch' as const, span: true },
  { src: '/images/land-clearing.jpg', alt: 'Land clearing work', cat: 'equipment' as const },
  { src: '/images/river.jpg', alt: 'Hill Country river', cat: 'ranch' as const },
];

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function relTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ProjectsPage() {
  const { projects, fenceBids, roofModels, cutLists, deleteProject, deleteFenceBid } = useAppStore();
  const [tab, setTab] = useState<Tab>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [galleryTab, setGalleryTab] = useState<GalleryTab>('all');

  const galleryFiltered = useMemo(() => {
    if (galleryTab === 'all') return GALLERY;
    return GALLERY.filter(g => g.cat === galleryTab);
  }, [galleryTab]);

  // Combine all data into unified project list
  const allItems = useMemo(() => {
    const items: {
      id: string; name: string; type: 'roofing' | 'fencing';
      client: string; address: string; cost: number; date: string;
      status: string; details: string;
    }[] = [];

    // Add saved projects
    for (const p of projects) {
      items.push({
        id: p.id, name: p.name, type: p.type === 'fencing' ? 'fencing' : 'roofing',
        client: p.clientName, address: p.address, cost: p.fenceBid?.totalCost || 0,
        date: p.updatedAt || p.createdAt,
        status: p.status || 'draft',
        details: p.type === 'fencing' ? 'Fence project' : 'Roof project',
      });
    }

    // Add fence bids not already in projects
    const projFenceIds = new Set(projects.filter(p => p.fenceBid).map(p => p.fenceBid!.id));
    for (const fb of fenceBids) {
      if (projFenceIds.has(fb.id)) continue;
      items.push({
        id: fb.id, name: fb.projectName, type: 'fencing',
        client: fb.clientName, address: fb.address, cost: fb.totalCost,
        date: fb.createdAt,
        status: 'draft',
        details: `${fb.fenceType.replace(/_/g, ' ')} \u2022 ${fb.fenceHeight}`,
      });
    }

    // Add roof models not already in projects
    const projRoofIds = new Set(projects.filter(p => p.roofModel).map(p => p.roofModel!.id));
    for (const rm of roofModels) {
      if (projRoofIds.has(rm.id)) continue;
      items.push({
        id: rm.id, name: rm.projectName, type: 'roofing',
        client: '', address: rm.address, cost: 0,
        date: rm.createdAt,
        status: 'draft',
        details: `${rm.facets.length} facets \u2022 ${rm.totalAreaSqFt.toLocaleString()} sqft`,
      });
    }

    return items;
  }, [projects, fenceBids, roofModels]);

  const filtered = useMemo(() => {
    let list = allItems;
    if (tab !== 'all') list = list.filter(i => i.type === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.client.toLowerCase().includes(q) ||
        i.address.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (sortKey === 'date') return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      return b.cost - a.cost;
    });
    return list;
  }, [allItems, tab, search, sortKey]);

  const stats = useMemo(() => ({
    total: allItems.length,
    roofing: allItems.filter(i => i.type === 'roofing').length,
    fencing: allItems.filter(i => i.type === 'fencing').length,
    totalValue: allItems.reduce((s, i) => s + i.cost, 0),
  }), [allItems]);

  const handleDelete = (id: string, type: 'roofing' | 'fencing') => {
    if (confirmDelete === id) {
      if (type === 'fencing') deleteFenceBid(id);
      else deleteProject(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-black bg-grid">
      <header className="glass border-b border-white/[0.06] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-steel-400 hover:text-white transition text-sm">\u2190 Back</Link>
            <h1 className="text-steel-100 font-bold text-lg">\ud83d\udcc1 Projects</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/roofing"
              className="text-xs glass text-steel-300 px-3 py-1.5 rounded-lg hover:text-white transition font-medium">
              + New Roof Bid
            </Link>
            <Link href="/fencing"
              className="text-xs bg-tan-400 text-black px-3 py-1.5 rounded-lg hover:bg-tan-300 transition font-semibold ">
              + New Fence Bid
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in">
          <StatCard label="Total Projects" value={stats.total.toString()} icon="\ud83d\udcc1" />
          <StatCard label="Roofing" value={stats.roofing.toString()} icon="\ud83c\udfe0" accent="blue" />
          <StatCard label="Fencing" value={stats.fencing.toString()} icon="\u26a1" accent="amber" />
          <StatCard label="Total Value" value={`$${fmt(stats.totalValue)}`} icon="\ud83d\udcb0" accent="green" />
        </div>
        {/* ─── PHOTO GALLERY: Our Work ─── */}
        <section className="pt-4">
          <Reveal>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-px w-8 bg-tan-400/40" />
              <span className="text-tan-500 text-xs uppercase tracking-[0.25em] font-semibold">Portfolio</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight mb-6">Our Work</h2>
          </Reveal>

          <div className="flex gap-1.5 mb-6">
            {([['all', 'All'], ['roofing', 'Metal Roofing'], ['equipment', 'Equipment'], ['ranch', 'Ranch Life']] as [GalleryTab, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setGalleryTab(key)}
                className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition ${
                  galleryTab === key ? 'bg-tan-400 text-black' : 'bg-white/[0.04] text-steel-400 hover:text-steel-200 border border-white/[0.06]'
                }`}>
                {label}
              </button>
            ))}
          </div>

          <StaggerReveal className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {galleryFiltered.map((img) => (
              <div
                key={img.src}
                className={`relative overflow-hidden group cursor-pointer border border-white/[0.04] hover:border-tan-400/30 transition-colors ${
                  img.span ? 'md:col-span-2 aspect-[21/9]' : 'aspect-[4/3]'
                }`}
              >
                <Image
                  src={img.src}
                  alt={img.alt}
                  fill
                  sizes={img.span ? '(max-width: 768px) 100vw, 66vw' : '(max-width: 768px) 50vw, 33vw'}
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                  <p className="text-white text-xs font-medium">{img.alt}</p>
                  <p className="text-tan-400 text-[10px] uppercase tracking-wider mt-0.5">{img.cat}</p>
                </div>
              </div>
            ))}
          </StaggerReveal>
        </section>

        {/* ─── SAVED BIDS ─── */}
        <Reveal>
          <div className="flex items-center gap-3 mb-2 pt-8">
            <div className="h-px w-8 bg-tan-400/40" />
            <span className="text-tan-500 text-xs uppercase tracking-[0.25em] font-semibold">Bid Management</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight mb-6">Saved Bids</h2>
        </Reveal>
        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 animate-fade-in">
          <div className="flex gap-1.5">
            {(['all', 'roofing', 'fencing'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  tab === t ? 'bg-tan-400 text-black' : 'glass text-steel-400 hover:text-steel-200'
                }`}>
                {t === 'all' ? 'All' : t === 'roofing' ? '\ud83c\udfe0 Roofing' : '\u26a1 Fencing'}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full sm:w-64 bg-black border border-steel-800 rounded-lg px-3 py-2 text-sm text-steel-200 placeholder-steel-500 focus:ring-2 focus:ring-tan-400/40" />
          <select title="Sort by" value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
            className="bg-black border border-steel-800 rounded-lg px-3 py-2 text-sm text-steel-200 focus:ring-2 focus:ring-tan-400/40">
            <option value="date">Newest First</option>
            <option value="name">Name A-Z</option>
            <option value="cost">Highest Value</option>
          </select>
        </div>

        {/* Project List */}
        {filtered.length === 0 ? (
          <div className="card-dark p-12 text-center animate-scale-in">
            <p className="text-4xl mb-4">{search ? '\ud83d\udd0d' : '\ud83d\udcc2'}</p>
            <h3 className="text-steel-200 font-semibold text-lg mb-2">
              {search ? 'No matching projects' : 'No projects yet'}
            </h3>
            <p className="text-steel-500 text-sm mb-6 max-w-md mx-auto">
              {search
                ? 'Try a different search term or clear the filter.'
                : 'Create your first bid from the Roofing or Fencing modules. Saved bids will appear here.'}
            </p>
            {!search && (
              <div className="flex gap-3 justify-center">
                <Link href="/roofing" className="text-sm glass text-steel-300 px-5 py-2.5 rounded-lg hover:text-white transition font-medium">
                  \ud83c\udfe0 Create Roof Bid
                </Link>
                <Link href="/fencing" className="text-sm bg-tan-400 text-black px-5 py-2.5 rounded-lg hover:bg-tan-300 transition font-semibold ">
                  \u26a1 Create Fence Bid
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 animate-fade-in">
            {filtered.map((item, idx) => (
              <div key={item.id}
                className="card-dark p-5 hover:border-steel-600/50 transition group"
                style={{ animationDelay: `${idx * 50}ms` }}>
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                    item.type === 'roofing' ? 'bg-blue-500/10 text-blue-400' : 'bg-tan-400/10 text-tan-300'
                  }`}>
                    {item.type === 'roofing' ? '\ud83c\udfe0' : '\u26a1'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-steel-100 font-semibold text-sm truncate">{item.name}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        item.status === 'complete' ? 'bg-emerald-500/10 text-emerald-400' :
                        item.status === 'in_progress' ? 'bg-blue-500/10 text-blue-400' :
                        item.status === 'approved' ? 'bg-tan-400/10 text-tan-300' :
                        'bg-black text-steel-400'
                      }`}>
                        {item.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-steel-500">
                      {item.client && <span>\ud83d\udc64 {item.client}</span>}
                      {item.address && <span>\ud83d\udccd {item.address}</span>}
                      <span>{item.details}</span>
                      <span className="text-steel-600">{relTime(item.date)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {item.cost > 0 && (
                      <p className="text-lg font-bold text-white">$${fmt(item.cost)}</p>
                    )}
                    <button
                      onClick={() => handleDelete(item.id, item.type)}
                      className={`mt-1 text-[10px] px-2 py-0.5 rounded transition ${
                        confirmDelete === item.id
                          ? 'bg-red-600 text-white'
                          : 'text-steel-600 hover:text-red-400 opacity-0 group-hover:opacity-100'
                      }`}>
                      {confirmDelete === item.id ? 'Confirm Delete' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, icon, accent }: { label: string; value: string; icon: string; accent?: string }) {
  const colors = accent === 'blue' ? 'from-blue-900/20 to-blue-900/5 border-blue-700/20'
    : accent === 'amber' ? 'from-amber-900/20 to-amber-900/5 border-white/[0.06]'
    : accent === 'green' ? 'from-emerald-900/20 to-emerald-900/5 border-emerald-700/20'
    : 'from-surface-100 to-surface-50 border-white/[0.06]';
  return (
    <div className={`bg-gradient-to-br ${colors} rounded-xl border p-4 animate-scale-in`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-steel-500 font-medium">{label}</p>
          <p className="text-xl font-bold text-steel-100">{value}</p>
        </div>
      </div>
    </div>
  );
}
